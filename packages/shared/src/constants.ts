// Shared constants used across services.

export const API_PREFIX = "/api/v1";

export const SOCKET_EVENTS = {
  CARD_MOVED: "card:moved",
  CARD_CREATED: "card:created",
  CARD_UPDATED: "card:updated",
  CALL_INCOMING: "call:incoming",
  CALL_ENDED: "call:ended",
  TRANSCRIPT_READY: "transcript:ready",
  ANALYSIS_STARTED: "analysis:started",
  ANALYSIS_READY: "analysis:ready",
  QA_READY: "qa:ready",
  SMS_STATUS: "sms:status",
  PIPELINE_UPDATED: "pipeline:updated",
} as const;

export const QUEUES = {
  STT: "stt",
  AI_ANALYSIS: "ai-analysis",
  QA: "qa",
  SMS_SEND: "sms-send",
  TRIGGER: "trigger",
} as const;

export const TENANT_HEADER = "x-tenant-id";
