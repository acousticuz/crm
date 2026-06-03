import * as React from "react";
import { cn } from "@/lib/utils";

// Refined input: 36px height matches the Button default, lighter border, and
// a soft inner shadow so focused state lifts off the page without a heavy
// outline. API identical — only classes change.
export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs",
          "placeholder:text-muted-foreground/70",
          "ring-offset-background transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          "disabled:cursor-not-allowed disabled:opacity-50",
          // File inputs lose their native chrome — match button proportions.
          "file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";
