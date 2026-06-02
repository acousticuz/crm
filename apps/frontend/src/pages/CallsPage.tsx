import { useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import {
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Phone,
  ExternalLink,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  isPlaceholderContact,
  useRecentCalls,
  type RecentCall,
} from "@/hooks/useContacts";
import { SaveUnknownContactForm } from "@/components/contacts/SaveUnknownContactForm";

/**
 * Flat tenant-wide call feed. Each row exposes a quick rename action for
 * "Noma'lum" contacts so the operator can turn an unknown caller into a real
 * contact without leaving the page.
 */
export function CallsPage(): JSX.Element {
  const [missedOnly, setMissedOnly] = useState(false);
  const { data: calls = [], isLoading } = useRecentCalls({ missedOnly });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Qo'ng'iroqlar</h1>
        <Button
          size="sm"
          variant={missedOnly ? "default" : "outline"}
          onClick={() => setMissedOnly((v) => !v)}
        >
          <Filter className="mr-1 h-3 w-3" />
          {missedOnly ? "Hammasi" : "Faqat javobsiz"}
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Yuklanmoqda...</p>
      ) : calls.length === 0 ? (
        <p className="text-sm text-muted-foreground">Qo'ng'iroqlar topilmadi.</p>
      ) : (
        <ul className="space-y-2">
          {calls.map((c) => (
            <CallListItem key={c.id} call={c} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CallListItem({ call }: { call: RecentCall }): JSX.Element {
  const [renameOpen, setRenameOpen] = useState(false);
  const customerNumber = call.direction === "INBOUND" ? call.fromNumber : call.toNumber;
  const placeholder = isPlaceholderContact(call.contact?.fullName);
  const Icon = iconFor(call);
  const iconClass = colorFor(call);

  return (
    <li className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-3">
        <div className={cn("rounded-full p-2", iconClass.bg)}>
          <Icon className={cn("h-4 w-4", iconClass.fg)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                "font-medium",
                placeholder ? "text-amber-600 dark:text-amber-400" : undefined,
              )}
            >
              {call.contact?.fullName ?? "Noma'lum"}
            </span>
            <span className="text-xs text-muted-foreground">{customerNumber}</span>
            {call.status === "MISSED" && (
              <Badge color="#dc2626" className="text-[10px]">
                Javobsiz
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {format(new Date(call.startedAt), "dd MMM HH:mm")}
            {call.duration > 0 && ` · ${call.duration}s`}
            {call.operator && ` · ${call.operator.fullName}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {placeholder && call.contact && !renameOpen && (
            <Button size="sm" variant="outline" onClick={() => setRenameOpen(true)}>
              Kontakt sifatida saqlash
            </Button>
          )}
          {/* sip:NUMBER URI opens MicroSIP (or any registered SIP handler) on
              the operator's desktop. OUTBOUND call is logged via AMI events. */}
          {customerNumber && (
            <a
              href={`sip:${customerNumber.replace(/^\+/, "")}`}
              title="Qo'ng'iroq qilish (MicroSIP)"
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent"
            >
              <Phone className="h-3 w-3" />
              Qo'ng'iroq
            </a>
          )}
          {call.cardId && (
            <Link
              to={`/kanban#card=${call.cardId}`}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Karta <ExternalLink className="h-3 w-3" />
            </Link>
          )}
          <Link
            to={`/scorecard/${call.id}`}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Tahlil
          </Link>
        </div>
      </div>
      {placeholder && call.contact && renameOpen && (
        <div className="mt-2 rounded border bg-muted/40 p-2">
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

function iconFor(call: RecentCall): typeof Phone {
  if (call.status === "MISSED") return PhoneMissed;
  if (call.direction === "INBOUND") return PhoneIncoming;
  if (call.direction === "OUTBOUND") return PhoneOutgoing;
  return Phone;
}

function colorFor(call: RecentCall): { bg: string; fg: string } {
  if (call.status === "MISSED") return { bg: "bg-red-100 dark:bg-red-950/30", fg: "text-red-600" };
  if (call.direction === "INBOUND")
    return { bg: "bg-emerald-100 dark:bg-emerald-950/30", fg: "text-emerald-600" };
  return { bg: "bg-blue-100 dark:bg-blue-950/30", fg: "text-blue-600" };
}
