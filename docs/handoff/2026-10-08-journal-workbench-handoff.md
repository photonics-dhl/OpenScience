# Journal workbench port to the collaboration branch

## Status and source identity

This is a development increment, not a production deployment receipt.
The user requested this port and server deployment on 2026-10-08.
Target repository: `photonics-dhl/OpenScience`, branch `frontend/nanqing`.
Target parent: `7755a5ef7ab0a6bfa5184b54dd93c4054f883be4`.
Original feature: `Nanqing96/openscience@5305f4884ea583ce628c073d857dbc5ca740cff0`,
based on `96e5e0c626ac44427e2e92684e104e4e5d4b0dfd`.

The target is substantially newer than the original feature baseline. This is a
selective feature port, not a replacement of the target tree or a reset to the old
repository. No main branch, database records, deployment scripts, credentials,
provider settings or production release markers were changed.

## Preserved target capabilities

- `journal-core-routes.ts` retains the exact original target `journals.ts` blob
  `95e610dbff1dcc68dbc0b25e54f44f8f1b0824da`. This preserves the target's native
  agent configuration, malware scanner dependencies, application reopening and
  existing publication and authorization behavior.
- The existing session-aware `SiteHeader`, `PublicProductAccess`, `AccountLink`,
  public-navigation styles and existing `JournalAdminLink` are retained.
  Journals is moved to the final business-navigation position.
- The directory and public journal page retain the target's current CSS and
  protected/public-page DOM hooks rather than restoring the old visual shell.
- The generic journal boundary, shared file/model pipeline, current single-paper
  workbench, worker and domain modules are not replaced with the old feature tree.

## Ported behavior

Directory: Browse all journals, separate search/subject/OA/sort controls, cards
containing name/publisher/subjects, and apply/manage/invite/admin footer actions.
Invitation currently shares the application link; it does not send email.
Unknown OA remains unknown. Citation sorting is disabled without metadata.
Paper count explicitly means platform-listed articles, not total journal output.

Journal homepage: multiple topics, separate print/electronic ISSNs, validated
external links, public sharing and an article list separating the public
interpretation version from the original paper URL.

Workbench: draft-first views, two clickable per-paper metrics, DOI preview/import,
continued editing, reversible archive/restore, old queue bookmark compatibility.
Priority marking, seven-day postponement and queue-confirmation controls and the
new manual no-DOI form are removed; historical records are retained.

Rights: scope reevaluation is within the scope panel; no expiry input; existing
expiry is preserved; required evidence has a sample placeholder; the meaning of
public original-figure use is explained. Processing consent never silently grants
public permissions. Saving rights does not call a model or publish a result.

## Checks and deployment boundary

The original feature CI run `37747934765` failed API compilation with TS18048 in
`journal-draft-guard.ts`: Fastify's route URL may be undefined. The port handles
that value explicitly and adds an execution test for an unmatched route.

`scripts/test-journal-workbench.mjs` contains 16 targeted tests for draft state,
actual guard behavior with isolated dependencies, permissions, OA, pagination,
URL safety and TS/TSX syntax. Their presence is not a claim that they passed.
The journal workflow now runs on pushes to `frontend/nanqing`, including these
tests and the unchanged existing database, worker, web and browser gates.
Consult the exact commit's GitHub Actions results for actual outcomes; do not
reuse the original feature's 27-test log as evidence for this port.

This session has no configured SSH execution channel or mounted project SSH key.
The deployment script was not run. No server build, restart, production update,
rollback verification or browser acceptance is claimed. Deployment still requires
the canonical clean, pushed, CI-passing SHA procedure in
[the deployment runbook](../runbooks/deployment.md), including live release ancestry
and rollback checks. Do not send private keys or environment secrets through chat.

## Remaining work

- Connect this journal workflow to the current shared file management and native
  Hermes paper understanding with journal-scoped authorization and result binding.
  Neither the new wording nor a direct link is evidence of that integration.
- Preserve figure-card/FAQ editing and the separate journal approval gate when
  accepting common results. A DOI match must not grant access to another private RO.
- Add authoritative OA/citation sources, hierarchical subject metadata, directory
  inclusion independent of onboarding and actual recommendation/writing tools.
- Update existing UI expectations to the approved workflow while retaining all
  authorization, disclosure, immutable-version and expired-rights regressions.
- Complete full builds, database concurrency and real desktop/mobile navigation.
- Root project-index integration remains outstanding; its newer content was not
  overwritten or truncated during this port. This file records the exact delta.

## File-index delta

| Paths | Responsibility |
| --- | --- |
| `apps/api/src/routes/journals.ts`, `journal-core-routes.ts` | Preserve current target routes and register new workbench behavior. |
| `apps/api/src/routes/journal-workbench.ts`, `journal-draft-policy.ts`, `journal-draft-guard.ts` | Scoped listing, transactional archive/restore, archive guard and state rules. |
| `apps/web/lib/journal-workbench-model.ts`, `journal-workbench-api.ts`, `journal-rights-form.ts` | Views, paging/filtering, API transport and explicit rights projection. |
| `apps/web/components/landing/SiteHeader.tsx` | Keep current session-aware navigation with journals last. |
| `apps/web/components/journals/JournalDirectory.tsx`, `JournalDirectoryActions.tsx`, `JournalShareButton.tsx` | Minimal directory, footer and public-link sharing. |
| `apps/web/components/journals/JournalManagementWorkbench.tsx`, `JournalDoiImport.tsx`, `JournalGovernance.tsx`, `JournalProcessingQueue.tsx` | Draft-first editorial work and retained governance. |
| `apps/web/components/journals/JournalSourceRightsMatrix.tsx` | Scope and evidence UI without implicit permission grants. |
| `apps/web/app/journals/page.tsx`, `apps/web/app/journals/[slug]/page.tsx`, `apps/web/app/journals/manage/[id]/processing/page.tsx` | Public entry, homepage and old-route redirect. |
| `scripts/test-journal-workbench.mjs`, `.github/workflows/journals.yml` | Targeted port tests and existing CI on the requested branch. |

No new database migration is introduced. Draft deletion archives a working revision
through an append-only event and revision increment; it does not delete source
files, the paper identity, research object, processing history or public releases.
