# Acoustic CRM — Style Guide

A short reference for the visual system. The aesthetic is **refined minimalist**:
generous whitespace, hairline borders, soft shadows, one accent color, semantic
tokens. Every page reads from the same tokens — no hard-coded hex anywhere.

---

## 1. Tokens

### Color (`src/index.css`)

All colors are HSL CSS variables exposed as Tailwind utilities. Reach for the
semantic names, not raw palette colors.

| Token | Tailwind | Use for |
|---|---|---|
| `--background` | `bg-background` `text-background` | Page background |
| `--foreground` | `text-foreground` | Body text |
| `--card` | `bg-card` | Elevated content rect |
| `--surface` | `bg-surface` | Inset / nested panel (table header, etc.) |
| `--primary` | `bg-primary` `text-primary` | Primary action, links, active state |
| `--secondary` | `bg-secondary` | Neutral filled chip / quiet button |
| `--muted` `--muted-foreground` | `bg-muted` `text-muted-foreground` | De-emphasized text |
| `--border` `--input` | `border` `border-input` | Hairlines, form outlines |
| `--ring` | `ring-ring` | Focus ring (matches primary) |
| `--destructive` | `bg-destructive` `text-destructive` | Errors, delete actions |
| `--success` | `bg-success` `text-success` | Positive state |
| `--warning` | `bg-warning` `text-warning` | Caution |
| `--info` | `bg-info` `text-info` | Neutral notification |

Dark mode swaps the variable values; component classes never branch on `dark:`.

### Type scale (`tailwind.config.js`)

Sized for Inter at a 15px root. Tracking tightens as size grows.

| Class | Size | Use |
|---|---|---|
| `text-2xs` | 11px | Badges, table-header captions |
| `text-xs` | 12px | Meta labels, secondary info |
| `text-sm` | 13px | Default body |
| `text-base` | 14px | Primary body |
| `text-lg` | 16px | Card title |
| `text-xl` / `text-2xl` | 18 / 22px | Section heading |
| `text-3xl` / `text-4xl` | 28 / 36px | Page title |

`tracking-tightish` (-0.01em) is the default for headings and tabular UI.

### Radius

`--radius: 0.375rem` (6px). Tighter than shadcn's 8px so the UI reads precise
at our text size. Helpers: `rounded-lg` (full), `rounded-md` (input/button),
`rounded-sm` (chips, small inset blocks).

### Shadow ladder

Hierarchy comes from shadow weight, not from heavy borders.

| Class | Use |
|---|---|
| `shadow-xs` | Inputs, default Buttons (rest state) |
| `shadow-sm` | Hover lift |
| `shadow-md` | Floating tooltip |
| `shadow-lg` | Modal / popover |
| `shadow-overlay` | Side Sheet, dropdown |

### Spacing

Stay on Tailwind's default 4px scale. The container padding is `1rem` mobile
→ `2rem` desktop. Prefer `space-y-*` and `gap-*` over manual margins.

---

## 2. Base components (`src/components/ui/*`)

All API-compatible with their previous versions — only classes changed.

- **`Button`** — `default | destructive | outline | secondary | ghost | link`,
  sizes `default | sm | lg | icon`. Default size is `h-9` (36px).
- **`Input` / `Textarea`** — `h-9`, hairline border, `shadow-xs`, primary focus
  ring with a 1px offset.
- **`Badge`** — pill; pass `color="#abcdef"` to tint with a user-defined hue
  (used by Tags). No color → neutral border.
- **`Label`** — muted by default (recedes against its input).
- **`Sheet`** — side drawer with the new `shadow-overlay` and a softer
  scrim. Max width `max-w-md`.

Native form elements (`<select>`, `<input type="date|color|number">`, `<table>`,
scrollbars) inherit the system via `@layer base` in `src/index.css` — no shadcn
wrapper required.

Use the **`card-surface`**, **`inset-surface`**, and **`stat-tile`** helper
classes (also in `index.css`) for layout blocks that recur.

---

## 3. Layout rules

- **Whitespace first.** Default to `p-4`, `gap-4`, `space-y-4`. Add density
  only where data demands it.
- **One accent per screen.** Primary buttons / active tab / brand mark
  carry `--primary`. Everything else is neutral.
- **No raw red/green/amber/blue** — use `text-destructive`, `text-success`,
  `text-warning`, `text-info` so future re-themes don't drift.
- **Borders are hairlines.** Stick to `border` (1px, --border). Reserve
  `border-2` for emphasis on a tile, never as default.
- **Headings collapse weight** to `font-semibold` (600). 700 is the cap.
- **Numbers** use `tabular-nums` (default on Button). Apply manually with
  the `tabular-nums` utility when listing money / counts.

---

## 4. Adding a new color or component

1. Add the HSL value to **both** `:root` and `.dark` in `src/index.css`.
2. Expose it as a Tailwind utility in `tailwind.config.js` under
   `theme.extend.colors`.
3. If a chart needs a literal hex, read it via
   `tokenColor("--your-token")` from `src/lib/tokens.ts`.
4. Update this file.

For a new shadcn primitive, copy the existing pattern in
`src/components/ui/button.tsx`: keep the API stable, lean on the tokens.
