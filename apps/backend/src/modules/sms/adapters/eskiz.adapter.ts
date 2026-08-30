import { Injectable, Logger } from "@nestjs/common";
import { SmsStatus } from "@acoustic-crm/shared";
import { EskizTokenCacheService } from "./eskiz-token-cache.service";
import type {
  ProviderTemplate,
  SmsAdapter,
  SmsAdapterContext,
  SmsSendInput,
  SmsSendResult,
} from "./sms-adapter";

interface EskizConfig {
  baseUrl?: string;
  email?: string;
  password?: string;
  apiKey?: string;
  // `from` is the sender ID Eskiz exposes per account. Optional — falls back
  // to the account default when unset.
  from?: string;
}

interface EskizLoginResp {
  data?: { token?: string };
  message?: string;
}
interface EskizRefreshResp {
  data?: { token?: string };
  message?: string;
}
interface EskizSendResp {
  status?: string;
  message?: string;
  id?: string | number;
}
interface EskizUserResp {
  data?: { email?: string; name?: string; balance?: number; sms_balance?: number };
  message?: string;
}

// Eskiz JWTs are valid ~30 days; refresh slightly earlier so we don't race
// the expiry on busy tenants.
const TOKEN_TTL_MS = 29 * 24 * 60 * 60 * 1000;

/**
 * Eskiz.uz SMS adapter (notify.eskiz.uz). All HTTP calls go through
 * `withAuth`, which obtains a valid JWT via the per-tenant cache, retries on
 * 401 by attempting `/auth/refresh` first and falling back to a full re-login.
 * The tenant only stores email + password — the token cache is managed
 * entirely server-side.
 */
@Injectable()
export class EskizSmsAdapter implements SmsAdapter {
  readonly name = "eskiz";
  private readonly logger = new Logger(EskizSmsAdapter.name);

  constructor(private readonly cache: EskizTokenCacheService) {}

  // ===== SmsAdapter contract =====

  async send(
    input: SmsSendInput,
    cfg: Record<string, unknown>,
    ctx: SmsAdapterContext,
  ): Promise<SmsSendResult> {
    const config = cfg as EskizConfig;
    const baseUrl = this.baseUrl(config);
    try {
      const res = await this.withAuth(ctx.tenantId, config, baseUrl, (token) => {
        const body = new FormData();
        body.set("mobile_phone", input.phone.replace(/^\+/, ""));
        body.set("message", input.text);
        if (config.from) body.set("from", config.from);
        return fetch(`${baseUrl}/message/sms/send`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body,
        });
      });
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
        providerMessageId: json.id != null ? String(json.id) : null,
      };
    } catch (err) {
      return {
        status: SmsStatus.FAILED,
        providerMessageId: null,
        errorMessage: friendlyError(err),
      };
    }
  }

  async fetchTemplates(
    cfg: Record<string, unknown>,
    ctx: SmsAdapterContext,
  ): Promise<ProviderTemplate[]> {
    const config = cfg as EskizConfig;
    const baseUrl = this.baseUrl(config);
    const res = await this.withAuth(ctx.tenantId, config, baseUrl, (token) =>
      fetch(`${baseUrl}/user/templates`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    if (!res.ok) throw new Error(`Eskiz templates HTTP ${res.status}`);
    const json = (await res.json().catch(() => ({}))) as {
      data?: unknown;
      result?: unknown;
    };
    const list = pickList(json);
    return list.map(parseTemplate).filter((t): t is ProviderTemplate => t !== null);
  }

  // ===== Test connection (Integrations "Tekshirish" button) =====

  /**
   * Lightweight authenticated health check. Logs in (or reuses the cached
   * token), then calls /auth/user. Reports clearly without leaking the
   * raw token-expired wording — adapter handles refresh internally.
   */
  async testConnection(
    cfg: Record<string, unknown>,
    ctx: SmsAdapterContext,
  ): Promise<{ ok: boolean; message: string }> {
    const config = cfg as EskizConfig;
    const baseUrl = this.baseUrl(config);
    if (!config.email || !config.password) {
      return { ok: false, message: "Eskiz email va parolni kiriting" };
    }
    try {
      const res = await this.withAuth(ctx.tenantId, config, baseUrl, (token) =>
        fetch(`${baseUrl}/auth/user`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      if (!res.ok) {
        return { ok: false, message: `Eskiz auth muvaffaqiyatsiz (HTTP ${res.status})` };
      }
      const json = (await res.json().catch(() => ({}))) as EskizUserResp;
      const who = json.data?.email ?? json.data?.name ?? "Eskiz hisob";
      const balance = json.data?.balance ?? json.data?.sms_balance;
      const balanceTxt =
        typeof balance === "number" && balance > 0 ? `, balans: ${balance}` : "";
      return { ok: true, message: `Ulandi (${who}${balanceTxt})` };
    } catch (err) {
      return { ok: false, message: friendlyError(err) };
    }
  }

  // ===== Auth helpers =====

  /**
   * Run `fetcher` with a valid Bearer token. On 401 we try `/auth/refresh`
   * once; if refresh fails we clear the cache and re-login, then retry the
   * original request exactly once. After the retry, the response (success
   * or failure) is returned as-is so the caller can render a real error.
   */
  private async withAuth(
    tenantId: string,
    cfg: EskizConfig,
    baseUrl: string,
    fetcher: (token: string) => Promise<Response>,
  ): Promise<Response> {
    let token = await this.ensureToken(tenantId, cfg, baseUrl, false);
    let res = await fetcher(token);
    if (res.status !== 401) return res;
    // Try refresh first.
    const refreshed = await this.tryRefresh(baseUrl, token);
    if (refreshed) {
      await this.cache.write(
        tenantId,
        refreshed,
        new Date(Date.now() + TOKEN_TTL_MS),
      );
      res = await fetcher(refreshed);
      return res;
    }
    // Refresh failed — drop cache and re-login.
    await this.cache.clear(tenantId);
    token = await this.ensureToken(tenantId, cfg, baseUrl, true);
    return fetcher(token);
  }

  /**
   * Returns a valid JWT for the tenant. Uses the cache when not stale;
   * otherwise logs in via /auth/login and writes the new token to cache.
   * `forceRefresh` skips the cache (used after a 401 → re-login).
   */
  private async ensureToken(
    tenantId: string,
    cfg: EskizConfig,
    baseUrl: string,
    forceRefresh: boolean,
  ): Promise<string> {
    if (!forceRefresh) {
      const cached = await this.cache.read(tenantId);
      if (cached && cached.expiresAt.getTime() > Date.now()) {
        return cached.token;
      }
    }
    const password = cfg.password ?? cfg.apiKey;
    if (!cfg.email || !password) {
      throw new Error("Eskiz: email va parol Settings'da o'rnatilmagan");
    }
    const body = new FormData();
    body.set("email", cfg.email);
    body.set("password", password);
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      body,
    });
    if (!res.ok) {
      throw new Error(`Eskiz login HTTP ${res.status}`);
    }
    const json = (await res.json().catch(() => ({}))) as EskizLoginResp;
    const token = json.data?.token;
    if (!token) throw new Error("Eskiz login: token kelmadi");
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
    await this.cache.write(tenantId, token, expiresAt);
    return token;
  }

  /**
   * Eskiz's PATCH /auth/refresh extends a token without re-presenting the
   * password. Returns the new token on success, null when the server says
   * the token can't be refreshed (and a full login is required).
   */
  private async tryRefresh(baseUrl: string, oldToken: string): Promise<string | null> {
    try {
      const res = await fetch(`${baseUrl}/auth/refresh`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${oldToken}` },
      });
      if (!res.ok) return null;
      const json = (await res.json().catch(() => ({}))) as EskizRefreshResp;
      return json.data?.token ?? null;
    } catch (err) {
      this.logger.warn(`Eskiz refresh failed: ${(err as Error).message}`);
      return null;
    }
  }

  private baseUrl(cfg: EskizConfig): string {
    return (cfg.baseUrl ?? process.env.ESKIZ_BASE_URL ?? "https://notify.eskiz.uz/api").replace(
      /\/$/,
      "",
    );
  }
}

// --- Response normalization helpers ---------------------------------------

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
    // Eskiz's `template` can be a shortened/moderated display variant where
    // links are stripped. `original_text` preserves the exact approved body.
    (typeof raw.original_text === "string" && raw.original_text) ||
    (typeof raw.template === "string" && raw.template) ||
    (typeof raw.text === "string" && raw.text) ||
    (typeof raw.message === "string" && raw.message);
  if (!body) return null;
  const status = typeof raw.status === "string" ? raw.status : null;
  return { externalId: String(id), body, status };
}

/**
 * Surface a clean error message to the caller. The raw token never goes near
 * a user-facing string because withAuth handles it internally — the operator
 * shouldn't see "token expired" anywhere.
 */
function friendlyError(err: unknown): string {
  const msg = (err as Error).message ?? String(err);
  if (/HTTP 401|Unauthorized/i.test(msg)) {
    return "Eskiz autentifikatsiyasi muvaffaqiyatsiz — email/parolni tekshiring";
  }
  if (/HTTP 4\d\d|HTTP 5\d\d/.test(msg)) {
    return msg;
  }
  return msg;
}
