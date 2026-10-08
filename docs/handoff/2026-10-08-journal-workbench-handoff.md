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
- Local Web journal tests (32) and draft-workbench tests (20) passed. Added explicit accessible names to source permission selects after the first browser run exposed ambiguous label matching.
- `c4cea550865e268adc537dc2371b52a81f05748c` passed journal push/PR runs `37758400785`/`37758407759`, media `37758407887`, and video `37758407725`, including real isolated browser workflows.
- Two full server builds completed, but the first runtime snapshot changed after repeated dependency installation. Both private logs and the original snapshot are retained under `/opt/openscience/observations/journal-20261008-c4cea550865e268adc537dc2371b52a81f05748c/`; no production switch or Native/video installation occurred. Prepare a fresh exact SHA with dependency convergence before fixing its deployment snapshot.

## Release and rollback boundaries

- Use the existing configuration, SSH key and canonical [deployment runbook](../runbooks/deployment.md); never print secrets.
- Source must be clean, pushed and CI-passing, with current live release as an ancestor and exact rollback ref; retain the FD9 lock, journal, public identity and automatic rollback guards.
- The incoming integrated branch also changes Native Skill resources and Synclip video receipt contracts. Pair required Native catalogue resources and inspect video compatibility before enabling affected new tasks.
- Initial server video adapter is `synclip-video-v1`. Do not silently let it consume v2 receipt requests or enable unconfirmed LTX administrator capabilities.
- Preserve all existing paid/unknown task receipts and source assets. Deployment does not authorize new model calls, real journal approval or publication.
- Application deployment and browser usability are separate facts; both were observed as described below.

## Verified production result

- Deployed successfully on 2026-10-08 from `frontend/nanqing` at `42fe1a974fb62e5a868d3a4f1da812065cb148b1`; exact live/rollback identities remain in Hermes CURRENT. Later documentation-only commits do not require another application deployment.
- Exact-SHA CI: journal push/PR `37759938589`/`37759945555`, media `37759945507`, video `37759945653` all succeeded. Server preparation converged after initial dependency setup: two full builds matched protected runtime snapshot `entryCount=96850`, `sha256=e4dc74db18d4e51be3d1586685fec829734f4b1f1e817d1ae438ee2e27cef8f6`; post-deployment verification matched the same receipt.
- The reviewed orchestration reused the existing Native/video installers and canonical production transaction (`skip-migrate=1`, `no-tests=1`, unchanged capability-image reuse). Unrelated Parser/ScanSci/BGE functional canaries were not rerun; their startup health and the existing release guards remained enforced.
- A temporary Nginx method guard covered the entire pairing window. The first immediate reload probe returned 405 before service shutdown; it recovered automatically with no application switch. A bounded wait then verified 503 and deployment completed with exit 0. Both attempts, the original snapshot, and private logs remain under `/opt/openscience/observations/journal-20261008-42fe1a974fb62e5a868d3a4f1da812065cb148b1/`.
- Public `/__release` matched the deployed SHA, homepage returned 200, all production services were healthy, Native runtime/catalogue matched API and Worker, and its timer was active. Transaction/failure/pending markers and the temporary maintenance guard were absent.
- Synclip video now uses v2 receipt verification with `adminModelsEnabled=false` and `accepting=false`; all historical receipts and previous units/config are preserved. This is not video-generation or scientific-quality acceptance. No new model call, paper edit, approval, or publication was submitted for this release.
- Real signed-in navigation passed: directory → manage my journals → Ultrafast Science workbench → existing paper → sources/rights; directory → public journal homepage also passed. Desktop and 375px viewport were observed, with no horizontal overflow on the workbench/rights page. Source selectors had explicit accessible names and permissions remained unchecked.
- Browser 418/423 hydration messages appeared only during the initial release transition; later full reloads of the directory and sources page did not reproduce them. Cause is unconfirmed; this observation does not justify a speculative code change.

## Open product work

- Shared file management and Native Hermes journal-scoped understanding/result binding remain incomplete; labels or links do not prove integration.
- Preserve figure-card/FAQ editing and journal approval when accepting common results; DOI matches cannot grant access to private research objects.
- Authoritative OA/citation sources, hierarchical subjects, independent directory inclusion and recommendation/writing tools remain future work.
- Journal deployment and the scoped production navigation acceptance are complete. The broader product work above and scientific/video acceptance remain open.

## Read first

`apps/api/src/routes/journal-{core-routes,workbench,draft-policy,draft-guard}.ts`,
`apps/web/lib/journal-{workbench-model,workbench-api,rights-form}.ts`,
`apps/web/components/journals/`, `scripts/test-journal-workbench.mjs`,
`apps/api/test/journal-browser.test.ts`, `.github/workflows/journals.yml`.
