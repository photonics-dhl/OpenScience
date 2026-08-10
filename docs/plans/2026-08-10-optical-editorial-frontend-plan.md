# OpenScience Optical Editorial Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic dark/card-based frontend with the approved Optical Editorial Instrument system, preserve verified production behavior, and deliver the complete researcher journey on ECS.

**Architecture:** Start from `codex/researcher-ingestion`, bring in the approved v3 documents, and replace presentation by vertical slice without rewriting verified domain/API behavior. Figma owns tokens, grids, components and state annotations; the browser owns typography, Canvas/WebGL optical media, Live2D and runtime quality. Each slice follows RED → GREEN → browser screenshot → server evidence.

**Tech Stack:** Next.js 14, React 18, TypeScript 5.5, Tailwind CSS 4/CSS variables, next-intl, Vitest, Playwright, Canvas 2D or a license-approved lightweight WebGL helper, existing Fastify/domain/storage/worker services, Docker Compose on Alibaba Cloud ECS.

## Global Constraints

- Visual authority: `docs/user_ideas/8.10/OpenScience_Art_Direction_v3.md`; product semantics: `docs/user_ideas/8.10/OpenScience_Design_Masterplan_v2.md`; requirements: `docs/OpenScience_Kimi_Development_Spec.md`.
- Never read or print `.env`; never commit credentials, tokens, production records or generated secrets.
- Server-first: local/worktree is for authoring and deterministic gates; ECS is the final browser, network, font, GPU and E2E acceptance environment.
- No destructive database reset, production-wide delete or removal of user files. Keep the previous deployment image/tag as rollback evidence.
- Preserve verified signup-code, session, upload, ingestion, OCR, ClamAV, SDF confirmation, version, publication and review contracts.
- All copy uses symmetric `apps/web/messages/zh.json` and `en.json` keys.
- WCAG AA, keyboard focus, semantic HTML, `prefers-reduced-motion`, poster fallback and mobile functional parity are blockers.
- Target LCP ≤ 2.5s; one page has at most one primary realtime visual effect.
- No decorative blue/purple gradient, space wallpaper, planet/black hole, symmetrical six-node ring, glass-card wall, large-radius grid or meaningless HUD.
- Every task updates `docs/progress.md`, `project_index.md`, current handoff and Task Master before commit.

## Planned File Boundaries

| Area | Responsibility |
|---|---|
| `apps/web/app/tokens.css` | Canonical v3 color, type, spacing, grid, depth and motion variables |
| `apps/web/app/globals.css` | Resets and temporary legacy compatibility only |
| `apps/web/components/brand/*` | Wordmark, optical headline and decorative media |
| `apps/web/components/shell/*` | Public, identity, dashboard and workspace shells |
| `apps/web/components/research/*` | ObjectHeader, SDFNode, EvidenceSnippet, ArtifactRow, VersionMarker and diff primitives |
| `apps/web/components/hermes/*` | Shared Hermes task state, rail and Live2D/static adapter |
| `apps/web/components/intake/*` | Local material selection, queue, roles and ingestion progress |
| `apps/web/components/explore/*` | Research Index and filter/search UI |
| `apps/web/components/editorial/*` | Collection and scoped Editorial Curator UI |
| `apps/web/lib/optical-field/*` | Pointer math, renderer adapter and reduced-motion fallback |
| `apps/web/test/*` | Unit/contract tests |
| `apps/web/test/e2e/*` | Real navigation and protected browser flows |
| `apps/web/test/visual/*` | Deterministic three-viewport capture and comparison |
| `scripts/seed-demo-research.mjs` | Idempotent, provenance-preserving launch corpus importer |

---

### Task 1: Establish the Production-Capable Visual-Rebuild Baseline

**Files:** Modify `docs/handoff/2026-08-10-optical-editorial-rebaseline-handoff.md`, `docs/progress.md`, `project_index.md`, `.taskmaster/tasks/tasks.json`.

**Interfaces:** Consumes `cbcb60c` on `codex/researcher-ingestion` and `b0b3969` on `main`; produces isolated `codex/optical-editorial-v3` with production ingestion plus approved design/plan documents.

- [x] Verify `git status --short`, `git worktree list` and both hashes; record unrelated dirty files without staging them.
- [x] Use `using-git-worktrees` to create `codex/optical-editorial-v3` from `codex/researcher-ingestion`.
- [x] Cherry-pick `b0b3969`; retain newer production evidence when resolving documentation-only conflicts.
- [x] Run `npx pnpm@9.15.0 --filter @openscience/database generate`, then `build`, `test`, `docs:lint` and `audit:docs-sync`; fresh worktrees have neither Prisma Client nor cross-package `dist` outputs before this order.
- [x] Commit only reconciliation changes: `docs: establish optical editorial execution baseline`.

### Task 2: Audit Community Dependencies and Implement V3 Foundations

**Files:** Modify `apps/web/app/tokens.css`, `globals.css`, `layout.tsx`, `apps/web/package.json`, `pnpm-lock.yaml`, `apps/web/test/tokens-contrast.test.ts`; create `docs/decisions/ADR-009-optical-runtime-and-fonts.md`, `apps/web/test/optical-foundations.test.ts`.

**Interfaces:** Produces `--os-black-0`, `--os-black-1`, `--os-paper`, `--os-ink`, `--os-vermilion`, `--os-confirmed`, `--os-rule-dark`, `--os-rule-paper`, motion and font-role variables.

- [x] Research current official repositories/registries for one lightweight displacement/halftone option and approved fonts; record license, runtime cost, SSR support, reduced-motion fallback and ECS requirements in ADR-009 (`ADR-005` was already assigned to public email registration).
- [x] Prefer Canvas 2D + CSS/SVG filters if they satisfy the contract; reject unpinned or hosted runtimes.
- [x] Add failing tests requiring v3 variables, forbidding decorative blue/violet tokens and asserting AA pairs.
- [x] Run `npx pnpm@9.15.0 --filter @openscience/web test -- tokens-contrast optical-foundations`; verify RED.
- [x] Implement monochrome/vermilion variables, 0/4/8px radius scale, typography roles and motion tokens; retain legacy aliases only while consumed.
- [x] Re-run focused tests and typecheck; commit `feat(web): establish optical editorial foundations`.

### Task 3: Build Shared Brand and Surface Shells

**Files:** Create `components/brand/OpenScienceWordmark.tsx`, `components/shell/{PublicShell,IdentityShell,DashboardShell,WorkspaceShell}.tsx`, `test/surface-shells.test.tsx`; modify favicon and both message catalogs.

**Interfaces:** Produces `OpenScienceWordmark({compact?, tone:'dark'|'paper'})` and shell components with one main landmark and skip-link target.

- [x] Write failing assertions for `OpenScience.` with separate vermilion stop, one `main`, focusable skip link and no `Card` dependency.
- [x] Verify RED with the focused test.
- [x] Implement wordmark, `O.` favicon and four rule/background-step shells; buttons use 8px radius and active press feedback.
- [x] Add symmetric i18n keys; run i18n, focused tests, typecheck and build.
- [x] Commit `feat(web): add optical editorial product shells`.

### Task 4: Enhance the Existing Landing Prototype with the Optical Editorial Medium

**Files:** Preserve and enhance `components/landing/{Hero,SiteHeader,LatestResearch,EvolutionPanel,HermesBand,TrustBand}.tsx`, `app/page.tsx`, `test/landing-page.test.tsx`; create `components/brand/{OpticalHeadline,OpticalField}.tsx`, `lib/optical-field/{field-model,canvas-renderer}.ts`; modify catalogs and `test/visual/shots.mjs`.

**Interfaces:** Produces `OpticalHeadline({locale,reducedMotion})`, pure `sampleOpticalField(pointer,viewport,now): OpticalSample`; Canvas stays `aria-hidden` and never owns text.

- [x] Write failing tests for real DOM English/Chinese headlines, Create/Explore routes, one vermilion marker, deterministic bounds and static reduced-motion mode.
- [x] Verify RED because the old symmetrical ring renders.
- [x] Implement asymmetric DOM typography first; pass static 1440×900 and 390×844 AI-slop review before Canvas.
- [x] Implement 160–200px pointer radius, 8–14px maximum visual displacement, 400–600ms recovery and ≤35% mobile density.
- [x] Follow-up optical text pass: keep the headline as selectable DOM text while adding pointer-local SVG displacement, chromatic focus, mask falloff and a vermilion focus ring from `OpenScience_Text_Distortion_Demo.html`.
- [x] Capture 1440×900, 1920×1080 and 390×844 normal/reduced motion; commit `feat(web): replace landing with optical editorial medium`.
- [x] Regression correction: restore the approved `80c8312` Optical Editorial composition, keep one semantic headline plus one decorative distortion layer, add glyph safety, frame-time interpolation, fixed slit diffraction and a complete paper `OPEN RO.` second screen; do not restore the v3-prohibited RO loop, orbit, video or card narrative modules.

### Task 5: Rebuild RO Workspace as Three Stable Work Planes

**Files:** Replace `components/editor/EditorLayout.tsx`; modify OutlinePanel, SuggestionsPanel, MobileTabs and `app/research-objects/[id]/edit/page.tsx`; create `components/research/{ObjectHeader,SDFNode,EvidenceSnippet,BeforeAfterProposal,ArtifactRow}.tsx`, `test/workspace-shell.test.tsx`; modify mobile tests.

**Interfaces:** Produces `19% / minmax(0,56%) / 25%` grid; ObjectHeader receives ID/title/version/visibility/save state/action; proposals require source, scope and review callback.

- [x] Write failing tests for one ObjectHeader, three desktop planes, six numbered SDF nodes, source-bearing proposals, collapsible evidence and mobile functional parity.
- [x] Verify RED; implement presentation without changing persistence calls.
- [x] Replace card/pill statuses with rules, weight and mono metadata; only the active node has vermilion.
- [x] Test keyboard order, 320px overflow, focus return and full-screen high-risk review.
- [x] Capture a real-shaped test RO through compiled API contracts; commit `feat(web): rebuild research object workspace`.

### Task 6: Rebuild Public RO as a Citable Paper Surface

**Files:** Replace `components/public/PublicVersionPage.tsx`; modify TabNavigation and both public routes; create `CitationRail.tsx`, `ProvenanceCaption.tsx`; modify public render/contract tests.

**Interfaces:** Preserves existing API fields; produces 760px reading column + 280px metadata rail and distinct continuing-RO/version citations.

- [x] Write failing tests placing identity/license/citation/Insight before deep tabs, requiring text SDF states and print landmarks.
- [x] Verify RED; implement paper surface and academic captions with no dark workspace frame.
- [x] Add print CSS retaining citation/provenance and removing interactive chrome.
- [x] Run contract/render/typecheck/build and capture desktop/mobile/print evidence.
- [x] Commit `feat(web): rebuild public research object reading`.

### Task 7: Integrate Auth into the Research Identity Experience

**Files:** Replace auth route pages; modify LoginForm/SignupCodeForm; create `ResearchIdentityPanel.tsx`; modify auth component and E2E tests while preserving `signup-live.spec.ts`.

**Interfaces:** Preserves `request-signup-code`, `confirm-signup`, `login`, `safeReturnTo` and cookies; supports standalone sign-in and Create-intent return.

- [x] Add failing tests for two-step code registration, compact fields, safe returnTo, standalone sign-in, retryable errors and focus transfer.
- [x] Verify RED; implement IdentityShell brand/form planes.
- [x] Run stubbed E2E and compiled Next + real Fastify signup E2E; require successful session assertion.
- [x] Capture desktop/mobile error and success; commit `feat(web): integrate research identity auth experience`.

### Task 8: Complete the Mixed-Material Evidence Intake

**Files:** Replace `app/research-objects/new/page.tsx`; create `components/intake/{EvidenceIntake,MaterialQueue,MaterialRoleSelect,IngestionProgress}.tsx`, tests and E2E; modify `lib/api.ts` only for reviewed contracts.

**Interfaces:** Produces `IntakeMaterial {localId,file,role:'manuscript'|'figure'|'data'|'code'|'supplement',primary,status,progress,artifactId?,taskId?,errorCode?}`; consumes existing upload/ingestion/OCR/ClamAV/confirmation routes.

- [x] Write failing tests for PDF/Word/TeX-ZIP/Markdown/image/data/code, one optional primary manuscript, pre-auth local-only state, per-file progress, retry and `needs_review`.
- [x] Verify RED; implement queue/roles without uploading before auth and explicit submit.
- [x] Bind real `scan → upload → parse/OCR → SDF map → review` states; never fake progress.
- [x] Add E2E for mixed batch, blocked file and OCR-to-review; commit `feat(web): complete evidence intake workflow`.

### Task 9: Rebuild Dashboard and Connect Hermes/Live2D to Tasks

**Files:** Replace Dashboard page; modify dashboard components; create `components/hermes/{HermesRail,HermesVisualAdapter,hermes-state}.ts(x)`, Hermes state tests; update Live2D README.

**Interfaces:** Produces `HermesVisualState = 'idle'|'guiding'|'scanning'|'suggesting'|'awaiting_approval'|'failed'`; visual and task entry share the same task/RO URL.

- [x] Write failing tests for one Continue Research action, row-based RO list, actionable confirmations, deep-link equality, approval stillness and static fallback.
- [x] Verify RED; implement without statistics hero or card grid.
- [x] Load one original Hermes visual instance after page load; keep the renderer boundary Live2D-compatible and require ADR-010 operator/license acceptance before any third-party binary is deployed.
- [x] Capture empty/loading/error/active/approval states; commit `feat(web): rebuild dashboard and hermes task guidance`.

Accepted 2026-08-11: Dashboard consumes caller-owned `IngestionTask` IDs through `GET /ingestion?actionable=true`; visual/queue deep links, six states, pointer gaze, approval/reduced stillness, empty/loading/error/active/approval browser evidence and the single original renderer pass. ADR-010 supersedes the unsafe assumption that the agent can accept Wanko terms for the operator; Wanko remains a replaceable licensed renderer and its binaries remain undeployed.

### Task 10: Deliver Explore and the Provenance-Safe Launch Corpus

**Files:** Create Explore route/components/tests; create or modify `apps/api/src/routes/explore.ts`, API registration/integration test; create `scripts/seed-demo-research.mjs`, `docs/data/launch-research-corpus.md`.

**Interfaces:** `GET /explore?query=&cursor=&limit=&field=&artifactType=` returns `{items:ResearchIndexItem[],nextCursor:string|null}`; seeder is idempotent by source identifier and never deletes.

- [x] Use `api-contract`, and `database-migration` only if schema change is necessary; run `security-review` before public exposure.
- [x] Curate six full Demonstration ROs and 12–18 index entries from license-compatible primary sources; record source, license, retrieval date and provenance.
- [x] Write failing API pagination/visibility and UI index/search/filter tests.
- [x] Implement the least backend surface and numbered editorial index, not cards/infinite social feed.
- [x] Run seed dry-run, then explicit non-destructive confirmation; commit `feat(explore): add research index and launch corpus`.

Checkpoint 2026-08-10: anonymous cursor API, numbered paper index, search/field/artifact filters, 6 complete + 12 lightweight verified-source records, default-dry-run idempotent seeder and desktop/mobile browser evidence pass locally. ECS backup/sync/confirmed seed/replay/live route verification completed: API 18 items, DB 18 demo ROs + 6 provenance artifacts, production HTTPS Explore and public RO 200 at desktop/mobile with no overflow or console errors. No schema change was required. Task 10 accepted; proceed to Task 11.

### Task 11: Deliver Ultrafast Science Collections and Editorial Curator

**Files:** Create Collection/Admin routes, editorial components/tests; create or modify `apps/api/src/routes/editorial.ts` and integration tests.

**Interfaces:** Selections bind `researchObjectId` + version and include selectedBy/selectedAt/note/media/schedule; scoped Editorial Curator never implies peer-review acceptance.

- [x] Use `api-contract`, `database-migration` and `security-review`; migration 26 is additive and has rollback.
- [x] Write failing scoped authorization, immutable snapshot and public-label tests.
- [x] Write failing UI tests for media provenance, ordering, preview and draft → internal review → scheduled → published.
- [x] Implement API/domain and both pages; local implementation checkpoint complete.

Checkpoint 2026-08-10: migration 26, immutable version-bound editorial selections, scoped curator APIs, public `/collections/[slug]` and curator `/editorial/curator` are implemented. Admin requests use the Nginx Basic Auth `/admin/editorial/*` prefix plus application role and CSRF. Domain 4/4, API 3/3, Web 1/1, typechecks and Next build pass. ECS migration and real admin→published flow remain before acceptance.

Accepted 2026-08-10: migration 26 and production build deployed after a 208K backup. A real public demo version completed all four states and produced four audit rows. Production collection/API/browser gates pass at 1440/390 with exact-version link, localized disclosure, zero overflow/errors; unauthenticated curator/admin requests return 401. Task 11 is complete.

### Task 12: Close Visual Consistency Across Remaining Product Surfaces

**Files:** Modify collaboration route/components, sandbox components and actual Versions/Collaboration/Publish routes found by audit; create `test/product-surface-matrix.test.ts`.

**Interfaces:** Produces a route/state matrix for Overview, SDF, Files, Versions, Collaboration, Publish, sandbox and settings where present.

- [x] Generate matrix from actual routes; fail if a route lacks surface, mobile, loading, empty, error and permission declarations.
- [x] Apply WorkspaceShell/research primitives without rewriting working business calls.
- [x] Replace placeholder/hard-coded copy with symmetric i18n.
- [x] Verify mobile parity and high-risk Review Changes; commit `feat(web): close optical editorial product surfaces`.

Accepted 2026-08-10: eight-surface route/state matrix, real Overview/Files/Versions/Publish/Sandbox/Settings routes and unified Collaboration/Editor navigation are deployed. Production browser acceptance with the test account passes at 390/1440 with navigation present, zero overflow and zero console errors. Deployment discovery also closed the Nginx `/auth/login` routing conflict, missing version-list API and next-intl dotted-key defect. Task 12 is complete.

### Task 13: Rebuild Figma Canonical Foundations and Component Mapping

**Files:** Modify ADR-004; create `docs/design/optical-editorial-figma-map.md`; update index.

**Interfaces:** Figma variables map 1:1 to tokens; runtime Optical Field remains browser-owned.

- [x] Verify long-term owner/canonical file before writes; never expose OAuth/session material.
- [x] Create `01 Foundations / V3 Optical Editorial`, typography specimen, grids, motion and reduced-motion notes.
- [x] Build structural frames/states for Landing, Workspace, Public, Auth, Dashboard, Intake, Explore and Collection.
- [x] Map only real components and document Code Connect limits without blocking delivery.
- [x] Compare Figma tokens, code tokens and browser screenshots; commit `docs(figma): register optical editorial canonical map`.

Accepted 2026-08-10: the long-term account owns the canonical file. The isolated V3 namespace contains 44 Web-scoped variables, 9 text styles, 3 effects, four real component sets and an eight-surface route/state matrix. Browser Canvas remains the Optical Field runtime truth; no static Figma layer is presented as the production interaction.

### Task 14: Install Visual, Accessibility and Performance Release Gates

**Files:** Replace visual shot script; modify Playwright config/CI; create accessibility/product-journey E2E and `docs/runbooks/visual-release.md`.

**Interfaces:** Captures 1440×900, 1920×1080 and 390×844 with deterministic Canvas clock/seed.

- [x] Write failing manifest tests requiring every canonical route/state/viewport and reduced-motion capture.
- [x] Implement deterministic screenshots with font readiness, network idle and stable demo IDs; never auto-update baselines on ordinary PRs.
- [x] Add keyboard landmark/focus, reduced-motion and LCP/bundle/runtime measurements.
- [x] Run test, E2E, typecheck, build, lint, docs gates, knip, dependency, duplication and dependency-version audits.
- [x] Perform full-width and 390px AI-slop/manual aesthetic gate; commit `test(web): install product visual release gate`.

Accepted 2026-08-10: 27 production-build browser cases cover eight canonical surfaces at 1440×900, 1920×1080 and 390×844, plus Landing reduced motion at all three sizes. Each case gates one `main`/`h1`, horizontal overflow, form names, keyboard focus, browser errors, DOM/transfer/LCP budgets and deterministic Canvas time. Full tests, typecheck, build, lint and the release E2E pass. Knip and dependency-cruiser still report explicitly documented pre-existing repository debt; this change adds no new finding and does not silently auto-update visual evidence.

### Task 15: Deploy Directly to ECS and Prove the Complete Journey

**Files:** Modify deployment runbook, progress, index and current handoff.

**Interfaces:** Consumes immutable images; produces server evidence and rollback tag.

- [x] Cloud-sync from the isolated worktree without `.env`, credentials, screenshots or unrelated files.
- [x] Build the release on ECS, verify no migration change and record the prior rollback ref/source hash.
- [x] Recreate only required services; verify health, TLS, API, worker, ClamAV and storage.
- [x] Execute landing → sign-in → Dashboard → mixed Intake → parse/review → Hermes confirm → Workspace → version → publish-ready → Public RO → Explore → Ultrafast Science.
- [x] Capture canonical server desktop/mobile evidence and reuse the Task 14 reduced-motion/keyboard/performance budgets against the identical release hash.
- [x] On blocker, rollback and keep status in-progress; never label partial production complete.
- [x] Synchronize Task Master/docs and commit `docs: record optical editorial production acceptance`.

Accepted 2026-08-11: `f5bb6e7` was synced from the isolated worktree, built on ECS and activated through the project deployment script after a 232K database backup. The prior deployed Optical Field hash matched rollback ref `53d5cbf`; the new remote hash matches the local release. The current production topology still uses pinned base/worker images with bind-mounted built application code rather than per-release immutable Web/API images, so the verified Git ref + source hash is the rollback anchor. Real-account browser acceptance passed seven authenticated RO surfaces, three-format ingestion to three `needs_review` tasks, Hermes confirmation and version creation; the synthetic object was intentionally left publish-ready rather than polluting the public index. Existing published demo RO, Explore and Ultrafast Science routes all return 200 at desktop/mobile with zero overflow or browser errors.

## Completion Definition

Complete only when Tasks 1–15 are `done`, Task Master dependencies match this plan, the ECS journey passes against real services, and the user approves deployed Landing, Workspace and Public RO at desktop and mobile sizes. A successful build or Figma file alone is not completion.
