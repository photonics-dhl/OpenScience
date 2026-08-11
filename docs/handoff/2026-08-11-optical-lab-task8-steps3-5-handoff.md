# Optical Lab Task 8 Steps 3–5 Handoff

## Status

Task 8 Steps 3–5 and Candidate B local engineering acceptance are complete on `codex/optical-editorial-v3`. The isolated Lab is available only at `/_visual/optical-lab`; production `/` and its Canvas renderer remain unchanged. Task Master Task 4 remains `in-progress`. Step 6 is intentionally pending user visual selection.

Candidate B commits: model `40b2668`, material/gate `217fcd3`, review fix `db68475`, browser-global lint fix `ded8011`. Earlier Candidate A commits `8485dac` and `a0509ef` remain history. The Lab has **not** been deployed.

## Verification and review state

- Candidate B retained the reviewed transactional lifecycle and added reference-relative resting topology, fixed 58% aperture, nonzero resting optics, bounded whole-line refraction and a deterministic glyph-derived vertical particle curtain. Candidate A first failed honestly at resting waist `1.072084 < 1.18`.
- Candidate B review fix round 1 addressed honest single-frame 150ms capture, descendant marker transparency/selection, first-draw GPU ink publication and differential fresh-context restore evidence. Scoped re-review found no open Critical/Important findings.
- Fresh Task 3 verification passed: focused Optical Lab 14/14, full Web 29 files / 175 tests, Web typecheck, production build, 138-second production-start browser matrix, root lint (`WORKSPACE_STRUCTURE_OK`, `DOCS_SYNC_OK`), docs lint and `git diff --check`. Port 3062 had no listener before or after the gate and no listener on final recheck.
- `ded8011` fixes the only Task 3 RED outside visual behavior: root lint found seven missing browser-global declarations in the Playwright gate; the one-line declaration fix passed targeted ESLint, root lint, focused tests, production build and the complete browser matrix without changing output or thresholds.

## Manual visual ruling

Candidate B is engineering-valid but not yet aesthetically selected. Original-resolution desktop, resting, left/right 150ms, forced WebGL1 and DOM fallback evidence shows one continuous title, a fixed aperture, a warm non-dark waist and subtle whole-line response. No duplicate/severed title, ring, fan, mechanical vertical line, DOM ghost or aperture movement was observed. Relative to the user reference, Candidate B has a more restrained focus and weaker rightward beam while its upper/lower discrete particle curtain is more prominent. Those differences require Step 6 user judgment; the candidate must not replace production `/` or be called visually accepted yet.

## Server preflight

- `infra/scripts/checkup.sh` passed through Git for Windows Bash: disk 11% used, about 26 GiB available memory, nginx and Docker active, production Web/API/Postgres/Redis/object storage/malware scanner running.
- Do not run the script as plain `bash` from PowerShell: that resolves to WSL, fails to translate `Z:\\Dirac\\scripts`, and then cannot find the configured SSH identity.
- Use `& 'C:\\Program Files\\Git\\bin\\bash.exe' infra/scripts/checkup.sh` and the same Git Bash executable for backup/deploy scripts.

## Completed

- Added contract/model tests before implementation and captured the expected missing-route/missing-model RED failures.
- Added a no-index three-column Lab with the authorized target reference, a current production-build capture, and a candidate that retains one selectable semantic `h1`.
- Added a dependency-free, client-only native WebGL renderer: transactional WebGL2 first; on acquisition or initialization failure, cleanup and retry WebGL1 on a fresh canvas; otherwise DOM/static.
- Implemented a small dissipating flow texture, fixed 58% signed aperture, glyph texture displacement, bounded directional caustic/chroma, and sparse deterministic instanced glyph-edge particles through WebGL2 or `ANGLE_instanced_arrays`. Pointer input changes energy/phase and at most 18 px vertical bias, not aperture position.
- Added dynamic mobile/reduced-motion static policies, context-loss fallback/recovery, transactional resource cleanup, and public diagnostics for mode/context/frame/FPS/CPU/GPU/bounds.
- Added a production-start browser gate covering candidate-only distinct pointer frames, forbidden geometry/ghost pixel probes, WebGL2 and WebGL1 instanced draws, WebGL2-init failure to fresh WebGL1, forced dual-init/total-context fallback, mobile, reduced motion, context loss/restore, stable bounds and exact resource cleanup.
- Amended ADR-009 for the measured Canvas visual failure and strictly isolated native WebGL exception. No visual dependency or lockfile change was introduced.

## Evidence

- Fresh desktop/WebGL2 measured 57.4 FPS and 0.74 ms CPU submit; forced WebGL1 measured 52.4 FPS and 0.41 ms. Headless Chromium used ANGLE/SwiftShader; synchronized fallback GPU values are diagnostics only, not real-device performance claims.
- Fresh desktop topology was waist `1.239995`, downstream `0.093903`, continuity `0.970297`, directionality `1.565451`, curtain coverage/spread `0.583333 / 0.491071`. Forced WebGL1 was `1.469110 / 0.093586 / 0.969231 / 1.568519 / 0.978495 / 0.577904`.
- Route-exclusive emitted Lab JavaScript: 19,559 bytes raw / 6,266 bytes gzip.
- Route CSS: 4,134 bytes raw / 1,422 bytes gzip.
- Production homepage build report remains 3.87 kB route size / 112 kB First Load JS and its module graph does not import the Lab renderer.
- Generated evidence is ignored at `apps/web/test/visual/out/optical-lab/`: `desktop.png`, `mobile.png`, `reduced.png`, forced-fallback captures, active pointer frames and `metrics.json`.

## Important implementation note

Next App Router treats `_visual` as a private folder. The actual route therefore lives under encoded `%5Fvisual`, while `_visual` is a test-friendly re-export. A production-start regression exposed that one App Router `page.tsx` must not import another page module; the shared page was extracted to `components/optical-lab/OpticalLabPage.tsx`, and the browser gate now runs against `next start` to prevent recurrence.

## Pending

1. User reviews reference/current/Candidate B evidence and explicitly accepts, iterates or rejects Candidate B at Step 6; headless SwiftShader is not real-device performance proof.
2. The deferred performance Minor remains visible: the browser gate records FPS/CPU and renderer particle count but lacks an explicit steady-state FPS/CPU budget and a direct 3,840-particle-cap assertion. Final review must triage it; Task 3 did not alter implementation or thresholds.
3. Only if the user explicitly requests isolated deployment, run the separate authorized backup/deploy/online-verification workflow. No such authorization has been inferred here.
4. Only if the user selects Candidate B for the homepage, write a separate production Landing replacement plan and rerun TDD, release-browser and authorized ECS deployment gates.

No ECS, compose, API, schema, authentication, upload, Hermes or production Landing change is part of this handoff.
