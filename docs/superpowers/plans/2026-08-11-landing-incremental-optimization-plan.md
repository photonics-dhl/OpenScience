# Landing Incremental Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the deployed Optical Editorial Landing without replacing existing product routes, APIs, data models, or workflows.

**Architecture:** Keep the current `Hero` → `OpticalHeadline` → `OpticalField` composition and the existing Open RO second screen. Change only typography roles, viewport composition, optical field parameters/rendering, CTA hierarchy, and Open RO interaction; reuse the current Playwright release gate and ECS deployment scripts.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, Tailwind CSS, Canvas 2D, SVG filters, Vitest, Playwright, Docker Compose on ECS.

## Global Constraints

- Work in `E:/Miscellaneous/XGS/.worktrees/optical-editorial-v3` on `codex/optical-editorial-v3`.
- Preserve `/`, `/auth/login`, `/explore`, `/dashboard`, `/research-objects/new`, editor, public RO, version, collaboration, and Hermes behavior.
- Do not modify backend endpoints, database schema, storage, ingestion, or authentication contracts.
- Do not read or print `.env`; do not delete files.
- Keep one semantic `<h1>` and selectable DOM headline text.
- Desktop `>=1280px` uses one headline axis; mobile uses controlled two-line layout with no horizontal overflow.
- Keep the particle field; remove only the large cursor ring.
- Desktop optical radius is `180–220px`, displacement is `36–44px`, and recovery is about `650ms`.
- Mobile does not continuously follow touch; tap triggers one optical pulse.
- `prefers-reduced-motion` keeps a static optical field and no continuous interaction.
- Explore is the primary Hero action; Create is secondary; Sign in remains an independent header action.
- Validate at `390x844`, `1440x900`, and `1920x1080`, plus reduced motion.
- Deploy to ECS only after local gates pass; run server backup before the production write.

---

### Task 1: Lock the Incremental Landing Contract

**Files:**
- Modify: `apps/web/test/landing-page.test.tsx`
- Modify: `apps/web/test/optical-field.test.ts`
- Modify: `apps/web/test/visual/shots.mjs`

**Interfaces:**
- Consumes: existing `OpticalHeadline`, `OpticalField`, `sampleOpticalField`, and Landing DOM markers.
- Produces: failing tests for CTA priority, explicit Latin/CJK fonts, no metadata legend/cursor ring, desktop single-axis layout, mobile pulse behavior, and the approved field envelope.

- [ ] **Step 1: Add failing Landing structure assertions**

Add to `landing-page.test.tsx`:

```tsx
it('keeps the optimized hero hierarchy without fabricated metadata', async () => {
  const markup = await renderLandingPage();
  expect(markup).toContain('data-hero-action="primary"');
  expect(markup).toContain('data-hero-action="secondary"');
  expect(markup.indexOf('href="/explore"')).toBeLessThan(markup.indexOf('href="/research-objects/new"'));
  expect(markup).not.toContain('data-hero-metadata-legend');
  expect(markup).not.toContain('optical-cursor-ring');
  expect(markup).toContain('font-editorial-latin');
  expect(markup).toContain('font-editorial-cjk');
});
```

- [ ] **Step 2: Add failing field-model assertions**

Replace the old radius/displacement/recovery expectations in `optical-field.test.ts` with:

```ts
it('stays within the optimized desktop optical envelope', () => {
  const sample = sampleOpticalField(
    { x: 720, y: 450, lastActiveAt: 400, pressed: false },
    { width: 1440, height: 900, dpr: 1 },
    400,
  );
  expect(sample.radius).toBeGreaterThanOrEqual(180);
  expect(sample.radius).toBeLessThanOrEqual(220);
  expect(sample.displacement).toBeGreaterThanOrEqual(36);
  expect(sample.displacement).toBeLessThanOrEqual(44);
});

it('returns to the aperture in the 650ms recovery window', () => {
  const pointer = { x: 120, y: 100, lastActiveAt: 1_000, pressed: false };
  const viewport = { width: 1_000, height: 600, dpr: 1 };
  expect(sampleOpticalField(pointer, viewport, 1_000).origin).toEqual({ x: 120, y: 100 });
  expect(sampleOpticalField(pointer, viewport, 1_650).origin).toEqual({ x: 500, y: 252 });
});
```

- [ ] **Step 3: Add browser assertions for typography and composition**

In `shots.mjs`, after fonts are ready, assert:

```js
const headline = page.locator('[data-optical-text-base="true"]');
const evolves = page.locator('[data-optical-evolves="true"]').first();
const fontFamily = await evolves.evaluate((node) => getComputedStyle(node).fontFamily);
assert.match(fontFamily, /Bodoni|editorial/i, 'evolves must use the Latin editorial face');
assert.equal(await page.locator('.optical-cursor-ring').count(), 0, 'large cursor ring must be removed');
if (testCase.width >= 1280) {
  assert.equal(await headline.getAttribute('data-headline-layout'), 'single-axis');
}
```

- [ ] **Step 4: Run the focused tests and confirm RED**

Run:

```bash
npx pnpm@9.15.0 --filter @openscience/web test -- landing-page.test.tsx optical-field.test.ts
```

Expected: FAIL on missing action/layout/font markers and old optical envelopes.

- [ ] **Step 5: Commit the contract tests**

```bash
git add apps/web/test/landing-page.test.tsx apps/web/test/optical-field.test.ts apps/web/test/visual/shots.mjs
git commit -m "test(web): lock landing optimization contract"
```

---

### Task 2: Correct Typography and Hero Composition

**Files:**
- Modify: `apps/web/components/brand/OpticalHeadline.tsx`
- Modify: `apps/web/components/landing/Hero.tsx`
- Modify: `apps/web/components/landing/SiteHeader.tsx`
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Consumes: existing i18n keys and `OpticalField` mount.
- Produces: one semantic headline with explicit Latin/CJK font roles, a desktop single axis, an Explore-primary CTA layout, and no fabricated metadata legend.

- [ ] **Step 1: Add explicit font-role utilities without changing other pages**

Append after the existing language-aware font rules in `globals.css`:

```css
.font-editorial-latin {
  font-family: var(--font-editorial-serif), "Times New Roman", serif;
}

.font-editorial-cjk {
  font-family: var(--font-cjk-serif), "Songti SC", serif;
}
```

- [ ] **Step 2: Convert the headline to a controlled responsive axis**

In `OpticalHeadline.tsx`, keep one `<h1>` and use the same spans for the decorative duplicate:

```tsx
const headlineLines = (includeMarker: boolean) => (
  <span className="os-optical-headline-axis" data-headline-layout="single-axis">
    <span className="os-optical-science font-display">Science</span>
    <span className="os-optical-evolves font-editorial-latin" data-optical-evolves="true" data-optical-glyph-safe-zone="true">
      evolves<span className="text-os-vermilion" {...(includeMarker ? { 'data-vermilion-marker': 'true' } : {})}>.</span>
    </span>
  </span>
);
```

Use `font-editorial-cjk` on `科学，持续演化。` and delete the `.optical-cursor-ring` element.

- [ ] **Step 3: Add stable headline dimensions and responsive variants**

Add to `globals.css`:

```css
.os-optical-headline-axis {
  display: block;
  line-height: .84;
}
.os-optical-science,
.os-optical-evolves { display: block; letter-spacing: 0; }
.os-optical-science { font-size: clamp(4.7rem, 13.5vw, 13rem); font-weight: 650; }
.os-optical-evolves { margin-left: 14vw; padding-bottom: .13em; font-size: clamp(5.2rem, 15vw, 14rem); font-style: italic; font-weight: 440; }
@media (min-width: 1280px) {
  .os-optical-headline-axis { display: flex; align-items: baseline; white-space: nowrap; }
  .os-optical-science { letter-spacing: 0; }
  .os-optical-evolves { margin-left: -.045em; letter-spacing: 0; }
}
```

Do not use negative global letter-spacing; rely on the display fonts and explicit overlap only.

- [ ] **Step 4: Recompose Hero without changing destinations**

In `Hero.tsx`:

- keep the kicker/context rule;
- keep `OpticalHeadline` as the center stage;
- remove the metadata `<dl>`;
- render Explore first with `data-hero-action="primary"` and vermilion emphasis;
- render Create second with `data-hero-action="secondary"`;
- retain `/explore` and `/research-objects/new` destinations;
- add a subtle `href="#open-ro"` scroll cue rather than another card or data block.

Primary action markup:

```tsx
<a
  data-hero-action="primary"
  href="/explore"
  className="inline-flex min-h-12 items-center justify-between gap-8 rounded-panel bg-os-vermilion px-5 font-semibold text-os-black-0 transition-transform duration-(--motion-focus) active:translate-y-px motion-reduce:transform-none"
>
  {t('hero.ctaExplore')} <span aria-hidden="true">→</span>
</a>
```

- [ ] **Step 5: Preserve independent login navigation**

Keep `SiteHeader` destinations unchanged. Order navigation as Explore, Create, Sign in and keep Sign in visually independent with its border treatment.

- [ ] **Step 6: Run focused tests and typecheck**

```bash
npx pnpm@9.15.0 --filter @openscience/web test -- landing-page.test.tsx
npx pnpm@9.15.0 --filter @openscience/web typecheck
```

Expected: Landing tests PASS and TypeScript exits 0.

- [ ] **Step 7: Commit the composition**

```bash
git add apps/web/components/brand/OpticalHeadline.tsx apps/web/components/landing/Hero.tsx apps/web/components/landing/SiteHeader.tsx apps/web/app/globals.css
git commit -m "feat(web): refine landing optical composition"
```

---

### Task 3: Upgrade the Existing Optical Field

**Files:**
- Modify: `apps/web/lib/optical-field/field-model.ts`
- Modify: `apps/web/lib/optical-field/canvas-renderer.ts`
- Modify: `apps/web/components/brand/OpticalField.tsx`
- Modify: `apps/web/app/globals.css`
- Test: `apps/web/test/optical-field.test.ts`

**Interfaces:**
- Consumes: `OpticalInteraction`, `OpticalViewport`, `sampleOpticalField`, and CSS custom properties on the headline stage.
- Produces: a two-density particle field, `650ms` recovery, stage-local desktop tracking, tap-only mobile pulse, and static reduced-motion rendering.

- [ ] **Step 1: Extend the sample model with explicit layer density**

Add to `OpticalSample`:

```ts
ambientSpacing: number;
coreSpacing: number;
```

Return these values from `sampleOpticalField`:

```ts
const recovery = pointer ? clamp((now - pointer.lastActiveAt) / 650, 0, 1) : 1;
return {
  ambientSpacing: mobile ? 32 : 26,
  coreSpacing: mobile ? 10 : 6,
  aperture: { x: viewport.width * 0.5, y: viewport.height * 0.46 },
  density: mobile ? 0.3 : clamp(viewport.width / 1_440, 0.62, 1),
  displacement: mobile ? 17 : 40 + Math.sin(phase) * 4,
  evidence: pointer?.pressed ? 1 : Math.max(0, 1 - recovery) * 0.9,
  origin,
  phase,
  radius: mobile ? clamp(viewport.width * 0.27, 90, 115) : clamp(viewport.width * 0.145, 180, 220),
};
```

Use the same `0.46` aperture anchor for resting origin and diffraction geometry.

- [ ] **Step 2: Render ambient and optical-core layers separately**

Extract a local `renderParticleLayer` in `canvas-renderer.ts`:

```ts
function renderParticleLayer(
  context: CanvasRenderingContext2D,
  sample: OpticalSample,
  viewport: OpticalViewport,
  spacing: number,
  coreOnly: boolean,
) {
  for (let y = spacing / 2; y < viewport.height; y += spacing) {
    for (let x = spacing / 2; x < viewport.width; x += spacing) {
      const distance = Math.hypot(x - sample.origin.x, y - sample.origin.y);
      if (coreOnly && distance > sample.radius) continue;
      const influence = Math.max(0, 1 - distance / sample.radius);
      const strength = coreOnly ? sample.displacement : sample.displacement * .18;
      const offset = influence * influence * strength;
      context.beginPath();
      context.arc(x + offset, y, coreOnly ? .8 + influence * 1.8 : .55, 0, Math.PI * 2);
      context.fill();
    }
  }
}
```

Call it once for `ambientSpacing` and once for `coreSpacing`; retain the existing slit diffraction renderer and remove the circular outline that resembles a demo cursor.

- [ ] **Step 3: Scope pointer listeners to the headline stage**

In `OpticalField.tsx`, replace global move/down listeners with stage listeners. Detect coarse input once:

```ts
const coarsePointer = window.matchMedia('(pointer: coarse)');
const onPointerMove = (event: PointerEvent) => {
  if (!coarsePointer.matches) updatePointer(event);
};
const onPointerDown = (event: PointerEvent) => {
  updatePointer(event, true);
  if (coarsePointer.matches) window.setTimeout(releasePointer, 650);
};
```

Keep global `pointerup`, `pointercancel`, `blur`, visibility, resize, and intersection cleanup. Do not introduce React state updates per animation frame.

- [ ] **Step 4: Update CSS masking and remove cursor-ring rules**

Delete `.optical-cursor-ring` and `.optical-cursor-ring::before`. Keep the radial mask centered on `--os-optical-x/y`; reduced motion hides the distorted duplicate and renders the static Canvas once.

- [ ] **Step 5: Run model and browser-focused tests**

```bash
npx pnpm@9.15.0 --filter @openscience/web test -- optical-field.test.ts landing-page.test.tsx
npx pnpm@9.15.0 --filter @openscience/web typecheck
```

Expected: all focused tests PASS.

- [ ] **Step 6: Commit the interaction refinement**

```bash
git add apps/web/lib/optical-field/field-model.ts apps/web/lib/optical-field/canvas-renderer.ts apps/web/components/brand/OpticalField.tsx apps/web/app/globals.css apps/web/test/optical-field.test.ts
git commit -m "feat(web): deepen optical headline interaction"
```

---

### Task 4: Refine the Existing Open RO Second Screen

**Files:**
- Modify: `apps/web/components/landing/LatestResearch.tsx`
- Modify: `apps/web/messages/en.json`
- Modify: `apps/web/messages/zh.json`
- Modify: `apps/web/test/landing-page.test.tsx`

**Interfaces:**
- Consumes: existing `openRo.node1` through `openRo.node6` and `/explore` destination.
- Produces: a calmer `80–86svh` second screen with six keyboard-focusable evidence rows and concise descriptions.

- [ ] **Step 1: Add failing semantic and interaction assertions**

Add to the Open RO test:

```tsx
expect(markup.match(/data-sdf-node-summary=/g)).toHaveLength(6);
expect(markup.match(/tabindex="0"/g)?.length ?? 0).toBeGreaterThanOrEqual(6);
expect(markup).toContain('data-open-ro-density="calm"');
```

Run the Landing test and confirm RED.

- [ ] **Step 2: Add concise bilingual evidence descriptions**

Add `openRo.node1Summary` through `openRo.node6Summary` to both message files. Each summary must be one sentence and describe what the reader can inspect, not market the feature.

Use these English values:

```json
"node1Summary": "The question and scope the object claims to address.",
"node2Summary": "The central contribution separated from supporting evidence.",
"node3Summary": "The procedure, materials, and assumptions used to produce the result.",
"node4Summary": "The observations and outputs that support the stated conclusion.",
"node5Summary": "Known constraints, uncertainty, and claims the evidence does not support.",
"node6Summary": "The data, code, environment, and steps needed to reproduce the work."
```

Use these Chinese values:

```json
"node1Summary": "研究对象试图回答的问题、范围与边界。",
"node2Summary": "与支撑证据明确区分的核心贡献。",
"node3Summary": "产生结果所使用的步骤、材料与假设。",
"node4Summary": "支撑结论的观察、数据与输出。",
"node5Summary": "已知约束、不确定性和证据不能支持的主张。",
"node6Summary": "复现研究所需的数据、代码、环境与步骤。"
```

- [ ] **Step 3: Reduce headline repetition and enrich row feedback**

In `LatestResearch.tsx`:

- set the section to `min-h-[82svh]` and `data-open-ro-density="calm"`;
- cap `OPEN RO.` at `clamp(4.5rem,9vw,9.4rem)`;
- keep all six existing SDF nodes;
- add `tabIndex={0}` to each row;
- reveal the summary with opacity/translation on hover and `focus-within`;
- keep `/explore` as the only action destination;
- do not fetch or fabricate RO metrics.

Summary markup:

```tsx
<span data-sdf-node-summary="true" className="hidden max-w-sm text-sm leading-6 text-os-muted-paper opacity-0 transition-all group-hover:opacity-100 group-focus-within:opacity-100 md:block">
  {t(`openRo.node${index + 1}Summary`)}
</span>
```

- [ ] **Step 4: Run focused tests and typecheck**

```bash
npx pnpm@9.15.0 --filter @openscience/web test -- landing-page.test.tsx
npx pnpm@9.15.0 --filter @openscience/web typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit the second-screen refinement**

```bash
git add apps/web/components/landing/LatestResearch.tsx apps/web/messages/en.json apps/web/messages/zh.json apps/web/test/landing-page.test.tsx
git commit -m "feat(web): refine open ro landing anatomy"
```

---

### Task 5: Run the Full Local Product Gate

**Files:**
- Modify only if a test exposes a defect in Tasks 2–4.
- Generated screenshots remain under ignored `apps/web/test/visual/out/`.

**Interfaces:**
- Consumes: completed Landing implementation.
- Produces: local evidence that the optimization did not regress the existing product.

- [ ] **Step 1: Start the production-mode Web server on a free local port**

Build first, then start from `apps/web` with `PORT=3019` or the next free port. Do not reuse a listener owned by another process.

- [ ] **Step 2: Run visual screenshots**

```bash
VISUAL_BASE_URL=http://127.0.0.1:3019 node apps/web/test/visual/shots.mjs
```

Expected: `390x844`, `1440x900`, `1920x1080`, and reduced-motion cases pass with no runtime errors or horizontal overflow.

- [ ] **Step 3: Inspect the generated screenshots**

Inspect Hero and full-page Open RO screenshots. Reject the result if the headline clips, the aperture is detached from the word boundary, CTA text wraps incoherently, or the second screen competes with the Hero.

- [ ] **Step 4: Run the complete Web gate**

```bash
npx pnpm@9.15.0 --filter @openscience/web test
npx pnpm@9.15.0 --filter @openscience/web typecheck
npx pnpm@9.15.0 --filter @openscience/web build
npx pnpm@9.15.0 lint
```

Expected: all commands exit 0; existing auth, dashboard, intake, workspace, public, collection, and Hermes tests remain green.

- [ ] **Step 5: Commit any test-only corrections**

If no corrections were needed, do not create an empty commit. Otherwise stage only files changed to repair the Landing optimization and commit:

```bash
git commit -m "fix(web): close landing visual regressions"
```

---

### Task 6: Deploy and Verify on ECS

**Files:**
- Modify: `docs/progress.md`
- Modify: `docs/runbooks/deployment.md`
- Modify: `project_index.md` only if file registrations or status descriptions change.
- Modify: `docs/handoff/2026-08-11-optical-editorial-optimization-design-handoff.md`

**Interfaces:**
- Consumes: a clean, tested branch commit.
- Produces: deployed production Landing, rollback evidence, server/browser acceptance, and synchronized documentation.

- [ ] **Step 1: Run production preflight and backup**

From the project root, use the project scripts only:

```bash
infra/scripts/checkup.sh
infra/scripts/ssh-run.sh "cd /opt/openscience && infra/scripts/backup.sh --confirm --db"
```

Expected: preflight passes and remote output contains `BACKUP_OK`.

- [ ] **Step 2: Deploy the tested commit without database migration**

```bash
release_sha="$(git rev-parse HEAD)"
infra/scripts/deploy.sh --confirm --skip-migrate "$release_sha"
```

Expected: workspace build passes, Web/API/Worker restart, Nginx validation passes, and deploy completes.

- [ ] **Step 3: Probe real production routes**

From the server, require HTTP 200 for:

```text
/
/auth/login
/explore
/dashboard
/research-objects/new
```

Do not log credentials or tokens.

- [ ] **Step 4: Run production Chromium acceptance**

At `390x844`, `1440x900`, and `1920x1080`, verify:

- one semantic `<h1>`;
- no horizontal overflow;
- Explore primary and Create secondary destinations;
- independent Sign in destination;
- no metadata legend or cursor ring;
- desktop single-axis headline;
- pointer interpolation and `650ms` recovery;
- tap-only mobile pulse;
- reduced-motion static field;
- six Open RO rows and `/explore` action;
- no console/page errors.

- [ ] **Step 5: Synchronize docs and task status**

Prepend production evidence to `docs/progress.md`, update the deployment runbook with release SHA/backup/routes/browser cases, update the handoff, and mark the Landing optimization task complete in Task Master only after production acceptance.

- [ ] **Step 6: Run documentation and security gates**

```bash
npx pnpm@9.15.0 docs:lint
npx pnpm@9.15.0 audit:docs-sync
git diff --check
```

Scan the staged diff for secrets without printing `.env`; expected result is clean.

- [ ] **Step 7: Commit final acceptance documentation**

```bash
git add docs/progress.md docs/runbooks/deployment.md docs/handoff/2026-08-11-optical-editorial-optimization-design-handoff.md project_index.md .taskmaster/tasks/tasks.json
git commit -m "docs: record landing production optimization"
```

---

### Task 7: Replace the Rejected Pointer-Disk Model with a Fixed Glyph Diffraction Field

**Files:**
- Modify: `apps/web/lib/optical-field/field-model.ts`
- Modify: `apps/web/lib/optical-field/canvas-renderer.ts`
- Modify: `apps/web/components/brand/OpticalField.tsx`
- Modify: `apps/web/components/brand/OpticalHeadline.tsx`
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/test/optical-field.test.ts`
- Modify: `apps/web/test/visual/shots.mjs`

**Interfaces:**
- Consumes: the real DOM headline, loaded Bricolage/Bodoni fonts, fixed aperture coordinates, pointer energy, and reduced-motion state.
- Produces: a fixed-aperture field whose particles are sampled from headline glyph alpha; pointer input changes phase/intensity only; browser evidence includes active intermediate frames.

- [x] **Step 1: Write failing regression contracts**

Add tests proving that `origin.x === aperture.x` for every pointer position; the renderer has no full-field mouse-radius particle pass; the visual layer owns an offscreen glyph sampler; CSS contains no pointer-centered radial/ellipse mask; and the browser gate captures active left/slit/right frames at 60/150/300ms.

- [x] **Step 2: Run focused tests and record RED**

Run `npx pnpm@9.15.0 --filter @openscience/web test -- optical-field.test.ts landing-page.test.ts landing-motion-policy.test.ts`. Expected: failures identify the current moving origin, radial particle pass, SVG turbulence mask, and missing intermediate-frame captures.

- [x] **Step 3: Implement the fixed glyph field**

Render the exact headline fonts to an offscreen canvas after `document.fonts.ready`; sample non-transparent glyph pixels; map upstream samples toward the aperture with monotonic horizontal compression; render a narrow focal caustic and low-alpha downstream Fresnel envelope. Keep the semantic DOM headline readable and the canvas `aria-hidden`.

- [x] **Step 4: Restrict pointer input to modulation**

Keep the aperture and glyph map fixed. Convert pointer distance from the aperture into bounded energy/phase/vertical-bias values; never use pointer coordinates as a particle center or CSS mask origin. Coarse input remains a 650ms pulse and reduced motion renders a stable, noninteractive composition.

- [x] **Step 5: Replace random glyph tearing**

Remove the moving radial SVG masks and turbulence-led duplicate-text tear. Limit the visual reconstruction/color fringe to a narrow fixed band around the first part of `evolves`; preserve the original headline layout and the single accessible `h1`.

- [x] **Step 6: Verify GREEN and inspect active frames**

Run focused tests, Web typecheck, and production build. Capture 1440×900 active frames for pointer-left/slit/right at 60/150/300ms plus 1920×1080, 390×844, reduced-motion, and Open RO. Reject any circular boundary/hole, grey multi-letter tearing, spider-web fan, moving optical axis, or particles unrelated to glyph contours.

- [x] **Step 7: Commit, back up, deploy, and re-run the same production gate**

Commit the tested implementation, take the required ECS database backup, deploy from the isolated worktree without migration, then run the identical active-frame matrix against `https://openscience.428312321.xyz/`. Update progress, project index, handoff, and Task Master only after human-readable production evidence exists.

---

## Plan Self-Review

- Spec coverage: Hero hierarchy, explicit typography, particle field, mobile/reduced motion, Open RO, route preservation, server deployment, and documentation are each assigned to a task.
- Scope: no backend, schema, upload, auth, or Hermes runtime changes are included.
- Type consistency: Task 7 supersedes Task 3's rejected moving-origin/ambient-disk model; aperture coordinates remain fixed and pointer coordinates are consumed only as bounded modulation input.
- No placeholder implementation steps remain; deployment resolves the tested commit directly from `git rev-parse HEAD`.

---

### Task 8: Replace Canvas Guesswork with a Reference-Grounded Optical Lab

**Scope:** research and isolated visual comparison only; production Landing remains on `cd5be36` until the user selects a candidate.

- [x] **Step 1: Reopen the visual gate and establish the root cause**

Record that engineering acceptance did not equal visual acceptance. Trace the grey overlay and mechanical lines to the CPU Canvas `arc()` particle loop plus independently invented focal/Fresnel passes.

- [x] **Step 2: Inspect mature implementations and licenses**

Run the public demos and read the source of Accessible WebGL Text, Interactive Particles, Distorted Pixels, OGL Flowmap, Dreamy Particles, WebGPU/TSL Text Destruction and Blotter Text Distortion. Record adoption/rejection boundaries in the design spec.

- [ ] **Step 3: Write the Optical Lab contract and RED gates**

Define a non-production visual route that shows target crop, current production capture and candidate side by side. Gate continuous glyph readability, fixed aperture topology, no radial boundary, stable DOM bounds, reduced-motion fallback and independent pointer frames. Add client-only/SSR safety, WebGL2→WebGL1→DOM fallback, context-loss recovery and SwiftShader acceptance; no ECS GPU dependency is permitted.

- [ ] **Step 4: Build the lightweight GPU candidate**

Prototype continuous glyph texture displacement, fixed-slit signed field, OGL/native WebGL2 flow texture with dissipation, and sparse instanced edge particles. Do not modify the production Landing component.

- [ ] **Step 5: Measure instead of guessing**

Capture desktop/mobile/reduced frames and record added gzip chunk, FPS, CPU/GPU frame time, context-loss fallback and renderer cleanup. Compare against current Canvas production and the reference crop.

- [ ] **Step 6: User visual selection gate**

Expose the isolated lab for user review. Only an explicitly selected candidate may receive a separate production replacement plan, TDD implementation and ECS deployment.
