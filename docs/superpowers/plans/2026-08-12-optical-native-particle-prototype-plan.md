# Optical Native Particle Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a no-index Three.js prototype that renders `Science evolves.` from one deterministic font-geometry contract as a regular particle grid with a curved central field, independent vertical curtain, TouchTexture interaction and restrained local post-processing.

**Architecture:** A Node-only `opentype.js` generator emits SVG paths, exact metrics and stable grid samples from committed fonts. A route-scoped imperative Three.js runtime consumes those assets, owns all renderer/composer resources, and preserves semantic DOM/SVG until a complete WebGL2 frame exists. Production Hero and the OGL Lab remain separate import graphs.

**Tech Stack:** Next.js 14.2.35, React 18.3.1, TypeScript, Three.js 0.185.1, postprocessing 6.39.4, opentype.js 2.0.0 (development only), Vitest and Playwright.

## Global Constraints

- Work only in `E:/Miscellaneous/XGS/.worktrees/optical-native-prototype` on `codex/optical-native-prototype`.
- Never edit or import from production `Hero.tsx`, `OpticalHeadline.tsx` or production Optical Field.
- Preserve the dirty `.worktrees/optical-editorial-v3`; do not reset, clean or copy its uncommitted Task 5 files.
- Do not read or print `.env`; repository deployment scripts may consume it internally.
- Do not delete files without explicit user approval.
- Runtime pins are exactly `three@0.185.1` and `postprocessing@6.39.4`; `opentype.js@2.0.0` is dev-only and absent from client chunks.
- Do not add R3F, `@react-three/postprocessing`, tsParticles, particlesGL, GSAP, ControlKit, glslify or a hosted runtime.
- Reimplement TouchTexture/circle-particle ideas clean-room; copy no substantive `interactive-particles` source.
- DOM/SVG, advances, kerning, baseline, bounds and particle homes consume one generated geometry contract.
- Use a regular Cartesian grid with stable IDs, never random scatter.
- Debug center/pointer are `(0.573, 0.50)` at 1672×935, DPR 1, fixed seed and timestamp.
- Bloom is selective and weak; aberration is locally masked. Add no unrelated post-processing.
- WebGL2 is dynamic; mobile/reduced-motion/init failure use semantic DOM/SVG without continuous RAF.
- Resize, context loss/restore and unmount require exact cleanup evidence.
- Deploy only after local gates/review. Use preflight, backup, full remote build and `--skip-migrate`.
- This plan never promotes or modifies the production Hero.

---

### Task 1: Pin dependencies, licence and import isolation

**Files:**
- Modify: `apps/web/package.json`, `pnpm-lock.yaml`
- Modify: `docs/decisions/ADR-009-optical-runtime-and-fonts.md`
- Create: `apps/web/test/central-particle-dependencies.test.ts`
- Modify: `docs/progress.md`, `project_index.md`

**Interfaces:** Produces exact package/ADR contract used by all later tasks.

- [ ] Write RED assertions:

```ts
expect(pkg.dependencies.three).toBe("0.185.1");
expect(pkg.dependencies.postprocessing).toBe("6.39.4");
expect(pkg.devDependencies["opentype.js"]).toBe("2.0.0");
for (const name of ["@react-three/fiber", "@react-three/postprocessing", "tsparticles", "particles-gl"])
  expect(pkg.dependencies[name]).toBeUndefined();
```

Also scan production Landing modules for zero Three/postprocessing/prototype imports.

- [ ] Run `npx pnpm@9.15.0 --filter @openscience/web test -- central-particle-dependencies.test.ts`; expect only absent-pin failures.
- [ ] Add exact packages with workspace-local pnpm. Amend ADR-009 with the no-index Three experiment, MIT/Zlib/Codrops attribution boundary, client-side ECS statement and production-import prohibition.
- [ ] Run focused test, root lint and docs-sync; record installed peer range.
- [ ] Commit `build(web): pin native optical prototype dependencies`.

---

### Task 2: Generate one authoritative title geometry

**Files:**
- Create: `apps/web/scripts/generate-optical-title-geometry.mjs`
- Create: `apps/web/assets/optical-prototype/geometry-manifest.json`
- Create: `apps/web/public/optical-prototype/title-{geometry.json,outline.svg}`
- Create: `apps/web/test/central-particle-geometry.test.ts`
- Modify: `apps/web/package.json`, `project_index.md`

**Interfaces:** Produces `OpticalTitleGeometryV1` with viewport, center, baseline, word/glyph advances, kerning, visible bounds and stable grid points:

```ts
type OpticalGridPoint = {
  id: number; row: number; column: number; glyphIndex: number;
  group: "science" | "evolves" | "period"; x: number; y: number;
};
```

- [ ] Write RED requiring exact text, 1672×935 viewport, center `(0.573,0.5)`, one baseline, kerning-enabled monotonic pen positions, regular grid deltas, no duplicate coordinates and JSON/SVG bounds within one design pixel.
- [ ] Run focused test; expect missing generator/assets.
- [ ] Load trusted local TTFs using `opentype.js`; use `Font.getPath(..., { kerning:true })`, glyph advances/bboxes and deterministic winding tests to emit JSON/SVG. Browser code must not parse fonts.
- [ ] Add `geometry:optical-prototype` script and a manifest with input/output SHA-256, tool pins and existing OFL paths.
- [ ] Generate twice after staging baseline; require scoped `git diff --exit-code`. Build Web and prove `opentype.js` is absent from client chunks.
- [ ] Commit `build(web): generate shared optical title geometry`.

---

### Task 3: Establish the isolated Three runtime shell

**Files:**
- Create: `apps/web/app/%5Fvisual/central-particle/page.tsx`
- Create: `apps/web/components/optical-prototype/{CentralParticlePrototype.tsx,central-particle.module.css}`
- Create: `apps/web/lib/optical-prototype/{runtime-policy,lifecycle,renderer}.ts`
- Create: `apps/web/test/central-particle-runtime.test.tsx`

**Interfaces:**

```ts
type CentralParticleRenderer = {
  resize(bounds: DOMRectReadOnly): Promise<void>;
  setPointer(pointer: { x: number; y: number; velocity: number }): void;
  renderDebugFrame(state: { timeMs: number; pointer: [number, number] }): void;
  dispose(): void;
};
```

- [ ] Write RED for WebGL2 dynamic, WebGL1/init failure static, `<=480px` static, reduced-motion no RAF, generation-owned resize, context loss, fresh-canvas restore and idempotent cleanup.
- [ ] Run focused test; expect missing route/runtime exports.
- [ ] SSR one selectable `h1` plus generated SVG; add no-index/no-follow metadata. Canvas is pointer-transparent and mounts only after capability checks.
- [ ] Create capped-DPR WebGL2 renderer, orthographic camera, `ResizeObserver`, visibility pause and explicit resource ledger. Publish GPU only after a complete frame.
- [ ] Run focused tests, typecheck and production build; prove production `/` import graph and route size unchanged.
- [ ] Commit `feat(web): add isolated three optical runtime`.

---

### Task 4: Render the regular grid and TouchTexture

**Files:**
- Create: `apps/web/lib/optical-prototype/{particle-grid,touch-texture}.ts`
- Create: `apps/web/lib/optical-prototype/shaders/particle.{vert,frag}.glsl`
- Modify: `apps/web/lib/optical-prototype/renderer.ts`
- Create: `apps/web/test/central-particle-field.test.ts`

**Interfaces:** `createParticleGrid(geometry,tier)` returns stable instanced attributes. `TouchTexture` exposes `addPointer`, `update(deltaMs)`, `texture`, `clear`, `dispose`.

- [ ] Write RED for regular deltas/IDs, period group, deterministic tiers, first-pointer response, time-equivalent decay at 60/120Hz, pointer-cancel and disposal.
- [ ] Run focused test; expect missing modules.
- [ ] Render one instanced quad geometry; fragment shader emits soft circular alpha and group colour without redundant source-texture fetches.
- [ ] Implement a detached 128×128 CanvasTexture with Pointer Events, delta-time decay, bounded trails, dirty-only uploads and complete dispose. Do not port old event/build/GSAP code.
- [ ] Run focused tests, typecheck and lifecycle browser probes; reduced motion must perform no continuous texture update.
- [ ] Commit `feat(web): render deterministic optical particle grid`.

---

### Task 5: Shape the fixed central field and independent curtain

**Files:**
- Create: `apps/web/lib/optical-prototype/{field-model,curtain-grid}.ts`
- Modify: particle vertex shader and renderer
- Create: `apps/web/test/central-particle-visual-metrics.test.mjs`

**Interfaces:** `sampleOpticalField(home,time,pointer,group)` provides CPU fixture/debug parity; curtain points have independent stable row/column IDs.

- [ ] Write RED requiring center error ≤0.5% stage width, curved tangential directionality, title continuity outside seam, full-height non-uniform curtain and right-biased emission. Negative fixtures reject bars, symmetric fans, rings, uniform rectangles and random scatter.
- [ ] Run against the shell; confirm topology failures, not harness errors.
- [ ] Implement radial attraction plus weaker signed tangential bend and seam transfer at `(0.573,0.50)`. Stable IDs modulate energy; pointer displacement stays below resting displacement.
- [ ] Generate a separate regular curtain with tapered opacity/curvature; never stretch title particles into it.
- [ ] Run metrics and fixed browser frame. After three identical tuning failures stop with exact evidence.
- [ ] Commit `feat(web): shape native optical convergence field`.

---

### Task 6: Add only selective Bloom and local aberration

**Files:**
- Create: `apps/web/lib/optical-prototype/postprocessing.ts`
- Create: `apps/web/lib/optical-prototype/shaders/local-aberration.frag.glsl`
- Modify: renderer
- Create: `apps/web/test/central-particle-postprocessing.test.ts`

**Interfaces:** `createOpticalComposer(renderer,scene,camera,policy)` exposes `render`, `setSize`, `setEnabled`, `dispose`.

- [ ] Write RED requiring exactly selective Bloom plus local aberration, center mask <12% stage width, no unrelated effects, mobile/reduced disablement and exact composer/pass/target disposal.
- [ ] Run test; expect missing composer.
- [ ] Use `SelectiveBloomEffect` only for seam/high-energy objects. Add one custom effect whose offset is multiplied by a smooth local center mask.
- [ ] Capture effects on/off at identical debug state; reject full-frame grey lift or colour separation beyond the mask.
- [ ] Commit `feat(web): add restrained optical postprocessing`.

---

### Task 7: Build deterministic browser evidence and local review

**Files:**
- Create: `apps/web/test/visual/central-particle-{shots,metrics}.mjs`
- Modify: `apps/web/package.json`, `docs/progress.md`, `project_index.md`

**Interfaces:** Produces `shots:central-particle`, ignored 1672×935 PNGs and committed metric schema.

- [ ] Write browser RED for fixed seed/time/pointer/viewport, shared geometry hash, selectable h1, real instanced draws, TouchTexture upload, local effects, resize, reduced/mobile/static, init failure, restore and cleanup.
- [ ] Run production-start RED; require a missing debug assertion rather than server failure.
- [ ] Publish debug evidence and capture resting, pointer, effects-off, reduced, resize and restored frames.
- [ ] Run focused and full Web tests, root typecheck/lint, deterministic generation, production build, production-start matrix and `git diff --check`. Record route gzip, particle count, CPU frame time and GPU timer when available.
- [ ] Run independent code/visual review. Fix Critical/Important findings before deployment; retain aesthetic concerns even if metrics pass.
- [ ] Commit `test(web): gate native optical prototype`.

---

### Task 8: Deploy to ECS and prove zero production regression

**Files:**
- Modify: `docs/runbooks/deployment.md`, `docs/progress.md`, `project_index.md`
- Create: `docs/handoff/2026-08-12-optical-native-prototype-handoff.md`

**Interfaces:** Consumes a clean reviewed release ref; produces live no-index prototype evidence and rollback ref.

- [ ] Record clean local release ref and read-only current server release/source hash. Never print secrets.
- [ ] Run repository checkup and confirmed DB backup; verify non-empty dump and 7-slot retention without reading contents.
- [ ] From Git Bash run dry-run:

```bash
XGS_CONFIG_ROOT=/e/Miscellaneous/XGS infra/scripts/deploy.sh --skip-migrate <release-ref>
```

Require sync, install, full workspace build, app restart and probes; no migrate/seed.

- [ ] Execute already-authorized deployment:

```bash
XGS_CONFIG_ROOT=/e/Miscellaneous/XGS infra/scripts/deploy.sh --confirm --skip-migrate <release-ref>
```

Do not use `--skip-build`; do not restart data services.

- [ ] Verify compose health, worker critical-error count zero, `/`, `/explore`, `/_visual/central-particle` return 200, `/auth/me` returns 401, and prototype has no-index metadata.
- [ ] Run public-browser fixed 1672×935, reduced and mobile captures; require no console errors/overflow, cleanup after navigation and no production Landing screenshot/hash change.
- [ ] Present public prototype beside target and OGL candidate. User chooses accept, isolated iteration or reject; none authorizes Hero modification.
- [ ] Record backup, release/rollback refs, build/probes and user decision; commit `docs: record native optical prototype deployment`.

---

## Plan self-review

- Coverage: dependencies/licences (1), single font geometry (2), runtime/fallback (3), grid/TouchTexture (4), field/curtain (5), limited effects (6), deterministic evidence (7), ECS deployment/human gate (8).
- Type boundaries are consistent: clients consume only JSON/SVG; renderer owns grid, TouchTexture and composer; deployment consumes a reviewed commit.
- Production Hero, R3F, tsParticles production use, particlesGL and unrelated effects are explicitly excluded.
- Deployment includes authorization, backup, full remote build, `--skip-migrate`, live regression and rollback evidence.
- Placeholder scan: no TBD/TODO or undefined downstream interface.
