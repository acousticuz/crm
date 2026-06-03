import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { ChevronDown, ChevronRight, Trophy, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { KanbanCard } from "./KanbanCard";
import type { CardListItem, Stage } from "@/lib/types";

interface Props {
  stage: Stage;
  cards: CardListItem[];
  onOpenCard: (cardId: string) => void;
}

function formatSum(n: number): string {
  if (n <= 0) return "";
  return new Intl.NumberFormat("uz-UZ").format(n) + " so'm";
}

/**
 * Kanban column. Visual refresh:
 *  - Header carries a 2px color accent at the top edge (stage.color) instead
 *    of a 3px border that bled into the round corners.
 *  - NORMAL columns stay neutral; WON / LOST surface their tone with a
 *    semantic chip and a subtle background tint so victory/loss columns are
 *    legible at a glance.
 *  - Count + Σ budget collapse into a single header meta row.
 *  - Collapsed columns shrink to a 56px rail so the board can hold more
 *    pipeline stages without horizontal-scroll fatigue.
 */
export function KanbanColumn({ stage, cards, onOpenCard }: Props): JSX.Element {
  const { isOver, setNodeRef } = useDroppable({
    id: stage.id,
    data: { type: "stage", stage },
  });
  const [collapsed, setCollapsed] = useState(false);
  const totalBudget = cards.reduce((sum, c) => sum + (c.budget ? Number(c.budget) : 0), 0);

  const isWon = stage.type === "WON";
  const isLost = stage.type === "LOST";

  return (
    <section
      className={cn(
        "flex flex-shrink-0 flex-col rounded-lg border bg-surface/60 transition-[width] duration-200 ease-out",
        collapsed ? "w-[56px]" : "w-[288px]",
        // Subtle tone for terminal columns. Keeps NORMAL columns neutral so
        // the eye isn't fighting too many surfaces.
        isWon && "bg-success/[0.04] border-success/30",
        isLost && "bg-destructive/[0.04] border-destructive/30",
      )}
    >
      {/* Color accent rail — full-width strip at the top of the column. */}
      <div
        className="h-1 rounded-t-lg"
        style={{ backgroundColor: stage.color }}
        aria-hidden
      />

      {/* Header. Collapse toggle on the left, terminal-type chip on the right. */}
      <header className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
          title={collapsed ? "Yoyish" : "Yig'ish"}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {!collapsed && (
          <>
            <h3 className="flex-1 truncate text-sm font-semibold tracking-tightish text-foreground">
              {stage.name}
            </h3>
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-card px-1.5 text-2xs font-medium tabular-nums text-muted-foreground">
              {cards.length}
            </span>
            {isWon && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-1.5 py-px text-2xs font-semibold uppercase tracking-wider text-success">
                <Trophy className="h-3 w-3" />
                Won
              </span>
            )}
            {isLost && (
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-1.5 py-px text-2xs font-semibold uppercase tracking-wider text-destructive">
                <XCircle className="h-3 w-3" />
                Lost
              </span>
            )}
          </>
        )}
      </header>

      {/* Header meta (Σ budget) — single row, only when non-zero. */}
      {!collapsed && totalBudget > 0 && (
        <p className="px-3 pb-2 text-2xs tabular-nums text-muted-foreground">
          Σ {formatSum(totalBudget)}
        </p>
      )}

      {/* Card list / drop zone. */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex flex-1 flex-col gap-2 px-2 pb-2 transition-colors",
          collapsed ? "min-h-[120px] items-center justify-start py-3" : "min-h-[60vh] overflow-y-auto",
          // Drop highlight — soft primary tint + ring so the operator sees
          // exactly where the card will land.
          isOver && !collapsed && "rounded-md bg-primary/[0.05] ring-1 ring-inset ring-primary/30",
          isOver && collapsed && "bg-primary/[0.05]",
        )}
      >
        {collapsed ? (
          <div
            className="flex flex-col items-center gap-1 rounded text-2xs text-muted-foreground"
            title={`${cards.length} ta karta`}
          >
            <span
              className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-full bg-card px-1.5 text-2xs font-semibold tabular-nums"
            >
              {cards.length}
            </span>
            <span
              className="mt-1 px-1 text-center text-2xs font-medium uppercase tracking-wider"
              style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
            >
              {stage.name}
            </span>
          </div>
        ) : (
          <>
            {cards.map((c) => (
              <KanbanCard key={c.id} card={c} onOpen={onOpenCard} />
            ))}
            {cards.length === 0 && (
              <div className="my-auto rounded-md border border-dashed border-border/70 px-3 py-5 text-center text-xs text-muted-foreground">
                Kartalar yo'q
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
