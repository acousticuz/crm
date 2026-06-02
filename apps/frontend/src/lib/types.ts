// Shared frontend types mirroring the backend response shapes.

export type StageType = "NORMAL" | "WON" | "LOST";
export type CardStatus = "OPEN" | "WON" | "LOST";

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface Stage {
  id: string;
  name: string;
  order: number;
  color: string;
  type: StageType;
  pipelineId: string;
}

export interface Pipeline {
  id: string;
  name: string;
  isDefault: boolean;
  order: number;
  stages: Stage[];
}

export interface ContactSummary {
  id: string;
  fullName: string;
  phones: string[];
  email: string | null;
}

export interface UserSummary {
  id: string;
  fullName: string;
  email?: string;
}

export interface CardListItem {
  id: string;
  title: string;
  pipelineId: string;
  stageId: string;
  contactId: string;
  contact?: ContactSummary;
  responsible?: UserSummary | null;
  responsibleUserId?: string | null;
  branchId?: string | null;
  status: CardStatus;
  budget?: string | null;
  dueDate?: string | null;
  enteredStageAt: string;
  createdAt: string;
  cardTags: Array<{ cardId: string; tagId: string; tag: Tag }>;
  hasMissedCall?: boolean;
  // Most recent SmsLog summary so the column card can show "SMS yuborildi" badge
  // without a per-row fetch. Updated live via the sms:status socket event.
  lastSms?: {
    id: string;
    status: string;
    createdAt: string;
    sentAt: string | null;
  } | null;
}

export interface CardDetail extends CardListItem {
  contact: ContactSummary;
  notes: Array<{
    id: string;
    text: string;
    createdAt: string;
    author: UserSummary | null;
  }>;
  tasks: Array<{
    id: string;
    text: string;
    type: string;
    dueAt: string;
    completedAt: string | null;
    assignee: UserSummary | null;
  }>;
  calls: Array<{
    id: string;
    direction: "INBOUND" | "OUTBOUND";
    status: string;
    startedAt: string;
    duration: number;
  }>;
  smsLogs: Array<{
    id: string;
    text: string;
    status: string;
    phone: string;
    createdAt: string;
  }>;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
