import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Meter } from "@/components/ui/meter";
import { useCoaching } from "@/hooks/useAnalytics";

/**
 * Per-operator coaching drilldown — supervisor's view. Shows avg QA, weakest
 * script sections, top recurring mistakes (from Analysis.mistakes), and a
 * weekly QA trend so the supervisor can spot improvement or regression.
 *
 * Route: /coaching/:operatorId.
 */
export function CoachingPage(): JSX.Element {
  const { operatorId } = useParams<{ operatorId: string }>();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data, isLoading } = useCoaching(operatorId ?? null, {
    from: from || undefined,
    to: to || undefined,
  });

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/dashboard">
            <ArrowLeft className="h-4 w-4" />
            Boshqaruv paneli
          </Link>
        </Button>
        <div>
          <p className="eyebrow mb-1">Murabbiylik</p>
          <h1 className="font-display text-3xl font-semibold tracking-tightish text-foreground">
            Murabbiylik hisobot
          </h1>
        </div>
      </div>

      <div className="card-surface flex flex-wrap items-end gap-3 p-4">
        <div>
          <Label className="text-2xs uppercase tracking-wider">Sanadan</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label className="text-2xs uppercase tracking-wider">Sanagacha</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground">Yuklanmoqda...</p>
      )}
      {data && (
        <>
          <SectionCard
            title={
              <>
                {data.operator.fullName}
                {data.operator.extension && (
                  <span className="ml-2 font-mono text-sm font-normal text-muted-foreground">
                    ({data.operator.extension})
                  </span>
                )}
              </>
            }
            subtitle="Operator umumiy ko'rsatkichi"
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <Tile label="Qo'ng'iroqlar" value={data.totalCalls} />
              <Tile
                label="O'rtacha QA"
                value={data.avgQaScore}
                unit="%"
                meter={Number(data.avgQaScore) || undefined}
              />
              <Tile
                label="Eng zaif bo'lim"
                value={data.weakestSections[0]?.section ?? "—"}
                sub={
                  data.weakestSections[0]
                    ? `${data.weakestSections[0].passRate}% o'tdi`
                    : undefined
                }
              />
            </div>
          </SectionCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Eng zaif bo'limlar" subtitle={`${data.weakestSections.length} ta`}>
              {data.weakestSections.length === 0 ? (
                <p className="text-xs text-muted-foreground">Ma'lumot yo'q.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {data.weakestSections.map((s) => (
                    <li
                      key={s.section}
                      className="rounded-md border bg-card p-3 shadow-xs"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-medium text-foreground">{s.section}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          <strong className="text-foreground">{s.passRate}%</strong> · {s.samples} ta
                        </span>
                      </div>
                      <Meter
                        value={Number(s.passRate) || 0}
                        tone="destructive"
                        className="mt-2"
                      />
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard title="Eng tez-tez xatoliklar" subtitle={`${data.topMistakes.length} ta`}>
              {data.topMistakes.length === 0 ? (
                <p className="text-xs text-muted-foreground">Xatolik aniqlanmagan.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {data.topMistakes.map((m, i) => (
                    <li key={i} className="rounded-md border bg-card p-3 shadow-xs">
                      <div className="flex items-center justify-between gap-3">
                        <strong className="text-foreground">{m.section}</strong>
                        <span className="font-mono text-xs text-muted-foreground">×{m.count}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{m.message}</p>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>

          <SectionCard title="QA trend" subtitle="Haftalik">
            {data.trend.length === 0 ? (
              <p className="text-xs text-muted-foreground">Trend uchun yetarli ma'lumot yo'q.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th>Hafta</th>
                      <th>Qo'ng'iroqlar</th>
                      <th>O'rtacha QA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.trend.map((t) => (
                      <tr key={t.week}>
                        <td className="font-mono text-foreground">{t.week}</td>
                        <td className="font-mono">{t.calls}</td>
                        <td className="font-mono font-semibold text-foreground">
                          {t.avgQaScore}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: React.ReactNode;
  subtitle?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section className="card-surface p-5">
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

function Tile({
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
    <div className="rounded-md border bg-card p-3 shadow-xs">
      <p className="eyebrow">{label}</p>
      <p className="mt-1 flex items-baseline gap-1 font-mono text-2xl font-semibold leading-none text-foreground">
        <span>{value}</span>
        {unit && <span className="text-sm font-medium text-muted-foreground">{unit}</span>}
      </p>
      {typeof meter === "number" && <Meter value={meter} className="mt-2" />}
      {sub && <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
