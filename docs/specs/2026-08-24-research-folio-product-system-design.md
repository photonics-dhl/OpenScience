# OpenScience Research Folio Product System Design

> **CURRENT non-Landing product visual specification, approved by user direction on 2026-08-24.** This specification supersedes the instrument-black treatment for authenticated and public product surfaces. Landing remains unchanged. Functional requirements and data contracts continue to come from `docs/OpenScience_Kimi_Development_Spec.md`.

## 1. Problem and scope

The deployed `/_visual/research-workbench` route proved individual interaction contracts but did not improve the real product. Login, registration, Dashboard, RO creation, editing, review, publication and public reading still look and behave like separate products. Instrument black dominates long work sessions, oversized editorial titles displace the next useful action, small tracked metadata is overused, and Hermes can occupy the same pixels as forms, navigation or research text.

This change applies one coherent product system to every real non-Landing route:

- identity: `/auth/login`, `/auth/register`;
- orientation: `/dashboard`, `/settings`;
- creation: `/research-objects/new`;
- research workspace: overview, SDF editor, files, versions, collaboration, Hermes review, publish and sandbox;
- discovery and reading: `/explore`, collections and public RO/version pages;
- editorial and administration: curator and editorial administration surfaces.

Visual labs, ignored screenshot output and Landing are not product migration targets. No API, database, schema, permission or research-data contract changes are required.

## 2. Users and the questions each screen must answer

OpenScience serves researchers authoring a record, collaborators reviewing evidence, curators inspecting publication integrity and readers verifying a public result. They scan technical labels and identifiers, but they read claims, methods and evidence as prose. They often return to an unfinished task and need continuity more than novelty.

Every product screen answers these questions in this order:

1. Where am I: account, workspace, Research Object and version?
2. What is the current scientific or workflow state?
3. What needs my attention now?
4. What is the next safe action, and what will it change?
5. Where is the evidence or provenance supporting that action?
6. What can Hermes read, explain or propose without taking authorship away?

The primary vertical journey remains:

`identity → active research → create/import → structure → inspect evidence → human decision → version record → publish → public verification → collaboration`.

## 3. Visual thesis

**Name:** Research Folio — warm daylight paper, precise graphite notation and one vermilion decision mark.

Warm paper is the default canvas for thinking, reading, forms and navigation. White-warm folio sheets hold editable research content. Graphite is a narrow utility material for code, deterministic diffs and evidence inspection; it is never the full-page mood. Vermilion marks the one current decision or primary action, not every link and label.

The memorable brand element is not a decorative optical effect. It is the visible continuity from claim to evidence to human decision to immutable version, with Hermes living in the research margin as a truthful companion.

## 4. Color, depth and shape

The product uses the existing project tokens, with their roles corrected:

| Role | Token/value | Use |
|---|---|---|
| canvas | `--os-canvas-warm: #e7e1d6` | app background and page edge |
| folio | `--os-paper: #f1eee7` | navigation, forms and reading surfaces |
| active sheet | `--os-paper-strong: #fffaf2` | editable or decision-bearing center plane |
| primary ink | `--os-ink: #191a18` | headings and essential text |
| secondary ink | `--os-muted-paper: #5f625e` | secondary prose and metadata |
| graphite | `--os-graphite: #202522` | code, diff and dense evidence only |
| decision | `--os-vermilion-ink: #b83b22` | current step, primary action and focus marker |
| confirmed | darkened confirmed green | accepted evidence and completed states |

Adjacent surfaces differ by background step, not by stacked borders or floating cards. Hairline rules separate rows and document regions. Shadows appear only where physical elevation is real: menus, dialogs, drawers and a lifted editable sheet. Radius remains `{0, 4px, 8px, pill}`; pill is restricted to compact status display and never used as the default button or navigation shape.

There are no gradients, glow, glass blur, purple, generic AI card grids, independent cards for every menu item or decorative background effects on product routes.

## 5. Typography and reading contract

`Source Serif 4` and `Noto Serif SC` become a real globally loaded reading pair, not a route-local promise. `Bricolage Grotesque` remains the interface face. `IBM Plex Mono` is limited to IDs, version numbers, timestamps, measurements and compact machine state.

| Role | Size / line height | Typeface and use |
|---|---|---|
| app page title | `32–44px / 1.02–1.12` | reading serif; concise orientation, never a marketing hero |
| section title | `24–32px / 1.15–1.25` | reading serif or UI semibold by content |
| long research text | `18px / 1.68` Latin; `18px / 1.82` CJK | reading serif, `60–75ch` measure |
| product body | `16px / 1.6` | UI face for guidance and form help |
| controls | `14–16px / 1.35–1.5` | UI face, visible labels |
| metadata | `12–14px / 1.45` | mono only when the content is actually data |

Chinese labels never inherit Latin uppercase letter spacing. Essential action and status copy never falls below 12px. Headings balance and prose wraps prettily. Data columns use tabular figures. Long prose is not set in Bricolage; ordinary labels are not set in mono merely to look technical.

## 6. Shared product shell

Every non-Landing route uses one of three related shells built from the same tokens:

1. **Identity folio:** compact trust/context column plus a focused form sheet. The first field is visible without scrolling. Privacy, provenance and return-path information are secondary, readable notes rather than a fashion poster.
2. **Research desk:** Dashboard and creation pages use a restrained header, current-session strip, main task column and optional research margin. No hero. The first viewport exposes the current object or creation decision and its next action.
3. **Research workspace:** object context, workflow modes, document/evidence planes and a stable mobile plane switcher. The center plane is the active folio; side planes are quieter paper steps, with graphite used only inside code/diff modules.

Shell navigation remains semantic and deep-linkable. A route owns one `main`. Loading, empty, forbidden and error states keep the same shell so the user never loses location; errors appear beside the failed action and include retry or a safe exit.

## 7. Page-level information architecture

### 7.1 Login and registration

- Lead with account purpose and the form, not a giant editorial slogan.
- Show the current registration step (`details → email verification`) and preserve the return destination.
- Keep visible labels, password requirements before failure, inline field errors, a focusable error summary after failed submit and explicit pending/success feedback.
- On mobile, remove the decorative context plane entirely and keep the form within one comfortable reading column.

### 7.2 Dashboard

- First viewport order: active RO and open task → one primary continuation action → attention queue → start new research → research index.
- Replace the oversized “Research dashboard” treatment with a compact session header containing researcher/workspace identity and last activity.
- Hermes shares the attention margin. The character, one factual note and the actionable queue form one continuous region; it is not a separate black stage plus another task panel.
- Empty state leads directly to “Create a Research Object” and explains the two starts: blank structure or evidence import.

### 7.3 Create Research Object

- Present a visible two-step path: `1 Research identity` and `2 Evidence source`, with the current step and completion state.
- Workspace and title come first. Blank/import is an explicit choice before the material editor expands.
- Material rows read as a research manifest: filename and role first, processing state and provenance second, remove/retry local to the row.
- The primary button states exactly what happens next. Consent and immutable-artifact notes sit next to the submission boundary, not in a distant decorative column.

### 7.4 Editor and review

- The center folio is the dominant reading/editing surface. Outline is navigation; evidence panel is inspection. Their visual weight follows that priority.
- The top bar keeps object/version/save state together and groups commit controls without covering the title.
- Six SDF sections show readable prompts and fields; evidence diffs align before/after with source references and one decision bar.
- AI extraction never appears as a generic assistant card. It is a provenance-labelled proposal attached to the relevant SDF field.
- Approval states show what changes, scope, reversibility, cost and duration according to R0–R4.

### 7.5 Overview, files, versions, collaboration, publish and sandbox

- Overview is the task map: completeness, latest version, open reviews and publication readiness.
- Files use a manifest/table rhythm, not cards. Versions expose current draft, immutable releases and comparison actions.
- Collaboration keeps familiar Issue/PR/Review status patterns while using the warm shell and accessible state text.
- Publish is a quiet checklist with authorship, licenses, review and visibility before the R3 confirmation summary.
- Sandbox is the exception where graphite may occupy the code editor and output frame; surrounding navigation and explanations remain warm paper.

### 7.6 Explore, collections and public reading

- Explore starts with search and filters, not an oversized editorial hero. Results prioritize title, evidence coverage, version and author/provenance.
- Public reading retains serious publication typography but increases body readability, constrains measure and moves persistent identity/version actions into a non-sticky reading margin.
- Mobile public reading avoids microscopic metadata and oversized blank gaps. Section navigation becomes an accessible select or compact disclosure without covering content.
- Collections and editorial surfaces share the public reading typography but keep curation rationale and disclosure visible.

### 7.7 Settings and administration

- Settings uses ordinary labelled rows, grouped by identity, preferences and session. Destructive or irreversible actions remain visually separate.
- Curator/admin pages use aligned tables, filters and explicit status; no marketing-sized titles or decorative editorial compositions.

## 8. Hermes spatial and conversational contract

Hermes has two states with different geometry:

1. **Anchored:** the default. Hermes occupies a page-owned research-margin slot. Desktop reserves the exact `360px` actor stage plus vertical space for one short note; mobile reserves the exact `200px` actor stage in a compact in-flow companion strip. Anchored Hermes is never `position: fixed` and never overlaps navigation, fields, prose or primary actions.
2. **Detached:** only after a deliberate drag. Hermes may become viewport-clamped and fixed. Placement considers the complete actor, bubble, menu and protected content footprints. A return-to-margin action is always available.

Speech and guidance render inside the reserved companion region. If the region cannot fit a bubble safely, the message becomes an inline note above the actor or moves into the assistant drawer; it does not float over content. The context menu still opens beside Hermes through right-click, `Shift+F10`, Menu key and mobile long press, using Radix focus behavior and a single paper plane. Ordinary click opens the existing assistant drawer.

Hermes does not travel across active inputs or evidence rows to explain a field. Instead, the field gets a visible research mark, the companion turns toward it, and the note names the target with a “take me there” action. Dashboard may be lively; editing, approval and public reading remain quiet. Motion uses only transform/opacity, is interruptible, stays under 200ms for direct feedback and respects `prefers-reduced-motion`.

## 9. Responsive and accessibility contract

- Full primary workflows remain possible at 390px and 320px; no desktop-only functionality is removed.
- Touch targets are at least 44px in product mobile contexts with at least 8px between adjacent actions.
- Workspace planes become explicit mobile steps. The switcher never covers page content, respects the bottom safe area and keeps Hermes outside its footprint.
- Menus, dialogs and drawers use existing Radix primitives for focus, Escape, outside click and return focus. No custom keyboard recreation.
- Text contrast meets WCAG AA. Focus is visible and not obscured. Errors remain adjacent to their action and are linked to fields.
- Reduced-motion mode preserves all state meaning without travel, floating or looping animation.

## 10. Validation and release gate

Tests begin with failing contracts for the user-visible regressions:

- anchored Hermes and its note do not overlap protected text, form controls, navigation or mobile plane switchers;
- every primary product route uses the warm Research Folio shell, while Landing remains unchanged;
- product titles, body, reading text and controls meet the locale-aware type minimums;
- the first viewport exposes one real next action and the current workflow state;
- mobile routes have no horizontal overflow, clipped actions or fixed-content collisions;
- keyboard, context-menu, long-press, focus-return, inline-error and reduced-motion behavior remain intact.

The product release matrix expands to cover identity, Dashboard, creation, editor/review, overview, files, versions, collaboration, publish, sandbox, settings, explore, collection and public reading at desktop and mobile widths. Representative Chinese screens are included. Browser screenshots are reviewed at full size; automated geometry, contrast, focus, DOM, runtime-error and performance checks are required.

Production deployment uses the immutable deployment script with `--skip-migrate`. Acceptance evidence includes server build, current migration status, target container health, exact `/__release`, absent failure marker, rollback tree and public no-write browser gates. Authenticated smoke may use an existing safe test session but must not create, modify or publish real user research data.

## 11. Explicit exclusions

- No Landing redesign.
- No Hermes source art, dimensions, voice or TTS work.
- No API, database migration, seed, permission or data-model change.
- No replacement of Radix/shadcn interaction primitives with custom focus code.
- No generic command palette, card-grid dashboard, gradient, glass, glow, emoji icon or black full-page workbench.
