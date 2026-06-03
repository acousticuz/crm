import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface OperatorKpi {
  userId: string | null;
  fullName?: string;
  callsInbound: number;
  callsOutbound: number;
  callsMissed: number;
  avgDurationSec: number;
  avgQaScore: number;
  scriptAdherencePct: number;
  conversionPct: number;
  sentiment: { positive: number; neutral: number; negative: number; mixed: number };
}

export interface TeamRow extends OperatorKpi {
  branchId?: string | null;
}

export interface CriterionStat {
  criterionId: string;
  text: string;
  section: string;
  passRate: number;
  samples: number;
}

export interface TrendPoint {
  bucket: string;
  callsInbound: number;
  callsOutbound: number;
  callsMissed: number;
  avgDurationSec: number;
  avgQaScore: number;
  sentiment: { positive: number; neutral: number; negative: number; mixed: number };
}

export interface ScorecardDetail {
  id: string;
  startedAt: string;
  duration: number;
  direction: string;
  status: string;
  transcript: { text: string; segments: unknown; confidence: number; language: string } | null;
  analysis: {
    sentiment: string | null;
    topic: string | null;
    summary: string | null;
    nextStep: string | null;
    keyPoints: unknown;
    // LLM-extracted deviations vs the active sales script.
    mistakes?: Array<{
      section: string;
      severity: "low" | "medium" | "high";
      message: string;
      evidence?: string;
    }>;
    script: { id: string; name: string } | null;
  } | null;
  qaScores: Array<{
    id: string;
    totalScore: number;
    maxScore: number;
    criteriaResults: Array<{
      criterionId: string;
      passed: boolean;
      score: number;
      evidence: string;
    }>;
    supervisorOverride: Record<string, unknown> | null;
    reviewer: { id: string; fullName: string } | null;
    script: { id: string; name: string };
  }>;
}

interface RangeQuery {
  from?: string;
  to?: string;
  userId?: string;
  branchId?: string;
}

export function useOperatorKpi(q: RangeQuery) {
  return useQuery<OperatorKpi>({
    queryKey: ["analytics", "operator-kpi", q],
    queryFn: async () => (await api.get<OperatorKpi>("/analytics/operator-kpi", { params: q })).data,
  });
}

export function useTeam(q: RangeQuery) {
  return useQuery<{ items: TeamRow[] }>({
    queryKey: ["analytics", "team", q],
    queryFn: async () =>
      (await api.get<{ items: TeamRow[] }>("/analytics/team", { params: q })).data,
  });
}

export function useBranches(q: RangeQuery) {
  return useQuery<{ items: Array<{ branchId: string; name: string } & OperatorKpi> }>({
    queryKey: ["analytics", "branches", q],
    queryFn: async () => (await api.get("/analytics/branches", { params: q })).data,
  });
}

export function useWeakestCriteria(q: RangeQuery) {
  return useQuery<{ weakest: CriterionStat[]; strongest: CriterionStat[]; totalCriteria: number }>(
    {
      queryKey: ["analytics", "weakest", q],
      queryFn: async () =>
        (await api.get("/analytics/weakest-criteria", { params: { ...q, limit: 5 } })).data,
    },
  );
}

export function useTrends(q: RangeQuery & { metric?: string; groupBy?: "day" | "week" }) {
  return useQuery<{ groupBy: string; items: TrendPoint[] }>({
    queryKey: ["analytics", "trends", q],
    queryFn: async () => (await api.get("/analytics/trends", { params: q })).data,
  });
}

export function useScorecard(callId: string | null) {
  return useQuery<ScorecardDetail>({
    queryKey: ["scorecard", callId],
    queryFn: async () =>
      (await api.get<ScorecardDetail>(`/qa/scorecard/${callId}`)).data,
    enabled: !!callId,
  });
}
