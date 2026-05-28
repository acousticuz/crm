import { useEffect, useState } from "react";
import { Phone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useIncomingCallListener,
  type IncomingCallPayload,
} from "@/hooks/useKanban";

/**
 * Renders a fixed-position "screen-pop" notification when an inbound call
 * arrives at the tenant. Auto-dismisses after 30 seconds. Mounted from
 * AppLayout so it's visible on every authenticated page.
 */
export function IncomingCallToast(): JSX.Element | null {
  const [active, setActive] = useState<IncomingCallPayload | null>(null);

  useIncomingCallListener((payload) => {
    setActive(payload);
  });

  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setActive(null), 30_000);
    return () => clearTimeout(t);
  }, [active]);

  if (!active) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 rounded-lg border bg-card shadow-xl">
      <div className="flex items-center gap-3 border-b p-3">
        <div className="rounded-full bg-primary/10 p-2 text-primary">
          <Phone className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold">Kirish qo'ng'iroq</p>
          <p className="text-xs text-muted-foreground">{active.fromNumber}</p>
        </div>
        <button
          type="button"
          onClick={() => setActive(null)}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="p-3 text-sm">
        {active.contact ? (
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
                  // Best-effort deep-link to the card; KanbanPage doesn't yet
                  // accept a query param to auto-open, but we navigate there.
                  window.location.assign(`/kanban#card=${active.card?.id ?? ""}`);
                }}
              >
                Kartani ochish
              </Button>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Bu raqamga mos kontakt topilmadi — javob bering va yangi kontakt yarating.
          </p>
        )}
      </div>
    </div>
  );
}
