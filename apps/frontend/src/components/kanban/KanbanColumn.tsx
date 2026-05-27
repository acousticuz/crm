import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { KanbanCard } from "./KanbanCard";
import type { CardListItem, Stage } from "@/lib/types";

interface Props {
  stage: Stage;
  cards: CardListItem[];
  onOpenCard: (cardId: string) => void;
}

export function KanbanColumn({ stage, cards, onOpenCard }: Props): JSX.Element {
  const { isOver, setNodeRef } = useDroppable({
    id: stage.id,
    data: { type: "stage", stage },
  });
  const headerColor = stage.color;
  return (
    <div className="flex min-w-[260px] flex-shrink-0 flex-col rounded-lg border bg-muted/30">
      <div
        className="flex items-center justify-between border-b px-3 py-2"
        style={{ borderTopColor: headerColor, borderTopWidth: 3, borderTopStyle: "solid" }}
      >
        <div className="flex items-center gap-2">
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
      <div
        ref={setNodeRef}
        className={cn(
          "flex flex-1 flex-col gap-2 p-2 overflow-y-auto min-h-[60vh] transition-colors",
          isOver && "bg-accent/40",
        )}
      >
        {cards.map((c) => (
          <KanbanCard key={c.id} card={c} onOpen={onOpenCard} />
        ))}
        {cards.length === 0 && (
          <div className="rounded border border-dashed py-6 text-center text-xs text-muted-foreground">
            Kartalar yo'q
          </div>
        )}
      </div>
    </div>
  );
}
