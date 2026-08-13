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

## 2026-08-14 Final Whole-Release Review Fix Wave

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:executing-plans and strict RED–GREEN TDD for every code change.

**Goal:** Close every finding in `final-release-review.md` before deployment,
without deploying or weakening the accepted static, accessibility, lifecycle or
locality contracts.

**Architecture:** Route the model's signed `patchFollowPx` through the shared
asset renderer into the composite shader. The contribution is horizontal,
pointer-local, multiplied by the existing `localAmount` and authored
`layerWeight`, clamped to `±4` CSS px, and combined with flow refraction under
the existing `8` CSS px vector cap. Amend ADR-009 to authorize the already
approved client-only production OGL exception, measure the actual route/assets
and a physical RTX 4060 browser, and leave physical mobile explicitly blocked
when no device is discoverable.

**Tech Stack:** React 18, TypeScript, OGL 1.0.11, WebGL2/GLSL ES 3.0,
Vitest, Playwright, Chrome 150, Next.js 14.

### Global Constraints

- Preserve the accepted energy/typography plates, fixed authored `.58` seam,
  selectable semantic title and zero global title/camera translation.
- `patchFollowPx` contributes at most `4` CSS px only inside the local response;
  total local displacement remains at most `8` CSS px and the exact `.16–.20`
  outer-band halo allowance remains `4/16` sectors.
- Production WebGL is WebGL2-only. Reduced motion, WebGL2/init/runtime/context
  failure and no-canvas paths expose the accepted static surface with no RAF.
- Ambient RAF is client-only, has one owner and suspends hidden, offscreen,
  reduced and unmounted; ECS serves JS/assets and owns no GPU work.
- Do not read `.env`, use SSH/cloud/backup/deploy, touch port 3000, delete
  evidence, or claim physical-mobile evidence without a connected device.

### Task 16: Patch Follow, Architecture Truth and Final Release Evidence

**Files:**

- Modify: `apps/web/lib/optical-lab/ogl/asset-interaction-renderer.ts`
- Modify: `apps/web/lib/optical-lab/ogl/shaders/asset-composite.ts`
- Modify: `apps/web/test/optical-lab-asset-interaction.test.ts`
- Modify: `apps/web/test/visual/optical-lab-asset-interaction-gate.mjs`
- Modify: `docs/specs/2026-08-11-optical-lab-high-fidelity-design.md`
- Modify: `docs/decisions/ADR-009-optical-runtime-and-fonts.md`
- Modify: `eslint.config.cjs`, `.gitignore`, `project_index.md`
- Modify: `docs/runbooks/deployment.md`, `docs/runbooks/visual-release.md`
- Modify: `docs/progress.md`
- Modify: `.superpowers/sdd/2026-08-11-optical-lab-high-fidelity-reconstruction-plan/task-15-report.md`
- Create: `.superpowers/sdd/2026-08-11-optical-lab-high-fidelity-reconstruction-plan/final-fix-report.md`
- Modify: `docs/handoff/2026-08-13-optical-lab-asset-interaction-handoff.md`

**Interfaces:**

- Renderer uniform: `uPatchFollowPx: float`, assigned from the current bounded
  model sample only while the local response is visually active.
- Composite behavior: `followPx = vec2(clamp(uPatchFollowPx, -4.0, 4.0), 0)`
  multiplied by `localAmount * layerWeight`; add it to refracted displacement
  and normalize the combined vector only when its length exceeds `8.0`.
- Native evidence: capture identical gestures with the production shader and a
  controlled one-shader mutation that replaces only the follow contribution
  with zero. Assert one mutation, non-zero image-space delta, a measured
  directional contribution no greater than 4 px, retained total 8 px cap and
  retained halo/locality/lifecycle results.

- [x] **Step 1: Write and run RED contracts**

  Add a focused shader/renderer contract for `uPatchFollowPx`, local/layer
  bounding and combined `8.0` vector cap. Extend the native gate with the
  controlled follow-disabled shader mutation and image-space A/B assertion.
  Run focused Vitest and the native mutation gate; require failures caused by
  the absent uniform/pixel contribution.

- [x] **Step 2: Implement the minimal renderer/composite path and reach GREEN**

  Add the uniform at program creation and assign it beside `uRefractionPx`.
  In the shader, add only the bounded local/layer contribution and vector-cap
  the final displacement before UV sampling. Rerun focused Vitest, the
  follow-mutation native proof and the unmodified complete native matrix.

- [x] **Step 3: Reconcile architecture, policy and measured budgets**

  Amend ADR-009's Accepted decision and consequences for the production
  exception, shared owner, fallbacks, ambient lifecycle, client/ECS boundary,
  measured route/client/static budgets and rollback ref. Resolve “whole patch”
  wording as pointer-local replacement-patch follow. Ignore the two scratch
  evidence directories in `.gitignore` and retain their narrow ESLint ignores
  with indexed rationale; formal visual tests remain linted.

- [x] **Step 4: Record physical evidence honestly**

  Use installed Chrome with the RTX 4060 and verify the unmasked WebGL renderer
  is neither SwiftShader nor software. Record separate 15-second resting and
  15-second pointer intervals with median/p95 frame time, dropped frames,
  quality and DPR. Probe connected mobile devices read-only; if none exists,
  mark physical mobile as the sole remaining blocker and keep emulation
  supplemental only.

- [x] **Step 5: Run the complete release gate and synchronize truth**

  Run focused/full Web tests, typecheck, canonical lint, build, Landing native
  normal/reduced/pointer matrix, Lab native/reduced/static/caps/recovery/
  lifecycle matrix, 27-case release gate, docs lint/sync and `git diff --check`.
  Update Task 15, final-fix report, progress, index, runbooks and the single
  current handoff with exact outputs. Commit only if every available code,
  review and release gate is green; report `DONE_WITH_CONCERNS` only when the
  sole remaining item is unavailable physical mobile.

---

## 2026-08-13 Full-Surface Layered Fluid Addendum

This addendum implements the approved `Full-Surface Layered Fluid Interaction`
design section. Tasks 11–13 supersede the fixed-seam interaction behavior from
Tasks 9–10 while preserving their single-candidate presentation and accepted
static composition.

### Task 11: Full-Surface Local Response Model

**Files:**

- Modify: `apps/web/lib/optical-lab/asset-interaction-model.ts`
- Modify: `apps/web/test/optical-lab-asset-interaction.test.ts`

**Interfaces:**

- `AssetInteractionInput` adds `pointerX: number`; both coordinates are clamped
  to `[0, 1]`.
- `AssetInteractionSample` adds `pointerX` and `localRadiusUv`; removes the
  fixed-aperture field from interaction state.

- [x] **Step 1: Write the failing full-surface model tests**

  Add literal tests whose production mutations are dropping x input, restoring
  650ms hard-zero, or redirecting input to `.58`:

  ```ts
  const leftState = injectAssetInteraction(
    createAssetInteractionState(1_000),
    { pointerX: .12, pointerY: .2, velocityX: .4, velocityY: .1 },
    1_000,
  );
  const rightState = injectAssetInteraction(
    createAssetInteractionState(2_000),
    { pointerX: .88, pointerY: .8, velocityX: .4, velocityY: .1 },
    2_000,
  );
  const left = stepAssetInteraction(leftState, 1_120);
  const right = stepAssetInteraction(rightState, 2_120);
  expect(left.pointerX).toBe(.12);
  expect(right.pointerX).toBe(.88);
  expect(left.localRadiusUv).toBeGreaterThanOrEqual(.12);
  expect(left.localRadiusUv).toBeLessThanOrEqual(.16);
  expect(stepAssetInteraction(leftState, 1_899).active).toBe(true);
  expect(stepAssetInteraction(leftState, 1_900).active).toBe(false);
  ```

  Add monotonic samples at `120/300/500/700/900ms` and exact zero local response
  at `900ms`. Keep literal tests for 4px refraction and `.08` caustic caps.

- [x] **Step 2: Verify RED**

  Run:
  `npx pnpm@9.15.0 --filter @openscience/web test -- optical-lab-asset-interaction.test.ts`

  Expected: FAIL because pointer x, ambient strength, radius and 900ms recovery
  are absent.

- [x] **Step 3: Implement the minimal field state**

  Clamp x/y, normalize velocity without forcing positive x, use
  `localRadiusUv: .14`, keep the 120ms smoothstep response, and decay local
  response monotonically to exact zero at 900ms.

- [x] **Step 4: Verify GREEN**

  Re-run the focused interaction test and web typecheck. Require every new
  model test and all existing cap/mapping tests to pass before DOM or WebGL
  integration begins.

### Task 12: Full-Surface OGL Flow and Layered Composite

**Files:**

- Modify: `apps/web/lib/optical-lab/ogl/asset-flow-pass.ts`
- Modify: `apps/web/lib/optical-lab/ogl/asset-interaction-renderer.ts`
- Modify: `apps/web/lib/optical-lab/ogl/shaders/asset-flow.ts`
- Modify: `apps/web/lib/optical-lab/ogl/shaders/asset-composite.ts`
- Modify: `apps/web/components/optical-lab/AssetInteractionMount.tsx`
- Modify: `apps/web/app/_visual/optical-lab/optical-lab.module.css`
- Modify: `apps/web/test/optical-lab-asset-interaction.test.ts`
- Modify: `apps/web/test/visual/optical-lab-asset-interaction-gate.mjs`

**Interfaces:**

- `AssetFlowSample` adds `ambientPhase` and `pointer: [number, number]`.
- Flow uniforms are `uAmbientPhase`, `uPointer`, `uRadius`, `uVelocity` and
  `uLocalStrength`; no constant aperture or one-axis pointer uniform remains.
- Composite uniforms consume the existing target and energy textures plus the
  flow texture; layer weights derive from target luminance and energy alpha.
- `AssetInteractionRenderer` adds `setSuspended(suspended: boolean): void` and
  retains `dispose`, `resize` and `updatePointer`.
- The DOM diagnostic snapshot retains `apertureX: .58` only as an authored
  energy landmark and adds `ambientStrength`, `pointerX`, `pointerY` and
  `suspended`.

- [x] **Step 1: Write failing shader, spatial and lifecycle tests**

  Require the flow shader to contain `uniform vec2 uPointer`, a radial distance
  from `vUv`, ambient phase, and persistent previous-flow advection. Require it
  not to contain `APERTURE_X` or `uPointerY`. Require the composite shader to
  derive distinct `emptyWeight`, `typeWeight` and `energyWeight`, cap
  displacement at `4.0` CSS px and local gain at `.08`, and not contain the
  fixed seam `abs(vUv.x - 0.58)`. Require asset canvas computed mask to be
  `none` rather than the former `ellipse 18% 32% at 58% 50%`.

  Before production integration, extend the existing browser gate with one
  left-position pointer assertion that requires the changed-pixel centroid to
  remain within `.04` normalized distance of the left pointer, plus visible
  ambient differences in four quadrants. Add browser assertions that hidden,
  offscreen and reduced-motion states have no RAF/canvas, and SPA unmount removes
  the diagnostic global. These fail against the fixed-seam renderer.

- [x] **Step 2: Verify RED**

  Run the focused interaction test and one native browser gate invocation.
  Expected failures name the fixed aperture, missing two-dimensional pointer,
  old CSS mask, redirected left response and missing ambient/suspension behavior.

- [x] **Step 3: Implement persistent ambient plus local injection**

  Keep the 96 × 54 ping-pong flow texture initially. Each frame advects the
  previous velocity with `.985` persistence, adds two low-frequency ambient
  curl terms capped by `.035`, then injects pointer velocity through a soft
  radial falloff with radius `.14` of stage width. Correct UV y distance by the
  current stage aspect ratio so the response is circular in CSS pixels rather
  than elliptical in texture coordinates. Clamp stored vector magnitude to
  one. The renderer supplies `ambientPhase = (now % 12_000) / 12_000`; shaders
  derive all periodic terms from that phase so time remains bounded. Do not add
  a cursor ring, hard radial edge or DOM transform.

- [x] **Step 4: Implement layered full-surface composite**

  Remove the fixed patch mask and CSS radial mask. Use target luminance to
  distinguish typography from empty black and energy alpha/luminance to detect
  the authored central field. Apply relative response weights `.22` empty,
  `.62` typography and `1.0` energy, with smooth transitions. Ambient
  displacement stays at or below `.7px`; local combined displacement stays at
  or below `4px`; local brightness gain stays at or below `.08`.

- [x] **Step 5: Keep ambient RAF lifecycle bounded**

  Pass normalized pointer x/y from the mount. Add `pointerleave` handling that
  clears only the previous pointer sample so re-entry cannot create a stage-wide
  velocity spike; it must not clear the decaying flow field. Preserve
  `touch-action: pan-y` and passive vertical scrolling.

  Start the renderer only after the visible candidate initializes. Continue RAF
  for ambient motion while visible and unsuspended; stop and clear to the exact
  static plates when `document.hidden`, an `IntersectionObserver` reports the
  stage offscreen, reduced motion is active, unavailable or disposed.
  Re-entry resumes from a cleared low-amplitude ambient field; pointer leave
  decays local input without clearing ambient motion. SPA unmount publishes its
  disposed diagnostic snapshot to the DOM owner, then deletes
  `window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__`.

- [x] **Step 6: Verify GREEN**

  Run focused interaction tests, web typecheck and the updated native browser
  gate. Inspect one native still to confirm the complete stage has no compositor
  clipping before full five-position spatial acceptance begins.

### Task 13: Honest Spatial Motion Gate and User Preview

- [x] Re-review correction: reject transparent RAF-external WebGL copies;
  require nonzero ambient/active/recovered evidence and capture the actual
  rendered frame with renderer-owned same-RAF readback, PNG completion
  timestamp `<=900ms`, ambient temporal motion and exact CPU follow zero at
  900ms.

**Final whole-increment review fix wave (2026-08-13):**

- [x] Reject a real cursor-centred circular/ribbed rim from native pixels; old
  radial mutation is RED at 16/16 sectors, irregular wake GREEN at 3/16.
- [x] Timestamp recovery evidence after browser-side compositor PNG completion
  and require completion by 900ms with inactive local pixels and ambient live.
- [x] Require `energy > typography >= empty * 1.25` while keeping empty visible.
- [x] Correct current project-index rows to full-surface x/y `.14`, layered
  response and 900ms; mark 650ms procedural row historical/non-asset.

**Files:**

- Modify: `apps/web/test/visual/optical-lab-asset-interaction-gate.mjs`
- Modify: `apps/web/test/visual/capture-optical-lab-asset.mjs`
- Modify: `docs/progress.md`
- Modify: `docs/handoff/2026-08-13-optical-lab-asset-interaction-handoff.md`
- Modify: `project_index.md`

**Interfaces:**

- The browser gate accepts optional
  `OPTICAL_LAB_ASSET_INTERACTION_BASE_URL`. When present it verifies that URL
  and never spawns or kills Next; otherwise it retains exact owned-server
  validation for one-shot use.
- Spatial evidence produces ignored ambient/left/centre/right/upper/lower,
  touch, suspended and recovered native-size PNGs.

- [x] **Step 1: Write the failing external-server and spatial assertions**

  Against a single prestarted worktree server, require no child server spawn,
  five pointer positions whose local changed-pixel centroids remain within
  `.04` normalized distance of the injected coordinate, and at least 75% of
  local-response changed pixels within `.16 * stageWidth` of the pointer.
  Require ambient-only differences in four quadrants and require local response
  magnitude ordering `energy > typography > empty` from literal coordinates on
  the accepted plates.

- [x] **Step 2: Verify RED**

  Run the browser gate with the existing stable 3066 server URL. Expected:
  FAIL because the old interaction redirects every visible change to the fixed
  seam and the gate has no external-server mode.

- [x] **Step 3: Implement the minimal gate infrastructure**

  Split server ownership from browser assertions inside the same script. When
  `OPTICAL_LAB_ASSET_INTERACTION_BASE_URL=http://127.0.0.1:3066` is set, perform
  a health/asset-only/single-panel check and skip spawn/kill logic. Preserve a
  bounded browser close, exact resource checks and diagnostic output on every
  failed spatial assertion.

- [x] **Step 4: Verify full-surface behavior on one stable server**

  Run the complete native browser matrix five consecutive times against the
  same prestarted server, without rebuilding or restarting Next between runs.
  Require all five exits 0, no follow-threshold failure, no server process
  mutation, and exact cleanup in each isolated browser context.

- [x] **Step 5: Run final engineering gates sequentially**

  Run focused Vitest, web typecheck, reduced-motion static capture, production
  web build, docs lint and docs sync. The static capture must prove exact
  accepted pixels with ambient motion disabled; it must not compare an active
  ambient frame to the static fixture. Never run Next build concurrently with
  the preview or browser gate. After build, restart the isolated preview once
  and verify HTTP 200, asset-only marker and one panel.

- [x] **Step 6: Synchronize status and stop at user motion review**

  Prepend actual evidence to `docs/progress.md`, update the unique handoff and
  refresh the existing project-index rows. Leave the preview running on 3066
  for desktop user review. Do not commit, replace production `/` or deploy ECS.

---

### Task 14: Amplify and Widen the Accepted Fluid Field

**Files:**

- Modify: `apps/web/lib/optical-lab/asset-interaction-model.ts`
- Modify: `apps/web/lib/optical-lab/ogl/shaders/asset-composite.ts`
- Modify: `apps/web/test/optical-lab-asset-interaction.test.ts`
- Modify: `apps/web/test/visual/optical-lab-asset-interaction-gate.mjs`

**Interfaces:**

- `ASSET_INTERACTION_LIMITS` changes to `patchFollowPx: 4`,
  `localRefractionPx: 8`, `causticGain: .14` and `localRadiusUv: .20`.
- The composite uses an ambient displacement budget of `1.4px`; local
  displacement remains derived from the model and capped at `8px`.
- The spatial gate consumes `.22 * stageWidth` as the wider locality boundary
  and retains centroid, halo, layer-order, recovery and lifecycle assertions.

- [x] **Step 1: Write literal amplified-envelope and wider-field RED tests**

  Require exact limits `4/8/.14/.20`, active response approximately twice the
  accepted pre-amplification fixture, and a representative pixel at radius
  `.18` to respond while a pixel outside `.22` remains subordinate. Require
  the halo probe to remain `<=4/16` and typography to remain at least
  `empty * 1.25`.

- [x] **Step 2: Run focused model and native RED**

  Run focused Vitest and one external browser matrix against the current 3066
  preview. Expected failures must name the old `2/4/.08/.14` envelope or the
  old narrow field, not server startup.

- [x] **Step 3: Implement the minimum stronger/wider field**

  Change only the four model limits and composite ambient/local budgets. Scale
  the empty liquid lift proportionally but keep it below the `.14` gain cap.
  Do not change recovery timing, wake anisotropy, typography, static plates,
  ambient phase or lifecycle ownership.

- [x] **Step 4: Verify the full native matrix and engineering gates**

  Require all five positions, wider locality, halo, layer ordering, same-RAF
  nontransparent recovery capture, touch and lifecycle to pass. Then run
  focused tests, typecheck, reduced-motion byte-identical capture and build.

### Task 15: Promote the Shared Surface and Deploy Production

**Files:**

- Create: `apps/web/components/optical-lab/AcceptedOpticalSurface.tsx`
- Modify: `apps/web/components/optical-lab/OpticalLabPage.tsx`
- Modify: `apps/web/components/landing/Hero.tsx`
- Modify: `apps/web/app/_visual/optical-lab/optical-lab.module.css`
- Modify: `apps/web/test/landing-page.test.tsx`
- Modify: `apps/web/test/optical-lab-contract.test.tsx`
- Modify: `apps/web/test/visual/shots.mjs`
- Modify: `docs/progress.md`
- Modify: `docs/handoff/2026-08-13-optical-lab-asset-interaction-handoff.md`
- Modify: `project_index.md`
- Modify: `docs/runbooks/deployment.md`

**Interfaces:**

- `AcceptedOpticalSurface` owns the accepted plates, one semantic headline,
  `AssetInteractionMount` and hidden diagnostics; Lab and landing consume the
  same implementation with unique `stageId`/`diagnosticsId` props.
- Production `/` retains `PublicShell`, navigation and `LatestResearch`; only
  the Hero visual body changes to the accepted shared surface.

- [x] **Step 1: Write production-promotion RED contracts**

  Require `/` SSR to contain exactly one accepted surface, one semantic `h1`,
  the amplified interaction host and no legacy `OpticalHeadline` renderer.
  Require the isolated asset route to consume the same shared component and
  retain one panel. Add desktop/mobile/reduced browser cases for overflow,
  navigation, static fallback and pointer response.

- [x] **Step 2: Run landing and Lab RED**

  Run focused landing/Lab contracts and the production visual gate. Expected
  failures must show that landing still imports the legacy Hero visual.

- [x] **Step 3: Extract and promote the shared surface**

  Extract without changing accepted plate order or semantic text. Mount it in
  the landing Hero while preserving header, CTA/navigation accessibility and
  downstream Latest Research. Delete no files; leave the legacy component
  unreferenced until a separately approved cleanup.

- [x] **Step 4: Run local production acceptance sequentially**

  Run focused tests, full Web tests, typecheck, lint, production build,
  desktop/mobile/reduced-motion production browser gates, Lab matrix,
  `docs:lint`, `audit:docs-sync` and `git diff --check`. Inspect the production
  Hero at native desktop and mobile sizes.

- [ ] **Step 5: Create release and execute the confirmed deployment**

  Commit only reviewed source/docs/assets, record the prior production ref as
  rollback anchor, run local dry-run, pre-deploy checkup and database backup,
  then execute `infra/scripts/deploy.sh --confirm --skip-migrate <release-ref>`
  with the isolated worktree as source and main repository as config root.

- [ ] **Step 6: Verify public production and document rollback evidence**

  Require public `/`, `/explore` and `/auth/me` expected statuses, desktop and
  mobile browser rendering, reduced-motion exact static, pointer response,
  no horizontal overflow/browser errors, healthy Web/API/worker services and
  no critical worker logs. Record release/rollback refs, backup result, public
  evidence and explicit no-schema/no-topology statement in progress, handoff,
  project index and deployment runbook.

---

## 2026-08-13 Single-Asset Acceptance Addendum

### Task 9: Perceptible Bounded Pointer Mapping

**Files:**

- Modify: `apps/web/lib/optical-lab/asset-interaction-model.ts`
- Modify: `apps/web/components/optical-lab/AssetInteractionMount.tsx`
- Modify: `apps/web/test/optical-lab-asset-interaction.test.ts`

**Interfaces:**

- Produces: `mapAssetPointerVelocity(deltaX: number, deltaY: number,
  elapsedMs: number): { velocityX: number; velocityY: number }`.
- Consumes: the existing normalized interaction state and unchanged
  `2px`/`4px`/`.08` response caps.

- [x] **Step 1: Write the failing mapping test**

  Add a literal behavior test whose production mutation is restoring the old
  `.1` sensitivity multiplier:

  ```ts
  const velocity = mapAssetPointerVelocity(18, 0, 24);
  expect(velocity.velocityX).toBeCloseTo(.5625, 5);
  expect(velocity.velocityY).toBe(0);
  expect(Math.hypot(velocity.velocityX, velocity.velocityY)).toBeGreaterThanOrEqual(.5);
  ```

- [x] **Step 2: Verify RED**

  Run:
  `npx pnpm@9.15.0 --filter @openscience/web test -- optical-lab-asset-interaction.test.ts`

  Expected: FAIL because `mapAssetPointerVelocity` is not exported.

- [x] **Step 3: Implement and consume the minimal mapping**

  Define `const ASSET_POINTER_VELOCITY_SENSITIVITY = .75`, divide each pointer
  delta by `Math.max(1, elapsedMs)`, multiply by that constant, and return the
  two components. Replace the duplicated `.1` arithmetic in
  `AssetInteractionMount` with this function. Do not change response duration,
  recovery duration, normalization, aperture or output caps.

- [x] **Step 4: Verify GREEN**

  Re-run the focused interaction test and require the new mapping case plus all
  existing envelope, recovery and shader cases to pass.

### Task 10: Single Deployable Candidate Surface

**Files:**

- Modify: `apps/web/components/optical-lab/OpticalLabPage.tsx`
- Modify: `apps/web/app/_visual/optical-lab/optical-lab.module.css`
- Modify: `apps/web/test/optical-lab-contract.test.tsx`
- Modify: `apps/web/test/visual/optical-lab-asset-interaction-gate.mjs`
- Modify: `docs/progress.md`
- Modify: `docs/handoff/2026-08-13-optical-lab-asset-interaction-handoff.md`

**Interfaces:**

- Exact `candidate=asset` produces one `data-optical-lab-panel="candidate"`
  figure, one semantic heading, one minimal exit link and the existing hidden
  diagnostic contract.
- Non-asset lab routes retain the current three-panel comparison surface.

- [x] **Step 1: Write the failing route contract**

  Extend the existing exact asset-query SSR test with literal assertions:

  ```ts
  expect(markup.match(/data-optical-lab-panel=/g) ?? []).toHaveLength(1);
  expect(markup).not.toContain('data-optical-lab-panel="target"');
  expect(markup).not.toContain('data-optical-lab-panel="current"');
  expect(markup).not.toContain('/optical-lab/current-production.png');
  expect(markup).toContain('data-optical-lab-asset-only="true"');
  expect(markup.match(/data-optical-lab-exit=/g) ?? []).toHaveLength(1);
  ```

- [x] **Step 2: Verify RED**

  Run:
  `npx pnpm@9.15.0 --filter @openscience/web test -- optical-lab-contract.test.tsx`

  Expected: FAIL because the exact asset query still renders all three panels.

- [x] **Step 3: Implement the single-surface branch and layout**

  Render the existing target and current figures only when
  `isAssetCandidate === false`; omit the candidate caption in exact asset mode;
  preserve the candidate stage and diagnostic nodes for interaction ownership.
  Mark the main element `data-optical-lab-asset-only="true"`, keep a compact
  top-right exit link, and add an asset-only grid that centers a single 16:9
  stage up to `1672px` wide without cropping. Hide diagnostics visually only in
  asset mode; do not remove its DOM contract.

- [x] **Step 4: Verify GREEN and responsive behavior**

  Re-run the focused contract test, then web typecheck. At desktop and mobile
  widths require one uncropped stage, no comparison captions, a keyboard-visible
  exit link and no horizontal overflow.

- [x] **Step 5: Run the native interaction and resting-pixel gates**

  Update only selectors that assumed the three-panel shell, then run
  `node test/visual/optical-lab-asset-interaction-gate.mjs` followed by
  `node test/visual/capture-optical-lab-asset.mjs`. Require the 1672 x 941 rest
  frame to remain pixel-identical, the 18px/24ms gesture to reach at least 50%
  response, all caps to hold and recovery at 650ms to return exact rest.

- [x] **Step 6: Run final gates and synchronize canonical status**

  Run the focused Vitest files, web typecheck, production web build,
  `docs:lint` and `audit:docs-sync` sequentially. Prepend the actual commands and
  outcomes to `docs/progress.md`, update the unique interaction handoff and keep
  `project_index.md` unchanged unless a path is created or moved. Do not commit,
  replace production `/` or deploy ECS.

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
## 2026-08-13 Asset Typography Coupling Addendum

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this addendum with TDD.

**Goal:** Correct the isolated asset candidate so its typography and central optical effect match the approved reference without hard-clipping or flat DOM ink.

**Architecture:** Keep the full-height transparent energy plate as the background material. Add a decorative, feather-masked central typography/effect plate sourced from the project-owned target reference, then retain the single semantic DOM heading as transparent selectable ink above it. This is an isolated fixed-aspect visual acceptance prototype; production `/` and responsive promotion remain out of scope.

**Tech Stack:** Next.js server component, CSS Modules, Playwright browser evidence, Vitest contract tests.

### Addendum Global Constraints

- Only exact `/_visual/optical-lab?candidate=asset` changes.
- Preserve one selectable semantic `h1`; decorative layers use empty alt text, `aria-hidden` and no pointer interception.
- Do not mount Canvas, WebGL or `OpticalLabClientMount` in asset mode.
- Do not change or deploy production `/` or ECS.

### Addendum Task: Couple the approved typography to the energy seam

**Files:**

- Modify: `apps/web/components/optical-lab/OpticalLabPage.tsx`
- Modify: `apps/web/app/_visual/optical-lab/optical-lab.module.css`
- Modify: `apps/web/test/optical-lab-contract.test.tsx`
- Modify: `apps/web/test/visual/capture-optical-lab-asset.mjs`

- [x] Add failing contract/browser assertions for the decorative typography plate, intact Science overflow, transparent selectable DOM ink and zero client/GPU mount.
- [x] Run the focused contract and browser gate; record failures caused by the missing coupling layer and the obsolete hard clip.
- [x] Add the target typography plate with a feathered central-band mask; remove the asset-only Science clip and visually suppress duplicate DOM ink without suppressing text selection.
- [x] Run focused contract, typecheck, production build and the 1672×941 browser capture.
- [x] Compare the native candidate and target at original resolution; do not claim visual completion without user confirmation.

---

## 2026-08-13 Asset Interaction Implementation Addendum

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:executing-plans to implement this addendum task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the user-approved mixed-flow pointer and touch response to the
accepted `candidate=asset` resting frame without changing any resting pixel or
the production homepage.

**Architecture:** A client-only `AssetInteractionMount` listens across the
whole candidate Hero and lazily creates one generation-owned transparent
WebGL2 canvas after meaningful input. A separate OGL
`AssetInteractionRenderer` owns a fixed-aperture 96 × 54 velocity flowmap and
one feathered replacement shader; the existing procedural renderer and the
accepted static plates remain unchanged. A pure state module owns the 120ms
monotonic response and exact 650ms rest contract so lifecycle behavior can be
proved before WebGL is introduced.

**Tech Stack:** React 18, TypeScript, OGL 1.0.11, WebGL2, Vitest, Playwright.

### Addendum Global Constraints

- Only exact `/_visual/optical-lab?candidate=asset` changes; production `/`,
  backend and ECS remain untouched.
- At exact rest the overlay is absent or transparent, so the accepted plates
  remain the pixel authority.
- Fixed aperture x is `.58`; apparent follow is at most `2` CSS px, local
  refraction at most `4` CSS px and caustic gain at most `.08`.
- Response is monotonic, has no spring or bounce and becomes exact zero with no
  active RAF by `650ms` after the latest input.
- No cursor halo, ring, fan, broad haze, rectangular patch edge, duplicate ink
  or whole-title movement.
- Pointer and touch share one normalized velocity model. Reduced motion,
  WebGL2 failure and context loss expose the unchanged accepted frame.
- The canvas is `aria-hidden` and pointer-transparent; the one selectable
  semantic `h1` remains exactly `Science evolves.`.
- Do not add a rendering dependency or commit without a separate user request.

### Addendum Task 1: Pure Asset Response Envelope

**Files:**

- Create: `apps/web/lib/optical-lab/asset-interaction-model.ts`
- Create: `apps/web/test/optical-lab-asset-interaction.test.ts`

**Interfaces:**

- Produces: `createAssetInteractionState(now?: number): AssetInteractionState`.
- Produces: `injectAssetInteraction(state, input, now): AssetInteractionState`,
  where input is normalized velocity plus `pointerY`.
- Produces: `stepAssetInteraction(state, now): AssetInteractionSample`, carrying
  `active`, `follow`, `patchFollowPx`, `refractionPx`, `causticGain`, fixed
  `apertureX: .58` and the next state.
- Consumed by: Addendum Task 2 renderer and Task 3 browser diagnostics.

- [x] **Step 1: Write the failing response tests**

  Add literal assertions proving diagonal velocity normalization, a fixed `.58`
  aperture, monotonic approach through `0/40/80/120ms`, no sign reversal during
  decay, the `2px`/`4px`/`.08` caps and exact inactive zero at `650ms`.

- [x] **Step 2: Verify RED**

  Run:
  `npx pnpm@9.15.0 --filter @openscience/web test -- optical-lab-asset-interaction.test.ts`

  Expected: FAIL because `asset-interaction-model.ts` does not exist.

- [x] **Step 3: Implement the minimal deterministic state model**

  Clamp input vector length to one, move each current component toward its
  target with a non-overshooting first-order step, begin inactivity decay after
  the response window and hard-zero every response field at `650ms`. Derive
  public response values only from the bounded current vector.

- [x] **Step 4: Verify GREEN**

  Run the focused test command above and require all cases to pass without
  warnings from the new module.

### Addendum Task 2: Lazy OGL Fixed-Seam Overlay

**Files:**

- Create: `apps/web/lib/optical-lab/ogl/asset-flow-pass.ts`
- Create: `apps/web/lib/optical-lab/ogl/shaders/asset-flow.ts`
- Create: `apps/web/lib/optical-lab/ogl/shaders/asset-composite.ts`
- Create: `apps/web/lib/optical-lab/ogl/asset-interaction-renderer.ts`
- Create: `apps/web/components/optical-lab/AssetInteractionMount.tsx`
- Modify: `apps/web/components/optical-lab/OpticalLabPage.tsx`
- Modify: `apps/web/app/_visual/optical-lab/optical-lab.module.css`
- Modify: `apps/web/test/optical-lab-asset-interaction.test.ts`
- Modify: `apps/web/test/optical-lab-contract.test.tsx`

**Interfaces:**

- Produces: `createAssetInteractionRenderer(canvas, stage, onSnapshot)` returning
  an async-ready owner with `dispose()`, `resize()` and
  `updatePointer(input, now)`.
- Produces: `AssetInteractionSnapshot` with `activeRaf`, `apertureX`, bounded
  response values, context state and exact OGL resource counts.
- Consumes: the pure Task 1 state API, the pinned OGL dependency, existing
  resource ledger/context attributes, `target-reference.png` and
  `energy-plate-black-alpha-v1.png`.

- [x] **Step 1: Write failing component, shader and lifecycle contracts**

  Require asset SSR to include only the client host (never a server canvas),
  preserve its single semantic heading, use the fixed `.58` shader aperture,
  expose no cursor-position x mask, keep the canvas pointer-transparent and
  release canvas/listeners/RAF/resources exactly once.

- [x] **Step 2: Verify RED**

  Run the two focused Vitest files and confirm failures are caused only by the
  missing asset mount/renderer/shaders.

- [x] **Step 3: Implement the minimal overlay**

  Lazily create WebGL2 only after a second meaningful pointer sample. Render a
  96 × 54 ping-pong velocity texture whose x influence is fixed at `.58`; use
  an elongated, feathered seam patch to replace the underlying target pixels,
  add at most 8% energy and displace at most 4 CSS px. Clear to transparent and
  stop scheduling RAF at exact rest. On reduced motion, initialization failure,
  context loss or unmount, tear down the owned generation and leave the static
  plates visible.

- [x] **Step 4: Verify GREEN**

  Run both focused Vitest files, then
  `npx pnpm@9.15.0 --filter @openscience/web typecheck`.

### Addendum Task 3: Honest Pointer, Touch and Recovery Browser Gate

**Files:**

- Create: `apps/web/test/visual/optical-lab-asset-interaction-gate.mjs`
- Modify: `project_index.md`
- Modify: `docs/progress.md`
- Modify: `docs/handoff/2026-08-13-optical-lab-asset-interaction-handoff.md`

**Interfaces:**

- Consumes: `window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__` snapshots from
  Task 2 and exact `candidate=asset` route isolation.
- Produces: ignored native-size rest/left/aperture/right/touch/recovered PNG
  evidence plus executable assertions for caps, lifecycle and pixel recovery.

- [x] **Step 1: Write and run the browser gate against the incomplete overlay**

  Assert no initial canvas/RAF, then use real elapsed pointer events at left,
  aperture and right plus a touch pointer drag. Require visible active-frame
  change only after input, fixed `.58` aperture, bounded diagnostics, exact
  candidate-element screenshot equality after at least `650ms`, no canvas in a
  reduced-motion context and port cleanup.

- [x] **Step 2: Correct only observed interaction defects through RED/GREEN**

  For each browser failure, add the smallest focused regression assertion before
  changing implementation. Do not tune or replace the accepted resting plates.

- [x] **Step 3: Run final local gates sequentially**

  Run focused Vitest, web typecheck, the new browser gate, the existing static
  asset capture and production build sequentially. Never run Next build and a
  dev-server capture in parallel.

- [x] **Step 4: Synchronize canonical docs and stop at the user motion gate**

  Prepend evidence and remaining user-motion acceptance to `docs/progress.md`,
  register every created file in `project_index.md`, update the unique current
  handoff, then run `docs:lint` and `audit:docs-sync`. Do not promote to `/` or
  deploy ECS.

---
