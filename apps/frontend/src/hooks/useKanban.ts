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
    socket.on("card:moved", refetch);
    socket.on("card:created", refetch);
    socket.on("card:updated", refetch);
    return () => {
      socket.off("card:moved", refetch);
      socket.off("card:created", refetch);
      socket.off("card:updated", refetch);
    };
  }, [qc]);
}
