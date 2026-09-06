# Hermes Research Intelligence CURRENT Handoff

> CURRENT active-memory, 2026-09-06 +08. Administrator Hermes → Codex scene-image generation is deployed and verified by a real task. Fixed D2NN video has the revised mechanism illustration and byte-identical accepted narration. Global Hermes presentation actions are deployed at b23102b and a real revision passed; a confirmation-button contrast correction is pending. Generic RO video generation remains open.

## Version tuple

- Worktree E:/Miscellaneous/XGS/.worktrees/readable-hermes-guidance; branch codex/product-workflow-design; application source/origin-main b23102b071ae715d738aa37504a838d2f3fc78f1; subsequent documentation HEAD is obtained from Git.
- Production active/public/loopback b23102b071ae715d738aa37504a838d2f3fc78f1; rollback3d518af1433e4e1e91de0ebbb0d9a12d4bedfa52. PR98 merged; PR CI34014496625 succeeded, main CI34015117654 succeeded.
- Independent demo source7e1b6ea29ada1e4abb5fd24bb71aab4dd65abb98, run7e1b6ea-20260906T044500Z; /demos/science-video/d2nn/?v=codex-mechanism-v1. Demo and application identities are separate.
- Root checkout and user uncommitted files untouched. Start with Git/fetch/checkup/actual release, then this handoff, baseline relevant sections and current design/plan. Do not restore old MVP next actions.

## Product decisions and delivered behavior

- Prioritize usable features and visual demonstrations; reuse mature solutions and existing capabilities. RO condenses a paper; generated art explains mechanisms; original figures/code belong to Evidence and are not automatic proof. No uploaded audio/video understanding yet.
- PDF → Hermes confirmation → editor retains original attachment → human Claims → conceptual diagram is deployed. Method/results/reproducibility extraction still has three gaps; do not claim complete automatic paper understanding.
- Reviewed PNG/MP4 import uses administrator plus workspace writer permissions, exact draft version/Claims, provenance/audit and idempotency. Private media supports playback/Range. Claim changes reject linked assets; restoring text does not restore approval.
- Presentation workbench has media-first desktop/mobile layout, full contain, collapsed provenance and visible task errors. RO-local Hermes creates/revises/compares/approves sourced storyboards in zh/en with watercolor/technical/ink directions.
- Storyboards use selected current Claims/conditions/limits, not original Evidence/SourceMap. Current approved control storyboard74ef00f4-be7e-4a95-9256-c22dbee7ad33 has six scenes; its mechanism index3 differs from demo mechanism index2.
- Existing presentation.generate remains administrator-only for scene images. It charges1AI Credit per task, rechecks permissions/draft/Claims/parent before model and before Serializable asset creation, and leaves output draft. No new public endpoint or migration.

## Codex integration delivered

- Explicit HERMES_SCENE_IMAGE_PROVIDER=codex selects Gateway codex-image; API/Worker match. MiniMax remains the default when selection is absent. No automatic image retry/fallback. M3 still plans the drawing brief; Codex generates the raster.
- Host openscience-codex-image systemd service uses source 3d518af1433e4e1e91de0ebbb0d9a12d4bedfa52 under /opt/openscience-codex/releases; bundle is independent of app release retention. Worker mounts inbox RW/results RO only; private claimed/started state is not mounted.
- Pinned CLI0.153.0 and existing Node/FFmpeg images reused. Network-none UID1000 model reaches only private Unix socket proxy → Squid → SSH/v2ray. Only chatgpt.com/auth.openai.com443 allowed; model never gets host networking/Docker socket/production secrets.
- Device account auth stays nested RO; fresh caches/work are writable. Input is1000:1000/0400. Bounded one-at-a-time task protocol and durable started marker prevent repeated CLI invocation after restart. Separate FFmpeg contains/pads to1280×720; Gateway validates bytes.
- Private task/asset4661e80a-526e-4a4a-8b11-47359e9c1f6b succeeded in66.103s Gateway image time. Exact approved parent/index3 and3Claims, draft,1task/1attempt/0retry/1Credit/1generation audit/1Codex image audit independently verified.
- Spool result prompt hash matches asset; exactly1raw PNG, normalized1298085bytes; temporary model/proxy/normalizer containers removed by runner. Nested internal image-tool count and per-image dollars are not independently measured; cost/token fields null.
- zh/en ×1440/390 render/decode1280×720, no overflow, authenticated PNG200, anonymous401 and session logout passed. Image visually inspected; it remains a conceptual draft, not experimental data or approved scientific evidence.

## Demo and fresh acceptance

- Third demo scene uses the sparse-wavefront illustration from previous controlled server run. Source artwork, narration WAV and narration JSON compare byte-identical to accepted continuous Serena v4.
- Server render39.101s,991frames,41.292s,2532823bytes; complete decode/faststart true. Actual AAC stream SHA256 matches old video exactly:2f5f144657fbbe27a23ff1d37e2c01ecb121640b169bd0560705aef2dcc077cf. No new TTS/paid call for rendering.
- Public video1280×720/41.291667s, third-scene screenshot visually checked,390px no overflow and Range206 passed. The demo is fixed D2NN, not arbitrary RO-to-video automation.
- Workspace build/typecheck/lint/test and CI passed; final runner10 tests include complete runtime import. Final source ECS full build, Parser16 exact-source/image acceptance, core36/search2 current, BGE real vectors, ScanSci runtime/OA, container and public checks passed. Canonical transaction/retention completed with no journal/failed/pending markers.
- Server installation exposed two issues before any model task: missing package export and root-owned input under umask0027. Both reproduced, fixed and independently reviewed; current install preflights full runtime before stopping old service. Old failed bundles retained.
- One deploy attempt hit local EPIPE before transaction; source integrity/old release/no-journal confirmed, canonical retry succeeded. Exact root cause of that transport failure is unproven.

## Evidence and constraints

- Controlled private identity: user11b6cf52-fcd4-4f7d-a3ff-8ea3ae9592fd; workspacef09ab567-4dcd-4d53-97b3-9a96920fd1ed; RObcbf1586-b6bd-44b6-ab66-c675fcddce78; version57d10269-2ba7-4eaa-88fc-622a00d20ef5. Do not present its link as the user's accessible demo.
- Evidence ignored under apps/web/test/visual/out/science-video/: codex-scene-browser-evidence.json, codex-scene-audit-evidence.json, codex-spool-audit.log, codex-scene-artwork.png, codex-final-parser-prebuild.log, codex-final-deploy-resume.log, codex-final-checkup.log, codex-video-browser-evidence.json, codex-video-audio-hashes.log.
- CPU image download remains USER-PAUSED; about1.1GB partial files retained, no complete model. Earlier MiniMax trials failed scientific visual criteria; do not describe their composition changes as a validated MiniMax quality improvement.
- Preserve accepted Serena v4 audio; reuse existing Chromium/FFmpeg/PyTorch/Codex runtime. Do not reinstall Tailscale, read/print env/auth/cookies/private model logs, or expose account-backed Codex as a public general execution endpoint.
- Evaluation still depends on user's PC/v2ray staying online and account quota. Account refresh requiring auth writes needs operator login maintenance. Broader public rollout needs supported provider/account terms and stable egress; ADR-013 records this boundary.

## Global Hermes acceptance / contrast correction

- Local Drawer prepares bounded zh/en create/revise/image actions; exact current RO/version, succeeded Claims, approved-image capability, visible style/locale and1Credit confirmation reuse existing API/task page. RO/version resets discard preparation; ambiguous same-owner retries preserve key. No provider/backend/schema additions.
- Local workspace build/typecheck/lint/test passed; final web514 tests and presentation browser15 passed, including exact revision/no preconfirm POST/ambiguous same-key retry/success cleanup/published version/image capability/query switch/390px. Evidence: ignored global-hermes-*.log. Additional Hermes regression14 and independent architecture/security review passed. Exact server build/parser/runtime/migrations/health/retention passed. Real task0f50d797-4340-4ce8-9307-1268ea5610a5 produced6 scenes with3 source Claims, preserved the approved parent,1 execution/0 retry/1Credit/1 generation audit; M3 13.374s,1540 input/924 output tokens. zh/en at1440/390 and logout passed. Server screenshot then exposed an undefined ink-paper background token; the confirmation-button contrast fix has a reproduced red test, final browser3/build/lint/docs and independent token review passed; its CI/deployment remain pending.

## Next action / read-first

- Present current video and automatic scene-image result for user visual/scientific acceptance. Finish the confirmation-button contrast correction, then generalize the existing CPU renderer to approved RO storyboards; keep each result reviewable.
- Improve the three PDF extraction gaps and original Evidence/SourceMap grounding; do not conflate BGE embedding with document parsing/chunk design or proof generation.
- Coworker release/profile-settings-20260904 tip93bb160 has identity interactions overlapping current main; no clear missing hunk identified in this read-only check. Merge conflicts were not tested. Existing daily frontend check remains; do not duplicate automation.
- Read docs/OpenScience_Kimi_Development_Spec.md relevant chapters; docs/specs/2026-09-05-integrated-research-product-design.md; docs/plans/2026-09-05-integrated-research-product-plan.md; ADR-013; docs/runbooks/science-video-demo.md.
