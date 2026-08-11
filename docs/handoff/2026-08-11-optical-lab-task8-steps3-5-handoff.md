# Optical Lab Task 8 Steps 3–5 Handoff

## Status

Task 8 Steps 3–5 are implemented on `codex/optical-editorial-v3`. The isolated Lab is available only at `/_visual/optical-lab`; production `/` and its Canvas renderer remain unchanged. Task Master Task 4 remains `in-progress`. Step 6 is intentionally pending user visual selection.

## Completed

- Added contract/model tests before implementation and captured the expected missing-route/missing-model RED failures.
- Added a no-index three-column Lab with the authorized target reference, a current production-build capture, and a candidate that retains one selectable semantic `h1`.
- Added a dependency-free, client-only native WebGL renderer: WebGL2 first; WebGL1 only with half-float support; otherwise DOM/static.
- Implemented a small dissipating flow texture, fixed 58% signed aperture, glyph texture displacement, bounded directional caustic/chroma, and sparse deterministic glyph-edge particles. Pointer input changes energy/phase and at most 18 px vertical bias, not aperture position.
- Added mobile/reduced-motion static modes, context-loss fallback/recovery, resource cleanup, and public diagnostics for mode/context/frame/FPS/CPU/GPU/bounds.
- Added a production-start browser gate covering desktop, forced WebGL1, forced shader failure, forced total WebGL failure, mobile, reduced motion, independent pointer frames, stable bounds and cleanup.
- Amended ADR-009 for the measured Canvas visual failure and strictly isolated native WebGL exception. No visual dependency or lockfile change was introduced.

## Evidence

- Desktop and forced WebGL1 measured 60 FPS and 58 FPS in headless Chromium; CPU submit was 0.08 ms and 0.05 ms respectively.
- Headless Chromium used ANGLE/SwiftShader. The synchronized GPU fallback reported 0.00 ms in the final run; treat it only as a diagnostics-path check, not as real-device GPU performance.
- Route-exclusive emitted Lab JavaScript: 19,559 bytes raw / 6,266 bytes gzip.
- Route CSS: 4,134 bytes raw / 1,422 bytes gzip.
- Production homepage build report remains 3.87 kB route size / 112 kB First Load JS and its module graph does not import the Lab renderer.
- Generated evidence is ignored at `apps/web/test/visual/out/optical-lab/`: `desktop.png`, `mobile.png`, `reduced.png`, forced-fallback captures, active pointer frames and `metrics.json`.

## Important implementation note

Next App Router treats `_visual` as a private folder. The actual route therefore lives under encoded `%5Fvisual`, while `_visual` is a test-friendly re-export. A production-start regression exposed that one App Router `page.tsx` must not import another page module; the shared page was extracted to `components/optical-lab/OpticalLabPage.tsx`, and the browser gate now runs against `next start` to prevent recurrence.

## Pending

1. User reviews the reference/current/candidate comparison on a real desktop GPU and mobile device.
2. User explicitly accepts or rejects the candidate in Task 8 Step 6.
3. Only if accepted, create a separate production Landing replacement plan and run new TDD, release-browser and authorized ECS deployment gates.

No ECS, compose, API, schema, authentication, upload, Hermes or production Landing change is part of this handoff.
