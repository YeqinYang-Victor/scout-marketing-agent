# Workbench Design Notes (v2)

**English** ｜ [中文](工作台设计说明.md)

> A redesign of the "daily briefing" workbench for **brokerage relationship managers**.
> Interactive prototype: [`工作台设计稿.html`](./工作台设计稿.html) — open it directly in a browser;
> the top-left corner toggles between empty / generating / result states and desktop / mobile.

---

## 1. User and Context

**User**: a relationship manager (RM) in a brokerage's retail division. Typical profile:

- Commutes or arrives at the office between 07:30 and 09:00, and needs to find
  "something I can send a client today" fast;
- Primary channel is **WeCom (Enterprise WeChat)** — mostly text, occasionally an image;
- **Time is extremely fragmented**; they will not spend 10 minutes learning a system;
- Uses a phone more often than a desktop;
- Faces a hard **compliance line**: no buy/sell recommendations.

**Core job to be done**:
> "Give me one thing I can send a client today, as fast as possible — and don't let me trip over compliance."

---

## 2. Six Core Design Decisions

### 1. From "system console" to "workbench"

The old version treated **pipeline internals** as the main content: the 9-step execution flow, the
five-dimension score breakdown and the candidate ranking all occupied the first screen. Those are
**things engineers care about** — an RM does not care about "normalize and dedupe" or "weight 0.38".

**Fix**: results first, mechanics later.

- 9-step flow → collapsed into "Generation details", closed by default;
- Five-dimension scores → collapsed into "Why this one?", closed by default;
- While generating, show only **4 phases a user understands** (Fetching news / Ranking stories /
  Writing copy / Rendering image).

### 2. A single primary action

The old top-right corner squeezed four control groups together (data source + template + LLM polish +
generate), so the primary action did not stand out.

**Fix**:

- Exactly one **solid red primary button** on the page — centered and enlarged in the empty state,
  becoming "Copy copy, send to client" in the result state;
- Data source / template / AI polish are demoted to a **pill-shaped "Generation settings"** below the
  primary button, visually quiet;
- The header's "Generation settings" is a ghost outline button that does not compete for attention.

### 3. The copy *is* the product, so make it WYSIWYG

What the RM actually delivers is **that block of text**. The old version put it in a `<pre>` with a
tiny copy button.

**Fix**:

- Render the copy as a **chat bubble**, labelled "This is exactly what the client will receive" — so
  the RM immediately knows what the client sees;
- The primary action becomes "Copy copy, send to client", plus the hint
  "Paste straight into the client group after copying";
- Surface delivery metadata: **character count / channel / template**.

### 4. Merge "event" and "copy" into one card

The RM's mental model is "today's briefing = one story + one paragraph", not two separate modules.

**Fix**: one card, top to bottom:
`Today's top event (headline / sectors / key metrics) → Client copy (bubble + copy button)`.
The reading path becomes natural: **why send this → what to send**.

### 5. Compliance status must be *visible*

In a brokerage context the RM's biggest hidden anxiety is "could this paragraph get me in trouble".

**Fix**:

- A status bar at the top of the result state whose first element is a green "✓ Compliance check passed";
- A fixed green note at the bottom of the sidebar: "This copy contains no timing or position-sizing
  advice; risk warnings and a disclaimer are attached automatically."
- This turns compliance from a *hidden risk* into a *visible assurance*.

### 6. Mobile first

RMs are on phones a great deal. The prototype includes a mobile form:

- Left navigation → **bottom tab bar**;
- Primary action → **sticky full-width button** within thumb reach;
- Header title takes its own line and action buttons collapse to **icons only**, avoiding wrap;
- Multi-column layouts → single-column stacks.

---

## 3. Information Architecture

```
Today's Workbench
├── Header      Today's Workbench · date ｜ History · Generation settings · avatar
├── Empty state
│   ├── Welcome card   greeting + the single primary button "Generate today's briefing"
│   ├── Generation settings  data source / template / AI polish (quiet pills)
│   └── Recent runs     last 3, clickable to reuse
├── Generating
│   ├── Progress bar + elapsed time
│   ├── 4 phase cards (done / running / pending)
│   └── Skeleton screen (previews the result shape, reducing wait anxiety)
└── Result state
    ├── Status bar   compliance ✓ · generated at · template · char count · regenerate
    ├── Main column
    │   ├── Today's briefing card
    │   │   ├── Today's top event (headline / sectors / strongest sector / score / stock count)
    │   │   ├── Client copy (WeCom bubble + primary copy button)
    │   │   └── Action bar (Copy copy · Download banner)
    │   ├── ▸ Industry-chain transmission & beneficiaries   (collapsible, open by default)
    │   ├── ▸ Why this one? Five-dimension rationale        (collapsible, closed by default)
    │   └── ▸ Generation details                            (collapsible, closed by default)
    └── Side column
        ├── Matching app-homepage image (thumbnail + download PNG)
        ├── What's next (Export HTML / Switch to flash version / View history)
        └── Compliance note
```

**Collapse strategy**: anything directly related to "what gets sent out" (industry chain,
beneficiaries) is open by default; purely mechanical content (score rationale, 9-step flow) is closed
by default — available when needed, but not occupying the first screen.

---

## 4. Visual Specification

### Palette

| Purpose | Value | Notes |
|---------|-------|-------|
| Brand primary | `#C7000B` | Brand red. **Used only for**: brand mark, primary button, key figures, gains |
| Brand dark | `#8E0007` / `#A20009` | Button gradient, banner base |
| Primary text | `#14224A` | Deep navy instead of pure black — better financial tone |
| Secondary text | `#4A5578` | |
| Tertiary text | `#8A93AD` / `#B4BBCB` | Captions, placeholders |
| Page background | `#F4F6FA` | |
| Card | `#FFFFFF` | Border `#E9ECF3` |
| Gain | `#C7000B` | **Chinese market convention: red = up, green = down** |
| Loss | `#0F9D58` | |
| Accent | `#E8A33D` | Progress bar, upstream-stage chips |

**Restrained use of red** is the key move in this redesign: the old version used red for every
progress bar, icon and border, which made the page noisy and the emphasis unclear. The new version
reserves red for "brand + primary action + key figures + gains".

### Type scale

| Level | Size / line-height | Use |
|-------|--------------------|-----|
| Page title | 17 / 1.3 | Header |
| Event headline | 19.5 / 1.5 · 700 | Top event |
| Card title | 13.5 / 1.4 · 700 | Cards |
| **Body (copy)** | **13.5 / 1.95** | Copy inside the bubble — generous line-height for long reading |
| Caption | 11–12 / 1.6 | Metric labels, descriptions |

Chinese font stack: `PingFang SC, Hiragino Sans GB, Microsoft YaHei, system-ui`

### Radii / shadows / spacing

- Radii: cards 16 px, controls 9–11 px, pills 999 px
- Shadows: `0 1px 2px rgba(20,34,74,.05)` (static cards);
  `0 2px 6px -2px …, 0 12px 28px -14px …` (raised cards)
- Primary button shadow: `0 6px 18px -8px rgba(199,0,11,.55)`, lifting 1 px on hover
- Spacing rhythm: 8 / 12 / 15 / 18 / 24 / 40

---

## 5. Responsive Rules

| Breakpoint | Layout change |
|------------|---------------|
| ≥ 1100 px | 228 px left nav + main area; result state is two columns (main + 336 px side) |
| < 1100 px | Side column drops below the main column; single-column stack |
| Mobile | Left nav → bottom tab bar; primary action sticks to the bottom; header title on its own line with icon buttons; phase cards 2×2 |

---

## 6. Before / After

| Dimension | Before | After |
|-----------|--------|-------|
| First-screen content | 9-step flow + five-dimension scores | Today's top event + forwardable client copy |
| Primary action | Top-right, alongside 3 control groups | One red primary button; centered when empty, "Copy copy" when done |
| Configuration | Header Selects + Switches, permanently occupying space | Demoted to a "Generation settings" pill or tucked into a drawer |
| Copy presentation | `<pre>` plain text block | WeCom bubble preview + delivery metadata (chars / channel / template) |
| Copy action | Small button in the card header | Primary-button level, with a "paste straight into the client group" hint |
| Compliance | Disclaimer only at the end of the copy | Top "✓ Compliance check passed" + sidebar compliance note |
| History | None | Empty-state "Recent runs" + header "History" |
| Mobile | Unsupported | Bottom tab bar + sticky primary button + iconified header |

---

## 7. Applying It to the Existing Code

The stack is React 18 + TDesign + Tailwind, and the redesign keeps it unchanged:

| Design module | Implementation |
|---------------|----------------|
| Design tokens | Add the brand palette (`brand` / `ink` / `line` / `up` / `down`) to `theme.extend.colors` in `tailwind.config.js`, replacing scattered `#C7000B` literals |
| Status bar / badge / pill | Extract `Badge`, `Chip`, `StatBar` atoms |
| Three-state switching | Drive `ScoutDashboard` with `view: 'idle' \| 'running' \| 'done'`, replacing the persistent "flow left + result right" two-column layout |
| Collapsible sections | Native `<details>` or TDesign `Collapse`, with defaults per the collapse strategy above |
| Bubble preview | A `CopyBubble` component that still renders `report.text` (`white-space: pre-wrap`) |
| History | Reuse the existing `GET /api/scout/runs` (list) and `GET /api/scout/runs/:id` (detail) — no backend change |
| Phase progress | Map the existing 9 SSE `step.key` values onto 4 display phases in the UI layer |

> **No backend changes required.** This redesign is purely about information hierarchy, visuals and
> interaction; the data contract stays as it was.

---

## 8. Implementation Status

The design has been implemented. Actual changes:

| Design module | Location | Notes |
|---------------|----------|-------|
| Design tokens | `tailwind.config.js` | Added the `brand` / `ink` / `hairline` / `up` / `down` palette |
| Atoms | `src/components/scout/atoms.tsx` | `Chip` / `Card` / `CardHead` / `PrimaryButton` / `GhostButton` / `SmallButton` / `ScoreRing` / `Metric` / `Fold` / `IconBubble` |
| Three-state workbench | `src/pages/ScoutDashboard.tsx` | Driven by `view: 'idle' \| 'running' \| 'done'`; the 9 steps collapse into 4 display phases |
| Copy bubble | `CopyBubble` in `ScoutDashboard.tsx` | Rendered line by line and colored by emoji prefix; **copying still uses the raw `report.text`**, so preview styling never affects the copied result |
| History | `src/components/scout/HistoryDrawer.tsx` | Right-hand drawer; clicking any entry reloads it into the workbench |
| Generation settings | `SettingsPanel` in `ScoutDashboard.tsx` | Header dropdown and empty-state pill share one panel |
| Mobile | `src/App.tsx` | Desktop left nav → mobile bottom tab bar; the workbench's primary action sticks to the bottom |
| Single-file export | `server/pipeline/export-html.ts` + `GET /api/scout/export/:id` | The HTML template was extracted from `export-report.ts` so the CLI and API share one implementation |

### One design added during implementation

**The compliance check performs a real scan rather than hard-coding "passed".**
`complianceCheck()` in `ScoutDashboard.tsx` scans the copy for terms such as "swing opportunity",
"buy the dip", "position size", "take profit", "stop loss", "recommend buying", "guaranteed rise",
"risk-free", "capital protected" and "target price". On a hit, both the top status bar and the
sidebar turn into a **red alert** listing the offending terms. So if someone adds advisory language
to a template, the UI surfaces it immediately instead of continuing to show a green "passed".

### Second pass: site-wide visual unification + banner word-break fix (done)

**① Visual unification** — the other four pages now use the same tokens and atoms:

| Page | Change |
|------|--------|
| `src/pages/SourcesPage.tsx` | Rewritten: `PageHeader` + `SectionCard` skeleton, card list + right-hand form |
| `src/pages/RulesPage.tsx` | Rewritten: weight sliders, hard filters, keywords and sector allow/deny lists all share one card language |
| `src/pages/TemplatesPage.tsx` | Rewritten: template list + body/field editor share one card language |
| `src/components/Header.tsx` / `Sidebar.tsx` | Chat-area header and sidebar moved to the same palette and radii |
| `src/index.css` | **Changed the TDesign theme from default blue to brand red** (the whole `--td-brand-color` variable set) — the single biggest lever for visual consistency; neutral palette and radii aligned at the same time |
| `src/hooks/useAgents.ts` | Default agent avatar color changed from scaffold blue `#0052d9` to brand red |
| `src/components/scout/atoms.tsx` | Added `PageHeader` / `SectionCard` / `Field` page-level skeletons; every button gained `border-0` (with Tailwind preflight disabled, browsers expose their default button border) |

**② Banner word-break fix** — `server/pipeline/banner.ts`:

- The original wrapping function cut by **character count**, slicing ASCII runs in half:
  `…对外授权总额超1200亿美元` was split at character 22 into "超12" + "00亿美元".
- It now estimates **display width** (CJK/full-width = 1 unit, ASCII ≈ 0.55) and **never breaks inside
  an ASCII run**; title line-height plus overflow protection for chips and chain cards were added too.

### Not covered

- Banner headlines still wrap by estimated width, so extremely long titles (>60 characters) fall back
  to "…" truncation — an acceptable degradation.
