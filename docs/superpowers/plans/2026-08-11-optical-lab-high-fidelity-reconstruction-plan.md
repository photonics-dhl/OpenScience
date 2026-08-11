# Optical Lab High-Fidelity Reconstruction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconstruct the approved `Science evolves.` reference in the isolated
Optical Lab with reference-scale typography, a complete resting optical field
and only restrained pointer-follow enhancement.

**Architecture:** Keep one semantic DOM `h1` as the layout authority. A
WebGL2-only OGL pipeline consumes approved self-hosted font atlases, renders an
MSDF glyph mask, derives dissolution and GPGPU particles from that mask, and
composites the glyph, curtain, caustic and rightward emission through a bounded
HDR post-process. WebGL1, reduced motion, initialization failure and context
loss reveal a promoted screenshot of the accepted resting WebGL2 frame.

**Tech Stack:** Next.js 14, React 18, TypeScript, CSS Modules, OGL 1.0.11,
`msdf-bmfont-xml` 2.8.0, GLSL ES 3.00, Vitest 2 and Playwright Chromium.

## Global Constraints

- Work only in `/_visual/optical-lab`; production `/`, API, schema, auth,
  uploads, Hermes and ECS deployment remain unchanged.
- Use `target-reference.png` at its native 1672 × 941 size as the visual source
  of truth. Do not tune against the rejected Candidate B output.
- Complete each task RED → GREEN → focused verification → review → commit.
- Do not implement particles or post-processing before the user accepts Task 1
  typography at full size.
- Do not implement pointer response or promote a fallback before the user
  accepts Task 5 resting material at full size.
- Preserve exactly one selectable `h1` whose text serializes as
  `Science evolves.`; canvas and fallback artwork are decorative and hidden
  from accessibility APIs.
- Keep the aperture and type transition fixed at `x = 58%` in every mode.
- Keep the full title on one line. Responsive layouts may crop peripheral
  energy, but must not stack words or move the aperture.
- Pointer input writes velocity into a flowmap. It must never become a radial
  force center, ring, symmetric fan or mechanical divider.
- Whole-line follow is 1–2 CSS px, local displacement is at most 4 CSS px,
  caustic gain is at most 8%, follow is monotonic over 100–140 ms, and rest is
  exact by 650 ms.
- OGL is the only runtime rendering dependency added. Atlas generation is a
  pinned development tool and runs from project scripts, never a global install.
- Commit selected redistributable font files, their OFL notices, atlas PNG/JSON
  and a SHA-256 manifest. Do not download font assets at browser runtime.
- Generated diagnostic screenshots stay ignored under
  `apps/web/test/visual/out/optical-lab/`. Only the user-approved static fallback
  is promoted into `apps/web/public/optical-lab/`.
- Automated browser evidence from SwiftShader proves behavior and lifecycle,
  not real-device GPU performance. Record physical desktop and mobile timings
  before final acceptance.
- No commercial asset or shader may enter the repository without separate user
  approval and license review.

## File and Responsibility Map

| Path | Responsibility |
| --- | --- |
| `apps/web/components/optical-lab/OpticalLabTypographySpecimen.tsx` | Full-size Bricolage/Archivo/Arial Black comparison, with Bodoni Moda italic held constant |
| `apps/web/app/{%5Fvisual,_visual}/optical-lab/type-specimen/page.tsx` | No-index isolated specimen route and test-friendly re-export |
| `apps/web/components/optical-lab/OpticalLabPage.tsx` | Three-panel Lab shell and the single semantic title |
| `apps/web/components/optical-lab/OpticalLabRenderer.tsx` | React policy, fresh-canvas lifecycle, first-frame publication and diagnostics |
| `apps/web/lib/optical-lab/layout.ts` | Pure DOM-to-GPU title, baseline and fixed-aperture geometry |
| `apps/web/lib/optical-lab/runtime-policy.ts` | Pure WebGL2/static capability and adaptive-quality decisions |
| `apps/web/lib/optical-lab/ogl/renderer.ts` | OGL renderer orchestration and public lifecycle contract |
| `apps/web/lib/optical-lab/ogl/glyph-pass.ts` | MSDF geometry, glyph mask and DOM layout parity |
| `apps/web/lib/optical-lab/ogl/particle-pass.ts` | Mask-derived GPGPU state, dissolution and rightward emission |
| `apps/web/lib/optical-lab/ogl/flow-pass.ts` | Low-resolution velocity flowmap and bounded recovery |
| `apps/web/lib/optical-lab/ogl/composite-pass.ts` | HDR targets, caustic-only bloom, tone mapping, micro-dispersion and grain |
| `apps/web/lib/optical-lab/ogl/resources.ts` | Per-context OGL/GL allocation ledger and deterministic disposal |
| `apps/web/lib/optical-lab/ogl/shaders/*.ts` | Named GLSL ES 3.00 programs; one file per pass |
| `apps/web/assets/optical-lab/fonts/` | Approved source TTFs, OFL notices, charset and SHA-256 manifest |
| `apps/web/public/optical-lab/atlas/` | Deterministic MSDF PNG and BMFont JSON assets |
| `apps/web/public/optical-lab/accepted-resting.png` | User-approved high-fidelity static fallback |
| `apps/web/scripts/generate-optical-atlas.mjs` | Pinned atlas generation, normalization and manifest verification |
| `apps/web/test/visual/promote-optical-lab-resting.mjs` | Promote only an approved 1672 × 941 resting capture |
| `apps/web/test/visual/optical-lab-reference-metrics.mjs` | Typography, five-region, perceptual and displacement measurements |
| `apps/web/test/visual/optical-lab-shots.mjs` | Browser matrix, full-size screenshots, lifecycle and cleanup assertions |
| `docs/decisions/ADR-009-optical-runtime-and-fonts.md` | OGL, atlas tool, font provenance and fallback decision record |

---

### Task 1: Approve the Full-Size Typography Contract

**Files:**
- Create: `apps/web/components/optical-lab/OpticalLabTypographySpecimen.tsx`
- Create: `apps/web/app/%5Fvisual/optical-lab/type-specimen/page.tsx`
- Create: `apps/web/app/_visual/optical-lab/type-specimen/page.tsx`
- Modify: `apps/web/app/_visual/optical-lab/optical-lab.module.css`
- Modify: `apps/web/test/optical-lab-contract.test.tsx`
- Create: `apps/web/test/visual/optical-lab-typography-gate.mjs`
- Create: `apps/web/test/visual/optical-lab-reference-metrics.mjs`

**Interfaces:**
- Produces three candidate frames named `bricolage`, `archivo` and
  `arial-black-reference`.
- Every frame exposes `data-optical-specimen`, `data-optical-science`,
  `data-optical-evolves`, `data-optical-baseline` and
  `data-optical-aperture="0.58"`.
- The specimen route is visual evidence only; it does not mount WebGL.

- [ ] **Step 1: Add the failing semantic and geometry contracts**

Add SSR assertions that every specimen has one selectable title and that the
Arial frame is explicitly marked `data-shipping-eligible="false"`. Add pure
metric tests for this fixture:

```js
const measured = measureTypography({
  viewport: { width: 1672, height: 941 },
  title: { left: 36.8, right: 1600.0, top: 337.0, bottom: 564.6 },
  science: { left: 36.8, right: 969.8 },
  evolves: { left: 969.8, right: 1600.0 },
  baselineY: 510.0,
});
assert.equal(measured.oneLine, true);
assert(Math.abs(measured.apertureX - .58) <= .005);
assert(measured.title.left >= .017 && measured.title.left <= .027);
assert(measured.title.right >= .952 && measured.title.right <= .962);
assert(measured.title.top >= .348 && measured.title.top <= .368);
assert(measured.title.bottom >= .59 && measured.title.bottom <= .61);
```

- [ ] **Step 2: Run the focused RED**

```powershell
npx pnpm@9.15.0 --filter @openscience/web test -- optical-lab-contract.test.tsx
node apps/web/test/visual/optical-lab-typography-gate.mjs
```

Expected: the component/route does not exist and the native-size word/baseline
measurements cannot be collected.

- [ ] **Step 3: Implement the typography-only specimen**

Render three 1672:941 frames with identical geometry. Use the existing
Bricolage variable at weight 850, Next's `Archivo` at weight 900, and local
platform Arial Black only as the non-shipping silhouette control. Hold the
existing Bodoni Moda italic at weight 700 constant. Size the word allocation to
`55.8vw` and `37.7vw`, set the title bounds to the approved percentages, and
place a visible specimen guide at 58% outside the selectable `h1`.

- [ ] **Step 4: Capture and verify the full-size candidates**

Run a production build and gate:

```powershell
npx pnpm@9.15.0 --filter @openscience/web build
$env:OPTICAL_LAB_SERVER_MODE='start'; node apps/web/test/visual/optical-lab-typography-gate.mjs
```

Expected: exit 0 and these native-size files:

```text
apps/web/test/visual/out/optical-lab/typography-bricolage.png
apps/web/test/visual/out/optical-lab/typography-archivo.png
apps/web/test/visual/out/optical-lab/typography-arial-black-reference.png
```

The gate asserts the title/word bounds, baseline, one-line layout, exact drag
selection and 58% transition. Inspect all three at original resolution.

- [ ] **Step 5: STOP for user typography approval**

Show the three candidates beside `target-reference.png`. Record the chosen
shipping grotesk and any approved tracking/weight adjustment in the Task report.
Do not begin Task 2 until the user explicitly approves one specimen. Arial Black
may guide geometry but cannot be selected for shipping.

- [ ] **Step 6: Commit the approved specimen**

```powershell
git add -- apps/web/components/optical-lab/OpticalLabTypographySpecimen.tsx apps/web/app/%5Fvisual/optical-lab/type-specimen/page.tsx apps/web/app/_visual/optical-lab/type-specimen/page.tsx apps/web/app/_visual/optical-lab/optical-lab.module.css apps/web/test/optical-lab-contract.test.tsx apps/web/test/visual/optical-lab-typography-gate.mjs apps/web/test/visual/optical-lab-reference-metrics.mjs
git commit -m "feat(web): approve optical typography specimen"
```

---

### Task 2: Pin OGL and Generate Reproducible MSDF Assets

**Files:**
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/web/assets/optical-lab/fonts/science-display.ttf`
- Create: `apps/web/assets/optical-lab/fonts/evolves-editorial.ttf`
- Create: `apps/web/assets/optical-lab/fonts/OFL-science.txt`
- Create: `apps/web/assets/optical-lab/fonts/OFL-evolves.txt`
- Create: `apps/web/assets/optical-lab/fonts/charset.txt`
- Create: `apps/web/assets/optical-lab/fonts/manifest.json`
- Create: `apps/web/scripts/generate-optical-atlas.mjs`
- Create: `apps/web/public/optical-lab/atlas/science-display.png`
- Create: `apps/web/public/optical-lab/atlas/science-display.json`
- Create: `apps/web/public/optical-lab/atlas/evolves-editorial.png`
- Create: `apps/web/public/optical-lab/atlas/evolves-editorial.json`
- Create: `apps/web/test/optical-lab-atlas.test.ts`
- Modify: `docs/decisions/ADR-009-optical-runtime-and-fonts.md`

**Interfaces:**
- Runtime dependency: `ogl@1.0.11`.
- Development dependency: `msdf-bmfont-xml@2.8.0`.
- Adds `atlas:optical` script that generates only the characters
  `" Sciencevolves."` at size 96, distance range 8, padding 4, JSON output,
  power-of-two smart-sized PNGs.
- `manifest.json` records font family, upstream path, license, axis settings,
  source SHA-256 and generated-file SHA-256.

- [ ] **Step 1: Write the failing atlas integrity test**

```ts
it('ships deterministic licensed atlases for the accepted words', () => {
  expect(manifest.charset).toBe(' Sciencevolves.');
  expect(manifest.generator).toEqual({ name: 'msdf-bmfont-xml', version: '2.8.0' });
  expect(Object.keys(science.chars).length).toBeGreaterThanOrEqual(8);
  expect(Object.keys(evolves.chars).length).toBeGreaterThanOrEqual(8);
  expect(verifyManifestHashes(manifest)).toBe(true);
});
```

- [ ] **Step 2: Run RED**

```powershell
npx pnpm@9.15.0 --filter @openscience/web test -- optical-lab-atlas.test.ts
```

Expected: FAIL because no manifest, source fonts or atlas outputs exist.

- [ ] **Step 3: Add pinned tools, approved fonts and licenses**

Install through the workspace:

```powershell
npx pnpm@9.15.0 --filter @openscience/web add ogl@1.0.11
npx pnpm@9.15.0 --filter @openscience/web add -D msdf-bmfont-xml@2.8.0
```

Vendor the exact Google Fonts upstream TTF selected in Task 1 as
`science-display.ttf` and the Bodoni Moda italic TTF as
`evolves-editorial.ttf`. Copy each upstream OFL notice verbatim and record exact
source URLs and hashes in `manifest.json`. Do not use the transient files emitted
inside `.next` by `next/font`.

- [ ] **Step 4: Implement deterministic generation**

The script must delete no directories. It overwrites only the four named atlas
outputs after validating source paths and generator version, normalizes JSON key
order, rejects additional texture pages, then recomputes manifest output hashes.
Run it twice and assert `git diff --exit-code` after the second run.

```powershell
npx pnpm@9.15.0 --filter @openscience/web atlas:optical
npx pnpm@9.15.0 --filter @openscience/web atlas:optical
git diff --exit-code -- apps/web/public/optical-lab/atlas apps/web/assets/optical-lab/fonts/manifest.json
```

- [ ] **Step 5: Verify dependency, license and asset budgets**

Atlas PNG + JSON total must be at most 512 KiB. OGL must be present only in the
isolated Lab client graph. Amend ADR-009 from dependency-free native WebGL to the
approved OGL WebGL2 Lab exception, including Unlicense, MIT atlas-tool license,
OFL font provenance and the client-side/ECS boundary.

- [ ] **Step 6: Run GREEN and commit**

```powershell
npx pnpm@9.15.0 --filter @openscience/web test -- optical-lab-atlas.test.ts
npx pnpm@9.15.0 --filter @openscience/web typecheck
git add -- apps/web/package.json pnpm-lock.yaml apps/web/assets/optical-lab/fonts apps/web/scripts/generate-optical-atlas.mjs apps/web/public/optical-lab/atlas apps/web/test/optical-lab-atlas.test.ts docs/decisions/ADR-009-optical-runtime-and-fonts.md
git commit -m "build(web): pin optical msdf assets"
```

---

### Task 3: Replace Candidate B with the WebGL2 OGL Runtime Shell

**Files:**
- Create: `apps/web/lib/optical-lab/layout.ts`
- Create: `apps/web/lib/optical-lab/runtime-policy.ts`
- Create: `apps/web/lib/optical-lab/ogl/renderer.ts`
- Create: `apps/web/lib/optical-lab/ogl/resources.ts`
- Modify: `apps/web/components/optical-lab/OpticalLabRenderer.tsx`
- Modify: `apps/web/components/optical-lab/OpticalLabPage.tsx`
- Modify: `apps/web/app/_visual/optical-lab/optical-lab.module.css`
- Test: `apps/web/test/optical-lab-model.test.ts`
- Test: `apps/web/test/optical-lab-contract.test.tsx`
- Modify: `apps/web/test/visual/optical-lab-shots.mjs`

**Interfaces:**
- `chooseOpticalRuntime()` returns only `webgl2-full`, `static-fallback` or
  `dom-only`; WebGL1 never initializes the dynamic renderer.
- `measureOpticalLayout(stage, science, evolves)` returns CSS-pixel word bounds,
  baseline, viewport and fixed `apertureX = viewport.width * .58`.
- `createOpticalOglRenderer(canvas, stage, onSnapshot)` returns
  `{ resize, dispose }` and reports first-complete-frame, quality tier, frame
  count, resource counts and stable bounds.

- [ ] **Step 1: Change the policy and lifecycle tests to RED**

Assert WebGL2 normal motion selects `webgl2-full`; forced WebGL1, reduced motion
and initialization failure select `static-fallback`; no canvas selects
`dom-only`. Change browser expectations so forced WebGL1 mounts no canvas and no
RAF. Keep exact selection, fresh-canvas restoration and resource cleanup tests.

- [ ] **Step 2: Run focused RED**

```powershell
npx pnpm@9.15.0 --filter @openscience/web test -- optical-lab-model.test.ts optical-lab-contract.test.tsx
```

Expected: FAIL because current policy selects WebGL1 and the OGL runtime contract
does not exist.

- [ ] **Step 3: Implement the pure policy and layout authority**

Move capability selection out of `model.ts`. Read actual DOM rectangles only
after `document.fonts.ready`; reject a GPU publication if title bounds differ by
more than 1 CSS px from the accepted DOM specimen. Preserve DOM ink until the
new renderer reports a complete glyph/particle/composite frame.

- [ ] **Step 4: Implement the OGL shell and transactional cleanup**

Construct `new Renderer({ canvas, webgl: 2, alpha: true, antialias: false,
dpr: Math.min(devicePixelRatio, 2) })`. Register every OGL-backed GL program,
buffer, texture, framebuffer and renderbuffer in a per-context ledger. On init
failure, context loss, policy change or unmount, stop RAF, dispose the ledger,
remove the canvas and expose static/DOM ink. Restoration must use a new canvas
and a new WebGL2 context.

- [ ] **Step 5: Run lifecycle GREEN and commit**

```powershell
npx pnpm@9.15.0 --filter @openscience/web test -- optical-lab-model.test.ts optical-lab-contract.test.tsx
npx pnpm@9.15.0 --filter @openscience/web typecheck
git add -- apps/web/lib/optical-lab/layout.ts apps/web/lib/optical-lab/runtime-policy.ts apps/web/lib/optical-lab/ogl/renderer.ts apps/web/lib/optical-lab/ogl/resources.ts apps/web/components/optical-lab/OpticalLabRenderer.tsx apps/web/components/optical-lab/OpticalLabPage.tsx apps/web/app/_visual/optical-lab/optical-lab.module.css apps/web/test/optical-lab-model.test.ts apps/web/test/optical-lab-contract.test.tsx apps/web/test/visual/optical-lab-shots.mjs
git commit -m "refactor(web): establish optical ogl runtime"
```

Do not delete `webgl-renderer.ts` in this task. Leave it unreferenced until the
new visual and lifecycle gates pass; removal requires separate explicit user
approval because project policy forbids deleting files by default.

---

### Task 4: Render MSDF Typography with Exact DOM Parity

**Files:**
- Create: `apps/web/lib/optical-lab/ogl/glyph-pass.ts`
- Create: `apps/web/lib/optical-lab/ogl/shaders/fullscreen.ts`
- Create: `apps/web/lib/optical-lab/ogl/shaders/glyph.ts`
- Modify: `apps/web/lib/optical-lab/ogl/renderer.ts`
- Modify: `apps/web/test/visual/optical-lab-reference-metrics.mjs`
- Modify: `apps/web/test/visual/optical-lab-shots.mjs`
- Test: `apps/web/test/visual/optical-lab-visual-metrics.test.mjs`

**Interfaces:**
- `createGlyphPass(gl, layout, atlases)` exposes `maskTexture`, `colorTexture`,
  `resize(layout)`, `render(flowTexture)` and `dispose()`.
- The pass renders `Science` and `evolves.` as one visual line but retains the
  approved font transition exactly at 58%.

- [ ] **Step 1: Add reference-relative MSDF RED**

Add metrics for title/word mask bounds, baseline, seam position, occupied-column
continuity and DOM/MSDF edge overlap. Browser assertions at 1672 × 941:

```js
assert(within(candidate.title.left, target.title.left, .01));
assert(within(candidate.title.right, target.title.right, .01));
assert(within(candidate.baseline, .542, .008));
assert(within(candidate.seamX, .58, .005));
assert(candidate.oneLine);
assert(candidate.edgeOverlapWithDom >= .90);
```

Expected RED: the Candidate B procedural glyph shader cannot match the accepted
word geometry or expose an MSDF mask.

- [ ] **Step 2: Build atlas-backed geometry**

Parse the two BMFont JSON files, create OGL `Text` buffers, and render through a
derivative-based median MSDF shader into a linear mask target. Scale and place
each word from `layout.ts` CSS-pixel bounds rather than independent scene units.
Keep the period vermilion in the color pass and part of the same selectable DOM
title.

- [ ] **Step 3: Prove first-frame and resize parity**

Test desktop 1672 × 941, desktop 1440 × 900 and mobile 390 × 844. The title may
crop optically on mobile but remains one line, the seam remains 58%, and context
loss does not move DOM bounds. Publish `data-optical-ink="gpu"` only after the
complete MSDF color and mask targets have rendered once.

- [ ] **Step 4: Run GREEN and commit**

```powershell
npx pnpm@9.15.0 --filter @openscience/web test -- optical-lab-contract.test.tsx optical-lab-visual-metrics.test.mjs
npx pnpm@9.15.0 --filter @openscience/web typecheck
npx pnpm@9.15.0 --filter @openscience/web build
$env:OPTICAL_LAB_SERVER_MODE='start'; npx pnpm@9.15.0 --filter @openscience/web shots:optical-lab
git add -- apps/web/lib/optical-lab/ogl/glyph-pass.ts apps/web/lib/optical-lab/ogl/shaders/fullscreen.ts apps/web/lib/optical-lab/ogl/shaders/glyph.ts apps/web/lib/optical-lab/ogl/renderer.ts apps/web/test/visual/optical-lab-reference-metrics.mjs apps/web/test/visual/optical-lab-shots.mjs apps/web/test/visual/optical-lab-visual-metrics.test.mjs
git commit -m "feat(web): render approved optical msdf title"
```

---

### Task 5: Build the Five-Layer Resting Optical Material

**Files:**
- Create: `apps/web/lib/optical-lab/ogl/particle-pass.ts`
- Create: `apps/web/lib/optical-lab/ogl/composite-pass.ts`
- Create: `apps/web/lib/optical-lab/ogl/shaders/particle-update.ts`
- Create: `apps/web/lib/optical-lab/ogl/shaders/particle-render.ts`
- Create: `apps/web/lib/optical-lab/ogl/shaders/composite.ts`
- Modify: `apps/web/lib/optical-lab/ogl/renderer.ts`
- Modify: `apps/web/test/visual/optical-lab-reference-metrics.mjs`
- Modify: `apps/web/test/visual/optical-lab-visual-metrics.test.mjs`
- Modify: `apps/web/test/visual/optical-lab-shots.mjs`

**Interfaces:**
- `createParticlePass()` seeds position, velocity, luminance and size from the
  glyph mask and fixed slit field; no pointer uniforms exist yet.
- `createCompositePass()` accepts glyph, particle and caustic textures and emits
  the final linear-to-display frame.
- Diagnostics expose five named pass energies and `apertureX = .58`.

- [ ] **Step 1: Add the five-region visual RED**

Extend synthetic fixtures so a valid reference-like field passes and a ring,
symmetric fan, mechanical line, uniform-dot curtain and duplicate title fail.
At native size assert:

```js
assert(candidate.intactGlyphContinuity >= .88);
assert(candidate.dissolutionTransfer >= .55);
assert(candidate.curtainCoverage >= target.curtainCoverage * .75);
assert(candidate.causticWidth >= .04 && candidate.causticWidth <= .06);
assert(candidate.causticCenterError <= .005);
assert(candidate.rightwardEnergyRatio >= 1.25);
assert(candidate.leftwardEmissionRatio <= .12);
assert(candidate.maskedStructuralSimilarity >= .62);
```

Expected RED: an MSDF-only title has no dissolution, full-height curtain,
caustic or rightward emission.

- [ ] **Step 2: Implement deterministic mask-derived GPGPU particles**

Use OGL `GPGPU` with a power-of-two float state texture. Seed particles from
glyph-mask texels with a committed integer seed. Transfer alpha gradually in a
narrow upstream band; distribute the curtain vertically with center-weighted
density; apply only a fixed positive-x slit velocity. Render hierarchical point
sizes and luminance, not uniform white dots.

- [ ] **Step 3: Implement restrained HDR composition**

Use RGBA16F when supported and RGBA8 inside the full WebGL2 path when not.
Composite intact glyph, dissolution, curtain, a 4–6vw warm-white caustic and
right-only emission. Blur only the caustic/high-energy texture at quarter
resolution. Limit spectral separation to the seam neighborhood and finish with
subtle monochrome grain. Full-frame bloom, duplicate ink and large RGB offsets
remain prohibited.

- [ ] **Step 4: Run the production browser matrix**

```powershell
npx pnpm@9.15.0 --filter @openscience/web test -- optical-lab-visual-metrics.test.mjs
npx pnpm@9.15.0 --filter @openscience/web build
$env:OPTICAL_LAB_SERVER_MODE='start'; npx pnpm@9.15.0 --filter @openscience/web shots:optical-lab
```

Expected: all five region assertions, perceptual score, forbidden probes,
first-frame publication, context restoration and cleanup pass. Inspect
`desktop-resting.png` at original size; do not use a resized preview for review.

- [ ] **Step 5: STOP for user resting-material approval**

Show `target-reference.png` and `desktop-resting.png` side by side at 1672 × 941.
The user must explicitly approve typography, dissolution, curtain, caustic and
rightward material together. If rejected, iterate only Task 5 metrics/shaders;
do not add pointer motion to conceal a weak resting frame.

- [ ] **Step 6: Commit the accepted resting renderer**

```powershell
git add -- apps/web/lib/optical-lab/ogl/particle-pass.ts apps/web/lib/optical-lab/ogl/composite-pass.ts apps/web/lib/optical-lab/ogl/shaders/particle-update.ts apps/web/lib/optical-lab/ogl/shaders/particle-render.ts apps/web/lib/optical-lab/ogl/shaders/composite.ts apps/web/lib/optical-lab/ogl/renderer.ts apps/web/test/visual/optical-lab-reference-metrics.mjs apps/web/test/visual/optical-lab-visual-metrics.test.mjs apps/web/test/visual/optical-lab-shots.mjs
git commit -m "feat(web): compose optical resting field"
```

---

### Task 6: Add Bounded Flowmap Pointer Follow

**Files:**
- Create: `apps/web/lib/optical-lab/ogl/flow-pass.ts`
- Create: `apps/web/lib/optical-lab/ogl/shaders/flow.ts`
- Modify: `apps/web/lib/optical-lab/ogl/glyph-pass.ts`
- Modify: `apps/web/lib/optical-lab/ogl/particle-pass.ts`
- Modify: `apps/web/lib/optical-lab/ogl/composite-pass.ts`
- Modify: `apps/web/lib/optical-lab/ogl/renderer.ts`
- Modify: `apps/web/lib/optical-lab/model.ts`
- Test: `apps/web/test/optical-lab-model.test.ts`
- Modify: `apps/web/test/visual/optical-lab-shots.mjs`

**Interfaces:**
- `createFlowPass()` owns a 96 × 54 ping-pong velocity texture and accepts
  normalized position plus capped velocity.
- Pure `stepOpticalResponse()` reports whole-line offset, local peak, caustic
  gain and recovery state for deterministic tests.

- [ ] **Step 1: Write response-envelope RED tests**

Test diagonal motion, pointer left/aperture/right, rapid reversal and recovery:

```ts
expect(sampleAt120.wholeLinePx).toBeGreaterThanOrEqual(1);
expect(sampleAt120.wholeLinePx).toBeLessThanOrEqual(2);
expect(sampleAt120.localPeakPx).toBeLessThanOrEqual(4);
expect(sampleAt120.causticGain).toBeLessThanOrEqual(.08);
expect(samples.map((value) => value.follow)).toBeMonotonic();
expect(sampleAt650).toEqual(RESTING_OPTICAL_RESPONSE);
```

Browser RED must use real pointer events and honest elapsed timestamps; it may
hold rendering for deterministic capture but cannot falsify pointer age.

- [ ] **Step 2: Implement low-resolution velocity flow**

Write capped pointer velocity into the OGL flowmap and displace the full glyph
by 1–2 CSS px. Apply a separate local refraction sampled from the flowmap and
radially clamp the combined CSS-pixel vector to 4 px. Deflect particles along
their existing positive-x field and cap caustic gain at 1.08. Exponentially
approach target over 120 ms and force exact zero at 650 ms without spring terms.

- [ ] **Step 3: Prove static completeness and invariants**

Capture resting, left, aperture, right and recovered frames. Assert zero seam
drift, bounded image-space displacement, non-identical active frames, monotonic
model samples, exact recovered equality and unchanged resting five-region
metrics. Retain ring/fan/line/ghost probes.

- [ ] **Step 4: Run GREEN and commit**

```powershell
npx pnpm@9.15.0 --filter @openscience/web test -- optical-lab-model.test.ts optical-lab-visual-metrics.test.mjs
npx pnpm@9.15.0 --filter @openscience/web build
$env:OPTICAL_LAB_SERVER_MODE='start'; npx pnpm@9.15.0 --filter @openscience/web shots:optical-lab
git add -- apps/web/lib/optical-lab/ogl/flow-pass.ts apps/web/lib/optical-lab/ogl/shaders/flow.ts apps/web/lib/optical-lab/ogl/glyph-pass.ts apps/web/lib/optical-lab/ogl/particle-pass.ts apps/web/lib/optical-lab/ogl/composite-pass.ts apps/web/lib/optical-lab/ogl/renderer.ts apps/web/lib/optical-lab/model.ts apps/web/test/optical-lab-model.test.ts apps/web/test/visual/optical-lab-shots.mjs
git commit -m "feat(web): add restrained optical flow response"
```

---

### Task 7: Promote the Static Fallback and Enforce Runtime Budgets

**Files:**
- Create: `apps/web/test/visual/promote-optical-lab-resting.mjs`
- Create: `apps/web/public/optical-lab/accepted-resting.png`
- Modify: `apps/web/components/optical-lab/OpticalLabPage.tsx`
- Modify: `apps/web/components/optical-lab/OpticalLabRenderer.tsx`
- Modify: `apps/web/app/_visual/optical-lab/optical-lab.module.css`
- Modify: `apps/web/lib/optical-lab/runtime-policy.ts`
- Test: `apps/web/test/optical-lab-contract.test.tsx`
- Modify: `apps/web/test/visual/optical-lab-shots.mjs`
- Create: `apps/web/test/optical-lab-runtime-budget.test.ts`

**Interfaces:**
- Promotion script accepts only the approved
  `out/optical-lab/desktop-resting.png`, verifies 1672 × 941, records its source
  SHA-256, and writes the one named public fallback.
- Adaptive tiers are `full`, `reduced-particles` and `reduced-bloom`; typography,
  seam and region topology never change.

- [ ] **Step 1: Add fallback and adaptation RED**

Assert forced WebGL1, reduced motion and WebGL2 init failure show the static
asset, exact title bounds, no canvas and no RAF. Assert two consecutive
two-second windows below 45 FPS reduce particle count first, then bloom target
resolution; recovery requires ten seconds above 55 FPS and never changes layout.

- [ ] **Step 2: Promote the accepted resting frame**

Run only after Task 5 user approval:

```powershell
node apps/web/test/visual/promote-optical-lab-resting.mjs --source apps/web/test/visual/out/optical-lab/desktop-resting.png
```

The committed PNG must be at most 2 MiB and remain decorative. Overlay the
semantic DOM title only for accessibility/selection; suppress its visible ink
when the static artwork has loaded, and restore DOM ink if the image fails.

- [ ] **Step 3: Add stable quality adaptation and bundle budgets**

Keep DPR at most 2. Particle reduction may not go below 55% of the accepted
full count; reduced bloom uses one-eighth rather than one-quarter resolution.
Enforce atlas assets at 512 KiB total, fallback at 2 MiB, and isolated Lab
first-load JavaScript growth at at most 45 KiB gzip over the pre-OGL baseline.
No OGL chunk may appear in the production `/` route manifest.

- [ ] **Step 4: Verify the complete fallback matrix and commit**

```powershell
npx pnpm@9.15.0 --filter @openscience/web test -- optical-lab-contract.test.tsx optical-lab-runtime-budget.test.ts
npx pnpm@9.15.0 --filter @openscience/web build
$env:OPTICAL_LAB_SERVER_MODE='start'; npx pnpm@9.15.0 --filter @openscience/web shots:optical-lab
git add -- apps/web/test/visual/promote-optical-lab-resting.mjs apps/web/public/optical-lab/accepted-resting.png apps/web/components/optical-lab/OpticalLabPage.tsx apps/web/components/optical-lab/OpticalLabRenderer.tsx apps/web/app/_visual/optical-lab/optical-lab.module.css apps/web/lib/optical-lab/runtime-policy.ts apps/web/test/optical-lab-contract.test.tsx apps/web/test/visual/optical-lab-shots.mjs apps/web/test/optical-lab-runtime-budget.test.ts
git commit -m "feat(web): ship accepted optical fallback"
```

---

### Task 8: Final Local Acceptance, Review and Documentation

**Files:**
- Modify: `docs/progress.md`
- Modify: `project_index.md`
- Modify: `docs/handoff/2026-08-11-optical-lab-task8-steps3-5-handoff.md`
- Create: `.superpowers/sdd/2026-08-11-optical-lab-high-fidelity-reconstruction/task-8-report.md` (ignored evidence ledger)

**Interfaces:**
- Produces a clean, reviewable local branch and a user decision package.
- Does not replace production `/` and does not deploy to ECS.

- [ ] **Step 1: Run fresh focused and full gates**

```powershell
npx pnpm@9.15.0 --filter @openscience/web test -- optical-lab-model.test.ts optical-lab-contract.test.tsx optical-lab-atlas.test.ts optical-lab-runtime-budget.test.ts optical-lab-visual-metrics.test.mjs
npx pnpm@9.15.0 --filter @openscience/web test
npx pnpm@9.15.0 --filter @openscience/web typecheck
npx pnpm@9.15.0 lint
npx pnpm@9.15.0 --filter @openscience/web build
$env:OPTICAL_LAB_SERVER_MODE='start'; npx pnpm@9.15.0 --filter @openscience/web shots:optical-lab
npx pnpm@9.15.0 docs:lint
npx pnpm@9.15.0 audit:docs-sync
git diff --check
```

Expected: every command exits 0. Confirm port 3062 has no listener before and
after the production-start gate.

- [ ] **Step 2: Inspect original-resolution evidence**

Inspect target, desktop resting, left/aperture/right at 120 ms, recovered,
WebGL1 static, reduced-motion static, init-failure static and restored-context
captures. Record exact typography bounds, five-region metrics, perceptual score,
displacement, caustic gain, FPS/CPU/GPU diagnostics and resource create/delete
counts in the Task report.

- [ ] **Step 3: Record real-device performance**

On one physical desktop and one physical mobile browser, record a 15-second
resting interval and a 15-second pointer/touch interval. Report median and p95
frame time, selected quality tier and dropped-frame count. Treat server or
SwiftShader measurements as non-GPU evidence only.

- [ ] **Step 4: Request independent code review**

Use `requesting-code-review`, then address every Critical and Important finding
with a fresh RED/GREEN cycle. Review dependency isolation, shader numerical
stability, semantic selection, context-loss recovery, exact resource cleanup,
fallback fidelity and test honesty.

- [ ] **Step 5: Synchronize project documents**

Prepend the result to `docs/progress.md`, update every changed/created path in
`project_index.md`, and update the existing Optical Lab handoff with commits,
commands, metrics, user approvals, remaining risks and the explicit statement
that production `/` and ECS were not changed.

- [ ] **Step 6: Commit documentation**

```powershell
git add -- docs/progress.md project_index.md docs/handoff/2026-08-11-optical-lab-task8-steps3-5-handoff.md
git commit -m "docs: record optical reconstruction acceptance"
git status --short
```

- [ ] **Step 7: STOP for final user acceptance**

Show the full-size reference and final candidate plus the static fallback and
subtle active frame. Ask the user to accept, iterate or reject. Even acceptance
does not authorize replacing the production homepage or deploying to ECS; those
remain separate tasks requiring explicit approval.

## Plan Self-Review Checklist

- [ ] Every requirement in the approved design maps to a task and a measurable
  gate.
- [ ] Typography approval blocks renderer material work; resting-material
  approval blocks interaction and fallback promotion.
- [ ] All new interfaces have named producers and consumers.
- [ ] No step contains unresolved markers, substitute assets, vague analogy
  instructions or unlicensed commercial material.
- [ ] WebGL1 is consistently static-only; no task reintroduces the Candidate B
  dynamic WebGL1 path.
- [ ] Production `/`, backend and deployment are consistently out of scope.
- [ ] Every production change begins with an intended RED and ends with exact
  verification commands and a focused commit.
