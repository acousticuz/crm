import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { QUEUES } from "@acoustic-crm/shared";
import { MockSttAdapter } from "./stt/mock.stt";
import { WhisperSttAdapter } from "./stt/whisper.stt";
import type { SttAdapter } from "./stt/stt-adapter";
import { BackendClient } from "./backend.client";
import { runSttJob, type SttJobData } from "./sttJob";

function buildAdapter(): SttAdapter {
  const provider = process.env.STT_PROVIDER ?? "mock";
  if (provider === "whisper") {
    return new WhisperSttAdapter({
      apiKey: process.env.OPENAI_API_KEY ?? "",
      baseUrl: process.env.OPENAI_BASE_URL,
    });
  }
  return new MockSttAdapter();
}

async function main(): Promise<void> {
  const connection = new IORedis({
    host: process.env.REDIS_HOST ?? "localhost",
    port: Number(process.env.REDIS_PORT ?? 6380),
    maxRetriesPerRequest: null,
  });
  const adapter = buildAdapter();
  const backend = new BackendClient({
    baseUrl: process.env.BACKEND_URL ?? "http://localhost:3005",
    sharedSecret: process.env.TELEPHONY_WORKER_SECRET ?? "",
  });

  const worker = new Worker<SttJobData>(
    QUEUES.STT,
    async (job: Job<SttJobData>) => {
      // eslint-disable-next-line no-console
      console.log(`STT job ${job.id} for call ${job.data.callId}`);
      await runSttJob(job.data, { adapter, backend });
    },
    { connection, concurrency: 2 },
  );

  worker.on("completed", (job) => {
    // eslint-disable-next-line no-console
    console.log(`STT job ${job.id} done`);
  });
  worker.on("failed", (job, err) => {
    // eslint-disable-next-line no-console
    console.error(`STT job ${job?.id} failed: ${err.message}`);
  });

  // eslint-disable-next-line no-console
  console.log(`ai-worker listening on queue ${QUEUES.STT} (provider=${adapter.name})`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("ai-worker failed to start:", err);
  process.exit(1);
});
