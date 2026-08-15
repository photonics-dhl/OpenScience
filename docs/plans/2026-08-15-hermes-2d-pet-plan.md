# Hermes 2.5D Pet Implementation Plan

**Goal:** Replace the rejected procedural 3D experiment with an original, high-quality transparent 2.5D Hermes pet prototype inside the existing visual adapter.

**Architecture:** Three consistent transparent PNG frames feed a small `HermesPetPortrait` presentation component. `HermesVisualAdapter` retains state, link and pointer ownership; CSS owns compositor-only motion. A dependency-free Node inspector and Vitest contracts guard the assets and SSR structure.

**Tech Stack:** OpenAI image generation, React 18, Next.js 14, CSS transforms/opacity, Node PNG inspection, Vitest, Playwright.

## Constraints

- No reuse of rejected Blender geometry or third-party mascot assets.
- No Canvas, WebGL, Cubism, Live2D binary or new runtime dependency.
- Preserve six Hermes states, task deep links, approval stillness and reduced-motion fallback.
- Prototype only; no deployment before user visual approval.

### Task 1: Original transparent asset set

**Files:**
- Create: `apps/web/public/hermes/pet/hermes-pet-idle.png`
- Create: `apps/web/public/hermes/pet/hermes-pet-blink.png`
- Create: `apps/web/public/hermes/pet/hermes-pet-working.png`
- Create: `apps/web/public/hermes/pet/README.md`
- Create: `apps/web/scripts/hermes/inspect-pet-assets.mjs`
- Create: `apps/web/test/hermes-pet-asset-contract.test.ts`

- [x] Write the missing-asset RED contract.
- [x] Generate one canonical transparent idle master from the approved constellation-dragon reference.
- [x] Edit that master into consistent blink and working frames.
- [x] Implement the dependency-free inspector and satisfy dimension, alpha and byte budgets.
- [x] Inspect all three frames at native size and 160px presentation size.

### Task 2: Layered portrait and state contract

**Files:**
- Create: `apps/web/components/hermes/HermesPetPortrait.tsx`
- Modify: `apps/web/components/hermes/HermesVisualAdapter.tsx`
- Modify: `apps/web/test/hermes-state.test.tsx`

- [x] Write SSR RED assertions for the pet renderer, three frames, six nodes and static fallback.
- [x] Implement the minimum presentation component and state mapping.
- [x] Preserve the single task link, one Hermes instance and all six visual states.
- [x] Keep pointer ownership in the adapter and expose bounded lean variables.

### Task 3: Motion, browser evidence and docs

**Files:**
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/test/e2e/hermes-dashboard.spec.ts`
- Modify: `docs/progress.md`
- Modify: `project_index.md`
- Create: `docs/handoff/2026-08-16-hermes-2d-pet-handoff.md`

- [x] Add idle breathing, float, blink and state-specific node motion with compositor-only properties.
- [x] Add reduced-motion and approval stillness gates.
- [x] Run focused tests, typecheck, production browser desktop/mobile/reduced/pointer checks and visual screenshots.
- [x] Run docs lint, docs sync and diff check.
- [x] Record an honest user-visual pending conclusion; do not deploy or merge before approval.
