# Hermes Workspace Companion Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. The user authorized direct implementation and reserved commit/deploy until final visual acceptance, so each task ends at a verified review boundary rather than a Git commit.

**Goal:** Upgrade the current single-location Hermes mesh into a Workspace-wide scholarly companion with layered life, safe target travel, semantic field guidance, user-selected docking, and reviewable draft diffs.

**Architecture:** Keep one existing OGL mesh renderer and add a pure behavior director, four-layer motion mixer, semantic anchor registry, and persistent Workspace stage. The stage uses a single Portal owner across Dashboard and the RO create/edit workflow; all AI drafting continues through the existing AgentTask, credit, queue, audit, and suggestion-diff infrastructure.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, OGL 1.0.11, Vitest, Playwright 1.62.1, existing Fastify/AgentTask/Redis/AI Gateway stack.

## Global Constraints

- `docs/specs/2026-08-17-hermes-workspace-companion-motion-design.md` is the only CURRENT Hermes visual/guide spec.
- Preserve the original three 824×824 RGBA textures, one mesh canvas, one WebGL2 context, one OGL program/plane owner, and the existing static fallback.
- Do not add Cubism, Rive, Three.js, Pixi, a second full-screen WebGL context, or third-party character assets.
- Motion evidence must measure character pixels or mesh joints; DOM labels, effects, and data attributes are diagnostic only.
- Default cadence is one micro-action every 2.4–4.2 seconds and one signature action every 14–22 seconds with no immediate repeat; this supersedes the original 4–8 / 20–35 cadence after the real 181px product view was rejected as visually static.
- Priority is `approval still > user drag > guide travel > task work > pointer/focus > patrol > base life`.
- Generation never writes fields directly; accepted full or partial diff hunks are the only write path.
- Mobile and reduced-motion retain every action and piece of content through alternate presentation.
- Do not read `.env` or commit before the user accepts the final live visual. ECS deployment and real-provider testing were explicitly authorized on 2026-08-17; local Docker remains prohibited.

---

## File and Interface Map

| Unit | Responsibility |
|---|---|
| `behavior-director.ts` | pure priority, cadence, anti-repeat, interruption, and deterministic clock |
| `action-catalog.ts` | typed 25+ action definitions and variants |
| `motion-mixer.ts` | base/action/expression/effect composition into mesh parameters |
| `anchor-registry.ts` | semantic target lifecycle and geometry snapshots |
| `travel-path.ts` | safe corridor, off-screen edge stop, and target-side docking |
| `dock-preferences.ts` | per-device/per-Workspace position and activity settings |
| `HermesWorkspaceStage.tsx` | single global Portal/canvas and route-persistent state owner |
| `HermesGuideBubble.tsx` | concise target help, expanded actions, and Take me there |
| `HermesDraftDiff.tsx` | existing extractor suggestion review and explicit apply boundary |
| visual gates | real pixels, real target geometry, real writes, real WebGL draws |

---

### Task 1: Make the New Spec the Only CURRENT Truth ✅

**Files:**

- Modify: `scripts/docs/hermes-renderer-index.mjs`
- Modify: `scripts/docs/hermes-renderer-index.test.mjs`
- Modify: `project_index.md`
- Modify: `docs/progress.md`
- Modify: `docs/handoff/2026-08-16-hermes-2d-pet-handoff.md`
- Test: `scripts/docs/hermes-renderer-index.test.mjs`

**Interfaces:**

- Produces: `validateHermesRendererIndex(indexText: string): string[]` requiring the 2026-08-17 Workspace Companion spec as the unique CURRENT visual/guide design.

- [x] **Step 1: Update the docs contract test to expect the new CURRENT file**

```js
const current = '| `docs/specs/2026-08-17-hermes-workspace-companion-motion-design.md` | motion | **CURRENT Hermes visual/guide design** |';
const deprecatedMesh = '| `docs/specs/2026-08-16-hermes-articulated-mesh-pet-design.md` | old | **DEPRECATED** |';
const rejectedPng = '| `docs/specs/2026-08-15-hermes-2d-pet-design.md` | old | **DEPRECATED / VISUAL NO-GO** |';
```

- [x] **Step 2: Run RED**

Run: `node --test scripts/docs/hermes-renderer-index.test.mjs`

Expected: FAIL because the validator still requires the 2026-08-16 articulated-mesh file.

- [x] **Step 3: Update the validator and canonical docs**

Require exactly one `CURRENT Hermes visual/guide design` row, require both superseded specs to be DEPRECATED, and remove current-state wording from their index rows. Prepend progress with the approved C safe-corridor, C fluid-travel/light-landing, layered motion decision, and external research basis. Change the handoff first-read design to the new spec.

- [x] **Step 4: Run GREEN and docs sync**

Run:

```powershell
node --test scripts/docs/hermes-renderer-index.test.mjs
npx pnpm@9.15.0 audit:docs-sync
```

Expected: renderer index tests PASS and `DOCS_SYNC_OK`.

### Task 2: Build the Pure Behavior Director and Action Catalogue ✅

**Files:**

- Create: `apps/web/lib/hermes/action-catalog.ts`
- Create: `apps/web/lib/hermes/behavior-director.ts`
- Test: `apps/web/test/hermes-behavior-director.test.ts`
- Modify: `apps/web/lib/hermes/pet-motion.ts`

**Interfaces:**

- Produces:

```ts
export type HermesActionId =
  | 'blink-single' | 'blink-double' | 'observe-left' | 'observe-right'
  | 'evidence-check' | 'page-tidy' | 'citation-trace' | 'stretch'
  | 'doze' | 'wake' | 'surprise-settle' | 'patrol' | 'return-dock'
  | 'pointer-approach' | 'pointer-avoid' | 'drag' | 'guide-travel'
  | 'guide-arrive' | 'quiet-write' | 'read' | 'compare' | 'draft'
  | 'possible-issue' | 'success' | 'milestone-dance' | 'failed-settle'
  | 'approval-still';

export interface HermesBehaviorInput {
  nowMs: number;
  seed: number;
  state: HermesVisualState;
  pointer: { x: number; y: number; speed: number; present: boolean };
  dragging: boolean;
  guide: 'idle' | 'travel' | 'arrived';
  task: 'idle' | 'working' | 'failed' | 'succeeded';
  writing: boolean;
  activity: 'quiet' | 'balanced' | 'active';
  reducedMotion: boolean;
}

export interface HermesBehaviorFrame {
  primary: HermesActionId;
  expression: 'neutral' | 'curious' | 'focused' | 'doubt' | 'success' | 'failed';
  effect: 'none' | 'star-wake' | 'evidence-sequence' | 'citation-arc' | 'particles';
  interruptible: boolean;
  startedAtMs: number;
  durationMs: number;
}

export function stepHermesBehavior(
  previous: HermesBehaviorFrame,
  input: HermesBehaviorInput,
): HermesBehaviorFrame;
```

- [x] **Step 1: Write focused RED tests**

Tests must assert exact priority, quiet-writing suppression, no immediate action repeat, seeded determinism, 2.4–4.2 second balanced micro rests, 14–22 second signature interval, approval still, failed settle, and reduced static alternatives.

- [x] **Step 2: Run RED**

Run: `npx pnpm@9.15.0 --filter @openscience/web test -- hermes-behavior-director.test.ts`

Expected: FAIL because the catalogue and director do not exist.

- [x] **Step 3: Implement the smallest pure scheduler**

Use a seeded integer hash, not `Math.random()`, to choose variants. Preserve the current mesh joint math in `pet-motion.ts`; replace its single long grammar selector with the director output only after pure tests pass.

- [x] **Step 4: Run GREEN**

Run: `npx pnpm@9.15.0 --filter @openscience/web test -- hermes-behavior-director.test.ts hermes-pet-motion.test.ts`

Expected: both focused files PASS.

### Task 3: Compose Four Motion Layers Into Real Mesh Parameters ✅

**Files:**

- Create: `apps/web/lib/hermes/motion-mixer.ts`
- Test: `apps/web/test/hermes-motion-mixer.test.ts`
- Modify: `apps/web/lib/hermes/pet-motion.ts`
- Modify: `apps/web/lib/hermes/pet-mesh-renderer.ts`
- Modify: `apps/web/components/hermes/HermesRiggedPortrait.tsx`

**Interfaces:**

- Consumes: `HermesBehaviorFrame` from Task 2.
- Produces:

```ts
export interface HermesMotionLayers {
  base: HermesJointPose;
  action: Partial<HermesJointPose>;
  expression: Partial<HermesJointPose>;
  effect: { kind: HermesBehaviorFrame['effect']; progress: number };
}

export function mixHermesMotion(layers: HermesMotionLayers): HermesJointPose;
```

- [x] **Step 1: Write RED tests for simultaneous layers**

Assert that breath continues during `observe-left`, pointer head lead overlays quiet writing without tail patrol, action weights fade from the current pose, joint caps remain unchanged, approval returns an exact static pose, and failed-settled frames become draw-suspendable.

- [x] **Step 2: Run RED**

Run: `npx pnpm@9.15.0 --filter @openscience/web test -- hermes-motion-mixer.test.ts`

Expected: FAIL because `mixHermesMotion` is missing.

- [x] **Step 3: Implement the mixer and renderer bridge**

Blend base, action, and expression in that order with per-joint clamps. Add effect progress as uniforms only where it deforms or shades registered character regions. Keep brand particles in the existing canvas; do not add a second context.

- [x] **Step 4: Add wake/sleep scheduling**

Stop RAF after failure settles, during approval, when hidden/offscreen, and during a truly static reduced frame. Wake on behavior deadline, pointer/focus, task change, drag, route target, resize, or context restore.

- [x] **Step 5: Run GREEN and lifecycle tests**

Run:

```powershell
npx pnpm@9.15.0 --filter @openscience/web test -- hermes-motion-mixer.test.ts hermes-pet-motion.test.ts hermes-state.test.tsx
npx pnpm@9.15.0 --filter @openscience/web typecheck
```

Expected: focused tests and Web typecheck PASS.

### Task 4: Add Semantic Anchors, Safe Paths, and Dock Preferences ✅

**Files:**

- Create: `apps/web/lib/hermes/anchor-registry.ts`
- Create: `apps/web/lib/hermes/travel-path.ts`
- Create: `apps/web/lib/hermes/dock-preferences.ts`
- Create: `apps/web/test/hermes-travel-path.test.ts`
- Create: `apps/web/test/hermes-dock-preferences.test.ts`

**Interfaces:**

- Produces:

```ts
export type HermesAnchorId =
  | 'ro-title' | 'source-import' | 'research-question'
  | 'sdf-problem' | 'sdf-insight' | 'sdf-method'
  | 'sdf-evidence' | 'sdf-results' | 'sdf-limitations'
  | 'hermes-diff' | 'commit';

export interface HermesAnchorRegistration {
  id: HermesAnchorId;
  element: () => HTMLElement | null;
  sides: Array<'top' | 'right' | 'bottom' | 'left'>;
  clearancePx: number;
  actions: Array<'explain' | 'draft' | 'check'>;
}

export function planHermesTravel(input: {
  viewport: DOMRectReadOnly;
  from: DOMRectReadOnly;
  target: DOMRectReadOnly;
  editable: DOMRectReadOnly;
  preferredSides: HermesAnchorRegistration['sides'];
}): { mode: 'travel' | 'edge-stop'; points: Array<{ x: number; y: number }>; dock: { x: number; y: number } };
```

- [x] **Step 1: Write RED geometry tests**

Cover five target positions, all four user docks, an off-screen target, a target touching the mobile keyboard inset, resize, missing target, and the invariant that the swept Hermes rectangle never intersects the editable rectangle.

- [x] **Step 2: Run RED**

Run: `npx pnpm@9.15.0 --filter @openscience/web test -- hermes-travel-path.test.ts hermes-dock-preferences.test.ts`

Expected: FAIL because registry, path, and preference adapters do not exist.

- [x] **Step 3: Implement safe-corridor planning and local preferences**

Use edge waypoints and a final target-side approach. Return `edge-stop` for off-screen targets. Store `{ workspaceId, viewportClass, xRatio, yRatio, activity, sound, particles, proactiveHints }` under one versioned localStorage key; clamp only on viewport resize, not after a deliberate overlapping user dock.

- [x] **Step 4: Run GREEN**

Run the two focused files again and require PASS.

### Task 5: Create the Single Workspace Stage and Direct Interaction — core stage complete; settings UI pending

**Files:**

- Create: `apps/web/components/hermes/HermesWorkspaceStage.tsx`
- Create: `apps/web/components/hermes/HermesDockAnchor.tsx`
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/app/dashboard/page.tsx`
- Modify: `apps/web/components/hermes/HermesVisualAdapter.tsx`
- Modify: `apps/web/app/globals.css`
- Test: `apps/web/test/e2e/hermes-workspace-stage.spec.ts`

**Interfaces:**

- Consumes: Task 2 director, Task 3 mixer, Task 4 registry/path/preferences.
- Produces: one `[data-hermes-workspace-stage]`, one `[data-hermes-instance="single"]`, and one active articulated canvas across supported route transitions.

- [x] **Step 1: Write browser RED**

The test must navigate Dashboard → RO new → RO edit without full reload and fail unless the same stage owner persists, the old Dashboard-local character is absent, user drag changes the dock, reload restores the dock, pointer fast-pass triggers avoid, click opens the drawer, and context/lifecycle resource counts balance.

- [x] **Step 2: Run RED**

Run: `npx pnpm@9.15.0 --filter @openscience/web exec playwright test test/e2e/hermes-workspace-stage.spec.ts --project=chromium`

Expected: FAIL because there is no global stage.

- [x] **Step 3: Implement the route-persistent stage**

Mount a client root from `app/layout.tsx` that lazy-loads only on `/dashboard` and `/research-objects/*`. Render the existing rig once through a body Portal. Convert the Dashboard rail into a semantic dock anchor and invocation surface, not a second renderer.

- [ ] **Step 4: Implement direct manipulation and settings**

Use pointer capture for drag, retain click-to-open, add fast-pass avoidance, and expose Quiet/Balanced/Active plus proactive hint, sound, particle, and reset-dock controls through the assistant drawer. Keep the accessible button as the input owner; the canvas remains `pointer-events:none`.

- [x] **Step 5: Run GREEN**

Run the focused E2E and Web typecheck. Require one persistent stage, one canvas, no console errors, and lifecycle balance.

### Task 6: Add Target Arrival, Quiet Co-Writing, and Mobile/Reduced Alternatives

**Files:**

- Create: `apps/web/components/hermes/HermesGuideBubble.tsx`
- Create: `apps/web/components/hermes/HermesAnchor.tsx`
- Modify: `apps/web/app/research-objects/new/page.tsx`
- Modify: `apps/web/app/research-objects/[id]/edit/page.tsx`
- Modify: `apps/web/components/editor/CoreEditor.tsx`
- Modify: `apps/web/components/editor/ArtifactUploader.tsx`
- Modify: `apps/web/messages/zh.json`
- Modify: `apps/web/messages/en.json`
- Test: `apps/web/test/e2e/hermes-field-guide.spec.ts`

**Interfaces:**

- Produces: live registrations for the first-release workflow and a bubble with `explain`, `draft`, `check`, `take-me-there`, and `dismiss` actions.

- [ ] **Step 1: Write browser RED for five representative targets**

Assert first-use automatic guidance, two-signal proactive gating, once-per-field cooldown, no pause-only prompt, safe travel, off-screen edge-stop without scroll, explicit Take me there scroll, target-side arrival, 24-character Chinese short copy, Escape cancellation, and missing-target recovery.

- [ ] **Step 2: Write mobile and reduced RED**

At 390×844 with a simulated keyboard inset, require edge/keyboard-top placement and no input overlap. With reduced motion, require no positional travel/bounce/particles while all bubble actions and content remain.

- [ ] **Step 3: Run RED**

Run: `npx pnpm@9.15.0 --filter @openscience/web exec playwright test test/e2e/hermes-field-guide.spec.ts --project=chromium`

Expected: FAIL because anchors and the guide bubble are absent.

- [ ] **Step 4: Implement semantic target bindings and guide UI**

Register RO title/import and six SDF fields plus diff/commit. Stop autonomous actions on focus/input, enter `quiet-write`, and resume only after writing settles. Keep ordinary field completion restrained; reserve dance/particles for SDF group, RO creation, commit, and publish milestones.

- [ ] **Step 5: Run GREEN**

Run the focused E2E, Web tests, and Web typecheck.

### Task 7: Connect Draft and Check Actions to Existing Reviewable Diff ✅

**Files:**

- Create: `apps/web/components/hermes/HermesDraftDiff.tsx`
- Modify: `apps/web/app/research-objects/[id]/edit/page.tsx`
- Modify: `apps/web/components/editor/SuggestionsPanel.tsx`
- Modify: `apps/web/lib/suggestions.ts`
- Modify: `apps/web/lib/api.ts`
- Modify: `packages/domain/src/agent/workspace-guide-contract.ts`
- Modify: `apps/agent-worker/src/workspace-guide.ts`
- Test: `apps/web/test/hermes-draft-diff.test.tsx`
- Test: `packages/domain/test/agent/workspace-guide-contract.test.ts`
- Test: `apps/agent-worker/test/workspace-guide.test.ts`

**Interfaces:**

- Extends the guide request with a strict route class and semantic target, never DOM text:

```ts
type WorkspaceGuideRoute = 'dashboard' | 'research-object-new' | 'research-object-edit';
type WorkspaceGuideTarget = HermesAnchorId | null;

interface WorkspaceGuidePayload {
  goal: string;
  locale: 'zh' | 'en';
  route: WorkspaceGuideRoute;
  target: WorkspaceGuideTarget;
  context: { tasks: GuideTaskContext[]; researchObjects: GuideResearchContext[] };
}
```

- Draft on the editor reuses `submitExtractTask(roId, manuscriptText)` and `coreToSuggestions`; it does not introduce a second task kind.

- [x] **Step 1: Write contract RED**

Reject unknown route/target keys, cross-workspace IDs, client-supplied field contents, and session-kind mismatch. Accept only the three route classes and known anchor IDs. Worker trusted context must still be rebuilt from membership-scoped database records.

- [x] **Step 2: Write UI RED**

Assert that draft/check creates pending `AiSuggestion` items, leaves `SdfCore` byte-identical before acceptance, applies only selected suggestion IDs, preserves rejected hunks, and records no duplicate task on retry.

- [x] **Step 3: Run RED**

Run focused Domain, Worker, and Web tests. Expected: FAIL on the new route/target contract and `HermesDraftDiff` absence.

- [x] **Step 4: Implement the strict contract and diff bridge**

Use existing extractor results and suggestion reducer. The guide bubble opens the existing Suggestions panel at the target field. Explanation can use `workspace.guide`; drafting uses `sdf.extract`; checking maps result suggestions without writing.

- [x] **Step 5: Run GREEN**

Run:

```powershell
npx pnpm@9.15.0 --filter @openscience/domain test -- workspace-guide-contract.test.ts
npx pnpm@9.15.0 --filter @openscience/agent-worker test -- workspace-guide.test.ts
npx pnpm@9.15.0 --filter @openscience/web test -- hermes-draft-diff.test.tsx
npx pnpm@9.15.0 --filter @openscience/domain typecheck
npx pnpm@9.15.0 --filter @openscience/agent-worker typecheck
npx pnpm@9.15.0 --filter @openscience/web typecheck
```

Expected: all focused tests and affected typechecks PASS.

### Task 8: Prove Rich Motion, Guidance Honesty, Performance, and Release Safety

**Files:**

- Create: `apps/web/test/visual/hermes-companion-motion-gate.mjs`
- Create: `apps/web/test/visual/hermes-guidance-geometry-gate.mjs`
- Modify: `apps/web/test/visual/hermes-release-gate.mjs`
- Modify: `apps/web/package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/progress.md`
- Modify: `docs/handoff/2026-08-16-hermes-2d-pet-handoff.md`
- Modify: `project_index.md`

**Interfaces:**

- Produces ignored screenshots, a 90-second idle/action video, JSON metrics, and one package-level `test:hermes-companion-release` command.

- [x] **Step 1: Write failing perceptual gates**

Require at least eight classified visible actions in 90 seconds, no consecutive duplicate, a maximum 4.5-second product gap, at least two signatures, a minimum 210px Dashboard canvas, and distinct real-pixel vectors for head/torso/tail/crown/eye. Add a whole-affine mutation and a single-loop mutation that must fail.

- [x] **Step 2: Write failing guide geometry and write-safety gates**

Exercise five target positions from four user docks; sample the swept character rectangle against editable bounds; prove off-screen no-scroll before activation; prove mobile/reduced alternatives; prove SDF bytes unchanged before diff acceptance and changed only in selected fields afterward.

- [x] **Step 3: Run RED**

Run the new gates against the pre-feature baseline and record the expected missing-stage/action/anchor failures.

- [x] **Step 4: Run final GREEN sequence**

Run, sequentially:

```powershell
npx pnpm@9.15.0 --filter @openscience/web test
npx pnpm@9.15.0 --filter @openscience/domain test
npx pnpm@9.15.0 --filter @openscience/agent-worker test
npx pnpm@9.15.0 --filter @openscience/api test
npx pnpm@9.15.0 --filter @openscience/ai-gateway test
npx pnpm@9.15.0 typecheck
npx pnpm@9.15.0 build
npx pnpm@9.15.0 --filter @openscience/web test:hermes-companion-release
npx pnpm@9.15.0 lint
npx pnpm@9.15.0 docs:lint
npx pnpm@9.15.0 audit:docs-sync
git diff --check
```

Expected: all commands exit 0; production visual harness routes remain 404 without the explicit test flag.

- [ ] **Step 5: Independent review and user visual gate**

Run architecture, security, and perceptual evidence review. Fix every Critical/Important finding, rerun affected gates, keep the local preview alive, and present the actual Workspace video/live URL. Do not stage, commit, push, or deploy until the user accepts that final visual.

2026-08-17 implementation note: the first candidate failed because 27 catalogue entries were folded into about five shared mesh poses and subpixel base motion. A second candidate still failed the user's real product gate because the 181px role, brief sine pulse, 4–8 second gaps, and synchronized base layer made valid pixel deltas perceptually weak. A third 213px/action-specific candidate still looked fixed because the character's screen-space silhouette never left the same origin. The current implementation retains mesh articulation and adds one bounded whole-character layer: at least six autonomous actions move the actual product silhouette by 8px, patrol leaves by 30px and returns within 6px, pointer moves by 8px and resets its contribution. Autonomous actions may not be replaced before their declared duration; patrol is 4.2s, within the 4.5s visual-gap contract. The latest production aggregate gate exits `0`; this step remains unchecked only because final user visual acceptance has not yet occurred.

### Task 9: Prove the Real MiniMax Ingestion Boundary

**Files:**

- Modify: `apps/agent-worker/src/extractor.ts`
- Modify: `apps/agent-worker/src/index.ts`
- Modify: `packages/domain/src/ingestion/ingestion-types.ts`
- Test: `apps/agent-worker/test/extractor.test.ts`
- Test: `packages/domain/test/ingestion/ingestion-service.test.ts`

- [x] **Step 1: RED — source-aware six-field contract**

Pass a manuscript whose limitations and reproducibility occur after character 8,000. Require all supported fields to include source locators and unsupported fields to set `needsMoreInformation`; the old leading-slice extractor must fail.

- [x] **Step 2: GREEN — bounded section-aware extraction**

Parse bounded sections/chunks, call MiniMax only through `AiGateway`, validate every structured response, merge field candidates deterministically, and retain source locators. Do not write SDF.

- [ ] **Step 3: real provider smoke test**

Use the running ECS Postgres, Redis, SeaweedFS, API and worker; do not start local Docker. Use the existing MiniMax Secret without printing it. Submit the public arXiv PDF and require a succeeded `sdf.extract` task with six valid field decisions and persisted model-call audit metadata.

2026-08-17 latest checkpoint: pinned `2009.06045v1` (SHA-256 `d57d…484a`, 24,671,920 bytes) completed the hardened ECS flow through ClamAV and the no-network parser sidecar. The latest model returned three evidence-backed decisions plus explicit missing-information decisions for problem/insight/reproducibility. The browser gate still does not independently query the persisted model-call audit row, so this step remains open.

### Task 10: Connect the Real Paper Result to Reviewable Diff

**Files:**

- Modify: `apps/web/app/research-objects/[id]/edit/page.tsx`
- Modify: `apps/web/lib/api.ts`
- Modify: `apps/web/components/hermes/HermesDraftDiff.tsx`
- Test: `apps/web/test/e2e/hermes-real-ro-flow.spec.ts`

- [ ] **Step 1: RED — reject current-SDF extraction**

Create a blank RO, import the PDF, invoke Hermes Draft, and assert the submitted task references the ingestion artifact/result rather than `Object.values(state.core)`. Require unchanged SDF before review.

- [ ] **Step 2: GREEN — ingestion result to per-field proposals**

Load the completed ingestion task, map field text and locators into suggestions, show before/after/source, and allow accept/edit/reject per field. Confirm through the ingestion endpoint with the current RO version; commit only after the accepted SDF write succeeds.

- [ ] **Step 3: semantic score**

Compare the real MiniMax output with the six-field gold rubric. Require no unsupported factual additions, quantitative results to preserve values/units, every accepted field to have a source locator or explicit missing marker, and at least five of six fields to meet the rubric without manual rewriting.

2026-08-17 latest checkpoint: production RO `7e3665f3-ac08-438f-9ccc-f35e99c6b677` completed pre-confirm-empty → bulk review → exact proposal/disclosure write → version 2 → commit versionNo 2; semantic checks preserved optical-field/on-chip/quantitative facts. It still does not expose or prove accept/edit/reject per field with an independently asserted source panel, audit evidence, or the full six-field gold rubric. The smoke remains evidence, not Task 10 completion.

### Task 11: Bind Companion Performance to the Real Workflow

**Files:**

- Modify: `apps/web/lib/hermes/action-catalog.ts`
- Modify: `apps/web/lib/hermes/behavior-director.ts`
- Modify: `apps/web/components/hermes/HermesWorkspaceStage.tsx`
- Test: `apps/web/test/hermes-behavior-director.test.ts`
- Test: `apps/web/test/e2e/hermes-real-ro-flow.spec.ts`
- Modify: `apps/web/test/visual/hermes-companion-motion-gate.mjs`

- [ ] **Step 1: RED — task-state motion attribution**

Require distinct real-pixel action sequences for upload, parsing, field locate, drafting, missing information, diff wait, field accepted, SDF complete, commit celebration and failure. Require the character to reach the matching semantic anchor without covering its input.

- [ ] **Step 2: GREEN — state-driven performance**

Feed durable ingestion/task/diff/commit states into the existing director; keep idle variation underneath but let real work take priority. Success and failure actions may start only after their durable state transition.

- [ ] **Step 3: full production acceptance**

Record one uninterrupted real-browser run from blank RO through committed version, with no route interception. Verify permissions, AI Credit reservation, idempotency, retry/refresh, audit, exact accepted writes, action attribution, reduced-motion alternative, and resource cleanup. Keep the preview uncommitted and undeployed until user visual approval.

2026-08-17 latest production checkpoint: the real browser gate exits 0 in 85 seconds for blank RO → pinned arXiv upload → ClamAV → isolated parse → MiniMax → review → disclosure → confirm → version commit. A real Dashboard guide then succeeded in 13.7 seconds, found the canonical RO's reproducibility/duplicate-draft gaps and returned only authorized links. Task 11 remains open because the uninterrupted run has not attributed every durable state to distinct character pixels or covered reduced-motion/resource cleanup in that same run.
