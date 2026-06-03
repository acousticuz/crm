import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// All variant/size/asChild props stay byte-identical to the previous API —
// only the visual treatment changes. See STYLE_GUIDE.md for the rationale
// (soft shadows over heavy fills, tight rounding, semantic primary).
const buttonVariants = cva(
  // Shared shell: tight tracking + tabular numerals so labels with numbers
  // (e.g. "Yutdi: 12") align across rows.
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium tracking-tightish tabular-nums " +
    "ring-offset-background transition-all duration-150 ease-out " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 " +
    "disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Solid primary, subtle elevation. Hover dims with brightness for a
        // more dimensional feel than a flat opacity change.
        default:
          "bg-primary text-primary-foreground shadow-xs hover:brightness-110 active:brightness-95",
        destructive:
          "bg-destructive text-destructive-foreground shadow-xs hover:brightness-110 active:brightness-95",
        // 1px hairline border with soft surface hover — quieter than the old
        // accent-fill so the page can be denser without feeling busy.
        outline:
          "border border-input bg-background text-foreground shadow-xs hover:bg-surface hover:border-border",
        // Secondary doubles as a "neutral filled" — quieter than primary but
        // still tactile (no border, slight fill).
        secondary:
          "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        // Ghost = chromeless, used in toolbars and inline actions.
        ghost: "text-foreground hover:bg-surface",
        link: "text-primary underline-offset-4 hover:underline shadow-none",
      },
      size: {
        // Tighter heights than shadcn defaults (was 40/36/44/40) — the new
        // type scale renders larger inline, so the buttons no longer need
        // as much vertical padding.
        default: "h-9 px-3.5 text-sm",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-5 text-sm",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
