# ADR-011: Immutable Git Release Directories

## Status

Accepted — 2026-08-19.

## Context

The former ECS sync path copied a hand-maintained subset of repository paths into
`/opt/openscience`. It could omit tracked build inputs such as `.dockerignore`,
retain stale ignored files, and removed the source backup before install, build,
migration, service health, and public checks had completed.

## Decision

- A release is always a clean local `HEAD` resolved to a full 40-character SHA.
- `git archive --format=tar.gz <sha>` sends the complete tracked commit, without a
  path allowlist, to `/opt/openscience-releases/<sha>`.
- `/opt/openscience/.env.prod` and `/opt/openscience/.release-id` remain stable
  runtime state and never enter the archive.
- Compose requires `XGS_RELEASE_ROOT` and `XGS_RELEASE_IMAGE_TAG`. API, Web, and
  Worker run as `node` with a read-only SHA bind mount; Web receives only a
  bounded writable runtime cache. Worker and Parser images use the release SHA.
- Confirmed deployment requires an explicit rollback Git ref. On the first
  versioned switch that ref is materialized and built before the new release,
  while the image IDs of the actually running Worker/Parser containers—not
  mutable legacy tags—are preserved under its SHA. Because the legacy Compose
  cannot consume release-root variables, this one transition uses the new
  Compose as an explicit compatibility adapter; every later rollback uses the
  previous release's own Compose file.
- Install, build, and image build complete before any service switch. An ERR
  handler validates and restores the previous SHA root/images/Nginx; it updates
  `.release-id` only after recovery succeeds. Failed recovery removes the
  potentially false identity and atomically writes `.release-failed` evidence.
- An already-active SHA is verified and treated as a no-op; it is never rebuilt
  in place. Every existing SHA directory is write-once and is never automatically
  replaced, even when inactive. A `.release-failed` marker, or versioned mounts
  without `.release-id`, blocks deployment until an operator explicitly recovers
  and verifies the runtime. The scheduled backup script is replaced only after
  public health and exact `/__release` identity pass.
- The active backup script resolves and validates `.release-id` before invoking
  Compose. Retained release directories are rollback assets and are not removed
  automatically.

## Consequences

Every tracked build input is reproducible and stale remote source cannot join a
release. Disk usage grows with retained releases; cleanup requires a separate,
explicitly approved retention operation. Database migrations still require their
own rollback/compatibility assessment because application rollback cannot undo
data changes.
