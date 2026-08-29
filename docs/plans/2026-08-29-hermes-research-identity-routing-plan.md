# Hermes Research Identity and Silent Routing Implementation Plan

> **Taskmaster:** `hermes-research-intelligence` Task 7. The approved product
> contract is `docs/specs/2026-08-26-hermes-research-intelligence-platform-design.md`
> §4. No visible mode switch is introduced.

## Product outcome

A new user chooses one or more research identities during the existing
email-code registration, marks one primary identity, and may add bounded
disciplines, methods, topics and languages. The verified user, personal
workspace and identity profile are created atomically. Settings can later
correct the profile and accepted/rejected interest signals.

Every Hermes task receives one server-built, versioned `InterestContext` from
the authenticated profile, explicit current goal and authorized page/RO/Claim
context. The client cannot inject inferred sensitive traits or off-site
tracking. Routing is deterministic and internally explainable, but the product
does not expose a user-facing “mode” control.

## Task 1: Prove the domain contract first

**Files:**

- Add: `packages/domain/test/research-intelligence/interest-context.test.ts`
- Add: `packages/domain/test/research-intelligence/identity-profile-service.test.ts`
- Add: `packages/domain/src/research-intelligence/interest-context.ts`
- Add: `packages/domain/src/research-intelligence/identity-profile-service.ts`
- Modify: `packages/domain/src/research-intelligence/types.ts`
- Modify: `packages/domain/src/index.ts`

Tests cover the fixed priority order, deterministic reason codes, profile
version conflicts, partial settings updates without field loss, accepted versus
rejected signal correction, bounded lists, and rejection of sensitive/off-site
keys. Reuse the existing canonical profile validator instead of creating a
second identity model.

## Task 2: Persist correctable signals and task-time context

**Files:**

- Modify: `infra/schema.prisma`
- Add: `infra/migrations/20260829010000_research_identity_routing/migration.sql`
- Add: `infra/migrations/20260829010000_research_identity_routing/rollback.sql`

Add bounded accepted/rejected signal arrays to `ResearchIdentityProfile` and a
nullable JSON `interestContext` snapshot to `AgentTask`. Keep the core and
search databases separate; this migration is core-only. The rollback removes
only the new columns and is not applied automatically in production.

## Task 3: Make registration atomic and expose profile APIs

**Files:**

- Modify: `packages/auth/src/auth-service.ts`
- Modify: `packages/auth/src/index.ts`
- Modify: `apps/api/src/routes/auth.ts`
- Add: `apps/api/src/routes/research-identity.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/test/auth-routes.test.ts`
- Add: `apps/api/test/research-identity-routes.test.ts`

The API validates the profile through `@openscience/domain` and passes a
captured transaction callback into `confirmSignup`; `@openscience/auth` does not
import domain and no package cycle is introduced. Add authenticated GET/PATCH
profile and explicit accept/reject signal endpoints with CSRF, audit context,
optimistic `profileVersion`, strict schemas and no sensitive attribute fields.

## Task 4: Inject server-owned routing into Hermes

**Files:**

- Modify: `apps/api/src/routes/agent.ts`
- Modify: `packages/domain/src/agent/agent.ts`
- Modify: `apps/agent-worker/src/workspace-guide.ts`
- Modify: corresponding API/domain/worker tests

Resolve the session's authorized RO, optional Claim, explicit goal and profile
on the server. Persist the resulting `InterestContext` on the task rather than
trusting a client payload. Use it in the workspace-guide prompt and make it
available to later extraction/review handlers without weakening their existing
strict payload contracts. Missing profiles degrade to a neutral reader context
and are surfaced for correction; they never trigger a visible mode switch.

## Task 5: Turn the decorative registration surface into a real control

**Files:**

- Add: `apps/web/components/auth/ResearchProfileFields.tsx`
- Modify: `apps/web/components/auth/SignupCodeForm.tsx`
- Modify: `apps/web/components/auth/ResearchIdentityPanel.tsx`
- Modify: `apps/web/app/settings/page.tsx`
- Modify: `apps/web/lib/api.ts`
- Modify: `apps/web/messages/en.json`
- Modify: `apps/web/messages/zh.json`
- Modify: relevant web tests and E2E fixtures

Use accessible multi-select identity controls, one explicit primary selection,
short token-list inputs and clear “Hermes adapts silently” disclosure. Preserve
the current two-step email-code flow, return-to safety, mobile layout, keyboard
behavior and Research Folio visual system. Settings edits the same shared form
and shows saved/version-conflict states.

## Task 6: Server-first product acceptance

Run focused unit/API/UI tests, migration forward/rollback static checks, full
build/typecheck/lint/test gates, security and architecture review, then deploy
through the immutable ECS transaction. Acceptance is a real production journey:
register a disposable account with selected identity, verify the stored profile,
open a real product page, submit one Hermes task, inspect its persisted routing
context and returned guidance, correct one signal in Settings, repeat and prove
the routing reason changes without a mode switch. Remove only the disposable
account/data under an exact cleanup authorization; do not substitute local
Docker or mocked browser results for production evidence.
