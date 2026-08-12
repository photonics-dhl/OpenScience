# Optical Lab Task 8 Steps 3–5 Handoff

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
