# OpenScience Product Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Each task ends with an independent verification gate.

**Goal:** 将已批准的 OpenScience 产品级网页设计落地为统一的 RO 研究工作流、公共研究页、Ultrafast Science 策展层和 Hermes/Live2D 入口，并用 Figma、Playwright、WCAG 和性能门禁形成可持续交付链。

**Architecture:** 复用现有 Next.js App Router、`apps/web/components/{landing,editor,public,collab}` 和 `packages/domain` 的 RO/SDF/协作/发布能力。前端以统一 RO 对象上下文和 URL 模式承载 Dashboard、Workspace、Public RO 与 Collection；Hermes 与 Live2D 只共享一套任务、权限、确认和版本状态。Figma variables/tokens 与 `apps/web/app/tokens.css` 对齐，视觉回归作为每个入口的验收边界。

**Tech Stack:** Next.js App Router、React、TypeScript、next-intl、Tailwind v4、现有 shadcn primitives、Fastify API、Vitest、Playwright、Figma Professional Dev seat + remote MCP、CSS/IntersectionObserver 动效、现有 Live2D 集成边界。

## Global Constraints

- 需求基线唯一来源：`docs/OpenScience_Kimi_Development_Spec.md`。
- 产品设计依据：`docs/specs/2026-08-08-openscience-product-web-design.md`；视觉细节依据 `docs/specs/2026-08-06-frontend-visual-system-design.md`。
- 深色工作区/Landing 与纸白 Public RO/期刊页是两套表面，不得混用颜色、阴影或阅读密度。
- RO unique ID 是长期唯一身份；已发布版本不可变，review、artifact、引用和策展记录同时保留 RO ID 与版本锚点。
- 未明确成果再利用许可证时，允许平台内阅读、引用、评论、审阅和版本链接；禁止默认外部转载、改编和商业使用。
- Hermes 不得把推断伪装成事实；AI 输出必须保留模型、提供商、时间、输入范围和人工确认状态。
- Live2D 是 Hermes 的另一入口，不得创建第二套会话、权限或版本状态；高风险动作必须显示变更摘要并确认。
- 移动端保持功能 parity，满足 WCAG AA、键盘可达、语义 HTML、alt/字幕和 `prefers-reduced-motion`。
- 命令统一使用 `npx pnpm@9.15.0`；不读取或打印 `.env`；不删除现有资产，弃用文件需先登记并获批准。
- 每个任务完成后运行相关测试，并同步 `docs/progress.md`、`project_index.md` 和 task-master 状态。

---

## Task 1: Visual Master, Figma Foundations and Six-Screen Prototype

**Files / artifacts:**
- Create/update Figma file: `web-design-system.fig`（Figma Professional workspace）
- Create: `scripts/design/minimax-client.mjs`, `scripts/design/minimax-client.test.mjs`
- Create: `scripts/design/prompt-manifest.mjs`, `scripts/design/prompt-manifest.test.mjs`
- Modify: `scripts/design/generate-minimax-image.mjs`, `scripts/design/generate-minimax-image.test.mjs`
- Create/update: `docs/design-assets/prompts/2026-08-08-living-research-observatory-v1.md`
- Create/update: `docs/design-assets/generated/`（保留获批源图、poster、视频及安全 sidecar；被拒绝资产仅在已有 provenance 且项目禁止删除时登记保留）
- Modify: `apps/web/app/tokens.css`, `apps/web/app/globals.css`（仅在 token 对齐验证发现差异时）
- Create/update: `docs/decisions/ADR-004-figma-account-ownership-and-migration.md`
- Modify: `project_index.md`, `docs/progress.md`
- Test: `apps/web/test/tokens-contrast.test.ts`, `scripts/design/{minimax-client,prompt-manifest,generate-minimax-image}.test.mjs`, Figma variable audit checklist

**Interfaces:**
- Consumes: approved product spec §11.1–11.3, existing token names, shadcn primitives, current Hero/Editor/Public RO screenshots and existing generated figure references.
- Produces: a reviewed Living Research Observatory visual master, provenance-bearing static concept asset, Figma variables, component names, six clickable screens and Code Connect mapping that later tasks consume.

- [x] **Step 1: Build the Figma variable inventory**
  Mirror color, type, spacing, radius, elevation, motion and z-index tokens from `apps/web/app/tokens.css`. Use the existing token names as the canonical variable names; do not introduce a second naming scheme.
- [x] **Step 2: Lock the visual master before component expansion**
  Build one Figma master board spanning three surfaces: a dark Landing/workbench slice, a paper-white Public RO slice and a compact Ultrafast Science editorial slice. Reuse the six-node RO symbol, RO unique ID, blue evidence trajectory and orange diff mark; include real-looking metadata fields, version anchors and artifact provenance labels. The board must pass the 3-second comprehension test (“one evolving research object”), must not use purple gradients/space backgrounds/opaque pseudo-text, and must show how one RO moves between all three surfaces.
- [x] **Step 3: Write the failing MiniMax key-routing tests**
  Add Node `node:test` cases for `chooseAssetKey` and `isQuotaExhausted`: key1 is selected first; only MiniMax `base_resp.status_code=1008` or an explicitly documented balance/quota error selects key2; 1002 rate limit, 1004/2049 auth, 1026 safety, 2013 invalid parameters and network errors do not silently switch keys; missing both keys fails with a redacted diagnostic.
- [x] **Step 4: Run the key-routing tests and verify RED**
  Run `node --test scripts/design/minimax-client.test.mjs`. The new tests must fail because the routing helpers do not exist yet; fix test setup errors until the failure is specifically about the missing helpers.
- [x] **Step 5: Implement the minimal asset client**
  Implement an injected-fetch client for `POST https://api.minimax.io/v1/image_generation` with model `image-01`, `aspect_ratio`, `response_format=url`, and one prompt per call. Load environment values only through the Node process environment (`node --env-file=.env`); never read, print or log `.env`. Return `{ keySlot, requestId, imageUrls, model }`, and redact all thrown errors. Keep the fallback classifier separate from HTTP transport so tests do not need network access.
- [x] **Step 6: Run the routing tests and verify GREEN**
  Run the client and CLI tests again; then run one live generation with a versioned output path under `docs/design-assets/generated/`. Persist the exact prompt, model, region, key slot, request ID, generation timestamp, post-processing and intended surface in a sidecar file without the key value or remote signed URL. Completed through the China-region endpoint with key1; `openscience-observatory-v1.png` and its sanitized sidecar exist, and the combined test suite passes 14/14.
- [x] **Step 7.1: Write failing prompt-manifest and provenance tests**
  Add `scripts/design/prompt-manifest.test.mjs` with a Markdown fixture containing `## MiniMax Prompt` and `## Negative Prompt`. Assert that `buildImagePrompt(markdown)` returns both sections in order and throws `Prompt manifest is missing MiniMax Prompt or Negative Prompt` when either section is absent. Extend `generate-minimax-image.test.mjs` to assert that the CLI rejects a missing `--prompt-file` or `--intended-surface` before credential/network work. The MiniMax image API has no separate `negative_prompt` field, so both sections must become one `prompt` string; official field reference: <https://platform.minimax.io/docs/api-reference/image-generation-t2i>.
- [x] **Step 7.2: Run the new tests and verify RED**
  Run `node --test scripts/design/minimax-client.test.mjs scripts/design/prompt-manifest.test.mjs scripts/design/generate-minimax-image.test.mjs`. Expected: FAIL because `prompt-manifest.mjs`, `--prompt-file` and required `--intended-surface` do not exist. No test may load `.env` or make a network request.
- [x] **Step 7.3: Implement prompt-file loading and truthful provenance**
  Create `scripts/design/prompt-manifest.mjs` with a pure `buildImagePrompt(markdown)` function that extracts the first fenced text block below each required heading and returns `${positive}\n\nConstraints to avoid:\n${negative}`. Modify the CLI to read only the explicit `--prompt-file`, require `--intended-surface`, pass the combined string as the API `prompt`, and persist the caller-provided intended surface in the safe sidecar. Keep `--prompt` unsupported for this design workflow so the approved Markdown remains the single source of truth.
- [x] **Step 7.4: Run the prompt/client suite and verify GREEN**
  Run the same three-test command. Expected: all tests PASS with zero network calls. Then run `git diff --check` and scan the staged diff for key values, signed URLs, credential identifiers and signature query parameters. Commit the client slice before any paid generation.
- [x] **Step 7.4a: Add the provider prompt-length contract with TDD**
  Add tests to `scripts/design/prompt-manifest.test.mjs` proving the final combined prompt accepts exactly 1499 characters and rejects 1500 with `Combined MiniMax image prompt must be fewer than 1500 characters`. The rejection must happen before credential or network work. Implement the smallest validation in `prompt-manifest.mjs`, rerun the 21-test baseline plus the new boundary cases, review and commit before another live call.
- [x] **Step 7.4b: Compress and approve the v2 prompt**
  Reduced the final combined payload from 2018 to 1440 characters while preserving the approved four-zone composition, generated/native responsibility boundary, no-orange rule and prohibited semantic geometry. The user approved the exact revised text; the API was not called during this step.
- [x] **Step 7.5: Generate one v2 China-region background**
  The first call stopped on official status 2013 because the combined prompt was 2018 characters; it produced no file and did not switch keys. After Steps 7.4a–7.4b pass, confirm `docs/design-assets/generated/openscience-evidence-chamber-v2.png` and its sidecar do not exist, then run one explicit recovery command from the isolated worktree:

  ```powershell
  node --env-file=E:/Miscellaneous/XGS/.env scripts/design/generate-minimax-image.mjs --region cn --aspect-ratio 16:9 --prompt-file docs/design-assets/prompts/2026-08-08-living-research-observatory-v1.md --intended-surface "Landing / Workspace dark hero ambient background" --output docs/design-assets/generated/openscience-evidence-chamber-v2.png
  ```

  Expected: key1 succeeds, or key2 is used only after official status `1008`. Any auth, parameter, safety, rate-limit, network or server error stops the step without automatic retry or prompt mutation.
- [x] **Step 7.6: Inspect the raw background against all eight gates**
  Open the PNG at original resolution and verify every item in the approved v2 prompt document: quiet left 0–40%, no semantic geometry, one light direction, no orange/text/data/UI, seamless `#03060b` edges, no competing focal point and safe 390×844 crop. Verify the sidecar contains model/region/key slot/time/intended surface but no remote URL or query parameter. A single failure marks v2 rejected and blocks Figma/video.
  Result: the key1 CN call produced a valid 1280×720 PNG and safe sidecar, but the image failed gates 1, 3, 5, 6 and 7 and the no-particles/centered-subject/rectangular-vignette constraints. Retain it as a rejected exploration; Step 7.7 and video remain blocked pending a newly approved v3 direction.
- [x] **Step 7.7: Build and review the native composite**
  Only after the raw background passes, import it into Figma `03 Patterns` behind the existing exact RO asset. Add native artifact summaries, blue evidence path, one orange version change, RO ID and version anchors. Capture desktop 1440×900 and mobile 390×844 frames; require the 3-second reading “different research materials enter one continuously evolving RO.” User approval completes Step 7.
  Current gate: v2 raw background was rejected, so it cannot be imported. A read-only audit confirms the existing layered `Hero.tsx`, deterministic SVG/Playwright generator, RO loop/poster and Figma master `37:2` can support a fully native deterministic composite. No further paid generation is authorized.
  The user selected route 1 and approved product design spec §11.4 with exact desktop/mobile composition, seven native layers, one-shot motion timeline and ten rejection gates. Figma implementation is now authorized; web implementation remains gated on approval of the two Figma screenshots.
  Completion evidence (2026-08-08): native masters exist in `03 Patterns` at wrapper `60:2`, desktop `60:7` and mobile `60:8`. The desktop uses an editable evidence-ledger RO; the mobile is an independent reflow with a vertical PAPER/DATA/CODE ingress. Structural audit passed for fonts, image-fill absence, placeholders, semantic bounds, touch targets and one-diff-only. Local evidence: `docs/design-assets/figma/2026-08-08-native-v3-{desktop,mobile}.png`. The user explicitly confirmed both screenshots; Step 8 component families are unlocked, while web implementation remains gated on the later six-screen prototype review.
- [ ] **Step 8: Create component families**
  Map Button, Card, Badge, Input, Dialog, Tabs, RO Card, SDF Node, Artifact Card, Review Row, Version Diff and Hermes Rail to existing or newly approved `apps/web/components/ui/*` primitives.
  Checkpoint (2026-08-08): Card, Badge and Input first batch is present in Figma `02 Components` under wrapper `76:7`; family sets are `Card` (`76:25`, 2 contexts), `Badge` (`76:44`, 4 variants × 2 contexts) and `Input` (`76:61`, 3 states × 2 contexts). Local screenshot: `docs/design-assets/figma/2026-08-08-step8-core-primitives-v1.png`. Structural audit passed and the user explicitly confirmed the batch; Dialog/Tabs/RO Card second batch is unlocked.
  Second checkpoint (2026-08-08): Dialog (`78:33`, 2 surfaces), Tabs (`78:116`, 4 active values × 2 contexts) and RO Card (`78:173`, 3 states × 2 contexts) are present under wrapper `78:7`. Tabs is explicitly marked as a code gap for a future shared `ui/tabs.tsx`; Dialog only exposes the existing `surface` contract; RO Card establishes a new domain contract. Screenshot: `docs/design-assets/figma/2026-08-08-step8-navigation-domain-v1.png`. Structural audit passed and the user explicitly confirmed this batch; SDF Node/Artifact Card/Review Row are unlocked.
  Third checkpoint (2026-08-08): SDF Node (`82:67`, 4 states × 2 contexts), Artifact Card (`82:112`, 3 types × 2 contexts) and Review Row (`82:151`, 3 statuses × 2 contexts) are present under wrapper `82:7`. SDF blocked uses `state-danger`; Review Needs changes uses `state-danger`; no accent-diff orange is used in this batch. Screenshot: `docs/design-assets/figma/2026-08-08-step8-research-workflow-v1.png`. Structural audit passed and the user explicitly confirmed this batch; Version Diff and Hermes Rail are unlocked.
- [ ] **Step 9: Prototype the six screens**
  Create clickable flows for Landing, Auth/Create, Dashboard, RO Workspace, Public RO and Ultrafast Science Collection. Include empty, loading, error, success, permission and reduced-motion notes.
- [ ] **Step 10: Add the approved motion master**
  After the raw background and native composite are both approved, decide whether generated motion is still necessary. If approved, call the current official H3 video API for a fixed-camera 5–6 second loop containing only one low-light cool reflection moving left-to-right and fading behind the native RO; if the account lacks H3 access, record the official error before considering Hailuo 2.3. RO geometry, blue path, SDF response, version anchors and orange diff remain native CSS/SVG/Figma animation. Store poster, video, prompt and safe provenance together; `prefers-reduced-motion` uses the approved static background.
- [ ] **Step 11: Configure Code Connect**
  Connect Figma components to exact exports in `apps/web/components/ui/*`; document any component whose API must change before implementation.
- [ ] **Step 12: Validate design-source parity**
  Compare Figma variables to `tokens.css`, run `npx pnpm@9.15.0 test -- apps/web/test/tokens-contrast.test.ts`, and record account ownership, migration and approved source deviations in ADR-004.
- [ ] **Step 13: Review six-screen prototype**
  Capture desktop and mobile frames, verify the full create-to-public flow is clickable, then update docs-sync files and commit the design-source baseline.

## Task 2: Unified Dashboard and RO Workspace Shell

**Files:**
- Create: `apps/web/app/dashboard/page.tsx`
- Create: `apps/web/app/research-objects/[id]/workspace/page.tsx`
- Create: `apps/web/components/dashboard/ResearchCockpit.tsx`, `NextActionPanel.tsx`, `SampleResearchCard.tsx`, `TaskInbox.tsx`
- Create: `apps/web/components/workspace/RoWorkspaceShell.tsx`, `WorkspaceModeNav.tsx`, `WorkspaceContext.tsx`, `HermesRail.tsx`
- Modify: `apps/web/components/editor/EditorLayout.tsx`, `apps/web/components/editor/MobileTabs.tsx`, `apps/web/components/collab/NotificationsPanel.tsx`
- Tests: `apps/web/test/dashboard.test.tsx`, `apps/web/test/workspace-shell.test.tsx`, `apps/web/test/mobile.test.ts`

**Interfaces:**
- Consumes: existing RO/SDF/editor/collab routes and the Task 1 component contract.
- Produces: stable RO context (`roId`, `versionId`, `workspaceId`, `mode`, `permission`) consumed by Hermes, Public RO links and future editorial tooling.

- [ ] **Step 1: Write failing Dashboard tests**
  Assert that a verified user sees `创建研究对象`, a clearly labeled read-only sample, recent RO continuation, and actionable tasks; assert that sample data cannot be mistaken for user data.
- [ ] **Step 2: Implement Dashboard cockpit**
  Render next action first, then current RO progress, task inbox and secondary metrics. Support empty, loading, error and no-invite/waitlist states without social-feed noise.
- [ ] **Step 3: Write failing workspace shell tests**
  Assert all six modes, stable RO/version context, permission-aware actions, desktop rail and mobile bottom navigation.
- [ ] **Step 4: Implement unified shell**
  Wrap existing editor/collab pages with the shared RO shell; preserve independent URLs while keeping mode, version and Hermes context continuous.
- [ ] **Step 5: Add responsive and accessibility behavior**
  Use bottom navigation and Hermes bottom sheet on mobile, semantic landmarks, focus restoration, keyboard navigation and full-screen high-risk confirmations.
- [ ] **Step 6: Verify**
  Run `npx pnpm@9.15.0 test -- apps/web/test/dashboard.test.tsx apps/web/test/workspace-shell.test.tsx apps/web/test/mobile.test.ts`, then capture 390×844 and 1440×900 screenshots.

## Task 3: Create Flow, Hermes Evidence, Versioning and Task Center

**Files:**
- Create: `apps/web/app/research-objects/new/page.tsx`
- Create: `apps/web/components/create/CreateResearchWizard.tsx`, `InputSourceStep.tsx`, `HermesConsentStep.tsx`, `SdfPreviewStep.tsx`, `PublishPreflight.tsx`
- Create: `apps/web/components/hermes/HermesEvidencePanel.tsx`, `HermesActionConfirm.tsx`, `HermesTaskStatus.tsx`
- Create: `apps/web/components/versions/VersionSummary.tsx`, `VersionDiffView.tsx`
- Modify: existing RO/SDF API clients and i18n messages under `apps/web/messages/{zh,en}.json`
- Tests: `apps/web/test/create-flow.test.tsx`, `apps/web/test/hermes-evidence.test.ts`, `apps/web/test/version-flow.test.ts`

**Interfaces:**
- Consumes: RO/SDF/commit/version APIs, AI Gateway task metadata and Task 2 RO context.
- Produces: draft RO, evidence-bearing SDF preview, immutable version save, publish preflight result and resumable task-center entries.

- [ ] **Step 1: Write failing create-flow tests**
  Cover title + paste, blank six-field path, explicit Hermes consent, no silent publish, and waitlist users remaining read-only.
- [ ] **Step 2: Implement guided hybrid wizard**
  Support title plus pasted material or blank SDF; do not expose unsupported file inputs. Show data use, visibility, provider, retention and deletion information before processing.
- [ ] **Step 3: Write failing evidence tests**
  Assert each SDF field renders source excerpt, confidence state (`confirmed`, `needs_confirmation`, `missing`, `inferred`), model metadata and editable draft state.
- [ ] **Step 4: Implement Hermes evidence and confirmation**
  Save provenance with the AI task result; require explicit confirmation for high-risk writes; allow continuous draft collaboration only after user opt-in.
- [ ] **Step 5: Implement draft/version semantics**
  Autosave drafts; `保存版本` creates an immutable snapshot with version note; continue-evolution creates a new draft linked to the stable RO ID; diff view shows SDF/artifact/permission/license changes.
- [ ] **Step 6: Implement publish preflight and task center**
  Block only missing title, author, visibility, version, Insight or Method; present other fields as recommendations. Long jobs show resumable stages, failure reasons and retry without duplicate version creation.
- [ ] **Step 7: Verify**
  Run the three focused Vitest suites, then `npx pnpm@9.15.0 typecheck` and `npx pnpm@9.15.0 lint`.

## Task 4: Public RO, Explore and Artifact Provenance

**Files:**
- Modify: `apps/web/app/research/[publicId]/page.tsx`, `apps/web/app/research/[publicId]/v/[versionNo]/page.tsx`
- Create: `apps/web/components/public/RoIdentityHeader.tsx`, `SdfStory.tsx`, `ArtifactProvenance.tsx`, `ReviewTimeline.tsx`, `CitationActions.tsx`, `VisibilityNotice.tsx`
- Create: `apps/web/app/explore/page.tsx`, `apps/web/components/explore/ResearchFeed.tsx`, `FilterBar.tsx`, `RoCard.tsx`
- Modify: `apps/web/components/public/TabNavigation.tsx`, `apps/web/components/public/PublicVersionPage.tsx`
- Tests: `apps/web/test/public-ro.test.tsx`, `apps/web/test/explore.test.tsx`, `apps/web/test/artifact-provenance.test.ts`

**Interfaces:**
- Consumes: stable RO ID/version APIs, artifact metadata, review/citation endpoints and Task 1 paper-white surface.
- Produces: indexable public RO identity pages, fixed-version citation targets, feed-first Explore and provenance-bearing media UI.

- [ ] **Step 1: Write failing Public RO tests**
  Assert identity-first ordering, six-node SDF story, deep tabs, version/RO dual citations, noindex for private/invite-only records and visible `许可待定` state.
- [ ] **Step 2: Implement Public RO identity layer**
  Keep RO facts separate from journal overlays; show title, authors, ID, version/status, Insight/conclusion, visibility, license and citation actions before deep content.
- [ ] **Step 3: Implement SDF and artifact layers**
  Render each node with source/evidence links; media cards show poster first, provenance, generator/model/prompt metadata when publishable, alt text and click-to-play video behavior.
- [ ] **Step 4: Implement review/version presentation**
  Show RO-level discussion plus version anchors, author responses, resolved/contested states and historical snapshot links.
- [ ] **Step 5: Implement Explore feed**
  Provide curated/public feed-first layout, RO cards, progressive filters/search, loading/error/empty states and external index controls.
- [ ] **Step 6: Verify**
  Run focused tests, `npx pnpm@9.15.0 build`, then Playwright screenshots for public RO and Explore at desktop and mobile widths.

## Task 5: Ultrafast Science Editorial Curator and Collections

**Files:**
- Create: `apps/web/app/admin/editorial/page.tsx`, `apps/web/app/admin/editorial/[collectionId]/page.tsx`
- Create: `apps/web/components/editorial/CandidateQueue.tsx`, `EditorialChecklist.tsx`, `SelectionComposer.tsx`, `CollectionPreview.tsx`, `EditorialStatusBadge.tsx`
- Create: `apps/web/app/collections/ultrafast-science/[...slug]/page.tsx`
- Create: `apps/web/components/collections/JournalFrame.tsx`, `IssueHierarchy.tsx`, `SelectedWorkCard.tsx`
- Modify: `packages/domain/src` editorial role/policy modules and existing publication route registration where API support is missing
- Tests: `apps/web/test/editorial-curator.test.tsx`, `apps/web/test/ultrafast-collection.test.tsx`, API contract tests for scoped role checks

**Interfaces:**
- Consumes: Public RO identity, artifact provenance, review states, publication records and the new scoped `Editorial Curator` permission.
- Produces: candidate-to-selection workflow, journal/volume/issue/section hierarchy, editorial overlay and author claim behavior.

- [ ] **Step 1: Write failing authorization tests**
  Assert curator access is limited to assigned journal channels and cannot mutate author/platform/security permissions; assert all high-impact publishes are audited.
- [ ] **Step 2: Implement editorial queue and checklist**
  Support completeness, license, media and primary-visual checks; allow structured editor note, selection reason, section/order/schedule and preview.
- [ ] **Step 3: Implement collection hierarchy and public frame**
  Render `journal → volume/issue → section → selected work`, plus cross-issue thematic collections; preserve RO identity and display `Selected by Ultrafast Science` as an overlay.
- [ ] **Step 4: Implement status transitions**
  Enforce `draft → internal review → scheduled → published`, with audit records and no silent removal; keep editorial selection separate from community review.
- [ ] **Step 5: Implement author claim path**
  Let an authorized author claim a future RO evolution without mutating the published snapshot or curation history.
- [ ] **Step 6: Verify**
  Run focused UI/API tests, permission negatives, and public collection screenshots at desktop/mobile widths.

## Task 6: Hermes/Live2D Bridge, Quality Gates and Production Acceptance

**Files:**
- Create/modify: `apps/web/components/hermes/Live2DEntry.tsx`, `HermesSessionBridge.tsx`, `HermesModeState.ts`
- Modify: existing Live2D public asset/loading boundary under `apps/web/public/hermes/` and workspace layout integration
- Modify: `apps/web/test/visual/shots.mjs`, create `apps/web/test/visual/baselines/` and comparison runner
- Create: `apps/web/test/accessibility/*.spec.ts`, `apps/web/test/performance/*.spec.ts`
- Modify: `.github/workflows/ci.yml`, `project_index.md`, `docs/progress.md`, relevant Task Master records

**Interfaces:**
- Consumes: Task 2 workspace context, Task 3 Hermes task/confirmation model, Task 4 media loading, Task 5 editorial high-risk states.
- Produces: one Hermes session projected as DOM rail and Live2D avatar, five viewport screenshot matrix, accessibility/performance CI gates and production acceptance evidence.

- [ ] **Step 1: Write failing bridge tests**
  Assert Live2D and Hermes rail read/write the same session, RO ID, version and permission state; assert reduced-motion and editor/review quiet modes.
- [ ] **Step 2: Implement session bridge**
  Create a single state adapter with explicit action intents; Live2D emits intents, DOM rail renders semantic controls and high-risk actions route through shared confirmation dialogs.
- [ ] **Step 3: Add screenshot matrix**
  Extend Playwright captures for Landing, Dashboard, Workspace, Public RO, Collection and Explore at 320×568, 375×667, 768×1024, 1440×900 and 1920×1080. Keep dynamic content deterministic.
- [ ] **Step 4: Add accessibility and performance gates**
  Check keyboard/focus/landmarks/contrast, `prefers-reduced-motion`, LCP ≤ 2.5s, poster-first media, lazy video/Live2D and no layout shift from dynamic controls.
- [ ] **Step 5: Integrate CI comparison**
  Compare PR screenshots against approved baselines with documented thresholds; fail on meaningful diffs and publish artifacts for review.
- [ ] **Step 6: Run production acceptance**
  Execute `npx pnpm@9.15.0 build && npx pnpm@9.15.0 typecheck && npx pnpm@9.15.0 lint && npx pnpm@9.15.0 test`; perform manual create-to-public, version evolution, review, journal selection and mobile flows; update docs and task statuses only with evidence.

## Coverage and Decomposition Notes

- Task 1 is design-source setup and can complete before code changes.
- Tasks 2–3 form the private research workflow and should be implemented in order.
- Task 4 is independently testable as the public reading/discovery surface.
- Task 5 depends on Public RO contracts but can be deployed behind the scoped curator role.
- Task 6 is the final integration and quality gate; it must not be used to hide missing behavior from Tasks 2–5.
- Existing Task Master items 10–12 map primarily to Tasks 1, 4 and 6; update their details/status rather than creating duplicate tasks.
