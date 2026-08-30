import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, X, ChevronDown, ChevronRight, Maximize2, Minimize2 } from "lucide-react";
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
        type="button"
        size="sm"
        variant="default"
        onClick={() => setOpen(true)}
        title="Qo'ng'iroq paytida sotuv skriptini ochib qo'ying"
      >
        <BookOpen className="mr-1 h-4 w-4" />
        <span className="hidden sm:inline">Sotuv skripti</span>
        <span className="sm:hidden">Skript</span>
      </Button>
      {open && createPortal(<ScriptDrawer onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function ScriptDrawer({ onClose }: { onClose: () => void }): JSX.Element {
  const { data: script, isLoading } = useActiveScript();
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/20" onClick={onClose} aria-hidden />
      <aside
        className={cn(
          "fixed z-[80] flex flex-col overflow-hidden border bg-card shadow-2xl",
          "inset-x-2 bottom-2 top-16 rounded-xl sm:inset-x-auto sm:right-4 sm:w-[min(720px,calc(100vw-2rem))]",
          expanded ? "sm:bottom-4 sm:top-16" : "sm:bottom-auto sm:h-[72vh]",
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sales-script-title"
      >
        <header className="flex items-start justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 shrink-0 text-primary" />
              <h2 id="sales-script-title" className="truncate text-sm font-semibold">
                {script?.name ?? "Sotuv skripti"}
              </h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Bo'limlar ochiq turadi. Kerak bo'lsa alohida bo'limni yopib qo'yishingiz mumkin.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="hidden h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface hover:text-foreground sm:inline-flex"
              aria-label={expanded ? "Panelni kichraytirish" : "Panelni kengaytirish"}
              title={expanded ? "Panelni kichraytirish" : "Panelni kengaytirish"}
            >
              {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 rounded-md text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
              aria-label="Yopish"
              title="Yopish"
            >
              <X className="mx-auto h-4 w-4" />
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
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
        <footer className="flex items-center justify-between gap-3 border-t px-4 py-2 text-xs text-muted-foreground">
          <span>Bu skriptga muvofiq QA baholashi avtomatik amalga oshiriladi.</span>
          <span className="hidden shrink-0 sm:inline">Esc bilan yopish</span>
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
  const sections = Array.isArray(script.sections) ? script.sections : [];
  const criteria = Array.isArray(script.criteria) ? script.criteria : [];
  const grouped = sections.map((section, idx) => ({
    section,
    order: idx,
    items: criteria.filter((c) => c.section === section),
  }));
  const sectionNames = new Set(sections);
  const ungrouped = criteria.filter((c) => !sectionNames.has(c.section));
  const totalMax = criteria.reduce((sum, c) => sum + (c.maxScore ?? 0), 0);
  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">
        Jami baholash balli: <strong>{totalMax}</strong> / 100
      </div>
      {grouped.length === 0 ? (
        <div className="rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Skript bo'limlari topilmadi. Sozlamalar → Sotuv skripti bo'limidan tekshiring.
        </div>
      ) : (
        grouped.map((g, idx) => (
          <ScriptSection
            key={g.section}
            number={idx + 1}
            section={g.section}
            items={g.items}
            defaultOpen
          />
        ))
      )}
      {ungrouped.length > 0 && (
        <ScriptSection
          number={grouped.length + 1}
          section="Qo'shimcha mezonlar"
          items={ungrouped}
          defaultOpen
        />
      )}
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
    <div className="rounded-lg border bg-background shadow-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left",
          open && "border-b",
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <span className="text-sm font-semibold leading-snug">
            {number}. {section}
          </span>
        </div>
        <span className="shrink-0 rounded bg-muted px-2 py-0.5 text-xs font-medium">
          {sectionMax} ball
        </span>
      </button>
      {open && (
        <div className="space-y-3 px-3 py-3">
          {items.length === 0 && (
            <p className="rounded-md bg-surface/60 p-3 text-sm text-muted-foreground">
              Bu bo'lim uchun hali mezon kiritilmagan.
            </p>
          )}
          {items.map((item, index) => (
            <div key={item.id} className="rounded-md bg-surface/60 p-3">
              <div className="mb-2 flex items-start justify-between gap-3">
                <p className="text-sm font-semibold leading-relaxed text-foreground">
                  {index + 1}. {item.text}
                </p>
                <span className="shrink-0 rounded bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {item.maxScore} ball
                </span>
              </div>
              {item.guidance && item.guidance.length > 0 && (
                <div className="mt-2 rounded-md border bg-background p-2">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Qanday aytiladi
                  </div>
                  <ul className="ml-4 list-disc space-y-1 text-sm leading-relaxed text-foreground">
                    {item.guidance.map((g, i) => (
                      <li key={i}>{g}</li>
                    ))}
                  </ul>
                </div>
              )}
              {item.keywords && item.keywords.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
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
