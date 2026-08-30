import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Meter } from "@/components/ui/meter";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/hooks/useTheme";
import { Link } from "react-router-dom";
import { tokenColor } from "@/lib/tokens";
import {
  useBranches,
  useBranchesMonthly,
  useOperatorKpi,
  useTeam,
  useTrends,
  useWeakestCriteria,
} from "@/hooks/useAnalytics";

const ROLE_SUPERVISOR_OR_BETTER = ["TENANT_ADMIN", "SUPERVISOR", "ANALYST"];

/** Resolve chart colors from CSS variables and re-read them whenever the
 *  theme flips so recharts re-themes alongside the rest of the UI. The hook
 *  depends on the live theme value from useTheme(), which fires a re-render
 *  on every toggle. */
function useChartTokens() {
  const { theme } = useTheme();
  const [palette, setPalette] = useState({
    primary: "#1f6b7a",
    success: "#3aa17e",
    info: "#3083c2",
    warning: "#d68b1e",
    destructive: "#cc4040",
    muted: "#6a7587",
    grid: "#dcd9d2",
    foreground: "#1b2433",
  });
  useEffect(() => {
    setPalette({
      primary: tokenColor("--primary"),
      success: tokenColor("--success"),
      info: tokenColor("--info"),
      warning: tokenColor("--warning"),
      destructive: tokenColor("--destructive"),
      muted: tokenColor("--muted-foreground"),
      grid: tokenColor("--border"),
      foreground: tokenColor("--foreground"),
    });
  }, [theme]);
  return palette;
}

export function DashboardPage(): JSX.Element {
  const { user } = useAuth();
  const isSupervisor = !!user && ROLE_SUPERVISOR_OR_BETTER.includes(user.role);
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const range = useMemo(() => ({ from: from || undefined, to: to || undefined }), [from, to]);

  const { data: myKpi } = useOperatorKpi(range);
  const { data: trends } = useTrends({ ...range, groupBy: "day" });
  const { data: team } = useTeam(range);
  const { data: branches } = useBranches(range);
  const { data: branchesMonthly } = useBranchesMonthly();
  const { data: criteria } = useWeakestCriteria(range);
  const palette = useChartTokens();

  // Sentiment slice mapping uses semantic tones (success / muted / destructive
  // / warning) so a re-theme cascades automatically.
  const SENTIMENT_TONE: Record<string, string> = useMemo(
    () => ({
      positive: palette.success,
      neutral: palette.muted,
      negative: palette.destructive,
      mixed: palette.warning,
    }),
    [palette],
  );

  const sentimentSlices = useMemo(() => {
    if (!myKpi) return [];
    return Object.entries(myKpi.sentiment).map(([k, v]) => ({ name: k, value: v }));
  }, [myKpi]);

  // Chart axis + tooltip styling derived from tokens so charts inherit the
  // same paper/ink language as the rest of the page.
  const axisStyle = { fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fill: palette.muted };
  const tooltipStyle = {
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 8,
    fontSize: 12,
    boxShadow: "0 6px 14px -4px rgb(15 23 42 / 0.08)",
    padding: "8px 10px",
    color: "hsl(var(--foreground))",
  } as const;

  return (
    <div className="space-y-7">
      {/* Page header — title + date range. Range inputs hug the right so the
          page title carries the eye. */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-1.5">Bosh sahifa</p>
          <h1 className="font-display text-3xl font-semibold tracking-tightish text-foreground">
            Boshqaruv paneli
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isSupervisor
              ? "Jamoa va filial KPI ko'rinishi"
              : "Sizning KPI ko'rsatkichlaringiz"}
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label htmlFor="from" className="text-2xs uppercase tracking-wider">
              Sanadan
            </Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36" />
          </div>
          <div>
            <Label htmlFor="to" className="text-2xs uppercase tracking-wider">
              Sanagacha
            </Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36" />
          </div>
        </div>
      </header>

      {/* KPI tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="Kirish qo'ng'iroqlar"
          value={myKpi?.callsInbound ?? "—"}
          sub={`${myKpi?.callsMissed ?? 0} javobsiz`}
        />
        <KpiTile label="Chiqish qo'ng'iroqlar" value={myKpi?.callsOutbound ?? "—"} />
        <KpiTile
          label="O'rtacha QA ball"
          value={myKpi ? myKpi.avgQaScore : "—"}
          unit={myKpi ? "/100" : undefined}
          meter={typeof myKpi?.avgQaScore === "number" ? myKpi.avgQaScore : undefined}
          sub={`Skript rioya: ${myKpi?.scriptAdherencePct ?? 0}%`}
        />
        <KpiTile
          label="Konversiya"
          value={myKpi ? myKpi.conversionPct : "—"}
          unit={myKpi ? "%" : undefined}
          meter={typeof myKpi?.conversionPct === "number" ? myKpi.conversionPct : undefined}
          sub={`O'rtacha davomiylik: ${myKpi?.avgDurationSec ?? 0}s`}
        />
      </div>

      {/* Trends + sentiment */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard
          title="Qo'ng'iroqlar va QA dinamikasi"
          subtitle="Kunlik"
          className="lg:col-span-2"
        >
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={trends?.items ?? []} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid stroke={palette.grid} strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="bucket" tick={axisStyle} stroke={palette.grid} />
              <YAxis yAxisId="left" tick={axisStyle} stroke={palette.grid} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={axisStyle} stroke={palette.grid} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: palette.grid, strokeWidth: 1 }} />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <Line yAxisId="left" type="monotone" dataKey="callsInbound" name="Kirish" stroke={palette.info} strokeWidth={1.75} dot={false} />
              <Line yAxisId="left" type="monotone" dataKey="callsOutbound" name="Chiqish" stroke={palette.success} strokeWidth={1.75} dot={false} />
              <Line yAxisId="right" type="monotone" dataKey="avgQaScore" name="QA ball" stroke={palette.primary} strokeWidth={1.75} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Sentiment ulushi" subtitle="Hozirgi davr">
          {sentimentSlices.every((s) => s.value === 0) ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Hozirgi davr uchun ma'lumot yo'q.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={sentimentSlices}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={48}
                  outerRadius={86}
                  paddingAngle={2}
                  stroke="hsl(var(--card))"
                  strokeWidth={2}
                >
                  {sentimentSlices.map((s) => (
                    <Cell key={s.name} fill={SENTIMENT_TONE[s.name] ?? palette.muted} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Coaching: weakest / strongest criteria */}
      {isSupervisor && (
        <SectionCard title="Murabbiylik fokuslari" subtitle="Mezonlar bo'yicha">
          <div className="grid gap-4 md:grid-cols-2">
            <CriteriaList title="Eng zaif mezonlar" items={criteria?.weakest ?? []} negative />
            <CriteriaList title="Eng kuchli mezonlar" items={criteria?.strongest ?? []} />
          </div>
        </SectionCard>
      )}

      {/* Team comparison */}
      {isSupervisor && (
        <SectionCard title="Jamoa taqqoslash" subtitle="Operatorlar bo'yicha">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={(team?.items ?? []).map((it) => ({
                ...it,
                displayName: it.extension ? `${it.fullName} (${it.extension})` : it.fullName,
              }))}
              margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
            >
              <CartesianGrid stroke={palette.grid} strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="displayName"
                interval={0}
                angle={-22}
                textAnchor="end"
                height={86}
                tick={{ ...axisStyle, fontFamily: "IBM Plex Sans, sans-serif" }}
                stroke={palette.grid}
              />
              <YAxis tick={axisStyle} stroke={palette.grid} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--surface))" }} />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <Bar dataKey="avgQaScore" name="QA ball" fill={palette.primary} radius={[3, 3, 0, 0]} />
              <Bar dataKey="conversionPct" name="Konversiya %" fill={palette.success} radius={[3, 3, 0, 0]} />
              <Bar dataKey="scriptAdherencePct" name="Skript %" fill={palette.info} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>
      )}

      {/* Branches */}
      {isSupervisor && branches?.items && branches.items.length > 0 && (
        <SectionCard title="Filiallar bo'yicha" subtitle={`${branches.items.length} ta filial`}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th>Filial</th>
                  <th>Kirish</th>
                  <th>Chiqish</th>
                  <th>QA</th>
                  <th>Konversiya</th>
                  <th>Skript</th>
                </tr>
              </thead>
              <tbody>
                {branches.items.map((b) => (
                  <tr key={b.branchId}>
                    <td className="font-medium text-foreground">{b.name}</td>
                    <td className="font-mono">{b.callsInbound}</td>
                    <td className="font-mono">{b.callsOutbound}</td>
                    <td className="font-mono">{b.avgQaScore}</td>
                    <td className="font-mono">{b.conversionPct}%</td>
                    <td className="font-mono">{b.scriptAdherencePct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Branch monthly funnel */}
      {isSupervisor && branchesMonthly && (
        <SectionCard
          title="Filiallar oylik hisobot"
          subtitle={branchesMonthly.month}
        >
          {branchesMonthly.items.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Hali hech qaysi qo'ng'iroqda filial belgilanmagan. Qo'ng'iroq qatorida "Filial"
              dropdownidan tanlang.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th>Filial</th>
                    <th>Qo'ng'iroq</th>
                    <th>Lead</th>
                    <th>Kartalar</th>
                    <th>Yutdi</th>
                    <th>Yo'qotdi</th>
                    <th>Ochiq</th>
                    <th>Konversiya</th>
                  </tr>
                </thead>
                <tbody>
                  {branchesMonthly.items.map((b) => (
                    <tr key={b.branchId}>
                      <td className="font-medium text-foreground">{b.name}</td>
                      <td className="font-mono">{b.calls}</td>
                      <td className="font-mono">{b.uniqueLeads}</td>
                      <td className="font-mono">{b.cards}</td>
                      <td className="font-mono text-success">{b.won}</td>
                      <td className="font-mono text-destructive">{b.lost}</td>
                      <td className="font-mono">{b.open}</td>
                      <td className="font-mono font-semibold text-foreground">
                        {b.conversionPct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      {/* Per-operator coaching drilldown */}
      {isSupervisor && team?.items && team.items.length > 0 && (
        <SectionCard title="Murabbiylik" subtitle="Operator bo'yicha">
          <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {team.items.map((it) => (
              <li
                key={it.userId ?? Math.random()}
                className="rounded-md border bg-card p-3 transition-colors hover:bg-surface/60"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-foreground">
                    {it.fullName ?? it.userId}
                    {it.extension && (
                      <span className="ml-1 font-mono text-xs text-muted-foreground">
                        ({it.extension})
                      </span>
                    )}
                  </span>
                  {it.userId && (
                    <Link
                      to={`/coaching/${it.userId}`}
                      className="shrink-0 text-xs font-medium text-primary hover:underline"
                    >
                      Ko'rish →
                    </Link>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <Metric label="QA" value={it.avgQaScore} />
                  <Metric label="Konv." value={`${it.conversionPct}%`} />
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}

/** A single KPI tile. Large mono numerals, calm eyebrow, optional sub line and
 *  inline meter so percentage-style values get a visual anchor. */
function KpiTile({
  label,
  value,
  unit,
  sub,
  meter,
}: {
  label: string;
  value: string | number;
  unit?: string;
  sub?: string;
  meter?: number;
}): JSX.Element {
  return (
    <div className="stat-tile flex flex-col gap-3">
      <p className="eyebrow">{label}</p>
      {/* Plus Jakarta Sans 30px bold per the Soft Modern brief — the metric
          value is the anchor, everything else recedes. */}
      <p className="font-display flex items-baseline gap-1.5 text-3xl font-bold leading-none tracking-tight text-foreground">
        <span>{value}</span>
        {unit && (
          <span className="text-md font-semibold text-muted-foreground">{unit}</span>
        )}
      </p>
      {typeof meter === "number" && <Meter value={meter} className="mt-1" />}
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** Section wrapper used by every non-KPI block on the page so all surfaces
 *  share the same title + chrome rhythm. */
function SectionCard({
  title,
  subtitle,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  className?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section className={["card-surface p-5", className].filter(Boolean).join(" ")}>
      <header className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-base font-semibold tracking-tightish text-foreground">
          {title}
        </h2>
        {subtitle && <span className="eyebrow">{subtitle}</span>}
      </header>
      {children}
    </section>
  );
}

/** Wrapper used by the two recharts panels at the top of the page. Adds a
 *  consistent title row + padding so the charts inherit the same chrome. */
function ChartCard({
  title,
  subtitle,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  className?: string;
  children: React.ReactNode;
}): JSX.Element {
  return <SectionCard title={title} subtitle={subtitle} className={className}>{children}</SectionCard>;
}

function Metric({ label, value }: { label: string; value: string | number }): JSX.Element {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="font-mono font-semibold text-foreground">{value}</span>
    </div>
  );
}

function CriteriaList({
  title,
  items,
  negative,
}: {
  title: string;
  items: Array<{ criterionId: string; text: string; section: string; passRate: number; samples: number }>;
  negative?: boolean;
}): JSX.Element {
  return (
    <div>
      <p className="eyebrow mb-2">{title}</p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Ma'lumot yo'q.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((c) => (
            <li key={c.criterionId} className="rounded-md border bg-card p-2.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground">{c.text}</span>
                <span
                  className={
                    "font-mono text-xs font-semibold tabular-nums " +
                    (negative ? "text-destructive" : "text-success")
                  }
                >
                  {c.passRate}%
                </span>
              </div>
              <Meter
                value={c.passRate}
                tone={negative ? "destructive" : "success"}
                className="mt-2"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                {c.section} · <span className="font-mono">{c.samples}</span> ta namuna
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
