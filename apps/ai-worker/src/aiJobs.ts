import type { LlmAdapter } from "./llm/llm-adapter";
import type { ScriptCriterion, TranscriptForLlm } from "./llm/llm-adapter";

export interface AnalysisJobData {
  tenantId: string;
  callId: string;
  transcript: TranscriptForLlm;
}

export interface QaJobData {
  tenantId: string;
  callId: string;
  scriptId: string;
  transcript: TranscriptForLlm;
  criteria: ScriptCriterion[];
}

export interface BackendApiForAi {
  writeAnalysis(body: {
    tenantId: string;
    callId: string;
    sentiment: string;
    topic: string;
    summary: string;
    nextStep: string;
    keyPoints: string[];
    suggestedTags: string[];
  }): Promise<void>;
  writeQAScore(body: {
    tenantId: string;
    callId: string;
    scriptId: string;
    totalScore: number;
    maxScore: number;
    criteriaResults: Array<{
      criterionId: string;
      passed: boolean;
      score: number;
      evidence: string;
    }>;
  }): Promise<void>;
}

/**
 * Self-contained jobs — the queue payload carries the transcript and the
 * script criteria, so the worker doesn't need to call back to the backend
 * for read data. Backend only handles write.
 */
export async function runAnalysisJob(
  data: AnalysisJobData,
  deps: { llm: LlmAdapter; backend: BackendApiForAi },
): Promise<void> {
  const result = await deps.llm.analyze(data.transcript);
  await deps.backend.writeAnalysis({
    tenantId: data.tenantId,
    callId: data.callId,
    ...result,
  });
}

export async function runQaJob(
  data: QaJobData,
  deps: { llm: LlmAdapter; backend: BackendApiForAi },
): Promise<void> {
  const result = await deps.llm.grade(data.transcript, data.criteria);
  await deps.backend.writeQAScore({
    tenantId: data.tenantId,
    callId: data.callId,
    scriptId: data.scriptId,
    totalScore: result.totalScore,
    maxScore: result.maxScore,
    criteriaResults: result.criteriaResults,
  });
}
