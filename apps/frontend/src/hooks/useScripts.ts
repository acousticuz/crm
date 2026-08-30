import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

// Mirrors the backend Script entity (apps/backend/src/modules/qa). Sections is
// just an ordered list of strings; criteria is what the QA grader reads
// section-by-section. Operators see this as the call script; supervisors edit
// it from Settings.
export interface ScriptCriterion {
  id: string;
  section: string;
  text: string;
  maxScore: number;
  keywords?: string[];
  // Free-form bullet points the operator follows during the call. Optional —
  // older scripts may not have it.
  guidance?: string[];
}

export interface Script {
  id: string;
  name: string;
  sections: string[];
  criteria: ScriptCriterion[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function useScripts() {
  return useQuery<Script[]>({
    queryKey: ["scripts"],
    queryFn: async () => (await api.get<Script[]>("/qa/scripts")).data,
  });
}

export function useActiveScript() {
  const scripts = useScripts();
  const active =
    scripts.data
      ?.filter((s) => s.isActive)
      .sort((a, b) => scriptCompletenessScore(b) - scriptCompletenessScore(a))[0] ?? null;
  return { ...scripts, data: active };
}

function scriptCompletenessScore(script: Script): number {
  const sections = Array.isArray(script.sections) ? script.sections.length : 0;
  const criteria = Array.isArray(script.criteria) ? script.criteria : [];
  const guidance = criteria.reduce((sum, c) => sum + (c.guidance?.length ?? 0), 0);
  const keywords = criteria.reduce((sum, c) => sum + (c.keywords?.length ?? 0), 0);
  return sections * 100 + criteria.length * 10 + guidance + keywords;
}

export function useUpdateScript() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...body
    }: {
      id: string;
      name?: string;
      sections?: string[];
      criteria?: ScriptCriterion[];
      isActive?: boolean;
    }) => (await api.patch<Script>(`/qa/scripts/${id}`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scripts"] }),
  });
}

export function useCreateScript() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      sections: string[];
      criteria: ScriptCriterion[];
      isActive?: boolean;
    }) => (await api.post<Script>("/qa/scripts", input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scripts"] }),
  });
}

export function useDeleteScript() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/qa/scripts/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scripts"] }),
  });
}
