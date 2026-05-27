import { SetMetadata } from "@nestjs/common";

export interface AuditMetadata {
  action: string;
  entityType: string;
  // Param/body path to extract the entity id from; e.g. "params.id" or "body.tenantId".
  entityIdPath?: string;
}

export const AUDIT_KEY = "audit";
export const Audit = (meta: AuditMetadata): MethodDecorator =>
  SetMetadata(AUDIT_KEY, meta);
