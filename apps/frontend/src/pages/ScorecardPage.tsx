import { Link, useParams } from "react-router-dom";
import { format } from "date-fns";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Meter } from "@/components/ui/meter";
import { cn } from "@/lib/utils";
import { useScorecard } from "@/hooks/useAnalytics";

/**
 * Single-call scorecard. Visual refresh only — useScorecard fetch + the
 * supervisor-override path are unchanged.
 *
 * Visual hierarchy: header (back link + call meta) → overall score tile →
 * AI analysis card → mistakes (destructive-tinted) → per-criterion QA list
 * → transcript collapse. Each section is a card-surface block so the page
 * reads as a coherent report.
 */
export function ScorecardPage(): JSX.Element {
  const { callId } = useParams<{ callId: string }>();
  const { data, isLoading, error } = useScorecard(callId ?? null);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Yuklanmoqda...
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/dashboard">
            <ArrowLeft className="h-4 w-4" />
            Boshqaruv paneli
          </Link>
        </Button>
        <div className="card-surface p-6 text-center text-sm text-muted-foreground">
          Scorecard topilmadi.
        </div>
      </div>
    );
  }

  const DirectionIcon =
    data.status === "MISSED"
      ? PhoneMissed
      : data.direction === "INBOUND"
        ? PhoneIncoming
        : PhoneOutgoing;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/dashboard">
            <ArrowLeft className="h-4 w-4" />
            Boshqaruv paneli
          </Link>
        </Button>
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "mt-1 inline-flex h-10 w-10 items-center justify-center rounded-full",
              data.status === "MISSED"
                ? "bg-destructive/10 text-destructive"
                : data.direction === "INBOUND"
                  ? "bg-success/15 text-success"
                  : "bg-info/15 text-info",
            )}
          >
            <DirectionIcon className="h-5 w-5" />
          </span>
          <div>
            <p className="eyebrow mb-1">Qo'ng'iroq tahlili</p>
            <h1 className="font-display text-3xl font-semibold tracking-tightish text-foreground">
              Scorecard
            </h1>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {data.direction} · {data.status} ·{" "}
              {format(new Date(data.startedAt), "dd MMM yyyy HH:mm")}
              {data.duration > 0 && ` · ${data.duration}s`}
            </p>
          </div>
        </div>
      </div>

      {/* Overall score — the first thing the supervisor wants to see. Shown
          as a big stat tile, with one row per script when there are multiple. */}
      {data.qaScores.length > 0 && (
        <section className="card-surface p-4">
          <div className="flex flex-wrap items-center gap-6">
            {data.qaScores.map((qa) => (
              <ScoreTile key={qa.id} qa={qa} />
            ))}
          </div>
        </section>
      )}

      {/* AI analysis — sentiment / topic / nextStep, plus the free-form
          summary in a quieter inset-surface so it doesn't compete with the
          structured fields. */}
      {data.analysis && (
        <section className="card-surface p-4">
          <SectionHeading
            icon={<Sparkles className="h-4 w-4 text-primary" />}
            title="AI tahlili"
            sub={data.analysis.script?.name}
          />
          <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KV label="Sentiment" value={data.analysis.sentiment} />
            <KV label="Mavzu" value={data.analysis.topic} />
            <KV label="Skript" value={data.analysis.script?.name} />
            <KV label="Keyingi qadam" value={data.analysis.nextStep} />
          </dl>
          {data.analysis.summary && (
            <p className="mt-3 inset-surface p-3 text-sm leading-relaxed text-foreground/90">
              {data.analysis.summary}
            </p>
          )}
        </section>
      )}

      {/* Mistakes — destructive-tinted card so the supervisor sees coaching
          opportunities first. Each item is a hairline-bordered row inside the
          tinted section to keep the page legible. */}
      {data.analysis?.mistakes && data.analysis.mistakes.length > 0 && (
        <section className="rounded-lg border border-destructive/30 bg-destructive/[0.04] p-4 shadow-xs">
          <SectionHeading
            icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
            title="Xatoliklar"
            sub={`${data.analysis.mistakes.length} ta operator og'ishi`}
            destructive
          />
          <ul className="mt-3 space-y-2">
            {data.analysis.mistakes.map((m, i) => (
              <li key={i} className="rounded-md border bg-card p-3 shadow-xs">
                <div className="flex items-center gap-2">
                  <SeverityChip severity={m.severity} />
                  <strong className="text-sm tracking-tightish text-foreground">
                    {m.section}
                  </strong>
                </div>
                <p className="mt-1 text-sm text-foreground/90">{m.message}</p>
                {m.evidence && m.evidence !== "topilmadi" && m.evidence !== "dalil topilmadi" && (
                  <p className="mt-1.5 border-l-2 border-destructive/40 pl-2 text-xs italic text-muted-foreground">
                    "{m.evidence}"
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Per-criterion QA results. Empty-state copy when no scoring yet. */}
      {data.qaScores.length === 0 ? (
        <div className="card-surface p-6 text-center text-sm text-muted-foreground">
          QA baholar hali tayyor emas. Tahlilni boshlash uchun karta paneldagi
          "Tahlil qil" tugmasidan foydalaning.
        </div>
      ) : (
        data.qaScores.map((qa) => (
          <section key={qa.id} className="card-surface p-4">
            <SectionHeading
              icon={<CheckCircle2 className="h-4 w-4 text-success" />}
              title={qa.script.name}
              sub={`${qa.criteriaResults.length} mezon${
                qa.reviewer ? ` · supervayzer override: ${qa.reviewer.fullName}` : ""
              }`}
            />
            <ul className="mt-3 space-y-2">
              {qa.criteriaResults.map((r) => (
                <li
                  key={r.criterionId}
                  className="rounded-md border bg-card px-3 py-2.5 shadow-xs"
                >
                  <div className="flex items-start gap-3">
                    <span className="pt-0.5">
                      {r.passed ? (
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-sm font-medium text-foreground">
                        {r.criterionId}
                      </p>
                      {r.evidence && (
                        <p className="mt-1 border-l-2 border-border pl-2 text-xs italic text-muted-foreground">
                          "{r.evidence}"
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 self-center font-mono text-sm font-semibold text-foreground">
                      {r.score}
                    </span>
                  </div>
                  <Meter
                    value={Math.max(0, Math.min(100, Number(r.score) || 0))}
                    tone={r.passed ? "success" : "destructive"}
                    className="mt-2"
                  />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {/* Transcript — collapsed by default so the report stays scannable. */}
      {data.transcript && (
        <details className="card-surface p-4">
          <summary className="cursor-pointer list-none">
            <SectionHeading
              icon={<Sparkles className="h-4 w-4 text-muted-foreground" />}
              title="Transkript"
              sub={`${data.transcript.language} · confidence ${(data.transcript.confidence * 100).toFixed(0)}%`}
            />
          </summary>
          <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-md border bg-surface p-3 text-xs leading-relaxed text-foreground/90">
            {data.transcript.text}
          </pre>
        </details>
      )}
    </div>
  );
}

// --- helpers --------------------------------------------------------------

function ScoreTile({
  qa,
}: {
  qa: {
    id: string;
    totalScore: number;
    maxScore: number;
    supervisorOverride: Record<string, unknown> | null;
    script: { id: string; name: string };
  };
}): JSX.Element {
  const pct = qa.maxScore === 0 ? 0 : Math.round((qa.totalScore / qa.maxScore) * 100);
  const finalScore =
    (qa.supervisorOverride as { totalScore?: number } | null)?.totalScore ?? qa.totalScore;
  const tone =
    pct >= 70
      ? { ring: "stroke-success", text: "text-success" }
      : pct >= 40
        ? { ring: "stroke-warning", text: "text-warning" }
        : { ring: "stroke-destructive", text: "text-destructive" };
  return (
    <div className="flex items-center gap-4">
      {/* SVG ring — minimalist visualization of % score. Pure presentation. */}
      <div className="relative inline-flex h-16 w-16 items-center justify-center">
        <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90">
          <circle
            cx="18"
            cy="18"
            r="15.9155"
            fill="none"
            className="stroke-border"
            strokeWidth="2.5"
          />
          <circle
            cx="18"
            cy="18"
            r="15.9155"
            fill="none"
            className={tone.ring}
            strokeWidth="2.5"
            strokeDasharray={`${pct}, 100`}
            strokeLinecap="round"
          />
        </svg>
        <span className={cn("absolute text-sm font-semibold tabular-nums", tone.text)}>
          {pct}%
        </span>
      </div>
      <div className="space-y-0.5">
        <p className="eyebrow">{qa.script.name}</p>
        <p className="font-mono text-2xl font-semibold leading-none text-foreground">
          {finalScore}
          <span className="ml-1 text-sm font-normal text-muted-foreground">/ {qa.maxScore}</span>
        </p>
      </div>
    </div>
  );
}

function SectionHeading({
  icon,
  title,
  sub,
  destructive,
}: {
  icon: React.ReactNode;
  title: string;
  sub?: string;
  destructive?: boolean;
}): JSX.Element {
  return (
    <div className="flex items-baseline gap-2">
      <span className="self-center">{icon}</span>
      <h2
        className={cn(
          "font-display text-base font-semibold tracking-tightish",
          destructive ? "text-destructive" : "text-foreground",
        )}
      >
        {title}
      </h2>
      {sub && <span className="font-mono text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

function KV({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{value ?? "—"}</p>
    </div>
  );
}

function SeverityChip({ severity }: { severity: string }): JSX.Element {
  // Drives the chip via the Soft Modern semantic tone — no inline classes
  // so the look stays consistent with every other chip in the system.
  const meta =
    severity === "high"
      ? { tone: "destructive" as const, label: "Yuqori" }
      : severity === "medium"
        ? { tone: "warning" as const, label: "O'rta" }
        : { tone: "muted" as const, label: "Past" };
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}
