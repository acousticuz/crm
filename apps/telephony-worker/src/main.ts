import { MockAmiClient } from "./ami/mock.ami";
import { AsteriskAmiClient } from "./ami/asterisk.ami";
import type { AmiClient } from "./ami/ami-client";
import { BackendClient } from "./backend.client";
import { Coordinator } from "./coordinator";
import { BackendConfigSource, type FreePbxConfig } from "./freepbx-config";
import { TenantAmiManager } from "./tenant-ami-manager";
import { startWorkerServer } from "./server";

function envFreePbxFallback(): FreePbxConfig | null {
  const host = process.env.AMI_HOST;
  const username = process.env.AMI_USERNAME;
  const secret = process.env.AMI_PASSWORD;
  const tenantId = process.env.AMI_TENANT_ID;
  if (!host || !username || !secret || !tenantId) return null;
  return {
    tenantId,
    host,
    port: Number(process.env.AMI_PORT ?? 5038),
    username,
    secret,
    // Constant so the env fallback never triggers needless reconnects.
    fingerprint: "env",
  };
}

async function main(): Promise<void> {
  const backend = new BackendClient({
    baseUrl: process.env.BACKEND_URL ?? "http://localhost:3005",
    sharedSecret: process.env.TELEPHONY_WORKER_SECRET ?? "",
  });
  const port = Number(process.env.WORKER_PORT ?? 3008);
  const sharedSecret = process.env.TELEPHONY_WORKER_SECRET ?? "";
  const mode = process.env.AMI_MODE ?? "mock";

  if (mode !== "asterisk") {
    // Local/dev: a single deterministic mock connection.
    const ami: AmiClient = new MockAmiClient();
    await ami.connect();
    new Coordinator(ami, backend).attach();
    startWorkerServer({
      port,
      sharedSecret,
      resolveClient: () => ami,
      describe: () => ({ mode: "mock", tenants: 1 }),
    });
    return;
  }

  // Production: one AMI connection per tenant, driven by saved FreePBX
  // Integrations (with env fallback for single-tenant/legacy setups).
  const source = new BackendConfigSource({
    baseUrl: process.env.BACKEND_URL ?? "http://localhost:3005",
    sharedSecret,
    envFallback: envFreePbxFallback(),
  });
  const manager = new TenantAmiManager(
    source,
    (cfg) =>
      new AsteriskAmiClient({
        host: cfg.host,
        port: cfg.port,
        username: cfg.username,
        password: cfg.secret,
        tenantId: cfg.tenantId,
      }),
    (client) => new Coordinator(client, backend).attach(),
  );
  manager.start(Number(process.env.AMI_SYNC_INTERVAL_MS ?? 30_000));

  startWorkerServer({
    port,
    sharedSecret,
    resolveClient: (tenantId) => manager.getClient(tenantId),
    describe: () => ({ mode: "asterisk", tenants: manager.tenantCount() }),
  });
}

main().catch((err) => {
  console.error("telephony-worker failed to start:", err);
  process.exit(1);
});
