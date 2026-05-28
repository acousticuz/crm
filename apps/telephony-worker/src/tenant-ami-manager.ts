import type { AmiClient } from "./ami/ami-client";
import type { ConfigSource, FreePbxConfig } from "./freepbx-config";

type AttachFn = (client: AmiClient) => void;
type AmiFactory = (cfg: FreePbxConfig) => AmiClient;

interface ManagerLogger {
  log: (msg: string) => void;
  error: (msg: string) => void;
}

/**
 * Maintains one AMI connection per tenant, driven entirely by the configs
 * returned from the ConfigSource (the backend's saved Integration rows).
 *
 * On each `sync()`:
 *   - new tenant         → create client, attach handlers, connect
 *   - changed credentials → disconnect old, connect new (fingerprint differs)
 *   - removed tenant      → disconnect and drop
 *
 * This is what makes Settings actually control telephony: editing the FreePBX
 * Integration changes the fingerprint, and the next sync reconnects with the
 * new credentials.
 */
export class TenantAmiManager {
  private readonly clients = new Map<string, { client: AmiClient; fingerprint: string }>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly source: ConfigSource,
    private readonly factory: AmiFactory,
    private readonly attach: AttachFn,
    private readonly logger: ManagerLogger = console,
  ) {}

  async sync(): Promise<void> {
    let configs: FreePbxConfig[];
    try {
      configs = await this.source.fetch();
    } catch (err) {
      this.logger.error(`config fetch failed: ${(err as Error).message}`);
      return;
    }

    const seen = new Set<string>();
    for (const cfg of configs) {
      seen.add(cfg.tenantId);
      const existing = this.clients.get(cfg.tenantId);
      if (existing && existing.fingerprint === cfg.fingerprint) continue; // unchanged
      if (existing) {
        await this.safeDisconnect(existing.client);
        this.clients.delete(cfg.tenantId);
      }
      const client = this.factory(cfg);
      this.attach(client);
      try {
        await client.connect();
        this.clients.set(cfg.tenantId, { client, fingerprint: cfg.fingerprint });
        this.logger.log(`AMI connected for tenant ${cfg.tenantId} (${cfg.host}:${cfg.port})`);
      } catch (err) {
        await this.safeDisconnect(client);
        this.logger.error(
          `AMI connect failed for tenant ${cfg.tenantId}: ${(err as Error).message}`,
        );
      }
    }

    // Drop tenants no longer present in the config set.
    for (const [tenantId, entry] of this.clients) {
      if (!seen.has(tenantId)) {
        await this.safeDisconnect(entry.client);
        this.clients.delete(tenantId);
        this.logger.log(`AMI disconnected for removed tenant ${tenantId}`);
      }
    }
  }

  start(intervalMs: number): void {
    void this.sync();
    this.timer = setInterval(() => void this.sync(), intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  getClient(tenantId: string): AmiClient | undefined {
    return this.clients.get(tenantId)?.client;
  }

  tenantCount(): number {
    return this.clients.size;
  }

  private async safeDisconnect(client: AmiClient): Promise<void> {
    try {
      await client.disconnect();
    } catch {
      // best-effort
    }
  }
}
