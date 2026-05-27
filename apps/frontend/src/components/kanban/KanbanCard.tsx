import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { format } from "date-fns";
import { Phone, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CardListItem } from "@/lib/types";

interface Props {
  card: CardListItem;
  onOpen: (cardId: string) => void;
}

export function KanbanCard({ card, onOpen }: Props): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    data: { type: "card", card },
  });
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  };
  const dueOverdue = card.dueDate && new Date(card.dueDate) < new Date();
  const phone = card.contact?.phones?.[0];
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        // Open detail only when the drag did not move (no transform).
        if (!transform) {
          e.stopPropagation();
          onOpen(card.id);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(card.id);
        }
      }}
      role="button"
      tabIndex={0}
      className={cn(
        "cursor-grab active:cursor-grabbing select-none rounded-md border bg-card p-3 shadow-sm hover:shadow-md transition-shadow",
      )}
    >
      <div className="text-sm font-medium leading-snug">{card.title}</div>
      <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
        <User className="h-3 w-3" />
        <span className="truncate">{card.contact?.fullName ?? "—"}</span>
      </div>
      {phone && (
        <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Phone className="h-3 w-3" />
          <span>{phone}</span>
        </div>
      )}
      {card.cardTags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {card.cardTags.map(({ tag }) => (
            <Badge key={tag.id} color={tag.color}>
              {tag.name}
            </Badge>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {card.responsible?.fullName ?? "—"}
        </span>
        {card.dueDate && (
          <span className={cn(dueOverdue && "text-destructive font-medium")}>
            {format(new Date(card.dueDate), "dd MMM")}
          </span>
        )}
      </div>
    </div>
  );
}
