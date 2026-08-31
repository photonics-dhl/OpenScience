# Task 8 Report — Literature acquisition entry points

## Status

- Result: DONE locally / production acceptance pending Task 10.
- Feature commit: `8238a9f863bf937ba9ecc8df34b7049ef56893cf`.
- Branch: `codex/scansci-default-capability`.
- Production release/rollback remain `689331845574612130f223d08c92e61721c16586` / `c435c4c8b2800bb20998fd9a9a93f2db96328661`.

## Implemented contract

- Hermes classifies DOI/arXiv and explicit bounded Chinese/English find/download-paper intent locally; ambiguous source-control/bug-source goals and unrelated research goals remain `workspace.guide`.
- Title-only explicit intent submits query-only metadata; identifier intent submits the shared identifier grammar.
- Dashboard targets Personal; RO Hermes, RO Files/Evidence and an RO-route Drawer target the active RO.
- Every surface composes the Task 7 `LiteratureAcquisition` state machine, API, idempotency namespace, recovery/poll/retry and temporary-document download path.
- Native 44px disclosures, unique input IDs, paper/dark semantic tokens, bilingual copy and a within-form control avoid cards, duplicate labels, nested forms, competing Drawer live regions and focus theft.
- No provider, account, CARSI, mode or institution control is rendered.

## RED evidence

1. `vitest run test/hermes-literature-intent.test.tsx`: failed on missing `@/lib/hermes/literature-intent`.
2. `vitest run test/literature-acquisition.test.tsx`: failed because target/tone/initial query, disclosure, RO copy and unique input ID were absent.
3. `vitest run test/surface-shells.test.tsx`: failed because Evidence Intake, RO Hermes and RO Files lacked a literature entry; the nested-form regression later failed with two `<form>` elements instead of one.
4. `vitest run test/hermes-state.test.tsx`: failed because the Drawer lacked deterministic literature routing.
5. First `test:release`: `59/72` passed; Dashboard fixtures missed Task 7's recovery query and Evidence Intake hydrated invalid nested forms. Narrow rerun after the fixes was `3/3`.
6. First `test:hermes-companion-release`: performance gate timed out because three legacy Dashboard fixtures omitted the same Task 7 recovery GET.
7. Independent review additions failed as intended: `get source control working` and `find source of the bug` misrouted to acquisition, and `selectLiteratureRecoveryTask` was absent.

## Final GREEN evidence

- Focused intent/acquisition/state contracts after review: `38/38`.
- Full Web: `61/61` files, `462/462` Vitest plus `5/5` Node contracts.
- Web typecheck: exit `0`.
- Web production build: exit `0`, `19/19` static pages generated.
- Product release browser gate: `72/72` in `3.3m`, including three intake viewports, three Files viewports, RO review, 320px compact navigation and Hermes journeys.
- Hermes Workspace Companion gate: exit `0`; first-ready `943ms`, idle/pointer p95 `16.7ms`, zero cadence drops, `2,603,570` transferred bytes, compatible runtime `19/19`, product Hermes `8/8`.
- Targeted ESLint and `git diff --check`: exit `0`.
- Root lint/workspace/docs-sync, explicit docs-sync `8/8`, Markdown lint `238` files and final diff check: exit `0`.

## Review and remaining boundary

- Independent review's recovery and ambiguous-source findings were fixed and reverified. Its Dashboard-to-RO suggestion was rejected because the locked Task 8 direction explicitly requires Dashboard to target Personal.
- No Docker, ECS, production, Secret, `.env` or installation action was performed.
- Real 375px OA/CARSI, one-use download and production deployment remain Task 10 acceptance work; this report does not mark Task 10 done.

## Fix round 1/5 — Important review findings

- Fix commit: `d75ca1c7b7a37af9ab7ff0efbdd16f8c95800081`.
- Drawer parsed intent now owns one caller key plus SHA-256 fingerprint across child unmount/reopen. Exact replay reconciles the same task; later metadata→full-text and genuinely new user intents receive fresh identity.
- Recovery requires strict `targetKind`/`researchObjectId` combinations. Durable payloads carry a server-stamped Personal/RO target, and active, retryable SQL, and terminal selectors apply user/authority/target filters before ordering and `LIMIT 1`; Web removed global post-filtering.
- RO Drawer target authority is the route RO ID, not suggestion/task context. Embedded Evidence Intake Enter ignores both `isComposing` and legacy key code `229`.

### Fix-round RED evidence

1. Durable payload test rejected the new target field; API accepted missing recovery target; Web still requested the global recovery URL.
2. Drawer tests had no parent-owned key/fingerprint or route target helper; IME decision helper was absent.
3. Domain target matrix initially failed to recover RO A across 25 newer RO B tasks until filtering moved into all selectors.
4. UUIDv7 target contract initially failed because the first validator admitted only UUID versions 1–5.
5. Browser close/reopen matrix initially exposed two unscoped status locators and one summary selector mismatch; scoped dialog assertions then exercised the real production components without weakening behavior checks.

### Fix-round final GREEN evidence

- Domain `535/535`, API `101/101`, Agent Worker `502/502`, Web `463/463` Vitest plus `5/5` Node; relevant package and integration-contract typechecks exit `0`.
- Web build generated `19/19` routes. Root lint/workspace/docs-sync and final diff check exit `0`.
- Browser fix matrix `6/6`: running/succeeded/auth-required/failed close→reopen use one key/one simulated debit; failed uses same-task retry; a new intent gets a new key; cross-RO URL uses route RO; Chinese IME Enter is inert until composition ends.
- Product release gate `72/72` in `3.2m`.
- Hermes Companion final successful rerun: first-ready `890ms`, idle/pointer p95 `16.7/16.8ms`, zero drops, compatible runtime `19/19`, product Hermes `8/8`.
- One immediately prior unchanged Hermes run hit the stochastic motion gate on consecutive `blink-single` actions after its performance phase passed; no motion file changed. The complete fresh rerun above exited `0`; the transient failure is retained here rather than hidden.
- No ECS, Docker, production, Secret, `.env`, migration execution or dependency installation occurred. The ledgered intent-grammar Minor was intentionally not expanded in this fix round.

## Fix round 2/5 — explicit intent precedes generic recovery

- Fix commit: `c0bcf0a0af4cf4f58d62303b9fa5ceeb947eeddf`.
- A complete caller-owned `initialRequest` + key + fingerprint starts exact POST replay immediately after user resolution. It never runs or waits for generic target history recovery.
- Generic target-scoped recovery remains available only to Dashboard/standalone entries without explicit intent identity. An unrelated same-target active/retryable/terminal task cannot mark explicit A submitted, suppress it or replace its reconciled task.
- Close/reopen still reuses A's key/fingerprint and Task 5 replay-before-debit path; a new intent and metadata→full-text action still receive fresh identity.

### Fix-round RED and GREEN evidence

- RED unit: `hasExplicitLiteratureIntentIdentity` was absent.
- RED browser: generic recovery returned active B before explicit A; the old component performed recovery and could suppress A.
- Focused GREEN: intent/acquisition/state `38/38`; actual browser A-vs-B `5/5` covers running, succeeded, auth-required, failed, cross-RO, close/reopen, same-key one-debit simulation and zero Drawer-added recovery GETs.
- Full Web `464/464` Vitest plus `5/5` Node, typecheck, and `19/19` route build pass.
- Product release `72/72` in `3.1m`; Hermes Companion first-ready `930ms`, zero drops, compatible runtime `19/19`, product Hermes `8/8`.
- Root lint/workspace/docs-sync and diff check pass. Domain `535`, API `101` and Worker `502` remain the unchanged green contract baseline from fix round 1.

### Task 10 deployment assumption check

- Before Task 10 rollout, run a read-only production preflight and require zero durable `source.retrieve` ScanSci tasks whose payload lacks `target`.
- This local no-ECS round cannot assert the production count. A nonzero count blocks deployment and requires an explicit compatibility decision; do not auto-stamp, rewrite or broaden a migration.
