# Optical Lab Task 8 Steps 3–5 Handoff

> **SUPERSEDED CURRENT ENTRY:** This long document is historical evidence.
> Resume only from
> `docs/handoff/2026-08-13-optical-lab-asset-interaction-handoff.md`. The static
> asset visual is already accepted; its only unfinished task is the central
> mixed-flow interaction. Do not restart transparent-asset generation or old
> procedural rendering work.

## 2026-08-13 Accepted Interaction Architecture

- The user selected mixed optical flow, global Hero input with central-only visible response, equivalent desktop/touch behavior, and a fully static reduced-motion result.
- The active design now specifies a separate lightweight OGL `AssetInteractionRenderer`: the accepted static plates remain authoritative at rest; a feathered central replacement patch appears only during input/recovery and becomes transparent with inactive RAF by 650ms.
- Bounds are patch follow ≤2 CSS px, local refraction ≤4 CSS px, caustic gain ≤8%, monotonic response near 120ms, fixed 58% aperture and no radial cursor field, whole-title drift or broad haze.
- Written spec review is the current gate. No interaction code, production `/` change or ECS deployment is authorized yet.

## 2026-08-13 Visual Acceptance and Interaction Request

- The user explicitly accepted the current native visual candidate. Its resting typography, central coupling and energy composition are now the fixed baseline.
- The user additionally requires central mouse interaction in the actual accepted product. No interaction implementation is authorized until its behavior is confirmed; motion must enhance, never replace or visibly drift, the accepted resting frame.
- The existing active design offers a bounded baseline: velocity-follow rather than a radial cursor force, 1–2 CSS px whole-line follow, at most 4 CSS px local refraction, at most 8% caustic gain, monotonic response near 120ms and exact rest by 650ms with a fixed 58% aperture.
- Production `/` and ECS remain unchanged and undeployed.

## 2026-08-13 Typography–Energy Coupling Correction

- The prior seam clip was visually invalid: it removed the final `e` of `Science` and left a flat, distorted DOM `evolves`; do not restore or describe that state as complete.
- Exact asset mode now layers the full-height transparent energy plate, a feather-masked central typography/effect plate from the project-owned target reference, and one transparent selectable semantic heading. The legacy 1.6px DOM stroke is disabled in asset mode.
- Native 1672×941 comparison reports zero mean/max RGB error across the full title band, headline core and first-`e` seam regions. Contract/browser RED→GREEN also proves intact overflow, loaded plate dimensions, transparent selectable text and no client/canvas/GPU mount.
- This remains an isolated fixed-aspect visual acceptance prototype. Production `/`, ECS and responsive promotion are unchanged; user visual approval is still pending and must not be inferred from pixel/test evidence.

## 2026-08-13 Asset Seam Ghost Fix

- The apparent duplicate title was not baked into the generated RGBA plate. Archivo `Science` ink overflowed its 58% allocation while Bodoni `evolves` began at that same seam, so both were painted near the aperture.
- Asset mode now clips only the overflowing Science ink at the seam. The default Lab runtime, semantic selectable title, asset composition, production `/` and ECS remain unchanged.
- The browser regression guard first failed on computed `overflow-x: visible`, then passed with the seam clip and refreshed the ignored 1672×941 screenshot.

## 2026-08-13 Approved Asset Candidate Integration

- The user approved the black-to-alpha energy plate. It is promoted as `apps/web/public/optical-lab/energy-plate-black-alpha-v1.png` and is available only at `/_visual/optical-lab?candidate=asset`; production `/`, ECS and the default Lab candidate are unchanged.
- Asset mode renders the decorative RGBA plate behind the single selectable semantic `Science evolves.` heading and omits the client mount, canvas and GPU runtime. Unknown or repeated candidate values cannot enable it.
- Independent review findings on diagnostics consistency, capture-process ownership/cleanup and default diagnostic text were closed with RED/GREEN tests. Final scoped review found no Critical or Important issues.
- Root verification passed contract `26/26`, Web typecheck, production build and the 1672×941 browser capture. The ignored evidence is `apps/web/test/visual/out/optical-lab/asset-candidate-1672x941.png`; nothing was deployed or committed in this integration round.

## 2026-08-13 Black-to-Alpha Energy Plate Candidate

- API-native transparency is no longer the only viable route. Built-in image generation produced a text-free pure-black energy plate from the real target reference; additive decomposition converts black to zero alpha and unpremultiplies the emissive RGB without chroma spill.
- Candidate: `tmp/imagegen/energy-plate-black-alpha-v1.png` (RGBA 1672×941). Review composite: `tmp/imagegen/energy-plate-black-alpha-v1-preview.png`. Source: `tmp/imagegen/energy-plate-black-v1-source.png`.
- Validation: transparent corners; nonzero alpha coverage `.144896`; 227,658 partially transparent pixels; recomposition over black has mean channel error `.210699`, p99 `2`, max `2` versus the source.
- Superseded by the approved integration above. Production `/` and ECS remain unchanged.

## 2026-08-13 Built-in Imagegen Transparency Gate

- Built-in image generation used the real `target-reference.png` and produced a structurally relevant 1672×941 energy plate source with no text; this confirms the corrected task context and image-generation capability.
- The required translucent filaments cannot be cleanly extracted from the generated magenta chroma background: v1 retains visible magenta spill, while the single allowed edge-contracted retry removes most of the subject. Neither output is accepted or integrated.
- Untracked evidence remains under `tmp/imagegen/`; do not promote `energy-plate-v1.png` or `energy-plate-v2.png`.
- User explicitly approved CLI `gpt-image-1.5` native transparency. The bundled CLI dry-run validated the edit request, but the real API call failed at authentication with HTTP 401 `invalid_api_key`; no native output file was created and the request was not retried.
- Next action: the user updates `OPENAI_API_KEY` locally and refreshes the Codex process environment, then rerun the same non-overwriting native-transparent edit. Production `/`, runtime integration and ECS remain out of scope until a transparent static plate passes visual review.

## 2026-08-13 Asset-First Route Decision

- User rejected the current right-side procedural ray fan as materially unlike `apps/web/public/optical-lab/target-reference.png`. Do not continue tuning the existing analytic ray field as the visual source of truth.
- Next session must test an asset-first hybrid: a text-free transparent energy plate over the existing DOM/MSDF headline, with PNG as the first acceptance artifact and WebM/Unicorn only after the static composition is visually close.
- Current OGL runtime, selection, flowmap, fallback and production isolation remain retained as infrastructure, but must not generate the full right-side material until a visual direction is re-approved.
- Unicorn Studio research found official JS SDK, JSON export, WebM/MP4 export and commercial/no-logo export on the paid Legend plan; account access, self-hosting/CDN behavior and license terms are not yet verified for this project.
- This session's Pillow-generated previews are untracked under `tmp/` and are not accepted assets. No page code, production route, ECS or deployment changed after the route decision.
- First next-session action: read `AGENTS.md`, spec, progress and this handoff; inspect `target-reference.png`; produce and compare one transparent `energy-plate.png` at 1672×941 before any runtime integration.

## 2026-08-13 Energy Composition Iteration

- The isolated Lab now uses one particle-owned double-sided lens shell at the fixed `.58` aperture, a nonlinear converging particle curtain and one final-composite family of sparse straight rightward rays. The former seven parallel caustic columns, duplicate low-resolution ray field and broad blur wash are removed or reduced.
- Morphology gates now measure outer-band filament/haze composition, 141-slope radial continuity and target-relative absolute energy. A coherent track must have a local tangent ridge, dark normal side lobes, sparse angular occupancy and at least 75% coverage across 13 near-aperture bridge samples from downstream `.05` through `.11`.
- Independent review drove RED/GREEN fixtures for dense vertical blinds, title-only ink, floating radial segments and floating segments with isolated bridge dots. All are rejected; the current frame retains six aperture-connected tracks.
- Latest native metrics: center error `.001352`, caustic width `.059211`, curtain `.974914`, dissolution `.779762`, similarity `.861427`, filament `.805872` versus target `.795277`, haze `0` versus target `.052510`, radial coherence `.042553`, coherent energy `.012027`, and absolute radial energy `.071579` versus target `.028456`.
- Fresh verification passed focused `35/35`, Web `31 files / 223 tests`, full workspace tests/typecheck/lint, production build and 127.9-second production-start browser gate, docs lint `181 files / 0 issues`, docs sync, diff check and port 3062 cleanup.
- Remaining external gates are physical desktop/mobile 15-second performance evidence and the user's final full-size visual ruling. Production `/` and ECS remain unchanged; this work does not authorize promotion or deployment.

## 2026-08-12 Task 8 Local Acceptance Update

- High-fidelity Tasks 1–8 are locally engineering-GREEN on
  `codex/optical-editorial-v3`. Commits are Task 5 `2404da2`, Task 6 `677cbb3`,
  Task 7 `72b93a4` and final independent-review fixes `54236f3`.
- Independent review found no Critical issues. All three Important findings were
  resolved: browser-level adaptive quality transitions, accepted-phase pointer
  evidence plus real mouse selection, and observed FPS/CPU/bloom diagnostics
  with honest unavailable GPU timing.
- Final adaptive evidence is `65536/.25 → 36044/.125 → 65536/.25`, with stable
  bounds throughout and a controlled `60 FPS / 2 ms CPU` recovery observation.
  Dynamic and DOM/static modes both support real drag selection of the unique
  semantic `Science evolves.` title.
- Fresh final gates passed: Web `31 files / 221 tests`, typecheck, root lint,
  workspace/docs sync, production build, 133.2-second production-start browser
  matrix, docs lint `180 files / 0 issues`, diff check and port 3062 cleanup.
- Required physical desktop/mobile 15-second resting and interaction data was
  not captured in this session. SwiftShader results are not real-device GPU
  evidence. User full-size visual acceptance is also pending.
- Production `/`, ECS, backend, schema, authentication and Hermes were not
  changed or deployed. Visual acceptance alone does not authorize deployment.

## 2026-08-12 Task 6 Update

- User approved the Task 5 original-resolution resting frame; accepted Task 5 is commit `2404da2`.
- Task 6 bounded flow is complete in the isolated Lab: 96×54 ping-pong velocity targets, real pointer timestamps, aperture-relative direction, `1–2px` whole-line response, `≤4px` local cap, `≤.08` caustic gain and exact 650ms recovery.
- Evidence: focused `29/29`, full Web `30 files / 214 tests`, Web typecheck, production build, production-start browser matrix, root lint/workspace/docs-sync and diff check all pass. Original-resolution resting/left/slit/right/recovered frames were inspected.
- Production `/`, ECS, backend, schema, auth and Hermes were not changed or deployed.
- Next action: execute Task 7 static fallback promotion and runtime budget adaptation. Do not replace production `/` without a later explicit approval.

## Status

Task 8 Steps 3–5 and Candidate B local engineering acceptance are complete on `codex/optical-editorial-v3`, but the user rejected Candidate B's visual result as too far from the `Science evolves.` reference. The user has now approved the replacement design and its eight-task implementation plan. The isolated Lab remains available only at `/_visual/optical-lab`; production `/` and its Canvas renderer remain unchanged. Task Master Task 4 remains `in-progress`.

Candidate B commits: model `40b2668`, material/gate `217fcd3`, review fixes `db68475` and `af08251`, browser-global lint fix `ded8011`. Earlier Candidate A commits `8485dac` and `a0509ef` remain history. The Lab has **not** been deployed.

## Verification and review state

- Candidate B retained the reviewed transactional lifecycle and added reference-relative resting topology, fixed 58% aperture, nonzero resting optics, bounded whole-line refraction and a deterministic glyph-derived vertical particle curtain. Candidate A first failed honestly at resting waist `1.072084 < 1.18`.
- Candidate B review fix round 1 addressed honest single-frame 150ms capture, descendant marker transparency/selection, first-draw GPU ink publication and differential fresh-context restore evidence. Scoped re-review found no open Critical/Important findings.
- Fresh Task 3 verification passed: focused Optical Lab 14/14, full Web 29 files / 175 tests, Web typecheck, production build, 138-second production-start browser matrix, root lint (`WORKSPACE_STRUCTURE_OK`, `DOCS_SYNC_OK`), docs lint and `git diff --check`. Port 3062 had no listener before or after the gate and no listener on final recheck.
- `ded8011` fixes the only Task 3 RED outside visual behavior: root lint found seven missing browser-global declarations in the Playwright gate; the one-line declaration fix passed targeted ESLint, root lint, focused tests, production build and the complete browser matrix without changing output or thresholds.
- Final branch review found two further Important issues. `af08251` makes the visual overlay pointer-transparent and uses inline-flow semantic text, so real Chromium mouse drag selects exact `Science evolves.` in GPU and DOM fallback modes while stage pointer gates remain active. It also adds real-`dt` target/current refraction follow, radial velocity/phase limits, and a shader-side CSS-pixel clamp across refraction, wave and flow; the combined pointer displacement is at most `8px` and recovery is exactly zero by `650ms`.
- Fresh final-fix evidence passed focused 16/16, Web 29 files / 177 tests, typecheck, root lint, production build and the 150.1-second full browser matrix. The unchanged `.35/.008` active and resting topology gates remained GREEN; port 3062 was clean afterward.

## Manual visual ruling

Candidate B is engineering-valid but aesthetically rejected. Original-resolution evidence remains useful lifecycle and regression history, but its small title, isolated point curtain, weak focus and thin rightward emission do not reproduce the reference's composition or material quality. It must not replace production `/` or be called visually accepted.

The user approved a replacement design section by section and in final written review: OGL WebGL2 multi-pass rendering; a 1672×941 title contract spanning `x=2.2%–95.7%` and `y=35.8%–60%`; a fixed 58% type/aperture seam; intact glyph, dissolution, full-height curtain, 4–6vw caustic and right-only emission layers; flowmap-driven 1–2px whole-line follow with a 4px local cap and 650ms exact recovery; and a pre-rendered high-fidelity static fallback for WebGL1/reduced motion. The active design is `docs/specs/2026-08-11-optical-lab-high-fidelity-design.md`; the active implementation plan is `docs/superpowers/plans/2026-08-11-optical-lab-high-fidelity-reconstruction-plan.md`.

The plan fixes the reproducible asset path: `ogl@1.0.11` is the only new runtime dependency, `msdf-bmfont-xml@2.8.0` is a project-pinned development generator, selected Google Fonts TTF/OFL sources and SHA-256 manifests are committed, and the browser never downloads fonts at runtime. It has hard user stops after the native-size typography specimen and after the complete resting material. Pointer response and fallback promotion cannot begin before those approvals.

## Server preflight

- `infra/scripts/checkup.sh` passed through Git for Windows Bash: disk 11% used, about 26 GiB available memory, nginx and Docker active, production Web/API/Postgres/Redis/object storage/malware scanner running.
- Do not run the script as plain `bash` from PowerShell: that resolves to WSL, fails to translate `Z:\\Dirac\\scripts`, and then cannot find the configured SSH identity.
- Use `& 'C:\\Program Files\\Git\\bin\\bash.exe' infra/scripts/checkup.sh` and the same Git Bash executable for backup/deploy scripts.

## Completed

- Added contract/model tests before implementation and captured the expected missing-route/missing-model RED failures.
- Added a no-index three-column Lab with the authorized target reference, a current production-build capture, and a candidate that retains one selectable semantic `h1`.
- Added a dependency-free, client-only native WebGL renderer: transactional WebGL2 first; on acquisition or initialization failure, cleanup and retry WebGL1 on a fresh canvas; otherwise DOM/static.
- Implemented a small dissipating flow texture, fixed 58% signed aperture, glyph texture displacement, bounded directional caustic/chroma, and sparse deterministic instanced glyph-edge particles through WebGL2 or `ANGLE_instanced_arrays`. Candidate A historically used an `18px` vertical-bias clamp; Candidate B instead caps the complete pointer-induced displacement vector at `8px` without moving the aperture.
- Added dynamic mobile/reduced-motion static policies, context-loss fallback/recovery, transactional resource cleanup, and public diagnostics for mode/context/frame/FPS/CPU/GPU/bounds.
- Added a production-start browser gate covering candidate-only distinct pointer frames, forbidden geometry/ghost pixel probes, WebGL2 and WebGL1 instanced draws, WebGL2-init failure to fresh WebGL1, forced dual-init/total-context fallback, mobile, reduced motion, context loss/restore, stable bounds and exact resource cleanup.
- Amended ADR-009 for the measured Canvas visual failure and strictly isolated native WebGL exception. No visual dependency or lockfile change was introduced.

## Evidence

- Fresh desktop/WebGL2 measured 56.7 FPS and 0.60 ms CPU submit; forced WebGL1 measured 49.4 FPS and 0.58 ms. Headless Chromium used ANGLE/SwiftShader; synchronized fallback GPU values are diagnostics only, not real-device performance claims.
- Fresh desktop topology was `1.474743 / 0.092701 / 0.965347 / 1.563921 / 0.510417 / 0.481993` (waist/downstream/continuity/directionality/curtain coverage/spread). Forced WebGL1 was `1.298521 / 0.093620 / 0.971795 / 1.579973 / 0.989247 / 0.587262`.
- Route-exclusive emitted Lab JavaScript: 19,559 bytes raw / 6,266 bytes gzip.
- Route CSS: 4,134 bytes raw / 1,422 bytes gzip.
- Production homepage build report remains 3.87 kB route size / 112 kB First Load JS and its module graph does not import the Lab renderer.
- Generated evidence is ignored at `apps/web/test/visual/out/optical-lab/`: `desktop.png`, `mobile.png`, `reduced.png`, forced-fallback captures, active pointer frames and `metrics.json`.

## Important implementation note

Next App Router treats `_visual` as a private folder. The actual route therefore lives under encoded `%5Fvisual`, while `_visual` is a test-friendly re-export. A production-start regression exposed that one App Router `page.tsx` must not import another page module; the shared page was extracted to `components/optical-lab/OpticalLabPage.tsx`, and the browser gate now runs against `next start` to prevent recurrence.

## Pending

1. Task 8: run the fresh final focused/full/build/browser/docs gates and record a local acceptance report.
2. Record physical desktop and mobile 15-second resting/interaction performance; headless SwiftShader remains non-GPU evidence only.
3. Request independent code review and resolve every Critical/Important finding with fresh RED/GREEN evidence.
4. Present full-size reference, final dynamic candidate, static fallback and subtle active frame for final user acceptance.
5. Do not deploy or replace production `/` without a later explicit plan and authorization.

## Task 7 completion

- Promoted the user-approved 1672×941 resting capture as decorative `accepted-resting.png`; the restricted CLI verifies dimensions, 2 MiB and records source SHA-256 `711f74c957db07006d9b0a6bccb4b92c0074234018a3e30f2d13262993f3ed35`.
- Static fallback modes show the accepted artwork without canvas/RAF. The semantic h1 remains in DOM; its visible ink is suppressed only after image load and restored on image failure.
- Runtime quality tiers are `full`, `reduced-particles`, `reduced-bloom`: two slow 2-second windows reduce one tier, ten fast seconds restore one; DPR ≤2, particle floor 55%, reduced bloom scale 1/8.
- Fresh evidence: focused 24/24, full Web 31 files / 221 tests, typecheck, production build, production-start browser matrix, root lint/docs-sync and diff check passed. Production `/` remains 3.87 kB / 112 kB and its actual route chunks contain no OGL renderer.
- Task 7 implementation and documentation are ready for the planned local feature commit. Production `/` and ECS were not changed.

No ECS, compose, API, schema, authentication, upload, Hermes or production Landing change is part of this handoff.
