import { MockAmiClient } from "./ami/mock.ami";
import { AsteriskAmiClient } from "./ami/asterisk.ami";
import type { AmiClient } from "./ami/ami-client";
import { BackendClient } from "./backend.client";
import { Coordinator } from "./coordinator";
import { startWorkerServer } from "./server";

function buildAmi(): AmiClient {
  const mode = process.env.AMI_MODE ?? "mock";
  if (mode === "asterisk") {
    return new AsteriskAmiClient({
      host: process.env.AMI_HOST ?? "127.0.0.1",
      port: Number(process.env.AMI_PORT ?? 5038),
      username: process.env.AMI_USERNAME ?? "",
      password: process.env.AMI_PASSWORD ?? "",
      tenantId: process.env.AMI_TENANT_ID ?? "",
    });
  }
  return new MockAmiClient();
}

async function main(): Promise<void> {
  const ami = buildAmi();
  await ami.connect();
  const backend = new BackendClient({
    baseUrl: process.env.BACKEND_URL ?? "http://localhost:3005",
    sharedSecret: process.env.TELEPHONY_WORKER_SECRET ?? "",
  });
  new Coordinator(ami, backend).attach();
  startWorkerServer({
    port: Number(process.env.WORKER_PORT ?? 3008),
    sharedSecret: process.env.TELEPHONY_WORKER_SECRET ?? "",
    ami,
  });
}

main().catch((err) => {
  console.error("telephony-worker failed to start:", err);
  process.exit(1);
});
