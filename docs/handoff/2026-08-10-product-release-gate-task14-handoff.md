# Task 14 Handoff — Product Release Gate

## Status

Task 14 is complete locally. The canonical release runner passes 27/27 production-build browser cases and the repository tests, typecheck, build and lint pass.

## Completed

- Added one manifest for eight surfaces, three viewports and Landing reduced motion.
- Added deterministic Optical Field clock injection without changing normal runtime behavior.
- Added a production Playwright config, stable Public/Collection API fixture and named product states.
- Added landmark, accessible-name, keyboard focus, overflow, runtime-error, LCP, transfer and DOM budgets.
- Added CI Chromium installation and 14-day screenshot/report/trace artifact upload.
- Manually reviewed full-width and mobile Landing, Auth, Dashboard, Workspace, Public RO, Intake, Explore and Collection evidence.

## Verification

- Product release Playwright: 27/27.
- Web unit tests: 154/154; all workspace test suites passed.
- Root typecheck, build and lint: passed.
- Syncpack: passed; jscpd recorded existing 6.20% token duplication.
- Existing debt remains: Knip lists old unused files/exports; dependency-cruiser lists the pre-existing landing hero generator importing a dev dependency. This task added no matching finding and did not delete files.

## Next: Task 15

1. Commit Task 14 and record its immutable commit.
2. Use only `infra/scripts/ssh-run.sh` / deployment scripts to inspect ECS and record the prior image/tag.
3. Sync the isolated worktree without `.env`, generated screenshots or unrelated files.
4. Build/recreate the required services and prove health, TLS, workers, storage and ClamAV.
5. Run the real registration/login → Dashboard → mixed Intake → Hermes → Workspace → version/publish → Public/Explore/Collection journey at desktop and mobile widths.
6. Roll back on a blocker; never call partial production complete.

## Safety

Do not read or print `.env`. Do not run production integration tests that contain unscoped cleanup. Keep deployment and rollback evidence in the Task 15 handoff/progress entry.
