# Researcher Ingestion Product Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first complete OpenScience product flow from email-code registration through Dashboard, multi-format research-material ingestion, Hermes evidence review, and RO Workspace.

**Architecture:** Keep Fastify/domain services as the API boundary and Next.js App Router as the product shell. Persist uploaded files as content-addressed Artifacts, create explicit ingestion tasks, and expose Hermes suggestions as evidence-bearing proposals that require user confirmation before SDF writes. Use one shared RO context for Dashboard, ingestion, Hermes, and Workspace; Live2D consumes the same task state rather than introducing a second workflow.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind v4, existing UI primitives, next-intl, Fastify, Prisma/PostgreSQL, Redis queues, Vitest, Playwright, existing storage adapter, Figma MCP/Code Connect.

## Global Constraints

- The approved design spec is `docs/superpowers/specs/2026-08-09-researcher-ingestion-product-slice-design.md`.
- `docs/OpenScience_Kimi_Development_Spec.md` remains the product baseline.
- Do not read, print, commit, or log `.env` values, verification codes, passwords, OAuth tokens, or mail credentials.
- Use existing `npx pnpm@9.15.0` commands; do not add a second package manager or an unlicensed asset bundle.
- All writes require authenticated Workspace authorization; all Hermes writes require explicit confirmation.
- Every task ends with focused tests, `docs:lint`, `audit:docs-sync`, `git diff --check`, and progress/handoff synchronization.
- UI must support Chinese and English from first implementation, WCAG 2.2 AA targets, reduced motion, keyboard operation, and 375px width.

---

### Task 1: Canonical foundations and browser visual gate

**Files:**
- Create: `apps/web/components/ui/{status-badge,progress-rail,dropzone,evidence-card}.tsx`
- Modify: `apps/web/app/tokens.css`, `apps/web/app/globals.css`, `apps/web/messages/zh.json`, `apps/web/messages/en.json`
- Create: `apps/web/test/ingestion-foundations.test.ts`, `apps/web/test/visual/ingestion-shots.mjs`
- Update: Figma canonical file through the approved Figma MCP workflow; record node IDs in the design handoff

**Interfaces:**
- Produces stable UI primitives and token names consumed by Tasks 2–5.
- `EvidenceCard` accepts `{ field, value, status, confidence, source, onConfirm, onEdit, onReject }`.
- `ProgressRail` accepts `{ current, total, state, retry }` without changing its layout footprint between states.

- [ ] **Step 1: Write failing primitive and token tests** asserting status labels, reduced-motion classes, focus rings, contrast pairings, and the absence of generic gradient-only backgrounds.
- [ ] **Step 2: Run `npx pnpm@9.15.0 --filter @openscience/web test -- ingestion-foundations.test.ts` and verify the new assertions fail.**
- [ ] **Step 3: Implement primitives from the approved visual thesis: ink/deep-blue workbench, paper evidence surfaces, one amber diff accent, and RO-node motion only.**
- [ ] **Step 4: Create the Figma foundations and six-screen skeleton in the canonical file, then attach Code Connect mappings to the exact UI exports.**
- [ ] **Step 5: Run the focused tests and capture 1440×900, 768×1024, and 375×812 screenshots with `ingestion-shots.mjs`.**
- [ ] **Step 6: Record screenshot paths, Figma node IDs, and manual review findings in `docs/progress.md` and the active handoff; commit `feat(web): add ingestion foundations and visual gate`.**

### Task 2: Auth and Dashboard product shell

**Files:**
- Create: `apps/web/app/auth/{register,login}/page.tsx`, `apps/web/app/dashboard/page.tsx`
- Create: `apps/web/components/auth/{SignupCodeForm,LoginForm}.tsx`
- Create: `apps/web/components/dashboard/{ContinueResearch,ImportStage,HermesTaskRail,ResearchList}.tsx`
- Modify: `apps/web/lib/api.ts`, `apps/web/messages/zh.json`, `apps/web/messages/en.json`
- Test: `apps/web/test/auth-dashboard.test.ts`, `apps/web/test/e2e/auth-dashboard.spec.ts`

**Interfaces:**
- Consumes existing `/auth/request-signup-code`, `/auth/confirm-signup`, `/auth/login`, `/auth/me` endpoints.
- Produces a route-safe authenticated shell that redirects unauthenticated users to `/auth/login` and preserves the intended return path.

- [ ] **Step 1: Add failing contract tests for registration, login, redirect, first-use empty state, recent RO state, and actionable Hermes task state.**
- [ ] **Step 2: Run the focused web tests and confirm they fail because the routes/components do not exist.**
- [ ] **Step 3: Implement the code-based auth forms with resend cooldown, accessible errors, password rules, and no invitation-code field.**
- [ ] **Step 4: Implement Dashboard utility layout with “continue research” as the returning-user primary and import/create as equal primary actions.**
- [ ] **Step 5: Run Playwright in a clean browser at desktop and mobile widths; verify keyboard-only registration and dashboard navigation.**
- [ ] **Step 6: Sync docs and commit `feat(web): add auth and dashboard shell`.**

### Task 3: Multi-format artifact ingestion contract and pipeline

**Files:**
- Create: `packages/domain/src/ingestion/{ingestion-types,ingestion-service,format-policy}.ts`
- Create: `apps/api/src/routes/ingestion.ts`
- Create: `apps/api/test/ingestion.integration.test.ts`, `packages/domain/test/ingestion-service.test.ts`
- Modify: `apps/api/src/app.ts`, `packages/domain/src/index.ts`, `packages/database/prisma/schema.prisma`
- Create: `infra/migrations/20260809000000_ingestion_tasks/migration.sql`, `infra/migrations/20260809000000_ingestion_tasks/rollback.sql`

**Interfaces:**
- `POST /research-objects/:id/ingest` accepts multipart files plus `processingConsent` and returns `{ batchId, artifacts, tasks }`.
- `GET /ingestion/:batchId` returns stable task states: `queued | uploading | stored | parsing | needs_review | confirmed | written | failed_retryable | failed_blocked`.
- `POST /ingestion/:taskId/retry` retries only retryable failures.
- Supported extensions/MIME policy is centralized in `format-policy.ts`; unsupported files return a typed error.

- [ ] **Step 1: Write failing API/domain tests for PDF, DOCX, TeX, Markdown, image acceptance; unsupported-type rejection; consent requirement; workspace authorization; retry semantics.**
- [ ] **Step 2: Run focused tests to verify the new route and task model fail.**
- [ ] **Step 3: Add the idempotent ingestion task model and service, reusing existing Artifact storage and quota/security guards.**
- [ ] **Step 4: Register the route and enqueue extraction jobs without exposing provider credentials or raw file contents in logs.**
- [ ] **Step 5: Apply the migration in the cloud staging/production runbook only after build and integration gates pass.**
- [ ] **Step 6: Sync docs and commit `feat(api): add multi-format ingestion tasks`.**

### Task 4: Hermes evidence proposals and confirmation

**Files:**
- Create: `packages/domain/src/ingestion/evidence-service.ts`
- Create: `apps/api/src/routes/hermes-evidence.ts`
- Create: `apps/web/app/research-objects/[id]/ingest/page.tsx`, `apps/web/app/research-objects/[id]/hermes/page.tsx`
- Create: `apps/web/components/hermes/{IngestionQueue,EvidenceReview,EvidenceSource,ConsentDialog}.tsx`
- Test: `apps/api/test/hermes-evidence.integration.test.ts`, `apps/web/test/hermes-evidence.test.ts`, `apps/web/test/e2e/hermes-ingestion.spec.ts`

**Interfaces:**
- `GET /research-objects/:id/hermes/evidence` returns six SDF field proposals with source anchors and confidence.
- `POST /research-objects/:id/hermes/evidence/confirm` accepts a batch of field decisions and returns the resulting draft version.
- Confirm/reject/edit operations are idempotent and auditable; no proposal silently overwrites source text.

- [ ] **Step 1: Write failing tests for evidence states, source anchors, batch confirmation, rejection, edit, audit event, and high-risk approval.**
- [ ] **Step 2: Run focused API/web tests and verify failure.**
- [ ] **Step 3: Implement evidence persistence and confirmation service on top of existing AgentTask and versioning models.**
- [ ] **Step 4: Implement the evidence review UI with fixed-height state transitions, source preview, and explicit confirmation.**
- [ ] **Step 5: Run the E2E flow from uploaded fixture through confirmed SDF draft at three viewport sizes.**
- [ ] **Step 6: Sync docs and commit `feat(hermes): add evidence review loop`.**

### Task 5: RO Workspace convergence and Live2D bridge

**Files:**
- Modify: `apps/web/app/research-objects/[id]/edit/page.tsx`
- Create: `apps/web/components/workspace/{RoContextRail,VersionTimeline,ArtifactPanel,TaskRail}.tsx`
- Create: `apps/web/components/hermes/Live2DBridge.tsx`
- Test: `apps/web/test/workspace-convergence.test.ts`, `apps/web/test/e2e/ro-workspace.spec.ts`

**Interfaces:**
- All workspace panels consume one `RoContext` containing `roId`, `publicId`, `versionId`, `workspaceId`, and task state.
- Live2D can open the same evidence/task routes and issue only the same typed actions as the visible Hermes rail.

- [ ] **Step 1: Write failing tests for shared RO context, version continuity, mobile bottom-sheet behavior, and reduced-motion Live2D fallback.**
- [ ] **Step 2: Implement the shared context and workspace navigation without duplicating existing editor domain logic.**
- [ ] **Step 3: Add task/artifact/version panels and connect them to the ingestion/evidence APIs.**
- [ ] **Step 4: Add the Live2D bridge as a lazy, collapsible presentation layer with a static fallback.**
- [ ] **Step 5: Run desktop/mobile E2E and accessibility checks.**
- [ ] **Step 6: Sync docs and commit `feat(web): converge ro workspace and hermes bridge`.**

### Task 6: Browser visual acceptance and production deployment

**Files:**
- Modify: `apps/web/test/e2e/*.spec.ts`, `.github/workflows/ci.yml`
- Create: `apps/web/test/visual/README.md`, `docs/runbooks/product-web-release.md`
- Update: `docs/progress.md`, `docs/handoff/2026-08-09-researcher-ingestion-product-slice-handoff.md`, `project_index.md`

- [ ] **Step 1: Add clean-browser fixtures and deterministic test files for each supported format.**
- [ ] **Step 2: Capture and compare desktop/tablet/mobile screenshots; review typography, hierarchy, motion, empty/error states, and visual identity manually.**
- [ ] **Step 3: Run `npx pnpm@9.15.0 build`, focused/full tests, `docs:lint`, `audit:docs-sync`, and `git diff --check`.**
- [ ] **Step 4: Sync to ECS, build remote services sequentially, apply migrations, recreate API/web, and smoke-test the full flow through the public domain.**
- [ ] **Step 5: Record deployment evidence and rollback command in the runbook/handoff; commit `test(web): gate researcher ingestion product slice`.**
