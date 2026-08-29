# Production Release Retention Implementation Plan

> **Scope:** Keep immutable releases reproducible while preventing inactive ECS
> release trees and release-tagged images from accumulating without bound.

## Contract

- Production keeps exactly the active release and one machine-readable rollback
  release. Git remains source disaster recovery; the rollback tree and its exact
  images remain the immediate recovery asset.
- A structured root-owned `0600` `.rollback-id.pending` intent closes the crash
  gap between journal commit and `.rollback-id` publication.
- Automatic retention may remove only inactive one-level 40-character release
  roots, matching release-capability records, and exact release-derived Worker,
  Parser, and Embedding image tags.
- Automatic retention never removes evaluation or acceptance evidence, backups,
  volumes, logs, package/tool caches, or Docker build cache and never runs a
  broad prune command.
- Every candidate is validated before the first mutation. Active/rollback
  identity, source marker, ownership, realpath, symlink, mount, container and
  image references are fail-closed gates.
- Post-commit retention failure leaves the accepted release active, preserves
  the pending intent, and exits with a distinct non-zero status. A later resume
  is idempotent under the same production FD9 lock.

## Task 1: Lock the state-machine contract with failing tests

**Files:**

- Modify: `infra/scripts/deploy.test.mjs`
- Add: `infra/scripts/production-release-retention.test.mjs`

Cover pending-intent ordering, rollback abort, commit failure, post-commit
failure, resume, marker safety, active/rollback preservation, all-candidate
preflight, exact-tag-only deletion, shared image IDs, and forbidden broad-prune
source patterns.

## Task 2: Add durable rollback identity operations

**Files:**

- Modify: `infra/scripts/production-deploy-lock.mjs`
- Modify: `infra/scripts/production-deploy-transaction-state.sh`
- Modify: `infra/scripts/production-deploy-transaction.sh`

Add fixed-path prepare, abort, publish and finalize operations. Prepare the
intent only after public/runtime/backup-script acceptance; commit the journal,
publish `.rollback-id`, retain the intent through cleanup, then finalize it.
Rollback removes only a matching pending intent before clearing the journal.

## Task 3: Implement exact automatic retention

**Files:**

- Add: `infra/scripts/production-release-retention.mjs`

Build and validate the complete deletion plan before mutation. Execute only
literal recursive release-root deletion, literal capability-file deletion and
literal Docker tag removal. Support an expected-identity `--resume` path and
return a post-commit-specific failure status without application rollback.

## Task 4: Document and verify the operating boundary

**Files:**

- Modify: `docs/decisions/ADR-011-immutable-git-release-directories.md`
- Modify: `docs/runbooks/deployment.md`
- Modify: `project_index.md`
- Modify: `docs/progress.md`

Run focused Node tests, Bash syntax checks, lint/type/build gates required by the
changed surface, docs-sync, Markdown lint and diff checks. Bootstrap the current
known rollback marker only under FD9 after exact active/rollback tree, image,
container, marker and backup verification. Final behavior is accepted on ECS,
not from local Docker.
