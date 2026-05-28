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
import { CallsService } from "./calls.service";
import { WorkerGuard } from "./worker.guard";
import {
  CallCompletedDto,
  CallIncomingDto,
  OriginateCallDto,
} from "./dto/call.dto";

@Controller()
export class CallsController {
  constructor(private readonly calls: CallsService) {}

  // ===== Internal worker endpoints — guarded by shared secret, not JWT =====

  @Public()
  @UseGuards(WorkerGuard)
  @Post("internal/calls/incoming")
  @HttpCode(HttpStatus.OK)
  incoming(@Body() dto: CallIncomingDto) {
    return this.calls.incoming(dto);
  }

  @Public()
  @UseGuards(WorkerGuard)
  @Post("internal/calls/completed")
  @HttpCode(HttpStatus.OK)
  completed(@Body() dto: CallCompletedDto) {
    return this.calls.completed(dto);
  }

  // ===== Operator endpoints =====

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR)
  @Post("calls/originate")
  @HttpCode(HttpStatus.ACCEPTED)
  @Audit({
    action: "call.originate",
    entityType: "Call",
    entityIdPath: "result.cdrUniqueId",
  })
  originate(@Body() dto: OriginateCallDto) {
    return this.calls.originate(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR, UserRole.ANALYST)
  @Get("calls")
  list(@Query("cardId") cardId?: string, @Query("contactId") contactId?: string) {
    if (cardId) return this.calls.listByCard(cardId);
    if (contactId) return this.calls.listByContact(contactId);
    return [];
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR, UserRole.ANALYST)
  @Get("calls/:id")
  get(@Param("id") id: string) {
    return this.calls.findById(id);
  }
}
