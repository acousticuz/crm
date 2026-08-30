import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CardStatus, PageResult, StageType } from "@/lib/types";

export interface Contact {
  id: string;
  fullName: string;
  phones: string[];
  email: string | null;
  source: string | null;
  responsibleUserId: string | null;
  createdAt: string;
}

export interface UpdateContactInput {
  fullName?: string;
  phones?: string[];
  email?: string | null;
}

export interface CreateContactInput {
  fullName: string;
  phones: string[];
  email?: string | null;
  source?: string;
}

export interface AcousticClientFilters {
  q?: string;
  status?: string;
  branchId?: string;
  branchIds?: string[];
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export interface AcousticClient {
  id: string;
  fullName: string;
  phones: string[];
  source: string | null;
  responsible: { id: string; fullName: string } | null;
  createdAt: string;
  updatedAt: string;
  acoustic: {
    clientId?: number;
    status?: string;
    nextAction?: string | null;
    visited?: boolean;
    purchased?: boolean;
    purchaseAmount?: number | null;
    callCenterDate?: string | null;
    firstVisitDate?: string | null;
    visitBranchId?: number | null;
    visitBranchName?: string | null;
    purchaseBranchId?: number | null;
    purchaseBranchName?: string | null;
    purchaseDate?: string | null;
    products?: Array<{
      product_ref_id?: number | null;
      product_name?: string | null;
      quantity?: number | null;
    }>;
  } | null;
  card: {
    id: string;
    title: string;
    status: CardStatus;
    budget: string | null;
    branchId: string | null;
    updatedAt: string;
    branch: { id: string; name: string } | null;
    responsible: { id: string; fullName: string } | null;
    stage: { id: string; name: string; type: StageType } | null;
  } | null;
}

/**
 * After a rename / create, the contact name and id changes ripple through:
 * the Kanban board (card.contact.fullName), the open card sheet, the calls
 * feed, and any contact lookup. Invalidate all of them so the operator
 * doesn't see the old "Noma'lum" anywhere after fixing it.
 */
function invalidateContactDependents(qc: ReturnType<typeof useQueryClient>): void {
  qc.invalidateQueries({ queryKey: ["cards"] });
  qc.invalidateQueries({ queryKey: ["card"] });
  qc.invalidateQueries({ queryKey: ["calls"] });
  qc.invalidateQueries({ queryKey: ["contacts"] });
}

export function useUpdateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; data: UpdateContactInput }) =>
      (await api.patch<Contact>(`/contacts/${input.id}`, input.data)).data,
    onSuccess: () => invalidateContactDependents(qc),
  });
}

export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateContactInput) =>
      (await api.post<Contact>(`/contacts`, input)).data,
    onSuccess: () => invalidateContactDependents(qc),
  });
}

export function useContactByPhone(phone: string | null | undefined) {
  return useQuery<Contact[] | null>({
    queryKey: ["contacts", "by-phone", phone],
    enabled: !!phone,
    queryFn: async () =>
      (await api.get<Contact[]>(`/contacts/check`, { params: { phone } })).data,
  });
}

export function useAcousticClients(filters: AcousticClientFilters) {
  return useQuery<PageResult<AcousticClient>>({
    queryKey: ["contacts", "acoustic-clients", filters],
    queryFn: async () =>
      (
        await api.get<PageResult<AcousticClient>>("/contacts/acoustic-clients", {
          params: filters,
        })
      ).data,
  });
}

export function useAcousticPurchases(filters: AcousticClientFilters) {
  return useQuery<PageResult<AcousticClient>>({
    queryKey: ["contacts", "acoustic-purchases", filters],
    queryFn: async () =>
      (
        await api.get<PageResult<AcousticClient>>("/contacts/acoustic-purchases", {
          params: {
            ...filters,
            branchIds: filters.branchIds?.length ? filters.branchIds.join(",") : undefined,
          },
        })
      ).data,
  });
}

export interface RecentCall {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  status: string;
  fromNumber: string;
  toNumber: string;
  startedAt: string;
  duration: number;
  contactId: string | null;
  cardId: string | null;
  operator: { id: string; fullName: string } | null;
  contact: { id: string; fullName: string; phones: string[] } | null;
  card: { id: string; title: string } | null;
}

export function useRecentCalls(
  opts: {
    missedOnly?: boolean;
    limit?: number;
    /** Inclusive YYYY-MM-DD. */
    dateFrom?: string;
    /** Inclusive YYYY-MM-DD. */
    dateTo?: string;
  } = {},
) {
  return useQuery<RecentCall[]>({
    queryKey: ["calls", "recent", opts],
    queryFn: async () =>
      (
        await api.get<RecentCall[]>("/calls", {
          params: {
            recent: "true",
            limit: opts.limit ?? 100,
            missedOnly: opts.missedOnly ? "true" : undefined,
            dateFrom: opts.dateFrom || undefined,
            dateTo: opts.dateTo || undefined,
          },
        })
      ).data,
  });
}

// Names the auto-resolver assigns to placeholder contacts created from an
// unknown inbound number. Used to flag rows that need a real name.
const PLACEHOLDER_NAMES = new Set(["noma'lum", "noma`lum", "noma lum", "unknown"]);

export function isPlaceholderContact(name: string | null | undefined): boolean {
  if (!name) return true;
  return PLACEHOLDER_NAMES.has(name.trim().toLowerCase());
}
