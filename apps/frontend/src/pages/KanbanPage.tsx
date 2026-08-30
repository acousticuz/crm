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
import { KanbanBoardScroll } from "@/components/kanban/KanbanBoardScroll";
import { CardDetailSheet } from "@/components/kanban/CardDetailSheet";
import { Button } from "@/components/ui/button";
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

const LOST_REASON_OPTIONS = [
  "Adashib tushdi",
  "Qimmatlik qildi",
  "Aloqa bo'lmadi",
  "Raqobatchini tanladi",
  "Hozir kerak emas",
  "Hudud/filial noqulay",
  "Boshqa sabab",
] as const;

interface PendingLostMove {
  card: CardListItem;
  stageId: string;
}

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
  const [pendingLostMove, setPendingLostMove] = useState<PendingLostMove | null>(null);
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
    const stageId = over.data.current?.type === "stage" ? String(over.id) : null;
    if (!card || !stageId) return;
    if (card.stageId === stageId) return;
    const targetStage = pipeline?.stages.find((stage) => stage.id === stageId);
    if (targetStage?.type === "LOST") {
      setPendingLostMove({ card, stageId });
      return;
    }
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
          <p className="eyebrow mb-1">Ish jarayoni</p>
          <h1 className="font-display text-3xl font-semibold tracking-tightish text-foreground">
            {pipeline?.name ?? "Kanban"}
          </h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
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
        {/* Horizontal scroll container with edge fades, chevron buttons,
            shift-wheel + scroll-snap. KanbanBoardScroll owns the wrapper so
            this page just emits the columns. */}
        <KanbanBoardScroll>
          {pipeline?.stages.map((stage) => (
            <KanbanColumn
              key={stage.id}
              stage={stage}
              cards={cardsByStage.get(stage.id) ?? []}
              onOpenCard={openCard}
              activeCardId={activeCard?.id ?? null}
            />
          ))}
        </KanbanBoardScroll>

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

      <LostReasonDialog
        pending={pendingLostMove}
        saving={moveCard.isPending}
        onCancel={() => setPendingLostMove(null)}
        onConfirm={(lostReason) => {
          if (!pendingLostMove) return;
          moveCard.mutate(
            {
              cardId: pendingLostMove.card.id,
              stageId: pendingLostMove.stageId,
              lostReason,
            },
            { onSuccess: () => setPendingLostMove(null) },
          );
        }}
      />

      <CardDetailSheet cardId={openCardId} onClose={() => setOpenCardId(null)} />
    </div>
  );
}

function LostReasonDialog({
  pending,
  saving,
  onCancel,
  onConfirm,
}: {
  pending: PendingLostMove | null;
  saving: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}): JSX.Element | null {
  const [selected, setSelected] = useState<string>(LOST_REASON_OPTIONS[0]);
  const [custom, setCustom] = useState("");

  useEffect(() => {
    if (pending) {
      setSelected(LOST_REASON_OPTIONS[0]);
      setCustom("");
    }
  }, [pending]);

  if (!pending) return null;
  const reason = selected === "Boshqa sabab" ? custom.trim() : selected;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border bg-card p-5 shadow-overlay">
        <div className="mb-4">
          <p className="eyebrow mb-1">Karta harakati</p>
          <h2 className="font-display text-lg font-semibold tracking-tightish text-foreground">
            Yo'qotish sababini tanlang
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            <strong className="text-foreground">{pending.card.title}</strong> kartasi Yo'qotildi bosqichiga o'tkaziladi.
          </p>
        </div>

        <div className="space-y-1.5">
          {LOST_REASON_OPTIONS.map((option) => (
            <label
              key={option}
              className="flex cursor-pointer items-center gap-2.5 rounded-md border bg-background px-3 py-2 text-sm transition-colors hover:bg-surface"
            >
              <input
                type="radio"
                name="lost-reason"
                value={option}
                checked={selected === option}
                onChange={() => setSelected(option)}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>

        {selected === "Boshqa sabab" && (
          <textarea
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            placeholder="Sababni yozing..."
            className="mt-3 min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
            Bekor qilish
          </Button>
          <Button type="button" onClick={() => onConfirm(reason)} disabled={saving || !reason}>
            {saving ? "Saqlanmoqda..." : "Yo'qotildi qilish"}
          </Button>
        </div>
      </div>
    </div>
  );
}
