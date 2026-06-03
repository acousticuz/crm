import type { TranscriptSegment } from "@acoustic-crm/shared";

// Operator deviation from the active sales script. Surfaced in the UI as
// "Xatoliklar" so the supervisor can coach on specific moments.
export interface AnalysisMistake {
  section: string;
  severity: "low" | "medium" | "high";
  message: string;
  evidence?: string;
}

export interface AnalysisResult {
  sentiment: "positive" | "neutral" | "negative" | "mixed";
  topic: string;
  summary: string;
  nextStep: string;
  keyPoints: string[];
  suggestedTags: string[];
  mistakes: AnalysisMistake[];
}

export interface ScriptCriterion {
  id: string;
  section: string;
  text: string;
  maxScore: number;
  keywords?: string[];
}

// Optional context an analyze() call may receive when the tenant has an
// active sales script. The LLM uses it to spot deviations and produce the
// mistakes list; without it, mistakes is returned empty.
export interface ScriptContext {
  name: string;
  sections: string[];
  criteria: ScriptCriterion[];
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
  analyze(transcript: TranscriptForLlm, script?: ScriptContext): Promise<AnalysisResult>;
  grade(transcript: TranscriptForLlm, criteria: ScriptCriterion[]): Promise<QaResult>;
}
