import { useState } from "react";
import { Loader2, Pencil, Phone, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  useCreateUser,
  useDeleteUser,
  usePbxExtensions,
  useUpdateUser,
  useUsers,
  type ManagedUser,
  type UserRole,
} from "@/hooks/useUsers";

const ROLES: Array<{ value: UserRole; label: string }> = [
  { value: "TENANT_ADMIN", label: "Administrator" },
  { value: "SUPERVISOR", label: "Nazoratchi" },
  { value: "OPERATOR", label: "Operator" },
  { value: "ANALYST", label: "Analitik" },
];

const ROLE_LABEL: Record<UserRole, string> = {
  TENANT_ADMIN: "Administrator",
  SUPERVISOR: "Nazoratchi",
  OPERATOR: "Operator",
  ANALYST: "Analitik",
};

interface FormState {
  fullName: string;
  email: string;
  password: string;
  role: UserRole;
  extension: string;
  branchId: string;
}

const EMPTY: FormState = {
  fullName: "",
  email: "",
  password: "",
  role: "OPERATOR",
  extension: "",
  branchId: "",
};

export function UsersManager(): JSX.Element {
  const { data: users = [], isLoading } = useUsers();
  const create = useCreateUser();
  const update = useUpdateUser();
  const del = useDeleteUser();
  const pbxExt = usePbxExtensions();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [msg, setMsg] = useState<string | null>(null);
  const [extOptions, setExtOptions] = useState<string[]>([]);

  async function loadExtensions() {
    setMsg(null);
    try {
      const list = await pbxExt.mutateAsync();
      setExtOptions(list);
      if (list.length === 0) {
        setMsg("FreePBX'dan extension topilmadi (PBX ulanmagan yoki ruxsat yo'q).");
      }
    } catch (e) {
      setMsg(extractErr(e));
    }
  }

  const isEditing = editingId !== null;

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY);
    setMsg(null);
    setShowForm(true);
  }

  function openEdit(u: ManagedUser) {
    setEditingId(u.id);
    setForm({
      fullName: u.fullName,
      email: u.email,
      password: "",
      role: u.role,
      extension: u.extension ?? "",
      branchId: u.branchId ?? "",
    });
    setMsg(null);
    setShowForm(true);
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((s) => ({ ...s, [key]: value }));
  }

  async function onSave() {
    setMsg(null);
    try {
      if (isEditing && editingId) {
        await update.mutateAsync({
          id: editingId,
          data: {
            fullName: form.fullName,
            role: form.role,
            extension: form.extension,
            branchId: form.branchId || undefined,
            ...(form.password ? { password: form.password } : {}),
          },
        });
      } else {
        await create.mutateAsync({
          fullName: form.fullName,
          email: form.email,
          password: form.password,
          role: form.role,
          extension: form.extension || undefined,
          branchId: form.branchId || undefined,
        });
      }
      setShowForm(false);
      setForm(EMPTY);
      setEditingId(null);
    } catch (e) {
      setMsg(extractErr(e));
    }
  }

  const saving = create.isPending || update.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Operatorlarni boshqaring. Har operatorga real <strong>PJSIP extension</strong> biriktiring —
          click-to-call shu raqamni jiringlatadi.
        </p>
        <Button size="sm" onClick={openCreate}>
          <UserPlus className="mr-1 h-4 w-4" />
          Yangi xodim
        </Button>
      </div>

      {showForm && (
        <div className="rounded-lg border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold">
            {isEditing ? "Xodimni tahrirlash" : "Yangi xodim"}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="To'liq ism">
              <Input value={form.fullName} onChange={(e) => set("fullName", e.target.value)} />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={form.email}
                disabled={isEditing}
                onChange={(e) => set("email", e.target.value)}
              />
            </Field>
            <Field label={isEditing ? "Yangi parol (bo'sh = o'zgarmaydi)" : "Parol"}>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
              />
            </Field>
            <Field label="Rol">
              <select
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={form.role}
                onChange={(e) => set("role", e.target.value as UserRole)}
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="PJSIP extension (masalan 2000)">
              <div className="flex gap-2">
                <Input
                  inputMode="numeric"
                  placeholder="2000"
                  value={form.extension}
                  onChange={(e) => set("extension", e.target.value)}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={loadExtensions}
                  disabled={pbxExt.isPending}
                  title="FreePBX'dan extensionlarni yuklash"
                >
                  {pbxExt.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "FreePBX'dan"}
                </Button>
              </div>
              {extOptions.length > 0 && (
                <div className="mt-1.5 space-y-1">
                  <p className="text-[11px] text-muted-foreground">
                    {extOptions.length} ta topildi — tanlang:
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {extOptions.map((ext) => (
                      <button
                        key={ext}
                        type="button"
                        onClick={() => set("extension", ext)}
                        className={cn(
                          "rounded-md border px-2 py-0.5 text-xs",
                          form.extension === ext
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-input hover:bg-accent",
                        )}
                      >
                        {ext}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </Field>
            <Field label="Filial ID (ixtiyoriy)">
              <Input value={form.branchId} onChange={(e) => set("branchId", e.target.value)} />
            </Field>
          </div>
          {msg && <p className="mt-2 text-xs text-destructive">{msg}</p>}
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={onSave} disabled={saving}>
              {saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Saqlash
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>
              Bekor qilish
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Yuklanmoqda...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Ism</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Rol</th>
                <th className="px-3 py-2">Extension</th>
                <th className="px-3 py-2">Holat</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{u.fullName}</td>
                  <td className="px-3 py-2 text-muted-foreground">{u.email}</td>
                  <td className="px-3 py-2">{ROLE_LABEL[u.role] ?? u.role}</td>
                  <td className="px-3 py-2">
                    {u.extension ? (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3 w-3 text-muted-foreground" />
                        {u.extension}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Badge color={u.status === "ACTIVE" ? "#16a34a" : "#64748b"}>
                      {u.status === "ACTIVE" ? "Faol" : "O'chirilgan"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(u)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => del.mutate(u.id)}
                        disabled={del.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-sm text-muted-foreground">
                    Hali xodim yo'q.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function extractErr(e: unknown): string {
  const msg = (e as { response?: { data?: { message?: string | string[] } } }).response?.data?.message;
  if (Array.isArray(msg)) return msg.join(", ");
  return typeof msg === "string" ? msg : "Xatolik yuz berdi";
}
