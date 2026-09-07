# Hermes Research Intelligence CURRENT Handoff

> CURRENT active-memory, 2026-09-07 +08. User authorized PRD v1.1 implementation, GitHub push and server deployment. Current plan: docs/plans/2026-09-07-open-research-publication-plan.md. Preserve original Aladdin dog/Wanko and lamp. Never infer aesthetic approval from passing checks.

## Version tuple

- Current checkout D:/02-work/学术茶话会/OpenScience; branch codex/open-research-publication; record/UI candidate99793fd, not deployed. Fresh18:53 +08 checkup: application/public/loopback5e4b4d47cba918db5a9b7f7092de32aa244c258e; rollback8e4ecb2b5f9e291385b0df8495082e923af328a6. Later docs HEAD is not another app release.
- Previous application5e4b4d4 was pushed and deployed. Current publication branch is awaiting GitHub login and has not been deployed. Root checkout contains unrelated user changes; leave untouched.
- Independent Codex controller3d518af1433e4e1e91de0ebbb0d9a12d4bedfa52 and animated D2NN demo9848411d1419a0dd690f74cca9042369b651f7b2/run9848411-20260906T074017Z unchanged.

## Shipped entry continuity

- Applied frontend-design, ui-ux-pro-max and baseline-ui using approved pale/ink/teal direction. The local skill search recommends flat/minimal interfaces but its marketing-video layout was rejected as unsuitable for authentication. No new dependencies or skills installed.
- IdentityShell and new auth/Identity.module.css center a compact form with original Wanko welcome, explicit input/primary/secondary styles, readable headings and mobile form-first order. Short bilingual identity copy replaces the old slogans. Original image uses next/image with a circular CSS frame.
- SignupCodeForm keeps required name/email/password prominent; optional ResearchProfileFields stays mounted inside native details, same reader default and parent state. Verification, validation, cooldown, session, safeReturnTo and all auth handlers unchanged.
- Shared surface-product-app palette now applies to DashboardShell routes, including dashboard/new/settings/me. Clear active navigation, consistent control/focus treatment, aligned account values. This is shared styling, not a claim that every page layout has been redesigned.
- Dashboard removes visible internal identifiers/redundant index caption. Reuses LiteratureAcquisitionDisclosure; recovered dashboard task opens it. Two existing browser tests now expand the disclosure and scope the full-text action.

## Preserved RO corrections

-69aac51 fixed black Wanko: destroying a model also destroyed Pixi URL-cached atlases used by its successor. Keep fixed atlas cache; dispose instance model/renderer/GL. Original Wanko/lamp image is loading/failure fallback.
- RO overview/editor/presentation use shared A palette and four main tabs plus More. Empty overview has Add paper/Hermes; editor initializes missing SDF keys without losing extensions. Original evidence remains distinct from approved generated explanatory assets.
-8e4ecb2 reserves380px companion area on wide presentation pages and stacks below content on smaller screens; real RO context and drawer retained. Storyboards collapse by title. These earlier fixes remain in current release.

## Fresh acceptance

- Current exact server full build, parser16 acceptance, core36/search2 migration status (none pending), BGE real-vector/runtime, ScanSci image/tools/storage/worker and healthy containers passed. Public/loopback200, egress204 via parent proxy. No new model, migration or paid generation.
- Auth/dashboard37 unit checks, modified-file lint, final local Web build, docs checks passed. Existing browser fixtures:2 literature recovery/full-text plus3 keyboard signup/failure retry/login-return cases passed with API fixtures.
- Final public login/register:8 zh/en ×1440/390 visual checks, image decoded/no horizontal overflow/password toggle; no registration submission. Final public dashboard/new/settings/me:8 read-only checks at1440/390 using controlled user;0business writes/session closed. Actual screenshots inspected. Full business-pipeline and CI completion not claimed.
- Evidence ignored under apps/web/test/visual/out/research-journey/: entry-{sync,prebuild,deploy,final-checkup}.log, entry-public-{auth,product}.log, entry-shots.json, entry-product-evidence.json and entry-*.png. Early next-dev screenshot rerenders made interaction smoke unstable; final production-mode and public checks passed. A next/image assertion was corrected to decode URL escaping.
- Local8318 production-mode preview built from current app source remains available; older8317 preview is stale. Never print cookies/session headers, env values or raw private logs.

## Remaining / next action

- Task1 approved0822515 (76 domain/8 API); Task2 approved99793fd (528 Web unit/18 browser, build/typecheck/lint). Task3 frozen per-RO API in progress, then full review/test/exact-SHA deploy. Draft graph remains mutable; Task3 must persist fixed record metadata, not mislabel it. Ledger ignored under .superpowers/sdd/2026-09-07-open-research-publication-plan/progress.md.
- GitHub push awaiting local Git Credential Manager login; user notified. Linux release-contract baseline137/137 passed. Local Web525 passed plus source-art after Chromium install. No production switch yet; do not declare full PRD complete.
- Continue route-specific layout/interaction refinement and actual paper-to-RO/media/evidence workflow; whole site and automatic multimodal pipeline remain incomplete. User has not yet accepted this visual iteration. Do not repeat the login omission or equate shared color changes with complete page redesign.
- Known PDF method/results/reproducibility extraction and Evidence/SourceMap gaps remain. Existing RO Files/Hermes literature disclosures can keep internally recovered tasks collapsed when no initialTask is supplied; this pre-existing issue was not introduced or fixed here.
- Preserve Serena continuous v4, restored animated D2NN, Chromium/FFmpeg/PyTorch/Qwen/Codex. CPU image installation remains USER-PAUSED. Codex still depends on PC/v2ray/account access and quotas (ADR-013).
- Controlled private user11b6cf52-fcd4-4f7d-a3ff-8ea3ae9592fd (Hermes Production E2E), workspacef09ab567-4dcd-4d53-97b3-9a96920fd1ed, RObcbf1586-b6bd-44b6-ab66-c675fcddce78. Do not advertise as a user-accessible demo.
- Read-first: Git/fetch/checkup, this handoff, relevant baseline and latest integrated plan section. Use explicit Git Bash SSH wrappers and canonical deployment; no env/Secret reads.
