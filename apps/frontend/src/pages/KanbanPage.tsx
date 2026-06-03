import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { KanbanColumn } from "@/components/kanban/KanbanColumn";
import { KanbanFilters } from "@/components/kanban/KanbanFilters";
import { CardDetailSheet } from "@/components/kanban/CardDetailSheet";
import {
  useCards,
  useKanbanRealtime,
  useMoveCard,
  usePipelines,
  useTags,
  useUsers,
  type CardFilters,
} from "@/hooks/useKanban";
import type { CardListItem } from "@/lib/types";

export function KanbanPage(): JSX.Element {
  const { data: pipelines = [], isLoading: pipelinesLoading } = usePipelines();
  const { data: tags = [] } = useTags();
  const { data: users = [] } = useUsers();
  useKanbanRealtime();

  const defaultPipelineId = useMemo(
    () => pipelines.find((p) => p.isDefault)?.id ?? pipelines[0]?.id,
    [pipelines],
  );

  const [filters, setFilters] = useState<CardFilters>({});
  useEffect(() => {
    if (!filters.pipelineId && defaultPipelineId) {
      setFilters((f) => ({ ...f, pipelineId: defaultPipelineId }));
    }
  }, [defaultPipelineId, filters.pipelineId]);

  const pipeline = useMemo(
    () => pipelines.find((p) => p.id === filters.pipelineId),
    [pipelines, filters.pipelineId],
  );

  const { data: cardsPage } = useCards(filters);
  const moveCard = useMoveCard();
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  // Set while a drag is in progress so the post-drop click doesn't pop the
  // detail sheet open.
  const justDraggedRef = useRef(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const cardsByStage = useMemo(() => {
    const grouped = new Map<string, CardListItem[]>();
    for (const card of cardsPage?.items ?? []) {
      if (!grouped.has(card.stageId)) grouped.set(card.stageId, []);
      grouped.get(card.stageId)!.push(card);
    }
    return grouped;
  }, [cardsPage]);

  function onDragEnd(event: DragEndEvent) {
    // Suppress the synthetic click that follows a drop for a moment.
    setTimeout(() => {
      justDraggedRef.current = false;
    }, 50);
    const { active, over } = event;
    if (!over) return;
    const card = active.data.current?.card as CardListItem | undefined;
    const stageId = over.id as string;
    if (!card) return;
    if (card.stageId === stageId) return;
    moveCard.mutate({ cardId: card.id, stageId });
  }

  function openCard(cardId: string) {
    if (justDraggedRef.current) return;
    setOpenCardId(cardId);
  }

  if (pipelinesLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Yuklanmoqda...
      </div>
    );
  }
  if (pipelines.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
        Voronkalar yo'q. Tenant adminga: tenant yaratilganda avtomatik default
        voronka seed bo'lishi kerak edi — Sozlamalar → Voronkalardan yangisini yarating.
      </div>
    );
  }

  const totalCards = cardsPage?.total ?? 0;

  return (
    <div className="space-y-4">
      {/* Page heading row — gives the board a clear surface anchor and shows
          the total card count next to the title for quick orientation. */}
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tightish text-foreground">
            {pipeline?.name ?? "Kanban"}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
            {totalCards} ta karta
          </p>
        </div>
      </div>

      <KanbanFilters
        pipelines={pipelines}
        tags={tags}
        users={users}
        filters={filters}
        onChange={setFilters}
      />

      <DndContext
        sensors={sensors}
        onDragStart={() => {
          justDraggedRef.current = true;
        }}
        onDragEnd={onDragEnd}
      >
        {/* Horizontal scroll container — subtle gradient mask edges so the
            user feels the column rail can scroll without a visible scrollbar
            at rest. */}
        <div className="flex gap-3 overflow-x-auto pb-4 -mx-2 px-2 [scrollbar-gutter:stable]">
          {pipeline?.stages.map((stage) => (
            <KanbanColumn
              key={stage.id}
              stage={stage}
              cards={cardsByStage.get(stage.id) ?? []}
              onOpenCard={openCard}
            />
          ))}
        </div>
      </DndContext>

      <CardDetailSheet cardId={openCardId} onClose={() => setOpenCardId(null)} />
    </div>
  );
}
