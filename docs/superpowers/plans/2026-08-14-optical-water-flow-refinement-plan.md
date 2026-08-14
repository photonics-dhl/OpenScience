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
