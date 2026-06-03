import * as React from "react";
import { cn } from "@/lib/utils";

// Pill badge — the per-tag `color` prop drives a tinted fill + matching
// foreground so user-defined tags read cohesively against the new neutral
// surfaces. API unchanged.
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  color?: string;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, style, color, ...props }, ref) => {
    // 14% fill + 36% border weight — soft against the new neutral surface,
    // and the hex-suffix idiom keeps custom user colors arbitrary.
    const finalStyle = color
      ? { ...style, backgroundColor: `${color}24`, color, borderColor: `${color}5c` }
      : style;
    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2 py-px text-2xs font-medium tracking-tightish",
          className,
        )}
        style={finalStyle}
        {...props}
      />
    );
  },
);
Badge.displayName = "Badge";
