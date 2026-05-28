import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { ChevronDown, ChevronRight } from "lucide-react";
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

export function KanbanColumn({ stage, cards, onOpenCard }: Props): JSX.Element {
  const { isOver, setNodeRef } = useDroppable({
    id: stage.id,
    data: { type: "stage", stage },
  });
  const [collapsed, setCollapsed] = useState(false);
  const headerColor = stage.color;
  // Per-column total budget across its cards.
  const totalBudget = cards.reduce((sum, c) => sum + (c.budget ? Number(c.budget) : 0), 0);

  return (
    <div className="flex min-w-[260px] flex-shrink-0 flex-col rounded-lg border bg-muted/30">
      <div
        className="flex items-center justify-between border-b px-3 py-2"
        style={{ borderTopColor: headerColor, borderTopWidth: 3, borderTopStyle: "solid" }}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="text-muted-foreground hover:text-foreground"
            title={collapsed ? "Yoyish" : "Yig'ish"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <span className="text-sm font-semibold">{stage.name}</span>
          <span className="rounded-full bg-background px-1.5 text-xs text-muted-foreground">
            {cards.length}
          </span>
          {stage.type !== "NORMAL" && (
            <span
              className={cn(
                "rounded-sm px-1 text-[10px] font-semibold uppercase",
                stage.type === "WON" && "bg-green-100 text-green-700",
                stage.type === "LOST" && "bg-red-100 text-red-700",
              )}
            >
              {stage.type}
            </span>
          )}
        </div>
      </div>
      {totalBudget > 0 && (
        <div className="border-b px-3 py-1 text-[11px] text-muted-foreground">
          Σ {formatSum(totalBudget)}
        </div>
      )}
      <div
        ref={setNodeRef}
        className={cn(
          "flex flex-1 flex-col gap-2 p-2 overflow-y-auto transition-colors",
          collapsed ? "min-h-[40px]" : "min-h-[60vh]",
          isOver && "bg-accent/40",
        )}
      >
        {collapsed ? (
          <div className="py-2 text-center text-xs text-muted-foreground">{cards.length} ta karta yig'ilgan</div>
        ) : (
          <>
            {cards.map((c) => (
              <KanbanCard key={c.id} card={c} onOpen={onOpenCard} />
            ))}
            {cards.length === 0 && (
              <div className="rounded border border-dashed py-6 text-center text-xs text-muted-foreground">
                Kartalar yo'q
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
