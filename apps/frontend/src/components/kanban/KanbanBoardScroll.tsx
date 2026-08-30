import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  children: ReactNode;
}

/**
 * Horizontal scroll container for the Kanban board.
 *
 * Wheel behaviour stays NATIVE — vertical mouse scroll keeps scrolling
 * vertical (inside a column's card list, then the page). Horizontal pan
 * has three explicit affordances:
 *
 *   1. **Trackpad / touch** — native horizontal swipe (no changes).
 *   2. **Shift + wheel** — browser default; we don't intercept.
 *   3. **Chevron buttons + top scrollbar** — a thin draggable bar sits
 *      above the board, showing the visible portion of the column rail.
 *      Click the track to jump, drag the thumb to pan freely.
 */
export function KanbanBoardScroll({ children }: Props): JSX.Element {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  // Scroll-bar thumb geometry — width % and left % derived from the
  // viewport vs total scrollable width. `null` while there's nothing to
  // scroll so the thumb hides.
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);

  const update = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const total = el.scrollWidth;
    const view = el.clientWidth;
    if (total <= view + 2) {
      setThumb(null);
      setCanLeft(false);
      setCanRight(false);
      return;
    }
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + view < total - 4);
    setThumb({
      left: (el.scrollLeft / total) * 100,
      width: (view / total) * 100,
    });
  }, []);

  useEffect(() => {
    update();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    // Children change (cards added/removed) doesn't fire scroll, so also
    // poll on a MutationObserver — cheap and only runs on Kanban page.
    const mo = new MutationObserver(update);
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
      mo.disconnect();
    };
  }, [update]);

  function nudge(direction: 1 | -1) {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * 316, behavior: "smooth" });
  }

  // ----- Top scrollbar drag handling ---------------------------------------
  // Native scrollbars are at the bottom and visually noisy; this is a thin
  // draggable replacement that sits above the column rail and stays out of
  // the way until you touch it.
  const dragRef = useRef<{
    startX: number;
    startScrollLeft: number;
    factor: number;
  } | null>(null);

  function onThumbPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const el = scrollRef.current;
    if (!el || !thumb) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    const trackEl = (e.currentTarget.parentElement as HTMLElement | null);
    const trackWidth = trackEl?.clientWidth ?? 1;
    // ratio = (scrollLeft / scrollWidth) maps to (thumbLeft / trackWidth);
    // factor inverts that so a delta of N px in the track moves the board
    // by N * (scrollWidth / trackWidth) px.
    const factor = el.scrollWidth / trackWidth;
    dragRef.current = {
      startX: e.clientX,
      startScrollLeft: el.scrollLeft,
      factor,
    };
  }

  function onThumbPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const el = scrollRef.current;
    if (!drag || !el) return;
    el.scrollLeft = drag.startScrollLeft + (e.clientX - drag.startX) * drag.factor;
  }

  function onThumbPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    dragRef.current = null;
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore — already released */
    }
  }

  function onTrackClick(e: React.MouseEvent<HTMLDivElement>) {
    // Click on the track (not the thumb) → jump there. The thumb stops
    // propagation so this only fires for actual track clicks.
    const el = scrollRef.current;
    if (!el || !thumb) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = clickX / rect.width;
    el.scrollTo({ left: ratio * el.scrollWidth - el.clientWidth / 2, behavior: "smooth" });
  }

  return (
    <div className="relative">
      {/* Top scroll-bar — only renders when the board overflows.
          Larger track + saturated thumb so the control reads as the
          primary horizontal nav, not an afterthought. */}
      {thumb && (
        <div
          onClick={onTrackClick}
          className="relative mx-2 mb-3 h-2.5 cursor-pointer rounded-full border border-border bg-surface"
          aria-hidden
        >
          <div
            role="slider"
            aria-label="Kanban yon-pan"
            aria-valuenow={Math.round(thumb.left)}
            aria-valuemin={0}
            aria-valuemax={100}
            onPointerDown={onThumbPointerDown}
            onPointerMove={onThumbPointerMove}
            onPointerUp={onThumbPointerUp}
            onPointerCancel={onThumbPointerUp}
            onClick={(e) => e.stopPropagation()}
            // Thumb sits flush inside the track; ring-2 on hover gives the
            // affordance a soft glow without changing layout.
            className="absolute top-0 h-full min-w-[40px] cursor-grab rounded-full bg-primary shadow-sm transition-all hover:bg-primary-hover hover:ring-2 hover:ring-primary/20 active:cursor-grabbing"
            style={{ left: `${thumb.left}%`, width: `${thumb.width}%` }}
          />
        </div>
      )}

      {/* Chevron buttons — pointer-fine devices only (md+); mobile relies on
          swipe + top scrollbar. */}
      <button
        type="button"
        onClick={() => nudge(-1)}
        aria-label="Chap tomonga"
        className={cn(
          "absolute left-2 top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full",
          "border bg-card text-foreground shadow-raised transition-all",
          "hover:bg-primary-soft hover:text-primary-soft-foreground",
          canLeft ? "md:flex" : "md:hidden",
        )}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => nudge(1)}
        aria-label="O'ng tomonga"
        className={cn(
          "absolute right-2 top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full",
          "border bg-card text-foreground shadow-raised transition-all",
          "hover:bg-primary-soft hover:text-primary-soft-foreground",
          canRight ? "md:flex" : "md:hidden",
        )}
      >
        <ChevronRight className="h-4 w-4" />
      </button>

      <div
        ref={scrollRef}
        className={cn(
          "flex gap-4 overflow-x-auto pb-4 -mx-2 px-2",
          // Soft column snapping so the board lands aligned when the user
          // stops scrolling. `proximity` (not `mandatory`) lets free-pan
          // work without fighting back.
          "snap-x snap-proximity scroll-smooth scroll-pl-2",
          // Hide native horizontal scrollbar — we render our own at the top.
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        )}
      >
        {children}
      </div>
    </div>
  );
}
