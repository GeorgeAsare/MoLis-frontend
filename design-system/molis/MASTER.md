# MoLis Intelligence — Design System MASTER v2.0

> **Last updated:** 2026-08-06  
> **Authority:** George's written founder directives are the unconditional source of truth. This document encodes those directives in implementable form. Any conflict between this document and George's directives must be raised to George, not resolved silently.  
> **Scope:** Web application — Next.js 16 / React 19 / Tailwind CSS v4 / Motion for React v12.  
> **ui-ux-pro-max and 21st.dev** are research tools only. Their generic suggestions are subordinate to every section of this document.

---

## 0. George's Non-Negotiable Product Principles

These are founder directives, not recommendations. Every design decision must serve them.

1. **Premium Apple-like smoothness** — interaction quality rivals the best consumer products, not the fastest-built SaaS tool.
2. **Designed for students, not adapted from a business dashboard** — warmth, approachability, and focus matter as much as functionality.
3. **Target Red · White · Black** — approximately **70% neutral foundation, 30% supporting surfaces, 10% red emphasis.**
4. **Light, Dark, and Automatic** — all three modes are fully designed and equally supported; none is an afterthought.
5. **Purposeful motion only** — every animation improves comprehension or confirms feedback. Decorative-only animation is banned.
6. **No generic AI aesthetic** — no purple gradients, no glowing neural borders, no decorative brain imagery.
7. **No excessive gradients** — avoid multi-stop gradients on surfaces. Single-direction tonal shifts only, used sparingly.
8. **No random glassmorphism** — backdrop blur is used only where content layering genuinely requires it (modals, bottom nav, top bar on scroll).
9. **Excellent accessibility** — WCAG AA minimum everywhere. Not aspirational; mandatory.
10. **Fully responsive** — mobile, tablet, and desktop are primary targets, not afterthoughts.

---

## 1. Colour System

### 1.1 Brand Colour Hierarchy

| Weight | Role | Primary use |
|--------|------|-------------|
| ~70% | Neutral (black / off-white) | Backgrounds, surfaces, borders, body text |
| ~30% | Supporting (cards, secondary surfaces) | Cards, panels, muted areas |
| ~10% | Target Red | CTAs, active states, brand moments, key indicators |

### 1.2 Semantic CSS Token Reference

All component code must use these token names. Raw hex values inside component files are banned.

| Token | Light value | Dark value | Purpose |
|-------|-------------|------------|---------|
| `--background` | `hsl(0 0% 98%)` `#FAFAFA` | `hsl(0 4% 8%)` `#141212` | Page background |
| `--foreground` | `hsl(0 0% 6%)` `#0F0F0F` | `hsl(0 0% 97%)` `#F7F7F7` | Primary text |
| `--card` | `hsl(0 0% 100%)` `#FFFFFF` | `hsl(0 3% 12%)` `#1E1A1A` | Card / panel surface |
| `--card-foreground` | same as `--foreground` | same as `--foreground` | Text on cards |
| `--primary` | `hsl(0 82% 44%)` `#BE1C1C` | `hsl(0 80% 50%)` `#CC2929` | Target Red — primary actions |
| `--primary-foreground` | `hsl(0 0% 98%)` | `hsl(0 0% 98%)` | Text on primary |
| `--secondary` | `hsl(0 0% 94%)` | `hsl(0 2% 14%)` | Secondary surface |
| `--secondary-foreground` | `hsl(0 0% 20%)` | `hsl(0 0% 72%)` | Text on secondary |
| `--muted` | `hsl(0 0% 95%)` | `hsl(0 2% 14%)` | Muted surface |
| `--muted-foreground` | `hsl(0 0% 42%)` | `hsl(0 0% 50%)` | Muted/secondary text |
| `--border` | `hsl(0 0% 89%)` | `hsl(0 0% 18%)` | Default borders |
| `--input` | `hsl(0 0% 89%)` | `hsl(0 0% 17%)` | Input borders |
| `--ring` | = `--primary` | = `--primary` | Focus rings |
| `--destructive` | `hsl(0 84% 60%)` | `hsl(0 62.8% 30.6%)` | Destructive/error actions |
| `--destructive-foreground` | `hsl(0 0% 98%)` | `hsl(0 0% 98%)` | Text on destructive |

In Tailwind v4: use `bg-background`, `text-foreground`, `border-border`, `bg-card`, `bg-primary`, `text-primary`, etc. These are wired via `@theme inline` in `globals.css`.

### 1.3 Status Colours (supplementary, for data states only)

These are never used for brand expression. Always paired with text or an icon — never colour alone.

| State | Class | Meaning |
|-------|-------|---------|
| Success | `text-emerald-400`, `bg-emerald-500/[0.07]`, `border-emerald-500/20` | Completed, on-track |
| Warning | `text-amber-400`, `bg-amber-500/[0.07]`, `border-amber-500/20` | At risk |
| Error | `text-red-400`, `bg-red-500/[0.07]`, `border-red-500/20` | Failure (distinct from destructive) |
| Info | `text-sky-400`, `bg-sky-500/[0.07]`, `border-sky-500/20` | Neutral data |
| Quiz/AI | `text-violet-400`, `bg-violet-500/[0.07]`, `border-violet-500/20` | AI tool category |

### 1.4 Contrast Requirements

| Context | Minimum ratio | Standard |
|---------|--------------|----------|
| Body text on surface | 4.5 : 1 | WCAG AA |
| Large text (≥24px regular or ≥18.67px bold) | 3 : 1 | WCAG AA |
| Interactive element borders, icons | 3 : 1 | WCAG AA |
| Status badge text | 4.5 : 1 | WCAG AA |

Both light and dark modes must meet these independently. Do not assume a light-passing value works in dark.

### 1.5 Target Red Usage Rules

- **Use for**: primary CTA buttons, active nav indicators, brand moments in headings, key data callouts.
- **Do not use for**: body text, secondary labels, decorative accents, multiple elements competing on the same screen.
- **One primary red CTA per screen** — Apple HIG rule, enforced.
- Red glow effects (`shadow-[0_0_20px_-6px_rgba(190,28,28,0.50)]`) are permitted on primary buttons. Not permitted on cards, nav items, or decorative elements.

---

## 2. Typography

### 2.1 Font Stack

```css
--font-sans: var(--font-geist-sans), system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
--font-mono: var(--font-geist-mono), 'SF Mono', Consolas, monospace;
```

Geist Sans and Geist Mono are loaded via Next.js font system in `src/app/layout.tsx`. No additional typefaces without George's approval.

### 2.2 Type Scale

| Role | Size | Line-height | Weight | Letter-spacing | Usage |
|------|------|------------|--------|----------------|-------|
| Display | `text-[2.5rem]` / 40px | 1.08 | 600 | `-0.035em` | Hero headings (landing page only) |
| H1 / page title | `text-[1.875rem]` / 30px | 1.15 | 600 | `-0.03em` | One per page |
| H2 / section title | `text-xl` / 20px | 1.3 | 600 | `-0.02em` | Section headings |
| H3 / card title | `text-[0.9375rem]` / 15px | 1.4 | 600 | `-0.01em` | Card headings, panel titles |
| Body large | `text-[0.9375rem]` / 15px | 1.65 | 400 | `0` | Lead/intro paragraphs |
| Body | `text-sm` / 14px | 1.6 | 400 | `0` | Standard body copy |
| Body small | `text-[0.8125rem]` / 13px | 1.55 | 400/500 | `0` | Secondary content, nav labels |
| Caption | `text-xs` / 12px | 1.5 | 400 | `0` | Metadata, timestamps |
| Label / eyebrow | `text-[11px]` | 1.4 | 600 | `0.08–0.12em` | Always uppercase, section markers |

**Rules:**
- Minimum body text size: 13px (sidebar labels). Minimum readable body: 14px.
- `Label / eyebrow` must always be `uppercase` and tracked. Never sentence-case.
- Never add positive `letter-spacing` to body text.
- Line length: 60–75 characters for body; 45–60 for card content. Use `max-w-prose` or explicit `max-w-*`.
- `text-gradient-red` is permitted only on display headings (≥24px) where the 3:1 large-text rule applies.

---

## 3. Spacing Scale

All spacing uses Tailwind's 4px base grid. Ad-hoc values (e.g. `p-[11px]`) are banned except inside pixel-precise icon containers.

| Token | Value | Primary use |
|-------|-------|-------------|
| `space-1` / `p-1` | 4px | Icon padding, micro-gaps |
| `space-2` / `p-2` | 8px | Inline gaps, tight groups |
| `space-3` / `p-3` | 12px | Compact internal padding |
| `space-3.5` | 14px | Button padding (sm) |
| `space-4` / `p-4` | 16px | Default unit; mobile page padding |
| `space-5` / `p-5` | 20px | Card padding |
| `space-6` / `p-6` | 24px | Section gaps, tablet page padding |
| `space-7` | 28px | Logo area spacing |
| `space-8` / `p-8` | 32px | Desktop page padding |
| `space-10` | 40px | Section separators |
| `space-12` | 48px | Large section spacing |
| `space-16` | 64px | Hero spacers |

### Page Gutters (Responsive)

| Breakpoint | Horizontal padding | Vertical padding |
|------------|-------------------|-----------------|
| `< md` (mobile) | `px-4` (16px) | `py-5` (20px) |
| `md–lg` (tablet) | `px-6` (24px) | `py-6` (24px) |
| `≥ lg` (desktop) | `px-8` (32px) | `py-8` (32px) |

### Content Width

| Breakpoint | Max content width | Pattern |
|------------|------------------|---------|
| Mobile | full width | — |
| Tablet | full width | — |
| Desktop | `max-w-5xl` (focused) or `max-w-7xl` (wide canvas) | `mx-auto` |
| Ultra-wide | cap at 1440px | `max-w-screen-2xl mx-auto` |

The current per-page `max-w-2xl` (Study) and `max-w-3xl` (Memory/Agents) inconsistency will be normalised in Phase 2. Phase 1 does not alter page-level max-widths.

---

## 4. Border Radius Scale

| Token | Value | Use |
|-------|-------|-----|
| `--ml-radius-xs` / `rounded-sm` ≈ | 4px | Badges, inline code |
| `--ml-radius-sm` / `rounded` | 6px | Tags, small chips |
| `--ml-radius-md` | 10px | Inputs, small buttons |
| `--ml-radius-lg` / `rounded-xl` | 14px | Buttons (default), nav items, icon containers |
| `--ml-radius-xl` / `rounded-2xl` | 20px | **Cards — primary card radius** |
| `--ml-radius-2xl` | 28px | Large feature cards, modal containers |
| `rounded-full` | 9999px | Avatars, status dots, pills |

**Primary card radius is `rounded-2xl` (20px).** Never use `rounded-lg` (8px) on dashboard cards — it reads as generic.

---

## 5. Border Hierarchy

| Level | Class | Use |
|-------|-------|-----|
| Default | `border border-border` | Cards, inputs, nav |
| Active | `border-primary/25` | Primary action hover/focus |
| Subtle | `border-border/50` | Disabled cards, coming-soon |
| Emphasis | `border-primary/40` | Drag-active states |
| Destructive | `border-red-500/20` | Error / danger zones |
| None | (no border) | Text buttons, ghost actions |

Borders must be visible in both light and dark modes. Do not rely solely on `rgba` opacity values — test both modes.

---

## 6. Elevation & Shadow Hierarchy

MoLis uses a restrained shadow system. Shadows are for depth communication, not decoration.

| Level | Class | Use |
|-------|-------|-----|
| Ground | no shadow | Inline elements, text |
| Raised (card) | `.shadow-card` | Default card depth |
| Hover (card) | `.shadow-card-hover` | Card hover state |
| Primary button | `shadow-[0_0_20px_-6px_rgba(190,28,28,0.50)]` | Red glow on primary CTA |
| Primary button hover | `shadow-[0_0_32px_-4px_rgba(190,28,28,0.65)]` | Stronger glow on hover |
| Modal / sheet | standard `shadow-2xl` + backdrop scrim | Overlay elevation |

`.shadow-card` and `.shadow-card-hover` utilities are defined in `globals.css` and should be adapted to be light-mode-aware (dark values use `rgba(0,0,0,0.30)`, light values use `rgba(0,0,0,0.08)`).

---

## 7. Icon Rules

| Rule | Requirement |
|------|-------------|
| Library | Inline SVG (Heroicons style) — already the pattern. `lucide-react` available if needed. |
| No emoji | Never use emoji as structural icons |
| Stroke width | `1.5` for content icons; `1.6` for sidebar/navigation icons |
| Sizing tokens | `h-3.5 w-3.5` (xs / 14px), `h-4 w-4` (sm / 16px), `h-[18px] w-[18px]` (md / 18px), `h-5 w-5` (lg / 20px), `h-6 w-6` (xl / 24px) |
| Invalid class | `h-4.5` is **not a valid Tailwind v4 class** — use `h-[18px]` |
| Style consistency | Fill vs stroke style must not mix within the same hierarchy level |
| Contrast | Icons must meet 3:1 contrast against their background |
| Touch target | Icon-only buttons: 44×44px minimum tap area |
| ARIA | All icon-only buttons need `aria-label` |

---

## 8. Button System

### Variants

| Variant | Light appearance | Dark appearance | Use |
|---------|-----------------|-----------------|-----|
| `primary` | Red fill, white text, red glow shadow | Same (brighter red) | One primary CTA per view |
| `secondary` | Translucent border + faint bg, foreground text | Same | Secondary actions |
| `ghost` | No bg, muted text, bg on hover | Same | Tertiary / in-context |
| `danger` | Red-tinted border, red bg tint, red text | Same | Destructive confirmation only |

**`violet` variant is removed** — it was dead code identical to `primary`.

### Sizes

| Size | Padding | Font | Use |
|------|---------|------|-----|
| `sm` | `px-3.5 py-2` | `text-xs` | Inline, tight spaces |
| `md` | `px-4 py-2.5` | `text-sm` | Default |
| `lg` | `px-5 py-3` | `text-sm` | Prominent CTA |

### States

- **Loading**: disable + show spinner (✓ implemented)
- **Disabled**: `opacity-40 pointer-events-none` (✓ implemented)
- **Focus**: `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background` — must be visible
- **Hover**: brightness boost / border colour change (CSS transition, not Motion)
- **Tap/press**: scale 0.97 via `whileTap` (✓ implemented)

---

## 9. Input, Select, and Form Rules

### Input

- **Always a visible label above** — never placeholder-only
- `border-input bg-background text-foreground` — semantic tokens, not hardcoded rgba
- **Focus ring**: `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` — must be visible, not `ring-0`
- Error: `border-destructive` + error message below in `text-destructive text-xs`
- Height: min `h-10` (40px) for touch targets
- Disabled: `opacity-50 cursor-not-allowed`

### Select

- Same token rules as Input
- Visible chevron arrow indicator
- Touch-target height: min 40px

### Form Rules

- Group related fields with visual or structural separation
- Required fields marked (asterisk or explicit label)
- Error messages adjacent to their field, not just at top
- Submit button loading state (disable + spinner)
- No `ring-0` focus removal — always provide visible focus

---

## 10. Card Variants

| Variant | Class pattern | Use |
|---------|--------------|-----|
| Default | `rounded-2xl border border-border bg-card p-5` | Standard dashboard panels |
| Interactive | Default + `transition-all hover:border-primary/20 hover:bg-muted/50` + `cursor-pointer` | Clickable navigation cards |
| Highlighted | `rounded-2xl border border-primary/25 bg-primary/[0.04] p-5` | AI recommendations, start-here prompts |
| Muted | `rounded-2xl border border-border/50 bg-muted/25 p-5 opacity-50` | Disabled / coming-soon cards |
| List row | `rounded-xl border border-border bg-card px-4 py-3` | Document list items, activity rows |

### Card Rules

- Cards must be visually distinct from the page background in both light and dark mode
- Hover state must be perceptible — do not rely on subtle opacity-only shifts
- Never mix card radii on the same visual level (all dashboard panels use `rounded-2xl`)

---

## 11. Page Header Hierarchy

A consistent page-header pattern applies across all dashboard pages:

```
[Label/eyebrow — 11px, uppercase, tracked, text-foreground/38]
[H1 — page title, text-[1.875rem] or text-xl depending on context, font-semibold]
[Description — text-sm, text-muted-foreground, leading-relaxed]
[Optional: right-aligned primary action]
```

- `<PageHeader>` component: `title` always renders as `<h1>` at page level, but the component now accepts an `as` prop (`'h1' | 'h2'`) for reuse within panels
- One `<h1>` per page maximum
- Section titles within cards: `<h2>` or `<h3>` — never `<p>` for semantics
- Eyebrow label text: `text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground/38` — unified across all pages

---

## 12. Navigation States

### Desktop Sidebar

| State | Icon | Label | Background | Indicator |
|-------|------|-------|------------|-----------|
| Default | `text-foreground/22` | `text-foreground/38` | none | none |
| Hover | `text-foreground/55` | `text-foreground/70` | `bg-foreground/[0.04]` | none |
| Active | `text-primary` | `text-foreground` | `bg-foreground/[0.06] border border-border` | Red dot (animated, `layoutId` spring) |
| Focus-visible | Border: `ring-2 ring-ring` | | | |

### Mobile Bottom Tab Bar

| State | Icon | Label | Background |
|-------|------|-------|------------|
| Default | `text-foreground/38` | `text-foreground/35` `text-[10px]` | none |
| Active | `text-primary` | `text-primary` `font-semibold` | `bg-primary/[0.08] rounded-xl` around icon+label |
| Press | `scale: 0.92` via Motion tap | | |

### Keyboard Focus in Navigation

- All nav links must show `focus-visible:ring-2 focus-visible:ring-ring`
- Tab order matches visual order top-to-bottom (sidebar) / left-to-right (bottom bar)
- `aria-current="page"` on the active link

---

## 13. Mobile Navigation

### Breakpoint Rules

| Breakpoint | Navigation |
|------------|-----------|
| `< md` (< 768px) | Fixed bottom tab bar (5 items) + `MobileTopBar` (logo + menu) |
| `md–lg` (768–1023px) | `MobileTopBar` (logo + hamburger) + `MobileSheet` slide-over |
| `≥ lg` (≥ 1024px) | Persistent `Sidebar` (212px fixed left) |

### Bottom Tab Bar Spec

- `position: fixed; bottom: 0; left: 0; right: 0; z-index: 40`
- Background: `bg-card/95 backdrop-blur-xl border-t border-border`
- Safe area: `pb-[env(safe-area-inset-bottom)]` (iOS home bar)
- Height: `h-16` + safe area padding
- Items: Home · Subjects · Study · Agents · Memory
- Each tab: `flex-1 flex flex-col items-center justify-center gap-1 min-h-[44px]`
- Icon size: 22px (`h-[22px] w-[22px]`)
- Label: `text-[10px]`
- Active background: a 44×44px pill `bg-primary/[0.08] rounded-xl` centred on the icon+label group
- Motion: tap scales to 0.92, returns with spring — `useReducedMotion` disables this
- Screen reader: `role="tablist"` on container; each item `role="tab" aria-selected aria-label`
- Main content: `pb-16 md:pb-0` to avoid bottom-nav overlap

### MobileTopBar Spec

- `position: sticky; top: 0; z-index: 30`
- Background: `bg-background/95 backdrop-blur-xl border-b border-border`
- Height: `h-14`
- Left: MoLis logo (orb + wordmark)
- Right: hamburger/menu button (opens `MobileSheet`)
- Visible only: `flex lg:hidden`

### MobileSheet Spec

- Full-height slide-over from left
- Width: `min(280px, 85vw)`
- Background: `bg-card border-r border-border`
- Scrim: `bg-black/50` on the rest of the screen, click to close
- Animation: `x: -300 → 0` enter, `x: 0 → -300` exit, `--ml-ease-smooth` duration `--ml-dur-normal`
- Contains: all 5 nav items + Setup + ThemeToggle + Sign out
- Accessible: `role="dialog"` `aria-modal="true"` `aria-label="Navigation"` focus trap, Escape to close
- `aria-current="page"` on active item

### Setup and Sign Out

- Setup and Sign out are **not primary destinations** — they do not appear in the bottom tab bar
- On desktop: appear in sidebar footer below a separator
- On mobile: accessible via the hamburger → `MobileSheet`

---

## 14. Loading, Empty, Error, and Offline States

### Loading

- **Skeleton screens** preferred over spinners for content areas taking >300ms
- Skeleton shape must approximate the content it replaces
- Skeleton: `bg-muted/60 rounded-xl` base, `shimmer` utility for animation
- `Skeleton` component accepts `className` and `style` for flexible sizing
- Button loading: `disabled + spinner` (✓ existing)
- Inline operation: spinner within the element, not a full-page loader

### Empty States

Pattern: icon container → title → description → optional CTA  
```
<div role="img" aria-label="[meaningful description]">
  [icon in h-12 w-12 container, rounded-2xl border bg-muted/40]
</div>
<h3 className="text-sm font-medium text-foreground/70">[Title]</h3>
<p className="text-xs text-muted-foreground">[Description]</p>
[optional Button]
```
Containers must use semantic tokens — no `text-white/30` or `border-white/10`.

### Error States

- Page-level errors: `ErrorView` component with warning icon, message, and retry button
- Inline errors: `text-destructive text-xs` adjacent to the failing element
- Toast: `aria-live="polite"` for non-critical notifications
- Error messages must state the cause and the recovery path — not "Something went wrong" alone where avoidable

### Offline State

- Banner at the top of the main content area (not a modal)
- `role="alert"` element
- `bg-amber-500/[0.07] border-amber-500/25 text-amber-400` — amber is the offline/connectivity colour
- Dismissible with an X button
- Not yet implemented — future Phase

---

## 15. Focus and Keyboard Behaviour

| Rule | Implementation |
|------|---------------|
| All interactive elements show visible focus ring | `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background` |
| No `focus:ring-0` or `focus:outline-none` without replacement | Banned unless replaced by custom visible styling |
| Tab order matches visual order | Enforced by natural DOM order |
| Skip link | `<a href="#main-content">Skip to main content</a>` — `sr-only focus:not-sr-only` at top of every page |
| Modal/sheet focus trap | Focus must not leave the open modal/sheet |
| Close on Escape | All modals, sheets, dialogs |
| `aria-current="page"` | On every active nav link |
| `aria-label` | All icon-only buttons |
| Landmark roles | `<nav>`, `<main id="main-content">`, `<aside>` used correctly |
| Heading hierarchy | One `<h1>` per page; `<h2>` for sections; `<h3>` for cards; never skip |

---

## 16. Motion System

### Token Reference

Defined in `src/lib/motion.ts` (JS constants, mirrors CSS `--ml-*` tokens):

```ts
export const DURATION = {
  instant: 0.08,
  fast:    0.15,
  normal:  0.25,
  slow:    0.38,
  slower:  0.55,
}

export const EASING = {
  smooth: [0.22, 1, 0.36, 1],    // general transitions
  snap:   [0.19, 1, 0.22, 1],    // snappy / iOS-like
  out:    [0.0, 0.0, 0.2, 1],    // material deceleration
  in:     [0.4, 0.0, 1, 1],      // exit ease
}

export const SPRING = {
  layout: { type: 'spring', stiffness: 380, damping: 32 },
  bouncy: { type: 'spring', stiffness: 300, damping: 20 },
}

export const STAGGER = { children: 0.06, delayChildren: 0 }
```

### When to Use Motion vs CSS Transitions

| Interaction | Use |
|-------------|-----|
| Hover colour, border, background | CSS `transition-colors duration-150` |
| Hover shadow change | CSS `transition-shadow` |
| Focus ring appearance | CSS transition |
| Button press | Motion `whileTap` |
| Card hover lift | Motion `whileHover` (slight y + scale) |
| Nav active indicator | Motion `layoutId` spring |
| Page entrance | Motion (once per route change, not every scroll) |
| Panel / tab content change | Motion `AnimatePresence` crossfade |
| Modal / sheet open/close | Motion `AnimatePresence` with directional translate |
| List item enter/exit | Motion `AnimatePresence` with layout |
| Route transitions | Motion `PageTransition` wrapper (applied in pages where it aids orientation) |
| Continuous decorative loops | CSS keyframe animations — must pause under `prefers-reduced-motion` |

### Permitted Motion Patterns

| Pattern | Spec |
|---------|------|
| Fade up on enter | `opacity 0→1, y 12→0`, `DURATION.slow`, `EASING.smooth` |
| Stagger grid enter | `staggerChildren: 0.06`, each item fades up |
| Nav active spring | `layoutId` with `SPRING.layout` |
| Button press | `scale: 0.97`, `duration: 0.08`, `EASING.smooth` |
| Sheet slide in | `x: -300 → 0`, `DURATION.normal`, `EASING.smooth` |
| Tab crossfade | `opacity 0→1` on new content, `0.15s` |
| Progress bar fill | Width transition, `ease-out`, `DURATION.slow` |
| Card list add | `height: 0 → auto + opacity 0 → 1`, `layout` prop |
| Card list remove | `opacity 1 → 0 + height auto → 0`, `DURATION.fast` |

### Banned Motion

- Animating `width`, `height`, `top`, `left` (forces reflow) — use `layout` prop or `transform` instead
- Animations >500ms on state transitions
- More than 2 animated elements entering simultaneously without stagger
- Animation that blocks user interaction (`pointer-events: none` during animation is banned except for the entering element itself)
- Continuous animations on static content (no `orb-float` or `orbit-cw/ccw` on non-landing pages) — these must pause under `prefers-reduced-motion`

### Reduced Motion

Every Motion component must check `useReducedMotion()`:
- When true: disable transforms, use opacity-only or skip animation entirely
- CSS keyframe animations: paused via `@media (prefers-reduced-motion: reduce) { animation-duration: 0.01ms; animation-iteration-count: 1; }`

---

## 17. Appearance Modes

### Three Modes

| Mode | HTML class | Behaviour |
|------|-----------|-----------|
| Auto | (none) | `@media (prefers-color-scheme: dark)` controls |
| Dark | `.dark` | Forces dark regardless of OS |
| Light | `.light` | Forces light regardless of OS |

### Implementation

- `<html suppressHydrationWarning>` — no class set on server
- Inline `<script>` in `<head>` reads `localStorage.getItem('molis-theme')` and sets the class before React hydrates (prevents FOUC)
- `ThemeProvider` client component manages React state and exposes `useTheme()` hook
- `ThemeToggle` component in sidebar footer exposes Light / Auto / Dark controls
- Preference stored in `localStorage` under key `molis-theme`
- Valid values: `'light' | 'dark' | 'auto'`; default (missing): `'auto'`

### CSS Token Coverage

All semantic tokens have light and dark values. No component uses hardcoded `rgba(255,255,255,...)` or `rgba(0,0,0,...)` inside component files. Light and dark variants defined only in `globals.css` via token overrides.

---

## 18. Responsive Breakpoints

| Breakpoint | Tailwind prefix | Viewport |
|------------|----------------|---------|
| Mobile | (default) | 0–767px |
| Tablet | `md:` | 768–1023px |
| Desktop | `lg:` | 1024–1439px |
| Wide desktop | `xl:` | 1440px+ |

### Adaptive Navigation by Breakpoint

| Pattern | Breakpoints |
|---------|------------|
| Fixed `Sidebar` (212px) | `lg:` and above |
| `MobileTopBar` | below `lg:` |
| `MobileSheet` slide-over | below `lg:` (via hamburger in `MobileTopBar`) |
| `MobileNav` bottom tab bar | below `md:` |

### Layout Adjustments

- Mobile: `px-4 py-5`; single column; bottom nav adds `pb-16`
- Tablet: `px-6 py-6`; no bottom nav; slide-over for full navigation
- Desktop: `px-8 py-8`; two-column dashboard canvas; sidebar always visible

### Viewport Height

Use `min-h-dvh` (not `min-h-screen`) on full-page containers to handle iOS Safari address bar correctly.

---

## 19. Anti-Patterns MoLis Must Avoid

| Anti-pattern | Why banned |
|-------------|-----------|
| Hardcoded `rgba(255,255,255,...)` in component files | Breaks light mode |
| Hardcoded `rgba(0,0,0,...)` in component files | Can break dark mode |
| Generic purple/violet gradient borders | Generic AI aesthetic |
| `bg-gradient-to-r from-purple-500 to-blue-500` on surfaces | Not MoLis brand |
| Decorative `glow-pulse` on non-interactive UI elements | Violates motion directive |
| `orbit-cw`/`orbit-ccw` keyframes outside the landing page NeuralCore | Decorative only |
| `focus:ring-0` / `focus:outline-none` without replacement | Accessibility failure |
| `<p>` for section headings inside cards | Semantic failure |
| Multiple `<h1>` on a single page | Semantic failure |
| `h-4.5 w-4.5` classes | Invalid in Tailwind v4 |
| `variant="violet"` Button prop | Dead code — removed |
| `min-h-screen` on full-page containers | iOS viewport bug |
| Animations that block user input | Violates motion directive |
| Animations >500ms on UI state transitions | Feels sluggish |
| Mixing card border-radii (`rounded-lg` and `rounded-2xl`) at the same visual level | Inconsistency |
| Business-dashboard admin table layouts | Wrong product aesthetic |
| Generic SaaS template aesthetic | Not designed for students |

---

## 20. File Index

| File | Purpose |
|------|---------|
| `src/app/globals.css` | CSS tokens, keyframes, utility classes, reduced-motion rules |
| `src/lib/motion.ts` | JS motion constants for Motion for React |
| `src/lib/utils.ts` | `cn()` helper (clsx + tailwind-merge) |
| `src/components/theme/ThemeProvider.tsx` | Appearance mode context + provider |
| `src/components/theme/ThemeToggle.tsx` | Light/Auto/Dark toggle UI |
| `src/components/ui/Button.tsx` | Primary interactive element |
| `src/components/ui/Input.tsx` | Text/email/password inputs |
| `src/components/ui/EmptyState.tsx` | Empty state pattern |
| `src/components/ui/ErrorView.tsx` | Error state pattern |
| `src/components/ui/Skeleton.tsx` | Loading skeleton |
| `src/components/ui/PageHeader.tsx` | Consistent page heading pattern |
| `src/components/layout/DashboardShell.tsx` | Client wrapper for responsive dashboard layout |
| `src/components/layout/Sidebar.tsx` | Desktop navigation |
| `src/components/layout/MobileTopBar.tsx` | Mobile/tablet header bar |
| `src/components/layout/MobileNav.tsx` | Mobile bottom tab bar |
| `src/components/layout/MobileSheet.tsx` | Mobile/tablet slide-over navigation |
| `src/components/animations/*.tsx` | Reusable Motion wrappers |
| `design-system/molis/MASTER.md` | This document |
| `design-system/molis/pages/*.md` | Page-specific design overrides |
