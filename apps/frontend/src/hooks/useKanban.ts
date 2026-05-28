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
    onSuccess: () => {
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
}

export function useSmsTemplates() {
  return useQuery<SmsTemplate[]>({
    queryKey: ["sms-templates"],
    queryFn: async () => (await api.get<SmsTemplate[]>("/sms/templates")).data,
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
    socket.on("card:moved", refetch);
    socket.on("card:created", refetch);
    socket.on("card:updated", refetch);
    socket.on("call:ended", refetch);
    socket.on("pipeline:updated", refetchPipelines);
    return () => {
      socket.off("card:moved", refetch);
      socket.off("card:created", refetch);
      socket.off("card:updated", refetch);
      socket.off("call:ended", refetch);
      socket.off("pipeline:updated", refetchPipelines);
    };
  }, [qc]);
}
