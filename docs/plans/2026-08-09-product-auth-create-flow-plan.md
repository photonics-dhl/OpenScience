# Product Auth and First RO Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first authenticated production journey: invited user registration or login, verified session, real Dashboard data, and creation of a private Research Object that opens in the unified workspace.

**Architecture:** Keep Fastify as the only API authority and Next.js as the browser surface. Browser calls use a stable same-origin `/api/*` namespace; Nginx strips the prefix in production and Next rewrites it during local development. Authentication remains an HTTP-only session cookie, while non-authenticated write requests obtain and attach the existing double-submit CSRF token. Domain logic stays in `packages/domain`; routes only validate, authorize, and map HTTP.

**Tech Stack:** Next.js 14 App Router, React 18, next-intl, Fastify 5, Zod, Prisma, Vitest, Node test, Playwright, Nginx.

## Global Constraints

- `docs/OpenScience_Kimi_Development_Spec.md` remains the requirement baseline.
- The approved product design is `docs/specs/2026-08-08-openscience-product-web-design.md`.
- Invite-only identity remains enforced; the UI must not silently create uninvited accounts.
- Session credentials stay in secure HTTP-only cookies; no token may be stored in browser storage.
- API authorization is authoritative; hiding a control in the UI never replaces a workspace permission check.
- All browser writes outside `/auth/*` carry the current CSRF token and preserve existing audit behavior.
- A newly created RO is private, uses the real personal workspace ID, and never displays the Figma sample as user data.
- No secret file is read, printed, copied into docs, or committed.
- Every implementation task ends with focused tests and a commit; production deployment uses the repository runbook.

---

### Task 1: Same-origin API and CSRF contract

**Files:**
- Modify: `infra/nginx/openscience.conf`
- Modify: `apps/web/next.config.mjs`
- Modify: `apps/web/lib/api.ts`
- Create: `apps/web/test/api-client-contract.test.ts`
- Modify: `docs/runbooks/deployment.md`

**Interfaces:**
- Consumes: Fastify routes such as `/auth/me`, `/workspaces`, `/research-objects`, and `/csrf-token`.
- Produces: `apiRequest<T>(path, init?)`, `getCsrfToken()`, and the browser contract `/api/<fastify-path>`.

- [x] **Step 1: Write the failing routing and CSRF tests**

  Assert that production Nginx strips `/api/`, local Next rewrites `/api/:path*` to the API origin, GET requests do not fetch CSRF, and POST/PUT/PATCH/DELETE requests outside `/auth/*` attach `x-csrf-token` obtained from `/api/csrf-token`.

- [x] **Step 2: Run the focused test and verify RED**

  Run `npx pnpm@9.15.0 --filter @openscience/web test -- api-client-contract.test.ts` and require failure against the current private `request` helper and non-stripping proxy.

- [x] **Step 3: Implement the API transport**

  Export a single `apiRequest<T>` helper, cache only the in-memory CSRF token, clear and refetch it once after a CSRF 403, keep `credentials: 'include'`, and preserve `ApiClientError` parsing. Configure `proxy_pass http://127.0.0.1:3001/;` for `/api/` and a local Next rewrite whose destination is `${API_ORIGIN ?? 'http://127.0.0.1:3001'}/:path*`.

- [x] **Step 4: Verify transport and configuration**

  Run the focused test, Web typecheck, `nginx -t` through the deployment dry-run path, and `git diff --check`.

- [x] **Step 5: Commit**

  Commit: `1ab4b6d fix(web): connect same-origin api transport`.

### Task 2: Registration, verification, login, logout, and session UI

**Files:**
- Create: `apps/web/lib/auth.ts`
- Create: `apps/web/components/auth/AuthShell.tsx`
- Create: `apps/web/components/auth/LoginForm.tsx`
- Create: `apps/web/components/auth/RegisterForm.tsx`
- Create: `apps/web/components/auth/VerifyEmailForm.tsx`
- Create: `apps/web/app/login/page.tsx`
- Create: `apps/web/app/register/page.tsx`
- Create: `apps/web/app/verify-email/page.tsx`
- Create: `apps/web/test/auth-flow.test.tsx`
- Modify: `apps/web/messages/zh.json`
- Modify: `apps/web/messages/en.json`
- Modify: `apps/web/components/landing/SiteHeader.tsx`
- Modify: `apps/web/components/landing/Hero.tsx`

**Interfaces:**
- Consumes: `POST /api/auth/register`, `POST /api/auth/verify-email`, `POST /api/auth/resend-code`, `POST /api/auth/login`, `POST /api/auth/logout`, and `GET /api/auth/me`.
- Produces: `registerAccount`, `verifyAccount`, `loginAccount`, `logoutAccount`, `getCurrentUser`, and three accessible identity pages.

- [x] **Step 1: Write failing identity-flow tests**

  Cover field labels, invite code requirement, password policy help, verification-code resend, error-code mapping, safe `next` redirect restricted to same-origin paths, submitting state, and keyboard-visible validation summaries.

- [x] **Step 2: Run the focused test and verify RED**

  Run `npx pnpm@9.15.0 --filter @openscience/web test -- auth-flow.test.tsx` and require module/route failures.

- [x] **Step 3: Implement the API adapters and pages**

  Keep forms as client components within a shared dark observatory identity shell. On registration success route to `/verify-email?email=<encoded-email>&next=<safe-path>`; on verification or login success route to the safe `next` value or `/dashboard`. Map `INVITATION_INVALID`, `INVITATION_EMAIL_MISMATCH`, `ACCOUNT_NOT_ACTIVE`, `INVALID_CREDENTIALS`, `CODE_INVALID`, `CODE_EXPIRED`, and rate-limit errors to concise bilingual messages without exposing server internals.

- [x] **Step 4: Connect Landing identity entry points**

  Make Log in route to `/login`; make Create route to `/register?next=/research-objects/new`; retain Explore as an anonymous path.

- [x] **Step 5: Verify identity UI**

  Run focused tests, all Web tests, Web typecheck, and a Playwright keyboard smoke covering Login → Register → Verify navigation without submitting credentials.

- [x] **Step 6: Commit**

  Commit: `6540d2d feat(web): add invited identity flow`.

### Task 3: Authenticated Dashboard data contract

**Files:**
- Modify: `packages/domain/src/research-object/research-objects.ts`
- Modify: `packages/domain/src/research-object/index.ts`
- Modify: `apps/api/src/routes/research-objects.ts`
- Modify: `apps/api/test/research-objects.test.ts`
- Modify: `apps/web/lib/api.ts`
- Modify: `apps/web/components/dashboard/DashboardShell.tsx`
- Modify: `apps/web/app/dashboard/page.tsx`
- Modify: `apps/web/test/dashboard-cockpit.test.tsx`

**Interfaces:**
- Consumes: `GET /api/auth/me` and `GET /api/workspaces`.
- Produces: `GET /research-objects?workspaceId=<uuid>` with membership enforcement and `listResearchObjects(workspaceId)` for the Web client.

- [ ] **Step 1: Write failing API authorization tests**

  Cover personal-workspace listing, non-member anti-enumeration response, archived RO exclusion, deterministic `updatedAt desc` ordering, and omission of SDF bodies from list responses.

- [ ] **Step 2: Run the API test and verify RED**

  Run the focused API test and require 404 or missing-handler failure.

- [ ] **Step 3: Implement the domain query and thin route**

  Add a membership-scoped domain query returning only `id`, `workspaceId`, `title`, `status`, `visibility`, `version`, `publicId`, `createdAt`, and `updatedAt`. Validate `workspaceId` as UUID and require the current user before querying.

- [ ] **Step 4: Write failing Dashboard state tests**

  Cover unauthenticated redirect to `/login?next=/dashboard`, loading, API error with retry, empty workspace with Create CTA, and a real RO card whose link uses its UUID rather than the design-sample ID.

- [ ] **Step 5: Implement real Dashboard orchestration**

  Resolve session → personal workspace → RO list → actionable notifications. Keep the approved cockpit composition, but render the sample RO only in an explicitly labelled read-only sample block when the real list is empty.

- [ ] **Step 6: Verify and commit**

  Run focused domain/API/Web tests, typecheck affected workspaces, and commit as `feat(product): connect dashboard research data`.

### Task 4: Guided creation of the first Research Object

**Files:**
- Create: `apps/web/app/research-objects/new/page.tsx`
- Create: `apps/web/components/create/CreateResearchObjectFlow.tsx`
- Create: `apps/web/lib/create-flow.ts`
- Create: `apps/web/test/create-flow.test.tsx`
- Modify: `apps/web/lib/api.ts`
- Modify: `apps/web/messages/zh.json`
- Modify: `apps/web/messages/en.json`
- Modify: `packages/domain/src/research-object/research-objects.ts`
- Modify: `apps/api/src/routes/research-objects.ts`
- Modify: `infra/schema.prisma`
- Create: `infra/migrations/20260809010000_ro_create_idempotency/migration.sql`
- Create: `infra/migrations/20260809010000_ro_create_idempotency/rollback.sql`

**Interfaces:**
- Consumes: authenticated user, personal workspace, `POST /api/research-objects`, and the six SDF core field names.
- Produces: `createResearchObject(input, idempotencyKey)` and navigation to `/research-objects/<uuid>/workspace`.

- [ ] **Step 1: Write failing create-flow tests**

  Cover title-required validation, blank-six-field mode, pasted-material mode, explicit Hermes data-processing disclosure, unchecked consent blocking extraction but not blank creation, double-submit prevention, recoverable API errors, and successful navigation using the returned UUID.

- [ ] **Step 2: Run the focused test and verify RED**

  Run `npx pnpm@9.15.0 --filter @openscience/web test -- create-flow.test.tsx` and require missing-module failure.

- [ ] **Step 3: Implement the minimal guided flow**

  Use three steps: identity/title, material choice, and confirmation. Blank mode creates an empty six-field SDF immediately. Material mode creates the private RO first, then submits the existing asynchronous `sdf.extract` task only after disclosure consent; failure preserves the RO and offers retry from Workspace.

- [ ] **Step 4: Add idempotency protection**

  Add nullable unique `research_objects.idempotency_key`, pass the request header into the domain create input, and return the existing RO only when the key belongs to the same user and workspace. Generate one browser-session key per create attempt, disable the final action until the response resolves, and add API/domain tests proving duplicate requests return the same resource without a second audit/create side effect. The rollback drops the unique index and column.

- [ ] **Step 5: Verify and commit**

  Run focused tests, Web test/typecheck/build, affected API tests, and commit as `feat(product): create first research object`.

### Task 5: Local integration, production deployment, and acceptance

**Files:**
- Create: `apps/web/test/e2e/auth-create.spec.ts`
- Modify: `docs/runbooks/deployment.md`
- Modify: `docs/progress.md`
- Modify: `docs/handoff/2026-08-08-product-web-tooling-handoff.md`
- Modify: `project_index.md`

**Interfaces:**
- Consumes: the complete identity and create-flow surface from Tasks 1–4.
- Produces: repeatable browser acceptance evidence and a production release reference.

- [ ] **Step 1: Run local integration with a disposable invited account**

  Start the development data stack, create a disposable invitation through `node scripts/invite.mjs create`, and drive Register → Verify → Dashboard → Create blank RO → Workspace. Capture only generated IDs and HTTP status in test output; never print invitation codes, passwords, cookies, or verification codes.

- [ ] **Step 2: Run the full release gate**

  Run `npx pnpm@9.15.0 build`, `typecheck`, `lint`, `test`, relevant integration tests, `docs:lint`, `audit:docs-sync`, and `git diff --check`. Any failure blocks deployment.

- [ ] **Step 3: Deploy through the production runbook**

  Confirm a fresh database backup, then use `infra/scripts/deploy.sh <release> --confirm` so migration `20260809010000_ro_create_idempotency` is applied before the containers are force-recreated. Verify migration status, Nginx syntax, API health, and unauthenticated 401 boundaries. Roll back the release without rolling back the additive nullable column unless the migration itself fails before any production RO uses it.

- [ ] **Step 4: Execute production browser acceptance**

  With an explicitly disposable production invitation, verify registration, email verification, session persistence after reload, Dashboard empty state, first RO creation, Workspace load, logout, and login again. Redact account identifiers from committed evidence.

- [ ] **Step 5: Synchronize project records and commit**

  Prepend production evidence to `docs/progress.md`, update the active handoff and `project_index.md`, then commit as `docs: record auth and first-ro production acceptance`.

## Scope Boundary and Next Vertical Slice

This plan deliberately closes one production journey. After its production acceptance, continue the already approved `docs/plans/2026-08-08-openscience-product-web-plan.md` at Task 3 Step 3: Hermes evidence confirmation, immutable version save, publication preflight, Public RO, Explore, editorial curation, and Hermes/Live2D bridge. Those capabilities keep their existing task boundaries and are not duplicated here.
