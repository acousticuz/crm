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
  useRejectDraft,
  useSendInboxMessage,
  type InboxMessage,
} from "@/hooks/useInbox";

const SENSITIVITY_LABEL: Record<string, string> = {
  medical: "Tibbiy",
  pricing: "Narx",
  legal: "Yuridik",
};

export function InboxPage(): JSX.Element {
  const { data: threads = [] } = useInboxThreads("OPEN");
  const [activeId, setActiveId] = useState<string | null>(null);
  const { data: thread } = useInboxThread(activeId);
  const approveDraft = useApproveDraft();
  const rejectDraft = useRejectDraft();
  const sendManual = useSendInboxMessage();

  const messages = useMemo(() => thread?.messages ?? [], [thread]);
  const draft = messages.find((m) => m.status === "DRAFT" || m.status === "NEEDS_REVIEW");

  return (
    <div className="grid h-[calc(100vh-7rem)] grid-cols-1 gap-4 md:grid-cols-[320px,1fr]">
      <aside className="overflow-y-auto rounded-lg border bg-card">
        <div className="border-b p-3">
          <h2 className="text-sm font-semibold">Inbox</h2>
          <p className="text-xs text-muted-foreground">{threads.length} ochiq suhbat</p>
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
                  "cursor-pointer p-3 hover:bg-accent",
                  activeId === t.id && "bg-accent",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {t.contact?.fullName ?? "Noma'lum mijoz"}
                  </span>
                  <Badge>{t.channel}</Badge>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {last?.text ?? "—"}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {format(new Date(t.lastMessageAt), "dd MMM HH:mm")}
                </p>
              </li>
            );
          })}
        </ul>
      </aside>

      <section className="flex flex-col overflow-hidden rounded-lg border bg-card">
        {!thread ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            <MessageCircle className="mr-2 h-4 w-4" />
            Suhbatni tanlang
          </div>
        ) : (
          <>
            <header className="border-b p-3">
              <p className="text-sm font-semibold">
                {thread.contact?.fullName ?? "Noma'lum mijoz"} · {thread.channel}
              </p>
              <p className="text-xs text-muted-foreground">
                {thread.contact?.phones?.[0] ?? "telefon yo'q"}
              </p>
            </header>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.map((m) => (
                <MessageRow key={m.id} message={m} />
              ))}
            </div>
            {draft ? (
              <DraftEditor
                message={draft}
                onApprove={(text) => approveDraft.mutate({ messageId: draft.id, text })}
                onReject={(reason) => rejectDraft.mutate({ messageId: draft.id, reason })}
                pending={approveDraft.isPending || rejectDraft.isPending}
              />
            ) : (
              <ManualSender
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

function MessageRow({ message }: { message: InboxMessage }) {
  const outbound = message.direction === "OUTBOUND";
  const isDraft = message.status === "DRAFT" || message.status === "NEEDS_REVIEW";
  return (
    <div className={cn("flex", outbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[78%] rounded-lg px-3 py-2 text-sm",
          outbound ? "bg-primary text-primary-foreground" : "bg-muted",
          isDraft && "border-2 border-dashed border-amber-500 bg-amber-50 text-foreground",
        )}
      >
        <div className="mb-1 text-[10px] uppercase tracking-wide opacity-70">
          {message.sender} · {message.status}
        </div>
        <p className="whitespace-pre-wrap">{message.text}</p>
        {message.sensitiveCategories.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {message.sensitiveCategories.map((c) => (
              <Badge key={c} color="#dc2626">
                <AlertTriangle className="mr-1 h-3 w-3 inline" />
                {SENSITIVITY_LABEL[c] ?? c}
              </Badge>
            ))}
          </div>
        )}
        {message.rejectionReason && (
          <p className="mt-1 text-[10px] italic">Rad: {message.rejectionReason}</p>
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
}: {
  message: InboxMessage;
  onApprove: (text: string) => void;
  onReject: (reason: string) => void;
  pending: boolean;
}) {
  const [text, setText] = useState(message.text);
  const [rejectReason, setRejectReason] = useState("");
  const blocking = message.sensitiveCategories.length > 0;
  return (
    <div className="space-y-2 border-t p-3">
      {blocking && (
        <div className="flex items-start gap-2 rounded bg-amber-50 p-2 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            <p className="font-medium">
              Avtomatik yuborilmaydi: {message.sensitiveCategories
                .map((c) => SENSITIVITY_LABEL[c] ?? c)
                .join(", ")}.
            </p>
            <p>Operator matnni ko'rib chiqib, tasdiqlashi kerak.</p>
          </div>
        </div>
      )}
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

function ManualSender({ onSend, pending }: { onSend: (text: string) => void; pending: boolean }) {
  const [text, setText] = useState("");
  return (
    <div className="space-y-2 border-t p-3">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Manual javob yozing..."
        className="min-h-[80px]"
      />
      <Button
        size="sm"
        disabled={pending || !text.trim()}
        onClick={() => {
          onSend(text);
          setText("");
        }}
      >
        <Send className="mr-1 h-4 w-4" />
        Yuborish
      </Button>
    </div>
  );
}
