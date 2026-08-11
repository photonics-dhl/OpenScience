# Optical Lab Task 8 Steps 3–5 Handoff

## Status

Task 8 Steps 3–5 and Candidate B local engineering acceptance are complete on `codex/optical-editorial-v3`, but the user has now rejected Candidate B's visual result as too far from the `Science evolves.` reference. The isolated Lab remains available only at `/_visual/optical-lab`; production `/` and its Canvas renderer remain unchanged. Task Master Task 4 remains `in-progress`.

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

The user approved a replacement design section by section: OGL WebGL2 multi-pass rendering; a 1672×941 title contract spanning `x=2.2%–95.7%` and `y=35.8%–60%`; a fixed 58% type/aperture seam; intact glyph, dissolution, full-height curtain, 4–6vw caustic and right-only emission layers; flowmap-driven 1–2px whole-line follow with a 4px local cap and 650ms exact recovery; and a pre-rendered high-fidelity static fallback for WebGL1/reduced motion. The active design is `docs/specs/2026-08-11-optical-lab-high-fidelity-design.md`, pending written review.

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

1. User reviews the written high-fidelity spec; after approval, invoke `writing-plans` and start with a typography-only full-size specimen gate.
2. Amend ADR-009 in the implementation plan because the approved design replaces the dependency-free native experiment with OGL inside the isolated Lab.
3. Preserve Candidate B lifecycle/cleanup evidence while replacing its visual formulas; headless SwiftShader is not real-device performance proof.
4. Do not deploy or replace production `/` without a later explicit plan and authorization.

No ECS, compose, API, schema, authentication, upload, Hermes or production Landing change is part of this handoff.
