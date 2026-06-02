import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

// Mutations for the Settings → Pipelines editor. Reads reuse usePipelines()
// from useKanban.ts; these invalidate the same ["pipelines"] cache.
//
// IMPORTANT: backend ValidationPipe runs with `forbidNonWhitelisted: true`
// (apps/backend/src/main.ts), so any DTO field that isn't on the corresponding
// Create/Update DTO causes a 400. Path params (id, pipelineId, stageId) MUST
// be stripped out of the body before posting — sending them whole was the
// cause of the "add stage does nothing" bug.

export function usePipelineAdmin() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["pipelines"] });

  const createPipeline = useMutation({
    mutationFn: async (input: { name: string; isDefault?: boolean }) =>
      (await api.post("/pipelines", input)).data,
    onSuccess: invalidate,
  });
  const updatePipeline = useMutation({
    mutationFn: async ({ id, ...body }: { id: string; name?: string; isDefault?: boolean }) =>
      (await api.patch(`/pipelines/${id}`, body)).data,
    onSuccess: invalidate,
  });
  const deletePipeline = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/pipelines/${id}`)).data,
    onSuccess: invalidate,
  });

  const createStage = useMutation({
    mutationFn: async ({
      pipelineId,
      ...body
    }: {
      pipelineId: string;
      name: string;
      order: number;
      color?: string;
      type?: "NORMAL" | "WON" | "LOST";
    }) => (await api.post(`/pipelines/${pipelineId}/stages`, body)).data,
    onSuccess: invalidate,
  });
  const updateStage = useMutation({
    mutationFn: async ({
      pipelineId,
      stageId,
      ...body
    }: {
      pipelineId: string;
      stageId: string;
      name?: string;
      color?: string;
      type?: "NORMAL" | "WON" | "LOST";
      order?: number;
    }) => (await api.patch(`/pipelines/${pipelineId}/stages/${stageId}`, body)).data,
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
    mutationFn: async ({
      pipelineId,
      stageIds,
    }: {
      pipelineId: string;
      stageIds: string[];
    }) => (await api.post(`/pipelines/${pipelineId}/stages/reorder`, { stageIds })).data,
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
