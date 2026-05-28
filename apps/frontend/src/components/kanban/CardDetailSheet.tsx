import { useState } from "react";
import { format } from "date-fns";
import { Phone, MessageSquare, Plus } from "lucide-react";
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
import {
  useAttachTag,
  useCardDetail,
  useCreateNote,
  useCreateTask,
  useDetachTag,
  useOriginateCall,
  useSendSms,
  useSmsTemplates,
  useTags,
  useUsers,
} from "@/hooks/useKanban";

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
  const attachTag = useAttachTag();
  const detachTag = useDetachTag();
  const createNote = useCreateNote();
  const createTask = useCreateTask();
  const sendSms = useSendSms();
  const originateCall = useOriginateCall();

  const [noteText, setNoteText] = useState("");
  const [taskText, setTaskText] = useState("");
  const [taskAssignee, setTaskAssignee] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [smsOpen, setSmsOpen] = useState(false);
  const [smsTemplateId, setSmsTemplateId] = useState("");
  const [smsText, setSmsText] = useState("");
  const [smsError, setSmsError] = useState<string | null>(null);

  const attachedTagIds = new Set(card?.cardTags?.map((ct) => ct.tagId) ?? []);

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
                {card.contact.fullName}
                {card.contact.phones[0] && ` · ${card.contact.phones[0]}`}
              </SheetDescription>
            </SheetHeader>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Aloqa</h3>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!card.contact.phones[0] || originateCall.isPending}
                  onClick={() =>
                    originateCall.mutate({
                      toNumber: card.contact.phones[0],
                      cardId: card.id,
                      contactId: card.contact.id,
                    })
                  }
                >
                  <Phone className="mr-1 h-4 w-4" />
                  {originateCall.isPending ? "Ulanmoqda..." : "Qo'ng'iroq qilish"}
                </Button>
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
                  </div>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    value={smsTemplateId}
                    onChange={(e) => {
                      setSmsTemplateId(e.target.value);
                      const t = smsTemplates.find((s) => s.id === e.target.value);
                      if (t) setSmsText(t.body);
                    }}
                  >
                    <option value="">Shablonsiz (erkin matn)</option>
                    {smsTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <Textarea
                    placeholder="SMS matni (Salom {ism}, ... shaklida o'zgaruvchilar)"
                    value={smsText}
                    onChange={(e) => setSmsText(e.target.value)}
                  />
                  {smsError && (
                    <div className="rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">
                      {smsError}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={!smsText && !smsTemplateId}
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
                      Yuborish
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setSmsOpen(false)}>
                      Bekor
                    </Button>
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Qo'ng'iroq tugmasi M6 (FreePBX telefoniya) milestone'da ulanadi.
              </p>
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
                    <li key={c.id} className="rounded border bg-card px-2 py-1">
                      <div className="flex items-center justify-between">
                        <span>{c.direction === "INBOUND" ? "⬇" : "⬆"} {c.status}</span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(c.startedAt), "dd MMM HH:mm")} · {c.duration}s
                        </span>
                      </div>
                    </li>
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
