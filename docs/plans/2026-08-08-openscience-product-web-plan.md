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

## Task 1: Figma Foundations and Six-Screen Prototype

**Files / artifacts:**
- Create/update Figma file: `web-design-system.fig`（Figma Professional workspace）
- Modify: `apps/web/app/tokens.css`, `apps/web/app/globals.css`（仅在 token 对齐验证发现差异时）
- Create: `docs/decisions/ADR-003-figma-code-connect-design-source.md`
- Modify: `project_index.md`, `docs/progress.md`
- Test: `apps/web/test/tokens-contrast.test.ts`, Figma variable audit checklist

**Interfaces:**
- Consumes: approved product spec, existing token names, shadcn primitives, current Hero/Editor/Public RO screenshots.
- Produces: Figma variables, component names, six clickable screens and Code Connect mapping that later tasks consume.

- [ ] **Step 1: Build the Figma variable inventory**
  Mirror color, type, spacing, radius, elevation, motion and z-index tokens from `apps/web/app/tokens.css`. Use the existing token names as the canonical variable names; do not introduce a second naming scheme.
- [ ] **Step 2: Create component families**
  Map Button, Card, Badge, Input, Dialog, Tabs, RO Card, SDF Node, Artifact Card, Review Row, Version Diff and Hermes Rail to existing or newly approved `apps/web/components/ui/*` primitives.
- [ ] **Step 3: Prototype the six screens**
  Create clickable flows for Landing, Auth/Create, Dashboard, RO Workspace, Public RO and Ultrafast Science Collection. Include empty, loading, error, success, permission and reduced-motion notes.
- [ ] **Step 4: Configure Code Connect**
  Connect Figma components to exact exports in `apps/web/components/ui/*`; document any component whose API must change before implementation.
- [ ] **Step 5: Validate design-source parity**
  Compare Figma variables to `tokens.css`, run `npx pnpm@9.15.0 test -- apps/web/test/tokens-contrast.test.ts`, and record any approved deviations in ADR-003.
- [ ] **Step 6: Review six-screen prototype**
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

