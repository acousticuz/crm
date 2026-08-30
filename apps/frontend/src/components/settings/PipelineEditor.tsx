import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePipelines } from "@/hooks/useKanban";
import { usePipelineAdmin } from "@/hooks/usePipelineAdmin";
import type { Pipeline, Stage } from "@/lib/types";

const STAGE_TYPES: Array<{ value: "NORMAL" | "WON" | "LOST"; label: string }> = [
  { value: "NORMAL", label: "Oddiy" },
  { value: "WON", label: "Yutuq" },
  { value: "LOST", label: "Yo'qotish" },
];

export function PipelineEditor(): JSX.Element {
  const { data: pipelines = [] } = usePipelines();
  const admin = usePipelineAdmin();
  const [newPipelineName, setNewPipelineName] = useState("");

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Voronkalar (Pipelines)</h2>
        <p className="text-sm text-muted-foreground">
          Voronka va ustunlarni o'zingiz sozlang — cheksiz ustun qo'shing. Ustun o'chirilsa,
          ichidagi kartalar boshqa ustunga ko'chiriladi (yo'qolmaydi).
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Yangi voronka nomi (masalan: Qo'llab-quvvatlash)"
          value={newPipelineName}
          onChange={(e) => setNewPipelineName(e.target.value)}
          className="max-w-sm"
        />
        <Button
          disabled={!newPipelineName.trim() || admin.createPipeline.isPending}
          onClick={async () => {
            await admin.createPipeline.mutateAsync({ name: newPipelineName.trim() });
            setNewPipelineName("");
          }}
        >
          <Plus className="mr-1 h-4 w-4" />
          Voronka qo'shish
        </Button>
      </div>

      <div className="space-y-4">
        {pipelines.map((p) => (
          <PipelineRow key={p.id} pipeline={p} admin={admin} canDelete={pipelines.length > 1} />
        ))}
      </div>
    </div>
  );
}

function PipelineRow({
  pipeline,
  admin,
  canDelete,
}: {
  pipeline: Pipeline;
  admin: ReturnType<typeof usePipelineAdmin>;
  canDelete: boolean;
}) {
  const [name, setName] = useState(pipeline.name);
  const [newStageName, setNewStageName] = useState("");
  const stages = [...pipeline.stages].sort((a, b) => a.order - b.order);

  async function move(idx: number, dir: -1 | 1) {
    const next = [...stages];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    await admin.reorderStages.mutateAsync({
      pipelineId: pipeline.id,
      stageIds: next.map((s) => s.id),
    });
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name.trim() && name !== pipeline.name) {
              admin.updatePipeline.mutate({ id: pipeline.id, name: name.trim() });
            }
          }}
          className="max-w-xs font-medium"
        />
        {pipeline.isDefault ? (
          <span className="chip" data-tone="success">Default</span>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => admin.updatePipeline.mutate({ id: pipeline.id, isDefault: true })}
          >
            Default qilish
          </Button>
        )}
        {canDelete && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto text-destructive"
            onClick={() => {
              if (confirm(`"${pipeline.name}" voronkasini o'chirasizmi?`)) {
                admin.deletePipeline.mutate(pipeline.id);
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {stages.map((s, idx) => (
          <StageRow
            key={s.id}
            stage={s}
            pipeline={pipeline}
            admin={admin}
            canMoveUp={idx > 0}
            canMoveDown={idx < stages.length - 1}
            onMoveUp={() => move(idx, -1)}
            onMoveDown={() => move(idx, 1)}
            canDelete={stages.length > 1}
          />
        ))}
      </div>

      <div className="mt-2 flex gap-2">
        <Input
          placeholder="Yangi ustun nomi"
          value={newStageName}
          onChange={(e) => setNewStageName(e.target.value)}
          className="max-w-xs"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={!newStageName.trim() || admin.createStage.isPending}
          onClick={async () => {
            await admin.createStage.mutateAsync({
              pipelineId: pipeline.id,
              name: newStageName.trim(),
              order: stages.length,
              type: "NORMAL",
            });
            setNewStageName("");
          }}
        >
          <Plus className="mr-1 h-4 w-4" />
          Ustun qo'shish
        </Button>
      </div>
    </div>
  );
}

function StageRow({
  stage,
  pipeline,
  admin,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  canDelete,
}: {
  stage: Stage;
  pipeline: Pipeline;
  admin: ReturnType<typeof usePipelineAdmin>;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canDelete: boolean;
}) {
  const [name, setName] = useState(stage.name);
  return (
    <div className="flex items-center gap-2 rounded border bg-background p-2">
      <input
        type="color"
        value={stage.color}
        onChange={(e) =>
          admin.updateStage.mutate({
            pipelineId: pipeline.id,
            stageId: stage.id,
            color: e.target.value,
          })
        }
        className="h-7 w-9 cursor-pointer rounded border"
        title="Rang"
      />
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          if (name.trim() && name !== stage.name) {
            admin.updateStage.mutate({ pipelineId: pipeline.id, stageId: stage.id, name: name.trim() });
          }
        }}
        className="max-w-[200px]"
      />
      <select
        className="h-8 rounded-md border bg-background px-1 text-xs"
        value={stage.type}
        onChange={(e) =>
          admin.updateStage.mutate({
            pipelineId: pipeline.id,
            stageId: stage.id,
            type: e.target.value as "NORMAL" | "WON" | "LOST",
          })
        }
      >
        {STAGE_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
      <div className="ml-auto flex items-center gap-1">
        <Button size="icon" variant="ghost" disabled={!canMoveUp} onClick={onMoveUp} title="Yuqoriga">
          <ArrowUp className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" disabled={!canMoveDown} onClick={onMoveDown} title="Pastga">
          <ArrowDown className="h-4 w-4" />
        </Button>
        {canDelete && (
          <Button
            size="icon"
            variant="ghost"
            className="text-destructive"
            onClick={() => {
              if (confirm(`"${stage.name}" ustunini o'chirasizmi? Kartalar boshqa ustunga ko'chiriladi.`)) {
                admin.deleteStage.mutate({ pipelineId: pipeline.id, stageId: stage.id });
              }
            }}
            title="O'chirish"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
