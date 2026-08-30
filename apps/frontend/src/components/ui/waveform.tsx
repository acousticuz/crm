import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface WaveformProps {
  /** Optional real amplitude samples in [0, 1]. If absent, a deterministic
   *  pseudo-waveform is synthesized from `seed` so the same call always
   *  renders the same shape until a real recording is wired up. */
  samples?: number[];
  /** Seed used by the synthesized fallback. Pass call.id or contact.phone. */
  seed?: string;
  /** Number of bars to render — defaults to a compact inline glyph. */
  bars?: number;
  className?: string;
  /** Title attribute for accessibility / tooltip. */
  title?: string;
}

/** Deterministic 0..1 noise from a string seed. */
function seededAmplitudes(seed: string, count: number): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  const out: number[] = [];
  // A soft envelope so the waveform feels like a real phrase: rise → peak
  // → trail. Without it, random bars look like static.
  for (let i = 0; i < count; i += 1) {
    h = (h * 1103515245 + 12345) >>> 0;
    const noise = (h % 1000) / 1000;
    const t = i / Math.max(count - 1, 1);
    const envelope = Math.sin(Math.PI * t) ** 0.85;
    out.push(0.22 + 0.78 * noise * envelope);
  }
  return out;
}

/**
 * Compact inline waveform glyph. The intent is informational, not decorative:
 * use it only where the row actually represents a call recording, so the
 * shape tells the user a real call has audio behind it.
 *
 * Rendered as SVG bars sharing currentColor — drop it into any text-* class
 * and it picks up the surrounding palette automatically.
 */
export function Waveform({
  samples,
  seed = "acoustic",
  bars = 18,
  className,
  title,
}: WaveformProps): JSX.Element {
  const values = useMemo(() => {
    if (samples && samples.length > 0) {
      // Resample to the requested bar count by linear interpolation.
      if (samples.length === bars) return samples;
      const out: number[] = [];
      for (let i = 0; i < bars; i += 1) {
        const t = (i / (bars - 1)) * (samples.length - 1);
        const i0 = Math.floor(t);
        const i1 = Math.min(samples.length - 1, i0 + 1);
        const f = t - i0;
        out.push(samples[i0] * (1 - f) + samples[i1] * f);
      }
      return out;
    }
    return seededAmplitudes(seed, bars);
  }, [samples, seed, bars]);

  const w = bars * 3 - 1; // 2px bar + 1px gap
  const h = 16;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={title ?? "Audio to'lqini"}
      className={cn("inline-block h-4 w-auto text-muted-foreground/70", className)}
      preserveAspectRatio="none"
    >
      {values.map((v, i) => {
        const barH = Math.max(1.5, v * h);
        const y = (h - barH) / 2;
        return (
          <rect
            key={i}
            x={i * 3}
            y={y}
            width={2}
            height={barH}
            rx={1}
            fill="currentColor"
          />
        );
      })}
    </svg>
  );
}
