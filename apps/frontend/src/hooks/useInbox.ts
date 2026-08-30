import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";

export interface InboxThread {
  id: string;
  channel: string;
  status: string;
  lastMessageAt: string;
  contact: { id: string; fullName: string } | null;
  messages: Array<{
    text: string;
    sender: string;
    status: string;
    direction: string;
    createdAt: string;
  }>;
}

export interface InboxMessage {
  id: string;
  threadId: string;
  direction: "INBOUND" | "OUTBOUND";
  sender: string;
  text: string;
  status: string;
  sensitiveCategories: string[];
  approvedBy: string | null;
  rejectionReason: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface InboxThreadDetail extends InboxThread {
  contact: { id: string; fullName: string; phones: string[] } | null;
  messages: InboxMessage[];
}

export function useInboxThreads(status: "OPEN" | "CLOSED" | "ALL" = "OPEN") {
  return useQuery<InboxThread[]>({
    queryKey: ["inbox", "threads", status],
    queryFn: async () => (await api.get<InboxThread[]>("/inbox/threads", { params: { status } })).data,
  });
}

export function useInboxThread(id: string | null) {
  return useQuery<InboxThreadDetail>({
    queryKey: ["inbox", "thread", id],
    queryFn: async () => (await api.get<InboxThreadDetail>(`/inbox/threads/${id}`)).data,
    enabled: !!id,
  });
}

export function useApproveDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { messageId: string; text?: string }) =>
      (await api.post(`/inbox/messages/${input.messageId}/approve`, { text: input.text })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inbox"] }),
  });
}

export function useRejectDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { messageId: string; reason: string }) =>
      (await api.post(`/inbox/messages/${input.messageId}/reject`, { reason: input.reason })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inbox"] }),
  });
}

export function useSendInboxMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { threadId: string; text: string }) =>
      (await api.post(`/inbox/threads/${input.threadId}/messages`, { text: input.text })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inbox"] }),
  });
}

export function useLinkInboxThreadPhone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { threadId: string; phone: string; fullName?: string }) =>
      (await api.post(`/inbox/threads/${input.threadId}/contact-phone`, {
        phone: input.phone,
        fullName: input.fullName,
      })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inbox"] }),
  });
}

export function useInboxRealtime(): void {
  const qc = useQueryClient();
  useEffect(() => {
    const socket = getSocket();
    const refetchInbox = () => {
      qc.invalidateQueries({ queryKey: ["inbox"] });
    };
    socket.on("inbox:message", refetchInbox);
    return () => {
      socket.off("inbox:message", refetchInbox);
    };
  }, [qc]);
}
