import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Soft Modern Button — same public API as the previous shadcn shape so any
// callsite that passed `variant` / `size` / `asChild` keeps working. What
// changed is the resting visual: rounded-md (10px), card shadow at rest,
// soft accent-soft tint on outline hover.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium tabular-nums " +
    "ring-offset-background transition-all duration-150 ease-out " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
    "disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Solid teal — the brand action. Soft hover via a slightly darker
        // shade, not a brightness shift, so it stays on-brand in both modes.
        default:
          "bg-primary text-primary-foreground shadow-card hover:bg-primary-hover active:shadow-none",
        // Destructive solid — used sparingly (delete, disconnect).
        destructive:
          "bg-destructive text-destructive-foreground shadow-card hover:bg-destructive/90 active:shadow-none",
        // Outline — calm, takes the warm canvas on hover. Stays muted so
        // primary actions still dominate any toolbar.
        outline:
          "border border-input bg-card text-foreground shadow-card hover:bg-primary-soft hover:text-primary-soft-foreground hover:border-primary/30",
        // Secondary — neutral filled chip / quiet button.
        secondary:
          "bg-secondary text-secondary-foreground shadow-card hover:bg-surface",
        // Ghost — chromeless, for toolbars and inline actions.
        ghost: "text-foreground hover:bg-surface",
        link: "text-primary underline-offset-4 hover:underline shadow-none",
      },
      size: {
        // 40px default lands on the 44px touch-target requirement once you
        // count the 2px focus ring + offset. Smaller sizes stay >36px so
        // the secondary toolbar buttons still hit a tap target.
        default: "h-10 px-4 text-sm",
        sm: "h-9 px-3 text-xs",
        lg: "h-11 px-6 text-sm",
        icon: "h-10 w-10",
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
