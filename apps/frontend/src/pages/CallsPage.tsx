import { useMemo, useState } from "react";
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
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Waveform } from "@/components/ui/waveform";
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
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  // Bump limit when filtering so a wide date range still returns everything
  // (backend caps at 500).
  const limit = dateFrom || dateTo ? 500 : 100;
  const filtersActive = Boolean(dateFrom || dateTo || missedOnly);

  const { data: calls = [], isLoading } = useRecentCalls(
    useMemo(
      () => ({
        missedOnly,
        limit,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
      [missedOnly, limit, dateFrom, dateTo],
    ),
  );

  function clearFilters() {
    setMissedOnly(false);
    setDateFrom("");
    setDateTo("");
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Telefoniya</p>
          <h1 className="font-display text-3xl font-semibold tracking-tightish text-foreground">
            Qo'ng'iroqlar
          </h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {calls.length} ta {missedOnly ? "javobsiz qo'ng'iroq" : "qo'ng'iroq"}
            {(dateFrom || dateTo) && (
              <>
                {" · "}
                {dateFrom || "boshidan"} – {dateTo || "bugungacha"}
              </>
            )}
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

      {/* Date range filter — backend sorts startedAt desc, so the latest call
          in the range lands at the top. Two date inputs match the Dashboard's
          range UX so operators don't learn two patterns. */}
      <div className="card-surface flex flex-wrap items-end gap-3 p-3">
        <div>
          <Label htmlFor="from" className="text-2xs uppercase tracking-wider">
            Sanadan
          </Label>
          <Input
            id="from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-40"
          />
        </div>
        <div>
          <Label htmlFor="to" className="text-2xs uppercase tracking-wider">
            Sanagacha
          </Label>
          <Input
            id="to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-40"
          />
        </div>
        {filtersActive && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-3.5 w-3.5" />
            Tozalash
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="card-surface flex h-32 items-center justify-center text-sm text-muted-foreground">
          Yuklanmoqda...
        </div>
      ) : calls.length === 0 ? (
        <div className="card-surface p-8 text-center text-sm text-muted-foreground">
          {filtersActive
            ? "Tanlangan filtrlar uchun qo'ng'iroqlar topilmadi."
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
            <span className="font-mono text-xs text-muted-foreground">{customerNumber}</span>
            <StatusPill status={call.status} />
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-2xs text-muted-foreground">
            <span>{format(new Date(call.startedAt), "dd MMM HH:mm")}</span>
            {call.duration > 0 && (
              <>
                <Dot />
                <span>{formatDuration(call.duration)}</span>
              </>
            )}
            {call.status !== "MISSED" && call.duration > 0 && (
              <>
                <Dot />
                <Waveform
                  seed={call.id}
                  bars={14}
                  className="h-3 text-muted-foreground/70"
                  title="Yozuv to'lqini"
                />
              </>
            )}
            {call.operator && (
              <>
                <Dot />
                <span className="font-sans">{call.operator.fullName}</span>
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
  // Soft Modern call status — chip pattern, semantic tone.
  const meta: { label: string; tone: "destructive" | "success" | "warning" | "info" | "muted" } =
    status === "MISSED"
      ? { label: "Javobsiz", tone: "destructive" }
      : status === "ANSWERED"
        ? { label: "Javob berilgan", tone: "success" }
        : status === "BUSY"
          ? { label: "Band", tone: "warning" }
          : status === "FAILED"
            ? { label: "Xato", tone: "destructive" }
            : status === "RINGING"
              ? { label: "Jiringlamoqda", tone: "info" }
              : { label: status, tone: "muted" };
  return (
    <span
      data-tone={meta.tone}
      className={cn(
        "chip text-2xs",
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
