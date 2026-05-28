import { Link, useParams } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useScorecard } from "@/hooks/useAnalytics";

export function ScorecardPage(): JSX.Element {
  const { callId } = useParams<{ callId: string }>();
  const { data, isLoading, error } = useScorecard(callId ?? null);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Yuklanmoqda...</p>;
  }
  if (error || !data) {
    return (
      <div>
        <p className="text-sm text-destructive">Scorecard topilmadi.</p>
        <Button asChild variant="link" className="px-0">
          <Link to="/dashboard">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Boshqaruv paneliga qaytish
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/dashboard">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Boshqaruv paneli
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold">Scorecard</h1>
        <p className="text-sm text-muted-foreground">
          {data.direction} · {data.status} · {format(new Date(data.startedAt), "dd MMM yyyy HH:mm")} ·{" "}
          {data.duration}s
        </p>
      </div>

      {/* Analysis */}
      {data.analysis && (
        <section className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold">AI tahlili</h2>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <KV label="Sentiment" value={data.analysis.sentiment} />
            <KV label="Mavzu" value={data.analysis.topic} />
            <KV label="Keyingi qadam" value={data.analysis.nextStep} />
            <KV label="Skript" value={data.analysis.script?.name} />
          </div>
          {data.analysis.summary && (
            <p className="mt-2 rounded bg-muted/40 p-2 text-sm">{data.analysis.summary}</p>
          )}
        </section>
      )}

      {/* QA scores */}
      {data.qaScores.length === 0 && (
        <p className="text-sm text-muted-foreground">QA baholar hali tayyor emas.</p>
      )}
      {data.qaScores.map((qa) => {
        const pct = qa.maxScore === 0 ? 0 : Math.round((qa.totalScore / qa.maxScore) * 100);
        const finalScore =
          (qa.supervisorOverride as { totalScore?: number } | null)?.totalScore ?? qa.totalScore;
        return (
          <section key={qa.id} className="rounded-lg border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">{qa.script.name}</h2>
                <p className="text-xs text-muted-foreground">
                  {qa.criteriaResults.length} mezon
                  {qa.reviewer && ` · supervayzer override: ${qa.reviewer.fullName}`}
                </p>
              </div>
              <Badge color={pct >= 70 ? "#22c55e" : pct >= 40 ? "#f59e0b" : "#ef4444"}>
                {finalScore}/{qa.maxScore} ({pct}%)
              </Badge>
            </div>
            <ul className="space-y-2">
              {qa.criteriaResults.map((r) => (
                <li
                  key={r.criterionId}
                  className="flex items-start gap-3 rounded border bg-background p-2"
                >
                  <div className="pt-0.5">
                    {r.passed ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{r.criterionId}</p>
                    <p className="mt-0.5 text-xs italic text-muted-foreground">
                      Dalil: {r.evidence}
                    </p>
                  </div>
                  <div className="text-right text-sm">{r.score}</div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {/* Transcript */}
      {data.transcript && (
        <section className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold">Transkript ({data.transcript.language})</h2>
          <p className="text-xs text-muted-foreground">
            Confidence: {(data.transcript.confidence * 100).toFixed(0)}%
          </p>
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2 text-xs">
            {data.transcript.text}
          </pre>
        </section>
      )}
    </div>
  );
}

function KV({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value ?? "—"}</p>
    </div>
  );
}
