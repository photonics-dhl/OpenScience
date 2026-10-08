# Journal workbench deployment handoff

## Goal and source

- The user requested the journal redesign and server deployment on 2026-10-08.
- Collaboration target: `photonics-dhl/OpenScience`, `frontend/nanqing`; never force-push or update `main`.
- Original feature: `Nanqing96/openscience@5305f4884ea583ce628c073d857dbc5ca740cff0`, based on `96e5e0c6`.
- Port parent: `7755a5ef7ab0a6bfa5184b54dd93c4054f883be4`; current candidate identity is Git HEAD.
- Deployment continuation began from pushed `d6105a8039647bf5466652c477a4568e764b5195` in a separate clone. Other local trees and uncommitted work are untouched.
- Initial server/public release: `45a577a3a8f6bca78a063e7478fba131c5efb375`, an ancestor of the candidate. Fresh live identity is mandatory before switching.
- Cross-team production and runtime state remains in [Hermes CURRENT](2026-09-10-hermes-web-image-handoff.md); this file owns the journal increment and its acceptance evidence.

## Delivered behavior

- Directory: all-journal search, subject/OA/sort filters, name/publisher/subject cards, and apply/manage/invite/admin footer actions. Invitation shares the application link and does not send email.
- Unknown OA stays unknown; citation sorting remains disabled without metadata. Paper counts mean platform-listed articles.
- Public homepage: topics, print/electronic ISSNs, validated external links, public sharing, and separate original-paper and fixed-interpretation links.
- Workbench: draft-first views, per-paper completion/publication metrics, DOI preview/import, continued editing, reversible archive/restore, and legacy processing-bookmark redirect.
- Removed priority/postponement/batch queue controls and the manual no-DOI form; historical records and server authorization remain.
- Rights: explicit processing/public permissions, mandatory evidence, existing expiry preserved, and no model call or publication when saving rights.
- The target's Native Agent configuration, malware upload scanning, session-aware navigation, immutable publication and tenancy boundaries are retained.
- No new database migration. Archiving appends an event and increments the draft revision; it does not remove files, research objects, processing history or published releases.

## CI regressions and corrections

- Incoming `d6105a80` journal run `37754193718` passed backend build, Domain 66, API 26, Worker 6, and Web build; Web tests failed 5 cases. Media/video CI passed.
- Updated directory tests for the new locale hook and complete-directory filtering. Incomplete or failed loading retains known entries, disables global filters/totals, and prevents repeated retry requests.
- Restored explicit file/URL/type identity when adding an active source; uploaded full text sends its existing artifact ID. This does not grant permissions implicitly.
- Updated browser acceptance to the approved draft-first UI: visible navigation, archive/restore, rights and historical expiry, public permissions, fixed publication, and single-paper quota reservation/cancellation.
- Only successful generation jobs count as completed interpretation; source parsing alone does not. The real route handler regression is covered.
- Initial local Web journal tests and 20 draft-workbench tests passed. Final exact-commit CI and production acceptance are still required; do not treat these initial checks as deployment evidence.

## Release and rollback boundaries

- Use the existing configuration, SSH key and canonical [deployment runbook](../runbooks/deployment.md); never print secrets.
- Source must be clean, pushed and CI-passing, with current live release as an ancestor and exact rollback ref; retain the FD9 lock, journal, public identity and automatic rollback guards.
- The incoming integrated branch also changes Native Skill resources and Synclip video receipt contracts. Pair required Native catalogue resources and inspect video compatibility before enabling affected new tasks.
- Initial server video adapter is `synclip-video-v1`. Do not silently let it consume v2 receipt requests or enable unconfirmed LTX administrator capabilities.
- Preserve all existing paid/unknown task receipts and source assets. Deployment does not authorize new model calls, real journal approval or publication.
- Application deployment and browser usability are separate facts; record actual results here after verification.

## Open product work

- Shared file management and Native Hermes journal-scoped understanding/result binding remain incomplete; labels or links do not prove integration.
- Preserve figure-card/FAQ editing and journal approval when accepting common results; DOI matches cannot grant access to private research objects.
- Authoritative OA/citation sources, hierarchical subjects, independent directory inclusion and recommendation/writing tools remain future work.
- Final CI, server build/start and observed production navigation remain pending at this checkpoint.

## Read first

`apps/api/src/routes/journal-{core-routes,workbench,draft-policy,draft-guard}.ts`,
`apps/web/lib/journal-{workbench-model,workbench-api,rights-form}.ts`,
`apps/web/components/journals/`, `scripts/test-journal-workbench.mjs`,
`apps/api/test/journal-browser.test.ts`, `.github/workflows/journals.yml`.
