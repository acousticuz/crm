import { Injectable, UnauthorizedException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ClsService } from "nestjs-cls";
import { readContext } from "../../common/tenant-context";
import { PrismaService } from "../prisma/prisma.service";
import { AnalyticsRangeDto, TrendQueryDto, WeakestCriteriaQueryDto } from "./dto/analytics.dto";

interface CriterionResult {
  criterionId: string;
  passed: boolean;
  score: number;
  evidence: string;
}

export interface OperatorKpi {
  userId: string | null;
  fullName?: string;
  // PJSIP extension surfaced alongside the name so reports can display
  // "Aziz (101)" rather than a CUID — supervisors recognize voices by
  // extension first.
  extension?: string | null;
  callsInbound: number;
  callsOutbound: number;
  callsMissed: number;
  avgDurationSec: number;
  avgQaScore: number; // 0..100 (normalized to percent)
  scriptAdherencePct: number; // average pass rate across all criteria
  conversionPct: number; // WON cards / OPEN+WON+LOST cards in period
  sentiment: { positive: number; neutral: number; negative: number; mixed: number };
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  private currentTenantId(): string {
    const tid = readContext(this.cls).tenantId;
    if (!tid) throw new UnauthorizedException("No tenant context");
    return tid;
  }

  private rangeWhere(q: AnalyticsRangeDto, field: "createdAt" | "startedAt" = "createdAt") {
    const where: Prisma.DateTimeFilter = {};
    if (q.from) where.gte = new Date(q.from);
    if (q.to) where.lte = new Date(q.to);
    return Object.keys(where).length === 0 ? undefined : { [field]: where };
  }

  // ===== Operator KPI =====

  async operatorKpi(query: AnalyticsRangeDto): Promise<OperatorKpi> {
    const tenantId = this.currentTenantId();
    const operatorWhere = query.userId ? { operatorId: query.userId } : {};
    const dateWhere = this.rangeWhere(query, "startedAt") ?? {};

    const [inbound, outbound, missed, durationAgg, calls] = await Promise.all([
      this.prisma.call.count({
        where: { tenantId, deletedAt: null, direction: "INBOUND", status: "ANSWERED", ...operatorWhere, ...dateWhere },
      }),
      this.prisma.call.count({
        where: { tenantId, deletedAt: null, direction: "OUTBOUND", status: "ANSWERED", ...operatorWhere, ...dateWhere },
      }),
      this.prisma.call.count({
        where: { tenantId, deletedAt: null, status: "MISSED", ...operatorWhere, ...dateWhere },
      }),
      this.prisma.call.aggregate({
        where: { tenantId, deletedAt: null, status: "ANSWERED", ...operatorWhere, ...dateWhere },
        _avg: { duration: true },
      }),
      this.prisma.call.findMany({
        where: { tenantId, deletedAt: null, ...operatorWhere, ...dateWhere },
        select: { id: true },
      }),
    ]);

    const callIds = calls.map((c) => c.id);
    // QA + analysis aggregates joined via callId.
    const [qaScores, analyses, cards] = await Promise.all([
      callIds.length === 0
        ? []
        : this.prisma.qAScore.findMany({
            where: { callId: { in: callIds } },
            select: { totalScore: true, maxScore: true, criteriaResults: true },
          }),
      callIds.length === 0
        ? []
        : this.prisma.analysis.findMany({
            where: { callId: { in: callIds } },
            select: { sentiment: true },
          }),
      this.prisma.card.findMany({
        where: {
          tenantId,
          deletedAt: null,
          ...(query.userId ? { responsibleUserId: query.userId } : {}),
          ...(this.rangeWhere(query, "createdAt") ?? {}),
        },
        select: { status: true },
      }),
    ]);

    // Average normalized QA score (0..100). For each QAScore: (total/max)*100.
    const qaPctValues = qaScores
      .filter((q) => q.maxScore > 0)
      .map((q) => (q.totalScore / q.maxScore) * 100);
    const avgQaScore = avg(qaPctValues);

    // Script adherence = pct of criteria passed across all rubrics.
    let passedCount = 0;
    let totalCount = 0;
    for (const q of qaScores) {
      const arr = q.criteriaResults as unknown as CriterionResult[] | null;
      if (!Array.isArray(arr)) continue;
      for (const r of arr) {
        totalCount += 1;
        if (r.passed) passedCount += 1;
      }
    }
    const scriptAdherencePct = totalCount === 0 ? 0 : (passedCount / totalCount) * 100;

    // Conversion = WON cards / (WON + LOST cards). Open cards aren't counted.
    const closedCards = cards.filter((c) => c.status === "WON" || c.status === "LOST");
    const wonCards = cards.filter((c) => c.status === "WON");
    const conversionPct =
      closedCards.length === 0 ? 0 : (wonCards.length / closedCards.length) * 100;

    // Sentiment split.
    const sentiment = { positive: 0, neutral: 0, negative: 0, mixed: 0 };
    for (const a of analyses) {
      const key = (a.sentiment ?? "neutral") as keyof typeof sentiment;
      if (sentiment[key] !== undefined) sentiment[key] += 1;
    }

    let fullName: string | undefined;
    let extension: string | null | undefined;
    if (query.userId) {
      const u = await this.prisma.user.findFirst({
        where: { id: query.userId, tenantId, deletedAt: null },
        select: { fullName: true, extension: true },
      });
      fullName = u?.fullName;
      extension = u?.extension ?? null;
    }

    return {
      userId: query.userId ?? null,
      fullName,
      extension,
      callsInbound: inbound,
      callsOutbound: outbound,
      callsMissed: missed,
      avgDurationSec: Math.round(durationAgg._avg.duration ?? 0),
      avgQaScore: round(avgQaScore, 1),
      scriptAdherencePct: round(scriptAdherencePct, 1),
      conversionPct: round(conversionPct, 1),
      sentiment,
    };
  }

  // ===== Team (per-operator) =====

  async teamSummary(query: AnalyticsRangeDto) {
    const tenantId = this.currentTenantId();
    const ops = await this.prisma.user.findMany({
      where: {
        tenantId,
        deletedAt: null,
        role: { in: ["OPERATOR", "SUPERVISOR"] },
        ...(query.branchId ? { branchId: query.branchId } : {}),
      },
      select: { id: true, fullName: true, extension: true, branchId: true },
    });
    const rows = await Promise.all(
      ops.map(async (op) => {
        const kpi = await this.operatorKpi({ ...query, userId: op.id });
        return {
          ...kpi,
          fullName: op.fullName,
          extension: op.extension,
          branchId: op.branchId,
        };
      }),
    );
    return { items: rows };
  }

  // ===== Branch monthly report =====

  /**
   * Per-branch funnel for one calendar month: how many distinct numbers
   * (leads) the branch received, how many cards moved to a WON stage, how
   * many to LOST, and the conversion %. Branch is taken from Call.branchId
   * (the customer-asked-for branch, set manually per call) — distinct from
   * the operator's home branch.
   *
   * `month` is "YYYY-MM" in the server's local timezone. Defaults to current.
   */
  async branchMonthlyReport(input: { month?: string }) {
    const tenantId = this.currentTenantId();
    const { start, end, monthKey } = monthRange(input.month);

    const branches = await this.prisma.branch.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    const calls = await this.prisma.call.findMany({
      where: {
        tenantId,
        deletedAt: null,
        branchId: { not: null },
        startedAt: { gte: start, lt: end },
      },
      select: {
        id: true,
        branchId: true,
        fromNumber: true,
        toNumber: true,
        direction: true,
        cardId: true,
        card: { select: { id: true, status: true } },
      },
    });

    const rows = branches.map((b) => {
      const branchCalls = calls.filter((c) => c.branchId === b.id);
      const uniqueNumbers = new Set(
        branchCalls.map((c) => (c.direction === "INBOUND" ? c.fromNumber : c.toNumber)),
      );
      const cards = new Map<string, "OPEN" | "WON" | "LOST">();
      for (const c of branchCalls) {
        if (c.cardId && c.card) cards.set(c.cardId, c.card.status as "OPEN" | "WON" | "LOST");
      }
      let won = 0;
      let lost = 0;
      let open = 0;
      for (const status of cards.values()) {
        if (status === "WON") won += 1;
        else if (status === "LOST") lost += 1;
        else open += 1;
      }
      const closed = won + lost;
      return {
        branchId: b.id,
        name: b.name,
        calls: branchCalls.length,
        uniqueLeads: uniqueNumbers.size,
        cards: cards.size,
        won,
        lost,
        open,
        conversionPct: closed === 0 ? 0 : round((won / closed) * 100, 1),
      };
    });
    return { month: monthKey, items: rows };
  }

  // ===== Operator coaching aggregation =====

  /**
   * Aggregates a supervisor's coaching view for one operator over a period:
   * avg QA, weakest 3 script sections, top 5 most-common mistakes from
   * Analysis.mistakes, and a per-week trend. Designed for a single-operator
   * drilldown page.
   */
  async coachingForOperator(input: {
    operatorId: string;
    from?: string;
    to?: string;
  }) {
    const tenantId = this.currentTenantId();
    const dateWhere: Prisma.DateTimeFilter = {};
    if (input.from) dateWhere.gte = new Date(input.from);
    if (input.to) dateWhere.lte = new Date(input.to);
    const hasDate = Object.keys(dateWhere).length > 0;

    const user = await this.prisma.user.findFirst({
      where: { id: input.operatorId, tenantId, deletedAt: null },
      select: { id: true, fullName: true, extension: true, branchId: true },
    });
    if (!user) {
      throw new UnauthorizedException("Operator topilmadi");
    }

    const calls = await this.prisma.call.findMany({
      where: {
        tenantId,
        deletedAt: null,
        operatorId: input.operatorId,
        ...(hasDate ? { startedAt: dateWhere } : {}),
      },
      select: {
        id: true,
        startedAt: true,
        analysis: { select: { mistakes: true } },
        qaScores: { select: { totalScore: true, maxScore: true, criteriaResults: true } },
      },
    });

    // Avg QA score.
    let qaSum = 0;
    let qaN = 0;
    for (const c of calls) {
      for (const q of c.qaScores) {
        if (q.maxScore > 0) {
          qaSum += (q.totalScore / q.maxScore) * 100;
          qaN += 1;
        }
      }
    }
    const avgQaScore = qaN === 0 ? 0 : round(qaSum / qaN, 1);

    // Weakest sections — aggregate per-criterion pass rate, then group by
    // section using the tenant's scripts as metadata.
    const scripts = await this.prisma.script.findMany({
      where: { tenantId, deletedAt: null },
      select: { criteria: true },
    });
    const sectionOf = new Map<string, string>();
    const textOf = new Map<string, string>();
    for (const s of scripts) {
      const arr =
        (s.criteria as unknown as Array<{ id: string; section: string; text: string }>) ?? [];
      for (const c of arr) {
        sectionOf.set(c.id, c.section);
        textOf.set(c.id, c.text);
      }
    }
    const sectionStats = new Map<string, { passed: number; total: number }>();
    for (const c of calls) {
      for (const q of c.qaScores) {
        const arr = q.criteriaResults as unknown as CriterionResult[] | null;
        if (!Array.isArray(arr)) continue;
        for (const r of arr) {
          const section = sectionOf.get(r.criterionId) ?? "?";
          const s = sectionStats.get(section) ?? { passed: 0, total: 0 };
          s.total += 1;
          if (r.passed) s.passed += 1;
          sectionStats.set(section, s);
        }
      }
    }
    const sections = Array.from(sectionStats.entries()).map(([section, s]) => ({
      section,
      passRate: s.total === 0 ? 0 : round((s.passed / s.total) * 100, 1),
      samples: s.total,
    }));
    const weakestSections = [...sections]
      .filter((s) => s.samples > 0)
      .sort((a, b) => a.passRate - b.passRate)
      .slice(0, 3);

    // Top mistakes — count by message+section. Severity carried for sort tiebreak.
    const mistakeCounts = new Map<
      string,
      { section: string; message: string; severity: string; count: number }
    >();
    for (const c of calls) {
      const arr =
        (c.analysis?.mistakes as unknown as Array<{
          section: string;
          message: string;
          severity: string;
        }>) ?? [];
      for (const m of arr) {
        const key = `${m.section}::${m.message}`;
        const entry = mistakeCounts.get(key) ?? {
          section: m.section,
          message: m.message,
          severity: m.severity ?? "medium",
          count: 0,
        };
        entry.count += 1;
        mistakeCounts.set(key, entry);
      }
    }
    const topMistakes = Array.from(mistakeCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Weekly QA trend (ISO week-of-year).
    const weekBuckets = new Map<string, { qaSum: number; qaN: number; calls: number }>();
    for (const c of calls) {
      const wk = isoWeekKey(c.startedAt);
      const b = weekBuckets.get(wk) ?? { qaSum: 0, qaN: 0, calls: 0 };
      b.calls += 1;
      for (const q of c.qaScores) {
        if (q.maxScore > 0) {
          b.qaSum += (q.totalScore / q.maxScore) * 100;
          b.qaN += 1;
        }
      }
      weekBuckets.set(wk, b);
    }
    const trend = Array.from(weekBuckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, b]) => ({
        week,
        calls: b.calls,
        avgQaScore: b.qaN === 0 ? 0 : round(b.qaSum / b.qaN, 1),
      }));

    return {
      operator: { id: user.id, fullName: user.fullName, extension: user.extension },
      totalCalls: calls.length,
      avgQaScore,
      weakestSections,
      topMistakes,
      trend,
    };
  }

  // ===== Branch summary =====

  async branchSummary(query: AnalyticsRangeDto) {
    const tenantId = this.currentTenantId();
    const branches = await this.prisma.branch.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, name: true },
    });
    const rows = await Promise.all(
      branches.map(async (b) => {
        const kpi = await this.operatorKpi({ ...query, branchId: b.id });
        return { branchId: b.id, name: b.name, ...kpi };
      }),
    );
    return { items: rows };
  }

  // ===== Weakest / strongest criteria — coaching surface =====

  async weakestCriteria(query: WeakestCriteriaQueryDto) {
    const tenantId = this.currentTenantId();
    const limit = query.limit ?? 5;
    const scriptsByCriterion = new Map<string, { passed: number; total: number; text: string; section: string }>();

    const scripts = await this.prisma.script.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, criteria: true },
    });
    const criterionMeta = new Map<string, { text: string; section: string }>();
    for (const s of scripts) {
      const arr = (s.criteria as unknown as Array<{ id: string; text: string; section: string }>) ?? [];
      for (const c of arr) {
        criterionMeta.set(c.id, { text: c.text, section: c.section });
      }
    }

    const qaScores = await this.prisma.qAScore.findMany({
      where: {
        script: { tenantId },
        ...(query.from || query.to
          ? {
              createdAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
      },
      select: { criteriaResults: true },
    });

    for (const q of qaScores) {
      const arr = q.criteriaResults as unknown as CriterionResult[] | null;
      if (!Array.isArray(arr)) continue;
      for (const r of arr) {
        const meta = criterionMeta.get(r.criterionId) ?? { text: r.criterionId, section: "?" };
        const existing = scriptsByCriterion.get(r.criterionId) ?? {
          passed: 0,
          total: 0,
          text: meta.text,
          section: meta.section,
        };
        existing.total += 1;
        if (r.passed) existing.passed += 1;
        scriptsByCriterion.set(r.criterionId, existing);
      }
    }

    const all = Array.from(scriptsByCriterion.entries()).map(([id, v]) => ({
      criterionId: id,
      text: v.text,
      section: v.section,
      passRate: v.total === 0 ? 0 : round((v.passed / v.total) * 100, 1),
      samples: v.total,
    }));
    const weakest = [...all].sort((a, b) => a.passRate - b.passRate).slice(0, limit);
    const strongest = [...all].sort((a, b) => b.passRate - a.passRate).slice(0, limit);
    return { weakest, strongest, totalCriteria: all.length };
  }

  // ===== Trends over time =====

  async trends(query: TrendQueryDto) {
    const tenantId = this.currentTenantId();
    const groupBy = query.groupBy ?? "day";
    const dateField = "startedAt";
    const calls = await this.prisma.call.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(query.userId ? { operatorId: query.userId } : {}),
        ...(this.rangeWhere(query, dateField) ?? {}),
      },
      select: {
        id: true,
        direction: true,
        status: true,
        duration: true,
        startedAt: true,
        analysis: { select: { sentiment: true } },
        qaScores: { select: { totalScore: true, maxScore: true } },
      },
      orderBy: { startedAt: "asc" },
    });

    const buckets = new Map<
      string,
      {
        callsInbound: number;
        callsOutbound: number;
        callsMissed: number;
        avgDurationSec: number;
        durationSum: number;
        durationN: number;
        avgQaScore: number;
        qaSum: number;
        qaN: number;
        positive: number;
        negative: number;
        neutral: number;
        mixed: number;
      }
    >();
    for (const c of calls) {
      const key = bucketKey(c.startedAt, groupBy);
      const b =
        buckets.get(key) ??
        {
          callsInbound: 0,
          callsOutbound: 0,
          callsMissed: 0,
          avgDurationSec: 0,
          durationSum: 0,
          durationN: 0,
          avgQaScore: 0,
          qaSum: 0,
          qaN: 0,
          positive: 0,
          negative: 0,
          neutral: 0,
          mixed: 0,
        };
      if (c.status === "MISSED") b.callsMissed += 1;
      else if (c.direction === "INBOUND") b.callsInbound += 1;
      else if (c.direction === "OUTBOUND") b.callsOutbound += 1;
      if (c.duration > 0) {
        b.durationSum += c.duration;
        b.durationN += 1;
      }
      for (const q of c.qaScores) {
        if (q.maxScore > 0) {
          b.qaSum += (q.totalScore / q.maxScore) * 100;
          b.qaN += 1;
        }
      }
      const sent = c.analysis?.sentiment as keyof typeof sentimentKeys | null | undefined;
      if (sent && sent in sentimentKeys) {
        (b as unknown as Record<string, number>)[sent] += 1;
      }
      buckets.set(key, b);
    }
    const series = Array.from(buckets.entries())
      .map(([key, b]) => ({
        bucket: key,
        callsInbound: b.callsInbound,
        callsOutbound: b.callsOutbound,
        callsMissed: b.callsMissed,
        avgDurationSec: b.durationN === 0 ? 0 : Math.round(b.durationSum / b.durationN),
        avgQaScore: b.qaN === 0 ? 0 : round(b.qaSum / b.qaN, 1),
        sentiment: { positive: b.positive, neutral: b.neutral, negative: b.negative, mixed: b.mixed },
      }))
      .sort((a, b) => a.bucket.localeCompare(b.bucket));
    return { groupBy, items: series };
  }
}

const sentimentKeys = { positive: 1, neutral: 1, negative: 1, mixed: 1 } as const;

function avg(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function bucketKey(date: Date, groupBy: "day" | "week"): string {
  const d = new Date(date);
  if (groupBy === "week") {
    // ISO week start (Monday).
    const day = d.getUTCDay();
    const diff = (day + 6) % 7; // days since Monday
    d.setUTCDate(d.getUTCDate() - diff);
  }
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

/**
 * Parse "YYYY-MM" → [start, end) of the month in UTC. Defaults to the
 * current month so the report endpoint can be hit without a query param.
 */
function monthRange(month?: string): { start: Date; end: Date; monthKey: string } {
  const now = new Date();
  let y = now.getUTCFullYear();
  let m = now.getUTCMonth(); // 0-indexed
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [ys, ms] = month.split("-");
    y = Number(ys);
    m = Number(ms) - 1;
  }
  const start = new Date(Date.UTC(y, m, 1));
  const end = new Date(Date.UTC(y, m + 1, 1));
  const monthKey = `${y}-${String(m + 1).padStart(2, "0")}`;
  return { start, end, monthKey };
}

/**
 * ISO week key like "2026-W23". Stable sort + human-readable for the
 * coaching report's weekly trend.
 */
function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Shift to Thursday of the same ISO week — ISO weeks are defined by it.
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}
