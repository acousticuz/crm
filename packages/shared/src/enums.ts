// Enums shared between backend, workers, and frontend.
// These mirror the Prisma enums and must be kept in sync.

export enum UserRole {
  SUPER_ADMIN = "SUPER_ADMIN",
  TENANT_ADMIN = "TENANT_ADMIN",
  SUPERVISOR = "SUPERVISOR",
  OPERATOR = "OPERATOR",
  ANALYST = "ANALYST",
}

export enum TenantStatus {
  ACTIVE = "ACTIVE",
  SUSPENDED = "SUSPENDED",
  TRIAL = "TRIAL",
}

export enum UserStatus {
  ACTIVE = "ACTIVE",
  DISABLED = "DISABLED",
  INVITED = "INVITED",
}

export enum StageType {
  NORMAL = "NORMAL",
  WON = "WON",
  LOST = "LOST",
}

export enum CardStatus {
  OPEN = "OPEN",
  WON = "WON",
  LOST = "LOST",
}

export enum TaskType {
  CALL = "CALL",
  MEETING = "MEETING",
  FOLLOWUP = "FOLLOWUP",
  CUSTOM = "CUSTOM",
}

export enum CallDirection {
  INBOUND = "INBOUND",
  OUTBOUND = "OUTBOUND",
}

export enum CallStatus {
  ANSWERED = "ANSWERED",
  MISSED = "MISSED",
  BUSY = "BUSY",
  FAILED = "FAILED",
}

export enum SmsStatus {
  QUEUED = "QUEUED",
  SENT = "SENT",
  DELIVERED = "DELIVERED",
  FAILED = "FAILED",
}

export enum LeadStatus {
  UNSORTED = "UNSORTED",
  ACCEPTED = "ACCEPTED",
  REJECTED = "REJECTED",
}

export enum SupportedLanguage {
  UZ = "uz",
  RU = "ru",
  EN = "en",
}
