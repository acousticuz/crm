# Acoustic CRM — Soft Modern style guide

A reference for the visual system. The aesthetic is **soft modern**: a warm
off-white canvas (#F7F5F2), pure white surfaces, an Acoustic teal accent
(#0B8B6E), generous rounded corners, and disciplined typography in Plus
Jakarta Sans + Inter + JetBrains Mono. The design system is engineered for
operators who spend 8+ hours a day in the app — readability, calm, and
muscle-memory beat density.

> Touch the tokens in `src/index.css` and the whole app re-themes. Never
> hardcode a colour or shadow in a component.

---

## 1. Tokens

### Colour (`src/index.css`)

All colours are HSL CSS variables exposed as Tailwind utilities. Reach for
the semantic name (success, warning, destructive, info) rather than raw
red/green/amber/blue.

| Token | Tailwind | Use |
|---|---|---|
| `--background` | `bg-background` | Warm page canvas (#F7F5F2). |
| `--foreground` | `text-foreground` | Near-black body text (#1A1A18). |
| `--card` | `bg-card` | White elevated surface. |
| `--surface` | `bg-surface` | Inset / hovered row tint. |
| `--primary` | `bg-primary` `text-primary` | Acoustic teal (#0B8B6E). |
| `--primary-hover` | `bg-primary-hover` | Hover state for primary actions. |
| `--accent-soft` | `bg-primary/soft` | Pale teal — quiet badges, link hover. |
| `--muted` `--muted-foreground` | `bg-muted` `text-muted-foreground` | De-emphasized text. |
| `--border` `--input` | `border` `border-input` | Warm hairline. |
| `--ring` | `ring-ring` | Focus ring (matches primary). |
| `--destructive` / `-soft` | `bg-destructive`, `bg-destructive-soft` | Errors, delete, missed calls. |
| `--success` / `-soft` | `bg-success`, `bg-success-soft` | Positive state, WON. |
| `--warning` / `-soft` | `bg-warning`, `bg-warning-soft` | Caution, overdue. |
| `--info` / `-soft` | `bg-info`, `bg-info-soft` | Neutral notification, AI analysis. |

Every semantic colour ships as a **pair** — a solid for primary actions /
dot indicators / focus rings, and a `-soft` variant for the soft chip
backgrounds (the signature element). Use solids sparingly; spend most of
the colour on the soft variants.

Dark mode keeps the same token names and the same warm undertone — the
primary lifts to a brighter teal so it stays legible on the cool-black
canvas.

### Typography (`tailwind.config.js`)

Three deliberate roles, loaded from Google Fonts in `index.html`.

| Role | Family | Tailwind | Use |
|---|---|---|---|
| Display | **Plus Jakarta Sans** | `font-display` | Headings, brand wordmark, KPI numbers, hero text. |
| Body / UI | **Inter** | `font-sans` (default) | Everything else. |
| Data | **JetBrains Mono** | `font-mono` | Phone numbers, durations, IDs, scores — anywhere digits should line up. |

`h1`–`h4` inherit `font-display`, `font-semibold`, `tracking-tight` by
default (see `index.css`). Don't reach for the display face on body
content.

### Type scale

Tuned to Inter at a **14px root** (Soft Modern brief).

| Class | Size | Use |
|---|---|---|
| `text-2xs` | 11px | Eyebrows, badge captions. |
| `text-xs` | 12px | Meta labels, chip text, table headers. |
| `text-sm` | 13px | Secondary body. |
| `text-base` | 14px | Default body, form controls. |
| `text-md` | 16px | Card title, section lead. |
| `text-lg` | 18px | Sub-section heading. |
| `text-xl` / `text-2xl` | 20 / 24px | Section heading. |
| `text-3xl` / `text-4xl` | 30 / 36px | Page title. |
| `text-5xl` | 48px | Hero KPI numerals (rare). |

Plus Jakarta Sans pulls tracking slightly tighter at larger sizes via the
scale; don't add `tracking-tight` on top.

### Radius, shadow, spacing

```
Radius:  sm = 6px,  md = 10px (default),  lg = 14px (cards),  xl = 20px (sheets)
Shadow:  card  = quiet resting elevation
         raised = hover lift, floating tooltip
         modal  = sheet, dialog, popover
Space:   4px scale (Tailwind default), generous on Kanban cards (16px)
Motion:  150ms ease (default), 200ms ease (sheet/modal in/out)
```

---

## 2. The signature: the chip

The single thing the design will be remembered for is the **soft semantic
chip** — a pill with a coloured background/foreground pair from the
semantic palette. It appears on Kanban cards (call status), the Calls
feed (direction + status), the Inbox (channel), Settings (integration
status), Dashboard (legend), and every toast.

Render it via the `Badge` primitive or the `.chip` class. Tones map to the
semantic token pairs and never need a one-off Tailwind combo:

```tsx
<Badge tone="success">Yutdi</Badge>
<Badge tone="destructive">Javobsiz</Badge>
<Badge tone="warning">Muddat tugadi</Badge>
<Badge tone="info">Tahlil tayyor</Badge>
<Badge tone="muted">Boshlanmagan</Badge>
```

Or directly in markup when you need to compose with an icon + dot:

```html
<span class="chip" data-tone="success">
  <span class="chip-dot"></span>
  Ulangan
</span>
```

Tags carry a user-defined colour; the legacy `color` prop on `Badge` still
works for them.

---

## 3. Base components (`src/components/ui/*`)

Every primitive keeps its public API. What changed is the resting visual:
softer surface, 10px radius, card shadow at rest, accent ring on focus.

- **`Button`** — `default | destructive | outline | secondary | ghost | link`,
  sizes `default | sm | lg | icon`. Solid teal `default`; outline picks up
  the soft accent tint on hover. Default height 40px → meets the 44px touch
  target with focus offset.
- **`Input` / `Textarea`** — `h-10`, warm border, card shadow at rest,
  accent ring on focus. White surface so inputs stand off the warm canvas.
- **`Badge`** — see chip section above.
- **`Sheet`** — drawer with the new `shadow-modal` and a warm
  `bg-foreground/30` scrim that keeps the page recognizable behind the
  drawer. Default max width `max-w-md`.
- **`Label`** — muted by default (recedes against its input).
- **`Waveform`** — call-recording amplitude glyph, used inline on call
  rows. Driven by a seed when real samples aren't wired.
- **`Meter`** — soft horizontal score / progress bar (QA criteria, KPI
  inline tiles).

Native form controls (`<select>`, `<input type="date|color|number">`,
`<table>`, scrollbars) inherit the system via `@layer base` in
`src/index.css` — no shadcn wrapper needed for one-off uses.

Helper component classes (also `index.css`):

- **`card-surface`** — white rect, card shadow, lg radius.
- **`inset-surface`** — quiet inset block (table header tint).
- **`stat-tile`** — card-surface with the standard tile padding.
- **`eyebrow`** — small uppercase muted lead-in above a heading.
- **`chip`** + `data-tone` — the signature pill.
- **`meter-track` / `meter-fill`** — what `<Meter>` renders.

---

## 4. Layout rules

- **Calm canvas, white surfaces.** The page background carries warmth; the
  primary working surface is white. Never invert that.
- **One accent per screen.** Primary buttons / active nav / brand mark
  carry the teal. Soft variants and chips do the rest of the colour work.
- **No raw red/green/amber/blue.** Use the semantic tokens so a re-theme
  cascades.
- **Borders are hairlines.** Stick to `border` (1px, `--border`). Reserve
  `border-2` for emphasis on a tile, never as the default.
- **Hover is a lift, not a fill.** Card surfaces gain `shadow-raised` on
  hover, not a different background. Buttons darken from `primary` to
  `primary-hover`.
- **Numbers** use `font-mono`. Phone numbers, durations, IDs, scores,
  monetary sums — all of them.
- **Touch target ≥ 44px** for every interactive element. The default button
  is 40px tall, but with the 2px focus ring + 2px offset the hit area is
  44px+. Don't go below the `sm` size for primary actions.

---

## 5. Mobile breakpoints

The Soft Modern brief moves to standard Tailwind breakpoints:

| Breakpoint | Width | Use |
|---|---|---|
| (default) | < 640 | Phone — sidebar collapses to bottom tab bar. |
| `sm:` | ≥ 640 | Large phone. |
| `md:` | ≥ 768 | Tablet — sidebar may surface as a drawer; Kanban becomes 2-column. |
| `lg:` | ≥ 1024 | Desktop — full sidebar, 3+ Kanban columns. |
| `xl:` | ≥ 1280 | Wide desktop. |

Each component is responsive at the component level. Page wrappers should
default to `p-4 lg:p-8` so the canvas breathes on desktop without crushing
content on mobile.

---

## 6. Adding a new colour or component

1. Add the HSL values (solid + soft) to **both** `:root` and `.dark` in
   `src/index.css`.
2. Expose them as Tailwind utilities in `tailwind.config.js` under
   `theme.extend.colors`.
3. Reach for `tokenColor("--your-token")` from `src/lib/tokens.ts` if a
   chart needs a literal hex.
4. Document the new token here.

For a new shadcn primitive, copy the existing pattern in
`src/components/ui/button.tsx`: keep the API stable, lean on the tokens,
respect the touch-target minimum.
