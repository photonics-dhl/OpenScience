# Optical Lab Candidate B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an isolated Candidate B whose resting frame carries the fixed
slit, optical waist and rightward emission of the user reference while pointer
input adds only bounded whole-line liquid refraction.

**Architecture:** Keep the reviewed native WebGL renderer and transactional
WebGL2→WebGL1→DOM lifecycle. Extend the pure field model with separate resting
optical strength and normalized interaction refraction, then consume those
values in the display and particle shaders. Add pure image-analysis helpers so
the production-start browser gate compares normalized resting topology against
the reference rather than accepting self-reported diagnostics.

**Tech Stack:** Next.js 14, React 18, TypeScript, CSS Modules, native WebGL2 and
WebGL1 `ANGLE_instanced_arrays`, Vitest 2, Playwright Chromium.

## Global Constraints

- Work only in `/_visual/optical-lab`; production `/` stays unchanged.
- Static desktop output is the primary effect; pointer input is secondary.
- Keep the aperture fixed at normalized `x = 0.58` for every frame.
- Whole-line pointer refraction is capped at 8 CSS pixels and recovers within
  650 ms without bounce.
- Keep exactly one semantic/selectable `h1`; the canvas stays `aria-hidden`.
- Keep WebGL2→fresh-canvas WebGL1→DOM fallback, context recovery and exact GL
  cleanup behavior.
- Mobile low-power and reduced-motion keep readable DOM/static output.
- Add no dependency, font, image asset, ECS GPU, Docker, API or schema change.
- Generated screenshots remain ignored under
  `apps/web/test/visual/out/optical-lab/`.

## Required TDD Execution Order

Execute Task 1, then merged Task 2 in this internal order: Part B Steps 1–6
establish the real Candidate A browser RED, Part A Steps 1–6 implement GREEN,
then Part B Steps 7–8 tune and commit. Execute final acceptance Task 3 last.
The visual acceptance test must fail against Candidate A before any material
shader production edit.

---

### Task 1: Separate Resting Optics from Pointer Refraction

**Files:**
- Modify: `apps/web/lib/optical-lab/model.ts:1-63`
- Test: `apps/web/test/optical-lab-model.test.ts:52-82`

**Interfaces:**
- Consumes: `OpticalLabPointer`, `OpticalLabViewport`,
  `OPTICAL_LAB_RECOVERY_MS`.
- Produces: `OPTICAL_LAB_REST_STRENGTH`,
  `OPTICAL_LAB_MAX_REFRACTION_PX`, and `sampleOpticalLabField()` values
  `{ opticalStrength, interactionStrength, refractionUv }`.

- [ ] **Step 1: Write the failing resting-strength test**

Add this independent behavior test:

```ts
it('keeps the resting optical composition energized without pointer input', () => {
  const resting = model?.sampleOpticalLabField(null, { width: 1_200, height: 675 }, 5_000);
  expect(resting?.interactionStrength).toBe(0);
  expect(resting?.opticalStrength).toBeCloseTo(0.72, 5);
  expect(resting?.refractionUv).toEqual({ x: 0, y: 0 });
});
```

This catches the current bug where `energy = 0` removes the waist and emission
from the resting frame.

- [ ] **Step 2: Write the failing bounded whole-line response test**

```ts
it('normalizes whole-line pointer refraction to an eight pixel budget', () => {
  const viewport = { width: 1_200, height: 675 };
  const active = model?.sampleOpticalLabField({
    x: 9_000,
    y: -4_000,
    lastActiveAt: 1_000,
    velocityX: 1,
    velocityY: -1,
  }, viewport, 1_000);
  expect(Math.abs((active?.refractionUv.x ?? 1) * viewport.width)).toBeLessThanOrEqual(8);
  expect(Math.abs((active?.refractionUv.y ?? 1) * viewport.height)).toBeLessThanOrEqual(8);
  expect(active?.interactionStrength).toBe(1);
  expect(active?.opticalStrength).toBe(1);
  expect(active?.aperture).toEqual({ x: 696, y: 337.5 });
});
```

This catches pixel-valued displacement being passed directly into UV shader
coordinates and any pointer branch that moves the aperture.

Replace the existing `verticalBias` assertions with literal pixel conversion
checks against `refractionUv`; do not keep assertions for the removed field.

- [ ] **Step 3: Run the focused model test and verify RED**

Run:

```powershell
npx pnpm@9.15.0 --filter @openscience/web test -- optical-lab-model.test.ts
```

Expected: FAIL because `interactionStrength`, `opticalStrength` and
`refractionUv` do not exist.

- [ ] **Step 4: Implement the minimal pure field model**

Add constants and helpers:

```ts
export const OPTICAL_LAB_REST_STRENGTH = 0.72;
export const OPTICAL_LAB_MAX_REFRACTION_PX = 8;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function exponentialRecovery(remaining: number) {
  if (remaining <= 0) return 0;
  return (Math.exp(4 * remaining) - 1) / (Math.exp(4) - 1);
}
```

Replace the current linear energy and pixel `verticalBias` return with:

```ts
const elapsed = pointer ? Math.max(0, now - pointer.lastActiveAt) : OPTICAL_LAB_RECOVERY_MS;
const remaining = clamp(1 - elapsed / OPTICAL_LAB_RECOVERY_MS, 0, 1);
const interactionStrength = pointer ? exponentialRecovery(remaining) : 0;
const opticalStrength = OPTICAL_LAB_REST_STRENGTH
  + (1 - OPTICAL_LAB_REST_STRENGTH) * interactionStrength;
const pointerX = pointer?.x ?? aperture.x;
const pointerY = pointer?.y ?? aperture.y;
const maxX = OPTICAL_LAB_MAX_REFRACTION_PX / viewport.width;
const maxY = OPTICAL_LAB_MAX_REFRACTION_PX / viewport.height;
const refractionUv = pointer ? {
  x: clamp(((pointerX - aperture.x) / viewport.width) * 0.012 * interactionStrength, -maxX, maxX),
  y: clamp(((pointerY - aperture.y) / viewport.height) * 0.012 * interactionStrength, -maxY, maxY),
} : { x: 0, y: 0 };
```

Return these three fields and keep `energy: interactionStrength` temporarily as
a compatibility alias until Task 2 switches every shader uniform.

- [ ] **Step 5: Run the model tests and verify GREEN**

Run the Step 3 command. Expected: all seven model tests pass, including fixed
aperture and exact 650 ms recovery.

- [ ] **Step 6: Commit Task 1**

```powershell
git add -- apps/web/lib/optical-lab/model.ts apps/web/test/optical-lab-model.test.ts
git commit -m "feat(web): model candidate b optical response"
```

---

### Task 2: Gate and Render the Candidate B Optical Material

#### Part A: Render One Continuous Reference-First Glyph Material

**Files:**
- Modify: `apps/web/lib/optical-lab/webgl-renderer.ts:40-180,468-529`
- Modify: `apps/web/components/optical-lab/OpticalLabRenderer.tsx:81-152`
- Modify: `apps/web/app/_visual/optical-lab/optical-lab.module.css:121-163`
- Test: `apps/web/test/optical-lab-contract.test.tsx:37-57`
- Test: `apps/web/test/optical-lab-model.test.ts`

**Interfaces:**
- Consumes: Task 1's `opticalStrength`, `interactionStrength` and
  `refractionUv`, plus the verified Candidate A browser RED from Part B Step 6.
- Produces: display shader uniforms `uOpticalStrength`,
  `uInteractionStrength`, `uRefraction`; stage attribute
  `data-optical-ink="gpu|dom"`.

- [ ] **Step 1: Write the failing visual-ink state contract**

Extend the SSR contract with the initial DOM state:

```ts
expect(markup).toContain('data-optical-ink="dom"');
```

Add a model assertion that mutating pointer coordinates changes
`refractionUv` but never `aperture`. The break caught is a renderer that cannot
distinguish semantic DOM fallback from the one visible GPU ink layer.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
npx pnpm@9.15.0 --filter @openscience/web test -- optical-lab-contract.test.tsx optical-lab-model.test.ts
```

Expected: FAIL on missing `data-optical-ink="dom"`.

- [ ] **Step 3: Add explicit DOM/GPU ink state**

Initialize the Candidate stage in `OpticalLabPage.tsx` with:

```tsx
data-optical-ink="dom"
```

In every `OpticalLabRenderer` ready/fallback/lost/disposed branch, set:

```ts
stage.dataset.opticalInk = snapshot.contextStatus === 'ready' ? 'gpu' : 'dom';
```

Use an explicit helper if needed so context loss and policy changes cannot
forget the DOM restoration branch. Replace the selector with:

```css
.candidate[data-optical-ink='gpu'] .headline {
  color: transparent;
}

.candidate[data-optical-ink='gpu'] .headline::selection,
.candidate[data-optical-ink='gpu'] .headline *::selection {
  color: var(--os-paper);
  background: rgb(255 78 34 / .42);
}
```

- [ ] **Step 4: Replace pixel bias with normalized whole-line uniforms**

In both WebGL shader variants add:

```glsl
uniform float uOpticalStrength;
uniform float uInteractionStrength;
uniform vec2 uRefraction;
```

Upload Task 1 values before the display and particle draws:

```ts
setUniform1f(gl, displayProgram, 'uOpticalStrength', field.opticalStrength);
setUniform1f(gl, displayProgram, 'uInteractionStrength', field.interactionStrength);
gl.uniform2f(
  gl.getUniformLocation(displayProgram, 'uRefraction'),
  field.refractionUv.x,
  field.refractionUv.y,
);
```

Remove `uVerticalBias` and its particle/display usages. Retain `uPhase` for a
small velocity-driven wave only.

In the flow shader, replace the pointer-centered stamp origin with the fixed
axis `vec2(uApertureX, 0.5)`. Pointer velocity may modulate the flow vector, but
the injection topology must not follow `uPointer.y`.

- [ ] **Step 5: Implement the resting fixed-slit material**

Use the same display-body equations for WebGL2 and WebGL1:

```glsl
float signedDistance = vUv.x - uApertureX;
float seam = exp(-abs(signedDistance) * 24.0);
float downstream = smoothstep(-0.01, 0.15, signedDistance);
float positiveDistance = max(signedDistance, 0.0);
float beamWidth = 0.018 + positiveDistance * 0.22;
float axial = exp(-pow(abs(vUv.y - 0.5) / beamWidth, 1.55));
float squeeze = -signedDistance * exp(-abs(signedDistance) * 10.5) * 0.46;
float restingWave = sin(vUv.y * 58.0 + positiveDistance * 31.0) * 0.0028 * downstream;
float followEnvelope = 0.42 + seam * 0.58;
vec2 flow = TEXTURE(uFlow, vUv).rg * 2.0 - 1.0;
vec2 displaced = vUv + vec2(squeeze + restingWave, 0.0)
  + uRefraction * followEnvelope
  + flow * seam * 0.009 * uInteractionStrength;
```

Sample one continuous warm-white glyph and add a narrow resting caustic plus
directional emission:

```glsl
float glyphAlpha = TEXTURE(uGlyph, displaced).a;
float waist = seam * exp(-abs(vUv.y - 0.5) * 17.0);
float rayTexture = 0.55 + 0.45 * cos((vUv.y - 0.5) * 150.0 - positiveDistance * 38.0);
float emission = downstream * axial * rayTexture * 0.18 * uOpticalStrength;
float caustic = waist * 0.34 * uOpticalStrength;
float accent = caustic * (0.34 + 0.18 * uInteractionStrength);
vec3 color = vec3(0.96, 0.945, 0.91) * (glyphAlpha + emission + caustic)
  + vec3(0.92, 0.31, 0.13) * accent;
float alpha = max(glyphAlpha * 0.96, emission + caustic);
```

Keep chroma below `0.0012` UV and only within the aperture seam. Update the
particle shader to use the same `squeeze`, `uRefraction` and nonzero
`uOpticalStrength` so sparse edge particles exist at rest without becoming a
radial fan.

- [ ] **Step 6: Run focused tests, typecheck and verify GREEN**

```powershell
npx pnpm@9.15.0 --filter @openscience/web test -- optical-lab-contract.test.tsx optical-lab-model.test.ts
npx pnpm@9.15.0 --filter @openscience/web typecheck
```

Expected: focused tests and typecheck pass with no pixel-valued displacement
uniform remaining.

- [ ] **Step 7: Continue directly to Part B GREEN**

Do not commit yet. The merged task is complete only after the real browser
visual RED has turned GREEN and Part B's full scoped commit is created.

---

#### Part B: Gate Resting Reference Topology and Interaction

**Files:**
- Create: `apps/web/test/visual/optical-lab-visual-metrics.mjs`
- Create: `apps/web/test/visual/optical-lab-visual-metrics.test.mjs`
- Modify: `apps/web/test/visual/optical-lab-shots.mjs:1-180,307-451`

**Interfaces:**
- Consumes: decoded `{ width, height, pixels }` candidate/reference images.
- Produces: `analyzeOpticalTopology(image, apertureX)` with literal metrics
  `{ waistConcentration, downstreamSpread, continuity, directionality }`.

- [ ] **Step 1: Write failing pure visual-metric fixtures**

Build two literal synthetic fixtures in the `.test.mjs` file: a continuous
horizontal glyph band with a narrow waist/right-opening beam, and a forbidden
symmetric ring/fan. Assert:

```js
assert(referenceLike.waistConcentration > 1.25);
assert(referenceLike.downstreamSpread > 0.018);
assert(referenceLike.continuity > 0.72);
assert(referenceLike.directionality > 1.08);
assert(forbidden.directionality < 1.04);
```

The expected literals are independent of production shader code. Mutating the
analyzer to swap left/right bands or count background as energy must fail.

- [ ] **Step 2: Run the metric test and verify RED**

```powershell
npx pnpm@9.15.0 --filter @openscience/web exec vitest run test/visual/optical-lab-visual-metrics.test.mjs
```

Expected: FAIL because `optical-lab-visual-metrics.mjs` does not exist.

- [ ] **Step 3: Implement the pure analyzer**

Decode luminance as `(0.2126*r + 0.7152*g + 0.0722*b) / 255`. Sample normalized
regions around the aperture:

```js
const upstream = meanEnergy(image, apertureX - .12, apertureX - .055, .24, .76);
const waist = meanEnergy(image, apertureX - .018, apertureX + .018, .24, .76);
const downstream = meanEnergy(image, apertureX + .035, apertureX + .24, .16, .84);
const upstreamEnvelope = meanEnergy(image, apertureX - .24, apertureX - .04, .12, .32)
  + meanEnergy(image, apertureX - .24, apertureX - .04, .68, .88);
const downstreamEnvelope = meanEnergy(image, apertureX + .04, apertureX + .24, .12, .32)
  + meanEnergy(image, apertureX + .04, apertureX + .24, .68, .88);
```

Return:

```js
{
  waistConcentration: waist / Math.max(.0001, upstream),
  downstreamSpread: downstream,
  continuity: occupiedColumns / sampledColumns,
  directionality: downstreamEnvelope / Math.max(.0001, upstreamEnvelope),
}
```

Define occupancy as at least one pixel with luminance `>= 0.18` in the title
band. Keep the existing calibrated ring/line/ghost analyzers unchanged.

- [ ] **Step 4: Verify the pure analyzer GREEN**

Run the Step 2 command. Expected: the reference-like and forbidden fixtures
both pass.

- [ ] **Step 5: Add a resting-frame browser RED gate**

Before any pointer movement, capture both target and Candidate stage images.
Analyze them and assert Candidate B reaches a bounded fraction of the reference:

```js
assert(candidate.waistConcentration >= Math.max(1.18, target.waistConcentration * .52));
assert(candidate.downstreamSpread >= Math.max(.006, target.downstreamSpread * .38));
assert(candidate.continuity >= .68);
assert(candidate.directionality >= Math.max(1.04, target.directionality * .42));
```

Save the frame as `${testCase.name}-resting.png`. For desktop/WebGL1/fresh
WebGL1 cases, assert it differs from every active frame but by less than the
existing active-frame pairwise maximum. Keep aperture and stage bounds fixed.

- [ ] **Step 6: Run the production-start gate and verify Candidate A RED**

```powershell
npx pnpm@9.15.0 --filter @openscience/web build
$env:OPTICAL_LAB_SERVER_MODE='start'
$env:OPTICAL_LAB_PORT='3062'
node apps/web/test/visual/optical-lab-gate.mjs
```

Expected before Task 2 implementation: FAIL on resting waist or downstream
energy. This failure is the required gate before any Candidate B material
shader edit; never reset the active worktree to reproduce it later.

- [ ] **Step 7: Tune only Candidate B shader constants until GREEN**

Change only the named material constants from Task 2: squeeze `0.46`, beam
opening `0.22`, caustic `0.34`, emission `0.18`, and ray frequency `150/38`.
Do not loosen the literal acceptance thresholds, move the aperture, add a
radial mask or expose the DOM ghost. After each change, rerun the production
gate and inspect `desktop.png` at original resolution.

- [ ] **Step 8: Commit merged Task 2**

```powershell
git add -- apps/web/lib/optical-lab/model.ts apps/web/lib/optical-lab/webgl-renderer.ts apps/web/components/optical-lab/OpticalLabRenderer.tsx apps/web/components/optical-lab/OpticalLabPage.tsx apps/web/app/_visual/optical-lab/optical-lab.module.css apps/web/test/optical-lab-model.test.ts apps/web/test/optical-lab-contract.test.tsx apps/web/test/visual/optical-lab-visual-metrics.mjs apps/web/test/visual/optical-lab-visual-metrics.test.mjs apps/web/test/visual/optical-lab-shots.mjs
git commit -m "feat(web): render and gate candidate b optics"
```

---

### Task 3: Final Local Acceptance and Documentation

**Files:**
- Modify: `docs/progress.md`
- Modify: `project_index.md`
- Modify: `docs/handoff/2026-08-11-optical-lab-task8-steps3-5-handoff.md`
- Modify: `.superpowers/sdd/2026-08-11-landing-incremental-optimization-plan/progress.md`
- Modify: `.superpowers/sdd/2026-08-11-landing-incremental-optimization-plan/task-8-report.md`

**Interfaces:**
- Consumes: fresh screenshots, `metrics.json`, test/build output and commit SHAs.
- Produces: reviewable Candidate B evidence and an explicit Step 6 user visual
  selection checkpoint.

- [ ] **Step 1: Run fresh local gates**

```powershell
npx pnpm@9.15.0 --filter @openscience/web test -- optical-lab-contract.test.tsx optical-lab-model.test.ts optical-lab-visual-metrics.test.mjs
npx pnpm@9.15.0 --filter @openscience/web test
npx pnpm@9.15.0 --filter @openscience/web typecheck
npx pnpm@9.15.0 --filter @openscience/web build
$env:OPTICAL_LAB_SERVER_MODE='start'
$env:OPTICAL_LAB_PORT='3062'
node apps/web/test/visual/optical-lab-gate.mjs
npx pnpm@9.15.0 lint
npx pnpm@9.15.0 docs:lint
git diff --check
```

Expected: all commands exit 0; the gate leaves no listener on port 3062.

- [ ] **Step 2: Inspect desktop and fallback evidence**

Open at original resolution:

- `apps/web/test/visual/out/optical-lab/desktop.png`
- `apps/web/test/visual/out/optical-lab/desktop-resting.png`
- `apps/web/test/visual/out/optical-lab/desktop-left-150ms.png`
- `apps/web/test/visual/out/optical-lab/desktop-right-150ms.png`
- `apps/web/test/visual/out/optical-lab/dom-fallback.png`

Reject the result if the title is duplicated or severed, the waist is dark,
the emission becomes a ring/fan, or active frames move the fixed aperture.

- [ ] **Step 3: Request scoped code review**

Generate a review package from the plan baseline to HEAD and request verdicts
for correctness, spec compliance, lifecycle regressions and visual-gate
honesty. Resolve every Critical/Important finding before continuing.

- [ ] **Step 4: Sync project state**

Prepend one concise `docs/progress.md` entry with RED/GREEN commands, visual
metrics and the explicit statement that ECS was not changed. Update
`project_index.md`, the existing handoff, SDD ledger and Task 8 report in place;
do not create a second handoff for the same task.

- [ ] **Step 5: Commit the acceptance record**

```powershell
git add -- docs/progress.md project_index.md docs/handoff/2026-08-11-optical-lab-task8-steps3-5-handoff.md
git commit -m "docs: record candidate b local acceptance"
```

- [ ] **Step 6: Present Candidate B for user selection**

Show the fresh three-way desktop comparison and state separately:

- engineering gate status;
- visible differences from the reference;
- headless/SwiftShader limitation;
- production `/` unchanged and no deployment performed.

Only explicit user selection can start a production replacement plan.
