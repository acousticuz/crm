import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { format, formatDistanceToNowStrict } from "date-fns";
import { CalendarClock, MessageSquare, Phone, PhoneMissed } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CardListItem } from "@/lib/types";

interface Props {
  card: CardListItem;
  onOpen: (cardId: string) => void;
}

/**
 * Kanban card — visual-only refresh. Drag/keyboard/click behavior is
 * identical to the previous version; only spacing, typography, hover lift,
 * and the small data-row icons were updated to the new design system.
 *
 * Hierarchy: title row (customer + missed-call pill) → contact + phone →
 * compact meta (last-SMS, due, branch) → tags → responsible.
 */
export function KanbanCard({ card, onOpen }: Props): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    data: { type: "card", card },
  });
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    // Lifted card during drag — slight scale + stronger shadow, lower opacity
    // so the drop target underneath stays visible.
    opacity: isDragging ? 0.85 : 1,
  };
  const dueOverdue = card.dueDate && new Date(card.dueDate) < new Date();
  const phone = card.contact?.phones?.[0];
  const lastSmsAt = card.lastSms ? new Date(card.lastSms.sentAt ?? card.lastSms.createdAt) : null;
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
        "group relative cursor-grab select-none rounded-md border bg-card p-3 text-card-foreground shadow-xs",
        "transition-all duration-150 ease-out",
        "hover:-translate-y-px hover:border-border hover:shadow-md",
        "active:cursor-grabbing",
        isDragging && "ring-2 ring-primary/40 shadow-overlay",
      )}
    >
      {/* Title + status pill. Title is the primary anchor; the pill is the
          single visual alarm if anything needs attention. */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug text-foreground line-clamp-2">
          {card.title}
        </p>
        {card.hasMissedCall && (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-1.5 py-px text-2xs font-medium text-destructive"
            title="Javobsiz qo'ng'iroq"
          >
            <PhoneMissed className="h-3 w-3" />
            Javobsiz
          </span>
        )}
      </div>

      {/* Customer + phone. Single tight cluster so the eye reads the
          identity in one glance. */}
      <div className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
        <p className="truncate font-medium text-foreground/80">
          {card.contact?.fullName ?? "—"}
        </p>
        {phone && (
          <p className="flex items-center gap-1.5">
            <Phone className="h-3 w-3 text-muted-foreground/70" />
            <span className="tabular-nums">{phone}</span>
          </p>
        )}
      </div>

      {/* Meta row — compact 2xs items, only render what exists. */}
      {(lastSmsAt || card.dueDate) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-muted-foreground">
          {lastSmsAt && (
            <span
              className="inline-flex items-center gap-1"
              title={`SMS ${card.lastSms?.status} · ${lastSmsAt.toLocaleString("uz-UZ")}`}
            >
              <MessageSquare className="h-3 w-3" />
              <span>
                {card.lastSms?.status === "DELIVERED"
                  ? "Yetkazildi"
                  : card.lastSms?.status === "FAILED"
                    ? "SMS xato"
                    : "Yuborildi"}
                {" · "}
                {formatDistanceToNowStrict(lastSmsAt, { addSuffix: true })}
              </span>
            </span>
          )}
          {card.dueDate && (
            <span
              className={cn(
                "inline-flex items-center gap-1",
                dueOverdue && "font-medium text-destructive",
              )}
            >
              <CalendarClock className="h-3 w-3" />
              <span>{format(new Date(card.dueDate), "dd MMM")}</span>
            </span>
          )}
        </div>
      )}

      {/* Tags. Already styled by Badge; render only when non-empty. */}
      {card.cardTags.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {card.cardTags.map(({ tag }) => (
            <Badge key={tag.id} color={tag.color}>
              {tag.name}
            </Badge>
          ))}
        </div>
      )}

      {/* Footer: responsible avatar (initials chip) + name. Kept on its own
          row at the bottom so the eye finds ownership consistently. */}
      <div className="mt-3 flex items-center justify-between border-t pt-2 text-2xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Avatar name={card.responsible?.fullName ?? null} />
          <span className="truncate">{card.responsible?.fullName ?? "Mas'ul yo'q"}</span>
        </span>
      </div>
    </div>
  );
}

/**
 * Tiny initials chip — placeholder until real avatars land. Deterministic
 * background tint per name so the same operator looks consistent across rows.
 */
function Avatar({ name }: { name: string | null }): JSX.Element {
  const initials = (name ?? "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  // Cycle through a small palette derived from the design tokens so initials
  // chips feel intentional instead of random.
  const palette = [
    "bg-primary/15 text-primary",
    "bg-success/15 text-success",
    "bg-warning/20 text-warning",
    "bg-info/15 text-info",
    "bg-destructive/10 text-destructive",
  ];
  let hash = 0;
  for (const ch of name ?? "?") hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const tone = palette[hash % palette.length];
  return (
    <span
      className={cn(
        "inline-flex h-5 w-5 items-center justify-center rounded-full text-2xs font-semibold",
        tone,
      )}
    >
      {initials}
    </span>
  );
}
