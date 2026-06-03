import { useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import {
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Phone,
  ExternalLink,
  ListFilter,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  isPlaceholderContact,
  useRecentCalls,
  type RecentCall,
} from "@/hooks/useContacts";
import { SaveUnknownContactForm } from "@/components/contacts/SaveUnknownContactForm";

/**
 * Flat tenant-wide call feed. Visual refresh only — useRecentCalls,
 * isPlaceholderContact, SaveUnknownContactForm behavior all unchanged.
 *
 * Layout: page header with count + filter toggle, then a card-surface list
 * with one row per call. Each row anchors on a tinted direction icon and
 * surfaces the actions (call-back, open card, open scorecard) on the right.
 */
export function CallsPage(): JSX.Element {
  const [missedOnly, setMissedOnly] = useState(false);
  const { data: calls = [], isLoading } = useRecentCalls({ missedOnly });

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tightish text-foreground">
            Qo'ng'iroqlar
          </h1>
          <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
            {calls.length} ta {missedOnly ? "javobsiz qo'ng'iroq" : "qo'ng'iroq"}
          </p>
        </div>
        <Button
          size="sm"
          variant={missedOnly ? "default" : "outline"}
          onClick={() => setMissedOnly((v) => !v)}
        >
          <ListFilter className="h-3.5 w-3.5" />
          {missedOnly ? "Hammasi" : "Faqat javobsiz"}
        </Button>
      </div>

      {isLoading ? (
        <div className="card-surface flex h-32 items-center justify-center text-sm text-muted-foreground">
          Yuklanmoqda...
        </div>
      ) : calls.length === 0 ? (
        <div className="card-surface p-8 text-center text-sm text-muted-foreground">
          {missedOnly
            ? "Belgilangan davrda javobsiz qo'ng'iroqlar yo'q."
            : "Hozircha qo'ng'iroqlar topilmadi."}
        </div>
      ) : (
        <ul className="overflow-hidden rounded-lg border bg-card shadow-xs">
          {calls.map((c, idx) => (
            <CallListItem key={c.id} call={c} isFirst={idx === 0} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CallListItem({ call, isFirst }: { call: RecentCall; isFirst: boolean }): JSX.Element {
  const [renameOpen, setRenameOpen] = useState(false);
  const customerNumber = call.direction === "INBOUND" ? call.fromNumber : call.toNumber;
  const placeholder = isPlaceholderContact(call.contact?.fullName);
  const Icon = iconFor(call);
  const tone = toneFor(call);

  return (
    <li
      className={cn(
        "group flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-surface/60",
        !isFirst && "border-t",
      )}
    >
      <div className="flex items-center gap-3">
        {/* Direction icon — semantic tone makes intent legible at a glance. */}
        <div className={cn("inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full", tone.bg)}>
          <Icon className={cn("h-4 w-4", tone.fg)} />
        </div>

        {/* Identity + meta column. */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span
              className={cn(
                "truncate font-medium",
                placeholder ? "text-warning" : "text-foreground",
              )}
            >
              {call.contact?.fullName ?? "Noma'lum"}
            </span>
            <span className="text-xs tabular-nums text-muted-foreground">{customerNumber}</span>
            <StatusPill status={call.status} />
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-muted-foreground">
            <span>{format(new Date(call.startedAt), "dd MMM HH:mm")}</span>
            {call.duration > 0 && (
              <>
                <Dot />
                <span className="tabular-nums">{formatDuration(call.duration)}</span>
              </>
            )}
            {call.operator && (
              <>
                <Dot />
                <span>{call.operator.fullName}</span>
              </>
            )}
          </p>
        </div>

        {/* Actions cluster. Quick rename, call-back, deep-link to card,
            deep-link to scorecard with "Tahlil" verb. */}
        <div className="flex shrink-0 items-center gap-1.5">
          {placeholder && call.contact && !renameOpen && (
            <Button size="sm" variant="outline" onClick={() => setRenameOpen(true)}>
              Kontakt
            </Button>
          )}
          {customerNumber && (
            <a
              href={`sip:${customerNumber.replace(/^\+/, "")}`}
              title="Qo'ng'iroq qilish (MicroSIP)"
              className="inline-flex h-8 items-center gap-1 rounded-md border bg-background px-2.5 text-xs font-medium shadow-xs transition-colors hover:bg-surface"
            >
              <Phone className="h-3.5 w-3.5" />
              Qo'ng'iroq
            </a>
          )}
          {call.cardId && (
            <Link
              to={`/kanban#card=${call.cardId}`}
              className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
              title="Karta'ga o'tish"
            >
              Karta
              <ExternalLink className="h-3 w-3" />
            </Link>
          )}
          <Link
            to={`/scorecard/${call.id}`}
            className="inline-flex h-8 items-center gap-1 rounded-md bg-primary/10 px-2.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
            title="Tahlil va QA ko'rish"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Tahlil
          </Link>
        </div>
      </div>

      {/* Inline contact rename — only when the operator clicks "Kontakt". */}
      {placeholder && call.contact && renameOpen && (
        <div className="ml-12 inset-surface p-3">
          <SaveUnknownContactForm
            contactId={call.contact.id}
            phone={customerNumber}
            variant="stacked"
            onSaved={() => setRenameOpen(false)}
            onCancel={() => setRenameOpen(false)}
          />
        </div>
      )}
    </li>
  );
}

// --- helpers --------------------------------------------------------------

function StatusPill({ status }: { status: string }): JSX.Element {
  const meta =
    status === "MISSED"
      ? { label: "Javobsiz", cls: "bg-destructive/10 text-destructive" }
      : status === "ANSWERED"
        ? { label: "Javob berilgan", cls: "bg-success/15 text-success" }
        : status === "BUSY"
          ? { label: "Band", cls: "bg-warning/20 text-warning" }
          : status === "FAILED"
            ? { label: "Xato", cls: "bg-destructive/10 text-destructive" }
            : status === "RINGING"
              ? { label: "Jiringlamoqda", cls: "bg-info/15 text-info" }
              : { label: status, cls: "bg-muted text-muted-foreground" };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-1.5 py-px text-2xs font-medium tracking-tightish",
        meta.cls,
      )}
    >
      {meta.label}
    </span>
  );
}

function Dot(): JSX.Element {
  return <span className="text-muted-foreground/40">·</span>;
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

function iconFor(call: RecentCall): typeof Phone {
  if (call.status === "MISSED") return PhoneMissed;
  if (call.direction === "INBOUND") return PhoneIncoming;
  if (call.direction === "OUTBOUND") return PhoneOutgoing;
  return Phone;
}

function toneFor(call: RecentCall): { bg: string; fg: string } {
  if (call.status === "MISSED") return { bg: "bg-destructive/10", fg: "text-destructive" };
  if (call.direction === "INBOUND") return { bg: "bg-success/15", fg: "text-success" };
  if (call.direction === "OUTBOUND") return { bg: "bg-info/15", fg: "text-info" };
  return { bg: "bg-muted", fg: "text-muted-foreground" };
}
