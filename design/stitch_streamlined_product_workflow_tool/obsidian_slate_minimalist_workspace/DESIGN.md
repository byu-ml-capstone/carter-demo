---
name: Obsidian Slate Minimalist Workspace
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#45474c'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#75777d'
  outline-variant: '#c5c6cd'
  surface-tint: '#545f73'
  primary: '#091426'
  on-primary: '#ffffff'
  primary-container: '#1e293b'
  on-primary-container: '#8590a6'
  inverse-primary: '#bcc7de'
  secondary: '#4b41e1'
  on-secondary: '#ffffff'
  secondary-container: '#645efb'
  on-secondary-container: '#fffbff'
  tertiary: '#051426'
  on-tertiary: '#ffffff'
  tertiary-container: '#1b293b'
  on-tertiary-container: '#8290a6'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d8e3fb'
  primary-fixed-dim: '#bcc7de'
  on-primary-fixed: '#111c2d'
  on-primary-fixed-variant: '#3c475a'
  secondary-fixed: '#e2dfff'
  secondary-fixed-dim: '#c3c0ff'
  on-secondary-fixed: '#0f0069'
  on-secondary-fixed-variant: '#3323cc'
  tertiary-fixed: '#d5e3fc'
  tertiary-fixed-dim: '#b9c7df'
  on-tertiary-fixed: '#0d1c2e'
  on-tertiary-fixed-variant: '#3a485b'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 2.25rem
    fontWeight: '600'
    lineHeight: 2.75rem
    letterSpacing: -0.025em
  display-lg-mobile:
    fontFamily: Inter
    fontSize: 1.75rem
    fontWeight: '600'
    lineHeight: 2.25rem
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 1.5rem
    fontWeight: '600'
    lineHeight: 2rem
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 1.25rem
    fontWeight: '600'
    lineHeight: 1.75rem
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Inter
    fontSize: 1.125rem
    fontWeight: '500'
    lineHeight: 1.5rem
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 1rem
    fontWeight: '400'
    lineHeight: 1.625rem
    letterSpacing: -0.005em
  body-md:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: '400'
    lineHeight: 1.375rem
    letterSpacing: '0'
  body-sm:
    fontFamily: Inter
    fontSize: 0.8125rem
    fontWeight: '400'
    lineHeight: 1.25rem
    letterSpacing: '0'
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 0.8125rem
    fontWeight: '500'
    lineHeight: 1.125rem
    letterSpacing: -0.01em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 0.6875rem
    fontWeight: '500'
    lineHeight: 0.9375rem
    letterSpacing: 0.02em
  caption:
    fontFamily: Inter
    fontSize: 0.75rem
    fontWeight: '500'
    lineHeight: 1rem
    letterSpacing: 0.01em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 0.75rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system embodies understated utility, cognitive clarity, and architectural precision for data science capstone tracking and complex project delivery. Conceived for rigorous academic engineering, the interface recedes entirely to let analytical artifacts, milestones, and workflow boards command attention.

The emotional baseline is tranquil focus: deliberate, quiet, and mathematically composed. It balances the utilitarian rigor of scientific workstations with the tactile refinement of modern editorial systems. Heavy visual embellishment, decorative gradients, and unmotivated color are eliminated in favor of pristine hierarchy, structured negative space, and micro-deliberate interactions.

The design movement combines **Minimalism** with subtle **Structural Modernism**: razor-sharp typographic pacing, whisper-thin container borders, deep obsidian charcoal typography against airy chalk-slate canvases, and hyper-selective accentuation through muted sage and deep indigo for active state tracking.

## Colors

The palette operates under a high-restraint doctrine, treating color as a communicative signal rather than decoration.

- **Primary Canvas & Surfaces**: Crisp white (`#ffffff`) serves as the base for modular cards and panels, resting atop a cool, tinted backdrop canvas (`#f8fafc`).
- **Primary Ink / Obsidian**: `#0f172a` and `#1e293b` provide deep, unyielding contrast for headers, active text, and structural anchors, avoiding harsh pure black.
- **Muted Accents**:
  - **Indigo Focus (`#4f46e5`)**: Reserved strictly for high-salience primary actions, focused inputs, active sprint indicators, and critical computational state changes.
  - **Muted Sage (`#3b7a57` / `#10b981` tint)**: Applied conservatively to pass states, validated model runs, and milestone completions.
- **Borders & Dividers**: High-precision boundary lines rendered with slate-tinted opacity (`#e2e8f0` to `#cbd5e1`), ensuring modularity without visual weight.
- **Subdued Text / Tertiaries**: Cool slate grays (`#475569` for body secondary; `#94a3b8` for tertiary metadata, table headers, and caption stamps).

## Typography

The typographic hierarchy prioritizes systematic structure, high legibility at micro scales, and analytical exactness.

- **Primary Typeface (Inter)**: Handles all general UI hierarchies, headers, descriptive text, and user-generated milestone content. Tight tracking at headline scales provides a contemporary editorial rhythm, while neutral metrics guarantee effortless scanning in dense task lists.
- **Monospace Accent (JetBrains Mono)**: Integrated for metric counters, data model tags, commit hashes, stage statuses, and tabular figures. This establishes an explicit mental shift between qualitative project text and technical capstone data.
- **Hierarchical Discipline**: Body text stays strictly at `0.875rem` (`body-md`) for standard productivity density. Line heights maintain ample breathing room (`1.5` to `1.625`) to avoid visual fatigue during sustained data review.

## Layout & Spacing

The layout model is anchored by a structured desktop-first fluid grid with a strict 4px/8px incremental spatial rhythm.

- **Workspace Grid**: A responsive 12-column dynamic framework with a maximum canvas width of 1600px for multi-column workflow views. Kanban columns operate on a multi-track horizontal snap scroll with consistent column gaps of `1.5rem` (`gutter`).
- **Responsive Adaptations**:
  - **Desktop (≥1280px)**: Multi-column Kanban boards (4–5 visible tracks), persistent 260px left telemetry navigation, 32px canvas margins.
  - **Tablet (768px - 1279px)**: Collapsible iconized sidebar, horizontal peek for boards (2–3 tracks in frame), 24px margins.
  - **Mobile (<768px)**: Stacked single-column card feeds with segmented control view switches, edge margins compressed to `1rem` (`margin-mobile`), and full-width card presentations.
- **Rhythm Rules**: Element stacks follow compact internal spacing (`space-xs` and `space-sm`) to bind related meta-data, while semantic section groupings use generous bounds (`space-lg` to `space-xl`) to establish distinct visual separation without requiring heavy rule dividers.

## Elevation & Depth

Depth is established primarily through **ambient diffusion and delicate low-contrast outlines** rather than aggressive drop shadows.

- **Surface Levels**:
  - **Level 0 (Canvas)**: `#f8fafc` — the foundation upon which boards and views rest.
  - **Level 1 (Card / Column Track)**: `#ffffff` for cards, `#f1f5f9` at 50% opacity for column containers. Outlined with `1px solid #e2e8f0`.
  - **Level 2 (Hover / Active Drag)**: Floats with an ambient shadow: `0 10px 25px -5px rgba(15, 23, 42, 0.04), 0 8px 10px -6px rgba(15, 23, 42, 0.02)`, paired with an intensified border (`#cbd5e1`).
  - **Level 3 (Modals / Overlays / Flyout Drawers)**: `#ffffff` elevated by `0 20px 30px -10px rgba(15, 23, 42, 0.08), 0 1px 3px rgba(15, 23, 42, 0.04)` over a translucent backdrop blur (`rgba(15, 23, 42, 0.25)` with `backdrop-filter: blur(4px)`).
- **Edge Definition**: Shadows are never detached from crisp structural boundaries; every elevated item retains a precise 1px hairline perimeter to preserve clean geometry.

## Shapes

The interface embraces a **Soft (Level 1)** geometric standard. This micro-radiused geometry conveys architectural stability and analytical rigor, avoiding the overly playful feel of pill-heavy shapes.

- **Standard Elements (0.25rem / 4px)**: Input fields, interactive chips, status pills, and micro badges.
- **Container Elements (0.5rem / 8px - `rounded-lg`)**: Kanban item cards, metrics tiles, milestone checklist rows, and dropdown menus.
- **Panels & Boards (0.75rem / 12px - `rounded-xl`)**: Board columns, modal viewports, flyout telemetry sheets, and primary workspace containers.
- **Iconography & Bullets**: Geometric, sharp cornering with 1.5px stroke weights matching the hairline borders.

## Components

### Buttons
- **Primary**: Deep obsidian background (`#0f172a`), crisp white text, 4px border radius, 8px 16px padding. On hover: shifts subtly to `#1e293b` with a hairline slate border.
- **Secondary**: Crisp white background, 1px border (`#e2e8f0`), `#1e293b` text. On hover: background shifts to `#f8fafc`, border tint deepens to `#cbd5e1`.
- **Ghost / Tertiary**: No border or background; slate text (`#475569`). On hover: faint slate wash (`#f1f5f9`).
- **Accent (Special Action)**: Indigo fill (`#4f46e5`) used solely for critical capstone actions (e.g., "Run Pipeline", "Finalize Milestone").

### Cards & Kanban Tiles
- Compact white rectangular surfaces (`rounded-lg`) wrapped in a 1px border (`#e2e8f0`).
- Padding: strictly `space-md` (16px).
- Structure:
  - **Top Row**: Milestone badge / Project phase tag in `label-sm` font, followed by an issue/task identifier (`#CAP-482`).
  - **Middle Row**: Task title in `headline-sm` / `body-md` semibold, limited to two lines with clean ellipsis.
  - **Bottom Row**: Horizontal flex row containing owner avatar (circle, 20px), model status indicator, and deadline label in `caption` style.

### Chips & Status Badges
- Heights: 20px to 24px. Monospace text rendered in `label-sm`.
- **Sage Neutral (Completed / Validated)**: `#ecfdf5` background, `#065f46` text, hairline `#a7f3d0` border.
- **Slate In-Progress**: `#f1f5f9` background, `#334155` text, hairline `#cbd5e1` border.
- **Indigo Milestone Marker**: `#eef2ff` background, `#3730a3` text, hairline `#c7d2fe` border.

### Input Fields & Controls
- **Inputs**: Flat white background, 1px `#e2e8f0` border, 36px total height, horizontal padding of 12px. On focus: border shifts cleanly to `#4f46e5` with no heavy outer glow (optional 1px ring).
- **Checkboxes & Radios**: 16px square/circle with crisp 1.5px border (`#cbd5e1`). Checked state: solid obsidian (`#0f172a`) fill with white checkmark.

### Milestone Tracking Timelines
- Horizontal step sequence connected by ultra-fine 1px lines (`#e2e8f0`).
- Completed nodes: 8px solid obsidian dots. Active node: 8px indigo dot with an ambient 4px ring. Pending nodes: hollow circles with hairline border.
- Milestone descriptors sit directly beneath nodes in `label-sm` format for unambiguous progression audits.