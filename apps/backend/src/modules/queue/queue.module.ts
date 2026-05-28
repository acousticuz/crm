import { Global, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import IORedis, { type Redis } from "ioredis";
import { QUEUES } from "@acoustic-crm/shared";

export const REDIS_CONNECTION = "ACOUSTIC_REDIS_CONNECTION";
export const STT_QUEUE = "ACOUSTIC_STT_QUEUE";
export const AI_ANALYSIS_QUEUE = "ACOUSTIC_AI_ANALYSIS_QUEUE";
export const QA_QUEUE = "ACOUSTIC_QA_QUEUE";

/**
 * Thin wrapper around BullMQ. We expose only the producers here — the
 * consumers live in apps/ai-worker. Tests that don't have Redis available
 * can still import this module: if `BULLMQ_DISABLED=1` we provide no-op
 * Queue stubs that silently swallow `.add(...)` calls.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CONNECTION,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis | null => {
        if (config.get<string>("BULLMQ_DISABLED") === "1") return null;
        const host = config.get<string>("REDIS_HOST", "localhost");
        const port = Number(config.get<string>("REDIS_PORT", "6380"));
        return new IORedis({
          host,
          port,
          maxRetriesPerRequest: null,
        });
      },
    },
    ...["STT", "AI_ANALYSIS", "QA"].map((key) => {
      const token = { STT: STT_QUEUE, AI_ANALYSIS: AI_ANALYSIS_QUEUE, QA: QA_QUEUE }[
        key as "STT" | "AI_ANALYSIS" | "QA"
      ];
      const queueName = {
        STT: QUEUES.STT,
        AI_ANALYSIS: QUEUES.AI_ANALYSIS,
        QA: QUEUES.QA,
      }[key as "STT" | "AI_ANALYSIS" | "QA"];
      return {
        provide: token,
        inject: [REDIS_CONNECTION],
        useFactory: (conn: Redis | null): Pick<Queue, "add"> => {
          if (!conn) {
            return {
              add: (async () => undefined) as unknown as Queue["add"],
            };
          }
          return new Queue(queueName, { connection: conn });
        },
      };
    }),
  ],
  exports: [REDIS_CONNECTION, STT_QUEUE, AI_ANALYSIS_QUEUE, QA_QUEUE],
})
export class QueueModule {}
