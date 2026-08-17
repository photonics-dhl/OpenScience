# Hermes Articulated Mesh Pet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the visually failed whole-PNG/CSS-signal renderer with a lightweight OGL mesh rig whose actual character pixels perform stateful idle and pointer-driven motion.

**Architecture:** Keep `HermesVisualAdapter`, guide tasks, drawer, authorization and state precedence intact. Add an isolated motion model and OGL renderer behind `HermesRiggedPortrait`; use the existing original textures and static fallback, with no third-party character asset or new runtime dependency.

**Tech Stack:** React 18, TypeScript, OGL 1.0.11, GLSL, Vitest, Playwright, existing PNG fixtures.

## Global Constraints

- Character-pixel or joint movement is the only valid articulation evidence.
- One canvas, one plane/program and at most three existing textures; DPR ≤1.5, mesh ≤28×28.
- Approval and reduced motion are still; failed state is restrained; pointer events remain owned by the accessible button.
- Preserve the contextual guide, task recovery, authorization, i18n and drawer behaviour.
- Do not deploy or commit implementation before user visual acceptance.

### Task 1: Memory and contract correction

**Files:**
- Modify: `docs/specs/2026-08-15-hermes-2d-pet-design.md`
- Modify: `docs/specs/2026-08-16-hermes-contextual-guide-design.md`
- Modify: `docs/decisions/ADR-010-hermes-visual-runtime-and-live2d-license-gate.md`
- Modify: `project_index.md`
- Modify: `docs/progress.md`
- Modify: `docs/handoff/2026-08-16-hermes-2d-pet-handoff.md`

- [x] **Step 1:** Mark the whole-PNG/CSS renderer `VISUAL NO-GO` and remove it from CURRENT status.
- [x] **Step 2:** Add a docs-sync regression that rejects a deprecated Hermes renderer as CURRENT.
- [x] **Step 3:** Run the docs gate and verify the corrected inheritance chain.

### Task 2: Motion model TDD

**Files:**
- Create: `apps/web/lib/hermes/pet-motion.ts`
- Create: `apps/web/test/hermes-pet-motion.test.ts`

**Interface:** `sampleHermesMotion(input): HermesMotionSample`, containing head, torso, tail, crown, gaze, blink and active-gesture channels.

- [x] **Step 1:** Write RED tests for first gesture ≤1.8s, distinct idle gestures, pointer lead/follow/settle, state precedence and still modes.
- [x] **Step 2:** Implement a deterministic bounded scheduler and damped joint sampling.
- [x] **Step 3:** Run focused GREEN and reject whole-image/CSS-signal-only motion through the real pixel gate and DOM contract.

### Task 3: Real character-pixel mesh renderer

**Files:**
- Create: `apps/web/lib/hermes/pet-mesh-renderer.ts`
- Create: `apps/web/components/hermes/HermesRiggedPortrait.tsx`
- Modify: `apps/web/components/hermes/HermesVisualAdapter.tsx`
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/test/hermes-state.test.tsx`

- [x] **Step 1:** Write RED contracts requiring a real articulated canvas, first-frame fallback and absence of CSS fake-part signals.
- [x] **Step 2:** Implement the 28×28 weighted mesh, texture loading, joint uniforms, gaze warp and lifecycle ownership.
- [x] **Step 3:** Replace only the portrait renderer; retain the accessible button, suggestion and drawer contracts.
- [x] **Step 4:** Run focused tests and typecheck GREEN.

### Task 4: Perceptual browser acceptance

**Files:**
- Modify: `apps/web/test/e2e/hermes-dashboard.spec.ts`
- Create: `apps/web/test/visual/hermes-articulation-gate.mjs`
- Create: `apps/web/test/visual/hermes-performance-gate.mjs`
- Create: `apps/web/app/_visual/hermes-articulation/page.tsx`
- Create: `apps/web/app/%5Fvisual/hermes-articulation/page.tsx`

- [x] **Step 1:** Capture old renderer RED: CSS-signal selectors and whole-image evidence cannot satisfy the articulated runtime contract.
- [x] **Step 2:** Prove final idle onset ≤2s, three distinct gestures, fixed-clock non-affine head/torso/tail pixel motion, affine mutation rejection, seam/connected-silhouette integrity, pointer latency/order, settle, live approval recovery, async suspend/failure cleanup, six states, 390px, reduced and WebGL fallback.
- [x] **Step 3:** Visually inspect an 18-second 1440×900 video and representative frames; numerical GREEN still cannot replace user aesthetics approval.

### Task 5: Final review and preview

- [x] **Step 1:** Run focused/full Web, Worker/API affected tests, typecheck, lint, production build, docs gates and diff check.
- [x] **Step 2:** Request independent architecture, security and visual-evidence review; close all Critical/Important findings.
- [x] **Step 3:** Sync progress/index/handoff with exact evidence and start one local production preview.
- [ ] **Step 4:** Wait for user visual acceptance before staging, commit, merge or deployment.
