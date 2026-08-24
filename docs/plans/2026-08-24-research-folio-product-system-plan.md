# Research Folio Product System Implementation Plan

> **Execution target:** `codex/hermes-wanko-live2d` in `E:/Miscellaneous/XGS/.worktrees/readable-hermes-guidance` only. Landing is explicitly out of scope. Deploy with `--skip-migrate` after local and server gates.
> **Status:** Tasks 1–9 COMPLETE; Task 10 local gates/review/docs COMPLETE for application source `eb55820ee67d00b0924797ccbbd1db395412f07a`. Production remains `33418fdf9e4c13cd3e34eba0a15f6f0208fc5183`, rollback `2abfe42e56881ae7b7a3e7f0a0b3a97b31762326`; immutable deployment is next.

**Goal:** Replace the fragmented instrument-black treatment on every real non-Landing route with the approved Research Folio system, make the primary research workflow readable and self-explanatory, and guarantee that anchored Hermes never covers product content.

**Architecture:** Establish locale-aware typography and semantic surface tokens at the root, then migrate the three existing shared shells (`IdentityShell`, `DashboardShell`, `WorkspaceShell`) rather than styling routes independently. Route families consume shared folio primitives for page context, workflow state, decisions and evidence. Hermes keeps one provider and one interaction implementation, but its anchored state is rendered in page-owned layout space; fixed positioning is reserved for deliberate detached dragging.

**Tech stack:** Next.js 14 App Router, React 18, TypeScript, Tailwind CSS 4 plus existing global semantic tokens, next-intl, Radix Context Menu/Dialog, Vitest and Playwright.

---

## Task 1: Lock the product-system contract in tests

**Files:**

- Modify: `apps/web/test/visual-release-gate.test.ts`
- Modify: `apps/web/test/visual/product-release-manifest.mjs`
- Create: `apps/web/test/research-folio-contract.test.ts`
- Test: `apps/web/test/research-folio-contract.test.ts`

1. Add failing static contracts asserting that the real product route families use the three shared folio shells, the root loads the approved reading serif, and Landing does not opt into the product shell.
2. Expand the release manifest to identity, Dashboard, RO creation, editor/review, overview, files, versions, collaboration, publish, sandbox, settings, explore, collection and public reading at desktop and mobile sizes.
3. Add assertions for a current workflow state and one visible next action per primary route fixture.
4. Run `npx pnpm@9.15.0 --filter @openscience/web test -- research-folio-contract.test.ts visual-release-gate.test.ts` and retain the first intentional failure.
5. Commit the failing contract tests.

## Task 2: Establish Research Folio foundations

**Files:**

- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/app/tokens.css`
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/components/shell/ShellPrimitives.tsx`
- Modify: `apps/web/components/shell/IdentityShell.tsx`
- Modify: `apps/web/components/shell/DashboardShell.tsx`
- Modify: `apps/web/components/shell/WorkspaceShell.tsx`
- Create: `apps/web/components/shell/ResearchFolioPrimitives.tsx`
- Test: `apps/web/test/research-folio-contract.test.ts`

1. Load `Source Serif 4` through `next/font`, wire it to `--font-source-serif`, and keep Noto Serif SC as the CJK reading face.
2. Add scoped `surface-folio`, `surface-folio-sheet` and `surface-graphite-tool` roles using existing OpenScience colors. Do not change Landing selectors.
3. Convert shared shell borders, skip links, header tone and focus treatments from dark defaults to folio roles.
4. Add small reusable primitives for route context, workflow path, attention marker and decision boundary; avoid cards, pills and marketing heroes.
5. Make headings, prose, controls and metadata follow the approved minimum sizes and locale-aware letter-spacing rules.
6. Run the focused unit contracts, typecheck and lint for the touched package; make them green.
7. Commit the foundation.

## Task 3: Repair Hermes ownership and collision geometry

**Files:**

- Modify: `apps/web/components/hermes/HermesWorkspaceStage.tsx`
- Modify: `apps/web/components/hermes/HermesDockAnchor.tsx`
- Modify: `apps/web/components/hermes/HermesPerformanceBubble.tsx`
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/test/hermes-companion-placement.test.ts`
- Modify: `apps/web/test/e2e/hermes-workspace-stage.spec.ts`
- Modify: `apps/web/test/e2e/hermes-field-guide.spec.ts`
- Create: `apps/web/test/e2e/hermes-folio-geometry.spec.ts`

1. Write failing unit and Playwright tests proving the anchored actor, message, menu and protected content rectangles never intersect at desktop, compact and 390px mobile sizes.
2. Render the anchored stage inside the registered page-owned anchor. Preserve the exact 360px desktop and 200px compact/mobile actor relationship and reserve note space separately.
3. Keep Hermes anchored while guiding a field: mark and focus/scroll the target; do not move the actor across inputs. Only deliberate drag enters fixed detached mode.
4. Place speech inside the companion margin, cap it to a short readable note and remove visual treatments that compete with research text.
5. Keep right-click, Shift+F10, Menu key, long press, ordinary-click drawer and focus-return behavior on existing Radix primitives.
6. Remove non-semantic gradients/blur, left/top geometry transitions and unconditional `will-change`; add reduced-motion coverage.
7. Run Hermes unit tests and the three focused browser specs until green.
8. Commit the geometry fix.

## Task 4: Migrate identity, Dashboard and RO creation

**Files:**

- Modify: `apps/web/app/auth/login/page.tsx`
- Modify: `apps/web/app/auth/register/page.tsx`
- Modify: `apps/web/app/dashboard/page.tsx`
- Modify: `apps/web/app/research-objects/new/page.tsx`
- Modify: relevant `apps/web/messages/en.json`
- Modify: relevant `apps/web/messages/zh.json`
- Modify: `apps/web/test/e2e/auth-dashboard.spec.ts`
- Modify: `apps/web/test/e2e/hermes-dashboard.spec.ts`
- Modify: `apps/web/test/e2e/hermes-blank-ro-flow.spec.ts`

1. Add failing browser assertions for form-first identity screens, active-work-first Dashboard hierarchy, explicit creation steps, inline errors and unobscured controls.
2. Recompose identity routes around a compact trust note and immediately visible form; expose return destination and registration progress.
3. Recompose Dashboard first viewport as active RO/open task, primary continuation, attention queue, new research and index. Integrate Hermes into the research margin instead of a separate stage.
4. Move RO creation into the Research Desk shell with `Research identity → Evidence source`, explicit blank/import choice and a manifest row hierarchy.
5. Preserve all handlers, validation, APIs, auth transitions and i18n keys; improve wording only where it clarifies consequence or next step.
6. Run focused browser specs at desktop and mobile and inspect screenshots at full size.
7. Commit the primary-flow migration.

## Task 5: Migrate editor, review and all object work surfaces

**Files:**

- Modify: `apps/web/components/research/ResearchSurfaceShell.tsx`
- Modify: `apps/web/components/research/ObjectHeader.tsx`
- Modify: `apps/web/components/research/ResearchWorkspaceNav.tsx`
- Modify: `apps/web/app/research-objects/[id]/edit/page.tsx`
- Modify: `apps/web/app/research-objects/[id]/overview/page.tsx`
- Modify: `apps/web/app/research-objects/[id]/files/page.tsx`
- Modify: `apps/web/app/research-objects/[id]/versions/page.tsx`
- Modify: `apps/web/app/research-objects/[id]/collab/page.tsx`
- Modify: `apps/web/app/research-objects/[id]/hermes/page.tsx`
- Modify: `apps/web/app/research-objects/[id]/publish/page.tsx`
- Modify: `apps/web/app/research-objects/[id]/sandbox/page.tsx`
- Modify: `apps/web/test/e2e/workspace-readability.spec.ts`

1. Add failing assertions for readable center-folio measure, visible save/version state, non-overlapping mobile plane switcher, and evidence/actions that remain reachable.
2. Convert the workspace shell to warm outline and evidence rails with a strong paper center plane. Retain graphite only inside code, diff and raw evidence modules.
3. Keep object/version/save state together, reduce tab and caption tracking, and make mobile plane switching explicit and safe-area aware.
4. Make overview the workflow map; files the manifest; versions the immutable timeline; collaboration the decision queue; publish the R3 checklist; sandbox the contained graphite exception.
5. Attach AI proposals to their SDF field and show provenance and human decision boundaries without generic assistant cards.
6. Place Hermes in a reserved research-margin region on supported work surfaces; editor/approval feedback remains quiet.
7. Run workspace/Hermes focused tests and full-size desktop/mobile screenshot review.
8. Commit the workspace migration.

## Task 6: Migrate discovery, public reading, settings and editorial administration

**Files:**

- Modify: `apps/web/app/explore/page.tsx`
- Modify: `apps/web/app/collections/[slug]/page.tsx`
- Modify: `apps/web/app/research/[publicId]/page.tsx`
- Modify: `apps/web/app/research/[publicId]/v/[versionNo]/page.tsx`
- Modify: `apps/web/app/settings/page.tsx`
- Modify: `apps/web/app/editorial/curator/page.tsx`
- Modify: `apps/web/app/admin/editorial/page.tsx`
- Modify: relevant shared public/editorial components and messages discovered by targeted imports
- Modify: `apps/web/test/e2e/explore-index.spec.ts`
- Modify: `apps/web/test/e2e/product-release.spec.ts`

1. Add failing first-viewport and typography assertions for search-first Explore, readable public prose, visible provenance/version state, ordinary settings rows and data-first admin tables.
2. Remove product-route editorial heroes. Put search/filter, result integrity and current curation reason before decorative narrative.
3. Raise public reading body and metadata sizes, constrain measure, and make mobile section navigation non-obscuring.
4. Keep Hermes absent from public reading unless the product already exposes an explicit assistant action; do not introduce new autonomous behavior.
5. Run affected browser tests at desktop and mobile, inspect full-page and first-viewport screenshots, and commit.

## Task 7: Whole-product accessibility, localization and regression gate

**Files:**

- Modify: `apps/web/test/e2e/product-release.spec.ts`
- Modify: `apps/web/test/visual/product-release-manifest.mjs`
- Modify: any route/component failing the gate

1. Test Chinese and English representative routes at 1440px, 1024px, 390px and 320px.
2. Assert no horizontal overflow, clipped action, fixed-content collision, obscured focus or text below the product minimums.
3. Exercise keyboard menu, drawer focus return, long press, form failure, mobile plane switching and reduced motion.
4. Run `npx pnpm@9.15.0 --filter @openscience/web test`, `typecheck`, `lint`, `build`, then the release and Hermes browser gates.
5. Review generated screenshots at native size and fix systemic defects in shared foundations before route-specific exceptions.
6. Commit the complete product migration.

## Task 8: Review, documentation sync and production deployment

**Files:**

- Modify: `docs/specs/2026-08-19-hermes-wanko-live2d-design.md`
- Modify: `docs/progress.md`
- Modify: `docs/handoff/2026-08-16-hermes-2d-pet-handoff.md`
- Modify: `project_index.md`

1. Run architecture, security and product-design diff review; fix material findings and repeat affected gates.
2. Synchronize the approved Research Folio spec, this plan, Hermes spatial decisions, progress, CURRENT handoff and index without reading or modifying archives.
3. Confirm the exact deploy candidate SHA, production `/__release`, rollback SHA/tree and clean failure marker state.
4. Deploy through `infra/scripts/deploy.sh <candidate-sha> --skip-migrate`; do not run migrations, seeds or production write fixtures.
5. Collect server build, migration status, target container health, runtime dependency loading, `/health`, `/__release`, public route screenshots and no-write authenticated smoke evidence.
6. Compare the deployed login, Dashboard, RO creation, editor and public reading screenshots to the local accepted set. Roll back on any blocking geometry, runtime or release-marker failure.
7. Report changed files, fresh validation, deployed SHA, rollback point, public URLs and any remaining non-blocking risk.

## Task 9: Make Hermes speech visibly originate at the mouth

**Files:**

- Modify: `apps/web/components/hermes/HermesPerformanceBubble.tsx`
- Modify: `apps/web/components/hermes/HermesVisualAdapter.tsx`
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/messages/en.json`
- Modify: `apps/web/messages/zh.json`
- Modify: `apps/web/test/hermes-performance-bubble.test.tsx`
- Modify: `apps/web/test/hermes-state.test.tsx`
- Modify: `apps/web/test/e2e/product-release.spec.ts`

- [x] Add a failing component contract proving performance speech and companion-action feedback expose one sentence without a tone/speaker label, shortcut, toolbar or rectangular status treatment.
- [x] Add a failing CSS/geometry contract proving the speech silhouette is oval/asymmetric, its short triangular tail uses the mouth anchor, the anchored warm-paper variant has no gradient/glass/glow, and desktop/mobile sizes retain the `360/200px` actor relationship.
- [x] Add a failing browser assertion that selecting the companion action closes the Radix menu, shows the polite reply in the reserved margin, and keeps its rectangle disjoint from protected research content.
- [x] Run the focused tests and retain the expected RED failures caused by the old kicker, dismiss control and rectangular feedback CSS.
- [x] Implement the minimal shared speech markup and scoped CSS overrides. Keep guide bubbles functional and keep ordinary click, keyboard menu, ContextMenu key and long-press behavior unchanged.
- [x] Refine the existing context menu into one continuous ruled research-ledger sheet with grouped rows and a single pull tab; do not replace Radix focus or navigation behavior.
- [x] Run focused unit/browser tests, then inspect desktop `1440/1024/736px` and mobile `390/360/320px` screenshots at native size.
- [x] Commit the tested product change.

## Task 10: Review, synchronize and deploy the Hermes refinement

**Files:**

- Modify: `docs/progress.md`
- Modify: `docs/handoff/2026-08-16-hermes-2d-pet-handoff.md`
- Modify: `project_index.md`
- Modify: this plan status/evidence

- [x] Run the complete Web test suite, typecheck, production build, product release matrix, Hermes focused gates, root lint/docs gates and `git diff --check`.
- [x] Request independent Sol High architecture/product review; fix all Critical and Important findings and repeat affected gates.
- [x] Synchronize the exact branch / candidate / ECS release / rollback tuple and commit the release candidate with a clean tree.
- [ ] Run ECS preflight and backup, then deploy the immutable candidate with `infra/scripts/deploy.sh <candidate> --skip-migrate <rollback>`; do not migrate, seed or write research data.
- [ ] Verify server build, 27-current migration status, target container health, runtime asset loading, loopback/public health, exact `/__release`, absent failure marker and retained rollback tree.
- [ ] Run public no-write browser checks for Dashboard right click, `Shift+F10`, ContextMenu key, companion feedback and mobile long press; inspect the deployed bubble at native size.
- [ ] Record deployed SHA, rollback SHA, evidence and remaining authentication limitation in CURRENT docs.
