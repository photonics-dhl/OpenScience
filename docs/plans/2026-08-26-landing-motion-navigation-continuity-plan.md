# Landing Motion and Product Navigation Continuity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the approved Landing water motion across releases and give every real product surface an obvious route back into the OpenScience research workflow.

**Architecture:** Keep the approved `AcceptedOpticalSurface` rendering and its motion values unchanged; promote the existing final-composite browser assertion into the canonical product release gate so deployment can no longer prove only DOM presence. Add one shared, i18n-backed product navigation component to the existing Folio shells, while retaining `ResearchWorkspaceNav` as the contextual second level inside a Research Object. Landing keeps its existing `SiteHeader` markup and Hermes source/assets are out of scope.

**Tech Stack:** Next.js 14 App Router, React 18, next-intl, Tailwind CSS 4, Playwright 1.62, Vitest 2, existing OGL 1.0.11 optical runtime.

## Global Constraints

- Do not change Hermes components, Hermes assets, actor sizes, speech, menus, actions or motion.
- Do not redesign Landing or alter the approved `.05/6px/10s` ambient and `5px/10px/.18/.20/700ms` pointer contracts.
- Use only existing warm-paper, ink, graphite and vermilion tokens; no gradients, glow, glass, pills or card-grid navigation.
- Internal navigation uses `next/link`, visible labels, clear `aria-current`, keyboard focus and at least 44px mobile targets.
- Primary workflows remain available at 320px and 390px; no destination may be hidden only because the viewport is narrow.
- All user-facing copy is present in both `apps/web/messages/en.json` and `apps/web/messages/zh.json`.
- No API, database, migration, permission or research-data changes.

---

### Task 1: Make visible Landing motion a release invariant

**Files:**
- Modify: `apps/web/test/e2e/product-release.spec.ts`
- Modify: `apps/web/test/visual/product-release-manifest.mjs`
- Reuse: `apps/web/test/visual/shots.mjs`

**Interfaces:**
- Consumes: `[data-accepted-optical-surface="landing"]`, `#landing-optical-diagnostics`, and `window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__`.
- Produces: a normal-motion release assertion that fails if the canvas is missing, ambient phase is stationary, the final composed title does not change visibly, pointer response remains zero, or recovery does not return to rest.

- [x] **Step 1: Write the failing release assertion**

  Extend the Landing normal-motion case to assert one interaction canvas, `data-render-mode="asset-interactive"`, increasing ambient phase, three final-composite samples with the approved visibility floor, a non-zero pointer beat and exact recovery. Keep the reduced-motion case static and canvas-free.

- [x] **Step 2: Verify RED for missing normal-motion contract coverage**

  The manifest contract test first failed because normal Landing cases had no `visible-optical` contract; the final browser assertion then proved canvas ownership, moving final composite, pointer response and recovery.

- [x] **Step 3: Keep production optical code unchanged**

  The production runtime already meets the approved contract. No shader, amplitude, plate, CSS or renderer change is permitted unless the fresh normal-motion test proves a real runtime failure.

- [x] **Step 4: Verify GREEN locally and inspect the current public release**

  Run the focused release case against a production build and then with `WEB_BASE_URL=https://openscience.428312321.xyz`. Record canvas ownership, phase progression, visible final-composite delta, pointer response and recovery.

### Task 2: Add a shared global research-route navigation

**Files:**
- Create: `apps/web/components/navigation/ProductRouteNavigation.tsx`
- Modify: `apps/web/components/shell/ShellPrimitives.tsx`
- Modify: `apps/web/components/shell/DashboardShell.tsx`
- Modify: `apps/web/components/shell/IdentityShell.tsx`
- Modify: `apps/web/components/research/ResearchSurfaceShell.tsx`
- Modify: `apps/web/app/dashboard/page.tsx`
- Modify: `apps/web/app/settings/page.tsx`
- Modify: `apps/web/app/research-objects/new/page.tsx`
- Modify: `apps/web/messages/en.json`
- Modify: `apps/web/messages/zh.json`
- Test: `apps/web/test/surface-shells.test.tsx`, `apps/web/test/landing-page.test.tsx`

**Interfaces:**
- Consumes: the active route supplied by each shell page and the existing `ShellHeader` action/utility slots.
- Produces: `ProductRouteNavigation` with destinations `/dashboard`, `/explore`, `/research-objects/new` and `/settings`, plus `aria-current="page"` for the active destination.

- [x] **Step 1: Write failing navigation contracts**

  Render the shared component and real Dashboard, create, settings and Research Object shells. Assert all four destinations are real links, the active route is exposed semantically, internal destinations use Next links, and the existing object-mode navigation remains present.

- [x] **Step 2: Run focused Vitest and confirm RED**

  Run `npx pnpm@9.15.0 --filter @openscience/web test -- product-navigation.test.tsx` and confirm the component/import is missing.

- [x] **Step 3: Implement the minimal shared navigation**

  Use one ruled text row with no individual cards or pills. Desktop labels are `Research desk`, `Explore`, `New research`, `Settings`; compact labels are `Desk`, `Explore`, `New RO`, `Settings`, with equivalent Chinese copy. Product headers use a two-row narrow-screen layout so every destination is visible without horizontal discovery.

- [x] **Step 4: Integrate it into every authenticated Folio shell**

  Dashboard, creation, settings, loading/error states and every Research Object surface receive the shared first-level navigation. `ResearchWorkspaceNav` remains the second-level object workflow. Existing user identity and locale controls remain available without duplicating Settings.

- [x] **Step 5: Run focused tests and verify GREEN**

  Re-run the navigation contract and the existing auth/dashboard and product-surface suites.

### Task 3: Close public-reading and editorial dead ends

**Files:**
- Modify: `apps/web/app/research/[publicId]/page.tsx`
- Modify: `apps/web/app/research/[publicId]/v/[versionNo]/page.tsx`
- Modify: `apps/web/app/collections/[slug]/page.tsx`
- Modify: `apps/web/app/editorial/curator/page.tsx` or its shared admin surface as appropriate
- Modify: `apps/web/components/editorial/EditorialCollection.tsx`
- Modify: `apps/web/test/surface-shells.test.tsx`, `apps/web/test/landing-page.test.tsx`

**Interfaces:**
- Consumes: existing `PublicShell`, paper-tone `SiteHeader`, and the existing public reading/collection content.
- Produces: public pages that always expose Home/Explore/Create/Login through the existing public visual language and safe exits from unavailable states.

- [x] **Step 1: Add failing public-route assertions**

  Assert public RO latest/version pages, collections and unavailable states expose `/`, `/explore`, `/research-objects/new` and `/auth/login` without adding a second `main` or replacing the publication typography.

- [x] **Step 2: Verify RED**

  Run the focused navigation test and confirm current public RO/collection markup has no shared page-level route navigation.

- [x] **Step 3: Wrap public surfaces with the existing paper PublicShell**

  Preserve exactly one `main`, publication measure and section tabs. Place the public route navigation above the reading surface; use the same wordmark, rule weight, tokens and focus treatment as Explore. Role-restricted curator/admin links remain role-specific and are never exposed from public navigation.

- [x] **Step 4: Verify GREEN**

  Run public page tests, collection tests and SSR route checks.

### Task 4: Browser review, regression gates and deployment

**Files:**
- Modify: `apps/web/test/e2e/product-release.spec.ts`
- Modify: `apps/web/test/visual/product-release-manifest.mjs`
- Modify: `docs/progress.md`
- Modify: `docs/handoff/2026-08-16-hermes-2d-pet-handoff.md`
- Modify: `docs/specs/2026-08-24-research-folio-product-system-design.md`
- Modify: `docs/superpowers/specs/2026-08-14-optical-water-flow-refinement-design.md`
- Modify: `project_index.md`

**Interfaces:**
- Consumes: the product route matrix at desktop, 390px and 320px; immutable deployment scripts.
- Produces: full-size screenshots and geometry/focus/runtime evidence that the water motion remains visible, navigation is reachable, Landing composition is unchanged and Hermes behavior is unchanged.

- [x] **Step 1: Add browser navigation assertions**

  Verify every primary real route has a route out, active location is clear, keyboard Tab reaches the links in visual order, 320/390px have no clipped or lost destination, browser Back remains native, and Research Object mode links keep their deep URLs.

- [x] **Step 2: Run local gates**

  Run focused tests, full Web tests, typecheck, root lint, 19-page production build, product release matrix, `git diff --check`, docs sync and docs lint.

- [x] **Step 3: Review full-size screenshots**

  Inspect Landing idle/pointer, Dashboard, create, settings, object workspace, public RO and collection at desktop and mobile. Reject any pill row, clipped label, double navigation landmark, content overlap, typography shrink or unexpected Landing/Hermes visual change.

- [x] **Step 4: Deep review in the primary session**

  Review correctness, navigation/accessibility, product visual continuity and scope protection. Current session policy prohibited spawning reviewers, so architecture and adversarial passes were completed sequentially in the primary session; the discovered 390px clipping and loading/error dead ends were fixed and re-verified.

- [x] **Step 5: Prepare immutable release and request cloud-write confirmation**

  Commit a clean candidate, record application/release/rollback refs, run dry-run and checkup. Do not execute the confirmed deployment until the user authorizes the cloud write.

- [x] **Step 6: Deploy and verify production**

  After confirmation, run backup and the canonical immutable deployment with `--skip-migrate`; verify server full build, 27 migrations current, target container health, runtime dependencies, exact `/__release`, absent failure marker, rollback tree, public route status, Landing normal/reduced motion and no-write cross-page navigation E2E.
