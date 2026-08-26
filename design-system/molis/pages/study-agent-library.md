# Page Override: Study Agent Library (`/dashboard/study`)

> Extends `MASTER.md`. Created: 2026-08-05

## Purpose

The Study page is the central hub where students upload documents and access all AI tools. It must feel like a capable, personal study assistant — not a file manager or admin table.

## Layout (Study List `/dashboard/study`)

```
┌─────────────────────────────────────────────┐
│ Page header: "Study" + description          │
│ [Upload document button — primary CTA]      │
├─────────────────────────────────────────────┤
│ Document grid / list                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │ Doc card │ │ Doc card │ │ Doc card │   │
│  └──────────┘ └──────────┘ └──────────┘   │
│                                             │
│ Empty state (if no docs)                   │
└─────────────────────────────────────────────┘
```

Grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` with `gap-4`.

## Study Set View (`/dashboard/study/[id]`)

```
┌────────────────────────────────────────────────┐
│ Back link + Document title                     │
│ Subject pill + metadata                        │
├────────────────┬───────────────────────────────┤
│ Left: Document │ Right: AI Tools panel         │
│ preview        │                               │
│ (PDF / DOCX)   │ Tab bar:                      │
│                │  Notes · Quiz · Flashcards    │
│                │  Tutor · Visuals · Weak topics│
│                │                               │
│                │ Panel content                 │
└────────────────┴───────────────────────────────┘
```

On mobile: stacked. Document preview collapses to an accordion (optional view). AI tools panel is the primary content.

## Document Cards

Each card represents a study document. Design intent: a premium study card, not a generic file card.

```
┌─────────────────────────────┐
│ [Icon: PDF/DOCX]  [Subject] │  ← header row
│                             │
│ Document Title              │  ← h3, font-semibold
│ Subject name · 3 AI tools   │  ← caption
│                             │
│ [Flashcards] [Quiz] [Notes] │  ← tool pills
│                ──────────── │
│ [Open →]                    │  ← footer CTA
└─────────────────────────────┘
```

- Card: `rounded-2xl border border-border bg-card p-5 transition-all hover:border-primary/20`
- Icon container: `h-10 w-10 rounded-xl border border-border bg-muted/50`
- Title: `text-[15px] font-semibold text-foreground/80 leading-snug mt-3`
- Subject pill: `rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-[11px] font-medium`

## Tool Tabs

Tab bar for the AI tools panel in `StudySetView`. Design:
- Horizontal scrollable tab bar (mobile) / visible tabs (desktop)
- Active tab: `text-foreground border-b-2 border-primary pb-2`
- Inactive tab: `text-foreground/40 hover:text-foreground/70`
- Tab height: 40px minimum (touch target)
- Do not use a segmented control — a simple underline tab bar is clearer for 6 items

## Upload Flow

- Primary CTA: `<Button variant="primary">Upload document</Button>` at the top of the study list
- Upload form in a modal / sheet (not a separate page)
- Modal: `max-w-lg`, title "Upload a document", close button top-right, `aria-modal="true"`
- File drop zone: dashed border, `rounded-2xl`, accepts PDF and DOCX
- Error state: inline below drop zone with file type / size guidance
- Success: close modal, add card to grid with fade-in

## Loading States

Document list loading: `StudyUploadForm.tsx` skeleton overlay:
- Show 3 skeleton document cards during initial load
- Each skeleton: `h-[200px] rounded-2xl shimmer`

AI tool panel loading: each tab shows a tool-appropriate skeleton:
- Flashcards: 3 × card placeholders
- Quiz: question placeholder + 4 option skeletons
- Notes: prose skeleton (4–5 lines)
- Tutor: chat bubble skeletons

## Empty States

**No documents yet**:
```
Icon: Book + upload icon
Title: "Upload your first document"
Sub: "Add a lecture note, past paper, or textbook chapter — MoLis will help you master it."
CTA: [Upload document] — primary button
```

**No results for search** (future):
```
Icon: MagnifyingGlass
Title: "No documents match"
Sub: "Try a different search term."
```

## Error State

If document fetch fails:
- `ErrorView` component, centred
- "Something went wrong loading your documents"
- [Try again] ghost button that calls `router.refresh()`

## Offline State

Show a banner at the top (not modal):
```
<div role="alert" className="rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3 text-sm text-amber-400">
  You appear to be offline. Some features may not be available.
</div>
```

## Accessibility

- Document cards: `<article>` element with descriptive `aria-label="[Document Title], [N] AI tools available"`
- The AI tools tab bar: `role="tablist"`, each tab `role="tab" aria-selected aria-controls`
- Tool panels: `role="tabpanel" aria-labelledby`
- Upload drop zone: keyboard-accessible via `<input type="file">` with visible label
- PDF/DOCX viewer: provide a text-based fallback tab for screen reader users
