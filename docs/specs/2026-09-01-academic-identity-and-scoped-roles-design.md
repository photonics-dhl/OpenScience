# Academic Identity and Scoped Roles Design

> Status: local implementation candidate, 2026-09-01. Production is unchanged and migration 34 has not been applied.

## Goal

Deliver the first trust progression for OpenScience accounts:

1. registered account;
2. primary email verified;
3. ORCID connected through OAuth;
4. institution email verified by a second one-time code.

The authorization model must also let one user hold several roles at the same time, for example an author on one research object, a reviewer for one assignment, and an editor for one journal.

## Data model

- `IdentityCredential` stores one verified ORCID or institution email per user and preserves the external identifier independently from authorization.
- `InstitutionEmailChallenge` stores only a digest of the one-time code, with expiry, attempt count, cooldown, and single-use consumption.
- `ScopedRoleAssignment` stores `user + scope type + scope id + role`. Scope types cover platform, workspace, research object, journal, organization, and review assignment. Several active rows may coexist for one user.
- Credential verification does not automatically grant editorial, reviewer, or organization roles. Those require an explicit future workflow and auditable grant.

## API and user journey

- Existing registration and primary-email verification remain the entry gate.
- `GET /auth/academic-identity` returns verified credentials and all current active scoped roles.
- `POST /auth/orcid/start` creates a user-bound, one-time OAuth state.
- `GET /auth/orcid/callback` exchanges the authorization code server-side and stores the validated ORCID iD.
- `POST /auth/institution-email/request` accepts only a configured institution domain and sends a code.
- `POST /auth/institution-email/verify` consumes that challenge and stores the verified institution email.
- Settings shows the four-stage progression and disables unavailable integrations with an explanatory message.

## Security decisions

- ORCID is connected only through authorization-code OAuth with the minimal `/authenticate` scope; manual ORCID entry is not trusted.
- OAuth state is random, expires after ten minutes, is bound to the signed-in user, and is consumed once.
- The MVP stores the verified ORCID iD but not the ORCID access token because it does not yet call member APIs.
- Institution eligibility is an explicit `INSTITUTION_EMAIL_DOMAINS` allowlist; a generic `.edu` suffix is not sufficient evidence.
- Verification codes are hashed, rate-limited, attempt-limited, expiring, and single-use. Secrets and codes are excluded from logs and audit metadata.

## Configuration and deployment

Set all ORCID variables together: `ORCID_CLIENT_ID`, `ORCID_CLIENT_SECRET`, `ORCID_REDIRECT_URI`, and optionally `ORCID_BASE_URL` for sandbox. Configure comma-separated institution domains in `INSTITUTION_EMAIL_DOMAINS`.

Apply core migration 34 only through the normal migration/release process. Local Windows validation does not replace PostgreSQL migration and rollback rehearsal or a real ORCID sandbox callback.

## Acceptance

- A signed-in, email-verified user can connect a valid ORCID and cannot replay or borrow another user's state.
- An allowed institution address can be verified once; unlisted domains and duplicate ownership fail closed.
- One user can hold simultaneous roles in different scopes without collapsing them into one global role.
- Auth, API, config, database migration-contract tests, type checks, lint, web build, and docs gates are green before release.
