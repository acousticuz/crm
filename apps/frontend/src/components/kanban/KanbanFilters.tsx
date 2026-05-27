import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { Pipeline, Tag, UserSummary } from "@/lib/types";
import type { CardFilters } from "@/hooks/useKanban";

interface Props {
  pipelines: Pipeline[];
  tags: Tag[];
  users: UserSummary[];
  filters: CardFilters;
  onChange: (next: CardFilters) => void;
}

export function KanbanFilters({ pipelines, tags, users, filters, onChange }: Props): JSX.Element {
  function patch(p: Partial<CardFilters>) {
    onChange({ ...filters, ...p });
  }
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border bg-card p-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Voronka</label>
        <select
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={filters.pipelineId ?? ""}
          onChange={(e) => patch({ pipelineId: e.target.value || undefined })}
        >
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.isDefault ? " ★" : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-1 min-w-[200px] flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Qidiruv (ism/telefon)</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.q ?? ""}
            onChange={(e) => patch({ q: e.target.value || undefined })}
            placeholder="Aziz yoki +99890..."
            className="pl-8"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Mas'ul</label>
        <select
          className="h-9 rounded-md border bg-background px-2 text-sm"
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
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Manba</label>
        <Input
          value={filters.source ?? ""}
          onChange={(e) => patch({ source: e.target.value || undefined })}
          placeholder="website"
          className="w-32"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Filial ID</label>
        <Input
          value={filters.branchId ?? ""}
          onChange={(e) => patch({ branchId: e.target.value || undefined })}
          placeholder="branch..."
          className="w-32"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Sanadan</label>
        <Input
          type="date"
          value={filters.dateFrom ?? ""}
          onChange={(e) => patch({ dateFrom: e.target.value || undefined })}
          className="w-36"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Sanagacha</label>
        <Input
          type="date"
          value={filters.dateTo ?? ""}
          onChange={(e) => patch({ dateTo: e.target.value || undefined })}
          className="w-36"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Teg</label>
        <div className="flex flex-wrap gap-1">
          {tags.length === 0 && (
            <span className="text-xs text-muted-foreground">Yo'q</span>
          )}
          {tags.map((t) => {
            const active = filters.tagId === t.id;
            return (
              <button
                type="button"
                key={t.id}
                onClick={() => patch({ tagId: active ? undefined : t.id })}
                className="rounded-full"
              >
                <Badge color={t.color} className={active ? "ring-2 ring-offset-1" : undefined}>
                  {t.name}
                </Badge>
              </button>
            );
          })}
        </div>
      </div>

      <Button variant="ghost" size="sm" onClick={() => onChange({ pipelineId: filters.pipelineId })}>
        Tozalash
      </Button>
    </div>
  );
}
