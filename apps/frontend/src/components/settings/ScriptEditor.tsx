import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  useScripts,
  useCreateScript,
  useUpdateScript,
  useDeleteScript,
  type Script,
  type ScriptCriterion,
} from "@/hooks/useScripts";

/**
 * Settings → Sotuv skripti tab. SUPERVISOR + TENANT_ADMIN can edit any script:
 * sections list, criteria text/score/guidance/keywords, name, isActive flag.
 * Backend qa.controller already enforces the RBAC; this UI mirrors what the
 * operator panel renders, so editors see exactly what the operator will see.
 */
export function ScriptEditor(): JSX.Element {
  const { data: scripts = [], isLoading } = useScripts();
  const create = useCreateScript();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Auto-select first script (alphabetically). Picks the seeded sales script
  // first by name so the editor opens on the operator-facing one.
  const sorted = useMemo(
    () => [...scripts].sort((a, b) => a.name.localeCompare(b.name)),
    [scripts],
  );
  useEffect(() => {
    if (!selectedId && sorted.length > 0) setSelectedId(sorted[0].id);
  }, [selectedId, sorted]);

  const selected = sorted.find((s) => s.id === selectedId) ?? null;

  async function onCreate() {
    const name = prompt("Yangi skript nomi:");
    if (!name) return;
    const created = await create.mutateAsync({
      name,
      sections: ["Yangi bo'lim"],
      criteria: [
        {
          id: `c-${Date.now()}`,
          section: "Yangi bo'lim",
          text: "Mezon matni",
          maxScore: 10,
        },
      ],
      isActive: true,
    });
    setSelectedId(created.id);
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Yuklanmoqda...</p>;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <aside className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Skriptlar</h2>
          <Button size="sm" variant="outline" onClick={onCreate} disabled={create.isPending}>
            <Plus className="mr-1 h-3 w-3" />
            Yangi
          </Button>
        </div>
        <ul className="space-y-1">
          {sorted.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setSelectedId(s.id)}
                className={`w-full rounded-md border px-2 py-1.5 text-left text-sm ${
                  s.id === selectedId ? "border-primary bg-accent" : "border-transparent hover:bg-accent"
                }`}
              >
                <div className="font-medium">{s.name}</div>
                <div className="text-xs text-muted-foreground">
                  {s.sections.length} bo'lim · {s.criteria.length} mezon ·{" "}
                  {s.isActive ? "faol" : "o'chirilgan"}
                </div>
              </button>
            </li>
          ))}
          {sorted.length === 0 && (
            <li className="text-xs text-muted-foreground">Hozircha skript yo'q. "Yangi" bilan yarating.</li>
          )}
        </ul>
      </aside>

      <section>
        {!selected ? (
          <p className="text-sm text-muted-foreground">Tahrirlash uchun chap tomondan skript tanlang.</p>
        ) : (
          <ScriptForm key={selected.id} script={selected} />
        )}
      </section>
    </div>
  );
}

function ScriptForm({ script }: { script: Script }): JSX.Element {
  const update = useUpdateScript();
  const remove = useDeleteScript();

  const [name, setName] = useState(script.name);
  const [isActive, setIsActive] = useState(script.isActive);
  const [sections, setSections] = useState<string[]>(script.sections);
  const [criteria, setCriteria] = useState<ScriptCriterion[]>(script.criteria);
  const [msg, setMsg] = useState<string | null>(null);

  const total = criteria.reduce((s, c) => s + (Number(c.maxScore) || 0), 0);

  function updateCriterion(idx: number, patch: Partial<ScriptCriterion>) {
    setCriteria((cs) => cs.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }

  function addCriterion() {
    setCriteria((cs) => [
      ...cs,
      {
        id: `c-${Date.now()}`,
        section: sections[0] ?? "Umumiy",
        text: "Yangi mezon",
        maxScore: 5,
        guidance: [],
        keywords: [],
      },
    ]);
  }

  function removeCriterion(idx: number) {
    setCriteria((cs) => cs.filter((_, i) => i !== idx));
  }

  function addSection() {
    const newName = prompt("Yangi bo'lim nomi:");
    if (newName) setSections((s) => [...s, newName]);
  }

  function removeSection(name: string) {
    if (criteria.some((c) => c.section === name)) {
      alert("Bu bo'limda hali mezonlar bor. Avval ularni boshqa bo'limga o'tkazing.");
      return;
    }
    setSections((s) => s.filter((x) => x !== name));
  }

  async function onSave() {
    setMsg(null);
    try {
      await update.mutateAsync({
        id: script.id,
        name,
        sections,
        criteria,
        isActive,
      });
      setMsg("Saqlandi ✓");
    } catch (e) {
      const m = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
      setMsg(typeof m === "string" ? m : "Saqlashda xato");
    }
  }

  async function onDelete() {
    if (!confirm(`"${script.name}" skriptini o'chirasizmi?`)) return;
    await remove.mutateAsync(script.id);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <div>
            <Label htmlFor="script-name" className="text-xs">
              Skript nomi
            </Label>
            <Input
              id="script-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              Faol
            </label>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Jami ball: <strong>{total}</strong> / 100. Bu skript yuqori paneldagi "Sotuv skripti"
          tugmasi orqali operatorga ko'rsatiladi va QA baholash uchun mezon bo'ladi.
        </p>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Bo'limlar</h3>
          <Button size="sm" variant="outline" onClick={addSection}>
            <Plus className="mr-1 h-3 w-3" />
            Bo'lim qo'shish
          </Button>
        </div>
        <ul className="space-y-1 text-sm">
          {sections.map((s, idx) => (
            <li key={s} className="flex items-center justify-between rounded border bg-background px-2 py-1">
              <span>
                {idx + 1}. {s}
              </span>
              <button
                type="button"
                onClick={() => removeSection(s)}
                className="text-muted-foreground hover:text-destructive"
                title="O'chirish (faqat bo'sh bo'limni)"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
          {sections.length === 0 && (
            <li className="text-xs text-muted-foreground">Bo'lim yo'q. Birinchi bo'limni qo'shing.</li>
          )}
        </ul>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Mezonlar</h3>
          <Button size="sm" variant="outline" onClick={addCriterion}>
            <Plus className="mr-1 h-3 w-3" />
            Mezon qo'shish
          </Button>
        </div>
        <div className="space-y-3">
          {criteria.map((c, idx) => (
            <CriterionEditor
              key={c.id}
              criterion={c}
              sections={sections}
              onChange={(patch) => updateCriterion(idx, patch)}
              onRemove={() => removeCriterion(idx)}
            />
          ))}
          {criteria.length === 0 && (
            <p className="text-xs text-muted-foreground">Hozircha mezon yo'q.</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={onSave} disabled={update.isPending}>
          {update.isPending ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <Save className="mr-1 h-3 w-3" />
          )}
          Saqlash
        </Button>
        <Button size="sm" variant="ghost" className="text-destructive" onClick={onDelete}>
          <Trash2 className="mr-1 h-3 w-3" /> O'chirish
        </Button>
        {msg && <span className="text-xs">{msg}</span>}
      </div>
    </div>
  );
}

interface CriterionProps {
  criterion: ScriptCriterion;
  sections: string[];
  onChange: (patch: Partial<ScriptCriterion>) => void;
  onRemove: () => void;
}

function CriterionEditor({ criterion, sections, onChange, onRemove }: CriterionProps): JSX.Element {
  return (
    <div className="rounded border bg-background p-3">
      <div className="grid gap-2 lg:grid-cols-[1fr_160px_80px_auto]">
        <Input
          value={criterion.text}
          onChange={(e) => onChange({ text: e.target.value })}
          placeholder="Mezon matni"
        />
        <select
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={criterion.section}
          onChange={(e) => onChange({ section: e.target.value })}
        >
          {sections.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <Input
          type="number"
          min={0}
          max={100}
          value={criterion.maxScore}
          onChange={(e) => onChange({ maxScore: Number(e.target.value) || 0 })}
        />
        <button
          type="button"
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive"
          title="O'chirish"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-2 grid gap-2 lg:grid-cols-2">
        <div>
          <Label className="text-xs">Operator uchun maslahat (har qatorda bittadan)</Label>
          <Textarea
            rows={3}
            placeholder="Aytiladigan jumla yoki yo'riqnoma"
            value={(criterion.guidance ?? []).join("\n")}
            onChange={(e) =>
              onChange({
                guidance: e.target.value
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
        </div>
        <div>
          <Label className="text-xs">QA kalit so'zlar (vergul bilan)</Label>
          <Input
            placeholder="masalan: assalomu alaykum, rahmat"
            value={(criterion.keywords ?? []).join(", ")}
            onChange={(e) =>
              onChange({
                keywords: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
        </div>
      </div>
    </div>
  );
}
