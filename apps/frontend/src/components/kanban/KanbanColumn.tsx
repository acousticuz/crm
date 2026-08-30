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
  // When set, this card is the one currently being dragged through the
  // DragOverlay portal — render it as a dimmed placeholder in its source
  // column so the layout doesn't shift during the drag.
  activeCardId?: string | null;
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
export function KanbanColumn({ stage, cards, onOpenCard, activeCardId }: Props): JSX.Element {
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
      data-kanban-column
      className={cn(
        // Soft Modern column: 280-320px range, 14px radius, calm surface tint.
        // Terminal columns get a barely-there semantic tint so the eye finds
        // them without the surface fighting cards.
        // snap-start lets the horizontal board align columns when the user
        // wheels/drags; without `snap-mandatory` operators can still free-scroll.
        "flex flex-shrink-0 snap-start flex-col rounded-lg border bg-surface/40 transition-[width] duration-200 ease-out",
        collapsed ? "w-[64px]" : "w-[300px]",
        isWon && "bg-success-soft/40 border-success/20",
        isLost && "bg-destructive-soft/40 border-destructive/20",
      )}
    >
      {/* Color accent rail — full-width strip at the top of the column. */}
      <div
        className="h-1 rounded-t-lg"
        style={{ backgroundColor: stage.color }}
        aria-hidden
      />

      {/* Header. Collapse toggle on the left, count badge + terminal chip on
          the right. */}
      <header className="flex items-center gap-2 px-3 py-3">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
          title={collapsed ? "Yoyish" : "Yig'ish"}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {!collapsed && (
          <>
            <h3 className="font-display flex-1 truncate text-sm font-semibold tracking-tight text-foreground">
              {stage.name}
            </h3>
            <span className="inline-flex h-5 min-w-[22px] items-center justify-center rounded-full bg-card px-1.5 font-mono text-2xs font-medium text-muted-foreground">
              {cards.length}
            </span>
            {isWon && (
              <span className="chip" data-tone="success">
                <Trophy className="h-3 w-3" />
                WON
              </span>
            )}
            {isLost && (
              <span className="chip" data-tone="destructive">
                <XCircle className="h-3 w-3" />
                LOST
              </span>
            )}
          </>
        )}
      </header>

      {/* Header meta (Σ budget) — single row, only when non-zero. */}
      {!collapsed && totalBudget > 0 && (
        <p className="px-3 pb-2 font-mono text-2xs text-muted-foreground">
          Σ {formatSum(totalBudget)}
        </p>
      )}

      {/* Card list / drop zone. 12px gap so cards have space to breathe; 60vh
          minimum so a column with two cards still looks intentional. */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex flex-1 flex-col gap-3 px-3 pb-3 transition-colors",
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
              className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-full bg-card px-1.5 font-mono text-2xs font-semibold"
            >
              {cards.length}
            </span>
            <span
              className="mt-1 px-1 text-center font-mono text-2xs font-medium uppercase tracking-wider"
              style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
            >
              {stage.name}
            </span>
          </div>
        ) : (
          <>
            {cards.map((c) => (
              <KanbanCard
                key={c.id}
                card={c}
                onOpen={onOpenCard}
                placeholder={c.id === activeCardId}
              />
            ))}
            {cards.length === 0 && (
              <div className="my-auto flex flex-col items-center gap-2 rounded-md border border-dashed border-border/70 px-3 py-6 text-center">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-muted-foreground/70">
                  <span aria-hidden className="text-base">∅</span>
                </div>
                <p className="text-xs text-muted-foreground">Hali karta yo'q</p>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
