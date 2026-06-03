import { useState } from "react";
import { format } from "date-fns";
import { Phone, MessageSquare, Plus, Pencil } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import {
  useAnalyzeCall,
  useAttachTag,
  useBranches,
  useCardDetail,
  useCreateNote,
  useCreateTag,
  useCreateTask,
  useDetachTag,
  useScorecard,
  useSendSms,
  useSetCallBranch,
  useSmsSettings,
  useSmsTemplates,
  useTags,
  useUsers,
} from "@/hooks/useKanban";
import { isPlaceholderContact } from "@/hooks/useContacts";
import { SaveUnknownContactForm } from "@/components/contacts/SaveUnknownContactForm";

interface Props {
  cardId: string | null;
  onClose: () => void;
}

export function CardDetailSheet({ cardId, onClose }: Props): JSX.Element {
  const open = !!cardId;
  const { data: card } = useCardDetail(cardId);
  const { data: tags = [] } = useTags();
  const { data: users = [] } = useUsers();
  const { data: smsTemplates = [] } = useSmsTemplates();
  const { data: smsSettings } = useSmsSettings();
  const attachTag = useAttachTag();
  const detachTag = useDetachTag();
  const createNote = useCreateNote();
  const createTask = useCreateTask();
  const sendSms = useSendSms();

  const [noteText, setNoteText] = useState("");
  const [taskText, setTaskText] = useState("");
  const [taskAssignee, setTaskAssignee] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [smsOpen, setSmsOpen] = useState(false);
  const [smsTemplateId, setSmsTemplateId] = useState("");
  const [smsText, setSmsText] = useState("");
  const [smsError, setSmsError] = useState<string | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);

  const attachedTagIds = new Set(card?.cardTags?.map((ct) => ct.tagId) ?? []);
  const contactIsPlaceholder = card ? isPlaceholderContact(card.contact.fullName) : false;

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent>
        {!card ? (
          <p className="text-sm text-muted-foreground">Yuklanmoqda...</p>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>{card.title}</SheetTitle>
              <SheetDescription>
                <span className={contactIsPlaceholder ? "text-amber-600 font-medium" : undefined}>
                  {card.contact.fullName}
                </span>
                {card.contact.phones[0] && ` · ${card.contact.phones[0]}`}
                {contactIsPlaceholder && !renameOpen && (
                  <button
                    type="button"
                    onClick={() => setRenameOpen(true)}
                    className="ml-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Pencil className="h-3 w-3" />
                    Ismni kiriting
                  </button>
                )}
              </SheetDescription>
              {contactIsPlaceholder && renameOpen && card.contact.phones[0] && (
                <div className="mt-2 rounded border bg-amber-50 p-2 dark:bg-amber-950/30">
                  <p className="mb-1.5 text-xs text-muted-foreground">
                    Bu kontakt avtomatik yaratilgan. Mijoz ismini kiriting:
                  </p>
                  <SaveUnknownContactForm
                    contactId={card.contact.id}
                    phone={card.contact.phones[0]}
                    variant="stacked"
                    onSaved={() => setRenameOpen(false)}
                    onCancel={() => setRenameOpen(false)}
                  />
                </div>
              )}
            </SheetHeader>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Aloqa</h3>
              <div className="flex flex-wrap gap-2">
                {/* sip:NUMBER URI — OS opens the registered SIP handler (MicroSIP on
                    operator desktops). FreePBX AMI events still log the OUTBOUND
                    call automatically; no server round-trip needed here. */}
                <a
                  href={
                    card.contact.phones[0]
                      ? `sip:${card.contact.phones[0].replace(/^\+/, "")}`
                      : undefined
                  }
                  aria-disabled={!card.contact.phones[0]}
                  className={!card.contact.phones[0] ? "pointer-events-none" : undefined}
                >
                  <Button size="sm" variant="outline" disabled={!card.contact.phones[0]}>
                    <Phone className="mr-1 h-4 w-4" />
                    Qo'ng'iroq qilish
                  </Button>
                </a>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSmsOpen((v) => !v);
                    setSmsError(null);
                  }}
                  disabled={!card.contact.phones[0]}
                >
                  <MessageSquare className="mr-1 h-4 w-4" />
                  SMS yuborish
                </Button>
              </div>
              {smsOpen && (
                <div className="space-y-2 rounded border bg-muted/30 p-2">
                  <div className="text-xs text-muted-foreground">
                    Qabul qiluvchi: <strong>{card.contact.phones[0] ?? "—"}</strong>
                    {smsSettings?.provider && (
                      <span className="ml-2">
                        · Provayder: <strong>{smsSettings.provider}</strong>
                      </span>
                    )}
                  </div>
                  {/* Eskiz rejects free-text bodies — when the tenant hasn't
                      explicitly enabled allowFreeText, force template choice. */}
                  {smsTemplates.length === 0 ? (
                    <div className="rounded bg-amber-100 px-2 py-1 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                      Hech qanday template yo'q. Settings → SMS xizmati'da "Template'larni
                      sync qilish" tugmasini bosing yoki qo'lda template yarating.
                    </div>
                  ) : (
                    <select
                      className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                      value={smsTemplateId}
                      onChange={(e) => {
                        setSmsTemplateId(e.target.value);
                        const t = smsTemplates.find((s) => s.id === e.target.value);
                        if (t) setSmsText(t.body);
                      }}
                    >
                      <option value="">Template tanlang…</option>
                      {smsTemplates.map((t) => {
                        const notApproved =
                          !!t.externalProvider && t.externalStatus && t.externalStatus !== "service";
                        return (
                          <option key={t.id} value={t.id} disabled={!!notApproved}>
                            {t.name}
                            {notApproved ? ` (${t.externalStatus} — yuborib bo'lmaydi)` : ""}
                          </option>
                        );
                      })}
                    </select>
                  )}
                  {smsTemplateId && (
                    <div className="rounded border bg-background p-2 text-xs">
                      <div className="mb-1 text-muted-foreground">Yuboriladigan matn:</div>
                      <div className="whitespace-pre-wrap">
                        {fillVariables(smsText, {
                          ism: card.contact.fullName,
                          sana: new Date().toLocaleDateString("uz-UZ"),
                          summa: card.budget ?? "",
                        })}
                      </div>
                    </div>
                  )}
                  {smsSettings?.allowFreeText && (
                    <Textarea
                      placeholder="Erkin matn (faqat provayder ruxsat bersa) — Eskiz odatda tasdiqlangan template'lar talab qiladi"
                      value={smsTemplateId ? "" : smsText}
                      disabled={!!smsTemplateId}
                      onChange={(e) => setSmsText(e.target.value)}
                    />
                  )}
                  {smsError && (
                    <div className="rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">
                      {smsError}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={
                        sendSms.isPending ||
                        (!smsTemplateId && !(smsSettings?.allowFreeText && smsText))
                      }
                      onClick={async () => {
                        setSmsError(null);
                        try {
                          await sendSms.mutateAsync({
                            cardId: card.id,
                            contactId: card.contact.id,
                            phone: card.contact.phones[0],
                            templateId: smsTemplateId || undefined,
                            text: smsTemplateId ? undefined : smsText,
                            variables: {
                              ism: card.contact.fullName,
                              sana: new Date().toLocaleDateString("uz-UZ"),
                              summa: card.budget ?? "",
                            },
                          });
                          setSmsOpen(false);
                          setSmsText("");
                          setSmsTemplateId("");
                        } catch (err) {
                          const msg =
                            (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
                            "SMS yuborishda xato";
                          setSmsError(typeof msg === "string" ? msg : JSON.stringify(msg));
                        }
                      }}
                    >
                      {sendSms.isPending ? "Yuborilmoqda..." : "Yuborish"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setSmsOpen(false)}>
                      Bekor
                    </Button>
                  </div>
                </div>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Teglar</h3>
              <div className="flex flex-wrap gap-1">
                {tags.length === 0 && (
                  <span className="text-xs text-muted-foreground">Tenant'da teg yaratilmagan</span>
                )}
                {tags.map((t) => {
                  const attached = attachedTagIds.has(t.id);
                  return (
                    <button
                      type="button"
                      key={t.id}
                      onClick={() =>
                        attached
                          ? detachTag.mutate({ cardId: card.id, tagId: t.id })
                          : attachTag.mutate({ cardId: card.id, tagId: t.id })
                      }
                    >
                      <Badge color={t.color} className={attached ? "ring-2 ring-offset-1" : undefined}>
                        {t.name}
                      </Badge>
                    </button>
                  );
                })}
              </div>
              <InlineCreateTag
                onCreated={(tagId) => {
                  // Auto-attach the freshly created tag — that's why the
                  // operator created it in the first place.
                  attachTag.mutate({ cardId: card.id, tagId });
                }}
              />
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Vazifalar ({card.tasks.length})</h3>
              <ul className="space-y-1 text-sm">
                {card.tasks.map((t) => (
                  <li key={t.id} className="flex items-center justify-between rounded border bg-card px-2 py-1">
                    <div>
                      <p className={t.completedAt ? "line-through text-muted-foreground" : ""}>{t.text}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(t.dueAt), "dd MMM HH:mm")} · {t.assignee?.fullName ?? "—"}
                      </p>
                    </div>
                  </li>
                ))}
                {card.tasks.length === 0 && (
                  <li className="text-xs text-muted-foreground">Vazifa yo'q</li>
                )}
              </ul>
              <div className="space-y-1 rounded border bg-muted/30 p-2">
                <Input
                  placeholder="Yangi vazifa matni"
                  value={taskText}
                  onChange={(e) => setTaskText(e.target.value)}
                />
                <div className="flex gap-1">
                  <Input
                    type="datetime-local"
                    value={taskDue}
                    onChange={(e) => setTaskDue(e.target.value)}
                  />
                  <select
                    className="h-10 flex-1 rounded-md border bg-background px-2 text-sm"
                    value={taskAssignee}
                    onChange={(e) => setTaskAssignee(e.target.value)}
                  >
                    <option value="">Mas'ul tanlang</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  size="sm"
                  disabled={!taskText || !taskDue || !taskAssignee}
                  onClick={async () => {
                    await createTask.mutateAsync({
                      cardId: card.id,
                      text: taskText,
                      assigneeId: taskAssignee,
                      dueAt: new Date(taskDue).toISOString(),
                    });
                    setTaskText("");
                    setTaskDue("");
                  }}
                >
                  <Plus className="mr-1 h-4 w-4" /> Vazifa qo'shish
                </Button>
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Izohlar ({card.notes.length})</h3>
              <ul className="space-y-1 text-sm">
                {card.notes.map((n) => (
                  <li key={n.id} className="rounded border bg-card px-2 py-1">
                    <p>{n.text}</p>
                    <p className="text-xs text-muted-foreground">
                      {n.author?.fullName ?? "—"} · {format(new Date(n.createdAt), "dd MMM HH:mm")}
                    </p>
                  </li>
                ))}
                {card.notes.length === 0 && (
                  <li className="text-xs text-muted-foreground">Izoh yo'q</li>
                )}
              </ul>
              <div className="space-y-1 rounded border bg-muted/30 p-2">
                <Textarea
                  placeholder="Yangi izoh..."
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                />
                <Button
                  size="sm"
                  disabled={!noteText}
                  onClick={async () => {
                    await createNote.mutateAsync({ cardId: card.id, text: noteText });
                    setNoteText("");
                  }}
                >
                  <Plus className="mr-1 h-4 w-4" /> Izoh qo'shish
                </Button>
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Qo'ng'iroqlar tarixi (oxirgi 5)</h3>
              {card.calls.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Hozircha qo'ng'iroqlar yo'q. Yuqoridagi "Qo'ng'iroq qilish" tugmasini bosing.
                </p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {card.calls.map((c) => (
                    <CallRow key={c.id} call={c} />
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">SMS tarixi (oxirgi 5)</h3>
              {card.smsLogs.length === 0 ? (
                <p className="text-xs text-muted-foreground">Hech qanday SMS yuborilmagan.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {card.smsLogs.map((s) => (
                    <li key={s.id} className="rounded border bg-card px-2 py-1">
                      <div className="text-xs text-muted-foreground">
                        {s.phone} · {s.status} · {format(new Date(s.createdAt), "dd MMM HH:mm")}
                      </div>
                      <div className="truncate">{s.text}</div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

interface CallRowProps {
  call: {
    id: string;
    direction: string;
    status: string;
    startedAt: string;
    duration: number;
    branch?: { id: string; name: string } | null;
    operator?: { id: string; fullName: string; extension?: string | null } | null;
  };
}

// Inline tag creator — the operator can spin up a new label without leaving
// the card. Saves with a sensible default color and auto-attaches it via the
// onCreated callback.
function InlineCreateTag({ onCreated }: { onCreated: (tagId: string) => void }): JSX.Element {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#0ea5e9");
  const create = useCreateTag();
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 inline-flex items-center gap-1 rounded border border-dashed px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent"
      >
        <Plus className="h-3 w-3" />
        Yangi teg
      </button>
    );
  }
  return (
    <div className="mt-1 flex items-center gap-1">
      <Input
        className="h-7 text-xs"
        placeholder="Teg nomi"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            setName("");
          }
        }}
      />
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        className="h-7 w-9 cursor-pointer rounded border"
        title="Rang"
      />
      <Button
        size="sm"
        disabled={!name.trim() || create.isPending}
        onClick={async () => {
          const t = await create.mutateAsync({ name: name.trim(), color });
          onCreated(t.id);
          setOpen(false);
          setName("");
        }}
      >
        +
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
        ×
      </Button>
    </div>
  );
}

// Mirrors backend src/modules/sms/template.ts so the preview the operator
// sees matches what gets sent. Empty values stay as the raw placeholder so
// nothing silently disappears.
function fillVariables(text: string, vars: Record<string, string | number | null>): string {
  return text.replace(/\{(\w+)\}/g, (m, key: string) => {
    const v = vars[key];
    return v === null || v === undefined || v === "" ? m : String(v);
  });
}

function CallRow({ call }: CallRowProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const { data: sc, isLoading } = useScorecard(open ? call.id : null);
  const answered = call.status === "ANSWERED";
  const analyze = useAnalyzeCall();
  const { data: branches = [] } = useBranches();
  const setBranch = useSetCallBranch();
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioState, setAudioState] = useState<"idle" | "loading" | "none" | "error">("idle");
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  // Derive the analysis state from data the scorecard already exposes —
  // no extra "status" column needed:
  //   not_analyzed: nothing yet
  //   analyzing:    transcript landed but no analysis row (or just enqueued)
  //   analyzed:     analysis row exists
  const state: "not_analyzed" | "analyzing" | "analyzed" = !sc
    ? "not_analyzed"
    : sc.analysis
      ? "analyzed"
      : sc.transcript || analyze.isPending
        ? "analyzing"
        : "not_analyzed";

  async function onAnalyze(force = false) {
    setAnalyzeError(null);
    if (!open) setOpen(true);
    try {
      await analyze.mutateAsync({ callId: call.id, force });
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
      setAnalyzeError(typeof msg === "string" ? msg : "Tahlilni boshlab bo'lmadi");
    }
  }

  async function loadAudio() {
    if (audioUrl) return;
    setAudioState("loading");
    try {
      const res = await api.get(`/calls/${call.id}/recording`, { responseType: "blob" });
      setAudioUrl(URL.createObjectURL(res.data as Blob));
      setAudioState("idle");
    } catch (e) {
      setAudioState(
        (e as { response?: { status?: number } }).response?.status === 404 ? "none" : "error",
      );
    }
  }

  return (
    <li className="rounded border bg-card px-2 py-1">
      <div className="flex items-center justify-between gap-2">
        <span>
          {call.direction === "INBOUND" ? "⬇" : "⬆"} {call.status}
          {call.operator && (
            <span className="ml-2 text-xs text-muted-foreground">
              {call.operator.fullName}
              {call.operator.extension && ` (${call.operator.extension})`}
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          {/* Per-call branch tagging — operator records which filial the
              customer asked about. Powers the monthly per-branch report. */}
          <select
            className="h-7 rounded border bg-background px-1 text-xs"
            value={call.branch?.id ?? ""}
            disabled={setBranch.isPending}
            onChange={(e) =>
              setBranch.mutate({ callId: call.id, branchId: e.target.value || null })
            }
            title="Mijoz so'ragan filial"
          >
            <option value="">Filial yo'q</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">
            {format(new Date(call.startedAt), "dd MMM HH:mm")} · {call.duration}s
          </span>
          {answered && !audioUrl && (
            <button
              type="button"
              onClick={loadAudio}
              disabled={audioState === "loading"}
              className="text-xs text-primary hover:underline disabled:opacity-50"
            >
              {audioState === "loading" ? "..." : "🔊 Eshitish"}
            </button>
          )}
          {answered && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="text-xs text-primary hover:underline"
              title="Tahlil panelini ochish/yopish"
            >
              {open ? "Yopish" : "Ochish"}
            </button>
          )}
          {answered && open && state === "not_analyzed" && (
            <button
              type="button"
              onClick={() => onAnalyze(false)}
              disabled={analyze.isPending}
              className="rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
              title="STT + LLM + QA ishga tushadi (pulli)"
            >
              {analyze.isPending ? "Boshlanmoqda..." : "Tahlil qil"}
            </button>
          )}
          {answered && open && state === "analyzing" && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              Tahlilda...
            </span>
          )}
          {answered && open && state === "analyzed" && (
            <button
              type="button"
              onClick={() => {
                if (confirm("Bu qo'ng'iroqni qaytadan tahlil qilamizmi? (yangi LLM chaqiruvi — pulli)")) {
                  onAnalyze(true);
                }
              }}
              disabled={analyze.isPending}
              className="rounded border px-2 py-0.5 text-xs hover:bg-accent disabled:opacity-50"
              title="Mavjud tahlilni o'chirib, qaytadan ishga tushiradi"
            >
              Qayta tahlil
            </button>
          )}
        </div>
      </div>
      {audioUrl && (
        <audio controls src={audioUrl} className="mt-2 h-8 w-full" autoPlay>
          <track kind="captions" />
        </audio>
      )}
      {audioState === "none" && (
        <p className="mt-1 text-xs text-muted-foreground">Bu qo'ng'iroq uchun yozuv yo'q.</p>
      )}
      {audioState === "error" && (
        <p className="mt-1 text-xs text-destructive">Yozuvni yuklab bo'lmadi.</p>
      )}
      {open && (
        <div className="mt-2 space-y-2 border-t pt-2 text-xs">
          {analyzeError && (
            <div className="rounded bg-destructive/10 px-2 py-1 text-destructive">{analyzeError}</div>
          )}
          {isLoading && <p className="text-muted-foreground">Yuklanmoqda...</p>}
          {sc && (
            <>
              {state === "not_analyzed" && (
                <div className="rounded border border-dashed bg-muted/30 p-2 text-muted-foreground">
                  Bu qo'ng'iroq hali tahlil qilinmagan. "Tahlil qil" tugmasini bosing — pulli xizmat
                  (STT + LLM) ishga tushadi.
                </div>
              )}
              {state === "analyzing" && (
                <div className="rounded border border-dashed bg-amber-50 p-2 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  Tahlil davom etmoqda... Yangi natija avtomatik yangilanadi.
                </div>
              )}
              {sc.analysis && (
                <div className="space-y-0.5">
                  {sc.analysis.sentiment && (
                    <div>
                      <span className="text-muted-foreground">Kayfiyat:</span> {sc.analysis.sentiment}
                    </div>
                  )}
                  {sc.analysis.topic && (
                    <div>
                      <span className="text-muted-foreground">Mavzu:</span> {sc.analysis.topic}
                    </div>
                  )}
                  {sc.analysis.summary && (
                    <div>
                      <span className="text-muted-foreground">Xulosa:</span> {sc.analysis.summary}
                    </div>
                  )}
                  {sc.analysis.nextStep && (
                    <div>
                      <span className="text-muted-foreground">Keyingi qadam:</span>{" "}
                      {sc.analysis.nextStep}
                    </div>
                  )}
                </div>
              )}
              {sc.analysis?.mistakes && sc.analysis.mistakes.length > 0 && (
                <div className="rounded border border-destructive/30 bg-destructive/5 p-2">
                  <div className="mb-1 font-semibold text-destructive">
                    Xatoliklar ({sc.analysis.mistakes.length})
                  </div>
                  <ul className="space-y-1">
                    {sc.analysis.mistakes.map((m, i) => (
                      <li key={i} className="leading-snug">
                        <span
                          className={
                            m.severity === "high"
                              ? "rounded bg-red-200 px-1 text-[10px] font-medium text-red-900 dark:bg-red-950/60 dark:text-red-200"
                              : m.severity === "medium"
                                ? "rounded bg-amber-200 px-1 text-[10px] font-medium text-amber-900 dark:bg-amber-950/60 dark:text-amber-200"
                                : "rounded bg-slate-200 px-1 text-[10px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                          }
                        >
                          {m.severity}
                        </span>{" "}
                        <strong>{m.section}</strong> — {m.message}
                        {m.evidence && m.evidence !== "topilmadi" && m.evidence !== "dalil topilmadi" && (
                          <div className="ml-4 italic text-muted-foreground">"{m.evidence}"</div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {sc.qaScores.length > 0 && (
                <div className="rounded border bg-card p-2">
                  {sc.qaScores.map((q) => (
                    <div key={q.id} className="space-y-1">
                      <div>
                        <span className="text-muted-foreground">QA ({q.script?.name ?? "skript"}):</span>{" "}
                        <span className="font-semibold">
                          {q.totalScore}/{q.maxScore}
                        </span>
                      </div>
                      {q.criteriaResults && q.criteriaResults.length > 0 && (
                        <details>
                          <summary className="cursor-pointer text-muted-foreground">
                            Mezonlar bo'yicha
                          </summary>
                          <ul className="mt-1 space-y-0.5">
                            {q.criteriaResults.map((cr) => (
                              <li key={cr.criterionId}>
                                <span
                                  className={cr.passed ? "text-emerald-600" : "text-destructive"}
                                >
                                  {cr.passed ? "✓" : "✗"}
                                </span>{" "}
                                {cr.criterionId}: {cr.score} — <em>{cr.evidence}</em>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {sc.transcript?.text && (
                <details>
                  <summary className="cursor-pointer text-muted-foreground">Transkript</summary>
                  <p className="mt-1 whitespace-pre-wrap">{sc.transcript.text}</p>
                </details>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}
