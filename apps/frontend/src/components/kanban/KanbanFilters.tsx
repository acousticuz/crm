import { useEffect, useRef, useState } from "react";
import { Building2, Check, ChevronDown, Filter, PhoneMissed, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Pipeline, Tag, UserSummary } from "@/lib/types";
import { useBranches, type CardFilters } from "@/hooks/useKanban";

interface Props {
  pipelines: Pipeline[];
  tags: Tag[];
  users: UserSummary[];
  filters: CardFilters;
  onChange: (next: CardFilters) => void;
}

/**
 * Kanban filter bar — visual refresh only. Same fields, same patch logic.
 *
 * Layout: a primary row with the pipeline selector + global search +
 * primary actions (missed/clear); a secondary row with the more granular
 * filters; a third row with the tag chip cloud. The split keeps the most
 * common controls in reach while denser filters tuck below.
 */
export function KanbanFilters({ pipelines, tags, users, filters, onChange }: Props): JSX.Element {
  function patch(p: Partial<CardFilters>) {
    onChange({ ...filters, ...p });
  }
  // Count user-applied filters (everything other than the pipeline tab) so
  // we can show "Tozalash" only when something actually needs clearing.
  const activeCount = Object.entries(filters).filter(([k, v]) => {
    if (k === "pipelineId") return false;
    if (Array.isArray(v)) return v.length > 0;
    return v !== undefined && v !== "" && v !== false;
  }).length;

  return (
    <div className="space-y-3 rounded-lg border bg-card p-3 shadow-xs">
      {/* Primary row — pipeline + search + quick actions. */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-9 min-w-[160px]"
          value={filters.pipelineId ?? ""}
          onChange={(e) => patch({ pipelineId: e.target.value || undefined })}
          aria-label="Voronka"
        >
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.isDefault ? " ★" : ""}
            </option>
          ))}
        </select>

        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
          <Input
            value={filters.q ?? ""}
            onChange={(e) => patch({ q: e.target.value || undefined })}
            placeholder="Mijoz ismi yoki +99890..."
            className="h-9 pl-8"
            aria-label="Mijoz / telefon qidiruvi"
          />
          {filters.q && (
            <button
              type="button"
              onClick={() => patch({ q: undefined })}
              className="absolute right-1.5 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
              aria-label="Qidiruvni tozalash"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <Button
          type="button"
          size="sm"
          variant={filters.missedOnly ? "default" : "outline"}
          onClick={() => patch({ missedOnly: filters.missedOnly ? undefined : true })}
        >
          <PhoneMissed className="h-3.5 w-3.5" />
          Faqat javobsiz
        </Button>

        {activeCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange({ pipelineId: filters.pipelineId })}
          >
            <X className="h-3.5 w-3.5" />
            Tozalash ({activeCount})
          </Button>
        )}
      </div>

      {/* Secondary row — granular filters. Plain native selects/inputs styled
          via @layer base. */}
      <div className="flex flex-wrap items-end gap-3 border-t pt-3">
        <Field label="Mas'ul">
          <select
            value={filters.responsibleUserId ?? ""}
            onChange={(e) => patch({ responsibleUserId: e.target.value || undefined })}
          >
            <option value="">Hammasi</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Manba">
          <Input
            value={filters.source ?? ""}
            onChange={(e) => patch({ source: e.target.value || undefined })}
            placeholder="website"
            className="w-32"
          />
        </Field>

        <Field label="Filial">
          <BranchMultiSelect
            value={filters.branchIds ?? []}
            onChange={(next) => patch({ branchIds: next.length > 0 ? next : undefined })}
          />
        </Field>

        <Field label="Sanadan">
          <Input
            type="date"
            value={filters.dateFrom ?? ""}
            onChange={(e) => patch({ dateFrom: e.target.value || undefined })}
            className="w-36"
          />
        </Field>

        <Field label="Sanagacha">
          <Input
            type="date"
            value={filters.dateTo ?? ""}
            onChange={(e) => patch({ dateTo: e.target.value || undefined })}
            className="w-36"
          />
        </Field>
      </div>

      {/* Tag chip cloud. Inline filter (no labels needed — chips speak for
          themselves). */}
      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t pt-3">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            Teglar:
          </span>
          {tags.map((t) => {
            const active = filters.tagId === t.id;
            return (
              <button
                type="button"
                key={t.id}
                onClick={() => patch({ tagId: active ? undefined : t.id })}
                className={cn(
                  "rounded-full transition-opacity",
                  active ? "opacity-100" : "opacity-70 hover:opacity-100",
                )}
              >
                <Badge color={t.color} className={cn(active && "ring-2 ring-offset-1 ring-primary/40")}>
                  {t.name}
                </Badge>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Stacked label + control. Pulled out so the secondary row stays scannable.
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

/**
 * Multi-select branch picker — replaces the old free-text "Filial ID" input.
 * Lists the tenant's actual branches by name and shows selected branches as
 * removable chips beneath the trigger. Chip x clears one branch; the trigger
 * footer holds a "Tozalash" link when anything is selected.
 *
 * Behavior:
 *   - Click trigger → toggles a dropdown panel with the full branch list.
 *   - Each row toggles its branch in the value array.
 *   - Outside-click closes the panel.
 */
function BranchMultiSelect({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}): JSX.Element {
  const { data: branches = [] } = useBranches();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Outside-click close. Listens at the document so any click outside the
  // wrapper collapses the panel — minimal version of a Popover primitive
  // tailored to this single use site.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const selectedSet = new Set(value);
  const selectedBranches = branches.filter((b) => selectedSet.has(b.id));

  function toggle(id: string) {
    onChange(selectedSet.has(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  return (
    <div ref={wrapperRef} className="relative w-56">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-2.5 text-sm shadow-xs transition-colors",
          "hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        )}
      >
        <span className="inline-flex items-center gap-2 truncate text-foreground">
          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
          {selectedBranches.length === 0 ? (
            <span className="text-muted-foreground">Hammasi</span>
          ) : selectedBranches.length === 1 ? (
            <span className="truncate">{selectedBranches[0].name}</span>
          ) : (
            <span className="tabular-nums">{selectedBranches.length} ta tanlangan</span>
          )}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {/* Selected chips — rendered beneath the trigger so the operator can
          remove items without re-opening the panel. */}
      {selectedBranches.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {selectedBranches.map((b) => (
            <span
              key={b.id}
              className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-px text-2xs font-medium text-primary"
            >
              {b.name}
              <button
                type="button"
                onClick={() => toggle(b.id)}
                aria-label={`${b.name} filiali tanlovini olib tashlash`}
                className="-mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-primary/20"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-2xs font-medium text-muted-foreground hover:text-foreground hover:underline"
          >
            Tozalash
          </button>
        </div>
      )}

      {open && (
        <div className="absolute z-30 mt-1.5 w-72 overflow-hidden rounded-md border bg-card shadow-overlay">
          {branches.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground">Filiallar yo'q.</p>
          ) : (
            <ul className="max-h-64 overflow-y-auto py-1">
              {branches.map((b) => {
                const checked = selectedSet.has(b.id);
                return (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => toggle(b.id)}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors",
                        "hover:bg-surface",
                        checked && "text-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "inline-flex h-4 w-4 items-center justify-center rounded border",
                          checked
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-input bg-background",
                        )}
                      >
                        {checked && <Check className="h-3 w-3" />}
                      </span>
                      <span className="truncate">{b.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
