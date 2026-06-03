import { useState } from "react";
import { BookOpen, X, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useActiveScript } from "@/hooks/useScripts";

/**
 * Top-bar trigger + slide-over panel showing the active sales script. Built
 * to stay open during a call: collapsible sections, large readable text, no
 * focus traps so the operator can switch back to the call window.
 */
export function SalesScriptPanel(): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="sm"
        variant="default"
        onClick={() => setOpen(true)}
        title="Qo'ng'iroq paytida sotuv skriptini ochib qo'ying"
      >
        <BookOpen className="mr-1 h-4 w-4" />
        Sotuv skripti
      </Button>
      {open && <ScriptDrawer onClose={() => setOpen(false)} />}
    </>
  );
}

function ScriptDrawer({ onClose }: { onClose: () => void }): JSX.Element {
  const { data: script, isLoading } = useActiveScript();
  return (
    <>
      {/* Backdrop is transparent / non-blocking so the operator can still
          click into the call window without dismissing the script. */}
      <div className="fixed inset-0 z-40 bg-black/10" onClick={onClose} aria-hidden />
      <aside
        className="fixed right-0 top-0 z-50 flex h-full w-[420px] max-w-full flex-col border-l bg-card shadow-2xl"
        role="dialog"
        aria-labelledby="sales-script-title"
      >
        <header className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <h2 id="sales-script-title" className="text-sm font-semibold">
              {script?.name ?? "Sotuv skripti"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Yopish"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Yuklanmoqda...</p>
          ) : !script ? (
            <div className="rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              Hozirgi tenantda faol skript yo'q. Sozlamalar → Skript bo'limidan yarating.
            </div>
          ) : (
            <ScriptBody script={script} />
          )}
        </div>
        <footer className="border-t px-4 py-2 text-xs text-muted-foreground">
          Bu skriptga muvofiq QA baholashi avtomatik amalga oshiriladi.
        </footer>
      </aside>
    </>
  );
}

function ScriptBody({
  script,
}: {
  script: NonNullable<ReturnType<typeof useActiveScript>["data"]>;
}): JSX.Element {
  // Group criteria by section so the same wording the operator sees is what
  // gets QA-scored — section becomes the heading, criterion.text is the
  // expectation, guidance is the read-aloud cheat sheet.
  const grouped = script.sections.map((section, idx) => ({
    section,
    order: idx,
    items: script.criteria.filter((c) => c.section === section),
  }));
  const totalMax = script.criteria.reduce((sum, c) => sum + (c.maxScore ?? 0), 0);
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Jami baholash balli: <strong>{totalMax}</strong> / 100
      </p>
      {grouped.map((g, idx) => (
        <ScriptSection
          key={g.section}
          number={idx + 1}
          section={g.section}
          items={g.items}
          defaultOpen={idx === 0}
        />
      ))}
    </div>
  );
}

interface SectionProps {
  number: number;
  section: string;
  items: Array<{
    id: string;
    text: string;
    maxScore: number;
    keywords?: string[];
    guidance?: string[];
  }>;
  defaultOpen?: boolean;
}

function ScriptSection({ number, section, items, defaultOpen }: SectionProps): JSX.Element {
  const [open, setOpen] = useState(!!defaultOpen);
  const sectionMax = items.reduce((s, i) => s + (i.maxScore ?? 0), 0);
  return (
    <div className="rounded-lg border bg-background">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center justify-between gap-2 px-3 py-2 text-left",
          open && "border-b",
        )}
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-sm font-semibold">
            {number}. {section}
          </span>
        </div>
        <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium">
          {sectionMax} ball
        </span>
      </button>
      {open && (
        <div className="space-y-2 px-3 py-2">
          {items.map((item) => (
            <div key={item.id} className="space-y-1">
              <p className="text-sm leading-snug">{item.text}</p>
              {item.guidance && item.guidance.length > 0 && (
                <ul className="ml-4 list-disc space-y-0.5 text-sm text-muted-foreground">
                  {item.guidance.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              )}
              {item.keywords && item.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {item.keywords.map((k) => (
                    <span
                      key={k}
                      className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] text-blue-800 dark:bg-blue-950/40 dark:text-blue-200"
                    >
                      {k}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
