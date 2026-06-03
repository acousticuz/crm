import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import type {
  CardDetail,
  CardListItem,
  PageResult,
  Pipeline,
  Tag,
  UserSummary,
} from "@/lib/types";

export interface CardFilters {
  pipelineId?: string;
  tagId?: string;
  responsibleUserId?: string;
  branchId?: string;
  source?: string;
  missedOnly?: boolean;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
}

export function usePipelines() {
  return useQuery<Pipeline[]>({
    queryKey: ["pipelines"],
    queryFn: async () => (await api.get<Pipeline[]>("/pipelines")).data,
  });
}

export function useCards(filters: CardFilters) {
  return useQuery<PageResult<CardListItem>>({
    queryKey: ["cards", filters],
    queryFn: async () =>
      (await api.get<PageResult<CardListItem>>("/cards", { params: { ...filters, pageSize: 200 } })).data,
    enabled: !!filters.pipelineId,
  });
}

export function useTags() {
  return useQuery<Tag[]>({
    queryKey: ["tags"],
    queryFn: async () => (await api.get<Tag[]>("/tags")).data,
  });
}

export function useUsers() {
  return useQuery<UserSummary[]>({
    queryKey: ["users"],
    queryFn: async () => (await api.get<UserSummary[]>("/users")).data,
  });
}

export interface AnalysisMistake {
  section: string;
  severity: "low" | "medium" | "high";
  message: string;
  evidence?: string;
}

export interface CallScorecard {
  id: string;
  transcript: { text: string; language: string; confidence: number } | null;
  analysis: {
    sentiment: string | null;
    topic: string | null;
    summary: string | null;
    nextStep: string | null;
    keyPoints?: string[];
    mistakes?: AnalysisMistake[];
  } | null;
  qaScores: Array<{
    id: string;
    totalScore: number;
    maxScore: number;
    script: { id: string; name: string } | null;
    criteriaResults?: Array<{
      criterionId: string;
      passed: boolean;
      score: number;
      evidence: string;
    }>;
  }>;
}

// Transcript + AI analysis + QA score for a single call (lazy — only fetched
// when an operator expands the call in the card detail).
export function useScorecard(callId: string | null) {
  return useQuery<CallScorecard>({
    queryKey: ["scorecard", callId],
    queryFn: async () => (await api.get<CallScorecard>(`/qa/scorecard/${callId}`)).data,
    enabled: !!callId,
  });
}

/**
 * Fires the on-demand analysis pipeline (STT → LLM → QA) for one call. Paid
 * services run only on this explicit click. `force=true` is "Qayta tahlil"
 * — wipes prior transcript/analysis/QA so the re-run starts clean.
 */
export function useAnalyzeCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { callId: string; force?: boolean }) =>
      (
        await api.post<{ enqueued: boolean; callId: string; force: boolean }>(
          `/calls/${input.callId}/analyze`,
          {},
          { params: input.force ? { force: "true" } : {} },
        )
      ).data,
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["scorecard", vars.callId] });
      qc.invalidateQueries({ queryKey: ["card"] });
    },
  });
}

export function useCardDetail(cardId: string | null) {
  return useQuery<CardDetail>({
    queryKey: ["card", cardId],
    queryFn: async () => (await api.get<CardDetail>(`/cards/${cardId}`)).data,
    enabled: !!cardId,
  });
}

export function useMoveCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ cardId, stageId }: { cardId: string; stageId: string }) => {
      const { data } = await api.patch(`/cards/${cardId}/move`, { stageId });
      return data;
    },
    // Optimistically move the card to the target stage so the board updates
    // instantly; reconcile (or roll back) once the server responds.
    onMutate: async ({ cardId, stageId }) => {
      await qc.cancelQueries({ queryKey: ["cards"] });
      const prev = qc.getQueriesData<PageResult<CardListItem>>({ queryKey: ["cards"] });
      for (const [key, data] of prev) {
        if (!data) continue;
        qc.setQueryData<PageResult<CardListItem>>(key, {
          ...data,
          items: data.items.map((c) => (c.id === cardId ? { ...c, stageId } : c)),
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.prev?.forEach(([key, data]) => qc.setQueryData<PageResult<CardListItem>>(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["cards"] });
    },
  });
}

export function useAttachTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ cardId, tagId }: { cardId: string; tagId: string }) => {
      await api.post(`/cards/${cardId}/tags/${tagId}`);
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["card", vars.cardId] });
      qc.invalidateQueries({ queryKey: ["cards"] });
    },
  });
}

export function useDetachTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ cardId, tagId }: { cardId: string; tagId: string }) => {
      await api.delete(`/cards/${cardId}/tags/${tagId}`);
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["card", vars.cardId] });
      qc.invalidateQueries({ queryKey: ["cards"] });
    },
  });
}

export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ cardId, text }: { cardId: string; text: string }) => {
      const { data } = await api.post("/notes", { cardId, text });
      return data;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["card", vars.cardId] }),
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      cardId: string;
      text: string;
      assigneeId: string;
      dueAt: string;
    }) => (await api.post("/tasks", input)).data,
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["card", vars.cardId] }),
  });
}

interface SmsTemplate {
  id: string;
  name: string;
  body: string;
  externalProvider?: string | null;
  externalId?: string | null;
  // Eskiz template lifecycle ("service" = approved). Templates with any other
  // status are still listed but flagged so operators don't try sending
  // unapproved bodies that Eskiz will reject.
  externalStatus?: string | null;
}

export function useSmsTemplates() {
  return useQuery<SmsTemplate[]>({
    queryKey: ["sms-templates"],
    queryFn: async () => (await api.get<SmsTemplate[]>("/sms/templates")).data,
  });
}

export interface SmsSettings {
  provider: string | null;
  allowFreeText: boolean;
  supportsTemplateSync: boolean;
}

export function useSmsSettings() {
  return useQuery<SmsSettings>({
    queryKey: ["sms-settings"],
    queryFn: async () => (await api.get<SmsSettings>("/sms/settings")).data,
  });
}

export function useSyncSmsTemplates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (await api.post<{ provider: string; fetched: number; upserted: number; skipped: number }>(
        "/sms/templates/sync",
      )).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sms-templates"] }),
  });
}

export function useSendSms() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      cardId?: string;
      contactId?: string;
      phone: string;
      templateId?: string;
      text?: string;
      variables?: Record<string, string | number>;
    }) => (await api.post("/sms/send", input)).data,
    onSuccess: (_d, vars) => {
      if (vars.cardId) qc.invalidateQueries({ queryKey: ["card", vars.cardId] });
    },
  });
}

export function useOriginateCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { toNumber: string; cardId?: string; contactId?: string }) =>
      (await api.post("/calls/originate", input)).data,
    onSuccess: (_d, vars) => {
      if (vars.cardId) qc.invalidateQueries({ queryKey: ["card", vars.cardId] });
    },
  });
}

/**
 * Subscribes to inbound-call screen-pop events. The callback receives the
 * tenant's call:incoming payload — typically used to surface a toast and
 * (optionally) auto-open the matching card.
 */
export function useIncomingCallListener(handler: (payload: IncomingCallPayload) => void): void {
  useEffect(() => {
    const socket = getSocket();
    socket.on("call:incoming", handler);
    return () => {
      socket.off("call:incoming", handler);
    };
  }, [handler]);
}

export interface IncomingCallPayload {
  cdrUniqueId: string;
  fromNumber: string;
  toNumber: string;
  operatorId: string | null;
  contact: { id: string; fullName: string; phones: string[]; email: string | null } | null;
  card: { id: string; title: string } | null;
}

/**
 * Subscribe to tenant Socket.io events and invalidate the card queries so
 * the board re-fetches when other operators move/create/update cards.
 */
export function useKanbanRealtime(): void {
  const qc = useQueryClient();
  useEffect(() => {
    const socket = getSocket();
    const refetch = () => {
      qc.invalidateQueries({ queryKey: ["cards"] });
    };
    const refetchPipelines = () => {
      qc.invalidateQueries({ queryKey: ["pipelines"] });
      qc.invalidateQueries({ queryKey: ["cards"] });
    };
    // SmsService emits "sms:status" on QUEUED→SENT→DELIVERED transitions and
    // on send failures. Invalidate both the board (for the lastSms badge) and
    // any open card detail (for the SMS history list).
    const refetchSms = () => {
      qc.invalidateQueries({ queryKey: ["cards"] });
      qc.invalidateQueries({ queryKey: ["card"] });
    };
    // Analysis pipeline produces socket events at each stage so the UI can
    // flip from "analyzing" to "analyzed" without polling.
    const refetchAnalysis = () => {
      qc.invalidateQueries({ queryKey: ["scorecard"] });
      qc.invalidateQueries({ queryKey: ["card"] });
    };
    socket.on("card:moved", refetch);
    socket.on("card:created", refetch);
    socket.on("card:updated", refetch);
    socket.on("call:ended", refetch);
    socket.on("sms:status", refetchSms);
    socket.on("analysis:started", refetchAnalysis);
    socket.on("analysis:ready", refetchAnalysis);
    socket.on("transcript:ready", refetchAnalysis);
    socket.on("qa:ready", refetchAnalysis);
    socket.on("pipeline:updated", refetchPipelines);
    return () => {
      socket.off("card:moved", refetch);
      socket.off("card:created", refetch);
      socket.off("card:updated", refetch);
      socket.off("call:ended", refetch);
      socket.off("sms:status", refetchSms);
      socket.off("analysis:started", refetchAnalysis);
      socket.off("analysis:ready", refetchAnalysis);
      socket.off("transcript:ready", refetchAnalysis);
      socket.off("qa:ready", refetchAnalysis);
      socket.off("pipeline:updated", refetchPipelines);
    };
  }, [qc]);
}
