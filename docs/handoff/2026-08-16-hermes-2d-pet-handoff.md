# Hermes Research Intelligence CURRENT Handoff

> CURRENT, 2026-09-07 +08. Goal: a real workspace paper upload → Hermes structured analysis → scientific mechanism images and meaningful animated video in the SAME RO. Deployment of the evidence/recovery fixes is complete; this minimum product is NOT yet end-to-end accepted.

## Version tuple

- Working branch: codex/token-smart-live-workflow, E:/Miscellaneous/XGS/.worktrees/token-smart-live-workflow. Application commit/release c9439ae5a6d7ddbd0ae1e6b8b1c97d5b91e260e2; later test-only HEAD8928a9d760c58d232024ead397a8159769802c80 and docs commits are not another application release.
- Exact deployment workspace: E:/Miscellaneous/XGS/.worktrees/token-smart-production-c9439ae, detached HEADc9439ae. Canonical deploy completed; active/public c9439ae, rollback5e4b4d47cba918db5a9b7f7092de32aa244c258e. Journal clear, no failed-release marker.
- Root E:/Miscellaneous/XGS remains dirty main@b9616cb; do not reset/pull/stash it. origin/main was1b974dd at last fetch; publication/integration state must be checked with Git. Use the working branch above for continued product work.
- Separate animated D2NN demo9848411d1419a0dd690f74cca9042369b651f7b2/run9848411-20260906T074017Z and controlled Codex image service are preserved. They do not prove automatic RO media generation.

## Deployed / verified

- Literature recovery is visible and async results are scoped to user/RO; query state also changes synchronously with scope. Existing Wanko/lamp, accepted layout, manual confirmation and permissions remain.
- Canonical extraction maps quotes to SourceMap blocks with identity/roundtrip validation. Repeated matches stop after two distinct locations; ambiguous/cross-block/missing never invent trusted locations. Legacy pure-text extraction remains compatible.
- Both Agent and ingestion public results retain private storage redaction and expose only validated sourceMapIdentity artifactId/contentHash. The UI displays safe location status and preserves apply/dismiss/high-risk confirmation; no source URL invention or automatic SDF writes.
- Independent Sol/high review found and closed three blockers: raw-ref/API serialization mismatch, cross-scope query leakage, and occurrence-count memory growth. Earlier helper13/13 did NOT prove complete real-API wiring.
- Fresh local checks: domain83, Worker537, Web544+5; affected browser17/17 including first-commit target/user isolation; relevant typechecks, domain build and lint passed. Test-only8928a9d fixes reopening a disclosure in the regression, not application behavior.
- Exact server fullbuild, Parser16, core36/search2 migrations (none pending), database isolation, BGE runtime, ScanSci tools/storage/worker/OA and container health passed. Public/loopback200, egress204. Predeployment backup core28M/search20K; no manual old-backup deletion.

## Real minimum-flow acceptance: FAILED

- Real UI uploaded pinned arXiv2009.06045v1 PDF,24,671,920bytes, SHA256d57dc94c05ca99ccb33f8186e9317353c663a638cde1c0c8a90c7c2d029f484a, under the controlled test user. RO ba7920d1-ea3c-4355-b479-8d7a203d3a94; ingestion bfeb3d55-4f31-4bb4-9c56-0a7a280d5d01; AgentTask ed2554fd-f909-43cc-aeb3-009007bd63e9.
- Ingestion reached needs_review. Worker task status is succeeded but result.status is needs_review: parser-failed; all local parser stages failed; unresolved pages remain. SourceMap was stored, but no six-field core/evidenceLocation was produced. Do not equate task succeeded with successful extraction.
- The exact PDF reproduced invalid PDF text geometry in the deployed Parser image with network none, read-only root, non-root user,512MiB/2CPU/64PID and no host data mounts. Start at apps/agent-worker/src/parsers/native-pdf-text-items.ts:textItemBoundingBox. Do not loosen isolation, fabricate geometry or silently drop scientific text to force green.
- The task stopped before LLM extraction; its audit time window contained no gateway calls. Manual confirmation/commit and new media generation were NOT reached. Controlled session was closed; test data is retained privately, not a public demo.
- Generic video and generic image without sceneImage are explicitly unavailable in presentation-assets.ts; worker lacks mediaGenerator injection. Existing playback/import/demo and fixture tests cannot establish a producing pipeline.

## Next action / quality constraints

- Continuation: same Web6Pro returned staged planning and a formula-fidelity decision. Sol/medium repaired certified CMSY10 negation composition and conservative page-level review fallback; Sol/high approved after identity, all-empty-page false-success and operator-work fixes. Fresh Worker556/focused37/compiled10/types/lint pass; exact512MiB replay has25pages/two not-equals/no empty pages or warnings. New release acceptance/deployment and real Hermes retest are next; current production remains c9439ae. OCR independently failed formula fidelity and cannot clear the retained review reason.
- Scientific identity: this PDF is *On-chip sampling of optical fields with attosecond resolution*, not D2NN. Reuse the accepted animation quality/runtime, never its different physical mechanism. Media review also confirmed the missing SDF-to-evidence-backed-Claim bridge and narration/isolated-render adapters.

1. Reproduce and fix the real-PDF geometry failure with a meaningful regression and existing sandbox limits; rerun the SAME document through the actual upload/Hermes/confirmation/commit journey, retaining first-failure evidence.
2. Verify how confirmed SDF/analysis becomes same-version Claims, then connect mechanism-image planning/generation and controlled animated rendering to existing presentation tasks/assets. Preserve approvals, artifact/version binding, source provenance, uncertainty, private playback and real failure/retry states.
3. Extend actual production acceptance to newly generated images and videos: inspect image dimensions, video decode/duration/audio and in-RO playback/seek; test cross-RO authorization and stale tasks. Do not substitute imported files or a standalone demo.
4. Earlier approved design rejects text Claim cards as scientific illustrations and repeated-panorama/slideshow-only videos. Preserve scenes/structure/propagation/action/local magnification, accepted D2NN animation direction and continuous Serena narration. CPU image installation remains USER-PAUSED.
5. Actual development route this turn: Luna/low discovery; Sol/high release review and API/privacy repair; main scripts/resource fix; same ordinary Chat6Pro planning and corrected visual constraints. Main client settings were preserved. Native/main/browser costs are not fully metered; no full-chain saving percentage.

## Read first / evidence

- This handoff; relevant docs/OpenScience_Kimi_Development_Spec.md; docs/specs/2026-09-05-integrated-research-product-design.md; then latest section of docs/plans/2026-09-07-literature-recovery-workflow-plan.md. Do not resume old MVP Task2 or layout polishing before the minimum-flow blockers.
- Ignored evidence: apps/web/test/visual/out/token-smart-release/{real-paper-run.json,real-paper/checkpoint.json,real-paper/extraction-checkpoint.json,native-parser-replay.json}; reproducible helpers run-real-paper.mjs,inspect-task.mjs,replay-public-pdf.mjs. Preserve failed attempts when retrying.
- Local logs under C:/Users/Mac/AppData/Local/Temp/token-smart-checks/: preaccept1788778447440-aeaf3a4c-89f4-4659-adb9-ac3e4c8afc84; deploy1788778768188-ddef03fe-f00a-4cbb-b993-28d7229a2095; health1788779287297-b34ac338-9d1e-4b3f-a0c0-4eb58103cb5a; real-paper failure1788779301585-98b3e68e-c546-4570-b03b-b452807dd5f9 (all .log).
- Same ordinary Chat6Pro: https://chatgpt.com/c/6a9e7dac-e4c8-83ea-9857-4c52ad66c8ec. Web advice is advisory; local approved requirements overrode its initial static-card/video proposal.
- SSH only through root infra/scripts/ssh-run.sh/checkup.sh with explicit Git Bash. No env/Secret reads, no private session logs, no arbitrary production commands or cleanup. Fresh fetch/release/rollback checks before another deployment.
