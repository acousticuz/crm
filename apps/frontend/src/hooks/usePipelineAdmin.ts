import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

// Mutations for the Settings → Pipelines editor. Reads reuse usePipelines()
// from useKanban.ts; these invalidate the same ["pipelines"] cache.

export function usePipelineAdmin() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["pipelines"] });

  const createPipeline = useMutation({
    mutationFn: async (input: { name: string; isDefault?: boolean }) =>
      (await api.post("/pipelines", input)).data,
    onSuccess: invalidate,
  });
  const updatePipeline = useMutation({
    mutationFn: async (input: { id: string; name?: string; isDefault?: boolean }) =>
      (await api.patch(`/pipelines/${input.id}`, input)).data,
    onSuccess: invalidate,
  });
  const deletePipeline = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/pipelines/${id}`)).data,
    onSuccess: invalidate,
  });

  const createStage = useMutation({
    mutationFn: async (input: {
      pipelineId: string;
      name: string;
      order: number;
      color?: string;
      type?: "NORMAL" | "WON" | "LOST";
    }) => (await api.post(`/pipelines/${input.pipelineId}/stages`, input)).data,
    onSuccess: invalidate,
  });
  const updateStage = useMutation({
    mutationFn: async (input: {
      pipelineId: string;
      stageId: string;
      name?: string;
      color?: string;
      type?: "NORMAL" | "WON" | "LOST";
      order?: number;
    }) =>
      (await api.patch(`/pipelines/${input.pipelineId}/stages/${input.stageId}`, input)).data,
    onSuccess: invalidate,
  });
  const deleteStage = useMutation({
    mutationFn: async (input: { pipelineId: string; stageId: string; reassignTo?: string }) =>
      (
        await api.delete(`/pipelines/${input.pipelineId}/stages/${input.stageId}`, {
          params: input.reassignTo ? { reassignTo: input.reassignTo } : {},
        })
      ).data,
    onSuccess: invalidate,
  });
  const reorderStages = useMutation({
    mutationFn: async (input: { pipelineId: string; stageIds: string[] }) =>
      (await api.post(`/pipelines/${input.pipelineId}/stages/reorder`, { stageIds: input.stageIds })).data,
    onSuccess: invalidate,
  });

  return {
    createPipeline,
    updatePipeline,
    deletePipeline,
    createStage,
    updateStage,
    deleteStage,
    reorderStages,
  };
}
