# Page Override: Dashboard Home (`/dashboard`)

> Extends `MASTER.md`. Created: 2026-08-05

## Layout

```
┌──────────────────────────────────────────────────────┐
│ Greeting header + status line                        │
├─────────────────────────────────┬────────────────────┤
│ LEFT COLUMN (flex, 1fr)         │ RIGHT COLUMN       │
│                                 │ (300–340px)        │
│ • Stat cards (3-col grid)       │ • Daily Digest     │
│ • Subjects pill row             │ • Quick Launch     │
│ • Recommended next action       │                    │
│ • Performance vs Target         │                    │
│ • Knowledge Twin                │                    │
│ • Adaptive Learning             │                    │
└─────────────────────────────────┴────────────────────┘
```

On mobile (<1024px): both columns stack vertically. Right column moves below left column.
On tablet (768–1023px): single column, max-w full.

## Stat Cards

- Three cards in a responsive grid: `grid-cols-1 sm:grid-cols-3`
- Each: `rounded-2xl border border-border bg-card p-5`
- Hover: `border-primary/20 bg-muted/50` + subtle red radial overlay (already present)
- Large number: `text-[1.6rem] font-semibold tracking-tight tabular-nums`
- Light mode check: foreground on `bg-card` (#FFF) — `text-foreground` OK ✓

## Ambient Background

The red radial blur blob behind the header is permitted as a very subtle `opacity` atmospheric element:
- `rgba(190,28,28,0.08)` dark, `rgba(190,28,28,0.05)` light — thin, non-distracting
- The dot-grid texture at `opacity-[0.18]` is acceptable (subtle structure, not decorative AI imagery)
- `glow-ambient-red` class is permitted here as a one-time static gradient (not animated)

## NeuralOrb in Header

The `<NeuralOrb size="xs" pulse />` in the header status line uses `animate-glow-pulse` and possibly orbit animations. Review `NeuralOrb.tsx`:
- Remove any `animate-orbit-*` animations
- Reduce `animate-glow-pulse` to a single very subtle static ring — or replace with a simple filled dot `h-1.5 w-1.5 rounded-full bg-emerald-400` to indicate "system active" status

## Loading State (loading.tsx)

The existing `loading.tsx` needs to match the page structure. Skeletons should mirror:
- Header: `h-8 w-48 shimmer rounded-xl` for greeting + `h-4 w-32 shimmer rounded-lg` for subtitle
- Stat cards: 3 × `h-28 shimmer rounded-2xl`
- Section cards: `h-40 shimmer rounded-2xl`

## Empty State

When `intel` and `twin` have no data (first-time user post-onboarding):
- Stat cards show `0` counts — this is acceptable (truthful)
- Knowledge Twin empty state is already handled well
- Adaptive Learning empty state: good, with clear call to action
- No new empty state UI needed here

## Error State

If `getDashboardIntelligence()` throws (network error), the page currently has no error boundary. Needs `error.tsx` to exist at the dashboard level — it already does (`/dashboard/error.tsx`). Verify it has a meaningful message and a "Try again" retry button.

## Light Mode Audit

Items that must be verified in light mode:
- `text-foreground/32` on `bg-background`: `hsl(0 0% 32%)` = `#525252` on `#FAFAFA` → contrast ~3.9:1 ⚠ below 4.5 for small text
- Fix: increase to `text-foreground/45` minimum for body copy, `text-foreground/55` for secondary descriptions
- Status dots (emerald, amber, red) on card backgrounds: ✓ decorative, paired with text
- `text-gradient-red` — gradient text has no guaranteed contrast measurement; only use on display headings ≥24px where 3:1 applies

## Accessibility

- `<h1>` is the greeting — ✓ correct
- Sub-cards have no heading hierarchy — section titles like "Adaptive Learning" should be `<h2>` not `<p>`
- The quick launch links are `<Link>` with text content — ✓ accessible
- Stat cards: the large number + label should have a combined accessible name (e.g. "3 documents")
- Animated progress bar in KnowledgeTwinCard needs `role="progressbar" aria-valuenow aria-valuemin aria-valuemax aria-label`
