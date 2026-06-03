/**
 * Design tokens — JS mirror of the HSL CSS variables in src/index.css.
 *
 * Use Tailwind utilities for styling (text-foreground, bg-primary, ...). This
 * module exists only for the rare case where a value has to leave the CSS
 * layer — for example, when a chart library wants a hex stroke color or when
 * a screenshot/PDF service needs a literal background.
 *
 * Source of truth is index.css; if you change a value here it must match
 * there too. See STYLE_GUIDE.md.
 */

/** Read a CSS variable at runtime as an "h s% l%" string. */
export function readToken(name: string): string {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Convert a CSS variable to a usable `hsl(...)` string for SVG / canvas. */
export function tokenColor(name: string): string {
  return `hsl(${readToken(name)})`;
}

/** Stable named handles for the tokens used by charts + canvas surfaces. */
export const SEMANTIC_TOKENS = {
  primary: "--primary",
  destructive: "--destructive",
  success: "--success",
  warning: "--warning",
  info: "--info",
  muted: "--muted",
  border: "--border",
  foreground: "--foreground",
  mutedForeground: "--muted-foreground",
} as const;

/** Radius / shadow handles for inline-styled overlays (e.g. recharts tooltips). */
export const SHAPE_TOKENS = {
  radius: "--radius",
} as const;

export type SemanticToken = keyof typeof SEMANTIC_TOKENS;
