# Optical Editorial v3 Production Acceptance Handoff

## Status

Task 15 is complete. Release `f5bb6e7` is built and active on ECS. The production browser, service and ingestion journey passed. The isolated worktree remains on `codex/optical-editorial-v3`.

## Deployment Evidence

- Pre-deploy database backup: 232K, retention 7/7.
- Rollback ref: `53d5cbf`; its Optical Field hash matched the pre-deploy remote source.
- Active ref: `f5bb6e7`; local and remote Optical Field SHA-256 match.
- ECS full workspace build passed; API/Web/agent-worker restarted; Nginx config validation passed.
- API, PostgreSQL, Redis, SeaweedFS and ClamAV are healthy; Web/worker running.
- Worker acceptance log has zero fatal, uncaught, missing-module or connection-refused events.

## Product Journey

- Real-account login reached the Chinese Research Dashboard.
- Seven authenticated RO surfaces returned 200 with no overflow.
- Markdown, valid PNG and CSV were submitted as synthetic, no-user-data evidence.
- All three ingestion tasks reached `needs_review`; Hermes exposed six fields, confirmation created a new version, and Versions/Publish-ready surfaces returned 200.
- The synthetic acceptance object was not publicly published.
- Landing, Explore, Ultrafast Science Collection and the existing published demo RO returned 200 at 1440/390; browser errors and horizontal overflow were zero.

## Safety and Limits

- Credentials were process-only and never written to repository files, docs, screenshots or output.
- `.env` was not read or printed.
- Current Web/API runtime is a bind-mounted build on pinned base images, not an immutable per-release application image. Use the Git ref + verified source hash for rollback until that infrastructure migration is separately designed.
- Do not run production integration suites containing unscoped cleanup.

## Remaining Work

Task Master Task 9 remains the only non-done task in the Optical Editorial tag. Resolve the Hermes Live2D asset/license gate. If a legally deployable runtime/model is unavailable, retain the current static six-state Hermes visual and record the product-level substitute rather than shipping an unlicensed asset.
