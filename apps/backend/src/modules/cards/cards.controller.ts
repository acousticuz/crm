import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { UserRole } from "@acoustic-crm/shared";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { Audit } from "../../common/decorators/audit.decorator";
import { CardsService } from "./cards.service";
import { TagsService } from "../tags/tags.service";
import { CreateCardDto, FindCardsDto, MoveCardDto, UpdateCardDto } from "./dto/card.dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("cards")
export class CardsController {
  constructor(
    private readonly cards: CardsService,
    private readonly tags: TagsService,
  ) {}

  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR, UserRole.ANALYST)
  @Get()
  list(@Query() query: FindCardsDto) {
    return this.cards.list(query);
  }

  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR, UserRole.ANALYST)
  @Get(":id")
  get(@Param("id") id: string) {
    return this.cards.findById(id);
  }

  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR)
  @Post()
  @Audit({ action: "card.create", entityType: "Card", entityIdPath: "result.id" })
  create(@Body() dto: CreateCardDto) {
    return this.cards.create(dto);
  }

  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR)
  @Patch(":id")
  @Audit({ action: "card.update", entityType: "Card", entityIdPath: "params.id" })
  update(@Param("id") id: string, @Body() dto: UpdateCardDto) {
    return this.cards.update(id, dto);
  }

  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR)
  @Patch(":id/move")
  @HttpCode(HttpStatus.OK)
  @Audit({ action: "card.move", entityType: "Card", entityIdPath: "params.id" })
  move(@Param("id") id: string, @Body() dto: MoveCardDto) {
    return this.cards.move(id, dto);
  }

  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR)
  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  @Audit({ action: "card.delete", entityType: "Card", entityIdPath: "params.id" })
  remove(@Param("id") id: string) {
    return this.cards.softDelete(id);
  }

  // ===== Tags on card =====

  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR)
  @Post(":id/tags/:tagId")
  @HttpCode(HttpStatus.OK)
  @Audit({ action: "card.tag.attach", entityType: "Card", entityIdPath: "params.id" })
  attachTag(@Param("id") cardId: string, @Param("tagId") tagId: string) {
    return this.tags.attach(cardId, tagId);
  }

  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR)
  @Delete(":id/tags/:tagId")
  @HttpCode(HttpStatus.OK)
  @Audit({ action: "card.tag.detach", entityType: "Card", entityIdPath: "params.id" })
  detachTag(@Param("id") cardId: string, @Param("tagId") tagId: string) {
    return this.tags.detach(cardId, tagId);
  }
}
