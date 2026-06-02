import { useState } from "react";
import { UserPlus, Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUpdateContact } from "@/hooks/useContacts";

interface Props {
  contactId: string;
  phone: string;
  // Pre-fill name; usually empty so the operator types the real one.
  initialName?: string;
  size?: "sm" | "xs";
  variant?: "inline" | "stacked";
  onSaved?: () => void;
  onCancel?: () => void;
}

/**
 * Quick rename form for "Noma'lum" placeholder contacts created automatically
 * from an unknown inbound number. We always PATCH the existing contact (rather
 * than creating a new one) so the call/card/SMS history stays linked.
 */
export function SaveUnknownContactForm({
  contactId,
  phone,
  initialName = "",
  size = "sm",
  variant = "stacked",
  onSaved,
  onCancel,
}: Props): JSX.Element {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateContact();

  async function submit(): Promise<void> {
    setError(null);
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("Ism kamida 2 belgi bo'lsin");
      return;
    }
    try {
      await update.mutateAsync({
        id: contactId,
        data: {
          fullName: trimmed,
          ...(email.trim() ? { email: email.trim() } : {}),
        },
      });
      setName("");
      setEmail("");
      onSaved?.();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
      setError(typeof msg === "string" ? msg : "Saqlashda xato");
    }
  }

  const inputClass = size === "xs" ? "h-8 text-xs" : "h-9 text-sm";

  return (
    <div className={variant === "inline" ? "flex items-center gap-1" : "space-y-1.5"}>
      <Input
        className={inputClass}
        placeholder="Mijoz ismi (majburiy)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") onCancel?.();
        }}
      />
      {variant === "stacked" && (
        <Input
          className={inputClass}
          type="email"
          placeholder="Email (ixtiyoriy)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      )}
      <div className={variant === "inline" ? "flex gap-1" : "flex gap-1 pt-0.5"}>
        <Button size={size === "xs" ? "sm" : "sm"} onClick={submit} disabled={update.isPending}>
          {update.isPending ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <Check className="mr-1 h-3 w-3" />
          )}
          Saqlash
        </Button>
        {onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
      {variant === "stacked" && (
        <p className="text-xs text-muted-foreground">
          Raqam: <strong>{phone}</strong>
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

interface TriggerProps {
  contactId: string;
  phone: string;
  label?: string;
  size?: "sm" | "xs";
  onSaved?: () => void;
}

/**
 * Collapsed entry point: a small button that expands into the rename form
 * inline. Use anywhere a "Noma'lum" contact is shown alongside its phone.
 */
export function SaveUnknownContactButton({
  contactId,
  phone,
  label = "Kontakt sifatida saqlash",
  size = "sm",
  onSaved,
}: TriggerProps): JSX.Element {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button
        size="sm"
        variant="outline"
        className={size === "xs" ? "h-7 px-2 text-xs" : undefined}
        onClick={() => setOpen(true)}
      >
        <UserPlus className="mr-1 h-3 w-3" />
        {label}
      </Button>
    );
  }
  return (
    <SaveUnknownContactForm
      contactId={contactId}
      phone={phone}
      size={size}
      onSaved={() => {
        setOpen(false);
        onSaved?.();
      }}
      onCancel={() => setOpen(false)}
    />
  );
}
