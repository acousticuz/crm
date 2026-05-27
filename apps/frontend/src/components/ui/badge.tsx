import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  color?: string;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, style, color, ...props }, ref) => {
    const finalStyle = color
      ? { ...style, backgroundColor: `${color}22`, color, borderColor: `${color}55` }
      : style;
    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
          className,
        )}
        style={finalStyle}
        {...props}
      />
    );
  },
);
Badge.displayName = "Badge";
