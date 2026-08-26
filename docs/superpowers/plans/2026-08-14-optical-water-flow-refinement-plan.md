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

- [x] **Step 5: Synchronize and deploy**

Update `docs/progress.md`, `project_index.md`, the current optical handoff, and deployment evidence. Run docs lint/docs sync/diff check, obtain independent review, commit, then follow the existing `checkup → backup → deploy --skip-migrate → public browser verification` runbook. Preserve the current release hash as rollback.

---

### Task 2: Make idle motion perceptually visible

**Files:**
- Modify: `apps/web/test/visual/shots.mjs`
- Modify: `apps/web/test/optical-lab-asset-interaction.test.ts`
- Modify: `apps/web/lib/optical-lab/ogl/asset-interaction-renderer.ts`
- Modify: `apps/web/lib/optical-lab/ogl/shaders/asset-composite.ts`

**Interfaces:**
- Consumes: the existing continuous ambient clock and shared Landing/Lab WebGL field.
- Produces: a visibly breathing idle field without changing the accepted local pointer envelope.

- [x] **Step 1: Write and run the perceptual RED**

Raise the real Landing browser contract from 360 ms technical motion to a 720 ms perceptual window requiring title coverage `>= .04` and title delta average `>= .20`. Add source contracts for the chosen ambient-only constants. Run the focused unit and browser gate; the current release must fail on salience.

- [x] **Step 2: Implement one Landing-only presentation adjustment**

Expose the already-rendered water composite at full presentation alpha only when `data-accepted-optical-surface=landing`; retain the accepted Lab alpha expression and all flow/light/pointer constants. This is the smallest change that fixes final-composite visibility without changing shared interaction geometry.

- [x] **Step 3: Verify visual and engineering acceptance with accepted timing risk**

Run focused tests, Landing desktop/mobile normal/reduced browser gates, the full native pointer matrix, full Web tests, typecheck, build, release gate, docs lint/sync, and diff check. Inspect fresh before/after and full-page screenshots at original size.

Current boundary: Landing final-surface salience, focused `17/17`, Web `244/244`, typecheck, build, release `27/27`, and screenshot inspection are GREEN. Otherwise unchanged Lab native attempts failed only the `<=900ms` renderer-PNG completion deadline at `1066.7ms`, `953.2ms`, and `956.7ms`; the user explicitly accepted this timing risk and the native matrix remains documented RED rather than being relabelled GREEN.

- [x] **Step 4: Review, commit, and deploy after the existing production confirmation boundary**

Update progress/index/handoff with current evidence, obtain independent review, commit, and deploy only after the production write confirmation required by the runbook.

---

### Task 3: Add restrained idle attention accents

**Files:**
- Modify: `apps/web/test/visual/shots.mjs`
- Modify: `apps/web/test/optical-lab-asset-interaction.test.ts`
- Modify: `apps/web/lib/optical-lab/ogl/shaders/asset-composite.ts`

**Interfaces:**
- Consumes: continuous `uAmbientPhase`, `uPresentationAlpha`, `localAmount`, curvature, target luminance, and the existing final-surface screenshot helper.
- Produces: Landing-only centre caustic breathing and glyph-edge shimmer that yield to pointer interaction.

- [x] **Step 1: Write and run RED**

Require three final-surface `1200ms` windows with increased title-band salience,
all-quadrant motion, and the retained `<=20%` chromatic row/column limit. Add
focused source contracts for centre weighting, glyph-edge weighting,
Landing-only presentation gating, and `(1.0 - localAmount)` suppression.

- [x] **Step 2: Implement the minimal shader refinement**

Reuse the existing composite pass and continuous shader clock. Add two bounded,
near-neutral terms: a centre-weighted curvature caustic and a sparse target-edge
shimmer. Do not alter flow, pointer caps, radius, recovery, overlay, resources,
static plates, or reduced-motion behavior.

- [x] **Step 3: Verify and visually inspect with accepted timing risk**

Run focused tests, the production Landing browser gate, full Web tests,
typecheck, build, and the retained Lab native matrix. Inspect before/after,
desktop, and mobile screenshots at original size; reject broad bands, flashes,
hard rings, clipping, cursor/status contamination, or illegible glyphs.

Current boundary: focused `17/17`, Web `244/244`, typecheck, build, fresh
production-start Landing desktop/mobile normal/reduced/idle/pointer, and
original-size inspection are GREEN; the final surface itself supplies both
salience and chromatic-band evidence. The retained Lab matrix remains timing RED
at `956.7ms > 900ms` with recovered max delta `9`; the user accepted that risk
without converting the native matrix to GREEN. Release `48809d6` is deployed,
public final-surface browser evidence is GREEN, and rollback is `744c631`.

---

### Task 4: Restore the existing Landing water and prevent another silent regression

**Root cause:** The current release still contains the Task 22/23 OGL water
renderer. It was not removed by the 2026-08-26 navigation deployment. The
regression was encoded earlier: `8edf6fa` hid the operating-system cursor,
`8fe2094` expanded that rule to every descendant with `!important`, and the
browser gate made the hidden cursor mandatory. The same gate samples only a
fast two-step pointer movement and aggregate changed pixels. It therefore
accepts the current 10-second/2.2px presentation and a measured ordinary slow
follow of about `.007`, even though the result reads as a static image.

**Files:**

- Modify: `apps/web/test/optical-lab-asset-interaction.test.ts`
- Modify: `apps/web/test/visual/shots.mjs`
- Modify: `apps/web/test/e2e/product-release.spec.ts`
- Modify: `apps/web/app/_visual/optical-lab/optical-lab.module.css`
- Modify: `apps/web/lib/optical-lab/asset-interaction-model.ts`
- Modify: `apps/web/lib/optical-lab/ogl/asset-interaction-renderer.ts`
- Modify: `apps/web/lib/optical-lab/ogl/shaders/asset-composite.ts`
- Modify: `docs/progress.md`
- Modify: `docs/handoff/2026-08-16-hermes-2d-pet-handoff.md`
- Modify: `project_index.md`

**Interfaces:**

- Consumes: the existing `AcceptedOpticalSurface`, 96×54 flow texture,
  `mapAssetPointerVelocity`, continuous ambient clock, presentation composite,
  reduced-motion fallback and canonical product release matrix.
- Produces: the same OGL material with a visible system cursor, a concave
  slow-to-fast movement response, a readable idle current, spatially local
  final-composite evidence and a release gate that cannot reinstate the old
  hidden/static contract.

- [ ] **Step 1: Write the focused model RED**

  Add a real-behavior test that maps a slow `12px / 1000ms` movement and a fast
  `120px / 100ms` movement, then feeds each result through
  `injectAssetInteraction` and `stepAssetInteraction`. The slow sample must
  publish `follow >= .05`; the fast sample must remain stronger than the slow
  sample and both must remain `<= 1`. The current linear mapping must fail the
  slow assertion at about `.009`.

- [ ] **Step 2: Write the production-browser RED**

  Replace the `cursor:none` assertions in both browser gates with computed
  `auto`/`default` system-cursor assertions and an explicit scan proving that no
  descendant forces `none`. Exercise a slow path using repeated 2px moves with
  180ms sampling, record the peak snapshot, and require `follow >= .05` at the
  real pointer coordinates. Then exercise the existing fast path and require a
  stronger peak within the accepted cap. Capture before/active/after final
  composites and require the slow change centroid to remain near the pointer,
  with recovery at zero within 900ms.

- [ ] **Step 3: Replace aggregate idle noise with connected-motion evidence**

  Bin the title band into a 24×10 grid. A cell is active only when at least 6%
  of its pixels change by 3 or more and its mean delta is at least 1.5. Use a
  four-neighbour flood fill and require the largest component to span at least
  six cells across both axes during each 650ms observation window. Keep the
  existing four-quadrant and `<=20%` chromatic-band limits. The current slow
  presentation must fail this shorter perceptual window before production code
  changes.

- [ ] **Step 4: Restore visible output in the existing owner**

  Remove the Landing `cursor: none !important` selector without adding a custom
  cursor. Shape the already calculated non-zero pointer magnitude with
  `sqrt(magnitude)` before normalizing its direction; this raises slow movement
  while preserving zero input, direction, fast-over-slow ordering and the
  existing cap. Change the existing ambient cycle from `10_000ms` to `7_000ms`
  and the Landing-only presentation drift from `2.2px` to `3.2px`; retain the
  shared `.05` flow strength, 6px ambient budget, 10px combined cap, accepted
  textures, renderer ownership and all reduced-motion/failure behavior. Do not
  remount the historical Canvas2D `OpticalField` or add another animation layer.

- [ ] **Step 5: Verify GREEN and inspect the actual experience**

  Run the focused Vitest after each production change, then the Landing visual
  gate and canonical product release Landing cases at 1672×941, 390×844 and
  320px. Inspect an original-size idle sequence and a slow/fast interaction
  recording, verifying a visible OS cursor, continuous black-water motion,
  local wake, no broad sweep/halo/band, clean typography and static canvas-free
  reduced motion. Run full Web tests, typecheck, lint, build, docs gates and
  `git diff --check`; retain the known native PNG timing RED as RED.

- [ ] **Step 6: Protect future unrelated releases and deploy**

  Keep the normal Landing motion contract in the canonical product release
  matrix and make its evidence mandatory for any release that ships the Web
  image, even when no optical source file changes. Update CURRENT docs with the
  exact application/release/rollback tuple, commit a clean candidate, run
  checkup and backup, deploy with `--skip-migrate`, then repeat the cursor,
  normal/reduced water, route, container, dependency and public health checks
  against the immutable ECS release.
