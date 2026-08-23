# Hermes Wanko Live2D Companion Implementation Plan

> **Status (2026-08-24): CURRENT IN PROGRESS — Task 21 implementation/local review are complete; deployment and public acceptance remain.**
> The ECS baseline is `c97926a`, the approved product endpoints are `360/200px`,
> and this task changes presentation and interaction only, never v09 source art.
> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved v09 Hermes as a `360/200px` movable work assistant with quiet, collision-safe bubbles and truthful semantic actions on the real Dashboard.

**Architecture:** `HermesWorkspaceStage` remains the single route-persistent product owner and the v09 Cubism bundle remains byte-identical. Pure placement functions resolve stage size, settled drag positions and bubble quadrants from measured footprints and protected Dashboard rectangles; React owns orchestration, CSS owns only the approved optical-editorial material and motion treatment.

**Tech Stack:** Next.js 14, React 18, TypeScript, Pixi 7, `pixi-live2d-display` Cubism 4 adapter, Live2D Cubism Core for Web, Vitest, Playwright.

## Global Constraints

- `docs/specs/2026-08-19-hermes-wanko-live2d-design.md` is the only CURRENT Hermes visual renderer design.
- Preserve the existing `HermesWorkspaceStage`, semantic anchors, safe path planner, user dock, guide bubble, reviewable diff, permission, AI Credit and audit boundaries.
- One visible Hermes, one Live2D model, one canvas and one runtime owner across supported routes.
- Wanko is the genie and remains the largest/cutest mass; the lamp occupies about `32%` of combined opaque height and its neutral width is at most `1.25x` Wanko body width.
- The model-owned lamp has a low oval body, narrow gold opening, slender upturned spout and open S-shaped handle. Kettle, cup, bowl, saucer, UFO, thick round handle and symmetric clip-art silhouettes fail immediately.
- Reuse the native bowl Part/deformer and rear → Wanko → front rim → hands structure; do not stretch the red-bowl pixels or regenerate/remap canonical Wanko ArtMeshes.
- Separate visual alpha, `44px`-minimum interaction and travel/non-obstruction bounds; effects never enlarge collision.
- Approval and explicit reduced-motion are completely still while retaining controls and guidance content.
- Reduced and approval use deterministic non-empty frames from the same Cubism model; runtime failure exposes the accessible textual Hermes control, never a poster or decorative character image.
- Runtime publication contains only the closed Cubism bundle; editable Wanko/Photoshop/Cubism source stays outside the public bundle.
- Do not install a new image or browser dependency. Use the installed Photoshop 2024, Cubism Editor 5.3.03 PRO Trial and existing Playwright stack. AI-redrawn Wanko pixels and flattened concept art cannot become source ArtMeshes.
- ADR-010 and the deployed NOTICE record the operator's development-stage terms acceptance; this task may update the already authorized ECS development deployment but must not claim a verified publication licence or legal identity.
- Do not use local Docker, read `.env`, or treat a local browser gate as ECS evidence.

---

### Task 1: Establish the asset and legal provenance boundary

**Files:**
- Create: `apps/web/public/hermes/live2d/wanko/` runtime asset tree
- Create: `apps/web/public/hermes/live2d/NOTICE.md`
- Create: `apps/web/test/hermes-live2d-asset-contract.test.ts`
- Modify: `project_index.md`

**Interfaces:**
- Produces `/hermes/live2d/wanko/wanko_touch.model3.json` and a deterministic runtime inventory.
- Does not publish `.cmo3`, `.can3`, archives or alternative models.

- [x] **Step 1: Write the failing asset contract**

Assert the exact model, texture, physics, display and twelve motion files; reject
source extensions and absolute/parent-relative references; verify model3 paths
resolve inside the Wanko runtime root and the NOTICE records source URL,
copyright wording and SHA-256 hashes.

- [x] **Step 2: Run RED**

Run:

```powershell
npx pnpm@9.15.0 --filter @openscience/web exec vitest run test/hermes-live2d-asset-contract.test.ts
```

Expected: FAIL because the runtime asset tree and NOTICE do not exist.

- [x] **Step 3: Add only the verified runtime files**

Copy the verified local Wanko runtime files, preserve their original bytes, and
write the provenance notice. Do not copy the source project or zip.

- [ ] **Step 4: Run GREEN**

Rerun the focused contract and require all inventory/hash/path assertions to pass.

### Task 2: Add the Wanko action director

**Files:**
- Create: `apps/web/lib/hermes/wanko-action-director.ts`
- Test: `apps/web/test/hermes-wanko-action-director.test.ts`
- Modify: `apps/web/lib/hermes/action-catalog.ts`

**Interfaces:**

```ts
export interface WankoPerformance {
  motion: { group: WankoMotionGroup; index: number; priority: 1 | 2 | 3 } | null;
  parameters: Readonly<Record<WankoParameterId, number>>;
  presentation: 'quiet' | 'evidence' | 'trail' | 'celebrate' | 'missing';
}

export function resolveWankoPerformance(action: HermesActionId): WankoPerformance;
```

- [x] **Step 1: Write RED for 24 real behaviour profiles**

Require at least 24 unique tuples across motion group/index, parameter envelope
and presentation. Lock approval to no motion, failed-settle to a restrained pose,
and milestone-dance to a real motion plus celebration presentation.

- [x] **Step 2: Run RED**

Run the new director test. Expected: FAIL because the resolver does not exist.

- [x] **Step 3: Implement the minimal deterministic mapping**

Map every production `HermesActionId` to the existing Wanko motion inventory and
bounded parameter values. Use the action ID plus a supplied deterministic seed
for idle variation; never use unseeded randomness in tests.

- [x] **Step 4: Run GREEN and refactor**

Require the new test and existing behaviour-director tests to pass.

### Task 3: Implement one abortable Live2D renderer owner

**Files:**
- Create: `apps/web/lib/hermes/wanko-live2d-renderer.ts`
- Create: `apps/web/lib/hermes/live2d-core-loader.ts`
- Create: `apps/web/test/hermes-wanko-renderer-contract.test.ts`
- Modify: `apps/web/package.json`
- Modify: root `pnpm-lock.yaml`

**Interfaces:**

```ts
export interface HermesLive2DSnapshot {
  action: HermesActionId;
  drawnAt: number;
  motionGroup: string | null;
  status: 'ready';
}

export async function createWankoLive2DRenderer(
  canvas: HTMLCanvasElement,
  stage: HTMLElement,
  readInput: () => HermesPetMeshInput,
  publish: (snapshot: HermesLive2DSnapshot) => void,
  signal: AbortSignal,
): Promise<HermesLive2DOwner>;
```

- [x] **Step 1: Write lifecycle and dependency RED**

Assert lazy browser-only imports, one canvas/model, abort-before-load cleanup,
hidden/offscreen suspension, resize, wake, one context-loss notification and
idempotent disposal. The test must fail if timers/listeners/tickers survive.

- [x] **Step 2: Run RED**

Run the renderer contract. Expected: FAIL because the loader/owner do not exist.

- [x] **Step 3: Add pinned dependencies and minimal owner**

Pin the tested Pixi/Cubism adapter versions, load Cubism Core once, construct the
model on the supplied canvas, disable Pixi pointer ownership, and publish a
heartbeat only after a real draw. Apply motion only when action changes.

- [x] **Step 4: Run GREEN**

Rerun the renderer contract and Web typecheck.

### Task 4: Replace only the portrait runtime

**Files:**
- Modify: `apps/web/components/hermes/HermesRiggedPortrait.tsx`
- Modify: `apps/web/components/hermes/HermesVisualAdapter.tsx`
- Modify: `apps/web/components/hermes/HermesWorkspaceStage.tsx`
- Modify: `apps/web/app/globals.css`
- Test: `apps/web/test/e2e/hermes-dashboard.spec.ts`
- Test: `apps/web/test/e2e/hermes-workspace-stage.spec.ts`

**Interfaces:**
- Consumes the Task 3 owner without changing `HermesWorkspaceStage` task/anchor APIs.
- Produces `data-hermes-rig="live2d-wanko"` and the existing runtime status/retry contract.

- [x] **Step 1: Write browser RED**

Require one Wanko canvas, real nontransparent character pixels, the existing
single-stage route transfer, approval/reduced still, focus/pointer input, fresh
canvas after one context loss and stable fallback after the second.

- [x] **Step 2: Run RED**

Run the two focused Playwright files. Expected: FAIL on the missing Live2D rig.

- [x] **Step 3: Swap the runtime and presentation styles**

Keep the current accessible fallback/control and lifecycle generation logic.
Replace the mesh dynamic import with the Wanko owner and add external evidence,
trail and celebration layers keyed from the resolved presentation state.

- [x] **Step 4: Run GREEN**

Rerun focused E2E, the affected Vitest files and Web typecheck.

### Task 5: Prove rich idle, interaction and guide choreography

**Files:**
- Create: `apps/web/app/_visual/hermes-live2d/page.tsx`
- Create: `apps/web/app/%5Fvisual/hermes-live2d/page.tsx`
- Create: `apps/web/test/visual/hermes-live2d-motion-gate.mjs`
- Modify: `apps/web/test/visual/hermes-release-gate.mjs`
- Modify: `apps/web/package.json`

**Interfaces:**
- Produces deterministic action controls, ignored screenshots/video and JSON pixel metrics.

- [x] **Step 1: Write perceptual RED**

Measure real canvas pixels for 24 action fixtures, a 90-second seeded idle run,
pointer A/B, drag, guide arrival, work, missing, success, approval and reduced.
Require unique pixel vectors, no immediate idle duplicate, no gap longer than
4.5 seconds, two signature actions and nontransparent live frames.

- [x] **Step 2: Add path/lifecycle assertions**

Reuse the current safe-travel and footprint gates. Require the Wanko actor to
settle before the guide bubble appears, retain one canvas across route transfer,
and balance all listeners/tickers/context ownership after unmount.

- [x] **Step 3: Run RED then GREEN**

Run the new gate before integration to record the missing Live2D fixture RED;
after Tasks 1–4 rerun and require exit 0. Production harness routes remain 404
unless the explicit visual-test flag is enabled.

### Task 6: Run the real blank-RO workflow and clean superseded artefacts

**Files:**
- Modify: `apps/web/test/visual/hermes-blank-ro-production-gate.mjs`
- Modify: `docs/progress.md`
- Modify: `docs/handoff/2026-08-16-hermes-2d-pet-handoff.md`
- Modify: `project_index.md`
- Modify: superseded Hermes spec/plan status headers

**Interfaces:**
- Reuses the existing production-safe blank-RO workflow; no new API or task kind.

- [x] **Step 1: Extend the product gate without network interception**

Attribute ingestion, missing evidence, diff review, commit and celebration to
real Wanko pixels while retaining unchanged permission, credit, idempotency,
evidence and immutable-version assertions.

- [x] **Step 2: Run the complete local release sequence**

Run sequentially:

```powershell
npx pnpm@9.15.0 --filter @openscience/web test
npx pnpm@9.15.0 --filter @openscience/web typecheck
npx pnpm@9.15.0 --filter @openscience/web build
npx pnpm@9.15.0 --filter @openscience/web test:hermes-release
npx pnpm@9.15.0 lint
npx pnpm@9.15.0 docs:lint
npx pnpm@9.15.0 audit:docs-sync
git diff --check
```

- [x] **Step 3: Clean only verified superseded artefacts**

Keep the named rejected sprite stash. In the historical constellation-dragon
worktree retain the latest `.blend`; remove only exact validated `.blend1`,
generated render/contact-sheet files and generated inspection artefacts. Do not
remove user-provided Live2D source archives during this task.

- [ ] **Step 4: User visual gate**

Keep a local preview available and give the user the actual Workspace URL plus
the uninterrupted video. Do not commit or deploy until the user accepts the
live visual. Public deployment additionally requires the recorded Live2D licence
decision and a separate confirmed ECS operation.

### Task 7: HISTORICAL — superseded Citation-Thread Puppy presentation

> Do not execute or resume this task. Its completed checks describe the existing
> recoverable local candidate, not the approved compact starship-carrier target.

**Files:**
- Create: `apps/web/lib/hermes/wanko-model-presentation.ts`
- Test: `apps/web/test/hermes-wanko-renderer-contract.test.ts`
- Test: `apps/web/test/hermes-wanko-action-director.test.ts`
- Modify: `apps/web/lib/hermes/wanko-live2d-renderer.ts`
- Modify: `apps/web/lib/hermes/wanko-action-director.ts`
- Modify: `apps/web/components/hermes/HermesRiggedPortrait.tsx`
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/test/visual/hermes-live2d-motion-gate.mjs`

**Interfaces:**

```ts
export interface WankoPartState {
  getPartCount(): number;
  getPartId(index: number): unknown;
  setPartOpacityByIndex(index: number, opacity: number): void;
}

export function hideWankoLegacyPresentation(parts: WankoPartState): number;
```

The helper returns `3` only after setting `PARTS_01_BACKGROUND`,
`PARTS_01_BOWL` and `PARTS_01_EFFECT` to zero. The renderer calls it inside the existing
`beforeModelUpdate` listener so motions cannot restore the rejected parts.

- [x] **Step 1: Write the focused RED**

Add a real Cubism-wrapper helper contract that expects all three legacy parts to
become zero without changing `PARTS_01_BODY`. Add an action-director contract
that rejects `PARAM_BOWL_LID`, `PARAM_BOWL_SWING`, `PARAM_EFFECT`,
`PARAM_YUGE_01` and `PARAM_YUGE_02` from all production profiles. The production
changes that make these tests fail are a missing per-frame part mask or any
bowl/steam/spotlight-dependent product action.

- [x] **Step 2: Run RED**

Run:

```powershell
npx pnpm@9.15.0 --filter @openscience/web exec vitest run test/hermes-wanko-renderer-contract.test.ts test/hermes-wanko-action-director.test.ts
```

Expected: FAIL because the helper does not exist and current profiles still use
bowl/steam parameters.

- [x] **Step 3: Implement the minimal model presentation**

Create the pure helper, require exactly three matched parts during renderer
initialization, reapply it before every model update, and replace bowl/steam
profile values with existing body, ear, hand, face and swing parameters. Do not
change the pinned model, texture or motion files.

- [x] **Step 4: Run focused GREEN**

Rerun the two tests and Web typecheck. Require all action signatures to remain
at least 24 distinct profiles.

- [x] **Step 5: Write the perceptual RED**

Extend the native visual gate before changing markup or CSS. Require the real
normal-motion canvas to contain a visible puppy while the rejected red/orange
lower-field population is below the literal bound established by the bowl-free
diagnostic. Require one `.hermes-wanko-citation-thread`, one contact shadow and
two paper fibres; require the thread path length/state to differ between quiet,
evidence, trail and celebrate. Require approval/reduced to hide every brand
layer. The production changes that make this gate fail are restoring the bowl,
rendering an inert overlay, or leaking motion into still states.

- [x] **Step 6: Run native RED**

Run the exact Wanko visual gate against a fresh owned harness server. Expected:
FAIL on the current red bowl/orange ground and missing citation-thread layers.

- [x] **Step 7: Implement the approved brand layer**

Replace evidence-dot/page-card/confetti markup with one inline SVG citation
thread, one soft contact shadow and exactly two paper fibres. Use only CSS
opacity, transform and stroke-dashoffset driven by existing
`data-hermes-action` and `data-hermes-wanko-presentation`; do not add timers,
RAF owners, canvas effects or new dependencies. The local atmosphere is a
subtle black-green radial paper value step, not a decorative background.

- [x] **Step 8: Run native GREEN and inspect real frames**

Rerun the gate, save quiet/evidence/trail/success Workspace frames and inspect
them at desktop and mobile widths. Require no white strip, orange ellipse,
floating square, pedestal, starfield or target obstruction.

- [ ] **Step 9: Run the complete affected release sequence**

Run the focused contracts, focused Hermes E2E, full Web tests, Web typecheck,
production build, Wanko native/companion/release gates, product release gate,
canonical lint, docs lint/sync and `git diff --check` sequentially.

- [ ] **Step 10: Present the actual Workspace visual gate**

Keep an owned local preview available and provide the actual Workspace URL plus
an uninterrupted idle/interaction/guide/success recording. Do not commit or
deploy until the user accepts this refined live visual; the existing Live2D
publication licence gate remains separate and mandatory.

---

## Remaining compact starship-carrier implementation

### Task 8: Author and lock the transparent carrier asset package

**Files:**

- Create: `apps/web/assets/hermes/carrier/carrier-rear-desktop-master.png`
- Create: `apps/web/assets/hermes/carrier/carrier-rear-mobile-master.png`
- Create: `apps/web/assets/hermes/carrier/carrier-front-desktop.svg`
- Create: `apps/web/assets/hermes/carrier/carrier-front-mobile.svg`
- Create: `apps/web/assets/hermes/carrier/carrier-glow.svg`
- Create: `apps/web/assets/hermes/carrier/carrier-shadow.svg`
- Create: `apps/web/assets/hermes/carrier/README.md`
- Create: `apps/web/public/hermes/carrier/carrier-rear-desktop.png`
- Create: `apps/web/public/hermes/carrier/carrier-rear-mobile.png`
- Create: `apps/web/public/hermes/carrier/carrier-front-desktop.svg`
- Create: `apps/web/public/hermes/carrier/carrier-front-mobile.svg`
- Create: `apps/web/public/hermes/carrier/carrier-glow.svg`
- Create: `apps/web/public/hermes/carrier/carrier-shadow.svg`
- Create: `apps/web/public/hermes/carrier/NOTICE.md`
- Create: `apps/web/lib/hermes/wanko-carrier-assets.ts`
- Create: `apps/web/scripts/export-hermes-carrier-assets.mjs`
- Create: `apps/web/test/hermes-wanko-carrier-asset-contract.test.ts`
- Modify: `project_index.md`

**Interfaces:**

```ts
export type WankoCarrierVariant = 'desktop' | 'mobile';

export interface WankoCarrierAssetSet {
  rear: string;
  front: string;
  glow: string;
  shadow: string;
  runtimeSize: 768 | 1024;
}

export const WANKO_CARRIER_ASSETS: Readonly<
  Record<WankoCarrierVariant, WankoCarrierAssetSet>
>;
```

The source masters are never referenced by browser code. Every public file is
listed with SHA-256 in `NOTICE.md`; no Wanko source project, flattened concept
dog, archive, `.cmo3` or `.can3` enters this carrier directory.

- [x] **Step 1: Write the failing asset contract**

Create a test that reads PNG IHDR bytes directly and parses SVG text without a
new image dependency:

```ts
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { WANKO_CARRIER_ASSETS } from '@/lib/hermes/wanko-carrier-assets';

function pngHeader(path: string) {
  const bytes = readFileSync(path);
  return {
    colorType: bytes[25],
    height: bytes.readUInt32BE(20),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    width: bytes.readUInt32BE(16),
  };
}

it('publishes aligned transparent desktop and mobile carrier assets', () => {
  expect(WANKO_CARRIER_ASSETS.desktop.runtimeSize).toBe(1024);
  expect(WANKO_CARRIER_ASSETS.mobile.runtimeSize).toBe(768);
  for (const variant of ['desktop', 'mobile'] as const) {
    const set = WANKO_CARRIER_ASSETS[variant];
    const rear = resolve(process.cwd(), 'public', set.rear.slice(1));
    expect(existsSync(rear), `${variant} rear`).toBe(true);
    expect(pngHeader(rear)).toMatchObject({
      colorType: 6,
      height: set.runtimeSize,
      width: set.runtimeSize,
    });
    for (const svgPath of [set.front, set.glow, set.shadow]) {
      const svg = readFileSync(resolve(process.cwd(), 'public', svgPath.slice(1)), 'utf8');
      expect(svg).toContain('viewBox="0 0 2048 2048"');
      expect(svg).not.toMatch(/<text|data:image|https?:/i);
    }
  }
});
```

Also require both `2048x2048` RGBA source masters, exact cockpit/travel/shadow
anchors in the source README, complete public hashes in NOTICE, and absence of
the concept filename or Wanko binaries from the carrier inventory.

- [x] **Step 2: Run RED**

Run:

```powershell
npx pnpm@9.15.0 --filter @openscience/web exec vitest run test/hermes-wanko-carrier-asset-contract.test.ts
```

Expected: FAIL because the carrier module and assets do not exist.

- [x] **Step 3: Generate the dog-free rear masters and author aligned vectors**

Use the approved concept only for vehicle language. Generate two transparent,
dog-free rear masters with this invariant prompt:

```text
Compact cosmic-teapot starship rear hull only, transparent 2048x2048 canvas,
no dog, no animal, no text, no background, no pedestal. Deep blue-black enamel,
thin warm-gold cockpit rim, very short inward-curving spout and handle. Cockpit
centre at 1024,1060; travel anchor at 1024,1340; shadow anchor at 1024,1510.
Desktop full width must stay within 1.55 times the later Wanko body width.
```

For mobile, change the final sentence to require `1.30x` and visibly shorten
the spout/handle again. Author front-rim SVGs on the same `2048` viewBox; their
opaque geometry may cover only the lower `18%` of the future Wanko body. Author
glow and shadow as separate SVGs. Do not paint steam, particles or a dog into
any hull file.

- [x] **Step 4: Export runtime PNGs with existing Playwright**

Implement `export-hermes-carrier-assets.mjs` with the installed Playwright: load
each master as a data URL in an empty transparent page, render it at `1024px` or
`768px`, and call `locator.screenshot({ omitBackground: true })`. Copy the SVGs
byte-for-byte, compute all public hashes, and write NOTICE. The script refuses
to overwrite a non-matching approved output unless `--confirm` is supplied.

Run:

```powershell
npx pnpm@9.15.0 --filter @openscience/web exec node scripts/export-hermes-carrier-assets.mjs
```

Expected: six runtime layer files plus NOTICE, with no new dependency.

- [x] **Step 5: Inspect the isolated art and obtain the art gate**

Render rear, front, glow and shadow separately and as a dog-free composite at
desktop and mobile sizes. Confirm transparent background, compact appendages,
no baked dog/text/effects, and common anchors. Present those frames to the user.
Do not integrate an unapproved carrier or commit the existing dirty branch.

- [x] **Step 6: Run GREEN**

Rerun the focused asset contract. Expected: all inventory, dimension, alpha,
anchor and hash assertions pass.

### Task 9: Add pure carrier layout and bound contracts

**Files:**

- Create: `apps/web/lib/hermes/wanko-carrier-layout.ts`
- Create: `apps/web/test/hermes-wanko-carrier-layout.test.ts`
- Modify: `apps/web/lib/hermes/wanko-model-presentation.ts`
- Modify: `apps/web/test/hermes-wanko-renderer-contract.test.ts`

**Interfaces:**

```ts
export interface WankoCarrierLayout {
  frontOcclusionRatio: number;
  handleExtensionRatio: number;
  masterSize: 2048;
  maxWidthRatio: number;
  modelAnchor: { x: number; y: number };
  runtimeSize: 768 | 1024;
  spoutExtensionRatio: number;
}

export const WANKO_CARRIER_LAYOUT: Readonly<
  Record<WankoCarrierVariant, WankoCarrierLayout>
>;

export function resolveWankoCarrierVariant(viewportWidth: number): WankoCarrierVariant;
```

`getWankoModelPlacement` gains a final optional `variant` argument and remains
the only model-placement function consumed by the Live2D owner.

- [x] **Step 1: Write geometry RED**

```ts
expect(WANKO_CARRIER_LAYOUT.desktop).toMatchObject({
  frontOcclusionRatio: .18,
  handleExtensionRatio: .22,
  masterSize: 2048,
  maxWidthRatio: 1.55,
  modelAnchor: { x: 1024, y: 850 },
  runtimeSize: 1024,
  spoutExtensionRatio: .28,
});
expect(WANKO_CARRIER_LAYOUT.mobile).toMatchObject({
  frontOcclusionRatio: .18,
  maxWidthRatio: 1.30,
  modelAnchor: { x: 1024, y: 820 },
  runtimeSize: 768,
});
expect(resolveWankoCarrierVariant(640)).toBe('mobile');
expect(resolveWankoCarrierVariant(641)).toBe('desktop');
```

Extend the placement contract to require the desktop and mobile model centres
to map to those normalized anchors and to leave the lower cockpit region free.

- [x] **Step 2: Run RED**

Run:

```powershell
npx pnpm@9.15.0 --filter @openscience/web exec vitest run test/hermes-wanko-carrier-layout.test.ts test/hermes-wanko-renderer-contract.test.ts
```

Expected: FAIL because the layout module and variant placement do not exist.

- [x] **Step 3: Implement the immutable layout**

Use exact approved values; do not infer them from viewport screenshots:

```ts
export const WANKO_CARRIER_LAYOUT = Object.freeze({
  desktop: Object.freeze({
    frontOcclusionRatio: .18,
    handleExtensionRatio: .22,
    masterSize: 2048,
    maxWidthRatio: 1.55,
    modelAnchor: Object.freeze({ x: 1024, y: 850 }),
    runtimeSize: 1024,
    spoutExtensionRatio: .28,
  }),
  mobile: Object.freeze({
    frontOcclusionRatio: .18,
    handleExtensionRatio: .16,
    masterSize: 2048,
    maxWidthRatio: 1.30,
    modelAnchor: Object.freeze({ x: 1024, y: 820 }),
    runtimeSize: 768,
    spoutExtensionRatio: .20,
  }),
});
```

Map normalized model anchors to the actual stage. Keep page travel outside this
module and never use `PARAM_BASE_X/Y` for navigation.

- [x] **Step 4: Run GREEN**

Rerun both focused tests and Web typecheck. Expected: geometry and existing
legacy-part/renderer contracts pass without widening the Live2D owner API.

### Task 10: Compose one carrier scene around the existing Wanko canvas

**Files:**

- Create: `apps/web/components/hermes/WankoCarrierScene.tsx`
- Create: `apps/web/test/hermes-wanko-carrier-scene.test.tsx`
- Modify: `apps/web/components/hermes/HermesRiggedPortrait.tsx`
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/test/e2e/hermes-dashboard.spec.ts`

**Interfaces:**

```ts
export interface WankoCarrierSceneProps {
  children: React.ReactNode;
  poster: React.ReactNode;
}

export function WankoCarrierScene(props: WankoCarrierSceneProps): React.JSX.Element;
```

The scene owns layer order only. `HermesRiggedPortrait` continues to own runtime
lifecycle/status, and the existing canvas remains the only live model surface.

- [x] **Step 1: Write markup and layering RED**

Use `renderToStaticMarkup` to require exactly one of every structural layer:

```ts
const html = renderToStaticMarkup(
  <WankoCarrierScene poster={<img alt="" src="/poster.png" />}>
    <canvas data-live2d-instance="wanko" />
  </WankoCarrierScene>,
);
expect(html.match(/data-hermes-carrier-rear=/g)).toHaveLength(1);
expect(html.match(/data-live2d-instance=/g)).toHaveLength(1);
expect(html.match(/data-hermes-carrier-front=/g)).toHaveLength(1);
expect(html.match(/data-hermes-carrier-glow=/g)).toHaveLength(1);
expect(html.match(/data-hermes-carrier-travel-hull=/g)).toHaveLength(1);
expect(html.match(/data-hermes-carrier-interaction-hull=/g)).toHaveLength(1);
expect(html).not.toMatch(/citation-thread|paper-fibre|ground-layer/);
```

Extend Dashboard E2E to require one carrier, one Wanko canvas and no old
Citation-Thread nodes.

- [x] **Step 2: Run RED**

Run:

```powershell
npx pnpm@9.15.0 --filter @openscience/web exec vitest run test/hermes-wanko-carrier-scene.test.tsx
npx pnpm@9.15.0 --filter @openscience/web exec playwright test test/e2e/hermes-dashboard.spec.ts --config playwright.config.ts
```

Expected: FAIL because the carrier scene is absent and old presentation markup
still renders.

- [x] **Step 3: Implement the layer owner**

Render this fixed order inside `WankoCarrierScene`:

```tsx
<span className="hermes-wanko-carrier" data-hermes-carrier="true">
  <span aria-hidden="true" className="hermes-carrier-shadow" data-hermes-carrier-shadow="true" />
  <picture aria-hidden="true" className="hermes-carrier-rear" data-hermes-carrier-rear="true">
    <source media="(max-width: 640px)" srcSet="/hermes/carrier/carrier-rear-mobile.png" />
    <img alt="" draggable={false} src="/hermes/carrier/carrier-rear-desktop.png" />
  </picture>
  <span className="hermes-carrier-interaction-hull" data-hermes-carrier-interaction-hull="true">
    {children}
  </span>
  <picture aria-hidden="true" className="hermes-carrier-front" data-hermes-carrier-front="true">
    <source media="(max-width: 640px)" srcSet="/hermes/carrier/carrier-front-mobile.svg" />
    <img alt="" draggable={false} src="/hermes/carrier/carrier-front-desktop.svg" />
  </picture>
  <span aria-hidden="true" className="hermes-carrier-glow" data-hermes-carrier-glow="true" />
  <span aria-hidden="true" className="hermes-carrier-effects" data-hermes-carrier-effects="true" />
  <span aria-hidden="true" className="hermes-carrier-travel-hull" data-hermes-carrier-travel-hull="true" />
  {poster}
</span>
```

Use `<source media="(max-width: 640px)">` for compact rear/front assets. Keep
shadow, rear and front mounted in every normal state. Drive hover (`<=2px`),
roll (`<=1deg`), travel bank (`<=3deg`), glow and trail only from existing
`data-hermes-action` / `data-hermes-wanko-presentation` selectors. Remove the
Citation-Thread, paper-fibre and ground-layer markup and CSS. Do not add a timer,
hook, observer, canvas or RAF.

- [x] **Step 4: Enforce still states and pointer ownership**

Set all decorative layers `pointer-events:none`. Only the cockpit interaction
hull has pointer ownership and `min-width/min-height:44px`; transparent spout,
handle, glow, steam and trail remain click-through. Under explicit reduced,
approval or non-ready runtime, disable every carrier animation/transition with
`animation:none !important` and `transition:none !important`.

- [x] **Step 5: Run GREEN**

Rerun the component, Dashboard E2E, existing Wanko renderer/action tests and Web
typecheck. Expected: one composed carrier, no old presentation nodes, one live
canvas, and exact still-state CSS contracts.

### Task 11: Export complete static carrier posters and wire fallback

**Files:**

- Create: `apps/web/scripts/export-hermes-carrier-posters.mjs`
- Create: `apps/web/public/hermes/carrier/poster-normal-desktop.png`
- Create: `apps/web/public/hermes/carrier/poster-normal-mobile.png`
- Create: `apps/web/public/hermes/carrier/poster-reduced-desktop.png`
- Create: `apps/web/public/hermes/carrier/poster-reduced-mobile.png`
- Create: `apps/web/public/hermes/carrier/poster-approval-desktop.png`
- Create: `apps/web/public/hermes/carrier/poster-approval-mobile.png`
- Modify: `apps/web/lib/hermes/wanko-carrier-assets.ts`
- Modify: `apps/web/test/hermes-wanko-carrier-asset-contract.test.ts`
- Modify: `apps/web/components/hermes/HermesRiggedPortrait.tsx`
- Modify: `apps/web/test/hermes-state.test.tsx`

**Interfaces:**

```ts
export type WankoCarrierPosterState = 'approval' | 'normal' | 'reduced';

export function getWankoCarrierPoster(
  state: WankoCarrierPosterState,
  variant: WankoCarrierVariant,
): string;
```

The poster is a complete transparent Wanko-plus-carrier frame. It is independent
of the live `.moc3` load and therefore remains usable after runtime or carrier
layer initialization failure.

- [x] **Step 1: Write poster RED**

Extend the asset contract:

```ts
for (const state of ['normal', 'reduced', 'approval'] as const) {
  expect(pngHeader(resolve(process.cwd(), 'public', getWankoCarrierPoster(state, 'desktop').slice(1))))
    .toMatchObject({ colorType: 6, height: 1024, width: 1024 });
  expect(pngHeader(resolve(process.cwd(), 'public', getWankoCarrierPoster(state, 'mobile').slice(1))))
    .toMatchObject({ colorType: 6, height: 768, width: 768 });
}
expect(getWankoCarrierPoster('approval', 'desktop'))
  .not.toBe(getWankoCarrierPoster('normal', 'desktop'));
```

Extend the state test to require approval and reduced states to select full
carrier posters instead of `/hermes/pet/hermes-pet-*.png`.

- [x] **Step 2: Run RED**

Run:

```powershell
npx pnpm@9.15.0 --filter @openscience/web exec vitest run test/hermes-wanko-carrier-asset-contract.test.ts test/hermes-state.test.tsx
```

Expected: FAIL because poster files and selector do not exist.

- [ ] **Step 3: Export six deterministic transparent posters**

In the existing flagged `/_visual/hermes-live2d` harness, add exact fixture
controls for `normal`, `reduced` and `approval`. The export script starts an
owned production server, uses device scale factor `2` for the `512px` desktop
fixture and `2` for the `384px` mobile fixture, waits for a real ready frame,
freezes the chosen state, hides test controls, and screenshots only
`[data-hermes-carrier="true"]` with `omitBackground:true`.

For reduced and approval, capture the complete settled normal carrier once,
then verify the exported pixels remain byte-stable across a second capture.
Do not derive a poster from the flattened concept or the old pet PNGs.

- [x] **Step 4: Wire poster-first fallback**

Replace `fallbackSource` with `getWankoCarrierPoster`. Use `<picture>` to choose
mobile or desktop. Runtime ready fades the poster out only after the first real
Wanko frame plus all carrier layers have decoded. Explicit reduced and approval
never construct the Live2D owner and keep the selected poster fully visible.
Runtime failure restores the `normal` poster; carrier asset failure does not
leave rear/front fragments visible.

- [x] **Step 5: Run GREEN and exact-static gate**

Rerun focused tests, then capture two reduced frames and two approval frames
`1200ms` apart. Expected: zero changed RGBA pixels, one visible full-carrier
poster, zero visible canvas, zero animated glow/steam/trail.

### Task 12: Measure carrier bounds, collision safety and mobile behaviour

**Files:**

- Modify: `apps/web/components/hermes/HermesWorkspaceStage.tsx`
- Modify: `apps/web/lib/hermes/travel-path.ts`
- Modify: `apps/web/test/hermes-travel-path.test.ts`
- Modify: `apps/web/test/e2e/hermes-workspace-stage.spec.ts`
- Modify: `apps/web/test/visual/hermes-live2d-motion-gate.mjs`
- Modify: `apps/web/test/visual/hermes-guidance-geometry-gate.mjs`
- Modify: `apps/web/app/_visual/hermes-live2d/page.tsx`
- Modify: `apps/web/package.json`
- Modify: `apps/web/app/%5Fvisual/hermes-live2d/page.tsx`

**Interfaces:**

`planHermesTravel` keeps its existing API. The caller changes only the measured
element used to build `HermesFootprintInsets`: carrier travel hull plus guide
bubble. The interaction hull and effect layers never enter this calculation.

- [x] **Step 1: Write footprint and mobile RED**

In `hermes-travel-path.test.ts`, add asymmetric desktop and compact-mobile
carrier footprints:

```ts
const desktopCarrier = { bottom: 102, left: 148, right: 132, top: 176 };
const mobileCarrier = { bottom: 72, left: 94, right: 88, top: 116 };

for (const footprint of [desktopCarrier, mobileCarrier]) {
  const route = planHermesTravel({
    editable: rect(330, 250, 420, 180),
    footprint,
    from: rect(960, 620, 1, 1),
    obstacles: [rect(280, 470, 520, 160)],
    preferredSides: ['right', 'left', 'top', 'bottom'],
    target: rect(330, 250, 420, 180),
    viewport: rect(0, 0, 1280, 800),
  });
  expect(route.safe).toBe(true);
  expect(overlaps(rectForFootprint(route.dock, footprint), rect(330, 250, 420, 180))).toBe(false);
}
```

In Workspace E2E, require the measured footprint source to be
`[data-hermes-carrier-travel-hull]`; require a 390x844 viewport with keyboard
inset to choose compact layers and either a safe edge marker or a docked state.
Assert a point inside transparent spout/handle space does not invoke Hermes,
while the cockpit interaction hull is at least `44x44` and does.

- [x] **Step 2: Write perceptual ratio RED**

Add harness layer-isolation controls `all | wanko | rear | front | effects`.
For desktop and mobile, compute alpha bounding boxes from real screenshots:

```js
assert.ok(allBox.width / wankoBox.width <= (mobile ? 1.30 : 1.55));
assert.ok(frontOpaqueBox.height / wankoBox.height <= 0.18);
assert.equal(await rig.locator('[data-hermes-carrier-rear]').count(), 1);
assert.equal(await rig.locator('[data-hermes-carrier-front]').count(), 1);
```

Capture quiet, focus, travel, work, approval, success and reduced. Require the
carrier in every state, real Wanko pixel differences for character actions,
travel bank `<=3deg`, idle hover `<=2px`, approval/reduced exact static, and no
effect-driven change to the travel hull rectangle.

- [x] **Step 3: Run RED**

Run:

```powershell
npx pnpm@9.15.0 --filter @openscience/web exec vitest run test/hermes-travel-path.test.ts
npx pnpm@9.15.0 --filter @openscience/web exec playwright test test/e2e/hermes-workspace-stage.spec.ts --config playwright.config.ts
npx pnpm@9.15.0 --filter @openscience/web exec node test/visual/hermes-live2d-motion-gate.mjs
```

Expected: FAIL because the stage still measures the generic actor and the gate
still asserts the superseded Citation-Thread presentation.

- [x] **Step 4: Measure the travel hull at the caller boundary**

In `HermesWorkspaceStage`, replace the generic actor measurement with:

```ts
const travelBounds = stage
  .querySelector<HTMLElement>('[data-hermes-carrier-travel-hull="true"]')
  ?.getBoundingClientRect() ?? actorBounds;
```

Build the footprint union from `travelBounds` and the guide bubble. Preserve
the existing target, active-editable and protected-diff obstacles. If the
compact envelope still cannot fit, keep Hermes docked or at the viewport edge;
never shrink canonical Wanko below the approved mobile layout.

- [x] **Step 5: Replace the old visual assertions**

Remove Citation-Thread, paper-fibre, bottom-edge-puppy and warm-contamination
acceptance rules. Add alpha-ratio, common-anchor, foreground-rim, three-bound,
desktop/mobile, still-state and carrier-always-present assertions. Retain all
existing one-canvas, 24+ real actions, 90-second idle, pointer, route-transfer,
context-loss, balanced-resource and real-draw requirements.

- [x] **Step 6: Run GREEN and inspect actual Workspace frames**

Rerun the focused unit/E2E/native gates. Save desktop/mobile frames for idle,
travel beside title, work beside SDF field, review, approval and success.
Inspect them at original resolution and require no active-field, diff-action,
keyboard or commit-button overlap.

### Task 13: Complete verification, independent review and user gate

**Files:**

- Modify: `apps/web/test/visual/hermes-companion-motion-gate.mjs`
- Modify: `apps/web/test/visual/hermes-performance-gate.mjs`
- Modify: `apps/web/test/visual/hermes-release-gate.mjs`
- Modify: `apps/web/test/visual/hermes-blank-ro-production-gate.mjs`
- Modify: `docs/progress.md`
- Modify: `docs/handoff/2026-08-16-hermes-2d-pet-handoff.md`
- Modify: `project_index.md`
- Modify: this plan status/checklist

**Interfaces:**

No new application interface. This task proves that the compact carrier reuses
the existing Hermes workflow, permission, credit, audit, diff and commit chain.

- [x] **Step 1: Run the focused gate sequence**

Run sequentially and stop at the first failure:

```powershell
npx pnpm@9.15.0 --filter @openscience/web exec vitest run test/hermes-wanko-carrier-asset-contract.test.ts test/hermes-wanko-carrier-layout.test.ts test/hermes-wanko-carrier-scene.test.tsx test/hermes-wanko-renderer-contract.test.ts test/hermes-wanko-action-director.test.ts test/hermes-travel-path.test.ts
npx pnpm@9.15.0 --filter @openscience/web exec playwright test test/e2e/hermes-dashboard.spec.ts test/e2e/hermes-workspace-stage.spec.ts --config playwright.config.ts
npx pnpm@9.15.0 --filter @openscience/web exec node test/visual/hermes-live2d-motion-gate.mjs
```

Expected: all focused unit, E2E and native carrier gates pass.

- [x] **Step 2: Run the complete local release sequence**

```powershell
npx pnpm@9.15.0 --filter @openscience/web test
npx pnpm@9.15.0 --filter @openscience/web typecheck
npx pnpm@9.15.0 --filter @openscience/web build
npx pnpm@9.15.0 --filter @openscience/web test:hermes-release
npx pnpm@9.15.0 --filter @openscience/web test:release
npx pnpm@9.15.0 lint
npx pnpm@9.15.0 docs:lint
npx pnpm@9.15.0 audit:docs-sync
git diff --check
```

Expected: every command exits `0`; no skipped carrier, reduced, mobile or
production-browser case is hidden.

- [x] **Step 3: Run Sol High independent review**

Give the reviewer the approved spec, exact diff, asset NOTICE/hashes, focused
and full gate summaries, desktop/mobile screenshots and 90-second recording.
Require review of single-owner lifecycle, context loss, pointer/collision safety,
static accessibility fallback, asset/licence boundary and absence of a second
clock/model/task owner. Resolve every material finding and rerun affected gates.

- [ ] **Step 4: Present the real visual gate**

Keep an owned production-mode preview available. Show the user the actual
Dashboard and blank-RO Workspace at desktop/mobile, plus one uninterrupted
idle -> focus -> travel -> work -> review -> approval -> success recording.
Do not treat isolated harness frames as final visual acceptance.

- [ ] **Step 5: Commit only after user visual acceptance**

Because this branch began with a large pre-existing uncommitted Wanko candidate,
first inspect `git status`, `git diff --check` and the exact staged list. Stage
only the Wanko runtime/carrier implementation, tests, approved assets and synced
CURRENT docs; do not stage user-owned `docs/live_2D/`, `docs/user_ideas/`, ignored
visual output or unrelated worktrees.

```powershell
git add apps/web/app/globals.css apps/web/app/_visual/hermes-live2d apps/web/app/%5Fvisual/hermes-live2d apps/web/assets/hermes/carrier apps/web/components/hermes/HermesRiggedPortrait.tsx apps/web/components/hermes/WankoCarrierScene.tsx apps/web/components/hermes/HermesWorkspaceStage.tsx apps/web/lib/hermes/live2d-core-loader.ts apps/web/lib/hermes/wanko-action-director.ts apps/web/lib/hermes/wanko-carrier-assets.ts apps/web/lib/hermes/wanko-carrier-layout.ts apps/web/lib/hermes/wanko-live2d-renderer.ts apps/web/lib/hermes/wanko-model-presentation.ts apps/web/lib/hermes/wanko-renderer-controller.ts apps/web/public/hermes/carrier apps/web/public/hermes/live2d apps/web/scripts/export-hermes-carrier-assets.mjs apps/web/scripts/export-hermes-carrier-posters.mjs apps/web/test/hermes-wanko-action-director.test.ts apps/web/test/hermes-wanko-carrier-asset-contract.test.ts apps/web/test/hermes-wanko-carrier-layout.test.ts apps/web/test/hermes-wanko-carrier-scene.test.tsx apps/web/test/hermes-wanko-renderer-contract.test.ts apps/web/test/hermes-travel-path.test.ts apps/web/test/e2e/hermes-dashboard.spec.ts apps/web/test/e2e/hermes-workspace-stage.spec.ts apps/web/test/visual/hermes-live2d-motion-gate.mjs apps/web/test/visual/hermes-companion-motion-gate.mjs apps/web/test/visual/hermes-performance-gate.mjs apps/web/test/visual/hermes-release-gate.mjs apps/web/test/visual/hermes-blank-ro-production-gate.mjs apps/web/package.json pnpm-lock.yaml eslint.config.cjs scripts/docs/hermes-renderer-index.mjs scripts/docs/hermes-renderer-index.test.mjs docs/specs/2026-08-19-hermes-wanko-live2d-design.md docs/specs/2026-08-17-hermes-workspace-companion-motion-design.md docs/plans/2026-08-19-hermes-wanko-live2d-plan.md docs/plans/2026-08-17-hermes-workspace-companion-motion-plan.md docs/handoff/2026-08-16-hermes-2d-pet-handoff.md docs/progress.md project_index.md
git diff --cached --check
git commit -m "feat(web): mount Wanko in compact research starship"
```

- [ ] **Step 6: Keep deployment separately gated**

Do not deploy in this plan. Public deployment requires the ADR-010 operator
identity/category/agreement/copyright/purpose/termination record, the applicable
Live2D SDK publication decision, fresh backup/preflight evidence, and a separate
explicit user confirmation for ECS writes. Production remains on the recorded
release until those gates are satisfied.

### Task 14: Correct the rejected carrier into a genie-lamp navigator

**Files:**

- Modify: `apps/web/assets/hermes/carrier/carrier-front-{desktop,mobile}.svg`
- Modify: `apps/web/lib/hermes/wanko-carrier-layout.ts`
- Modify: `apps/web/lib/hermes/wanko-model-presentation.ts`
- Modify: `apps/web/test/hermes-wanko-carrier-asset-contract.test.ts`
- Modify: `apps/web/test/hermes-wanko-carrier-layout.test.ts`
- Modify: `apps/web/test/hermes-wanko-renderer-contract.test.ts`

**Interfaces:**

The existing one-model/one-canvas owner remains unchanged. The carrier layout
adds an explicit `modelScale` consumed by `getWankoModelPlacement`; the semantic
six-node brand, navigation trail and front/rear vapor are independent assets.

- [x] **Step 1: Write RED contracts for the six SDF nodes, open centre,
  branch/merge Hermes route, orange diff node and smaller model placement.**
- [x] **Step 2: Run the focused asset/layout/renderer tests and confirm they
  fail only because the rejected carrier lacks those contracts.**
- [x] **Step 3: Author the aligned desktop/mobile vector narrative layers and
  place canonical Wanko inside the lamp opening without changing Live2D art.**
- [x] **Step 4: Export runtime layers/posters and run focused tests, typecheck
  and the real Live2D motion gate.**
- [x] **Step 5: Capture integrated desktop and 390px mobile canonical posters
  with normalized blue-gold organic vapor; stop without committing or deploying.**
- [x] **Step 6: Run Sol High asset/visual/lifecycle review.** Initial review
  found three Important NOTICE/master-contract defects; TDD remediation unified
  final-directory hashing, disclosed poster Wanko pixels and normalized the
  vapor master to `2048x2048`. The user-approved cute-genie correction then
  removed the ghost crown/UFO halo, centred the brand and restored mobile
  `<=1.30`; frozen final review: 0 Critical / 0 Important / 1 non-blocking
  public-inventory Minor.
- [ ] **Step 7: Obtain user final visual acceptance of the latest posters.**

### Task 15: REJECTED — zero-image floating Wanko experiment

**Files:**

- Modify: `apps/web/components/hermes/WankoCarrierScene.tsx`
- Modify: `apps/web/components/hermes/HermesRiggedPortrait.tsx`
- Modify: `apps/web/lib/hermes/wanko-model-presentation.ts`
- Modify: `apps/web/lib/hermes/wanko-live2d-renderer.ts`
- Modify: `apps/web/lib/hermes/wanko-action-director.ts`
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/test/hermes-wanko-carrier-scene.test.tsx`
- Modify: `apps/web/test/hermes-wanko-renderer-contract.test.ts`
- Modify: `apps/web/test/hermes-wanko-action-director.test.ts`
- Modify: `apps/web/test/visual/hermes-live2d-motion-gate.mjs`

**Interfaces:**

- `setWankoNativePresentation(coreModel)` hides background, bowl and native
  effect after browser captures proved those inseparable meshes unsuitable;
  texture bytes remain unchanged.
- `createWankoProceduralNavigator(PIXI)` returns one Pixi container with
  `update(performance, placement, elapsedMs)` and `destroy()`; it uses Graphics
  primitives only and is mounted in the existing application/stage.
- `WankoCarrierScene` remains the DOM interaction/travel wrapper but renders no
  `img`, `picture`, decorative SVG, poster or carrier asset reference.

- [x] **Step 1: Write the failing native-presentation contracts.**

Assert from rendered component behaviour that the scene has one Live2D child,
one interaction hull and one travel hull, with zero images/pictures. Assert the
model helper hides `PARTS_01_BACKGROUND`, `PARTS_01_BOWL` and
`PARTS_01_EFFECT`. Assert the portrait initializes without decoding
carrier assets and failure renders only the accessible Hermes fallback.

- [x] **Step 2: Run the focused tests and verify RED.**

```powershell
npx pnpm@9.15.0 --filter @openscience/web exec vitest run test/hermes-wanko-carrier-scene.test.tsx test/hermes-wanko-renderer-contract.test.ts
```

Expected: FAIL because the current scene renders required carrier images and
the renderer hides bowl/effect every frame.

- [x] **Step 3: Implement the minimal native scene.**

Remove the carrier asset import, required-asset decode, poster selection and all
decorative DOM layers. Keep only the single canvas child, accessible fallback,
interaction hull and travel hull. Replace `hideWankoLegacyPresentation` with
the native presentation helper and apply it before every model update so stock
motions cannot restore the unsupported background/bowl/effect parts.

- [x] **Step 4: Run the focused tests and verify GREEN.**

Rerun the Step 2 command. Expected: both files pass and the component tree has
no image-backed presentation path.

- [x] **Step 5: Write failing performance and procedural-mark contracts.**

Add literal state tables proving idle/focus/travel/work/approval/success map to
native hand, ear, face and body parameters. Add renderer behaviour
tests proving six blue nodes, one open centre, one orange diff node and a
branch/merge route are created as Pixi Graphics in the existing stage; travel
trail is absent in idle/approval/reduced and present only in travel/work/success.
The mutation caught is a renderer that falls back to an image, a second canvas
or glow-only state changes while Wanko parameters remain static.

- [x] **Step 6: Run the new tests and verify RED.**

```powershell
npx pnpm@9.15.0 --filter @openscience/web exec vitest run test/hermes-wanko-action-director.test.ts test/hermes-wanko-renderer-contract.test.ts
```

Expected: FAIL because the state performances and procedural navigator do not
yet exist.

- [x] **Step 7: Implement the native performances and same-canvas navigator.**

Extend the existing action director with bounded values for the supported body,
face, hands, ears, breath and swing parameters. Create Pixi Graphics once after
model load, place them using the
same placement coordinates as the Cubism model, update their geometry/opacity
from the current performance, and destroy them with the existing owner. Do not
load images, add another ticker/RAF, or create a second canvas.

- [x] **Step 8: Run focused GREEN and native browser captures.**

Run the focused unit suite, typecheck and `hermes-live2d-motion-gate.mjs`.
Capture idle, hover/focus, travel, work, approval, success and reduced at desktop
and `390x844`. Require character-pixel motion in every active state, exact
non-empty static approval/reduced, one canvas, zero
carrier images and no active-field/control obstruction.

- [x] **Step 9: Remove runtime references without deleting historical files.**

Remove imports and active inventory entries for the rejected carrier and poster
pipeline. Because deletion is not authorized, retain the files as explicitly
superseded historical evidence outside the runtime graph; do not regenerate or
ship them as fallback assets.

- [ ] **Step 10: Run release gates, sync CURRENT truth and request visual review.**

Run focused tests, Web typecheck/build, full Hermes release gate, docs gates and
`git diff --check`. Update progress, handoff and index to say the pasted-carrier
candidate is rejected and native Live2D candidate awaits user visual acceptance.
Do not commit, deploy or perform ECS writes.

### Task 16: Build the native Cubism genie-lamp source variant

> **For agentic workers:** REQUIRED SUB-SKILL: use `executing-plans` in the
> main session. Source-art, Cubism model and final visual decisions remain with
> the main thread; use Sol High only for the explicit architecture and final
> review checkpoints. Do not create full-history workers.

**Goal:** Produce a cute compact Wanko genie-lamp as one native Cubism model,
using the original bowl's rear/body/front-rim draw-order relationship while
removing every runtime carrier image and procedural plume substitute.

**Architecture:** Keep the existing Workspace owner, single canvas and lifecycle
controller. Build a protected derivative from a copy of the editable Wanko
`.cmo3`; preserve canonical Wanko ArtMeshes and `texture_00`, add model-owned
lamp/vapor/brand ArtMeshes on `texture_01`, export one new embedded model, then
switch the existing renderer only after a no-change source round-trip succeeds.

**Tech stack:** Live2D Cubism Editor stable Windows release, Cubism 4/5 `.cmo3`
and `.moc3`, SVG source art rasterized only through the repository's existing
Playwright/Chromium runtime, Next.js 14, React 18, TypeScript, Pixi 7,
`pixi-live2d-display`, Vitest and Playwright.

#### Global constraints

- Never overwrite or save into
  `E:/Miscellaneous/XGS/docs/live_2D/wanko/wanko/wanko_touch_t01.cmo3` or its
  sibling `.can3`.
- The editable working copy lives under
  `C:/Users/Mac/AppData/Local/OpenScience/Live2D/wanko-genie-v1/`; embedded
  browser output lives under
  `apps/web/public/hermes/live2d/wanko-genie-v1/`.
- `texture_00` canonical Wanko pixels and UVs remain unchanged. New lamp source
  art is model-owned and exported as `texture_01`; it is never loaded as a DOM
  image, Pixi sprite, CSS image, poster or fallback.
- Active runtime contains one Cubism model, one canvas, one owner and one clock.
- Do not restore Task 14 carrier assets or Task 15 procedural plume/brand
  `Graphics`. Do not delete those historical files without separate approval.
- Do not add a clipping mask in the first implementation. Use fixed draw order.
- Do not commit, deploy, perform ECS writes or represent ADR-010 as satisfied.
- Stop after any failed visual checkpoint; do not improvise a raster/runtime
  substitute.

#### File map

- Create `apps/web/assets/hermes/live2d-source/wanko-genie-v1/lamp-parts.svg`:
  OpenScience-owned editable source for rear lamp, front lamp/rim, short
  spout/handle, low vapor, glow and six-dimensional mark.
- Create `apps/web/scripts/export-hermes-live2d-source-art.mjs`: deterministic
  source-only SVG-to-transparent-PNG renderer using existing Playwright.
- Create `apps/web/test/hermes-live2d-source-art.test.mjs`: exact source-art
  inventory, alpha bounds, palette, node topology and no-runtime-reference gate.
- Create `apps/web/scripts/verify-hermes-cubism-export.mjs`: compare source and
  exported inventories, hashes, parameter/part contracts and manifest closure.
- Create `apps/web/test/hermes-cubism-export-contract.test.mjs`: controlled
  fixture tests for the verifier.
- Create `apps/web/public/hermes/live2d/wanko-genie-v1/**`: Editor-exported local
  embedded candidate; publication remains blocked.
- Modify `apps/web/lib/hermes/wanko-model-presentation.ts`: select the new model
  and stop hiding its model-owned lamp parts.
- Modify `apps/web/lib/hermes/wanko-action-director.ts`: drive compact, lamp
  swing, vapor and brand parameters without allowing stock motions to override
  approval/reduced stillness.
- Modify `apps/web/lib/hermes/wanko-live2d-renderer.ts`: remove the rejected
  procedural navigator from the active stage and pass viewport compact state.
- Modify `apps/web/components/hermes/HermesRiggedPortrait.tsx`: load the new
  embedded model URL without changing lifecycle ownership.
- Modify focused unit, native browser and real Workspace gates listed below.

#### Task 16.1: Install and prove the Cubism source round-trip

**Interfaces:**

- Consumes the protected source `.cmo3`, `.can3` and current embedded model.
- Produces a verified local Editor installation, a source-copy SHA record and a
  no-change exported model that loads through the existing browser owner.

- [ ] **Step 1: Record immutable source evidence.**

  Run:

  ```powershell
  $sourceRoot = 'E:\Miscellaneous\XGS\docs\live_2D\wanko\wanko'
  Get-FileHash "$sourceRoot\wanko_touch_t01.cmo3","$sourceRoot\wanko_motions_t01.can3" -Algorithm SHA256
  Get-Item "$sourceRoot\wanko_touch_t01.cmo3","$sourceRoot\wanko_motions_t01.can3" | Select-Object FullName,Length,LastWriteTime
  ```

  Save only paths, sizes, timestamps and hashes in the task evidence; do not
  modify the source directory.

- [ ] **Step 2: Obtain the official stable Windows installer interactively.**

  Open `https://www.live2d.com/en/cubism/download/editor/` in the user's browser.
  The user supplies their own email and accepts Live2D's software terms in the
  official form. Do not automate legal acceptance or read stored browser data.
  Start the installed Editor as the 42-day PRO Trial or activate a valid PRO
  licence; FREE cannot save this derivative because the source already has 32
  parts (FREE max 30) and the approved model requires a second texture atlas
  (FREE max one texture, up to 2048 px).

- [ ] **Step 3: Verify and install the downloaded executable.**

  Resolve the exact downloaded `Live2D_Cubism_Setup_*.exe`, then run:

  ```powershell
  $installerPath = Get-ChildItem 'C:\Users\Mac\Downloads' -File -Filter 'Live2D_Cubism_Setup_*.exe' |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1 -ExpandProperty FullName
  if (-not $installerPath) { throw 'Live2D Cubism installer not found in Downloads' }
  Get-AuthenticodeSignature -LiteralPath $installerPath | Select-Object Status,SignerCertificate
  Get-FileHash -LiteralPath $installerPath -Algorithm SHA256
  ```

  Require `Status = Valid` and a Live2D signer before launching the installer.
  Install the stable release visibly; do not use a beta build.

- [ ] **Step 4: Create the protected working copy.**

  Resolve and verify the absolute destination remains under
  `C:/Users/Mac/AppData/Local/OpenScience/Live2D/wanko-genie-v1/`, create it, and
  copy the `.cmo3`, `.can3`, runtime directory and ReadMe. Name the model copy
  `wanko_genie_v01.cmo3`. Record the Step 1 hashes in the external acceptance
  ledger with `apply_patch`; never move the originals.

- [ ] **Step 5: Perform a no-change Editor export.**

  Open `wanko_genie_v01.cmo3`; if Editor offers a format upgrade, save only the
  working copy. Without moving vertices or editing parameters, use
  **File → Export for Runtime → Export as MOC3 file** and include `.moc3`,
  `.model3.json`, textures, physics and display information in a local
  `roundtrip/` directory.

- [ ] **Step 6: Write the failing export-contract fixture.**

  In `hermes-cubism-export-contract.test.mjs`, construct a temporary export with
  a missing texture reference and assert:

  ```js
  assert.deepEqual(verifyCubismExport(fixtureRoot), {
    ok: false,
    errors: ['model3.json references missing texture: wanko_touch.1024/texture_00.png'],
  });
  ```

  The production change this catches is accepting an incomplete Editor export.

- [ ] **Step 7: Run RED, then implement the verifier.**

  Run:

  ```powershell
  npx pnpm@9.15.0 --filter @openscience/web exec node --test test/hermes-cubism-export-contract.test.mjs
  ```

  Require failure because `verifyCubismExport` does not exist. Implement it to
  parse `model3.json`, close every referenced relative path, enumerate parameters
  and parts from `cdi3.json`, report texture dimensions/alpha through the
  existing browser/runtime dependencies, and return literal deterministic
  errors. Rerun and require GREEN.

- [ ] **Step 8: Verify the real no-change export and browser load.**

  Copy the round-trip output into an ignored test staging directory, run the
  verifier, then point the isolated `/_visual/hermes-live2d` fixture at its
  `model3.json`. Require one canvas, WebGL ready, non-empty Wanko alpha, real
  idle pixel change, exact static approval/reduced and balanced disposal.

- [ ] **Step 9: Stop/go gate.**

  Stop Task 16 if Editor cannot open the source copy, export a closed manifest or
  load the round-trip in the existing browser owner. Do not start source art or
  modify application code until every Step 8 assertion is GREEN.

#### Task 16.2: Author the compact lamp as model source art

> Corrected execution invariant (2026-08-22): never compose against the
> no-bowl full-body capture. Begin from the verified native-bowl state and keep
> its rear-bowl → Wanko → front-rim → hands occlusion. Photoshop may author
> separated model texture parts, but must never flatten Wanko and a complete
> lamp into one study layer. The first new evidence is one neutral Editor
> geometry capture with flat materials; stop before color, brand, parameters or
> runtime if the opening does not physically contain the lower body.
>
> v07 control checkpoint: a deterministic Save As created
> `wanko_genie_v07.cmo3` (SHA `8260F0EC...A841`) without changing v06, but no
> geometry edit or neutral screenshot was completed. External API has no vertex
> editing command, and Java/Swing GUI targeting was not auditable enough to
> mutate safely. Treat v07 as an unchanged-control derivative, not Task 16.2
> progress; do not resume coordinate/shortcut automation without a verifiable
> object-selection and save-target control path.
>
> 2026-08-22 Photoshop checkpoint: composition studies v01-v05 are rejected and
> were not imported. v05 removed the localized alpha defects, but main-thread
> and independent Sol High review agree that the complete canonical oval body
> remains visibly pasted above a photorealistic concept lamp, without a credible
> rear/body/front-rim opening or genie-vapor transition; the lamp silhouette and
> six-dimensional story also collapse at 160 px. Permanently stop concept-raster
> cutting/compositing. The next study must redraw model-internal source art from
> the canonical bowl's cartoon outline, material and occlusion grammar, use no
> concept pixels, and pass the same contact-sheet gate before Cubism import.

**Interfaces:**

- Consumes the approved §10 visual thesis, the protected original-bowl Editor
  capture, the canonical no-change Wanko export and the user concept only as
  visual-language reference.
- Produces one user-approved **lamp-only silhouette/material study**, then one
  user-approved complete Wanko-plus-lamp composition study, and only then nine
  separated PSD layers for Cubism import. No study/layer is a browser runtime
  asset.

**Files:**

- Create outside repository:
  `C:/Users/Mac/AppData/Local/OpenScience/Live2D/wanko-genie-v1/studies/wanko-genie-composition-v01.psd`
- Create ignored evidence:
  `apps/web/test/visual/out/hermes-live2d/native-bowl-study/**`
- Replace only after approval:
  `apps/web/assets/hermes/live2d-source/wanko-genie-v1/lamp-parts.svg`
- Modify: `apps/web/test/hermes-live2d-source-art.test.mjs`
- Modify: `apps/web/scripts/export-hermes-live2d-source-art.mjs`

- [ ] **Step 1: Capture immutable composition guides.**

  Capture the protected original model at neutral front pose with its red bowl,
  and capture the no-change round-trip model with the bowl/effect hidden. Save
  both under ignored `native-bowl-study/guides/` and record the source `.cmo3`,
  `.moc3` and decoded `texture_00` hashes. The guide must use actual canonical
  Wanko pixels; a generated/redrawn dog invalidates the task.

- [ ] **Step 2: Build and gate the lamp-only Photoshop study.**

  Redraw the lamp from vector/shape layers; do not reuse pixels or paths from
  the concept raster or any rejected flat-vector teapot. First export the lamp
  alone on neutral light and dark backgrounds at `512`, `288` and `160 CSS px`.
  It must read as a low, elegant Aladdin genie lamp before Wanko is shown:

  ```text
  central lamp body width: 0.82–0.92 * Wanko body width
  complete spout-to-handle span: <= 1.20 * Wanko body width
  lamp share of combined height: 28–32%
  spout: thin, tapered and gently upturned
  handle: narrow open S/C curve, never a closed ring
  material: deep indigo enamel with restrained warm-gold edges
  ```

  Stop on user rejection. Do not use vapor, glow, brand graphics or Wanko to
  disguise a failed silhouette, and do not import the study into Cubism.

- [ ] **Step 3: Build the canonical-Wanko silhouette composition.**

  Put the canonical Wanko capture in a locked group named
  `GUIDE_CANONICAL_WANKO_DO_NOT_EXPORT`. Draw only black/neutral lamp and vapor
  shapes in separately named vector/shape layers. Enforce these measurements:

  ```text
  combined opaque height: 100%
  canonical Wanko share: approximately 68%
  lamp share: approximately 32%
  lamp width: <= 1.25 * Wanko body width
  front rim: below both hands and in front of the lower transition
  spout: slender, upturned, open tip
  handle: open S curve, never a closed mug loop
  vapor: below the ears, no tail/tentacle/crown silhouette
  ```

  Do not add color, nodes, glow or texture until this silhouette reads as
  “Wanko emerging from a miniature genie lamp” at first glance.

- [ ] **Step 4: Run the composition silhouette user stop/go gate.**

  Export the complete composition on neutral light and dark backgrounds at
  `512`, `288` and `160 CSS px`. Show the actual images to the user. Stop on any
  rejection; do not import, rig, recolor or defend the study with metrics.

- [ ] **Step 5: Author the integrated brand pass.**

  After silhouette approval, use deep indigo enamel, warm dark-brown outlines,
  a narrow warm-gold rim and restrained blue-gold vapor. Add exactly six blue
  metadata inlays, one open centre, a branch-and-merge provenance path and one
  warm-orange diff result. Perspective, clipping and shading must make the mark
  read as enamel/star inlay following the lamp curvature, not a neon circuit
  layer floating above it. Idle has no outbound navigation trail.

- [ ] **Step 6: Run the complete-composition user and High gate.**

  Repeat the light/dark `512/288/160` contact sheet with canonical Wanko visible.
  Require user approval first, then a bounded Sol High visual review covering:
  canonical identity, cute-genie read, native-bowl occlusion, lamp silhouette,
  vapor transition, small-size brand legibility and absence of pasted-layer
  appearance. Stop on either rejection.

- [ ] **Step 7: Write the corrected RED source-art contract.**

  2026-08-22 stop note: the user-approved reference topology is three
  non-rejoining fan routes with two circular nodes each and a middle-only diff
  result. The old branch-and-merge exporter is correctly RED. Two bounded
  flattened-raster mask splits then failed with guide leakage and rectangular
  alpha artifacts; `layered-source-v01/v02` are retained as
  `FAILED_VISUAL_STOP / NOT_PRODUCTION_TRUE_SPLIT`. Do not attempt a third
  automatic nine-PNG split. On 2026-08-22 the user approved option A: one
  approved lamp atlas with multiple Cubism ArtMeshes plus a separate front-rim
  occluder. Option B remains only a fallback if native geometry cannot pass the
  neutral Editor visual gate.

  Update the test so the approved source contract records the immutable lamp
  and brand hashes plus Cubism-only semantic regions; it must not require nine
  independently cut PNGs:

  ```js
  assert.deepEqual(metrics.cubismRegions, [
    'lamp-rear', 'opening', 'front-shell', 'front-rim',
    'spout', 'handle', 'brand',
  ]);
  assert.deepEqual(metrics.composition, {
    blueNodeCount: 6,
    canonicalWankoIncludedInSource: false,
    lampToWankoWidthMax: 1.25,
    openCentreCount: 1,
    orangeDiffCount: 1,
    runtimeReferenceCount: 0,
  });
  ```

  Run:

  ```powershell
  npx pnpm@9.15.0 --filter @openscience/web exec node --test test/hermes-live2d-source-art.test.mjs
  ```

  Require RED against the rejected flat-vector source because it lacks the
  approved composition manifest and still represents the wrong art direction.

- [ ] **Step 7: Build the approved atlas contract and reach GREEN.**

  Place the approved complete lamp RGBA and approved v03 brand topology into one
  model-owned atlas source with no Wanko pixels. Record immutable input hashes,
  alpha bounds and the seven Cubism semantic regions in the composition
  manifest. Do not attempt raster cut-outs; front/rear semantics are created by
  ArtMesh geometry and draw order in Task 16.3. Rerun Step 6 and require GREEN.
  Do not install Sharp, ImageMagick or another dependency.

#### Task 16.3: Rig the source art inside the Cubism copy

> Checkpoint 2026-08-21: `wanko_genie_v03.cmo3` is saved separately and protected.
> At that checkpoint `v01`/`v02` hashes were unchanged; a 2026-08-22 automation
> focus error later modified v02, while v01 retains the original bytes. Nine PSD
> layers are model ArtMeshes. API
> 1.0.1 reports 31 parameters; all six `PARAM_LAMP_*` definitions exist, while
> only `VAPOR` and `STORY` currently have native `0,1` opacity keyforms. This is
> partial Step 2/6 evidence, not completion: draw order/front-rim occlusion,
> separate DIFF/travel meshes, compact/trail/diff deformers, stock-motion audit,
> user/High visual acceptance and export are still required.
> Fresh model-object export also proves `D_BODY_00=400` and
> `GENIE_FRONT_SHELL=500`; lower-body leakage is a coverage/parent-deformer gap,
> not a reason to keep increasing draw order.
> Checkpoint 2026-08-22: protected v03 remains unchanged; separately saved
> `wanko_genie_v05.cmo3` (SHA-256 `82042FBB...68CCE`) has all nine `GENIE_*`
> ArtMeshes parented to `お椀の回転 [お椀]`. A neutral/positive
> `PARAM_BOWL_SWING` capture proves inherited motion (11.15% sampled pixels
> changed), then the parameter was restored to zero. Step 3 remains partial
> until front-shell/rim geometry removes lower-body leakage at both extrema.
> Recovery checkpoint 2026-08-22: the user approved preserving the rewritten
> v02 as a read-only incident snapshot and creating a non-overwriting restored
> copy from v01. Project original, v01-v05 and restored are filesystem read-only;
> only v06 is writable and it is not yet a semantically verified checkpoint.
> Stateful Cubism save/recovery work is routed to Sol High and must use one open
> derivative plus monotonically increasing Save As targets.
> Sol High stop gate: v06 was opened as the only model tab and closed without
> mutation (`423242F3...EE94` before/after); no v07 exists. The current lamp is
> still materially oversized and suppresses canonical upper-body readability.
> External API was not listening and GUI focus/menu capture was not reliable,
> so no geometry edit or renewed parent/parameter claim was permitted.

**Interfaces:**

- Consumes the user/High-approved Task 16.2 single-atlas contract and
  round-trip-safe `wanko_genie_v01.cmo3`.
- Produces model-owned parts, ArtMeshes, deformers and parameters in a new
  non-overwriting `wanko_genie_v09.cmo3` derivative. Runtime export remains
  blocked until the neutral Editor gate passes.

**Files:**

- Create outside repository:
  `C:/Users/Mac/AppData/Local/OpenScience/Live2D/wanko-genie-v1/wanko_genie_v09.cmo3`
- Create: `apps/web/public/hermes/live2d/wanko-genie-v1/**`
- Modify: `apps/web/scripts/verify-hermes-cubism-export.mjs`
- Modify: `apps/web/test/hermes-cubism-export-contract.test.mjs`

- [ ] **Step 1: Create and verify a fresh derivative.**

  Copy the unchanged `wanko_genie_v01.cmo3` to `wanko_genie_v09.cmo3`; refuse to
  overwrite an existing target. Record both hashes before opening the derivative.
  `v01` and protected project originals remain read-only evidence. v02 was
  modified by the recorded 2026-08-22 automation incident and must not be
  overwritten or deleted without user approval.

- [ ] **Step 2: Import the single atlas and preserve canonical Wanko.**

  Import the approved lamp/brand atlas into `v09`, then create separate ArtMeshes
  that sample the declared semantic regions. Do not replace, regenerate or
  remap canonical Wanko ArtMeshes. Add parts with exact IDs:

  Cubism 5.3 does not create ArtMeshes from arbitrary PNG/JPG canvas drops, so
  use one PSD only as the official import transport. Place `lamp-atlas.png` and
  `brand.png` at native `2079×756` coordinates with no resize, resample,
  duplicate-layer or alpha-mask split. Add only a separately authored front-
  shell/rim occluder. Before opening Cubism, export the solo lamp transport
  layer and require the original alpha bbox/counts and zero material pixel diff;
  the first High preflight is rejected because its resize/duplicate path turned
  transparent pixels into opaque vertical stripes.

  ```text
  PARTS_01_LAMP_REAR
  PARTS_01_LAMP_VAPOR_REAR
  PARTS_01_LAMP_FRONT
  PARTS_01_LAMP_BRAND
  PARTS_01_LAMP_HIGHLIGHT
  ```

- [ ] **Step 3: Reuse the native bowl structure.**

  Parent the lamp meshes to the original bowl deformer relationship instead of
  building an unrelated screen-space rig. Keep the old red-bowl meshes present
  and visible until the new rear/body/front-rim/hands ordering passes a direct
  Editor capture. Do not save after an incorrect mapping; close the derivative
  without saving and restart from the verified `v01` copy.

- [ ] **Step 4: Build fixed draw order and ArtMeshes.**

  Create rear handle/spout/shell/opening glow below Wanko, rear vapor above the
  rear shell but below Wanko, front shell/rim above lower torso, canonical hands
  above the rim, and brand/highlight at the front. Keep clipping masks disabled.
  Only after this capture matches the approved study may the derivative set old
  red-bowl ArtMesh opacity to zero.

- [ ] **Step 5: Run the base-rig user stop/go gate.**

  Capture the neutral Editor model at front pose and compare it side-by-side with
  the approved Task 16.2 study. Require the same first-glance cute-genie read,
  both hands above the rim, no feet/tail below the opening and no hidden spout or
  handle. Stop on rejection before adding any parameters.

- [ ] **Step 6: Add compact and state parameters.**

  Add the six isolated parameters specified in §10.3: compact, vapor, story,
  trail X/Y and diff. `PARAM_LAMP_COMPACT=1` pulls only spout and handle inward;
  it cannot change Wanko face, hands or opening size. Keep `PARAM_BOWL_LID`,
  `PARAM_YUGE_01/02` and `PARAM_EFFECT` unattached to new state-critical meshes.
  Reuse `PARAM_BOWL_SWING` only for the bounded lamp-root deformer; allow
  `PARAM_BREATH` to deform low vapor subtly while `PARAM_LAMP_VAPOR` owns state
  opacity/extent. Wanko torso pixels never become vapor keyforms.

- [ ] **Step 7: Audit all stock motion curves.**

  Run the verifier over every `.motion3.json` and emit the literal curves that
  write bowl lid/swing, yuge and effect. In Editor/Animation, preview all twelve
  motions at compact `0` and `1`; reject any frame that covers Wanko's face or
  hands, restores a lid, creates a ghost crown or pushes lamp bounds outside the
  declared ratios.

- [ ] **Step 8: Write RED verifier coverage for the derivative.**

  Extend the verifier fixture to require `texture_01`, the five new Part IDs and
  all six `PARAM_LAMP_*` IDs, while proving the decoded canonical `texture_00`
  pixel hash is unchanged:

  ```js
  assert.equal(result.canonicalTexturePixelHash, expectedCanonicalPixelHash);
  assert.deepEqual(result.missingParts, []);
  assert.deepEqual(result.missingParameters, []);
  assert.equal(result.textureCount, 2);
  ```

  Run the focused contract and require RED against the no-change export.

- [ ] **Step 9: Build texture atlas and export embedded data.**

  Leave canonical Wanko UVs on `texture_00`. Place only new model-owned lamp art
  on `texture_01`. Export `.moc3`, `.model3.json`, both textures, physics,
  `cdi3.json` and motion data into
  `apps/web/public/hermes/live2d/wanko-genie-v1/`. Name the manifest
  `wanko_genie_v03.model3.json`. Run the export verifier and
  require complete manifest closure, canonical Wanko texture hash equality and
  presence of all five new parts plus all six `PARAM_LAMP_*` parameters.

- [ ] **Step 10: Capture Editor model checkpoints.**

  Capture desktop compact `0`, mobile compact `1`, idle, work, approval and
  success directly from the Editor model. Obtain user approval and a bounded Sol
  High review before changing the application model URL.

#### Task 16.4: Integrate the exported model with TDD

**Interfaces:**

- Consumes the approved `wanko_genie_v03` embedded bundle.
- Produces the same `HermesLive2DOwner` API with model-owned lamp presentation
  and no rejected procedural/DOM carrier path.

- [ ] **Step 1: Write RED asset and renderer contracts.**

  Extend the existing asset/renderer tests to load the real exported manifest
  and assert:

  ```ts
  expect(parts).toEqual(expect.arrayContaining([
    'PARTS_01_LAMP_REAR', 'PARTS_01_LAMP_FRONT', 'PARTS_01_LAMP_BRAND',
  ]));
  expect(parameters).toEqual(expect.arrayContaining([
    'PARAM_LAMP_COMPACT', 'PARAM_LAMP_VAPOR', 'PARAM_LAMP_STORY',
    'PARAM_LAMP_TRAIL_X', 'PARAM_LAMP_TRAIL_Y', 'PARAM_LAMP_DIFF',
  ]));
  expect(activeScene.querySelectorAll('img,picture,svg').length).toBe(0);
  expect(fakePixi.graphicsConstructorCount).toBe(0);
  expect(fakePixi.stageChildren).toEqual(['Live2DModel']);
  ```

  Run focused tests and require RED because the active owner still loads Wanko
  without the source variant and still creates the procedural navigator.

- [ ] **Step 2: Switch the model and remove active procedural presentation.**

  Point `HermesRiggedPortrait` at
  `/hermes/live2d/wanko-genie-v1/wanko_genie_v03.model3.json`. Stop calling
  `createWankoProceduralNavigator`; retain the file as rejected historical code
  until deletion is separately approved. Update model presentation so it no
  longer hides the new lamp/vapor/brand parts.

- [ ] **Step 3: Drive compact/state parameters.**

  Set `PARAM_LAMP_COMPACT=1` at the mobile breakpoint and `0` otherwise. Drive
  the five state parameters after stock motion evaluation, or prove the
  framework's hook order preserves them; never let a stock curve write a new
  ID. Map the exact §10.3 targets while preserving null-motion approval/reduced
  settle and stale-motion protections.

- [ ] **Step 4: Run focused GREEN.**

  Run:

  ```powershell
  npx pnpm@9.15.0 --filter @openscience/web exec vitest run test/hermes-live2d-asset-contract.test.ts test/hermes-wanko-action-director.test.ts test/hermes-wanko-renderer-contract.test.ts test/hermes-wanko-runtime-ownership.test.ts test/hermes-state.test.tsx
  npx pnpm@9.15.0 --filter @openscience/web typecheck
  ```

  Require all focused tests and typecheck GREEN before browser work.

#### Task 16.5: Prove visual quality and product behaviour

**Interfaces:**

- Consumes the integrated single-model owner.
- Produces deterministic isolated and real Workspace evidence for user and High
  review; it does not publish anything.

- [ ] **Step 1: Harden the native browser gate before running it.**

  Assert one canvas, zero image/picture/SVG carrier layers, zero procedural
  navigator objects, five model-owned lamp parts, work-state brand articulation,
  exact approval/reduced stillness, all isolated state-parameter endpoints, and
  `PARAM_LAMP_COMPACT` endpoint changes.
  Add alpha-union measurements from maximum desktop/mobile motions rather than a
  fixed CSS rectangle.

- [ ] **Step 2: Run isolated desktop/mobile/state captures.**

  Execute the production-build `hermes-live2d-motion-gate.mjs`. Require Wanko as
  the largest alpha component, no feet/tail below the front rim, neutral lamp
  width `<=1.25 ×` Wanko body, mobile compact no wider than desktop, lamp height
  near `32%` of combined opaque height,
  non-empty pointer/action differences and exact static approval/reduced.

- [ ] **Step 3: Synchronize and run real Workspace E2E.**

  Replace stale poster/image-fallback assertions in
  `hermes-dashboard.spec.ts` and `hermes-workspace-stage.spec.ts` with real canvas,
  model-part, compact-state and accessible textual-fallback assertions. Run the
  targeted Dashboard/Workspace normal, reduced, approval, WebGL-unavailable and
  double-context-loss cases without network interception.

- [ ] **Step 4: Run the full local release gates.**

  Run focused tests, Web typecheck, production build, full Hermes release gate,
  docs-sync, docs lint and `git diff --check`. Report only concise summaries and
  the first relevant failure; do not repeat unchanged builds.

- [ ] **Step 5: Request bounded Sol High review.**

  Use a no-history High reviewer packet containing the approved §10 contract,
  exact diff, Editor/source hashes, focused results, final desktop/mobile/state
  captures and failure evidence. Require independent review of canonical Wanko
  preservation, draw order, mobile compactness, lifecycle, state isolation and
  the no-runtime-image boundary.

- [ ] **Step 6: User visual acceptance and documentation.**

  Show the actual integrated desktop/mobile captures, not a concept rendering.
  Only after user acceptance update CURRENT progress/handoff/index, append final
  JSONL usage to the quality ledger and evaluate token strategy. Do not commit or
  deploy without a new explicit instruction, and keep ADR-010 publication status
  blocked. Record whether this execution required visual rework; do not call the
  token-saving strategy effective unless the quality gate passes and independent
  per-thread usage is measurable.

### Task 17: Replace the visible bowl with a rigged smoke support

> **For agentic workers:** REQUIRED SUB-SKILL: use `executing-plans` for the
> source-art gates. Any stateful Cubism Save As/import/rig step requires a Sol
> High owner. Do not dispatch visual judgment, deletion or save-target choice to
> an Explorer.

**Goal:** Hide the original bowl pixels while preserving its rotation deformer
as the shared root, then add a six-ArtMesh blue-gold smoke support that seals the
lower abdomen, preserves canonical Wanko and animates across all Hermes states.

**Architecture:** `B_BOWL_01` remains the invisible Wanko/smoke root and retains
`PARAM_BOWL_SWING`. Four new Warp Deformers own rear flow, core lift and front
seal; four smoke-only parameters are written after stock motion/Physics and
before `model.update()`. Generated raster is source art for model-owned Cubism
ArtMeshes only, never a DOM/runtime image layer.

**Tech stack:** Cubism Editor 5.3.03 PRO Trial, Photoshop 2024, built-in image
generation, Node 22, Sharp already present in `@openscience/web`, Vitest and
Playwright. Install no dependency.

#### Task 17.1: Prove the source model can support the required draw order

**Files:**

- Read: `C:/Users/Mac/AppData/Local/OpenScience/Live2D/wanko-genie-v1/wanko_genie_v03_export_model_objects.csv`
- Read: `C:/Users/Mac/AppData/Local/OpenScience/Live2D/wanko-genie-v1/wanko_genie_v03_export_parameter_objects.csv`
- Evidence: `C:/Users/Mac/AppData/Local/OpenScience/Live2D/wanko-genie-v1/evidence-smoke-bowl-preflight-v01/`

**Interfaces:**

- Consumes the protected canonical source and existing object/parameter exports.
- Produces a signed preflight manifest proving separate paws, `B_BOWL_01`, body
  order and the four unused smoke IDs; it performs no save or model mutation.

- [x] **Step 1: Verify protected inputs and current GUI state.**

  Record SHA-256, size and ReadOnly for the original and v01–v09 candidates.
  Record Cubism PID/title/tab dirty marker and Photoshop document IDs/Saved
  state. Do not close, save, focus or click either application.

- [x] **Step 2: Verify the two structural prerequisites.**

  From the exported object hierarchy, prove front-paw ArtMeshes are separable
  from `D_BODY_00` and can remain above a front smoke drawable. Prove
  `B_BOWL_01` is the bowl rotation deformer whose `PARAM_BOWL_SWING` physics
  response already moves the intended shared assembly. If either fact cannot be
  proven from exports, perform one read-only Sol High Editor inspection and stop
  without saving on any ambiguous selection.

- [x] **Step 3: Write and hash the preflight manifest.**

  The manifest records exact object IDs, current draw orders, parent IDs,
  protected hashes and `supported: true|false`. Require `supported: true` before
  image generation. A false result ends Task 17 without creating smoke art.

#### Task 17.2: Generate one transparent smoke art-direction master

**Files:**

- Create: `C:/Users/Mac/AppData/Local/OpenScience/Live2D/wanko-genie-v1/smoke-bowl-study-v01/smoke-master-reference.png`
- Create: `C:/Users/Mac/AppData/Local/OpenScience/Live2D/wanko-genie-v1/smoke-bowl-study-v01/prompt.txt`
- Create: `C:/Users/Mac/AppData/Local/OpenScience/Live2D/wanko-genie-v1/smoke-bowl-study-v01/master-inspection.json`

**Interfaces:**

- Consumes the §10.7 geometry contract and preflight lamp-opening/body anchors.
- Produces one transparent visual reference only; this bitmap is forbidden from
  Cubism import and runtime use.

- [x] **Step 1: Generate the master with built-in image generation.**

  Prompt for a dog-free, lamp-free, genuinely transparent blue-gold smoke
  support: broad asymmetric rear crown, warm S-shaped central core, narrow front
  contact veil and a single lower opening anchor. Require clear negative space
  for canonical Wanko, no face/body/dog pixels, no bowl, lamp, text, particles
  touching canvas edges, crown closure, tentacles or detached tail.

- [x] **Step 2: Inspect alpha and geometry before showing it.**

  Require RGBA with real transparency, tight nonzero-alpha bounds, no opaque
  background/checkerboard, no colored fringe and no edge clipping. Reject if the
  front veil would cover more than the latest reference-locked `35%` of Wanko or the rear crown crosses the
  face zone. Make at most one targeted regeneration; a second failure stops for
  user direction instead of continuing prompt churn.

  Approved candidate: `smoke-bowl-study-v07/dense-support-smoke-master-v07.png`
  plus light/dark full composites. User visual acceptance is recorded; Task 17.3
  may proceed, but no Cubism import is allowed before the six-layer contact sheet
  passes its own user and High review.

#### Task 17.3: Author six shared-coordinate smoke source layers

**Files:**

- Create: `C:/Users/Mac/AppData/Local/OpenScience/Live2D/wanko-genie-v1/smoke-bowl-layered-v01/smoke-source-v01.psd`
- Create: `C:/Users/Mac/AppData/Local/OpenScience/Live2D/wanko-genie-v1/smoke-bowl-layered-v01/layers/M_SMOKE_{REAR_L,REAR_R,WISPS,CORE,FRONT_VEIL,FRONT_RIM}.png`
- Create: `C:/Users/Mac/AppData/Local/OpenScience/Live2D/wanko-genie-v1/smoke-bowl-layered-v01/smoke-contact-sheet.png`
- Create: `C:/Users/Mac/AppData/Local/OpenScience/Live2D/wanko-genie-v1/smoke-bowl-layered-v01/manifest.json`

**Interfaces:**

- Consumes the user-approved master as the painted texture source. It may be
  duplicated behind non-rectangular semantic alpha masks, but may never remain a
  monolithic runtime layer or be divided by rectangular crops.
- Produces one PSD with exactly six named visible source layers on the same
  transparent canvas and six independently audited RGBA exports.

- [x] **Step 1: Repaint the six layers in Photoshop.**

  Preserve the approved painted blue-gold texture and separate it with six
  non-destructive, non-rectangular semantic masks on shared coordinates. Do not
  replace it with simplified vector blobs and do not slice the master into
  rectangles. Lock one lamp-opening anchor and one Wanko lower-abdomen envelope
  as hidden non-export guide layers when Photoshop guide metadata is unreliable. Rear L/R and wisps
  stay behind the envelope; core enters it; front veil/rim overlap only the
  bottom `28–35%`, matching the user-approved dense-support v07 composite.

- [x] **Step 2: Export and verify every layer independently.**

  Require all six PNGs to share canvas dimensions and anchor coordinates while
  each has tight meaningful alpha. Reject empty layers, full-canvas alpha,
  hidden guide pixels, white/gray rectangles, halo, duplicate hashes or alpha
  outside its declared semantic region.

- [x] **Step 3: Produce the visual acceptance sheet.**

  Composite unchanged canonical Wanko, frozen approved lamp and the six smoke
  layers on light/dark backgrounds at `512`, `288` and native `160 CSS px`.
  Include neutral, left/right flow extrema and front-layer solo panels. Stop
  before Cubism and request user approval of the actual contact sheet.

  Final candidate is the non-overwriting `smoke-bowl-layered-v03/` checkpoint.
  Independent Sol High review found zero material issues and approved it only for
  user contact-sheet review; Task 17.4 remains blocked until the user approves.

#### Task 17.4: Import and rig the approved smoke in a new Cubism derivative

**Files:**

- Create only after user approval: `C:/Users/Mac/AppData/Local/OpenScience/Live2D/wanko-genie-v1/wanko_genie_v10.cmo3`
- Evidence: `C:/Users/Mac/AppData/Local/OpenScience/Live2D/wanko-genie-v1/evidence-smoke-bowl-v10/`

**Interfaces:**

- Consumes the approved six-layer PSD and a protected clean source copy.
- Produces a new non-overwriting v10 checkpoint with six ArtMeshes, four Warp
  Deformers, fixed draw order and four smoke-only parameters.

- [ ] **Step 1: Establish a single safe Cubism owner.**

  Sol High records the exact source hash, target absence, PID/HWND and active
  model. Use Save As once to the absent v10 path. Any second tab, unexpected
  dirty source, focus ambiguity or target collision stops without saving.

- [ ] **Step 2: Import the PSD and build the hierarchy.**

  Create `D_SMOKE_ROOT`, `D_SMOKE_REAR_FLOW`, `D_SMOKE_CORE_LIFT` and
  `D_SMOKE_FRONT_SEAL` under `B_BOWL_01`. Assign the six exact ArtMesh names and
  set draw order rear/core `< D_BODY_00 <` front veil/rim `<` front paws. Hide
  original bowl ArtMeshes only in v10; retain them until the neutral gate passes.

- [ ] **Step 3: Bind bounded keyforms and save once.**

  Add `PARAM_SMOKE_BREATH`, `PARAM_SMOKE_FLOW`, `PARAM_SMOKE_TRAIL` and
  `PARAM_SMOKE_ENERGY` with the §10.7 ranges/defaults. Bind neutral and extrema,
  validate no inversion/hole/order swap, then save v10 once and record the new
  hash. Do not export runtime in this task.

- [ ] **Step 4: Capture the Cubism geometry gate.**

  Capture neutral, both swing extrema, both flow extrema, front-layer solo and
  hidden-original-bowl states. Require face/ears/chest/paws intact, abdomen seal
  `28–35%`, common opening anchor and no ghost-tail silhouette. User and Sol High
  must both pass these captures before export.

#### Task 17.5: Integrate smoke parameters with TDD and run release gates

**Files:**

- Modify: `apps/web/lib/hermes/wanko-live2d-renderer.ts`
- Modify: `apps/web/lib/hermes/wanko-action-director.ts`
- Test: `apps/web/test/hermes-wanko-renderer-contract.test.ts`
- Test: `apps/web/test/hermes-wanko-action-director.test.ts`
- Modify: `apps/web/test/visual/hermes-live2d-motion-gate.mjs`

**Interfaces:**

- Consumes a user/High-approved v10 runtime export.
- Produces motion-after smoke parameter ownership, suspension-safe phase and
  desktop/mobile/state evidence; it performs no deployment.

- [ ] **Step 1: Write failing ownership and state tests.**

  Assert stock motion/Physics evaluate before the four smoke writes, phase is
  preserved across suspend/resume with clamped elapsed time, approval/reduced
  stop phase exactly, travel trail clamps to `-1..1`, success settles once, and
  stale action completions cannot restart smoke motion. Run the two focused test
  files and require RED on missing smoke ownership.

- [ ] **Step 2: Implement the minimal controller integration.**

  Keep one canvas/model/RAF owner. Add one smoke phase accumulator and write the
  §10.7 state targets after motion/Physics but before `model.update()`. Do not add
  timers, DOM images, a second renderer or a new dependency.

- [ ] **Step 3: Run focused GREEN and browser acceptance.**

  Run focused Vitest, Web typecheck and the production visual route. Extend the
  gate to measure neutral/extreme articulation, exact approval/reduced frame
  equality, visibility/Intersection resume, WebGL context recovery, alpha crop,
  collision hull exclusion for outer wisps and real `160/288/512` readability.

- [ ] **Step 4: Run final quality and documentation gates.**

  Run production build, full Hermes release gate, `audit:docs-sync`,
  `docs:lint` and `git diff --check`; obtain Sol High review and user visual
  acceptance. Report changed files, fresh validation, unresolved licence/ECS
  risks and independently measurable usage only. Do not deploy, delete or claim
  token-strategy success from this sample alone.
## Task 18 — Permanent scholar hat accessory

- [x] Validate and reuse the user-provided transparent, dog-free scholar-hat master from the approved
  reference direction and inspect alpha/shape at original size.
- [ ] Build a final shared-canvas layered Photoshop source with independent rear,
  front, trim, button, cord, tassel, medallion, highlight, and contact-shadow
  layers.
- [x] Produce canonical Wanko neutral light/dark previews at 512/288/160 and
  stop for user visual approval.
- [x] Repair the preview-only rear-tassel clipping/hidden-RGB risk in a
  non-overwriting v06 checkpoint; keep `HAT_BODY_FRONT` and
  `HAT_TASSEL_REAR` separate and require renewed user visual approval.
- [x] Preserve the user-approved v07 wear relationship and deterministically
  rebuild both layers from their independent black/white alpha mattes in a
  non-overwriting v08 checkpoint; require zero RGB wherever alpha is zero and
  do not move the hat or tassel.
- [x] Record v08 as visually rejected: its white feather-like tassel, floating
  fragment and broken worn-state connection do not form one scholar hat.
- [x] Create a non-overwriting v09 that changes only the cord/tassel region,
  keeps the indigo hat body unchanged, and contains one continuous
  button-to-cord-to-tassel structure.
- [x] Produce canonical light/dark `512/288/160` worn previews for the v09
  visual gate: the right
  ear may occlude the cord middle, but the attachment and tassel end must read
  naturally with no floating component. User approved the completed character
  design on 2026-08-23.
- [x] After approval, import non-destructively into a new Cubism version,
  bind hat body to the head hierarchy and cord/tassel to independent deformers.
- [x] Export the v09 SDK 4.0 runtime from a non-overwriting atlas-compatibility
  copy, close all model3 references, and zero RGB wherever exported texture
  alpha is zero without changing visible pixels or alpha.
- [x] Replace the repository browser bundle with v09 under stable filenames,
  retain all 12 compatible motions, hide the v09 core guide part, and pass the
  real production-build motion/performance/aggregate release gates.
- [x] Permanently remove the 42 explicitly inventoried obsolete C-drive
  iterations after user authorization; retain the v09 masters, runtime,
  motions, final hat/smoke and approved source evidence.
- [x] Create the clean release commit and deploy the operator-authorized
  development candidate `c97926a` to ECS with rollback `06072c1`; retain the
  explicit publication-plan-unverified notice and do not treat it as a formal
  public-release classification.

## Task 19 — Lively performance beats and optical-editorial bubbles

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` or `superpowers:executing-plans` to
> implement this task in order. The current session uses inline execution by
> explicit user request; no ECS deployment is authorized.

**Goal:** Produce a local Phase 1 candidate with a `336px` Wanko, lively and
deterministic motion variety, and bilingual annotation bubbles selected from the
same semantic performance beat.

**Architecture:** Keep `behavior-director.ts` as the only semantic action
selector and the existing Live2D renderer as the single pixel owner. Add one
pure performance-beat/speech policy consumed by the stage and a focused bubble
component; do not add an API, dependency, image layer or second timer owner.

**Tech stack:** React 18, TypeScript, next-intl, Vitest, Playwright, existing
global token CSS and Pixi Live2D runtime.

### Global constraints

- Preserve the approved v09 model, texture, hat, tassel, lamp and smoke pixels.
- Phase 1 reuses the twelve existing `.motion3.json` files and does not open
  Cubism Editor or export another model.
- Desktop unanchored stage is `336px`; mobile field-guide stage is `176px`.
- Autonomous motion cadence is `3–6s` micro / `12–20s` signature; autonomous
  speech is `25–45s`, visible `3–5s`.
- Approval, reduced motion, writing, modal/drawer-open and hidden-document
  states suppress autonomous speech; approval/reduced remain exact-static.
- All new visible copy has matched `zh` and `en` next-intl keys.
- This task ends at local user visual review. Do not deploy.

### Task 19.1: Deterministic performance and speech policy

**Files:**

- Create: `apps/web/lib/hermes/performance-beat.ts`
- Modify: `apps/web/lib/hermes/action-catalog.ts`
- Modify: `apps/web/lib/hermes/behavior-director.ts`
- Modify: `apps/web/lib/hermes/wanko-action-director.ts`
- Create: `apps/web/test/hermes-performance-beat.test.ts`
- Modify: `apps/web/test/hermes-behavior-director.test.ts`
- Modify: `apps/web/test/hermes-wanko-action-director.test.ts`

**Interfaces:**

- Produces `HermesPerformanceBeat`, `HermesSpeechState`,
  `createHermesSpeechState(nowMs, seed)` and
  `stepHermesSpeech(previous, input)`.
- Extends the ambient deck with `cap-check`, `ear-perk`, `lamp-listen`,
  `happy-wiggle` and `thinking-pause`; every new action resolves to one existing
  v09 motion or a bounded parameter-only pose.

- [x] **Step 1: RED — write performance policy tests.**

  Add literal expectations proving the lively intervals, a fifteen-action
  seeded ambient cycle without immediate repeats, `25–45s` speech scheduling,
  `3–5s` visibility, phrase non-repeat and hard suppression. Assert a mismatched
  action cannot retain an old cue beat ID.

- [x] **Step 2: Run RED.**

  Run:
  `npx pnpm@9.15.0 --filter @openscience/web exec vitest run test/hermes-performance-beat.test.ts test/hermes-behavior-director.test.ts test/hermes-wanko-action-director.test.ts`

  Expected: fail because the performance module and five actions do not exist
  and balanced cadence still starts at `2.4–4.2s / 14–22s`.

- [x] **Step 3: GREEN — implement the pure policy and five profiles.**

  Use seeded integer hashing already established in `behavior-director.ts`.
  Store translation keys, never localized strings, in speech cues. Preserve
  priority ordering and do not make approval/failure interruptible.

- [x] **Step 4: Run focused GREEN.**

  Re-run the Step 2 command and require zero failures.

### Task 19.2: Stage sizing and annotation-slip bubble

**Files:**

- Create: `apps/web/lib/hermes/stage-sizing.ts`
- Create: `apps/web/components/hermes/HermesPerformanceBubble.tsx`
- Modify: `apps/web/components/hermes/HermesWorkspaceStage.tsx`
- Modify: `apps/web/components/hermes/HermesGuideBubble.tsx`
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/messages/zh.json`
- Modify: `apps/web/messages/en.json`
- Create: `apps/web/test/hermes-performance-bubble.test.tsx`
- Create: `apps/web/test/hermes-stage-sizing.test.ts`

**Interfaces:**

- Produces `resolveHermesStageSize(compactGuide, hasGuide): 336 | 176`.
- `HermesPerformanceBubble` consumes one `HermesSpeechCue`, visibility and a
  dismiss callback; it exposes matching `data-hermes-performance-beat` and
  `data-hermes-speech-cue` diagnostics.
- `HermesWorkspaceStage` computes speech guards from real writing, approval,
  assistant/modal and document visibility state before advancing the policy.

- [x] **Step 1: RED — write sizing and real component tests.**

  Assert desktop/mobile sizing, semantic `aside`/polite live region, dismiss
  button, beat/cue identity and hidden tab order. Render the real component with
  only next-intl translation lookup replaced; do not assert against a mock UI.

- [x] **Step 2: Run RED.**

  Run:
  `npx pnpm@9.15.0 --filter @openscience/web exec vitest run test/hermes-stage-sizing.test.ts test/hermes-performance-bubble.test.tsx`

  Expected: fail because both modules are absent.

- [x] **Step 3: GREEN — implement the stage and bubble.**

  Use the existing global CSS strategy. Style a warm-paper annotation slip with
  dark-indigo type, `4px` radius, layered shadow and one vermilion
  citation-thread pseudo-element. Animate only opacity/transform; buttons use a
  `40px` target, visible focus and `scale(.95)` active state. Reuse the same
  surface language for functional guide bubbles without changing their actions.

- [x] **Step 4: Add bilingual cue keys and run focused GREEN.**

  Add short matched `zh/en` strings under `hermesCompanion.performance` and
  re-run Step 2 plus `npx pnpm@9.15.0 --filter @openscience/web typecheck`.

### Task 19.3: Real-browser visual candidate and acceptance evidence

**Files:**

- Modify: `apps/web/app/_visual/hermes-live2d/page.tsx`
- Modify: `apps/web/test/visual/hermes-live2d-motion-gate.mjs`
- Modify: `docs/progress.md`
- Modify: `docs/handoff/2026-08-16-hermes-2d-pet-handoff.md`
- Modify: `project_index.md`

**Interfaces:**

- Produces ignored desktop/mobile screenshots and metrics under
  `apps/web/test/visual/out/hermes-live2d/`; it does not produce deployable
  source art or a server release.

- [x] **Step 1: RED — extend the browser gate.**

  Require actual `336/176` stage bounds, at least twelve idle actions in a
  90-second deterministic sample, matching action/beat/cue diagnostics, paper
  bubble visibility, safe mobile placement and exact approval/reduced frames.

- [x] **Step 2: Run the focused production browser gate.**

  Build and serve the web app, then run
  `npx pnpm@9.15.0 --filter @openscience/web test:hermes-live2d` and require RED
  on the old fixture/sizing before adapting the visual harness.

- [x] **Step 3: Implement the minimum harness support and run GREEN.**

  Add explicit deterministic controls only to the ignored visual route. Do not
  put test-only mutation methods in production classes. Capture desktop idle,
  interaction, guide, task, approval and `390×844` mobile frames.

- [x] **Step 4: Run the local quality gate and sync truth.**

  Run focused Vitest, full Web tests, Web typecheck, production build, Live2D
  gate, `audit:docs-sync`, `docs:lint` and `git diff --check`. Record candidate
  HEAD, production `c97926a`, rollback `06072c1`, screenshot paths and any Phase
  2 motion gaps. Stop for user visual judgment; do not deploy.

## Task 20 — Movable work-assistant product-context correction

**Goal:** Make Hermes behave as peripheral, user-positioned workbench chrome
while the real RO creation task remains visually and interactively dominant.

**Reference boundary:** Scholar's Tea contributes behaviour only: compact
default presence, whole-actor drag, viewport clamping, saved position,
contextual expansion and quiet idle. OpenScience does not copy its avatar,
radial menu, gradients, chat-card styling or copy.

**Files:**

- Modify: `apps/web/lib/hermes/stage-sizing.ts`
- Modify: `apps/web/components/hermes/HermesWorkspaceStage.tsx`
- Modify: `apps/web/components/hermes/HermesPerformanceBubble.tsx`
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/app/_visual/hermes-live2d/page.tsx`
- Modify: `apps/web/test/hermes-stage-sizing.test.ts`
- Modify: `apps/web/test/hermes-performance-bubble.test.tsx`
- Modify: `apps/web/test/visual/hermes-live2d-motion-gate.mjs`
- Create: `apps/web/test/visual/hermes-work-assistant-experience-gate.mjs`

- [x] **Step 1: RED — encode product hierarchy.**

  Require `336px` desktop / `176px` mobile companion footprints and require the
  visual route to expose a
  real RO-create task surface with action controls inside a developer tray.

- [x] **Step 2: GREEN — correct footprint and bubble material.**

  Keep the high-resolution renderer, full readable scale and current
  drag/persistence owner. Replace the light card with a compact dark edge note,
  and retain polite live-region, focus and `40px` dismiss semantics.

- [x] **Step 3: GREEN — rebuild the preview around the task.**

  Present title, Workspace, blank/import decision and primary create action as
  the first viewport. Keep exhaustive action/layer/poster controls collapsed and
  out of the task grid.

- [x] **Step 4: Playwright first-person acceptance.**

  At `1440×900` and `390×844`, type in the title, use the form controls, drag
  Hermes to a new edge, reload to verify persistence, open/dismiss a cue and
  confirm the assistant never overlaps the active control or primary action;
  drag dismisses stale guidance and viewport resize keeps it recoverable.

- [x] **Step 5: Run full gates, sync docs and stop locally.**

  Run focused RED/GREEN evidence, Web tests, typecheck, production build,
  browser gates, docs sync/lint and `git diff --check`. Do not deploy.

## Task 21 — Production-ratio Dashboard companion release

**Goal:** Starting from ECS release `c97926a`, deliver exact `360px` desktop and
`200px` compact/mobile Hermes endpoints with anchored-by-default placement,
drag-to-detach, collision-safe optical-editorial bubbles and production
Dashboard acceptance.

**Global constraints:**

- Keep the v09 `.moc3`, model JSON, motions, textures, hat, tassel, lamp and
  smoke bytes unchanged.
- Keep one route-persistent `HermesWorkspaceStage`, one Cubism model, one canvas
  and one RAF owner; add no dependency, image layer, API or schema.
- The Dashboard and RO workflow remain primary. Exhaustive motion controls stay
  inside the developer-only collapsed tray.
- A settled actor or visible bubble may not cover Continue Research,
  create/import, the Hermes task rail, navigation, approval or drawer controls.
- Approval, explicit reduced motion, typing, modal/drawer-open and hidden-page
  guards remain authoritative.
- Test at `1440×900`, `1920×1080` and `390×844`; local evidence cannot replace
  authenticated ECS evidence.

### Task 21.1: Encode the production-derived size contract

**Files:**

- Modify: `apps/web/test/hermes-stage-sizing.test.ts`
- Modify: `apps/web/lib/hermes/stage-sizing.ts`

**Interfaces:**

- Produces `HermesStageSize = 200 | 360`.
- Preserves `resolveHermesStageSize(expanded, compact)` so existing consumers do
  not need a second sizing owner.

- [x] **Step 1: Write the failing size test.**

  Replace the old expectations with the production-derived endpoints:

  ```ts
  it('scales the ECS companion endpoints by exactly 1.25', () => {
    expect(resolveHermesStageSize(false)).toBe(360);
    expect(resolveHermesStageSize(false, true)).toBe(200);
    expect(resolveHermesStageSize(true)).toBe(360);
  });
  ```

- [x] **Step 2: Run RED and verify the reason.**

  Run:

  ```powershell
  npx pnpm@9.15.0 --filter @openscience/web exec vitest run test/hermes-stage-sizing.test.ts
  ```

  Expected: FAIL with received `336` and `176`, proving the test detects the
  unimplemented ratio rather than a test setup error.

- [x] **Step 3: Implement the minimal size change.**

  ```ts
  export type HermesStageSize = 200 | 360;

  export function resolveHermesStageSize(expanded: boolean, compact = false): HermesStageSize {
    if (expanded) return 360;
    return compact ? 200 : 360;
  }
  ```

- [x] **Step 4: Run GREEN and commit the size contract.**

  Re-run the focused command, require one passing file with no warning, then
  commit `test(web): lock Hermes production ratio`.

### Task 21.2: Resolve settled docks and bubble quadrants from real geometry

**Files:**

- Create: `apps/web/lib/hermes/companion-placement.ts`
- Create: `apps/web/test/hermes-companion-placement.test.ts`
- Modify: `apps/web/lib/hermes/dock-preferences.ts`
- Modify: `apps/web/test/hermes-dock-preferences.test.ts`

**Interfaces:**

- Produces `resolveHermesSettledDock(input): { point: Point; safe: boolean }`.
- Produces `resolveHermesBubblePlacement(input): HermesBubblePlacement | null`.
- Consumes measured actor/bubble rectangles and protected DOM rectangles; it
  does not query the DOM or own React state.

- [x] **Step 1: Write failing pure placement tests.**

  Cover the desired point, each viewport edge, a Continue Research rectangle,
  a right-rail task rectangle, a `390×844` viewport and a dense layout with no
  legal bubble quadrant:

  ```ts
  it('settles at the nearest point that keeps the actor clear of protected work', () => {
    const result = resolveHermesSettledDock({
      desired: { x: 420, y: 310 },
      footprint: { bottom: 100, left: 100, right: 100, top: 100 },
      obstacles: [rect(240, 120, 500, 380)],
      viewport: rect(0, 0, 1440, 900),
    });
    expect(result.safe).toBe(true);
    expect(overlaps(rectForFootprint(result.point, {
      bottom: 100, left: 100, right: 100, top: 100,
    }), rect(240, 120, 500, 380))).toBe(false);
  });

  it('suppresses a bubble when no in-viewport quadrant avoids protected work', () => {
    expect(resolveHermesBubblePlacement({
      actor: rect(95, 322, 200, 200),
      bubble: { height: 92, width: 192 },
      obstacles: [rect(0, 0, 390, 844)],
      viewport: rect(0, 0, 390, 844),
    })).toBeNull();
  });
  ```

- [x] **Step 2: Run RED and verify missing exports.**

  ```powershell
  npx pnpm@9.15.0 --filter @openscience/web exec vitest run test/hermes-companion-placement.test.ts test/hermes-dock-preferences.test.ts
  ```

  Expected: FAIL because the placement module and settled-dock contract do not
  exist.

- [x] **Step 3: Implement deterministic candidate selection.**

  Use one `12px` clearance. Clamp the desired centre first, then consider four
  corners and four edge midpoints, sort candidates by distance to the desired
  point, and select the first footprint that intersects no obstacle. Bubble
  candidates prefer open space based on actor quadrant, then try the remaining
  three combinations:

  ```ts
  export type Point = { x: number; y: number };
  export type RectLike = { bottom: number; left: number; right: number; top: number };
  export type Footprint = { bottom: number; left: number; right: number; top: number };
  export type HermesBubblePlacement = {
    horizontal: 'left' | 'right';
    vertical: 'above' | 'below';
    bounds: RectLike;
  };

  const gap = 12;
  const clamp = (value: number, minimum: number, maximum: number) =>
    Math.min(maximum, Math.max(minimum, value));
  const overlaps = (a: RectLike, b: RectLike) =>
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  const occupied = (point: Point, footprint: Footprint): RectLike => ({
    bottom: point.y + footprint.bottom,
    left: point.x - footprint.left,
    right: point.x + footprint.right,
    top: point.y - footprint.top,
  });

  export function resolveHermesSettledDock(input: {
    desired: Point;
    footprint: Footprint;
    obstacles: RectLike[];
    viewport: RectLike;
  }): { point: Point; safe: boolean } {
    const safe = {
      bottom: input.viewport.bottom - input.footprint.bottom,
      left: input.viewport.left + input.footprint.left,
      right: input.viewport.right - input.footprint.right,
      top: input.viewport.top + input.footprint.top,
    };
    if (safe.left > safe.right || safe.top > safe.bottom) {
      return { point: input.desired, safe: false };
    }
    const desired = {
      x: clamp(input.desired.x, safe.left, safe.right),
      y: clamp(input.desired.y, safe.top, safe.bottom),
    };
    const candidates = [
      desired,
      { x: safe.left, y: safe.top },
      { x: safe.right, y: safe.top },
      { x: safe.right, y: safe.bottom },
      { x: safe.left, y: safe.bottom },
      { x: (safe.left + safe.right) / 2, y: safe.top },
      { x: safe.right, y: (safe.top + safe.bottom) / 2 },
      { x: (safe.left + safe.right) / 2, y: safe.bottom },
      { x: safe.left, y: (safe.top + safe.bottom) / 2 },
    ].sort((a, b) => Math.hypot(a.x - desired.x, a.y - desired.y)
      - Math.hypot(b.x - desired.x, b.y - desired.y));
    const point = candidates.find((candidate) => input.obstacles.every(
      (obstacle) => !overlaps(occupied(candidate, input.footprint), obstacle),
    ));
    return point ? { point, safe: true } : { point: desired, safe: false };
  }

  export function resolveHermesBubblePlacement(input: {
    actor: RectLike;
    bubble: { height: number; width: number };
    obstacles: RectLike[];
    viewport: RectLike;
  }): HermesBubblePlacement | null {
    const actorX = (input.actor.left + input.actor.right) / 2;
    const actorY = (input.actor.top + input.actor.bottom) / 2;
    const horizontal = actorX < (input.viewport.left + input.viewport.right) / 2
      ? ['right', 'left'] as const : ['left', 'right'] as const;
    const vertical = actorY < (input.viewport.top + input.viewport.bottom) / 2
      ? ['below', 'above'] as const : ['above', 'below'] as const;
    for (const sideY of vertical) for (const sideX of horizontal) {
      const left = sideX === 'right'
        ? input.actor.right + gap : input.actor.left - gap - input.bubble.width;
      const top = sideY === 'below'
        ? input.actor.bottom + gap : input.actor.top - gap - input.bubble.height;
      const bounds = {
        bottom: top + input.bubble.height,
        left,
        right: left + input.bubble.width,
        top,
      };
      const inside = bounds.left >= input.viewport.left && bounds.right <= input.viewport.right
        && bounds.top >= input.viewport.top && bounds.bottom <= input.viewport.bottom;
      if (inside && input.obstacles.every((obstacle) => !overlaps(bounds, obstacle))) {
        return { bounds, horizontal: sideX, vertical: sideY };
      }
    }
    return null;
  }
  ```

  `resolveHermesDock` continues to load stored ratios, but delegates resize
  recovery to the settled-dock resolver with an empty obstacle list. Invalid or
  impossible settled positions return the clamped desired point with
  `safe:false`; React must revert a drag or suppress autonomous speech rather
  than cover protected work.

- [x] **Step 4: Run GREEN and commit geometry policy.**

  Re-run both focused files and commit
  `feat(web): add collision-safe Hermes placement`.

### Task 21.3: Wire anchored scale, drag detachment and protected surfaces

**Files:**

- Modify: `apps/web/components/hermes/HermesWorkspaceStage.tsx`
- Modify: `apps/web/components/hermes/HermesPerformanceBubble.tsx`
- Modify: `apps/web/components/dashboard/ContinueResearch.tsx`
- Modify: `apps/web/components/dashboard/ImportStage.tsx`
- Modify: `apps/web/components/hermes/HermesRail.tsx`
- Modify: `apps/web/test/e2e/hermes-workspace-stage.spec.ts`
- Modify: `apps/web/test/e2e/hermes-dashboard.spec.ts`

**Interfaces:**

- `data-hermes-protected="true"` marks Dashboard regions that placement must
  avoid without coupling the stage to component names.
- `HermesPerformanceBubble` forwards an `HTMLElement` ref for real measurement.
- `data-hermes-anchored`, `data-hermes-stage-size`,
  `data-hermes-bubble-horizontal`, `data-hermes-bubble-vertical` and
  `data-hermes-bubble-safe` remain browser-test diagnostics.

- [x] **Step 1: Write failing interaction and Dashboard hierarchy tests.**

  Add assertions that the anchored stage is exactly `360×360`, mobile is
  `200×200`, the three Dashboard regions expose `data-hermes-protected`, a
  pointer click opens the drawer without detaching, a drag beyond `5px`
  detaches without opening the drawer, and desktop/mobile storage keys remain
  independent. Assert drawer-open makes the stage inert and no actor/bubble
  rectangle overlaps protected regions after pointer release.

- [x] **Step 2: Run the browser tests and verify RED.**

  Against a clean production build server, run:

  ```powershell
  npx pnpm@9.15.0 --filter @openscience/web exec playwright test test/e2e/hermes-workspace-stage.spec.ts test/e2e/hermes-dashboard.spec.ts --config playwright.config.ts
  ```

  Expected: FAIL on `336/176`, absent protected markers and anchored geometry
  still using the raw anchor rectangle.

- [x] **Step 3: Mark protected product regions and preserve layout ownership.**

  Add the marker only to the existing semantic containers:

  ```tsx
  <section
    aria-labelledby="continue-title"
    className="group border-y border-os-rule-dark py-6 sm:py-8"
    data-continuation-priority="primary"
    data-hermes-protected="true"
  >

  <section
    aria-labelledby="import-stage-title"
    className="border-t border-os-rule-dark pt-5"
    data-hermes-protected="true"
  >

  <aside
    aria-labelledby="hermes-task-title"
    className="border-t border-os-rule-dark pt-5"
    data-hermes-protected="true"
  >
  ```

  Apply `data-hermes-protected="true"` to both `ContinueResearch` branches, so
  the empty-state import link and populated Continue Research action share the
  same collision contract. `HermesDockAnchor` remains unchanged as an inert
  registration node and never becomes a second position owner.

- [x] **Step 4: Center the exact stage on the anchor and detach only after intent.**

  Replace anchored raw bounds with the resolved stage square:

  ```ts
  const stageSize = resolveHermesStageSize(false, compactGuide);
  const stageCenterX = anchored ? anchorRect.left + anchorRect.width / 2 : position.x;
  const stageCenterY = anchored ? anchorRect.top + anchorRect.height / 2 : position.y;
  const style: React.CSSProperties = {
    height: stageSize,
    left: stageCenterX - stageSize / 2,
    top: stageCenterY - stageSize / 2,
    width: stageSize,
  };
  ```

  Keep `customDock=false` during sub-threshold pointer motion. At the first move
  above `5px`, dismiss the stale cue and set detachment. On pointer release,
  measure the actor footprint, resolve the nearest safe settled dock against
  visible `[data-hermes-protected="true"]` rectangles, revert to the drag origin
  when `safe=false`, and persist ratios only after a safe settle. A no-drag
  release calls the existing `onInvoke` exactly once.

- [x] **Step 5: Measure and place bubbles independently.**

  Convert `HermesPerformanceBubble` to `React.forwardRef<HTMLElement, Props>`.
  When a cue becomes available, measure the actor and bubble, call
  `resolveHermesBubblePlacement`, write the chosen data attributes, and keep the
  cue hidden when placement is `null`. Functional guide bubbles continue to use
  the existing travel planner and drawer fallback. When the drawer is open,
  set `data-hermes-assistant-open="true"`, `aria-hidden="true"` and make the
  stage inert so it cannot cover or capture drawer controls.

- [x] **Step 6: Run GREEN and commit the interaction slice.**

  Re-run the focused unit and E2E files. Commit
  `feat(web): integrate Hermes with Dashboard work flow` only after click,
  drag, persistence, protected-region and drawer-inert assertions are green.

### Task 21.4: Refine bubble material and first-person visual acceptance

**Files:**

- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/test/hermes-performance-bubble.test.tsx`
- Modify: `apps/web/test/visual/hermes-live2d-motion-gate.mjs`
- Modify: `apps/web/test/visual/hermes-work-assistant-experience-gate.mjs`
- Modify: `apps/web/app/_visual/hermes-live2d/page.tsx` only if the real task
  fixture lacks a required protected marker; do not promote diagnostics.

**Interfaces:**

- Preserves the `ink-edge` material token and bilingual `next-intl` cue keys.
- Produces screenshots and geometry metrics under ignored
  `apps/web/test/visual/out/hermes-work-assistant/`.

- [x] **Step 1: Write failing visual-contract assertions.**

  Change all production size expectations from `336/176` to `360/200`. Require
  the bubble to remain at most `15.5rem`, use one `4px` radius, no gradient or
  blur, a single restrained shadow, `40×40px` dismiss target, one short mobile
  sentence and no visible mobile action toolbar. Add the `1920×1080` viewport
  to the experience gate.

- [x] **Step 2: Run RED on the old selectors.**

  ```powershell
  npx pnpm@9.15.0 --filter @openscience/web exec vitest run test/hermes-performance-bubble.test.tsx test/hermes-stage-sizing.test.ts
  ```

  Then run the existing visual gate against the clean local server and require
  failure on the old `176/336` attributes or selectors.

- [x] **Step 3: Apply the committed optical-editorial treatment.**

  Replace every mobile size selector with `200` and reserve `360px` desktop /
  `200px` mobile anchor height. Use these exact material values:

  ```css
  .hermes-dock-anchor {
    min-height: 22.5rem;
  }

  .hermes-companion-bubble {
    max-width: 15.5rem;
    border: 1px solid rgb(241 238 231 / .14);
    border-radius: 4px;
    background: rgb(12 15 14 / .97);
    box-shadow: 0 8px 20px rgb(0 0 0 / .18);
  }

  .hermes-workspace-stage[data-hermes-assistant-open='true'] {
    opacity: .18;
    pointer-events: none;
  }

  @media (max-width: 640px) {
    .hermes-dock-anchor { min-height: 12.5rem; }
    .hermes-workspace-stage[data-hermes-stage-size='200'] .hermes-companion-bubble {
      width: min(12rem, calc(100vw - 1rem));
    }
  }
  ```

  Keep entry motion to opacity plus `4px` settle. Preserve visible keyboard
  focus and `:active { transform: scale(.95); }`; approval and reduced-motion
  overrides remove the transition.

- [x] **Step 4: Use the page as a real user at all three viewports.**

  The gate must type in the RO title, use create/import, click Hermes to open
  and close the drawer, drag to every edge, reload, resize across the `640px`
  breakpoint, wait for an autonomous cue, trigger task feedback and verify:

  ```text
  actor ∩ protected = ∅
  bubble ∩ protected = ∅
  actor/bubble inside visual viewport
  one canvas + one model + one RAF owner
  no uncaught page or console errors
  ```

  Save `dashboard-{1440x900,1920x1080,390x844}.png` and a compact JSON metrics
  file. Review the screenshots at full size; fail the task if Hermes dominates
  the main work column, the bubble reads as a card, the mobile form is blocked,
  or the assistant appears visually detached from the right rail.

- [x] **Step 5: Run GREEN and commit the visual slice.**

  Run the focused Vitest and both Hermes visual gates. Commit
  `style(web): refine Hermes companion presence` only after the three screenshots
  and metrics satisfy the written design.

### Task 21.5: Quality gate, independent release review and ECS acceptance

**Files:**

- Modify after validation: `docs/progress.md`
- Modify after validation: `docs/handoff/2026-08-16-hermes-2d-pet-handoff.md`
- Modify after validation: `project_index.md`
- Modify after deployment: `docs/runbooks/deployment.md`

**Interfaces:**

- Produces one clean immutable release commit and retains ECS release
  `c97926a` as the explicit rollback ref.
- Changes no migration, database data, Secret, provider, permission or network
  topology.

- [x] **Step 1: Run the complete local gate serially.**

  Stop the local Next server before build, then run:

  ```powershell
  npx pnpm@9.15.0 --filter @openscience/web test
  npx pnpm@9.15.0 --filter @openscience/web typecheck
  npx pnpm@9.15.0 --filter @openscience/web build
  npx pnpm@9.15.0 --filter @openscience/web test:hermes-live2d
  npx pnpm@9.15.0 --filter @openscience/web test:hermes-work-assistant
  npx pnpm@9.15.0 --filter @openscience/web test:hermes-companion-release
  npx pnpm@9.15.0 lint
  npx pnpm@9.15.0 audit:docs-sync
  npx pnpm@9.15.0 docs:lint
  git diff --check
  ```

  Start the production server only after the build and run the authenticated
  Dashboard E2E subset. Any skipped visual, WebGL or browser test is a release
  blocker, not a warning.

- [x] **Step 2: Obtain independent Sol High review.**

  Review the complete Task 21 diff against §11 for correctness, React lifecycle,
  pointer capture, touch/keyboard accessibility, protected-region honesty,
  one-owner runtime safety, performance, test strength and release rollback.
  Resolve every Critical or Important finding and re-run affected gates.

- [x] **Step 3: Sync CURRENT truth and create the immutable release commit.**

  Record branch / HEAD / ECS release / rollback, exact test counts, screenshot
  paths and remaining risks. Update implementation rows from `336/176` to
  `360/200` only after code and browser gates are green. Commit all reviewed
  source, tests and docs; require `git status --short` empty.

- [ ] **Step 4: Perform read-only preflight and deployment dry-run.**

  ```bash
  XGS_RELEASE_SHA="$(git rev-parse HEAD)"
  bash infra/scripts/checkup.sh
  bash infra/scripts/deploy.sh --skip-migrate --rollback-ref c97926ab4188d5d5fc7a6e58e0333d20a600c692 "$XGS_RELEASE_SHA"
  ```

  Verify current release identity, no `.release-failed`, backup readiness and
  healthy containers. The dry-run must name the exact candidate and rollback.

- [ ] **Step 5: Deploy the already authorized development release.**

  ```bash
  XGS_RELEASE_SHA="$(git rev-parse HEAD)"
  bash infra/scripts/deploy.sh --confirm --skip-migrate --rollback-ref c97926ab4188d5d5fc7a6e58e0333d20a600c692 "$XGS_RELEASE_SHA"
  ```

  The script must complete full workspace build, SHA-tagged images, Parser-first
  health, application restart, Nginx validation, exact `/__release` and public
  health checks. Do not run migrations or seed data.

- [ ] **Step 6: Run authenticated public acceptance and close the release.**

  Against `https://openscience.428312321.xyz/dashboard`, repeat the three
  viewport click/drag/resize/bubble checks with the existing authenticated
  production gate. Confirm target container health, runtime dependency loading,
  one canvas/model/RAF, protected-region separation, exact release SHA and the
  absence of `.release-failed`. Update the deployment runbook with backup size,
  container/migration status, public gate count and rollback SHA; run docs gates
  again before claiming completion.
