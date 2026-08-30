import * as React from "react";
import { cn } from "@/lib/utils";

// Soft Modern Input — 40px tall, warm border, soft card shadow at rest,
// accent ring on focus. API unchanged: every callsite just sees a slightly
// taller, calmer field.
export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-card",
          "placeholder:text-muted-foreground/70",
          "ring-offset-background transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";
