import type { TranscriptSegment } from "@acoustic-crm/shared";

export interface AnalysisResult {
  sentiment: "positive" | "neutral" | "negative" | "mixed";
  topic: string;
  summary: string;
  nextStep: string;
  keyPoints: string[];
  suggestedTags: string[];
}

export interface ScriptCriterion {
  id: string;
  section: string;
  text: string;
  maxScore: number;
  keywords?: string[];
}

export interface CriterionGrade {
  criterionId: string;
  passed: boolean;
  score: number;
  evidence: string;
}

export interface QaResult {
  totalScore: number;
  maxScore: number;
  criteriaResults: CriterionGrade[];
}

export interface TranscriptForLlm {
  text: string;
  segments: TranscriptSegment[];
  language: string;
}

/**
 * Provider-agnostic LLM contract. Real adapters (Anthropic Claude, OpenAI)
 * load prompts from `prompts/*.md`, send the transcript along with the
 * script criteria, and parse the JSON output.
 */
export interface LlmAdapter {
  readonly name: string;
  analyze(transcript: TranscriptForLlm): Promise<AnalysisResult>;
  grade(transcript: TranscriptForLlm, criteria: ScriptCriterion[]): Promise<QaResult>;
}
