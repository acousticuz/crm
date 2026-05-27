import { ClsService } from "nestjs-cls";
import { UserRole } from "@acoustic-crm/shared";

// Shape of per-request context propagated via nestjs-cls (AsyncLocalStorage).
// Read by the Prisma tenant extension on every query.
export interface RequestContext {
  tenantId: string | null;
  userId: string | null;
  role: UserRole | null;
  email: string | null;
  // When true, the Prisma extension skips tenantId injection (for SUPER_ADMIN
  // ops that legitimately span tenants, like creating a new tenant).
  skipTenantFilter: boolean;
}

export const CONTEXT_KEY = "ctx" as const;

export function readContext(cls: ClsService): RequestContext {
  return (
    cls.get<RequestContext>(CONTEXT_KEY) ?? {
      tenantId: null,
      userId: null,
      role: null,
      email: null,
      skipTenantFilter: false,
    }
  );
}

export function writeContext(cls: ClsService, ctx: Partial<RequestContext>): void {
  const current = readContext(cls);
  cls.set(CONTEXT_KEY, { ...current, ...ctx });
}
