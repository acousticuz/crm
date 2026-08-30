import { useMemo, useState } from "react";
import { CheckCircle2, Plug, XCircle, AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { PipelineEditor } from "@/components/settings/PipelineEditor";
import { UsersManager } from "@/components/settings/UsersManager";
import { ScriptEditor } from "@/components/settings/ScriptEditor";
import {
  useDisconnectIntegration,
  useIntegrations,
  useSaveIntegration,
  useTestIntegration,
  type Integration,
  type IntegrationType,
} from "@/hooks/useIntegrations";
import {
  useCreateSmsTemplate,
  useDeleteSmsTemplate,
  useSmsTemplates,
  useSyncSmsTemplates,
  useUpdateSmsTemplate,
  type SmsTemplate,
} from "@/hooks/useKanban";

// Field definitions per integration type — secret flag drives password input
// + "leave blank to keep" hint.
interface FieldDef {
  key: string;
  label: string;
  secret?: boolean;
  placeholder?: string;
  type?: string;
}

const FIELDS: Record<IntegrationType, { provider?: string[]; fields: FieldDef[] }> = {
  FREEPBX: {
    fields: [
      { key: "amiHost", label: "AMI host (IP)", placeholder: "192.168.20.155" },
      { key: "amiPort", label: "AMI port", placeholder: "5038", type: "number" },
      { key: "amiUsername", label: "AMI username", placeholder: "acoustic-crm" },
      { key: "amiSecret", label: "AMI secret", secret: true },
      { key: "cdrMode", label: "CDR ulanish (db/api)", placeholder: "db" },
      { key: "recordingsSource", label: "Yozuvlar manbasi (papka/URL)", placeholder: "/var/spool/asterisk/monitor" },
    ],
  },
  SMS: {
    provider: ["eskiz", "playmobile"],
    fields: [
      // Eskiz: email + password. The 30-day JWT is fetched/refreshed
      // server-side, so admins never paste a token here.
      { key: "login", label: "Login / email" },
      { key: "password", label: "Parol", secret: true },
      { key: "sender", label: "Yuboruvchi nomi (sender)", placeholder: "Acoustic" },
      {
        key: "allowFreeText",
        // Eskiz rejects arbitrary text — leave OFF so operators only send
        // approved templates (the safe default). Turn ON only when the
        // tenant knows their provider permits free text.
        label: "Erkin matn yuborishga ruxsat (Eskiz uchun tavsiya etilmaydi)",
        type: "checkbox",
      },
    ],
  },
  TELEGRAM: {
    fields: [
      { key: "botToken", label: "Bot token (BotFather)", secret: true },
      { key: "webhookUrl", label: "Webhook URL (ixtiyoriy)" },
      { key: "purpose", label: "Maqsad (supervisor/customer)", placeholder: "supervisor" },
    ],
  },
  INBOX: {
    provider: ["instagram", "facebook"],
    fields: [
      { key: "pageId", label: "Page / Business ID" },
      { key: "pageName", label: "Sahifa nomi" },
      { key: "pageAccessToken", label: "Page access token (OAuth)", secret: true },
    ],
  },
};

const TITLES: Record<IntegrationType, string> = {
  FREEPBX: "FreePBX telefoniya",
  SMS: "SMS xizmati",
  TELEGRAM: "Telegram bot",
  INBOX: "Omnichannel inbox (IG/FB)",
};

type SettingsTab = "integrations" | "pipelines" | "users" | "script";

export function SettingsPage(): JSX.Element {
  const { user } = useAuth();
  const isTenantAdmin = user?.role === "TENANT_ADMIN";
  const isSupervisor = user?.role === "SUPERVISOR";
  // SUPERVISOR can land here just to edit the call script — admin-only tabs
  // (integrations / users / pipelines) stay hidden for them.
  const tabs = (isTenantAdmin
    ? [
        { id: "integrations" as const, label: "Integratsiyalar" },
        { id: "pipelines" as const, label: "Voronkalar (Kanban)" },
        { id: "users" as const, label: "Xodimlar" },
        { id: "script" as const, label: "Sotuv skripti" },
      ]
    : isSupervisor
      ? [{ id: "script" as const, label: "Sotuv skripti" }]
      : []);
  const [tab, setTab] = useState<SettingsTab>(tabs[0]?.id ?? "script");

  if (!isTenantAdmin && !isSupervisor) {
    return (
      <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        Sozlamalarga faqat <strong>kompaniya administratori</strong> yoki <strong>supervayzer</strong> kira oladi.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-1">Sozlash</p>
        <h1 className="font-display text-3xl font-semibold tracking-tightish text-foreground">
          Sozlamalar
        </h1>
      </div>
      <div className="flex gap-1 border-b">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "relative -mb-px px-3 py-2 text-sm font-medium transition-colors",
              tab === t.id
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {tab === t.id && (
              <span
                aria-hidden
                className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-primary"
              />
            )}
          </button>
        ))}
      </div>
      {tab === "pipelines" ? (
        <PipelineEditor />
      ) : tab === "users" ? (
        <UsersManager />
      ) : tab === "script" ? (
        <ScriptEditor />
      ) : (
        <IntegrationsTab />
      )}
    </div>
  );
}

function IntegrationsTab(): JSX.Element {
  const { data: integrations = [], isLoading } = useIntegrations();
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Tashqi tizimlarni ulang. Sirlar shifrlangan holda saqlanadi va hech qachon to'liq ko'rsatilmaydi.
      </p>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Yuklanmoqda...</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {integrations.map((it) => (
            <IntegrationCard key={it.type} integration={it} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: Integration["status"] }) {
  // Soft Modern integration status — same chip pattern as the rest of the
  // system, driven by data-tone.
  if (status === "CONNECTED") {
    return (
      <span className="chip" data-tone="success">
        <CheckCircle2 className="h-3 w-3" />
        Ulangan
      </span>
    );
  }
  if (status === "ERROR") {
    return (
      <span className="chip" data-tone="destructive">
        <XCircle className="h-3 w-3" />
        Xato
      </span>
    );
  }
  return (
    <span className="chip" data-tone="muted">
      <AlertTriangle className="h-3 w-3" />
      Ulanmagan
    </span>
  );
}

function IntegrationCard({ integration }: { integration: Integration }) {
  const def = FIELDS[integration.type];
  const save = useSaveIntegration();
  const test = useTestIntegration();
  const disconnect = useDisconnectIntegration();
  const syncSmsTemplates = useSyncSmsTemplates();
  const [open, setOpen] = useState(false);

  const initial = useMemo(() => {
    const v: Record<string, string | boolean> = {};
    for (const f of def.fields) {
      const raw = integration.config?.[f.key];
      if (f.type === "checkbox") {
        v[f.key] = raw === true || raw === "true";
      } else {
        v[f.key] = typeof raw === "string" ? raw : "";
      }
    }
    return v;
  }, [def.fields, integration.config]);

  const [form, setForm] = useState<Record<string, string | boolean>>(initial);
  const [provider, setProvider] = useState<string>(
    integration.provider ?? def.provider?.[0] ?? "",
  );
  const [msg, setMsg] = useState<string | null>(null);

  async function onSave() {
    setMsg(null);
    // Send only changed/filled fields. Masked secrets (•) are sent as-is so
    // the backend knows to keep the existing value. Booleans go through as-is
    // so allowFreeText=false isn't dropped.
    const config: Record<string, unknown> = {};
    for (const f of def.fields) {
      const val = form[f.key];
      if (f.type === "checkbox") {
        config[f.key] = val === true;
      } else if (typeof val === "string" && val !== "") {
        config[f.key] = val;
      }
    }
    try {
      await save.mutateAsync({ type: integration.type, provider: provider || undefined, config });
      setMsg("Saqlandi ✓");
    } catch (e) {
      setMsg(extractErr(e));
    }
  }

  async function onTest() {
    setMsg(null);
    try {
      const r = await test.mutateAsync(integration.type);
      setMsg(`${r.ok ? "✓" : "✗"} ${r.message}`);
    } catch (e) {
      setMsg(extractErr(e));
    }
  }

  async function onSyncTemplates() {
    setMsg(null);
    try {
      const r = await syncSmsTemplates.mutateAsync();
      setMsg(
        `Template'lar sinxronizatsiyalandi: ${r.upserted} ta yangilandi, ${r.skipped} ta o'tkazib yuborildi (${r.fetched} olindi)`,
      );
    } catch (e) {
      setMsg(extractErr(e));
    }
  }

  // Eskiz exposes user/templates; Play Mobile does not. Limit the button to
  // SMS+eskiz so it doesn't appear where it can't work.
  const showSync = integration.type === "SMS" && (provider === "eskiz" || integration.provider === "eskiz");

  return (
    <div className="card-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-surface text-muted-foreground">
            <Plug className="h-3.5 w-3.5" />
          </span>
          <h2 className="font-display text-sm font-semibold tracking-tightish text-foreground">
            {TITLES[integration.type]}
          </h2>
        </div>
        <StatusBadge status={integration.status} />
      </div>
      {integration.lastTestResult && (
        <p className="mt-1 text-xs text-muted-foreground">
          Oxirgi test: {integration.lastTestResult.ok ? "✓" : "✗"} {integration.lastTestResult.message}
        </p>
      )}

      {!open ? (
        <Button size="sm" variant="outline" className="mt-3" onClick={() => setOpen(true)}>
          Sozlash
        </Button>
      ) : (
        <div className="mt-3 space-y-2">
          {def.provider && (
            <div className="space-y-1">
              <Label className="text-xs">Provayder</Label>
              <select
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              >
                {def.provider.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          )}
          {def.fields.map((f) => {
            if (f.type === "checkbox") {
              return (
                <label
                  key={f.key}
                  htmlFor={`${integration.type}-${f.key}`}
                  className="flex items-center gap-2 text-xs"
                >
                  <input
                    id={`${integration.type}-${f.key}`}
                    type="checkbox"
                    className="h-4 w-4"
                    checked={form[f.key] === true}
                    onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.checked }))}
                  />
                  <span>{f.label}</span>
                </label>
              );
            }
            return (
              <div key={f.key} className="space-y-1">
                <Label htmlFor={`${integration.type}-${f.key}`} className="text-xs">
                  {f.label}
                  {f.secret && <span className="ml-1 text-muted-foreground">(sir)</span>}
                </Label>
                <Input
                  id={`${integration.type}-${f.key}`}
                  type={f.secret ? "text" : f.type ?? "text"}
                  placeholder={
                    f.secret && (integration.config?.[f.key] as string)?.startsWith?.("•")
                      ? "(o'zgartirmaslik uchun bo'sh qoldiring)"
                      : f.placeholder
                  }
                  value={typeof form[f.key] === "string" ? (form[f.key] as string) : ""}
                  onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                />
              </div>
            );
          })}
          {msg && <p className="text-xs">{msg}</p>}
          {integration.type === "SMS" && <SmsTemplatesEditor />}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" onClick={onSave} disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Saqlash
            </Button>
            <Button size="sm" variant="outline" onClick={onTest} disabled={test.isPending}>
              {test.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Tekshirish
            </Button>
            {showSync && (
              <Button
                size="sm"
                variant="outline"
                onClick={onSyncTemplates}
                disabled={syncSmsTemplates.isPending || !integration.configured}
                title={
                  integration.configured
                    ? "Eskiz'dan tasdiqlangan template'larni yuklab olish"
                    : "Avval saqlang"
                }
              >
                {syncSmsTemplates.isPending ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 h-3 w-3" />
                )}
                Template'larni sync qilish
              </Button>
            )}
            {integration.configured && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => disconnect.mutate(integration.type)}
                disabled={disconnect.isPending}
              >
                Uzish
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Yopish
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SmsTemplatesEditor() {
  const { data: templates = [] } = useSmsTemplates();
  const createTemplate = useCreateSmsTemplate();
  const updateTemplate = useUpdateSmsTemplate();
  const deleteTemplate = useDeleteSmsTemplate();
  const [draft, setDraft] = useState({ name: "", body: "" });
  const [editing, setEditing] = useState<Record<string, { name: string; body: string }>>({});
  const [msg, setMsg] = useState<string | null>(null);

  async function onCreate() {
    if (!draft.name.trim() || !draft.body.trim()) return;
    setMsg(null);
    try {
      await createTemplate.mutateAsync({
        name: draft.name.trim(),
        body: draft.body.trim(),
      });
      setDraft({ name: "", body: "" });
      setMsg("Template qo'shildi ✓");
    } catch (e) {
      setMsg(extractErr(e));
    }
  }

  async function onUpdate(t: SmsTemplate) {
    const row = editing[t.id] ?? { name: t.name, body: t.body };
    if (!row.name.trim() || !row.body.trim()) return;
    setMsg(null);
    try {
      await updateTemplate.mutateAsync({
        id: t.id,
        name: row.name.trim(),
        body: row.body.trim(),
      });
      setMsg("Template yangilandi ✓");
    } catch (e) {
      setMsg(extractErr(e));
    }
  }

  async function onDelete(t: SmsTemplate) {
    if (!window.confirm(`"${t.name}" template o'chirilsinmi?`)) return;
    setMsg(null);
    try {
      await deleteTemplate.mutateAsync(t.id);
      setMsg("Template o'chirildi ✓");
    } catch (e) {
      setMsg(extractErr(e));
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-md border p-3">
      <div>
        <p className="text-sm font-medium">SMS shablonlar</p>
        <p className="text-xs text-muted-foreground">
          Operatorlar SMS yuborishda shu shablonlardan tanlaydi.
        </p>
      </div>

      <div className="space-y-2 rounded-md bg-muted/30 p-2">
        <Input
          value={draft.name}
          onChange={(e) => setDraft((s) => ({ ...s, name: e.target.value }))}
          placeholder="Yangi template nomi"
        />
        <Textarea
          value={draft.body}
          onChange={(e) => setDraft((s) => ({ ...s, body: e.target.value }))}
          placeholder="Matn. Masalan: Assalomu alaykum, {ism}..."
          className="min-h-[80px]"
        />
        <Button
          size="sm"
          disabled={createTemplate.isPending || !draft.name.trim() || !draft.body.trim()}
          onClick={onCreate}
        >
          {createTemplate.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          Template qo'shish
        </Button>
      </div>

      {templates.length === 0 ? (
        <p className="text-xs text-muted-foreground">Hozircha SMS template yo'q.</p>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => {
            const row = editing[t.id] ?? { name: t.name, body: t.body };
            const isExternal = Boolean(t.externalProvider && t.externalId);
            return (
              <div key={t.id} className="space-y-2 rounded-md border p-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">
                      {isExternal ? "Provider template" : "Qo'lda kiritilgan"}
                    </p>
                    {t.externalStatus && (
                      <p className="text-[10px] text-muted-foreground">Status: {t.externalStatus}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={deleteTemplate.isPending}
                    onClick={() => onDelete(t)}
                  >
                    O'chirish
                  </Button>
                </div>
                <Input
                  value={row.name}
                  onChange={(e) =>
                    setEditing((s) => ({ ...s, [t.id]: { ...row, name: e.target.value } }))
                  }
                />
                <Textarea
                  value={row.body}
                  onChange={(e) =>
                    setEditing((s) => ({ ...s, [t.id]: { ...row, body: e.target.value } }))
                  }
                  className="min-h-[90px]"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={updateTemplate.isPending || !row.name.trim() || !row.body.trim()}
                  onClick={() => onUpdate(t)}
                >
                  {updateTemplate.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                  Saqlash
                </Button>
              </div>
            );
          })}
        </div>
      )}
      {msg && <p className="text-xs">{msg}</p>}
    </div>
  );
}

function extractErr(e: unknown): string {
  const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
  return typeof msg === "string" ? msg : "Xatolik yuz berdi";
}
