import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    <div className="space-y-5">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/dashboard">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Boshqaruv paneli
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold">Murabbiylik hisobot</h1>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
        <div>
          <Label className="text-xs">Dan</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Gacha</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Yuklanmoqda...</p>}
      {data && (
        <>
          <div className="rounded-lg border bg-card p-4">
            <h2 className="text-lg font-semibold">
              {data.operator.fullName}
              {data.operator.extension && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({data.operator.extension})
                </span>
              )}
            </h2>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <Tile label="Qo'ng'iroqlar" value={data.totalCalls} />
              <Tile label="O'rtacha QA" value={`${data.avgQaScore}%`} />
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
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-lg border bg-card p-4">
              <h3 className="mb-2 text-sm font-semibold">Eng zaif bo'limlar</h3>
              {data.weakestSections.length === 0 ? (
                <p className="text-xs text-muted-foreground">Ma'lumot yo'q.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {data.weakestSections.map((s) => (
                    <li
                      key={s.section}
                      className="flex items-center justify-between rounded border bg-background p-2"
                    >
                      <span>{s.section}</span>
                      <span className="text-xs">
                        <strong>{s.passRate}%</strong> ({s.samples} ta)
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-lg border bg-card p-4">
              <h3 className="mb-2 text-sm font-semibold">Eng tez-tez xatoliklar</h3>
              {data.topMistakes.length === 0 ? (
                <p className="text-xs text-muted-foreground">Xatolik aniqlanmagan.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {data.topMistakes.map((m, i) => (
                    <li key={i} className="rounded border bg-background p-2">
                      <div className="flex items-center justify-between">
                        <strong>{m.section}</strong>
                        <span className="text-xs">×{m.count}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{m.message}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="rounded-lg border bg-card p-4">
            <h3 className="mb-2 text-sm font-semibold">QA trend (haftalik)</h3>
            {data.trend.length === 0 ? (
              <p className="text-xs text-muted-foreground">Trend uchun yetarli ma'lumot yo'q.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="pb-2">Hafta</th>
                    <th>Qo'ng'iroqlar</th>
                    <th>O'rtacha QA</th>
                  </tr>
                </thead>
                <tbody>
                  {data.trend.map((t) => (
                    <tr key={t.week} className="border-t">
                      <td className="py-1.5">{t.week}</td>
                      <td>{t.calls}</td>
                      <td>{t.avgQaScore}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
