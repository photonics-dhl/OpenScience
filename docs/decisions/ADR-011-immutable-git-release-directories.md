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
  in place. Every existing SHA directory is write-once and is never replaced in
  place. A `.release-failed` marker, or versioned mounts without `.release-id`,
  blocks deployment until an operator explicitly recovers and verifies the
  runtime. The scheduled backup script is replaced only after public health and
  exact `/__release` identity pass.
- The active backup script resolves and validates `.release-id` before invoking
  Compose.
- Production keeps the active release and one explicit immediate rollback
  release. After public/runtime/backup acceptance, deployment writes a
  root-owned `0600` structured `.rollback-id.pending` intent, commits the durable
  deployment journal, publishes `.rollback-id`, and then removes only the frozen
  inactive release roots, matching capability records, and exact release-tagged
  Worker/Parser/Embedding image tags. Release deletion uses same-filesystem
  tombstones so an interrupted cleanup can resume idempotently under the same
  inherited FD 9 lock.
- Retention validates source markers, ownership, realpaths, symlinks, nested
  mounts, all container mount references, capabilities, and protected image
  identities before mutation. It never cleans evaluation/acceptance evidence,
  backups, volumes, logs, package/tool caches, Docker build cache, or arbitrary
  image IDs, and it never invokes a broad Docker prune. A post-commit retention
  failure leaves the accepted release active, preserves the pending intent, and
  requires the exact resume operation instead of application rollback.

## Consequences

Every tracked build input is reproducible and stale remote source cannot join a
release. Immediate rollback remains local and exact while older source remains
recoverable from Git. Automatic cleanup has a deliberately narrow release-only
scope; evidence and other operational data retain their own lifecycle policies.
Database migrations still require their own rollback/compatibility assessment
because application rollback cannot undo data changes.
