import { Injectable } from "@nestjs/common";

/**
 * In-memory token-bucket-ish rate limiter scoped per (tenantId, phone). For
 * production we'd back this with Redis; for M5 in-process is enough — the
 * limit is conservative so a single sender bursting is what we care about.
 *
 * Window: 60 seconds.
 * Limit per phone: 3 (anti-spam — same number can't be hammered)
 * Limit per tenant: 60 (anti-abuse — caps total throughput)
 */
const WINDOW_MS = 60_000;
const PER_PHONE = 3;
const PER_TENANT = 60;

@Injectable()
export class SmsRateLimiter {
  private hits = new Map<string, number[]>();

  /** Returns true if allowed; false if rate-limited. */
  check(tenantId: string, phone: string): boolean {
    const now = Date.now();
    return (
      this.bump(`p:${tenantId}:${phone}`, PER_PHONE, now) &&
      this.bump(`t:${tenantId}`, PER_TENANT, now)
    );
  }

  /** Test helper to clear the table between specs. */
  reset(): void {
    this.hits.clear();
  }

  private bump(key: string, max: number, now: number): boolean {
    const arr = this.hits.get(key) ?? [];
    const cutoff = now - WINDOW_MS;
    const trimmed = arr.filter((t) => t > cutoff);
    if (trimmed.length >= max) {
      this.hits.set(key, trimmed);
      return false;
    }
    trimmed.push(now);
    this.hits.set(key, trimmed);
    return true;
  }
}
