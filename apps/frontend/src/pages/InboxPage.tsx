import { useMemo, useState } from "react";
import { format } from "date-fns";
import { AlertTriangle, Check, MessageCircle, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  useApproveDraft,
  useInboxThread,
  useInboxThreads,
  useInboxRealtime,
  useLinkInboxThreadPhone,
  useRejectDraft,
  useSendInboxMessage,
  type InboxMessage,
} from "@/hooks/useInbox";
import {
  ACOUSTIC_BRANCHES,
  renderBranchBlock,
  renderRegionList,
} from "@/lib/acousticBranches";

const SENSITIVITY_LABEL: Record<string, string> = {
  medical: "Tibbiy",
  pricing: "Narx",
  legal: "Yuridik",
};

export function InboxPage(): JSX.Element {
  useInboxRealtime();
  const { data: threads = [] } = useInboxThreads("OPEN");
  const [activeId, setActiveId] = useState<string | null>(null);
  const { data: thread } = useInboxThread(activeId);
  const approveDraft = useApproveDraft();
  const rejectDraft = useRejectDraft();
  const sendManual = useSendInboxMessage();
  const linkPhone = useLinkInboxThreadPhone();

  const messages = useMemo(() => thread?.messages ?? [], [thread]);
  const draft = messages.find((m) => m.status === "DRAFT" || m.status === "NEEDS_REVIEW");
  // Static directory of 21 acoustic.uz branches. No DB dependency — the
  // customer always sees the canonical address + phone the website lists.
  const templates = useMemo(() => buildQuickTemplates(), []);

  return (
    <div className="grid h-[calc(100vh-7rem)] grid-cols-1 gap-4 md:grid-cols-[320px,1fr]">
      <aside className="overflow-y-auto rounded-lg border bg-card shadow-xs">
        <div className="border-b p-4">
          <p className="eyebrow mb-1">Omnichannel</p>
          <h2 className="font-display text-base font-semibold tracking-tightish text-foreground">
            Inbox
          </h2>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {threads.length} ochiq suhbat
          </p>
        </div>
        <ul className="divide-y">
          {threads.length === 0 && (
            <li className="p-3 text-xs text-muted-foreground">Hozircha suhbatlar yo'q.</li>
          )}
          {threads.map((t) => {
            const last = t.messages[0];
            return (
              <li
                key={t.id}
                role="button"
                tabIndex={0}
                onClick={() => setActiveId(t.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setActiveId(t.id);
                }}
                className={cn(
                  "cursor-pointer p-3 transition-colors hover:bg-surface/60",
                  activeId === t.id && "bg-accent text-accent-foreground hover:bg-accent",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">
                    {t.contact?.fullName ?? "Noma'lum mijoz"}
                  </span>
                  <Badge>{t.channel}</Badge>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {last?.text ?? "—"}
                </p>
                <p className="mt-1 font-mono text-2xs text-muted-foreground">
                  {format(new Date(t.lastMessageAt), "dd MMM HH:mm")}
                </p>
              </li>
            );
          })}
        </ul>
      </aside>

      <section className="flex flex-col overflow-hidden rounded-lg border bg-card shadow-xs">
        {!thread ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
            <MessageCircle className="h-4 w-4" />
            Suhbatni tanlang
          </div>
        ) : (
          <>
            <header className="border-b p-4">
              <p className="font-display text-base font-semibold tracking-tightish text-foreground">
                {thread.contact?.fullName ?? "Noma'lum mijoz"}
                <span className="ml-2 font-mono text-xs font-normal uppercase tracking-wider text-muted-foreground">
                  {thread.channel}
                </span>
              </p>
              <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                {thread.contact?.phones?.[0] ?? "telefon yo'q"}
              </p>
              {thread.contact?.phones?.length ? null : (
                <ContactPhonePanel
                  pending={linkPhone.isPending}
                  defaultName={thread.contact?.fullName ?? ""}
                  onSave={(phone, fullName) =>
                    linkPhone.mutate({ threadId: thread.id, phone, fullName })
                  }
                />
              )}
            </header>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.map((m) => (
                <MessageRow key={m.id} message={m} />
              ))}
            </div>
            {draft ? (
              <DraftEditor
                message={draft}
                templates={templates}
                onApprove={(text) => approveDraft.mutate({ messageId: draft.id, text })}
                onReject={(reason) => rejectDraft.mutate({ messageId: draft.id, reason })}
                pending={approveDraft.isPending || rejectDraft.isPending}
              />
            ) : (
              <ManualSender
                templates={templates}
                onSend={(text) => sendManual.mutate({ threadId: thread.id, text })}
                pending={sendManual.isPending}
              />
            )}
          </>
        )}
      </section>
    </div>
  );
}

interface QuickTemplate {
  /** Tugma yorlig'i — 1–2 so'z, chip ichida ko'rinadi. */
  label: string;
  /** Textarea'ga qo'yiladigan to'liq matn. */
  text: string;
  /** Filial nomi (bo'lsa) — chiplarni guruhlash uchun. */
  branchKey?: string;
}

/**
 * Static quick-reply directory for the Inbox. Built from the 21 branches
 * listed on acoustic.uz/branches. Three buckets:
 *   1. Soliciting customer phone (kept first — the most common operator action)
 *   2. City/region overviews (Toshkent / Viloyatlar)
 *   3. One template per real branch, with address + phone + Yandex.Maps link
 *
 * The directory lives in src/lib/acousticBranches.ts; this builder just
 * arranges it into the chip order operators see.
 */
function buildQuickTemplates(): QuickTemplate[] {
  return [
    {
      label: "Telefon so'rash",
      text: "Telefon raqamingizni yuboring, operatorimiz siz bilan bog'lanadi.",
    },
    {
      label: "Qaysi filial",
      text: "Sizga qaysi shahar yoki tuman qulay? Eng yaqin filialni ko'rsataman.",
    },
    {
      label: "Toshkent filiallari",
      text: renderRegionList("tashkent"),
    },
    {
      label: "Viloyat filiallari",
      text: renderRegionList("region"),
    },
    ...ACOUSTIC_BRANCHES.map((b) => ({
      label: b.shortName,
      text: renderBranchBlock(b),
      branchKey: b.shortName,
    })),
  ];
}

function QuickTemplates({
  templates,
  onPick,
}: {
  templates: QuickTemplate[];
  onPick: (text: string) => void;
}) {
  if (templates.length === 0) return null;
  // 4 high-level + 21 branch chips. Wrap on small screens; the cap-height
  // is fixed by the parent's scroll so the editor still fits.
  return (
    <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
      {templates.map((t) => (
        <Button
          key={t.label}
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => onPick(t.text)}
          className="h-7 px-2.5"
        >
          {t.label}
        </Button>
      ))}
    </div>
  );
}

function ContactPhonePanel({
  defaultName,
  pending,
  onSave,
}: {
  defaultName: string;
  pending: boolean;
  onSave: (phone: string, fullName?: string) => void;
}) {
  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState(defaultName === "Noma'lum" ? "" : defaultName);
  const submit = () => {
    if (!phone.trim()) return;
    onSave(phone.trim(), fullName.trim() || undefined);
    setPhone("");
  };
  return (
    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
      <Input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder="Telefon raqam"
        className="h-8 sm:max-w-[180px]"
      />
      <Input
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        placeholder="Ism (ixtiyoriy)"
        className="h-8 sm:max-w-[220px]"
      />
      <Button size="sm" disabled={pending || !phone.trim()} onClick={submit}>
        Kontaktga saqlash
      </Button>
    </div>
  );
}

function MessageRow({ message }: { message: InboxMessage }) {
  const outbound = message.direction === "OUTBOUND";
  const isDraft = message.status === "DRAFT" || message.status === "NEEDS_REVIEW";
  return (
    <div className={cn("flex", outbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          // Soft Modern chat bubble: 14px radius, soft card shadow.
          "max-w-[78%] rounded-lg px-4 py-2.5 text-sm leading-relaxed shadow-card",
          outbound ? "bg-primary text-primary-foreground" : "bg-card text-foreground border",
          isDraft && "border-2 border-dashed border-warning bg-warning-soft text-foreground",
        )}
      >
        <div
          className={cn(
            "mb-1 font-mono text-2xs uppercase tracking-wider",
            outbound ? "text-primary-foreground/70" : "text-muted-foreground",
          )}
        >
          {message.sender} · {message.status}
        </div>
        <p className="whitespace-pre-wrap">{message.text}</p>
        {message.sensitiveCategories.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {message.sensitiveCategories.map((c) => (
              <span key={c} className="chip" data-tone="destructive">
                <AlertTriangle className="h-3 w-3" />
                {SENSITIVITY_LABEL[c] ?? c}
              </span>
            ))}
          </div>
        )}
        {message.rejectionReason && (
          <p className="mt-1.5 text-2xs italic opacity-80">Rad: {message.rejectionReason}</p>
        )}
      </div>
    </div>
  );
}

function DraftEditor({
  message,
  onApprove,
  onReject,
  pending,
  templates,
}: {
  message: InboxMessage;
  onApprove: (text: string) => void;
  onReject: (reason: string) => void;
  pending: boolean;
  templates: QuickTemplate[];
}) {
  const [text, setText] = useState(message.text);
  const [rejectReason, setRejectReason] = useState("");
  const blocking = message.sensitiveCategories.length > 0;
  return (
    <div className="space-y-2 border-t p-3">
      {blocking && (
        <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" />
          <div className="space-y-1">
            <p className="font-medium text-foreground">
              Avtomatik yuborilmaydi:{" "}
              {message.sensitiveCategories.map((c) => SENSITIVITY_LABEL[c] ?? c).join(", ")}.
            </p>
            <p className="text-muted-foreground">
              Operator matnni ko'rib chiqib, tasdiqlashi kerak.
            </p>
          </div>
        </div>
      )}
      <QuickTemplates templates={templates} onPick={setText} />
      <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[100px]" />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pending || !text.trim()} onClick={() => onApprove(text)}>
          <Check className="mr-1 h-4 w-4" />
          Tasdiqlash va yuborish
        </Button>
        <Input
          placeholder="Rad sababini yozing"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          className="max-w-xs"
        />
        <Button
          size="sm"
          variant="ghost"
          disabled={pending || !rejectReason.trim()}
          onClick={() => onReject(rejectReason)}
        >
          <X className="mr-1 h-4 w-4" />
          Rad etish
        </Button>
      </div>
    </div>
  );
}

function ManualSender({
  onSend,
  pending,
  templates,
}: {
  onSend: (text: string) => void;
  pending: boolean;
  templates: QuickTemplate[];
}) {
  const [text, setText] = useState("");
  const submit = () => {
    if (pending || !text.trim()) return;
    onSend(text);
    setText("");
  };
  return (
    <div className="space-y-2 border-t p-3">
      <QuickTemplates templates={templates} onPick={setText} />
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Manual javob yozing..."
        className="min-h-[80px]"
      />
      <Button
        size="sm"
        disabled={pending || !text.trim()}
        onClick={submit}
      >
        <Send className="mr-1 h-4 w-4" />
        Yuborish
      </Button>
    </div>
  );
}
