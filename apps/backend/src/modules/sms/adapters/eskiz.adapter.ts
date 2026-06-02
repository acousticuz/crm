import { Injectable, Logger } from "@nestjs/common";
import { SmsStatus } from "@acoustic-crm/shared";
import type {
  ProviderTemplate,
  SmsAdapter,
  SmsSendInput,
  SmsSendResult,
} from "./sms-adapter";

interface EskizConfig {
  baseUrl?: string;
  email?: string;
  password?: string;
  // Some Eskiz tenants get a long-lived token directly — short-circuits login.
  token?: string;
  from?: string;
}

interface EskizLoginResp {
  data?: { token?: string };
}

interface EskizSendResp {
  status?: string;
  message?: string;
  id?: string | number;
}

/**
 * Eskiz.uz SMS adapter (notify.eskiz.uz). Lazy-logs in to obtain a token
 * when one isn't pre-provisioned; caches it per process instance. Errors
 * are surfaced as SmsStatus.FAILED with `errorMessage` so the caller can
 * decide what to do.
 */
@Injectable()
export class EskizSmsAdapter implements SmsAdapter {
  readonly name = "eskiz";
  private readonly logger = new Logger(EskizSmsAdapter.name);
  private cachedTokens = new Map<string, string>();

  async send(input: SmsSendInput, cfg: Record<string, unknown>): Promise<SmsSendResult> {
    const config = cfg as EskizConfig;
    const baseUrl = (
      config.baseUrl ?? process.env.ESKIZ_BASE_URL ?? "https://notify.eskiz.uz/api"
    ).replace(/\/$/, "");
    try {
      let token = await this.ensureToken(baseUrl, config, false);
      let res = await this.sendOnce(baseUrl, token, input, config);
      // Eskiz returns 401 when a token expires (~30 days). When we have email
      // +password, drop the cache and try a fresh login exactly once — this
      // is what kept failing silently for tenants whose saved token had aged
      // out without the operator noticing.
      if (res.status === 401 && config.email && config.password) {
        token = await this.ensureToken(baseUrl, config, true);
        res = await this.sendOnce(baseUrl, token, input, config);
      }
      const json = (await res.json().catch(() => ({}))) as EskizSendResp;
      if (!res.ok) {
        return {
          status: SmsStatus.FAILED,
          providerMessageId: null,
          errorMessage: json.message ?? `HTTP ${res.status}`,
        };
      }
      return {
        status: SmsStatus.SENT,
        providerMessageId: json.id ? String(json.id) : null,
      };
    } catch (err) {
      this.logger.error(`Eskiz send failed: ${(err as Error).message}`);
      return {
        status: SmsStatus.FAILED,
        providerMessageId: null,
        errorMessage: (err as Error).message,
      };
    }
  }

  private async sendOnce(
    baseUrl: string,
    token: string,
    input: SmsSendInput,
    config: EskizConfig,
  ): Promise<Response> {
    const body = new URLSearchParams();
    body.set("mobile_phone", input.phone.replace(/^\+/, ""));
    body.set("message", input.text);
    if (config.from) body.set("from", config.from);
    return fetch(`${baseUrl}/message/sms/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
  }

  private async ensureToken(
    baseUrl: string,
    cfg: EskizConfig,
    forceRefresh: boolean,
  ): Promise<string> {
    // A saved long-lived token wins on the first call. On forceRefresh (401
    // retry) we always re-login if creds are present, since the saved token
    // is what just got rejected.
    if (cfg.token && !forceRefresh) return cfg.token;
    const key = `${baseUrl}|${cfg.email ?? ""}`;
    if (!forceRefresh) {
      const cached = this.cachedTokens.get(key);
      if (cached) return cached;
    } else {
      this.cachedTokens.delete(key);
    }
    if (!cfg.email || !cfg.password) {
      throw new Error("Eskiz: token or email/password must be configured");
    }
    const body = new URLSearchParams();
    body.set("email", cfg.email);
    body.set("password", cfg.password);
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!res.ok) throw new Error(`Eskiz login HTTP ${res.status}`);
    const json = (await res.json()) as EskizLoginResp;
    const token = json.data?.token;
    if (!token) throw new Error("Eskiz login: no token returned");
    this.cachedTokens.set(key, token);
    return token;
  }

  /**
   * Pull the tenant's approved templates from Eskiz. Eskiz rejects free-text
   * messages, so the CRM needs to mirror this list to offer operators only
   * sendable options. The response payload varies slightly between Eskiz
   * versions ("text" vs "message" vs "original_text"); we accept the common
   * variants defensively.
   */
  async fetchTemplates(cfg: Record<string, unknown>): Promise<ProviderTemplate[]> {
    const config = cfg as EskizConfig;
    const baseUrl = (
      config.baseUrl ?? process.env.ESKIZ_BASE_URL ?? "https://notify.eskiz.uz/api"
    ).replace(/\/$/, "");
    const token = await this.ensureToken(baseUrl, config, false);
    const doFetch = (t: string) =>
      fetch(`${baseUrl}/user/templates`, {
        headers: { Authorization: `Bearer ${t}` },
      });
    let res = await doFetch(token);
    if (res.status === 401 && config.email && config.password) {
      const fresh = await this.ensureToken(baseUrl, config, true);
      res = await doFetch(fresh);
    }
    if (!res.ok) throw new Error(`Eskiz templates HTTP ${res.status}`);
    const json = (await res.json().catch(() => ({}))) as {
      data?: unknown;
      result?: unknown;
    };
    const list = pickList(json);
    return list.map(parseTemplate).filter((t): t is ProviderTemplate => t !== null);
  }
}

// --- Response normalization helpers ---------------------------------------
// Eskiz returns templates either at `data` (array) or `data.result` (newer
// pagination shape). Tolerate both so a future API tweak doesn't break sync.
function pickList(json: { data?: unknown; result?: unknown }): Array<Record<string, unknown>> {
  if (Array.isArray(json.data)) return json.data as Array<Record<string, unknown>>;
  if (Array.isArray(json.result)) return json.result as Array<Record<string, unknown>>;
  if (
    typeof json.data === "object" &&
    json.data !== null &&
    Array.isArray((json.data as { result?: unknown }).result)
  ) {
    return (json.data as { result: Array<Record<string, unknown>> }).result;
  }
  return [];
}

function parseTemplate(raw: Record<string, unknown>): ProviderTemplate | null {
  const id = raw.id ?? raw.template_id;
  if (id == null) return null;
  const body =
    (typeof raw.template === "string" && raw.template) ||
    (typeof raw.original_text === "string" && raw.original_text) ||
    (typeof raw.text === "string" && raw.text) ||
    (typeof raw.message === "string" && raw.message);
  if (!body) return null;
  const status = typeof raw.status === "string" ? raw.status : null;
  return { externalId: String(id), body, status };
}
