---
name: test-gate
description: Verify changed code and required phase or merge acceptance with evidence matched to the claim; excludes test-framework design and prose-only changes.
---

# Test Gate

Start with the smallest meaningful checks covering the changed behavior. Reuse recorded passing evidence for the same relevant code, dependencies, configuration and environment. New changes, failures or unresolved risk justify reruns or expansion; moving to another workflow step alone does not.

Complete the project's required phase, CI and merge gates when claiming those milestones. Do not run every historical MVP acceptance flow for an unrelated edit. Select current acceptance criteria from the indexed CURRENT handoff and applicable spec.

Match the evidence to the behavior:

- Unit: domain rules, permissions, diff, IDs and quotas.
- Integration: database, storage, queue and AI gateway.
- Contract: frontend/backend schemas.
- E2E: affected user journeys and cross-service transitions.
- Security: affected authorization, uploads, SSRF, prompt injection and sandbox boundaries.
- Recovery: restore, storage integrity and retry behavior.
- Performance: changed latency, throughput or concurrency constraints.

Use the project's package manager and existing scripts. For XGS server integration tests, retain the required full workspace build before the run because imports resolve through package dist; observe migration and environment-isolation requirements. Local passes do not establish production acceptance.

Report commands, exit status, scope and relevant result summaries. Distinguish product failure from missing infrastructure, and identify skipped checks. Never hide failures or claim unverified acceptance. Do not create a formal Goal unless explicitly requested.
