import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Observable, tap } from "rxjs";
import type { Request } from "express";
import { AUDIT_KEY, type AuditMetadata } from "../../common/decorators/audit.decorator";
import { AuditService } from "./audit.service";

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AuditMetadata | undefined>(AUDIT_KEY, ctx.getHandler());
    if (!meta) {
      return next.handle();
    }
    const req = ctx.switchToHttp().getRequest<Request>();
    return next.handle().pipe(
      tap((result) => {
        const entityId = this.extractId(meta.entityIdPath, { req, result }) ?? "unknown";
        void this.audit.log({
          action: meta.action,
          entityType: meta.entityType,
          entityId,
          details: { method: req.method, path: req.originalUrl ?? req.url },
        });
      }),
    );
  }

  private extractId(
    path: string | undefined,
    sources: { req: Request; result: unknown },
  ): string | null {
    if (!path) return null;
    // path examples: "params.id", "body.tenantId", "result.tenantId"
    const [root, ...rest] = path.split(".");
    let cursor: unknown;
    if (root === "params") cursor = sources.req.params;
    else if (root === "body") cursor = sources.req.body;
    else if (root === "result") cursor = sources.result;
    else return null;
    for (const key of rest) {
      if (cursor && typeof cursor === "object" && key in (cursor as Record<string, unknown>)) {
        cursor = (cursor as Record<string, unknown>)[key];
      } else {
        return null;
      }
    }
    return typeof cursor === "string" ? cursor : null;
  }
}
