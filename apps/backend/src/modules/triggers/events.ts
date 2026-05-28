// Domain events emitted across services. Listed here so the trigger engine
// has a single source of truth for event names + payload shapes.

export const EVT = {
  CARD_CREATED: "domain.card.created",
  CARD_MOVED: "domain.card.moved",
  CARD_UPDATED: "domain.card.updated",
  TAG_ADDED: "domain.tag.added",
  TAG_REMOVED: "domain.tag.removed",
  LEAD_CREATED: "domain.lead.created",
} as const;

export type DomainEventName = (typeof EVT)[keyof typeof EVT];

export interface BaseEvent {
  tenantId: string;
  at: Date;
}

export interface CardCreatedEvent extends BaseEvent {
  cardId: string;
  pipelineId: string;
  stageId: string;
  contactId: string;
  source?: string | null;
}

export interface CardMovedEvent extends BaseEvent {
  cardId: string;
  pipelineId: string;
  fromStageId: string;
  toStageId: string;
  status: "OPEN" | "WON" | "LOST";
}

export interface TagChangedEvent extends BaseEvent {
  cardId: string;
  tagId: string;
}

export interface LeadCreatedEvent extends BaseEvent {
  leadId: string;
  source: string;
}
