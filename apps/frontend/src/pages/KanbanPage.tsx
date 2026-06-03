import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  type DragEndEvent,
  type DragStartEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { KanbanCard } from "@/components/kanban/KanbanCard";
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
  // Active card during drag — rendered through DragOverlay (portal) so it
  // floats above every column and never gets clipped by a column's
  // overflow:auto. The card in the source column becomes a placeholder.
  const [activeCard, setActiveCard] = useState<CardListItem | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const cardsByStage = useMemo(() => {
    const grouped = new Map<string, CardListItem[]>();
    for (const card of cardsPage?.items ?? []) {
      if (!grouped.has(card.stageId)) grouped.set(card.stageId, []);
      grouped.get(card.stageId)!.push(card);
    }
    return grouped;
  }, [cardsPage]);

  function onDragStart(event: DragStartEvent) {
    justDraggedRef.current = true;
    const card = event.active.data.current?.card as CardListItem | undefined;
    setActiveCard(card ?? null);
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveCard(null);
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

  function onDragCancel() {
    setActiveCard(null);
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
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
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
              activeCardId={activeCard?.id ?? null}
            />
          ))}
        </div>

        {/* DragOverlay — portaled clone of the active card. Rendered
            outside any column so it can never be clipped by a column's
            overflow:auto. Visual offset / rotation gives the card a clear
            "lifted" feel during drag. */}
        <DragOverlay dropAnimation={null}>
          {activeCard ? (
            <div className="pointer-events-none rotate-1 cursor-grabbing">
              <KanbanCard card={activeCard} onOpen={() => undefined} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <CardDetailSheet cardId={openCardId} onClose={() => setOpenCardId(null)} />
    </div>
  );
}
