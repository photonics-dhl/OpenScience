# Optical Water-Flow Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the weak Landing CSS sweep with a coherent idle WebGL water flow and remove all pixels from the baked cursor/status-copy contamination.

**Architecture:** Keep the accepted asset renderer and pointer model intact. Restrict the full-page target reference to a title-only sampling band, then strengthen only the ambient shader path with multi-scale flow and derivative light; the existing pointer path remains the high-energy state of the same field.

**Tech Stack:** Next.js 14, React 18, CSS Modules, OGL/WebGL2 GLSL ES 3.00, Vitest, Playwright.

## Global Constraints

- No dependency, route, framebuffer, texture, or asset addition.
- Preserve pointer caps: 5 px follow, 10 px combined displacement, .18 gain, .20 longitudinal radius, 700 ms recovery.
- Preserve WebGL2 failure fallback, visibility/intersection suspension, context-loss cleanup, and reduced motion.
- Do not change the Lab composition while correcting Landing presentation contamination.

---

### Task 1: Clean headline contribution and unified water motion

**Files:**
- Modify: `apps/web/app/_visual/optical-lab/optical-lab.module.css`
- Modify: `apps/web/lib/optical-lab/ogl/shaders/asset-flow.ts`
- Modify: `apps/web/lib/optical-lab/ogl/shaders/asset-composite.ts`
- Modify: `apps/web/test/optical-lab-asset-interaction.test.ts`
- Modify: `apps/web/test/visual/shots.mjs`

**Interfaces:**
- Consumes: existing `tFlow`, `tTarget`, `tEnergy`, `uAmbientPhase`, `uLocalStrength`, and Landing `data-accepted-optical-surface` markers.
- Produces: headline-only target contribution plus an autonomous multi-scale ambient field that the existing local wake can override without a new owner.

- [x] **Step 1: Write failing behavior gates**

Add browser assertions that the Landing target plate is clipped to the headline band, every descendant computes `cursor: none`, no CSS pseudo-element animation remains, and idle renderer captures have measurable non-linear motion in the title band. Add focused shader contracts for multi-scale ambient flow and derivative light while preserving all accepted local literals.

- [x] **Step 2: Verify RED**

Run:

```powershell
npx pnpm@9.15.0 --filter @openscience/web test -- optical-lab-asset-interaction.test.ts
node apps/web/test/visual/shots.mjs --base-url https://OpenScience.428312321.xyz
```

Expected: focused test rejects the old single-scale ambient/CSS sweep contract; browser gate rejects the unclipped full-page target contribution.

- [x] **Step 3: Implement the minimal production change**

Remove `accepted-optical-idle-current`. Apply a headline-only clip to the visible target plate and the same numeric band in the composite shader. Blend three bounded ambient vectors on a non-wrapping shader clock, then derive a low-alpha highlight that is multiplicatively gated by flow curvature. Keep `uLocalStrength`, local memory, overlay, caps, and renderer lifecycle unchanged.

- [x] **Step 4: Verify GREEN and retained behavior**

Run the focused Vitest, Landing desktop/mobile normal/reduced browser gate, full native interaction matrix, full Web tests, typecheck, lint, production build, and release Playwright gate. Inspect fresh desktop/mobile idle and active screenshots at original size.

- [ ] **Step 5: Synchronize and deploy**

Update `docs/progress.md`, `project_index.md`, the current optical handoff, and deployment evidence. Run docs lint/docs sync/diff check, obtain independent review, commit, then follow the existing `checkup → backup → deploy --skip-migrate → public browser verification` runbook. Preserve the current release hash as rollback.
