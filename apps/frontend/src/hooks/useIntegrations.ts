import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type IntegrationType = "FREEPBX" | "SMS" | "TELEGRAM" | "INBOX";
export type IntegrationStatus = "CONNECTED" | "DISCONNECTED" | "ERROR";

export interface Integration {
  type: IntegrationType;
  provider: string | null;
  status: IntegrationStatus;
  config: Record<string, unknown>;
  configured: boolean;
  lastTestedAt: string | null;
  lastTestResult: { ok: boolean; message: string } | null;
}

export function useIntegrations() {
  return useQuery<Integration[]>({
    queryKey: ["integrations"],
    queryFn: async () => (await api.get<Integration[]>("/integrations")).data,
  });
}

export function useSaveIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      type: IntegrationType;
      provider?: string;
      config: Record<string, unknown>;
    }) => (await api.put(`/integrations/${input.type}`, { provider: input.provider, config: input.config })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations"] }),
  });
}

export function useTestIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (type: IntegrationType) =>
      (await api.post<{ ok: boolean; message: string; status: string }>(`/integrations/${type}/test`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations"] }),
  });
}

export function useDisconnectIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (type: IntegrationType) =>
      (await api.post(`/integrations/${type}/disconnect`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations"] }),
  });
}
