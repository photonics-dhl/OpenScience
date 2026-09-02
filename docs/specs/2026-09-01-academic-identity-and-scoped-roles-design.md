# Academic Identity and Scoped Roles Design

> Status: local implementation candidate, updated 2026-09-02. Local PostgreSQL has migrations 34–35 and ROR v2.12 imported; production is unchanged.

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
- `ResearchOrganization` caches the official ROR identifier, display name, country, types, status, registered domains, dataset version, and source update date. Institution credentials and challenges retain an optional relational link to that organization.
- Credential verification does not automatically grant editorial, reviewer, or organization roles. Those require an explicit future workflow and auditable grant.

## API and user journey

- Existing registration and primary-email verification remain the entry gate.
- `GET /auth/academic-identity` returns verified credentials and all current active scoped roles.
- `POST /auth/orcid/start` creates a user-bound, one-time OAuth state.
- `GET /auth/orcid/callback` exchanges the authorization code server-side and stores the validated ORCID iD.
- `POST /auth/institution-email/request` resolves the exact email domain or one of its parent domains against active local ROR records, falls back to an explicit emergency override, and returns the matched organization before sending a code.
- `POST /auth/institution-email/verify` consumes that challenge and stores the verified institution email.
- Settings shows the four-stage progression and disables unavailable integrations with an explanatory message.

## Security decisions

- ORCID is connected only through authorization-code OAuth with the minimal `/authenticate` scope; manual ORCID entry is not trusted.
- OAuth state is random, expires after ten minutes, is bound to the signed-in user, and is consumed once.
- The MVP stores the verified ORCID iD but not the ORCID access token because it does not yet call member APIs.
- Institution eligibility comes from one active ROR record with an exact registered domain. Parent-domain matching supports departmental addresses without accepting lookalike suffixes; ambiguous domains fail closed for manual review. `INSTITUTION_EMAIL_DOMAINS` remains an explicit emergency override; generic `.edu`, government, or country suffixes are never sufficient evidence.
- Institution email verification proves control of that mailbox, not employment status, authorship, reviewer appointment, or editorial authority.
- Verification codes are hashed, rate-limited, attempt-limited, expiring, and single-use. Secrets and codes are excluded from logs and audit metadata.

## Configuration and deployment

Set all ORCID variables together: `ORCID_CLIENT_ID`, `ORCID_CLIENT_SECRET`, `ORCID_REDIRECT_URI`, and optionally `ORCID_BASE_URL` for sandbox. `INSTITUTION_EMAIL_DOMAINS` is optional and reserved for reviewed overrides.

Download the latest official ROR schema-v2 JSON dump from its Zenodo concept record, then import it after building the database package:

```text
pnpm sync:ror --file <ror-data.json> --dataset-version <release-version>
```

The importer rejects malformed IDs/domains, caps input at 250,000 records/1 GB, normalizes records, imports in bounded transactions, and records the source dataset version. Production should run this after each monthly ROR release and retain the previous database backup for rollback.

Apply core migrations 34–35 only through the normal migration/release process. Local Windows validation does not replace PostgreSQL migration/rollback rehearsal, a complete ROR import, or a real ORCID callback.

## Acceptance

- A signed-in, email-verified user can connect a valid ORCID and cannot replay or borrow another user's state.
- An allowed institution address can be verified once; unlisted domains and duplicate ownership fail closed.
- One user can hold simultaneous roles in different scopes without collapsing them into one global role.
- Auth, API, config, database migration-contract tests, type checks, lint, web build, and docs gates are green before release.
