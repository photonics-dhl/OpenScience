# Hermes Presentation Assets Implementation Plan

> **COMPLETED / PRODUCTION.** Taskmaster Task 11 was accepted on immutable application release `b32d81c3474a0ba3c7cead5d4cacbc4a0e8fc4f7`; rollback is `0aaf52fed29e79bb19b15517ba9ef50545510f72`.
> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Taskmaster `hermes-research-intelligence` Task 11 with deterministic, provenance-bound SVG/HTML assets and a fail-closed administrator media workflow.

**Architecture:** The API authorizes and submits a durable `presentation.generate` AgentTask. Agent Worker reloads the version and source Claims, generates deterministic bytes, stores them under a content-addressed object key, and atomically persists the existing `PresentationAsset`/`PresentationAssetClaim` rows. Status changes remain domain-owned; MiniMax image/video requests are administrator-only and remain disabled unless the AI Gateway media capability is explicitly configured.

**Tech Stack:** TypeScript, Fastify, Prisma, Redis AgentTask queue, SeaweedFS through `StorageAdapter`, Vitest/Node test runner.

## Global Constraints

- Reuse migration 28 presentation tables; create no schema migration.
- Generated assets always use `label=presentation_not_evidence`.
- Only `succeeded` Claim rows from the exact Research Object version may be source Claims.
- Deterministic generators do not call an LLM, execute scripts, load remote resources, or include arbitrary HTML.
- MiniMax image/video calls may only cross `packages/ai-gateway`; default production capability remains disabled and video is not enabled before image acceptance.
- Every write is authenticated, membership/admin authorized, idempotent where created, audited, and covered by a contract test.

---

### Task 1: Domain contract and status workflow

**Files:**
- Create: `packages/domain/src/assets/presentation-asset.ts`
- Create: `packages/domain/src/assets/errors.ts`
- Create: `packages/domain/test/assets/presentation-asset.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Produces `submitPresentationGeneration`, `transitionPresentationAsset`, and `PresentationGenerationPayload`.
- Enforces exact version/Claim scope, workspace membership, administrator-only image/video, and `draft -> approved|rejected` only.

- [x] Write tests for cross-version Claim rejection, revoked membership, non-admin media rejection, idempotent task replay, label enforcement, legal/illegal status transitions, and optimistic `expectedUpdatedAt` conflict.
- [x] Run `npx pnpm@9.15.0 --filter @openscience/domain test -- presentation-asset.test.ts` and verify RED because the asset service does not exist.
- [x] Implement the minimal domain service using the existing AgentSession/AgentTask transaction path and audit helper.
- [x] Re-run the focused Domain tests and typecheck.

### Task 2: Deterministic Worker generators

**Files:**
- Create: `apps/agent-worker/src/presentation/chart-generator.ts`
- Create: `apps/agent-worker/src/presentation/interactive-html.ts`
- Create: `apps/agent-worker/src/presentation/handler.ts`
- Create: `apps/agent-worker/src/presentation/minimax-admin.ts`
- Create: `apps/agent-worker/test/presentation/presentation-generation.test.ts`
- Modify: `apps/agent-worker/src/index.ts`

**Interfaces:**
- Consumes exact `PresentationGenerationPayload` and server-reloaded Claim rows.
- Produces byte-identical SVG or CSP-safe HTML, SHA-256, object key, generator identity, asset ID, and source Claim IDs.

- [x] Write tests proving byte identity under input reordering, XML/HTML escaping, no scripts/network/LLM calls, exact Claim/version authorization, content-addressed object storage, idempotent persistence, and fail-closed image/video capability.
- [x] Run the focused Worker tests and verify RED because no presentation handler exists.
- [x] Implement canonical Claim ordering, deterministic SVG, no-script HTML using semantic `details` elements, bounded output, storage write, and transactional asset persistence.
- [x] Register `presentation.generate` in the Worker handler registry and crash-recovery allowlist.
- [x] Re-run focused Worker tests, typecheck, and build.

### Task 3: REST contract

**Files:**
- Create: `apps/api/src/routes/presentation-assets.ts`
- Create: `apps/api/test/presentation-assets-routes.test.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- `POST /research-objects/:researchObjectId/versions/:versionId/presentation-assets/generations` returns `202 {task}` and requires `Idempotency-Key`.
- `GET /research-objects/:researchObjectId/versions/:versionId/presentation-assets` returns authorized assets without private object keys.
- `PATCH /research-objects/:researchObjectId/versions/:versionId/presentation-assets/:assetId` accepts `{status, expectedUpdatedAt}`.

- [x] Write API tests for request/response schema, replay, cross-workspace denial, admin-only image/video, optimistic conflict, and absent private keys.
- [x] Run the focused API tests and verify RED because routes are unregistered.
- [x] Implement strict Zod schemas, session guard, domain delegation, 202 semantics, and stable error mapping.
- [x] Re-run focused API tests, typecheck, and build.

### Task 4: Task 11 acceptance and capability record

**Files:**
- Modify: `.taskmaster/tasks/tasks.json`
- Modify: `docs/runbooks/hermes-capability-registry.md`
- Modify: `docs/specs/2026-08-26-hermes-research-intelligence-platform-design.md`
- Modify: `project_index.md`
- Modify: `docs/progress.md`
- Modify: `docs/handoff/2026-08-16-hermes-2d-pet-handoff.md`

- [x] Run Domain/Worker/API focused tests and the affected workspace build/typecheck/lint gates.
- [x] Run a server candidate with one deterministic chart and one interactive HTML asset; verify identical hashes on replay, public retrieval, CSP/no-script contract, and source Claim IDs.
- [x] Keep MiniMax image/video disabled unless exact provider/model/price/secret and one administrator approval journey are available; record this as an optional blocked capability, not a Task 12 blocker.
- [x] Set Taskmaster Task 11 to `done` only after deterministic production acceptance. Production RO `OSR-2026-000019` replayed SVG/HTML hashes exactly (`8d5f8f23…c640` / `b20f83cc…1198`), served the safe HTML publicly, and enforced `presentation_not_evidence`.
- [x] Sync CURRENT docs and run docs gates.
