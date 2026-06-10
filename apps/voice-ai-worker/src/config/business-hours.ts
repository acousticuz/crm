/**
 * Business-hours helper. The dialplan's Time Condition is the source of truth
 * for whether a call should be AI-answered or queued to a human — but we also
 * check here so the agent can recommend the right call-back window in its
 * "xodimimiz ertaga soat 9 dan boshlab bog'lanadi" line.
 *
 * Acoustic schedule (env-overridable):
 *   - Monday..Saturday 09:00–18:00 Asia/Tashkent
 *   - Sunday: closed
 */

export interface BusinessHoursConfig {
  startHour: number;
  endHour: number;
  /** Day-of-week numbers (0=Sun ... 6=Sat) when staff is on duty. */
  openDays: Set<number>;
  /** IANA timezone (`Asia/Tashkent` for Uzbekistan). */
  timezone: string;
}

export function defaultBusinessHours(): BusinessHoursConfig {
  return {
    startHour: Number(process.env.BUSINESS_HOURS_START ?? 9),
    endHour: Number(process.env.BUSINESS_HOURS_END ?? 18),
    openDays: parseOpenDays(process.env.BUSINESS_DAYS ?? "1,2,3,4,5,6"),
    timezone: process.env.BUSINESS_TZ ?? "Asia/Tashkent",
  };
}

export function isOpenNow(cfg: BusinessHoursConfig = defaultBusinessHours(), at = new Date()): boolean {
  const local = atTz(at, cfg.timezone);
  if (!cfg.openDays.has(local.weekday)) return false;
  return local.hour >= cfg.startHour && local.hour < cfg.endHour;
}

function parseOpenDays(spec: string): Set<number> {
  const out = new Set<number>();
  for (const piece of spec.split(",")) {
    const n = Number(piece.trim());
    if (Number.isFinite(n) && n >= 0 && n <= 6) out.add(n);
  }
  return out;
}

function atTz(date: Date, tz: string): { hour: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    hour12: false,
    weekday: "short",
  });
  const parts = fmt.formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const weekdayLabel = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const map: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return { hour, weekday: map[weekdayLabel] ?? 0 };
}
