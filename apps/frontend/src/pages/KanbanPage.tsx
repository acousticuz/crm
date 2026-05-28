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
    return <div className="text-sm text-muted-foreground">Yuklanmoqda...</div>;
  }
  if (pipelines.length === 0) {
    return (
      <div className="rounded border p-4 text-sm">
        Voronkalar yo'q. Tenant adminga: tenant yaratilganda avtomatik default
        voronka seed bo'lishi kerak edi — qayta sozlang yoki yangi tenant yarating.
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
        <div className="flex gap-3 overflow-x-auto pb-4">
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
