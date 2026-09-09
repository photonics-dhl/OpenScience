# Hermes Research Intelligence CURRENT Handoff

## Goal and authorization
- Server-owned paper extraction → content-selected storyboard/images → animated video. Hermes chooses each paper narrative; no fixed paper/five-scene template or manually authored Claims.
- NO tests/preflights/benchmarks/local runtime/build/CI tests. Necessary server build/deploy and actual authorized product generation only. No direct DB resets, duplicate uploads or deletion.
- Preserve scientific sources, workspace permissions, user approval, billing and sandbox boundaries.

## Version tuple
- Worktree E:/Miscellaneous/XGS/.worktrees/onchip-video-release; branch codex/onchip-video-release.
- Production45dabd7a25ba7bd1b7d5cc8ba1e226d6eb26ecd8; rollback3446f309480fe0a9a38a25c8669e0ccedf7aa0bd. Subsequent HEAD is docs-only handoff, not a new deployed release.
- Recovery commits1df4e047 +3446f309 deployed through canonical --confirm --no-tests. First candidate failed server compile due to type-only Prisma import; fixed before switch.
- Root dirty main and token-smart-live-workflow worktree are separate; preserve them and concurrent R1 hardening.

## Actual completed product run
- Run13e3fcd5-a6f0-48d6-82d7-33263e06fe33: SUCCEEDED, version13; all seven steps succeeded. Actual state log1788890593924-64b87a32-e61f-44d5-877a-0b2d1e10ab1e.
- Actor a15edcab-7ec8-4e75-86d7-aa9c0498a829 (ordinary user); workspace6b83001a-75c1-4337-ab76-629908615a39.
- RO714a0c2d-8c00-4471-a4f9-4a1270eafcdb; version1011dcdb-66fa-4221-beab-5880e38f3939; content-driven-v1, generation grant8.
- Paper arXiv2009.06045v1,25pages; source artifact6864cc65-f944-474a-af40-bab7ca8c65d7; SHA d57dc94c05ca99ccb33f8186e9317353c663a638cde1c0c8a90c7c2d029f484a.
- Ingestion19149438-6f2a-4a95-aba0-b0db31d4f62e; extractor11675dd1-684f-4df8-af8d-6fe52edc0bb4 is PARTIAL. Only original method Claim1b75d4c6-ab34-4810-b34d-88f4bc4a1289 selected;23 Evidence reviewed. Success does NOT mean complete-paper understanding/results verification.
- Approved storyboard0cdebc04-8bfa-42fd-b303-8f2293c8165e: server MiniMax-M3 selected four functional-diagram scenes; Main+High scientific review, normal user API approval.
- Image assets in scene order:2958e4a6-49d1-4f21-8da6-9ad9dc454fdb,ba919962-34a3-4e95-b9a8-136eae5c2807,085fb3ad-39f3-4510-a489-6762f71b6304,6db79e78-bc81-48b1-9454-62472afe999b. Actual images viewed, all ordinary API200 approved (log1788890283240-336c0706-c08c-4ab9-af2b-b90aaac44016).
- Server automatically created video task/asset c033b30c-eb1c-4fff-ad72-154ed7d8c6b7 after image approvals; succeeded and ordinary API200 approved (log1788890553412-5e4aea9b-33e9-452f-9ffd-2f989eb29eda).
- Video SHA ba9295e8e4ebd535dc90bd856753b6672d5ed37b878679bafc8b13d067df837b;23.459s,1280x720,24fps,H264/AAC; content-driven-animation, continuous Qwen3-TTS/Serena. Rendering reports0freshPaidApiCalls (not a whole-workflow cost metric).
- Actual video frames viewed: four scenes, source-based functional relations, readable narration captions, drawn arrows/objects, conceptual/not-measured notice. Antenna/chip artwork is conceptual, NOT verified device geometry. Audio track present; pronunciation was not individually listened to/reviewed.

## Deployed recovery and cost behavior
- POST /research-objects/:id/hermes-runs/:runId/retry-generation, expectedVersion+Idempotency-Key; optional canRetryGeneration/chargeableAttempts on GET; UI Continue unfinished generation + new-task count.
- Prior image task3712f315 failed external image server error. Recovery preserved image0; charged one new scene1 task; rearmed original scene2/3 only after proof all durable submission/inbox/result paths were absent. Old failed tasks remain.
- API requires every rearm proof before transaction debit; worker rechecks before one-use marker consumption. Unsupported/disabled providers fail closed. API mounts only inbox/results read-only, no credentials/private/state. Existing worker writable inbox preserved; parser unchanged.
- All historical generation tasks including replacements plus future video count against grant8. No generic paid retry bypass, permission weakening, or DB reset.
- Recovery helper ALREADY submitted HTTP202 using keyhermes-recover-image-service-v1, log1788889410160-5a331eff-da10-4492-b4d3-31d8da774eae. Never blindly resubmit any prior generation helper.
- Early image0 approval during generating state returned403; normal user review is allowed once whole batch reaches awaiting_scene_images_review. No permission code change was needed.
- Main retains selected model; Sol/medium implementation, Sol/high credit/authority review; prior WebChat6Pro architecture advice reused. No reliable overall Codex savings percentage established.

## Next action and evidence
- WebChat6Pro UX discussion submitted/read back4m36s (same known URL); adopted sequence in docs/plans/2026-09-05-integrated-research-product-plan.md. First batch deployed45dabd7a: real guide storyboard.create suggestions + account/RO/actual-version scoped session drafts + sidebar hierarchy. Edited/cleared values win; paid submit remains explicit. Sol/medium implementation and focused Sol/high static review complete.
- UX deploy log1788917875578-5f990ae8-3be2-480a-b0dc-cd7a6335a1f8 exit0; canonical --no-tests server build/start completed. No tests/media reruns; product browser currently unauthenticated, so logged-in UI/visual behavior unobserved. Next: sidebar primary actions, cross-page navigation/state and shared typography/spacing; no whole-site polish completion claim.
- This selected-method vertical flow is complete. Current authorized phase: improve user experience/page layout/visual polish; retain server-owned generation. Full-paper extraction completeness and pronunciation quality remain distinct limitations.
- Production deploy log1788889080559-d6d3bd46-c388-467d-bc24-bd2fc6ef0c07 exit0; logs C:/Users/Mac/AppData/Local/Temp/token-smart-checks.
- Video runtime source583d201e; renderer sha256:ff6042f6247c0365f89ff545953400920ee15cc8fd3134e83d41f2fe873c509e; TTS sha256:a215840921a40a9e066ed970d2bf49dcf25bc20af0f7e569d55c0867343ba0ab; modelqwen3-tts-customvoice-0c0e305. Recovery did not rebuild runtime.
- Helper/media directory E:/Miscellaneous/XGS/.worktrees/token-smart-live-workflow/apps/web/test/visual/out/token-smart-release: hermes-content-driven-method.mp4,hermes-video-frames.png,current-scene-0/1/2/3.png. Copies for viewing; generation occurred entirely on server.
- Server media /opt/openscience-video/results/c033b30c-eb1c-4fff-ad72-154ed7d8c6b7/result.mp4; normal API source remains product asset. Do not substitute historical manually assisted ca0908bb video.
- SSH only root infra/scripts/ssh-run.sh via C:/Program Files/Git/bin/bash.exe; no .env/credentials output. Read-first requirement baseline docs/OpenScience_Kimi_Development_Spec.md + this handoff.
