import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { UserRole } from "@acoustic-crm/shared";
import { Public } from "../../common/decorators/public.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { Audit } from "../../common/decorators/audit.decorator";
import { InboxService } from "./inbox.service";
import { InboxWebhookGuard } from "./inbox-webhook.guard";
import {
  ApproveDraftDto,
  InboxWebhookDto,
  ListThreadsQueryDto,
  RejectDraftDto,
  SendManualMessageDto,
} from "./dto/inbox.dto";

@Controller()
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  // ===== Public webhook =====

  @Public()
  @UseGuards(InboxWebhookGuard)
  @Post("internal/inbox/webhook/:tenantId/:channel")
  @HttpCode(HttpStatus.OK)
  webhook(
    @Param("tenantId") tenantId: string,
    @Param("channel") channel: string,
    @Body() dto: InboxWebhookDto,
  ) {
    return this.inbox.ingestWebhook(tenantId, channel, dto);
  }

  // ===== Operator endpoints =====

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR, UserRole.ANALYST)
  @Get("inbox/threads")
  listThreads(@Query() query: ListThreadsQueryDto) {
    return this.inbox.listThreads(query);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR, UserRole.ANALYST)
  @Get("inbox/threads/:id")
  getThread(@Param("id") id: string) {
    return this.inbox.getThread(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR)
  @Get("inbox/pending-drafts")
  pendingDrafts() {
    return this.inbox.pendingDrafts();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR)
  @Post("inbox/messages/:id/approve")
  @HttpCode(HttpStatus.OK)
  @Audit({ action: "inbox.message.approve", entityType: "InboxMessage", entityIdPath: "params.id" })
  approve(@Param("id") id: string, @Body() dto: ApproveDraftDto) {
    return this.inbox.approveDraft(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR)
  @Post("inbox/messages/:id/reject")
  @HttpCode(HttpStatus.OK)
  @Audit({ action: "inbox.message.reject", entityType: "InboxMessage", entityIdPath: "params.id" })
  reject(@Param("id") id: string, @Body() dto: RejectDraftDto) {
    return this.inbox.rejectDraft(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR)
  @Post("inbox/threads/:id/messages")
  @HttpCode(HttpStatus.CREATED)
  @Audit({ action: "inbox.message.send", entityType: "InboxThread", entityIdPath: "params.id" })
  sendManual(@Param("id") id: string, @Body() dto: SendManualMessageDto) {
    return this.inbox.sendManual(id, dto);
  }
}
