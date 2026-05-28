import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { ClsService } from "nestjs-cls";
import { IntegrationStatus, IntegrationType } from "@acoustic-crm/shared";
import { readContext } from "../../common/tenant-context";
import { decryptSecret, encryptSecret, maskSecret } from "../../common/crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { SECRET_FIELDS, allowedFields } from "./integration-fields";
import { UpsertIntegrationDto } from "./dto/integration.dto";

const ENCRYPTED_KEY = "_encrypted";
const MASK_PREFIX = "•";

interface StoredConfig {
  [k: string]: unknown;
  _encrypted?: Record<string, string>;
}

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly audit: AuditService,
  ) {}

  private currentTenantId(): string {
    const tid = readContext(this.cls).tenantId;
    if (!tid) throw new UnauthorizedException("No tenant context");
    return tid;
  }

  // ===== Public (masked) reads =====

  async list() {
    this.currentTenantId();
    const rows = await this.prisma.t.integration.findMany({
      where: { deletedAt: null },
      orderBy: { type: "asc" },
    });
    // Ensure every known type appears, even if not yet configured.
    const byType = new Map(rows.map((r) => [r.type, r]));
    return Object.values(IntegrationType).map((type) => {
      const row = byType.get(type);
      if (!row) {
        return {
          type,
          provider: null,
          status: IntegrationStatus.DISCONNECTED,
          config: {},
          configured: false,
          lastTestedAt: null,
          lastTestResult: null,
        };
      }
      return this.toMasked(row);
    });
  }

  async get(type: IntegrationType) {
    const row = await this.findRow(type);
    if (!row) {
      return {
        type,
        provider: null,
        status: IntegrationStatus.DISCONNECTED,
        config: {},
        configured: false,
        lastTestedAt: null,
        lastTestResult: null,
      };
    }
    return this.toMasked(row);
  }

  private async findRow(type: IntegrationType) {
    return this.prisma.t.integration.findFirst({
      where: { type, deletedAt: null },
    });
  }

  /**
   * Returns the config with secrets DECRYPTED. Backend-internal only — never
   * exposed via the API. Used by Test and by SMS/telephony when they need the
   * real credentials.
   */
  async getDecryptedConfig(
    tenantId: string,
    type: IntegrationType,
  ): Promise<Record<string, unknown> | null> {
    const row = await this.prisma.integration.findFirst({
      where: { tenantId, type, deletedAt: null },
    });
    if (!row) return null;
    const cfg = this.decryptConfig(row.config as StoredConfig);
    // The provider can live on the row column; surface it so callers don't
    // have to read the row separately.
    if (row.provider && cfg.provider == null) cfg.provider = row.provider;
    return cfg;
  }

  /**
   * Cross-tenant list of decrypted FreePBX/AMI configs for the telephony
   * worker. Bypasses tenant scoping on purpose — the worker maintains one AMI
   * connection per tenant. Only reachable through the worker-secret guard.
   * Each entry carries a fingerprint so the worker can detect credential
   * changes and reconnect.
   */
  async listFreePbxConfigsForWorker(): Promise<
    Array<{
      tenantId: string;
      host: string;
      port: number;
      username: string;
      secret: string;
      fingerprint: string;
    }>
  > {
    const rows = await this.prisma.integration.findMany({
      where: { type: IntegrationType.FREEPBX, deletedAt: null },
    });
    const configs = [];
    for (const row of rows) {
      const cfg = this.decryptConfig(row.config as StoredConfig);
      const host = String(cfg.amiHost ?? "").trim();
      const username = String(cfg.amiUsername ?? "").trim();
      const secret = String(cfg.amiSecret ?? "");
      if (!host || !username || !secret) continue;
      const port = Number(cfg.amiPort ?? 5038) || 5038;
      const fingerprint = createHash("sha256")
        .update(`${host}|${port}|${username}|${secret}`)
        .digest("hex")
        .slice(0, 16);
      configs.push({ tenantId: row.tenantId, host, port, username, secret, fingerprint });
    }
    return configs;
  }

  // ===== Upsert (encrypt secrets) =====

  async upsert(type: IntegrationType, dto: UpsertIntegrationDto) {
    const tenantId = this.currentTenantId();
    const allowed = new Set(allowedFields(type));
    const incoming = dto.config ?? {};
    // Reject unknown fields so we don't persist junk / accidental secrets.
    for (const key of Object.keys(incoming)) {
      if (!allowed.has(key)) {
        throw new BadRequestException(`Unknown config field for ${type}: ${key}`);
      }
    }

    const existing = await this.findRow(type);
    const existingEncrypted =
      ((existing?.config as StoredConfig | undefined)?._encrypted ?? {}) as Record<string, string>;

    const stored = this.buildStoredConfig(type, incoming, existingEncrypted);

    const row = await this.prisma.t.integration.upsert({
      where: { tenantId_type: { tenantId, type } },
      create: {
        tenantId,
        type,
        provider: dto.provider ?? null,
        config: stored as unknown as Prisma.InputJsonValue,
        status: IntegrationStatus.DISCONNECTED,
      },
      update: {
        provider: dto.provider ?? existing?.provider ?? null,
        config: stored as unknown as Prisma.InputJsonValue,
      },
    });

    await this.audit.log({
      tenantId,
      action: "integration.upsert",
      entityType: "Integration",
      entityId: row.id,
      // Never log secret values — only which fields were set.
      details: { type, fields: Object.keys(incoming).filter((k) => !this.isSecret(type, k)) },
    });

    return this.toMasked(row);
  }

  // ===== Test connection =====

  async test(type: IntegrationType) {
    const tenantId = this.currentTenantId();
    const config = await this.decryptedForTenant(tenantId, type);
    if (!config) {
      throw new NotFoundException("Integration not configured yet");
    }
    const result = await this.runTest(type, config);

    const row = await this.prisma.t.integration.update({
      where: { tenantId_type: { tenantId, type } },
      data: {
        status: result.ok ? IntegrationStatus.CONNECTED : IntegrationStatus.ERROR,
        lastTestedAt: new Date(),
        // Store ONLY the generic outcome — no secrets, no raw provider errors.
        lastTestResult: { ok: result.ok, message: result.message } as Prisma.InputJsonValue,
      },
    });

    await this.audit.log({
      tenantId,
      action: "integration.test",
      entityType: "Integration",
      entityId: row.id,
      details: { type, ok: result.ok },
    });

    return { ok: result.ok, message: result.message, status: row.status };
  }

  async disconnect(type: IntegrationType) {
    const tenantId = this.currentTenantId();
    const existing = await this.findRow(type);
    if (!existing) throw new NotFoundException("Integration not configured");
    const row = await this.prisma.t.integration.update({
      where: { tenantId_type: { tenantId, type } },
      data: { status: IntegrationStatus.DISCONNECTED },
    });
    await this.audit.log({
      tenantId,
      action: "integration.disconnect",
      entityType: "Integration",
      entityId: row.id,
      details: { type },
    });
    return this.toMasked(row);
  }

  // ===== Helpers =====

  private isSecret(type: IntegrationType, key: string): boolean {
    return SECRET_FIELDS[type].includes(key);
  }

  /** Build the stored config: public fields plain, secrets encrypted under
   * `_encrypted`. A masked/empty incoming secret keeps the existing one. */
  private buildStoredConfig(
    type: IntegrationType,
    incoming: Record<string, unknown>,
    existingEncrypted: Record<string, string>,
  ): StoredConfig {
    const stored: StoredConfig = {};
    const encrypted: Record<string, string> = { ...existingEncrypted };

    for (const [key, value] of Object.entries(incoming)) {
      if (this.isSecret(type, key)) {
        const str = value == null ? "" : String(value);
        if (str && !str.startsWith(MASK_PREFIX)) {
          encrypted[key] = encryptSecret(str);
        }
        // else: masked or empty → keep whatever was already in `encrypted`.
      } else {
        stored[key] = value;
      }
    }
    if (Object.keys(encrypted).length > 0) {
      stored[ENCRYPTED_KEY] = encrypted;
    }
    return stored;
  }

  private decryptConfig(stored: StoredConfig): Record<string, unknown> {
    const { [ENCRYPTED_KEY]: enc, ...rest } = stored;
    const out: Record<string, unknown> = { ...rest };
    if (enc) {
      for (const [key, cipher] of Object.entries(enc)) {
        try {
          out[key] = decryptSecret(cipher);
        } catch {
          this.logger.warn(`Failed to decrypt ${key} — wrong ENCRYPTION_KEY?`);
        }
      }
    }
    return out;
  }

  private async decryptedForTenant(tenantId: string, type: IntegrationType) {
    const row = await this.prisma.t.integration.findFirst({ where: { type, deletedAt: null } });
    if (!row) return null;
    void tenantId;
    return this.decryptConfig(row.config as StoredConfig);
  }

  /** Mask secrets for safe API output. */
  private toMasked(row: {
    type: string;
    provider: string | null;
    status: string;
    config: unknown;
    lastTestedAt: Date | null;
    lastTestResult: unknown;
  }) {
    const stored = (row.config as StoredConfig) ?? {};
    const { [ENCRYPTED_KEY]: enc, ...publicFields } = stored;
    const masked: Record<string, unknown> = { ...publicFields };
    if (enc) {
      for (const [key, cipher] of Object.entries(enc)) {
        try {
          masked[key] = maskSecret(decryptSecret(cipher));
        } catch {
          masked[key] = "••••";
        }
      }
    }
    return {
      type: row.type,
      provider: row.provider,
      status: row.status,
      config: masked,
      configured: true,
      lastTestedAt: row.lastTestedAt,
      lastTestResult: row.lastTestResult,
    };
  }

  // ===== Per-type connection tests (generic errors only) =====

  private async runTest(
    type: IntegrationType,
    config: Record<string, unknown>,
  ): Promise<{ ok: boolean; message: string }> {
    try {
      switch (type) {
        case IntegrationType.FREEPBX:
          return await this.testFreePbx(config);
        case IntegrationType.SMS:
          return await this.testSms(config);
        case IntegrationType.TELEGRAM:
          return await this.testTelegram(config);
        case IntegrationType.INBOX:
          return await this.testInbox(config);
        default:
          return { ok: false, message: "Noma'lum integratsiya turi" };
      }
    } catch {
      // SECURITY: never leak internal/provider error details (may contain
      // tokens). Always a generic message.
      return { ok: false, message: "Ulanish muvaffaqiyatsiz" };
    }
  }

  private async testFreePbx(config: Record<string, unknown>): Promise<{ ok: boolean; message: string }> {
    const host = String(config.amiHost ?? "");
    const port = Number(config.amiPort ?? 5038);
    const username = String(config.amiUsername ?? "");
    const secret = String(config.amiSecret ?? "");
    if (!host || !username || !secret) {
      return { ok: false, message: "AMI host/username/secret to'liq emas" };
    }
    // Raw AMI login + CoreStatus over TCP with a short timeout.
    const net = await import("node:net");
    return new Promise<{ ok: boolean; message: string }>((resolve) => {
      const socket = new net.Socket();
      let buffer = "";
      let settled = false;
      const done = (ok: boolean, message: string) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve({ ok, message });
      };
      socket.setTimeout(5000);
      socket.on("timeout", () => done(false, "Ulanish muddati tugadi"));
      socket.on("error", () => done(false, "Ulanish muvaffaqiyatsiz"));
      socket.on("data", (data) => {
        buffer += data.toString();
        if (/Authentication accepted/i.test(buffer)) {
          socket.write(`Action: CoreStatus\r\n\r\n`);
        }
        if (/CoreStartupTime|CoreCurrentCalls/i.test(buffer)) {
          done(true, "AMI ulanish muvaffaqiyatli (CoreStatus javob berdi)");
        }
        if (/Authentication failed/i.test(buffer)) {
          done(false, "AMI autentifikatsiya xatosi");
        }
      });
      socket.connect(port, host, () => {
        socket.write(
          `Action: Login\r\nUsername: ${username}\r\nSecret: ${secret}\r\nEvents: off\r\n\r\n`,
        );
      });
    });
  }

  private async testSms(config: Record<string, unknown>): Promise<{ ok: boolean; message: string }> {
    const provider = String(config.provider ?? "");
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 6000);
    try {
      if (provider === "eskiz") {
        const base = (process.env.ESKIZ_BASE_URL ?? "https://notify.eskiz.uz/api").replace(/\/$/, "");
        const body = new URLSearchParams();
        body.set("email", String(config.login ?? ""));
        body.set("password", String(config.password ?? ""));
        const res = await fetch(`${base}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
          signal: controller.signal,
        });
        return res.ok
          ? { ok: true, message: "Eskiz auth muvaffaqiyatli" }
          : { ok: false, message: "Eskiz auth muvaffaqiyatsiz" };
      }
      if (provider === "playmobile") {
        const base = (process.env.PLAYMOBILE_BASE_URL ?? "https://send.smsxabar.uz/broker-api").replace(/\/$/, "");
        const auth = Buffer.from(`${config.login ?? ""}:${config.password ?? ""}`).toString("base64");
        const res = await fetch(`${base}/`, {
          headers: { Authorization: `Basic ${auth}` },
          signal: controller.signal,
        });
        return res.status < 500
          ? { ok: true, message: "Play Mobile ulanish muvaffaqiyatli" }
          : { ok: false, message: "Play Mobile ulanish muvaffaqiyatsiz" };
      }
      return { ok: false, message: "Provayder tanlanmagan" };
    } finally {
      clearTimeout(t);
    }
  }

  private async testTelegram(config: Record<string, unknown>): Promise<{ ok: boolean; message: string }> {
    const token = String(config.botToken ?? "");
    if (!token) return { ok: false, message: "Bot token kiritilmagan" };
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 6000);
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
        signal: controller.signal,
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: { username?: string } };
      return json.ok
        ? { ok: true, message: `Bot ulandi: @${json.result?.username ?? "bot"}` }
        : { ok: false, message: "Telegram bot tokeni yaroqsiz" };
    } finally {
      clearTimeout(t);
    }
  }

  private async testInbox(config: Record<string, unknown>): Promise<{ ok: boolean; message: string }> {
    const token = String(config.pageAccessToken ?? "");
    if (!token) return { ok: false, message: "Page access token kiritilmagan" };
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 6000);
    try {
      const res = await fetch(
        `https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${encodeURIComponent(token)}`,
        { signal: controller.signal },
      );
      const json = (await res.json().catch(() => ({}))) as { id?: string; name?: string };
      return json.id
        ? { ok: true, message: `Sahifa ulandi: ${json.name ?? json.id}` }
        : { ok: false, message: "Sahifa ulanishi muvaffaqiyatsiz" };
    } finally {
      clearTimeout(t);
    }
  }
}
