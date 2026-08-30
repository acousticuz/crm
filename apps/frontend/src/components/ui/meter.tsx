import { cn } from "@/lib/utils";

interface MeterProps {
  /** 0..100 score. Values outside the range are clamped. */
  value: number;
  /** Pick a semantic tone, or let the meter pick one from the value. */
  tone?: "primary" | "success" | "warning" | "destructive" | "muted";
  className?: string;
  /** Optional ARIA label so screen readers announce the meaning. */
  label?: string;
}

/** Pick a soft semantic tone from a 0..100 score. */
function autoTone(value: number): NonNullable<MeterProps["tone"]> {
  if (value >= 80) return "success";
  if (value >= 50) return "primary";
  if (value >= 30) return "warning";
  return "destructive";
}

/**
 * A soft horizontal progress / score meter. Used for QA scores, criterion
 * results, and anywhere a percentage needs to read at a glance. Single source
 * of truth so a future re-theme touches one place.
 */
export function Meter({ value, tone, className, label }: MeterProps): JSX.Element {
  const clamped = Math.max(0, Math.min(100, value));
  const resolvedTone = tone ?? autoTone(clamped);
  return (
    <div
      role={label ? "meter" : undefined}
      aria-label={label}
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("meter-track", className)}
    >
      <div
        className="meter-fill"
        data-tone={resolvedTone}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
