// Cross-cutting domain types reused across services.

import type { UserRole } from "./enums";

export interface JwtPayload {
  sub: string;
  tenantId: string;
  role: UserRole;
  email: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface HealthCheckResponse {
  status: "ok" | "degraded" | "down";
  service: string;
  timestamp: string;
  uptimeSeconds: number;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TranscriptSegment {
  speaker: "operator" | "customer" | "unknown";
  start: number;
  end: number;
  text: string;
}

export interface QACriterionResult {
  criterionId: string;
  passed: boolean;
  score: number;
  evidence: string;
}
