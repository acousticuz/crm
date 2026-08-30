import { cn } from "@/lib/utils";

interface BrandMarkProps {
  /** Hide the wordmark and render only the glyph (e.g. collapsed sidebar). */
  glyphOnly?: boolean;
  className?: string;
}

/**
 * Acoustic CRM brand mark — small custom glyph (a centered waveform with a
 * lifted peak) paired with a tight Space Grotesk wordmark. Replaces the
 * generic Lucide `Waves` icon-on-a-rounded-square that came before.
 *
 * The glyph is currentColor so it picks up the sidebar's text color and works
 * on both light + dark surfaces without per-mode branching.
 */
export function BrandMark({ glyphOnly, className }: BrandMarkProps): JSX.Element {
  return (
    <span className={cn("inline-flex items-center gap-2 text-foreground", className)}>
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <svg
          viewBox="0 0 20 20"
          aria-hidden
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Five-bar centered waveform — the third bar is the tallest, like a
              centered phrase peak. Reads as a small "sound" mark without
              looking like the generic Lucide waves. */}
          <path d="M3 10 L3 10" />
          <line x1="3" y1="8" x2="3" y2="12" />
          <line x1="6.5" y1="5.5" x2="6.5" y2="14.5" />
          <line x1="10" y1="3" x2="10" y2="17" />
          <line x1="13.5" y1="6" x2="13.5" y2="14" />
          <line x1="17" y1="8.5" x2="17" y2="11.5" />
        </svg>
      </span>
      {!glyphOnly && (
        <span className="font-display text-sm font-semibold tracking-tightish text-foreground">
          Acoustic <span className="text-muted-foreground">CRM</span>
        </span>
      )}
    </span>
  );
}
