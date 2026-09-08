# Hermes Research Intelligence CURRENT Handoff

## Goal and authorization
- Deliver server-owned paper extraction → content-selected storyboard/images → substantive animated video. Hermes chooses the narrative; no fixed paper/scene template and no manually authored scientific Claims.
- Actual product generation, normal user approvals and bounded paid continuation are authorized. NO tests/preflights/benchmarks/local runtime/build/CI tests; necessary server build/deploy only. Commits [skip ci], hooks disabled.
- Preserve source, actor, workspace, review, billing and sandbox boundaries. No manual DB resets, duplicate uploads or file deletion.

## Version tuple
- Worktree E:/Miscellaneous/XGS/.worktrees/onchip-video-release; branch codex/onchip-video-release.
- HEAD/production 583d201e81ae99c27ab8edaa036170e212aab010; rollback7f4dbf2fd89903c73f0194b4cd0d85f904d7b45f. Fresh marker confirmed before recovery work.
- UNCOMMITTED: bounded same-run image recovery backend/API/UI; High recovery boundary review clear; accidental duplicate worker mounts/parser group removed. Main fixed parentIdentity lookup to private provenance (public scene view has no identity).
- Root dirty main and token-smart-live-workflow dirty branch are separate; do not reset/pull/stash them. Preserve concurrent R1 hardening.

## Actual product state
- Ordinary actor a15edcab-7ec8-4e75-86d7-aa9c0498a829; workspace6b83001a-75c1-4337-ab76-629908615a39.
- RO714a0c2d-8c00-4471-a4f9-4a1270eafcdb; version1011dcdb-66fa-4221-beab-5880e38f3939.
- Paper arXiv2009.06045v1,25pages; source artifact6864cc65-f944-474a-af40-bab7ca8c65d7; SHA d57dc94c05ca99ccb33f8186e9317353c663a638cde1c0c8a90c7c2d029f484a.
- Ingestion19149438-6f2a-4a95-aba0-b0db31d4f62e; extraction task11675dd1-684f-4df8-af8d-6fe52edc0bb4 succeeded PARTIALLY. Only original method Claim1b75d4c6-ab34-4810-b34d-88f4bc4a1289 selected,23 Evidence reviewed via normal user API. No complete-paper result claim.
- Run13e3fcd5-a6f0-48d6-82d7-33263e06fe33, content-driven-v1/grant8, currently FAILED after external image service error.
- Approved storyboard0cdebc04-8bfa-42fd-b303-8f2293c8165e: four functional-diagram scenes30s. Main+High scientific review accepted conservative method summary; no invented electron trajectories, algorithm, precision or measured curves. Normal API approval200 logged1788885786383-4b8a3adb-2e46-4343-b18b-9250f636e633.
- Server automatically adopted storyboard and created four image tasks. Scene0 task/asset2958e4a6-49d1-4f21-8da6-9ad9dc454fdb SUCCEEDED/draft, actual block diagram viewed; not yet approved.
- Scene1 task3712f315-28f9-459f-900c-dafec5c177b5 FAILED. Runner result EXECUTION_FAILED; actual agent text: image generation server error, no retry. Do not infer quota/network cause.
- Scene2 task085fb3ad-39f3-4510-a489-6762f71b6304 and scene3 task6db79e78-bc81-48b1-9454-62472afe999b FAILED with Hermes run authority invalid after run failed; the error alone does not prove whether submission occurred. No video generated.
- Earlier drafts3d46/445a/90ec/e62 and failed revisions remain history; never approve old erroneous drafts to advance flow.

## Implemented capability and pending recovery
- Content-driven bounded objects/actions, original source quote support; planner selects lossless quoteId, server materializes original quote. Legacy no-animation base text omitted from replanning while lineage preserved.
- Meaningful non-label translate/pulse/draw required across whole video, not every explanatory scene. Domain/runner/renderer mirror consistent; every scene retains structure/source validation.
- Provider failures classified safely; exhausted provider pool does not get repeatedly retried by structured-output layer. Scientific review remains required; schema success alone insufficient.
- Recovery candidate: POST /research-objects/:id/hermes-runs/:runId/retry-generation, expectedVersion+Idempotency-Key. Server optional canRetryGeneration/chargeableAttempts on GET; UI shows Continue unfinished generation with count.
- Same-run recovery preserves approved storyboard/source/image0 and failed task history. Real provider failure gets new task/normal debit; authority-error candidates may rearm only with a server-only one-use marker AND worker proof that the durable provider submission does not exist. Agent submission debits1; failure has no refund, so these rearm reservations already paid.
- All historical generation tasks including replacements plus future video must remain<=8. Transactional permission/source/state/ledger/CAS/idempotency + existing outbox. No generic paid-image retry bypass. API now requires durable submission-absence proof for every rearm before charging any replacement; worker independently rechecks before submission. API mounts only inbox/results read-only, without runner login credentials. Unsupported/disabled providers fail closed. High confirmed both recovery boundaries; final compose change is API-only.

## Next actions
1. Complete focused High recovery review, resolve findings; commit/push [skip ci]. Canonical server deploy --confirm --no-tests --rollback-ref583d201e <candidate>. No renderer rebuild needed for recovery-only changes.
2. Execute prepared resume-product-run-v1.cjs once via normal user API (stablekey hermes-recover-image-service-v1). Expected one new paid task, two existing rearmed tasks, image0 retained. Never direct-edit DB.
3. Observe same-run image completion; fetch actual media, review and approve via normal API. Then server creates video automatically; inspect actual audio/motion and approve only real acceptable output.
4. Sync current docs/parent handoff, report actual result and remaining extraction/UX limits. No overall token-saving percentage established.

## Runtime and evidence
- Video runtime source583d201e; renderer sha256:ff6042f6247c0365f89ff545953400920ee15cc8fd3134e83d41f2fe873c509e; TTS sha256:a215840921a40a9e066ed970d2bf49dcf25bc20af0f7e569d55c0867343ba0ab. Install log1788885359766-9988e30e-609e-49cd-9eee-53a0a969c8b0.
- Latest deploy log1788885286162-8328207f-4f35-4970-a044-9c4b73ca1298, exit0. Failure state1788886223165-9418db11-c575-4409-885e-a890485ec25f; image cause1788886354598-904b7862-87a5-4c27-a0e9-34286876dad1. Logs C:/Users/Mac/AppData/Local/Temp/token-smart-checks.
- Helperdir E:/Miscellaneous/XGS/.worktrees/token-smart-live-workflow/apps/web/test/visual/out/token-smart-release (ignored); server /opt/openscience-evals/hermes-user-journey.
- read-product-run.cjs returns exact run/assets and approved plan task0cde. read-product-media.cjs gets actual media through normal server API; current-scene-0.png already viewed, not approved.
- approve-product-assets.cjs: XGS_REVIEWED_ASSETS_B64 JSON[{id,kind,contentHash,updatedAt}], fixed user/RO/version/authenticated CSRF PATCH, exact reviewed snapshot. Only use after content inspection.
- Request helpers v3–v7 ALREADY submitted; do not blindly resubmit. resume-product-run-v1.cjs PREPARED NOT executed. Use gzip payload for Windows8KB command limit.
- SSH only root infra/scripts/ssh-run.sh via C:/Program Files/Git/bin/bash.exe; no .env/credentials output. Full earlier evidence in Git history; read-first baseline docs/OpenScience_Kimi_Development_Spec.md and this handoff.
- WebChat6Pro architecture response read earlier by main; courier thinking summaries were not a review. Historical manually assisted video ca0908bb is not this autonomous flow.
