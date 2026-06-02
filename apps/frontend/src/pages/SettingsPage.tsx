import { useMemo, useState } from "react";
import { CheckCircle2, Plug, XCircle, AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { PipelineEditor } from "@/components/settings/PipelineEditor";
import { UsersManager } from "@/components/settings/UsersManager";
import {
  useDisconnectIntegration,
  useIntegrations,
  useSaveIntegration,
  useTestIntegration,
  type Integration,
  type IntegrationType,
} from "@/hooks/useIntegrations";
import { useSyncSmsTemplates } from "@/hooks/useKanban";

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
      { key: "login", label: "Login / email" },
      { key: "password", label: "Parol", secret: true },
      { key: "apiKey", label: "API kalit (ixtiyoriy)", secret: true },
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

type SettingsTab = "integrations" | "pipelines" | "users";

export function SettingsPage(): JSX.Element {
  const { user } = useAuth();
  const isTenantAdmin = user?.role === "TENANT_ADMIN";
  const [tab, setTab] = useState<SettingsTab>("integrations");

  if (!isTenantAdmin) {
    return (
      <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        Sozlamalarga faqat <strong>kompaniya administratori (TENANT_ADMIN)</strong> kira oladi.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Sozlamalar</h1>
      <div className="flex gap-2 border-b">
        {([
          { id: "integrations", label: "Integratsiyalar" },
          { id: "pipelines", label: "Voronkalar (Kanban)" },
          { id: "users", label: "Xodimlar" },
        ] as Array<{ id: SettingsTab; label: string }>).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "px-3 py-2 text-sm font-medium border-b-2 -mb-px",
              tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "pipelines" ? (
        <PipelineEditor />
      ) : tab === "users" ? (
        <UsersManager />
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
  if (status === "CONNECTED") {
    return (
      <Badge color="#16a34a">
        <CheckCircle2 className="mr-1 inline h-3 w-3" />
        Ulangan
      </Badge>
    );
  }
  if (status === "ERROR") {
    return (
      <Badge color="#dc2626">
        <XCircle className="mr-1 inline h-3 w-3" />
        Xato
      </Badge>
    );
  }
  return (
    <Badge color="#64748b">
      <AlertTriangle className="mr-1 inline h-3 w-3" />
      Ulanmagan
    </Badge>
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
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Plug className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">{TITLES[integration.type]}</h2>
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

function extractErr(e: unknown): string {
  const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
  return typeof msg === "string" ? msg : "Xatolik yuz berdi";
}
