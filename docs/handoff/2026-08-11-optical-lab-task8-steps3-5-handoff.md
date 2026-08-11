# Optical Lab Task 8 Steps 3–5 Handoff

## Status

Task 8 Steps 3–5 are implemented on `codex/optical-editorial-v3`. The isolated Lab is available only at `/_visual/optical-lab`; production `/` and its Canvas renderer remain unchanged. Task Master Task 4 remains `in-progress`. Step 6 is intentionally pending user visual selection.

Session freeze commit: `8485dac22edb15041e61884f47f3118ea2ef4708`. The Lab has **not** been deployed. The user asked to stop after docs-sync and resume deployment work in the next session.

## Session-end verification and review state

- Main-agent fresh verification passed: focused Optical Lab 9/9, full Web 28 files / 170 tests, Web typecheck, production build and `git diff --check`.
- Review package: `.superpowers/sdd/2026-08-11-landing-incremental-optimization-plan/review-7c470ad..8485dac.diff`.
- Independent reviewer `/root/review_optical_lab` was still running when the session was frozen. The next session must obtain its final result and resolve any Critical/Important finding before deployment.
- Do not use the implementation agent's accidentally reported full hash (`8485dac780...`); the repository-authoritative commit is `8485dac22edb15041e61884f47f3118ea2ef4708`.

## Manual visual ruling

The implementation is an engineering-valid experiment, not an aesthetically accepted candidate. The full-page evidence at `apps/web/test/visual/out/optical-lab/desktop.png` shows Candidate A with a low-contrast duplicate/overlap between the semantic DOM title and the displaced glyph texture; the fixed-aperture compression and downstream emission are much weaker than the user's target. It is acceptable to publish the Lab strictly as a comparison surface, but it must not replace production `/` or be described as visually approved.

## Server preflight

- `infra/scripts/checkup.sh` passed through Git for Windows Bash: disk 11% used, about 26 GiB available memory, nginx and Docker active, production Web/API/Postgres/Redis/object storage/malware scanner running.
- Do not run the script as plain `bash` from PowerShell: that resolves to WSL, fails to translate `Z:\\Dirac\\scripts`, and then cannot find the configured SSH identity.
- Use `& 'C:\\Program Files\\Git\\bin\\bash.exe' infra/scripts/checkup.sh` and the same Git Bash executable for backup/deploy scripts.

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

1. Read the independent reviewer result and resolve/re-review any Critical or Important finding.
2. Re-run focused/full Web/typecheck/build plus production-start screenshots after any fix.
3. If still authorized, run remote database backup, deploy only the isolated Lab with `--skip-migrate`, and verify `/_visual/optical-lab`, `/`, `/explore`, and unauthenticated `/auth/me` online.
4. User reviews the reference/current/candidate comparison on a real desktop GPU and mobile device and explicitly accepts, iterates, or rejects Candidate A in Task 8 Step 6.
5. Only if accepted, create a separate production Landing replacement plan and run new TDD, release-browser and authorized ECS deployment gates.

No ECS, compose, API, schema, authentication, upload, Hermes or production Landing change is part of this handoff.
