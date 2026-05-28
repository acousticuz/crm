import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { PrismaService } from "../prisma/prisma.service";
import { TriggersService } from "./triggers.service";
import {
  EVT,
  type CardCreatedEvent,
  type CardMovedEvent,
  type LeadCreatedEvent,
  type TagChangedEvent,
} from "./events";

/**
 * Possible action shapes. Each action's `type` selects the handler; remaining
 * fields are action-specific. Unknown actions are logged and skipped.
 */
interface MoveCardAction {
  type: "move-card";
  pipelineId?: string;
  stageId: string;
}
interface AddTagAction {
  type: "add-tag";
  tagId: string;
}
interface RemoveTagAction {
  type: "remove-tag";
  tagId: string;
}
interface CreateTaskAction {
  type: "create-task";
  text: string;
  assigneeId: string;
  dueInDays?: number;
}
interface SmsAction {
  type: "sms";
  templateId?: string;
  text?: string;
}
type TriggerAction = MoveCardAction | AddTagAction | RemoveTagAction | CreateTaskAction | SmsAction;

/**
 * Optional callbacks injected by other modules. SmsModule registers a handler
 * during M5 so trigger SMS actions can call out without a circular import.
 */
export interface SmsTriggerHandler {
  sendFromTrigger(input: {
    tenantId: string;
    cardId?: string;
    contactId?: string;
    templateId?: string;
    text?: string;
  }): Promise<unknown>;
}

@Injectable()
export class TriggerEngine {
  private readonly logger = new Logger(TriggerEngine.name);
  private smsHandler: SmsTriggerHandler | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly triggers: TriggersService,
  ) {}

  /**
   * SmsModule (M5) calls this on init to register itself. We keep the
   * indirection so TriggersModule doesn't have to import SmsModule and risk a
   * circular dep — and so tests can omit SMS without stubbing.
   */
  registerSmsHandler(handler: SmsTriggerHandler): void {
    this.smsHandler = handler;
  }

  // ===== Event handlers =====

  @OnEvent(EVT.CARD_CREATED)
  async onCardCreated(evt: CardCreatedEvent): Promise<void> {
    await this.runTriggersFor({
      tenantId: evt.tenantId,
      eventType: "card.created",
      pipelineId: evt.pipelineId,
      cardId: evt.cardId,
      contactId: evt.contactId,
      source: evt.source ?? undefined,
    });
  }

  @OnEvent(EVT.CARD_MOVED)
  async onCardMoved(evt: CardMovedEvent): Promise<void> {
    await this.runTriggersFor({
      tenantId: evt.tenantId,
      eventType: "card.moved",
      pipelineId: evt.pipelineId,
      cardId: evt.cardId,
      stageId: evt.toStageId,
      extraEvent: { toStageId: evt.toStageId, fromStageId: evt.fromStageId },
    });
  }

  @OnEvent(EVT.TAG_ADDED)
  async onTagAdded(evt: TagChangedEvent): Promise<void> {
    await this.runTriggersFor({
      tenantId: evt.tenantId,
      eventType: "tag.added",
      cardId: evt.cardId,
      extraEvent: { tagId: evt.tagId },
    });
  }

  @OnEvent(EVT.TAG_REMOVED)
  async onTagRemoved(evt: TagChangedEvent): Promise<void> {
    await this.runTriggersFor({
      tenantId: evt.tenantId,
      eventType: "tag.removed",
      cardId: evt.cardId,
      extraEvent: { tagId: evt.tagId },
    });
  }

  @OnEvent(EVT.LEAD_CREATED)
  async onLeadCreated(evt: LeadCreatedEvent): Promise<void> {
    await this.runTriggersFor({
      tenantId: evt.tenantId,
      eventType: "lead.created",
      extraEvent: { leadId: evt.leadId, source: evt.source },
    });
  }

  // ===== Engine core =====

  private async runTriggersFor(ctx: {
    tenantId: string;
    eventType: string;
    pipelineId?: string;
    cardId?: string;
    stageId?: string;
    contactId?: string;
    source?: string;
    extraEvent?: Record<string, unknown>;
  }): Promise<void> {
    const candidates = await this.triggers.findActiveByEvent({
      tenantId: ctx.tenantId,
      eventType: ctx.eventType,
      pipelineId: ctx.pipelineId,
    });
    for (const trigger of candidates) {
      const evtCfg = trigger.event as { type?: string; stageId?: string; tagId?: string } | null;
      if (!evtCfg || evtCfg.type !== ctx.eventType) continue;
      // Event-type-specific narrow filters (stored on the trigger itself).
      if (evtCfg.stageId && ctx.stageId && evtCfg.stageId !== ctx.stageId) continue;
      if (evtCfg.tagId && (ctx.extraEvent?.tagId as string | undefined) !== evtCfg.tagId) continue;

      const conditionsOk = await this.evaluateConditions(
        trigger.conditions as Record<string, unknown> | null,
        ctx,
      );
      if (!conditionsOk) continue;

      const actions = (trigger.actions as TriggerAction[] | null) ?? [];
      for (const action of actions) {
        try {
          await this.executeAction(action, ctx);
        } catch (err) {
          this.logger.error(
            `Trigger ${trigger.id} action ${action.type} failed: ${(err as Error).message}`,
          );
        }
      }
    }
  }

  private async evaluateConditions(
    conditions: Record<string, unknown> | null,
    ctx: { tenantId: string; cardId?: string; source?: string },
  ): Promise<boolean> {
    if (!conditions || Object.keys(conditions).length === 0) return true;
    if (conditions.source && ctx.source !== conditions.source) return false;
    if (!ctx.cardId) {
      // Card-derived conditions can't be evaluated without a card.
      return true;
    }
    const card = await this.prisma.card.findFirst({
      where: { id: ctx.cardId, tenantId: ctx.tenantId, deletedAt: null },
      include: { cardTags: true, contact: true },
    });
    if (!card) return false;
    if (conditions.branchId && card.branchId !== conditions.branchId) return false;
    if (
      conditions.responsibleUserId &&
      card.responsibleUserId !== conditions.responsibleUserId
    ) {
      return false;
    }
    if (
      typeof conditions.hasTagId === "string" &&
      !card.cardTags.some((ct) => ct.tagId === conditions.hasTagId)
    ) {
      return false;
    }
    if (typeof conditions.budgetMin === "number") {
      if (!card.budget || Number(card.budget) < conditions.budgetMin) return false;
    }
    if (typeof conditions.budgetMax === "number") {
      if (!card.budget || Number(card.budget) > conditions.budgetMax) return false;
    }
    return true;
  }

  private async executeAction(
    action: TriggerAction,
    ctx: { tenantId: string; cardId?: string; contactId?: string },
  ): Promise<void> {
    switch (action.type) {
      case "move-card": {
        if (!ctx.cardId) return;
        const card = await this.prisma.card.findFirst({
          where: { id: ctx.cardId, tenantId: ctx.tenantId, deletedAt: null },
        });
        if (!card) return;
        const stage = await this.prisma.stage.findFirst({
          where: {
            id: action.stageId,
            tenantId: ctx.tenantId,
            pipelineId: action.pipelineId ?? card.pipelineId,
            deletedAt: null,
          },
        });
        if (!stage) return;
        await this.prisma.card.update({
          where: { id: card.id },
          data: {
            stageId: stage.id,
            pipelineId: stage.pipelineId,
            enteredStageAt: new Date(),
            status:
              stage.type === "WON" ? "WON" : stage.type === "LOST" ? "LOST" : "OPEN",
          },
        });
        return;
      }
      case "add-tag": {
        if (!ctx.cardId) return;
        await this.prisma.cardTag.upsert({
          where: { cardId_tagId: { cardId: ctx.cardId, tagId: action.tagId } },
          create: { cardId: ctx.cardId, tagId: action.tagId },
          update: {},
        });
        return;
      }
      case "remove-tag": {
        if (!ctx.cardId) return;
        await this.prisma.cardTag.deleteMany({
          where: { cardId: ctx.cardId, tagId: action.tagId },
        });
        return;
      }
      case "create-task": {
        const days = action.dueInDays ?? 1;
        await this.prisma.task.create({
          data: {
            tenantId: ctx.tenantId,
            cardId: ctx.cardId ?? null,
            contactId: ctx.contactId ?? null,
            assigneeId: action.assigneeId,
            text: action.text,
            type: "FOLLOWUP",
            dueAt: new Date(Date.now() + days * 86_400_000),
          },
        });
        return;
      }
      case "sms": {
        if (!this.smsHandler) {
          this.logger.warn("SMS action skipped — SmsModule not registered (M5)");
          return;
        }
        await this.smsHandler.sendFromTrigger({
          tenantId: ctx.tenantId,
          cardId: ctx.cardId,
          contactId: ctx.contactId,
          templateId: action.templateId,
          text: action.text,
        });
        return;
      }
      default:
        this.logger.warn(
          `Unknown trigger action type: ${(action as { type: string }).type}`,
        );
    }
  }
}
