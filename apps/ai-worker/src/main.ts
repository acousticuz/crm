import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { QUEUES } from "@acoustic-crm/shared";
import { MockSttAdapter } from "./stt/mock.stt";
import { WhisperSttAdapter } from "./stt/whisper.stt";
import { GoogleSttAdapter } from "./stt/google.stt";
import type { SttAdapter } from "./stt/stt-adapter";
import { MockLlmAdapter } from "./llm/mock.llm";
import { ClaudeLlmAdapter } from "./llm/claude.llm";
import type { LlmAdapter } from "./llm/llm-adapter";
import { BackendClient } from "./backend.client";
import { runSttJob, type SttJobData } from "./sttJob";
import {
  runAnalysisJob,
  runQaJob,
  type AnalysisJobData,
  type QaJobData,
} from "./aiJobs";

function buildSttAdapter(): SttAdapter {
  const provider = process.env.STT_PROVIDER ?? "mock";
  if (provider === "google") {
    return new GoogleSttAdapter({
      apiKey: process.env.GOOGLE_STT_API_KEY ?? "",
      languageCode: process.env.GOOGLE_STT_LANGUAGE ?? "uz-UZ",
    });
  }
  if (provider === "whisper") {
    return new WhisperSttAdapter({
      apiKey: process.env.OPENAI_API_KEY ?? "",
      baseUrl: process.env.OPENAI_BASE_URL,
      // Transcription model — NOT OPENAI_MODEL (that's the chat model).
      model: process.env.OPENAI_STT_MODEL,
      prompt: process.env.OPENAI_STT_PROMPT,
    });
  }
  return new MockSttAdapter();
}

function buildLlmAdapter(): LlmAdapter {
  const provider = process.env.LLM_PROVIDER ?? "mock";
  if (provider === "claude") {
    return new ClaudeLlmAdapter({
      apiKey: process.env.ANTHROPIC_API_KEY ?? "",
      model: process.env.ANTHROPIC_MODEL ?? process.env.LLM_MODEL,
    });
  }
  return new MockLlmAdapter();
}

async function main(): Promise<void> {
  const connection = new IORedis({
    host: process.env.REDIS_HOST ?? "localhost",
    port: Number(process.env.REDIS_PORT ?? 6380),
    maxRetriesPerRequest: null,
  });
  const stt = buildSttAdapter();
  const llm = buildLlmAdapter();
  const backend = new BackendClient({
    baseUrl: process.env.BACKEND_URL ?? "http://localhost:3005",
    sharedSecret: process.env.TELEPHONY_WORKER_SECRET ?? "",
  });

  const sttWorker = new Worker<SttJobData>(
    QUEUES.STT,
    async (job: Job<SttJobData>) => {
      await runSttJob(job.data, { adapter: stt, backend });
    },
    { connection, concurrency: 2 },
  );

  const analysisWorker = new Worker<AnalysisJobData>(
    QUEUES.AI_ANALYSIS,
    async (job: Job<AnalysisJobData>) => {
      await runAnalysisJob(job.data, { llm, backend });
    },
    { connection, concurrency: 2 },
  );

  const qaWorker = new Worker<QaJobData>(
    QUEUES.QA,
    async (job: Job<QaJobData>) => {
      await runQaJob(job.data, { llm, backend });
    },
    { connection, concurrency: 2 },
  );

  for (const [name, w] of [["stt", sttWorker], ["analysis", analysisWorker], ["qa", qaWorker]] as const) {
    w.on("completed", (job) => {
      console.log(`${name} job ${job.id} done`);
    });
    w.on("failed", (job, err) => {
      console.error(`${name} job ${job?.id} failed: ${err.message}`);
    });
  }

  console.log(
    `ai-worker listening on queues ${QUEUES.STT}, ${QUEUES.AI_ANALYSIS}, ${QUEUES.QA} (stt=${stt.name}, llm=${llm.name})`,
  );
}

main().catch((err) => {
  console.error("ai-worker failed to start:", err);
  process.exit(1);
});
