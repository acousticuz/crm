import { useEffect, useState } from "react";
import { Phone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useIncomingCallListener,
  type IncomingCallPayload,
} from "@/hooks/useKanban";
import { isPlaceholderContact } from "@/hooks/useContacts";
import { SaveUnknownContactForm } from "@/components/contacts/SaveUnknownContactForm";

/**
 * Renders a fixed-position "screen-pop" notification when an inbound call
 * arrives at the tenant. Auto-dismisses after 30 seconds. Mounted from
 * AppLayout so it's visible on every authenticated page.
 */
export function IncomingCallToast(): JSX.Element | null {
  const [active, setActive] = useState<IncomingCallPayload | null>(null);
  const [showSaveForm, setShowSaveForm] = useState(false);

  useIncomingCallListener((payload) => {
    setActive(payload);
    setShowSaveForm(false);
  });

  useEffect(() => {
    if (!active) return;
    // Don't auto-dismiss while the operator is entering a contact name —
    // losing the form mid-typing would be infuriating.
    if (showSaveForm) return;
    const t = setTimeout(() => setActive(null), 30_000);
    return () => clearTimeout(t);
  }, [active, showSaveForm]);

  if (!active) return null;

  const isPlaceholder = isPlaceholderContact(active.contact?.fullName);

  return (
    // Soft Modern toast — left accent border per the design brief; sits in
    // the bottom-right on desktop and slides up from below on mobile.
    <div
      className={cn(
        "fixed z-50 w-80 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-lg border-l-4 border-l-primary border-y border-r bg-card shadow-modal",
        "bottom-20 right-3 md:bottom-6 md:right-6",
      )}
    >
      <div className="flex items-center gap-3 border-b p-3">
        <div className="rounded-full bg-primary-soft p-2 text-primary-soft-foreground">
          <Phone className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Kirish qo'ng'iroq</p>
          <p className="font-mono text-xs text-muted-foreground">{active.fromNumber}</p>
        </div>
        <button
          type="button"
          onClick={() => setActive(null)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
          aria-label="Yopish"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="p-3 text-sm">
        {active.contact && !isPlaceholder ? (
          <>
            <p className="font-medium">{active.contact.fullName}</p>
            {active.contact.email && (
              <p className="text-xs text-muted-foreground">{active.contact.email}</p>
            )}
            {active.card && (
              <p className="mt-1 text-xs text-muted-foreground">
                Karta: <span className="font-medium">{active.card.title}</span>
              </p>
            )}
            {active.card && (
              <Button
                size="sm"
                className="mt-2 w-full"
                onClick={() => {
                  setActive(null);
                  window.location.assign(`/kanban#card=${active.card?.id ?? ""}`);
                }}
              >
                Kartani ochish
              </Button>
            )}
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Bu raqam kontaktlarda yo'q ({active.contact?.fullName ?? "Noma'lum"} sifatida saqlandi).
              Mijoz ismini kiriting:
            </p>
            {active.contact && showSaveForm ? (
              <div className="mt-2">
                <SaveUnknownContactForm
                  contactId={active.contact.id}
                  phone={active.fromNumber}
                  variant="stacked"
                  onSaved={() => {
                    setShowSaveForm(false);
                    setActive(null);
                  }}
                  onCancel={() => setShowSaveForm(false)}
                />
              </div>
            ) : (
              active.contact && (
                <Button
                  size="sm"
                  className="mt-2 w-full"
                  onClick={() => setShowSaveForm(true)}
                >
                  Kontakt sifatida saqlash
                </Button>
              )
            )}
            {active.card && (
              <Button
                size="sm"
                variant="outline"
                className="mt-2 w-full"
                onClick={() => {
                  setActive(null);
                  window.location.assign(`/kanban#card=${active.card?.id ?? ""}`);
                }}
              >
                Kartani ochish
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
