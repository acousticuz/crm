import type {
  AnalysisResult,
  LlmAdapter,
  QaResult,
  ScriptCriterion,
  TranscriptForLlm,
} from "./llm-adapter";

/**
 * Tries the primary adapter first; on ANY error (credit exhausted, network,
 * provider down, parse failure), falls back to the secondary. Lets us keep
 * Claude as the preferred analyzer but never lose a call to a billing/outage.
 *
 * Errors from the primary are logged but swallowed so the fallback gets a
 * chance. If BOTH fail, the secondary's error is re-thrown so BullMQ retries.
 */
export class FallbackLlmAdapter implements LlmAdapter {
  readonly name: string;

  constructor(
    private readonly primary: LlmAdapter,
    private readonly secondary: LlmAdapter,
  ) {
    this.name = `${primary.name}+${secondary.name}`;
  }

  async analyze(t: TranscriptForLlm): Promise<AnalysisResult> {
    try {
      return await this.primary.analyze(t);
    } catch (err) {
      console.warn(
        `LLM primary (${this.primary.name}) analyze failed, falling back to ${this.secondary.name}: ${(err as Error).message}`,
      );
      return this.secondary.analyze(t);
    }
  }

  async grade(t: TranscriptForLlm, criteria: ScriptCriterion[]): Promise<QaResult> {
    try {
      return await this.primary.grade(t, criteria);
    } catch (err) {
      console.warn(
        `LLM primary (${this.primary.name}) grade failed, falling back to ${this.secondary.name}: ${(err as Error).message}`,
      );
      return this.secondary.grade(t, criteria);
    }
  }
}
