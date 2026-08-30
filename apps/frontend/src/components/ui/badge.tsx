import * as React from "react";
import { cn } from "@/lib/utils";

// Soft Modern Badge / chip — the signature element of the design system.
// Three modes:
//   1. `tone` prop → semantic chip (success/warning/destructive/info/muted).
//      Pure CSS via the `.chip[data-tone="…"]` rules in index.css, so a chip
//      added in a feature page never invents its own palette.
//   2. `color` prop (legacy) → user-defined tag tint. Kept for Tag chips.
//   3. neither → defaults to the accent-soft tone.
export type ChipTone =
  | "default"
  | "success"
  | "warning"
  | "destructive"
  | "info"
  | "muted";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Pick a semantic tone. Falls back to the accent-soft default. */
  tone?: ChipTone;
  /** Per-tag tint (used by user-defined Tags). Overrides `tone`. */
  color?: string;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, tone, color, style, ...props }, ref) => {
    // User-coloured tag — derive a soft tint + matching text from the hex.
    if (color) {
      const finalStyle = {
        ...style,
        backgroundColor: `${color}1f`, // ~12% opacity
        color,
        borderColor: `${color}33`,
      };
      return (
        <span
          ref={ref}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
            className,
          )}
          style={finalStyle}
          {...props}
        />
      );
    }
    return (
      <span
        ref={ref}
        data-tone={tone}
        className={cn("chip", className)}
        style={style}
        {...props}
      />
    );
  },
);
Badge.displayName = "Badge";
