# Hermes Research Intelligence CURRENT Handoff

> CURRENT, 2026-09-08. Goal: real paper → structured analysis → confirmed same-version Claims → scientific images and animated video. Final media acceptance remains open.

## Version tuple
- Production/public: b361f4f7781b760583b3a312829877c4d6310e8a; rollback a73f273f7079819579962aa6eff31c1dd9368b08.
- Release source: E:/Miscellaneous/XGS/.worktrees/onchip-video-release, codex/onchip-video-release, HEAD/origin b361f4f7781b760583b3a312829877c4d6310e8a. Draft PR107; deployed CI34180370205 passed. Follow-up base8e7b95e50f15893eb83cd38c9fa0dd57c00c8107 CI34184022890 and server Parser16 passed but not deployed; numeric feedback delta pending commit.
- Development: E:/Miscellaneous/XGS/.worktrees/token-smart-live-workflow, codex/token-smart-live-workflow, HEAD/origin005ffb8d8298d3476e8411046cae300079bd8344; dirty development work retained. Root dirty main is separate; do not reset/pull/stash it.

## Completed and evidence
- Canonical b361 deployment passed server build, Parser16, migrations, runtime and exact public release; log1788835424836-78cd3f38-d0b3-4926-b477-43be8ff18a0a.log. Post-checkup1788835940685-26468931-745c-4684-8381-c6a7e4e2bc00.log passed. API/Worker videoEnabled=true; video/image runners active.
- Real paper 2009.06045v1, SHA d57dc94c05ca99ccb33f8186e9317353c663a638cde1c0c8a90c7c2d029f484a, produced six substantive fields. Main + ordinary Chat6Pro narrowed three scientific statements, confirmed and committed version.
- RO af1a9817-dad3-4c5e-ace4-f33951f19574; version a66f7b15-8d8f-42bf-9f58-c4dd38bbd162; ingestion c1ee0470-729c-4852-9f3c-0569e83778e1; AgentTask a167c7b3-81cf-4fa1-b79d-7438c352b537; artifact2b62efe2-b007-44a3-ba1d-9c3757d8dec8.
- Same-version real UI Claim bridge now PASSED on b361 (claim-resume-v3), without re-upload or model calls. Claims remain scientifically unassessed until review; exact locator match alone is not scientific verification.
- Root cause was ~1e-14 bbox JSON/persistence rounding. Shared 16ULP relative comparator accepts numerical roundtrip, rejects1e-9 displacement, stores canonical bbox; all quote/hash/block/order/range checks retained. Domain40 tests, build/typecheck and independent Sol/high GO; actual stored6fields/94segments replay passed with zero business writes/model calls.
- Screenshot-informed empty-state/contrast UX deployed and verified at1440/390; guide/editor CTA and no overflow (ux-deployed-v3). Fixture video12.25s H264/AAC decoded with five distinct scenes; this is runtime evidence, not real-paper acceptance.
- Media tests/types/lint passed, independent High GO. Production renderer f298e23f3d30db036f1d995ecafe5415b6ec90feaa97282d7926eeda89d95bd6; TTS a215840921a40a9e066ed970d2bf49dcf25bc20af0f7e569d55c0867343ba0ab; model qwen3-tts-customvoice-0c0e305. Installer readiness verified. Protected pre-video config backup retained on server; no secrets printed.

## Active / next
1. Scientific five-scene Claims stage PASSED:5 Claims/112 exact SourceMap Evidence, all explicitly reviewed/verified. scientific-claims-v1 preserves IDs. No duplicate upload or extraction.
2. Actual storyboard-v1 and v2 retained with scientific review failures; ordinary Chat reviewed actual differences. v3 asset0f568ba8-b67f-4fff-8032-1333fad6a390 approved after direction/emission/signed-local-field/no-data corrections,251 narration characters,5roles. First actual image8ab839e7-0763-4b40-9026-46c1ad8e16ad visually reviewed and approved; scene-images-v1 has four actual approved images0..3. Scene4 task5ec57a87-8de6-4294-a2ef-c3e2184420b0 failed structured planning (2026-09-08T03:18:52Z), no reviewable fifth image; retain task and diagnose before retry. Raw images are stylized unlabelled artwork under existing provider contract; scientific labels/scale limits remain in storyboard/video, not measured imagery.
3. Scene4 repair: generic feedback replay still failed3 compiled_length responses. Numeric feedback delta passed real exact-input replay in3calls: lengths1533/2004 corrected to1439 under unchanged1500; no business/image writes. Independent review and final release pending, then explicitly resume only scene4 with new recovery task state. Generate new same-RO video from approved same-version storyboard + five image IDs. Check authenticated Range/playback, full decode, narration timing and real scene motion, science/source/permissions. No full-flow completion claim before this passes.
4. Acceptance helpers/evidence live under development apps/web/test/visual/out/token-smart-release (Git ignored). run-controlled-stage.mjs uses scoped controlled actor, validates release, closes ephemeral session. Never print session tokens.

## Cost / continuity
- Ordinary Chat6Pro conversation https://chatgpt.com/c/6a9e7dac-e4c8-83ea-9857-4c52ad66c8ec actually supplied continuation, scientific wording review and five-scene narration/actions. Reuse these; no pending webpage reply.
- Strong main retained, Sol/medium bounded implementation/helpers, Sol/high high-risk review. Existing codex-image consumes Codex; product MiniMax is separate. No defensible overall savings percentage.
- Resume-v1 helper newline bug accidentally triggered one extra extraction; preserved as failure/cost. Corrected v2/v3 restore same version without model calls. Do not hide retry cost or report fixture success as product success.
- Global token-smart routing/handoff now emphasizes whole webpage stages, no duplicate analysis, recover sent/received state and minimum real artifact before batching. Share package docs/user/_ideas/token-smart-share-20260908-continuity.zip.

## Constraints / read first
- Requirement baseline docs/OpenScience_Kimi_Development_Spec.md; accepted design docs/specs/2026-09-05-integrated-research-product-design.md; plan docs/plans/2026-09-07-literature-recovery-workflow-plan.md.
- CPU image installation remains user-paused. Existing image provider is healthy; no new provider/model installation required. D2NN demo is not this paper.
- Parser remains no network/Secret, nonroot, readonly,512MiB. SSH only root wrappers with explicit Git Bash. No .env/Secret printing or manual production code editing.
