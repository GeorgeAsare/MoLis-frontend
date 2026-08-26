# Page Override: Application Shell & Navigation

> Extends `MASTER.md`. Rules here take precedence for shell and nav work.
> Created: 2026-08-05

## Responsive Nav Architecture

### Desktop (≥1024px)
- Fixed left sidebar, `w-[212px]`, `h-screen`, `flex-col`
- Logo at top, nav items in middle (flex-1), utility items at bottom
- `bg-card/60 border-r border-border`

### Tablet (768–1023px)
- Sidebar hidden by default
- Hamburger button in a top bar reveals sidebar as a slide-over
- Overlay scrim: `bg-black/40 backdrop-blur-sm`
- Slide-over uses `transform translate-x` transition, `--ml-dur-normal` `--ml-ease-smooth`
- Sidebar slides in from left, sits above main content (z-40)

### Mobile (<768px)
- Bottom tab bar, fixed, `h-16`, `safe-area-inset-bottom`
- Max 5 items: Home · Subjects · Study · Agents · Memory
- Each tab: icon (24px) + label (11px), stacked vertically
- Touch target: full tab width × 64px height
- Active: `text-primary` icon + label, inactive: `text-foreground/40`
- Background: `bg-card/95 backdrop-blur-xl border-t border-border`
- Secondary items (Setup, Sign out, Appearance) accessible via a "More" sheet triggered from a Profile/avatar icon — or from the hamburger slide-over
- No hamburger on mobile — it conflicts with bottom nav

## Sidebar Component Fixes

### Fix 1 — layoutId conflict
The `layoutId="nav-active-bg"` string is shared between the main nav list and the bottom utility section. This causes Framer Motion to animate incorrectly when the active item is in the bottom section.

**Solution**: Use distinct layoutId values:
- Main nav: `layoutId="nav-active-bg-main"` and `layoutId="nav-active-dot-main"`
- Bottom section: `layoutId="nav-active-bg-bottom"` and `layoutId="nav-active-dot-bottom"`

### Fix 2 — Appearance toggle
Add a three-way appearance toggle below the Sign out button:
- Three small icon buttons in a pill: Sun / Circle / Moon
- Store in localStorage key `molis-appearance` → `'light' | 'dark' | 'auto'`
- Apply class to `<html>` element on mount and on change
- Inject inline `<script>` in `layout.tsx` before hydration to prevent FOUC

## Logo Treatment (sidebar)

Current orb with `animate-glow-pulse` (decorative infinite pulse) — **disable the pulse animation** per motion directive. The orb can still have its gradient/glow styling; only the repeating pulse animation is removed. The `glow-ambient-red` below-fold blobs on the dashboard should remain but move to a single, non-animated radial gradient on the sidebar orb.

Logo area: `h-7 w-7` orb + wordmark. No changes to the visual design; only remove `animate-glow-pulse`.

## Skip Link

Insert before the `<Sidebar />` in `DashboardLayout`:

```tsx
<a
  href="#main-content"
  className="sr-only focus:not-sr-only focus:absolute focus:z-[1000] focus:m-3 focus:rounded-xl focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg focus:ring-2 focus:ring-ring"
>
  Skip to main content
</a>
```

Add `id="main-content"` to the `<main>` element.

## Motion Spec

| Event | Duration | Easing |
|-------|----------|--------|
| Active indicator glide (desktop) | spring stiffness 380 damping 32 | Framer spring |
| Sidebar slide-over open | `--ml-dur-normal` (250ms) | `--ml-ease-smooth` |
| Sidebar slide-over close | 180ms | `--ml-ease-in` |
| Scrim fade | 200ms | ease |
| Bottom bar mount | no animation (persistent) | — |
| Tab press | `scale: 0.94` on tap | 80ms spring |

## Accessibility

- All nav links: `aria-current="page"` when active
- Sidebar slide-over: `role="dialog" aria-modal="true" aria-label="Navigation"`
- Hamburger button: `aria-label="Open navigation" aria-expanded={open}`
- Bottom tabs: `role="tablist"` with each item `role="tab" aria-selected={active}`
- Focus trapped in slide-over when open; returned to hamburger on close
- Keyboard: Escape closes slide-over
