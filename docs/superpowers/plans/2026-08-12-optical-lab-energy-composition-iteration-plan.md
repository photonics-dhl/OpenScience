# Optical Lab Energy Composition Iteration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the isolated Optical Lab resting field around one lens-shaped focal core, a curved full-height particle curtain and sparse coherent rightward filaments.

**Architecture:** Keep the existing OGL WebGL2 pipeline and fixed 58% aperture. Add image-space morphology measurements first, then change only the particle-state mapping and high-energy/composite shaders; preserve typography, flowmap, runtime adaptation, fallback and lifecycle ownership.

**Tech Stack:** TypeScript, OGL 1.0.11, GLSL ES 3.00, Vitest, Playwright, PNG image metrics.

## Global Constraints

- Work only in the no-index `/_visual/optical-lab` implementation.
- Do not change production `/`, ECS, APIs, schemas, authentication or Hermes.
- Add no dependency, renderer, route, font or atlas asset.
- Keep the aperture at `.58`, whole-line response at `1–2px`, local peak at `≤4px`, caustic gain at `≤.08`, and exact recovery by `650ms`.
- Preserve the unique selectable `Science evolves.` h1 and all fallback/resource cleanup behavior.
- Use TDD: each morphology contract must fail against the current accepted frame before shader changes.

---

### Task 1: Energy Morphology Contract

**Files:**
- Modify: `apps/web/test/visual/optical-lab-reference-metrics.mjs`
- Modify: `apps/web/test/visual/optical-lab-visual-metrics.test.mjs`
- Modify: `apps/web/test/visual/optical-lab-shots.mjs`

**Interfaces:**
- Produces: `measureEnergyComposition(image, apertureX)` returning
  `filamentEnergyRatio` and `broadHazeRatio`, plus
  `measureRadialCoherence(image, apertureX)` returning radial continuity and
  absolute-energy evidence.
- Consumes: existing decoded PNG image shape `{ width, height, pixels }` and aperture `.58`.

- [x] **Step 1: Add deterministic positive and negative fixtures**

Create one lens-core fixture whose row peaks converge on `.58` and whose right
energy is carried by thin filaments. Create one current-like fixture with five
parallel columns plus a broad downstream wash.

- [x] **Step 2: Add literal morphology assertions**

Require `filamentEnergyRatio > .52`, `broadHazeRatio < .32`, absolute radial
continuity and target-relative absolute energy. Directionless vertical blinds,
sparse dots, broad haze and title-only fixtures must fail. The originally
proposed secondary-peak and row-convergence metrics were rejected because the
target reference itself did not satisfy them.

- [x] **Step 3: Verify RED on the accepted production-start frame**

Run:

```powershell
npx pnpm@9.15.0 --filter @openscience/web test -- optical-lab-visual-metrics.test.mjs
$env:OPTICAL_LAB_SERVER_MODE='start'; npx pnpm@9.15.0 --filter @openscience/web run shots:optical-lab
```

Expected: fixtures pass, but the native accepted frame fails one or more new
literal morphology thresholds while existing metrics remain unchanged.

### Task 2: Single-Core Energy Field

**Files:**
- Modify: `apps/web/lib/optical-lab/ogl/shaders/particle-update.ts`
- Modify: `apps/web/lib/optical-lab/ogl/shaders/particle-render.ts`
- Modify: `apps/web/lib/optical-lab/ogl/shaders/composite.ts`
- Test: `apps/web/test/visual/optical-lab-visual-metrics.test.mjs`
- Test: `apps/web/test/visual/optical-lab-shots.mjs`

**Interfaces:**
- Consumes: unchanged glyph mask, deterministic seed state, particle texture,
  flow texture and `.58` aperture.
- Produces: the same shader exports and render pass contracts; no TypeScript API
  or resource ownership changes.

- [x] **Step 1: Curve the particle-state mapping into the focal waist**

Map curtain particles with a signed vertical coordinate and a smooth nonlinear
convergence term so outer particles bend toward `.58` near the title band.
Remove discrete parallel x strata from the high-energy curtain role while
retaining deterministic glyph-derived dissolution upstream.

- [x] **Step 2: Replace bar energy with one analytic lens core**

In the high-energy shader, use one tapered core distance field centered at
`.58`, modulated by particle evidence. Keep a soft spectral fringe, but prevent
additional full-height peaks and mechanical-line geometry.

- [x] **Step 3: Replace broad downstream wash with sparse filaments**

Derive several subpixel-width rays from the focal core with deterministic phase,
right-only decay and bounded luminance. Reduce blurred energy contribution so
the title remains readable and the filament/haze metric passes.

- [x] **Step 4: Verify GREEN without weakening existing gates**

Run the focused visual test and production-start browser matrix. Expected: all
new morphology thresholds and all existing literal thresholds pass; inspect
`desktop-resting.png`, left/slit/right 150ms and recovered 650ms at original
resolution.

### Task 3: Review and Acceptance Evidence

**Files:**
- Modify: `docs/progress.md`
- Modify: `project_index.md`
- Modify: `docs/handoff/2026-08-11-optical-lab-task8-steps3-5-handoff.md`

**Interfaces:**
- Produces: a reviewable local commit and updated handoff evidence.
- Does not produce a production replacement or deployment authorization.

- [x] **Step 1: Run the complete gate**

```powershell
npx pnpm@9.15.0 --filter @openscience/web test
npx pnpm@9.15.0 --filter @openscience/web typecheck
npx pnpm@9.15.0 lint
npx pnpm@9.15.0 --filter @openscience/web build
$env:OPTICAL_LAB_SERVER_MODE='start'; npx pnpm@9.15.0 --filter @openscience/web run shots:optical-lab
npx pnpm@9.15.0 docs:lint
npx pnpm@9.15.0 audit:docs-sync
git diff --check
```

Confirm port 3062 is clear before and after the browser gate.

- [x] **Step 2: Request independent review**

Review numerical stability, deterministic morphology, glyph readability,
interaction invariants, fallback honesty and exact cleanup. Resolve every
Critical and Important finding with a fresh RED/GREEN cycle.

- [x] **Step 3: Synchronize evidence and commit**

Record exact before/after morphology and existing five-region metrics, test
commands, commits, residual physical-device gap and the unchanged production
boundary in progress, index and handoff. Commit code and documentation in
separate atomic commits.
