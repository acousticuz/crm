import { Prisma } from "@prisma/client";
import type { ClsService } from "nestjs-cls";
import { readContext } from "../../common/tenant-context";

// Models that carry a direct tenantId column (mirrors schema.prisma). Models
// linked only by relation (CardTag, Transcript, Analysis, QAScore) reach
// tenant scope via their parent; we don't inject tenantId for them directly.
const TENANT_SCOPED_MODELS = new Set<string>([
  "User",
  "Branch",
  "Contact",
  "Pipeline",
  "Stage",
  "Card",
  "Tag",
  "Task",
  "Call",
  "Script",
  "SmsTemplate",
  "SmsLog",
  "Lead",
  "Trigger",
  "Note",
  "AuditLog",
]);

// Operation buckets — different argument shapes (where vs data vs both).
const WHERE_OPS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
]);
const CREATE_OPS = new Set(["create", "createMany", "createManyAndReturn"]);
const UPSERT_OPS = new Set(["upsert"]);

type MutableArgs = Record<string, unknown>;

function setWhere(args: MutableArgs, tenantId: string): void {
  const existing = (args.where as MutableArgs | undefined) ?? {};
  args.where = { ...existing, tenantId };
}

function setData(args: MutableArgs, tenantId: string): void {
  const data = args.data;
  if (Array.isArray(data)) {
    args.data = data.map((d) => ({ ...(d as MutableArgs), tenantId }));
  } else {
    args.data = { ...((data as MutableArgs | undefined) ?? {}), tenantId };
  }
}

/**
 * Builds a Prisma client extension that auto-applies the current request's
 * tenantId to every query against tenant-scoped models.
 *
 * Behavior:
 *   - When CLS has a tenantId and skipTenantFilter=false, every read injects
 *     { tenantId } into where, and every create writes it into data.
 *   - When no tenantId is set (e.g. during /auth/login lookups), queries
 *     pass through unchanged — the caller handles filtering explicitly.
 *   - SUPER_ADMIN flows that legitimately span tenants set skipTenantFilter
 *     via PrismaService.asSuperAdmin().
 *
 * findUnique with only { id } would skip the filter; service code MUST use
 * findFirst({ where: { id, tenantId } }) for tenant-scoped lookups. The
 * extension still injects tenantId; findFirst accepts non-unique filters.
 */
export function createTenantExtension(cls: ClsService) {
  return Prisma.defineExtension({
    name: "tenant-filter",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const ctx = readContext(cls);
          if (!ctx.tenantId || ctx.skipTenantFilter || !TENANT_SCOPED_MODELS.has(model)) {
            return query(args);
          }
          const tenantId = ctx.tenantId;
          // The args type is a discriminated union over operation; mutating
          // through a shared shape is intentional. Cast to query's expected
          // type at the call site once we've reshaped.
          const mutable = { ...(args as MutableArgs) };
          if (WHERE_OPS.has(operation)) {
            setWhere(mutable, tenantId);
          } else if (CREATE_OPS.has(operation)) {
            setData(mutable, tenantId);
          } else if (UPSERT_OPS.has(operation)) {
            setWhere(mutable, tenantId);
            const create = mutable.create as MutableArgs | undefined;
            mutable.create = { ...(create ?? {}), tenantId };
          }
          return query(mutable as Parameters<typeof query>[0]);
        },
      },
    },
  });
}
