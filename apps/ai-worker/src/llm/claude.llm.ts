import type {
  AnalysisResult,
  LlmAdapter,
  QaResult,
  ScriptCriterion,
  TranscriptForLlm,
} from "./llm-adapter";

/**
 * Anthropic Claude adapter skeleton. M11 implementation:
 *   1. Loads prompts/analysis.v1.md and prompts/qa-grade.v1.md from disk.
 *   2. Calls `messages.create` with a JSON-only system prompt for analysis,
 *      one criterion-at-a-time for grading (so a flaky judgement on one
 *      criterion doesn't blow up the whole rubric).
 *   3. Parses the JSON output; defensively retries on JSON parse failure.
 *
 * For M8 we ship the interface and the prompts (versioned in `prompts/`);
 * the actual API call is intentionally a `throw` so misconfigured envs
 * fail loud rather than silently producing garbage data.
 */
export class ClaudeLlmAdapter implements LlmAdapter {
  readonly name = "claude";

  constructor(private readonly config: { apiKey: string; model?: string }) {
    void this.config;
  }

  async analyze(_t: TranscriptForLlm): Promise<AnalysisResult> {
    throw new Error(
      "ClaudeLlmAdapter is a skeleton — wire @anthropic-ai/sdk in M11 deploy-hardening.",
    );
  }

  async grade(_t: TranscriptForLlm, _criteria: ScriptCriterion[]): Promise<QaResult> {
    throw new Error("ClaudeLlmAdapter.grade not implemented in M8 skeleton");
  }
}
