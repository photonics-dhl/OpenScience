# Hermes 3D Scholar Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an original, reproducible Blender/GLB Hermes scholar robot with six honest actions and a lazy OGL renderer that preserves the existing semantic and fallback contract.

**Architecture:** A deterministic Blender Python builder creates the editable `.blend`, runtime `.glb`, poster and review renders. A small GLB contract parser guards the asset. `HermesVisualAdapter` remains the state/link owner and lazy-mounts an isolated OGL renderer only after load; the existing vector portrait remains the SSR, reduced-motion and failure fallback.

**Tech Stack:** Blender 4.5 LTS Portable on E:, Blender Python API, glTF 2.0/GLB, OGL 1.0.11, React 18, Next.js 14, Vitest, Playwright.

## Global Constraints

- Never install Blender, caches or generated temporary data on C:.
- Do not copy Wanko, Live2D sample assets or third-party character binaries.
- Preserve all six `HermesVisualState` values and the existing task-link contract.
- `awaiting_approval` and reduced motion are exactly still; reduced motion creates no WebGL context.
- Do not add Three.js, Pixi, Cubism or another renderer dependency.
- GLB ≤ 1.8 MB raw, ≤ 24,000 triangles, ≤ 6 materials and ≤ 12 steady draw calls.
- One visual instance, one canvas and one context; lazy after page load; full cleanup on every exit path.
- Do not touch API, database, authentication, permissions or production deployment.

---

### Task 1: Reproducible Blender tool and asset contract

**Files:**
- Create: `infra/scripts/fetch-blender-portable.ps1`
- Create: `apps/web/scripts/hermes/inspect-hermes-glb.mjs`
- Create: `apps/web/test/hermes-3d-asset-contract.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Produces `E:/Miscellaneous/XGS/.tools/blender/blender.exe` without writing a Blender installation under C:.
- Produces `inspectHermesGlb(path): HermesGlbReport` for tests and release gates.

- [ ] Write a failing Vitest contract for missing asset, required node/action names, budgets and metadata.
- [ ] Run `npx pnpm@9.15.0 --filter @openscience/web test -- hermes-3d-asset-contract.test.ts` and record the expected missing-asset failure.
- [ ] Implement the GLB JSON-chunk parser and budget report without adding a dependency.
- [ ] Add a checksum-pinned Blender 4.5 LTS portable fetch script whose download, extraction and cache paths are all under `E:/Miscellaneous/XGS/.tools/`.
- [ ] Add only `.tools/` to `.gitignore`; retain scripts, sources and runtime assets in version control.
- [ ] Fetch Blender, run `blender.exe --version`, and verify the executable, archive and extracted files resolve to E:.
- [ ] Commit the tool bootstrap and RED asset contract.

### Task 2: Original Hermes geometry, materials and rig

**Files:**
- Create: `apps/web/scripts/hermes/build-hermes-asset.py`
- Create: `apps/web/assets/hermes/Hermes.blend`
- Create: `apps/web/public/hermes/hermes-scholar.glb`
- Create: `apps/web/public/hermes/hermes-scholar-poster.webp`
- Create: `apps/web/public/hermes/LICENSE.md`
- Modify: `apps/web/public/hermes/README.md`

**Interfaces:**
- Blender command: `blender.exe --background --factory-startup --python apps/web/scripts/hermes/build-hermes-asset.py -- --output-root E:/Miscellaneous/XGS/apps/web`.
- GLB nodes/actions/materials match Design §§3–4 exactly.

- [ ] Run the asset contract against the absent GLB and preserve RED.
- [ ] Build the adult head/shoulder/torso/arm silhouette, folio mantle, graphite spine and levitation core from deterministic primitives.
- [ ] Create the six named PBR materials and keep texture usage within the spec.
- [ ] Create one armature with rigidly weighted articulated parts and named bones for head, torso, mantle, pages and arms.
- [ ] Export the first GLB and run the contract; fix only structural failures until nodes, materials and budgets are GREEN.
- [ ] Render front, profile and 48 px silhouette proofs; reject camera, mask, seed, book-spirit or baby readings before animation work.
- [ ] Save the canonical `.blend`, poster and license/source record.
- [ ] Commit the original static 3D asset.

### Task 3: Six-state action library and Wanko-like secondary life

**Files:**
- Modify: `apps/web/scripts/hermes/build-hermes-asset.py`
- Modify: `apps/web/assets/hermes/Hermes.blend`
- Modify: `apps/web/public/hermes/hermes-scholar.glb`
- Create: `apps/web/public/hermes/review/hermes-turntable.mp4`
- Create: `apps/web/public/hermes/review/hermes-six-states.webp`
- Modify: `apps/web/test/hermes-3d-asset-contract.test.ts`

**Interfaces:**
- Exact clips: `Hermes_Idle`, `Hermes_Guiding`, `Hermes_Scanning`, `Hermes_Suggesting`, `Hermes_AwaitingApproval`, `Hermes_Failed`.

- [ ] Extend the failing contract to require exact clip names, duration ranges and zero transform delta in `Hermes_AwaitingApproval`.
- [ ] Author idle micro-float, breath, blink and mantle follow-through without a toy-like bounce.
- [ ] Author guiding, scanning and suggesting gestures with readable head lead, arm arcs and page-leaf secondary motion.
- [ ] Author approval as one neutral key and failure as one contained recoil followed by a stable pose.
- [ ] Export, parse and verify all six clips and budgets.
- [ ] Render a real turntable and six-state contact sheet from the `.blend`; inspect face, silhouette, intersections and state legibility.
- [ ] Commit the animated asset library.

### Task 4: Lazy OGL runtime with original-vector fallback

**Files:**
- Create: `apps/web/components/hermes/Hermes3DMount.tsx`
- Create: `apps/web/lib/hermes/hermes-3d-renderer.ts`
- Create: `apps/web/lib/hermes/hermes-action-map.ts`
- Modify: `apps/web/components/hermes/HermesVisualAdapter.tsx`
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/test/hermes-state.test.tsx`
- Create: `apps/web/test/hermes-3d-runtime.test.ts`

**Interfaces:**
- `createHermes3DRenderer({ canvas, assetUrl, state, onFirstFrame, onFailure }): Hermes3DRendererHandle`.
- `Hermes3DRendererHandle` exposes `setState`, `setPointer`, `setVisible`, `resize` and `dispose`.

- [ ] Add failing SSR/source contracts for one lazy 3D mount, unchanged semantic link, state-action map, first-frame fallback handoff and reduced-motion no-mount behavior.
- [ ] Implement the exhaustive state-to-action map.
- [ ] Implement OGL GLB load, camera, light, material and animation playback with one generation-owned renderer.
- [ ] Keep the vector portrait visible until the first successful real frame; restore it on failure or context loss.
- [ ] Add pointer gaze, visibility/offscreen pause, 30 Hz idle cadence and 60 Hz active cadence within the approved state boundaries.
- [ ] Dispose every listener, RAF and GL resource on unmount or route transfer.
- [ ] Run focused Vitest and typecheck to GREEN.
- [ ] Commit the runtime integration.

### Task 5: Real-browser visual, lifecycle and performance acceptance

**Files:**
- Create: `apps/web/test/visual/hermes-3d-gate.mjs`
- Modify: `apps/web/test/e2e/hermes-dashboard.spec.ts`
- Create: `apps/web/test/visual/out/hermes-3d/.gitkeep`

**Interfaces:**
- Gate accepts an owned `HERMES_PORT` or an external `HERMES_BASE_URL` without mutating external servers.

- [ ] Write a browser RED against the old vector-only build for absent GLB canvas and action diagnostics.
- [ ] Verify all six states use the corresponding real clip and one canvas/context.
- [ ] Verify pointer gaze is visible and bounded; approval and reduced motion remain exactly still.
- [ ] Verify hidden, offscreen, context-loss, delayed-load and route-unmount cleanup with balanced ownership counts.
- [ ] Capture 1440 × 900 and 390 × 844 normal/reduced screenshots plus the real turntable/contact sheet.
- [ ] Measure GLB transfer, first-frame latency, draw calls, frame cadence and DPR caps against the design budgets.
- [ ] Run focused tests, full Web tests, typecheck, build and the browser gate sequentially.
- [ ] Commit the browser acceptance gate.

### Task 6: Architecture decision, documentation and release-ready handoff

**Files:**
- Modify: `docs/decisions/ADR-010-hermes-visual-runtime-and-live2d-license-gate.md`
- Modify: `docs/progress.md`
- Modify: `project_index.md`
- Create: `docs/handoff/2026-08-15-hermes-3d-scholar-agent-handoff.md`

**Interfaces:**
- ADR records the original glTF/OGL renderer, Wanko non-use and rollback to `original-vector`.

- [ ] Update ADR-010 only after real asset/runtime evidence is GREEN.
- [ ] Record exact asset hashes, sizes, triangle/material/action counts and browser evidence.
- [ ] Run `npx pnpm@9.15.0 lint`, `npx pnpm@9.15.0 docs:lint`, `npx pnpm@9.15.0 audit:docs-sync` and `git diff --check`.
- [ ] Review the scoped diff against the design line by line and fix any Critical or Important finding.
- [ ] Commit the synchronized implementation and handoff; do not deploy without the user's final visual acceptance.
