import { useMemo, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import {
  useBranches,
  useOperatorKpi,
  useTeam,
  useTrends,
  useWeakestCriteria,
} from "@/hooks/useAnalytics";

const ROLE_SUPERVISOR_OR_BETTER = ["TENANT_ADMIN", "SUPERVISOR", "ANALYST"];

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "#22c55e",
  neutral: "#64748b",
  negative: "#ef4444",
  mixed: "#f59e0b",
};

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
  const { data: criteria } = useWeakestCriteria(range);

  const sentimentSlices = useMemo(() => {
    if (!myKpi) return [];
    return Object.entries(myKpi.sentiment).map(([k, v]) => ({ name: k, value: v }));
  }, [myKpi]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Boshqaruv paneli</h1>
          <p className="text-sm text-muted-foreground">
            {isSupervisor ? "Jamoa + filial KPI ko'rinishi" : "Sizning KPI ko'rsatkichlaringiz"}
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label htmlFor="from" className="text-xs text-muted-foreground">
              Sanadan
            </Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36" />
          </div>
          <div>
            <Label htmlFor="to" className="text-xs text-muted-foreground">
              Sanagacha
            </Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36" />
          </div>
        </div>
      </div>

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
          value={myKpi ? `${myKpi.avgQaScore}/100` : "—"}
          sub={`Skript rioya: ${myKpi?.scriptAdherencePct ?? 0}%`}
        />
        <KpiTile
          label="Konversiya"
          value={myKpi ? `${myKpi.conversionPct}%` : "—"}
          sub={`O'rtacha davomiylik: ${myKpi?.avgDurationSec ?? 0}s`}
        />
      </div>

      {/* Trends + sentiment */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border bg-card p-4 lg:col-span-2">
          <h2 className="mb-2 text-sm font-semibold">Qo'ng'iroqlar va QA dinamikasi</h2>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trends?.items ?? []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="bucket" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} />
              <Tooltip />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="callsInbound" name="Kirish" stroke="#0ea5e9" />
              <Line yAxisId="left" type="monotone" dataKey="callsOutbound" name="Chiqish" stroke="#22c55e" />
              <Line yAxisId="right" type="monotone" dataKey="avgQaScore" name="QA ball" stroke="#a855f7" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold">Sentiment ulushi</h2>
          {sentimentSlices.every((s) => s.value === 0) ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Ma'lumot yo'q.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={sentimentSlices} dataKey="value" nameKey="name" outerRadius={90} label>
                  {sentimentSlices.map((s) => (
                    <Cell key={s.name} fill={SENTIMENT_COLORS[s.name] ?? "#64748b"} />
                  ))}
                </Pie>
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Coaching: weakest/strongest criteria */}
      {isSupervisor && (
        <div className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Murabbiylik fokuslari (mezonlar)</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <CriteriaList title="Eng zaif mezonlar" items={criteria?.weakest ?? []} negative />
            <CriteriaList title="Eng kuchli mezonlar" items={criteria?.strongest ?? []} />
          </div>
        </div>
      )}

      {/* Team comparison */}
      {isSupervisor && (
        <div className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Jamoa taqqoslash</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={team?.items ?? []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="fullName" interval={0} angle={-20} textAnchor="end" height={70} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="avgQaScore" name="QA ball" fill="#a855f7" />
              <Bar dataKey="conversionPct" name="Konversiya %" fill="#22c55e" />
              <Bar dataKey="scriptAdherencePct" name="Skript %" fill="#0ea5e9" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Branches */}
      {isSupervisor && branches?.items && branches.items.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Filiallar bo'yicha</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="pb-2">Filial</th>
                <th>Kirish</th>
                <th>Chiqish</th>
                <th>QA</th>
                <th>Konversiya</th>
                <th>Skript</th>
              </tr>
            </thead>
            <tbody>
              {branches.items.map((b) => (
                <tr key={b.branchId} className="border-t">
                  <td className="py-1.5 font-medium">{b.name}</td>
                  <td>{b.callsInbound}</td>
                  <td>{b.callsOutbound}</td>
                  <td>{b.avgQaScore}</td>
                  <td>{b.conversionPct}%</td>
                  <td>{b.scriptAdherencePct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function KpiTile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
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
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{title}</p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Ma'lumot yo'q.</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((c) => (
            <li key={c.criterionId} className="rounded border bg-background p-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{c.text}</span>
                <Badge color={negative ? "#ef4444" : "#22c55e"}>{c.passRate}%</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {c.section} · {c.samples} ta namuna
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
