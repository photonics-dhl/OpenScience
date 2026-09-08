# Progress

## 2026-09-08: integrate latest production before server workflow acceptance

- Measured server release134ebdea / rollback97aa06a, healthy containers and public/local200. Preserve newly deployed atomic confirmation, canonical evidence and frozen version records.
- Candidate4c369cbc adds scoped source review and media continuation; merging134ebdea, tests pending. All runtime validation is server-only. Old a72 acceptance directory was externally removed; logs are historical.
- Production publication implementation details remain in docs/plans/2026-09-07-open-research-publication-plan.md. Complete autonomous normal-user workflow first; then second supported paper and UX.

## 2026-09-08: server-only candidate verification

- User correction: no local runtime validation; all tests/build/migration checks run on ECS. Rule persisted in AGENTS across root/development/release workspaces.
- Candidate a72b5e1c7559edb673579042b7cfaa84260b5a6a is synced to its immutable server directory. Production remains97aa06a, rollbackc5b0dd7; no switch.
- Server full build progressed to image preparation. Server targeted18 domain+3 API+3 worker tests and three package typechecks passed; docs-sync passed. docs:lint found one extra blank line, corrected locally pending server recheck.
- Isolated no-network PostgreSQL container xgs-hermes-migration-a72b5e1c applied all37 migrations, then migration37 rollback/reapply passed. SQL harness created only a minimal migration-name ledger for rollback; this is not Prisma deploy/status evidence. Container retained, production DB untouched.
- Logs: checks1788854681801-dfb18d33-56a9-43bf-a53c-966048fc8f7f; migration1788854617122-e0d1bebc-7594-4c9d-8edd-7e2b74a9e929 and1788854646230-d9b4212d-2540-441e-91dd-626a2bb8537c. Initiale2c78a server build caught missingAuthDeps; fixed in a72b5e1c.
- Scope remains attach-existing-ingestion→awaiting_source_review. Full Hermes initiation, approval resume, Claims/media and ordinary-user real journey remain incomplete.
## 2026-09-08: video user-approved; server-owned Hermes workflow next

- Production/public97aa06a542febf558a47cecbf6559bd0a6c876aa, rollbackc5b0dd7196f6ab2c5d254590a7c7ebc9e4f775fb. CI34192289263 and canonical server build/Parser16/migrations/runtime/public acceptance passed.
- Real paper six fields confirmed and committed; same-version Claim bridge passed. Five scientific Claims/112 Evidence reviewed; storyboard-v3 and all5images approved. Prior failures preserved, only scene4 regenerated.
- Actual53.875s1280x720H264/AAC video generated,1,926,620bytes. Full decode, actual animated scene frames, authenticatedRange, desktop/mobile playback and anonymous/cross-RO denial passed. User approved the video; API approval verified2026-09-08T06:32:43.612Z. Audio acceptance is attributed to the user.
- Deterministic prompt assembly preserves complete scene and Claim conditions/limitations, actual1401chars and0intermediate model calls. Over1500 fails closed instead of lossy rewriting; existing identity/approval boundaries unchanged. Tests3+consumer39+compiledparser10/types/lint/build and independentHigh review passed.
- token-smart scientific handoff updated and portable ZIP refreshed. Local zero text-planner calls do not establish whole-task Codex savings. Browser control still times out; prior actual Chat6Pro planning/review reused.
- Current priority: server-owned Hermes workflow using existing OCR/ScanSci/retrieval/extraction/media. Ordinary-user acceptance without Codex orchestration first, UX/layout polish second, further capabilities afterward. Chat6Pro plan actually received;60s single browser actions succeeded. Durable server run implementation is underway.
- Future UX polish: simplify historical/rejected asset display and replace internal/generic media labels. Current first-slice UX and desktop/mobile no-overflow checks passed; do not imply all UX refinements complete.

CURRENT: docs/handoff/2026-08-16-hermes-2d-pet-handoff.md. Root dirty main and development/release worktrees are separate; do not reset or merge them blindly. CPU image installation remains paused; no new providers installed.
