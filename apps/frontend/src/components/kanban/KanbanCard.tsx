import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { format, formatDistanceToNowStrict } from "date-fns";
import { CalendarClock, MessageSquare, Phone, PhoneMissed } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Waveform } from "@/components/ui/waveform";
import { cn } from "@/lib/utils";
import type { CardListItem } from "@/lib/types";

interface Props {
  card: CardListItem;
  onOpen: (cardId: string) => void;
  placeholder?: boolean;
}

/**
 * Soft Modern Kanban card.
 *
 * Hierarchy (top → bottom):
 *   1. Customer name (Inter 14px medium) + status chip (signature)
 *   2. Phone in JetBrains Mono (12px muted) + waveform glyph for the last call
 *   3. Meta row — last call · SMS · due date (chips for due-overdue)
 *   4. Tag chips (user-coloured)
 *   5. Footer — responsible avatar + name
 *
 * Hover: shadow lifts (card → raised) and 1px translate so the card visibly
 * floats. Active drag clears the shadow + adds a soft ring.
 */
export function KanbanCard({ card, onOpen, placeholder }: Props): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    data: { type: "card", card },
  });
  const style: React.CSSProperties = placeholder
    ? { opacity: 0.4, pointerEvents: "none" }
    : {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0 : 1,
      };
  const dueOverdue = card.dueDate && new Date(card.dueDate) < new Date();
  const phone = card.contact?.phones?.[0];
  const lastSmsAt = card.lastSms ? new Date(card.lastSms.sentAt ?? card.lastSms.createdAt) : null;
  const lastCallAt = card.lastCall ? new Date(card.lastCall.startedAt) : null;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={(e) => {
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
        "group relative cursor-grab select-none rounded-lg border bg-card p-4 text-card-foreground shadow-card",
        "transition-all duration-150 ease-out",
        "hover:-translate-y-px hover:shadow-raised",
        "active:cursor-grabbing",
        placeholder && "border-dashed bg-transparent shadow-none hover:translate-y-0 hover:shadow-none",
        isDragging && !placeholder && "ring-2 ring-primary/40 shadow-modal",
      )}
    >
      {/* Row 1 — title + the signature status chip. */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug text-foreground line-clamp-2">
          {card.title}
        </p>
        {card.hasMissedCall && (
          <Badge tone="destructive" className="shrink-0">
            <PhoneMissed className="h-3 w-3" />
            Javobsiz
          </Badge>
        )}
      </div>

      {/* Row 2 — customer identity. */}
      <div className="mt-1.5 space-y-0.5 text-xs">
        <p className="truncate font-medium text-foreground/85">
          {card.contact?.fullName ?? "—"}
        </p>
        {phone && (
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <Phone className="h-3 w-3 text-muted-foreground/70" />
            <span className="font-mono">{phone}</span>
          </p>
        )}
      </div>

      {/* Row 3 — meta. Only renders the items that exist so empty cards stay
          quiet. Waveform appears inline so the eye can scan which cards have
          recordings without opening each one. */}
      {(lastCallAt || lastSmsAt || card.dueDate) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-muted-foreground">
          {lastCallAt && (
            <span
              className="inline-flex items-center gap-1.5"
              title={`${card.lastCall?.direction === "INBOUND" ? "Kiruvchi" : "Chiquvchi"} qo'ng'iroq · ${lastCallAt.toLocaleString("uz-UZ")}`}
            >
              {card.lastCall?.status === "MISSED" ? (
                <PhoneMissed className="h-3 w-3" />
              ) : (
                <Waveform
                  seed={card.lastCall?.id ?? card.id}
                  bars={10}
                  className="h-3 text-muted-foreground/80"
                />
              )}
              <span className="font-mono">{format(lastCallAt, "dd MMM HH:mm")}</span>
            </span>
          )}
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
          {card.dueDate &&
            (dueOverdue ? (
              <Badge tone="destructive" className="h-5">
                <CalendarClock className="h-3 w-3" />
                {format(new Date(card.dueDate), "dd MMM")}
              </Badge>
            ) : (
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="h-3 w-3" />
                <span className="font-mono">{format(new Date(card.dueDate), "dd MMM")}</span>
              </span>
            ))}
        </div>
      )}

      {card.status === "LOST" && card.lostReason && (
        <div className="mt-2.5">
          <Badge tone="destructive" className="block whitespace-normal text-left">
            Sabab: {card.lostReason}
          </Badge>
        </div>
      )}

      {/* Tag cloud — user-coloured chips. */}
      {card.cardTags.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {card.cardTags.map(({ tag }) => (
            <Badge key={tag.id} color={tag.color}>
              {tag.name}
            </Badge>
          ))}
        </div>
      )}

      {/* Footer — ownership lives in a consistent place so the eye trains. */}
      <div className="mt-3 flex items-center justify-between border-t pt-2.5 text-2xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Avatar name={card.responsible?.fullName ?? null} />
          <span className="truncate">{card.responsible?.fullName ?? "Mas'ul yo'q"}</span>
        </span>
      </div>
    </div>
  );
}

/**
 * Tiny initials avatar — deterministic palette tint per name so the same
 * operator looks consistent across the board until real avatars land.
 */
function Avatar({ name }: { name: string | null }): JSX.Element {
  const initials = (name ?? "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const palette = [
    "bg-primary-soft text-primary-soft-foreground",
    "bg-success-soft text-success-soft-foreground",
    "bg-warning-soft text-warning-soft-foreground",
    "bg-info-soft text-info-soft-foreground",
    "bg-destructive-soft text-destructive-soft-foreground",
  ];
  let hash = 0;
  for (const ch of name ?? "?") hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const tone = palette[hash % palette.length];
  return (
    <span
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded-full font-mono text-2xs font-semibold",
        tone,
      )}
    >
      {initials}
    </span>
  );
}
