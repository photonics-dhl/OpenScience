# Optical Idle Attention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the no-input title motion immediately perceptible and remove the mouse-shaped dark artefact without weakening accepted pointer behavior.

**Architecture:** Keep the accepted shared WebGL renderer unchanged. Add one Landing-only CSS presentation layer on the existing interaction host: it moves at rest, pauses while renderer-owned local follow is active, and disappears for reduced motion. This isolates attention motion from Lab pointer locality/recovery while adding no canvas, texture or runtime dependency.

**Tech Stack:** Next.js, React, CSS Modules, OGL/WebGL2 (unchanged), Vitest, Playwright pixel gates.

## Global Constraints

- No new runtime dependency, texture, framebuffer or canvas owner.
- Reduced motion stays byte-identical to the accepted fixture.
- Pointer response remains 70ms, 5px follow, 10px cap, .18 gain, .20/.14 radius and exact local zero at 700ms.
- Do not change typography, plate order, Landing layout, API, database or infrastructure topology.

---

### Task 21: Perceptible autonomous title current and dark-artefact repair

**Files:**
- Modify: `apps/web/app/_visual/optical-lab/optical-lab.module.css`
- Modify: `apps/web/components/optical-lab/AcceptedOpticalSurface.tsx`
- Modify: `apps/web/components/optical-lab/AssetInteractionMount.tsx`
- Modify: `apps/web/test/visual/shots.mjs`
- Modify: canonical progress/index/handoff/spec/plan records

**Interfaces:**
- Consumes the existing `follow` snapshot through a stage data attribute.
- Produces no new canvas or public API; the accepted renderer, diagnostics and plate contract remain unchanged.

- [x] **Step 1: Capture RED evidence**

  Add a real compositor-frame test requiring repeated no-input changes in the
  central title band at RGB delta >= 3. Add a computed-style assertion that the
  operating-system cursor is hidden on the Landing optical stage, and retain
  desktop/mobile idle screenshots for direct visual inspection. Run it on the
  current build and retain the expected failure metrics.

- [x] **Step 2: Implement the smallest isolated presentation fix**

  Preserve pointer-local branches and all shader files. Add a bounded,
  Landing-only cool-white-warm current on the existing interaction host. Pause
  it while local follow is active, hide it for reduced motion, and scope
  `cursor:none` to the Landing optical stage.

  **Historical rejected directions:** flow-normalization, state switching, dual displacement,
  analytical displacement, shader colour and CSS-current candidates all failed
  retained spatial or recovery evidence and were reverted. The accepted final
  CSS layer is outside the Lab renderer capture and therefore does not alter
  native recovery evidence.

- [x] **Step 3: Verify GREEN and regressions**

  Run focused Vitest, the real Landing desktop/mobile normal/reduced idle and
  pointer matrix, full native spatial/halo/layer/recovery/lifecycle gate,
  reduced exact-static capture, full Web tests, typecheck, lint and build.
  Inspect desktop/mobile resting and active screenshots visually.

- [x] **Step 4: Review, docs and release**

  Review the scoped diff, synchronize `docs/progress.md`, `project_index.md`
  and the current handoff, commit the tracked set, then use the deployment
  runbook only after the required production-write confirmation. Verify public
  routes, real public idle frames and rollback reference.
