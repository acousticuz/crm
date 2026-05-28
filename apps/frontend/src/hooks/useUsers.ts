import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type UserRole = "TENANT_ADMIN" | "SUPERVISOR" | "OPERATOR" | "ANALYST";
export type UserStatus = "ACTIVE" | "DISABLED";

export interface ManagedUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  branchId: string | null;
  extension: string | null;
  status: UserStatus;
  isOnline: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserInput {
  fullName: string;
  email: string;
  password: string;
  role: UserRole;
  branchId?: string;
  extension?: string;
}

export type UpdateUserInput = Partial<{
  fullName: string;
  password: string;
  role: UserRole;
  status: UserStatus;
  branchId: string;
  extension: string;
}>;

export function useUsers() {
  return useQuery<ManagedUser[]>({
    queryKey: ["users"],
    queryFn: async () => (await api.get<ManagedUser[]>("/users")).data,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateUserInput) => (await api.post("/users", input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; data: UpdateUserInput }) =>
      (await api.patch(`/users/${input.id}`, input.data)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/users/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

// Lazily fetch the PBX extension list from FreePBX (via the telephony worker).
export function usePbxExtensions() {
  return useMutation({
    mutationFn: async () => (await api.get<string[]>("/calls/pbx/extensions")).data,
  });
}
