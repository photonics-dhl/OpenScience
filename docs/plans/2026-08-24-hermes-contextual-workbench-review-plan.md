# Hermes Contextual Workbench Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `executing-plans` and execute
> each task in order with its stated test and review checkpoint.

**Goal:** Deploy an anonymous, no-write visual acceptance route that lets the
user inspect the approved warm-paper product system and Hermes contextual menu
in a real browser.

**Architecture:** Add one isolated Next.js App Router visual route backed by a
pure reducer, a client review workbench, the existing v09 Hermes WebGL runtime,
and accessible Radix context-menu/dialog primitives. Fixture research content
never calls production APIs. CSS Modules own the route's entire visual layer;
shared project tokens and fonts remain the source of truth.

**Tech Stack:** Next.js 14, React 18, TypeScript, next-intl, Radix UI,
CSS Modules, Vitest, Playwright, existing Hermes OGL runtime.

**Global constraints:** Work only in
`E:/Miscellaneous/XGS/.worktrees/readable-hermes-guidance`; preserve existing
uncommitted documentation edits; do not read secrets or `.env`; do not modify
authenticated product pages, databases, migrations or seed data; do not use
gradients, glass, glow, purple, emoji, pill clusters, per-item cards or default
shadcn styling; keep Hermes exactly `360px` desktop and `200px` mobile; respect
`prefers-reduced-motion`; deploy only a clean exact Git commit through the
project release script with the current production release as rollback.

## Task 1: Lock the approved design and implementation boundary

- [x] Extend the unique CURRENT Hermes design spec with the accepted warm-paper
  visual thesis, interaction semantics, typography and deployment boundary.
- [x] Create this one implementation plan rather than a competing design spec.
- [x] Register this plan and the acceptance route in `project_index.md` during
  final docs-sync.

## Task 2: Specify state behavior with a failing unit test

**Files:**

- Create `apps/web/test/research-workbench-state.test.ts`.
- Create `apps/web/lib/research-workbench-state.ts` only after the test fails.

- [x] Test the six allowlisted view IDs and Dashboard fallback.
- [x] Test that switching view closes the assistant fixture.
- [x] Test quiet companion feedback without losing the selected view.
- [x] Test review acceptance and explicit assistant open/close transitions.
- [x] Run the focused Vitest test and record the expected missing-module RED.
- [x] Implement the smallest discriminated-union reducer that makes it GREEN.
- [x] Mutate one transition locally and confirm the test detects it before
  restoring the correct implementation.

## Task 3: Add accessible interaction primitives without importing a theme

**Files:**

- Modify `apps/web/package.json` and `pnpm-lock.yaml`.
- Create `apps/web/components/ui/context-menu.tsx`.

- [x] Resolve and pin the current compatible Radix context-menu package.
- [x] Wrap only root, trigger, portal, content, group, label, item, separator and
  shortcut behavior needed by this slice.
- [x] Keep appearance class-driven so no registry visual defaults leak into the
  product language.

## Task 4: Build the real visual acceptance route

**Files:**

- Create `apps/web/app/_visual/research-workbench/layout.tsx`.
- Create `apps/web/app/_visual/research-workbench/page.tsx`.
- Create `apps/web/components/visual/ResearchWorkbenchReview.tsx`.
- Create `apps/web/components/visual/ResearchWorkbenchHermes.tsx`.
- Create `apps/web/components/visual/research-workbench-review.module.css`.
- Modify `apps/web/app/_visual/research-workbench/layout.tsx` and `apps/web/app/tokens.css` for the reading
  font role and narrowly scoped warm-workbench tokens.
- Modify `apps/web/messages/en.json` and `apps/web/messages/zh.json` with matched
  visual-fixture strings.

- [x] Render Dashboard, editor, review, explore, reading and mobile states using
  one stable utility-first shell, not six disconnected concept cards.
- [x] Render the actual Hermes runtime at exact `360/200px` stages with a static
  accessible fallback and client-only loading.
- [x] Open the menu by context click, `Shift+F10`, Menu key and mobile long press;
  keep ordinary click assigned to the accessible assistant dialog fixture.
- [x] Show Dashboard menu focus, companion reaction and text bubble; make editor
  and review variants quieter.
- [x] Use `19px / 1.72` long-reading typography and reserve graphite for evidence
  inspection rather than a full-page background.
- [x] Keep one `aria-live` status, visible focus, `40px` desktop and `44px`
  compact targets, semantic buttons, Escape dismissal and no hidden overflow.
- [x] Limit transitions to meaningful opacity/transform and remove them under
  reduced motion.

## Task 5: Prove browser behavior before claiming visual readiness

**Files:**

- Create `apps/web/test/e2e/research-workbench-review.spec.ts` before the route.
- Store screenshots only under ignored
  `apps/web/test/visual/out/research-workbench-review/`.

- [x] Confirm the test fails against the absent route or absent behavior first.
- [x] Assert all six state controls, open default Dashboard menu and `360px`
  Hermes stage.
- [x] Assert ordinary click opens the assistant dialog; context click and
  keyboard access open the menu and update its live feedback.
- [x] Assert mobile long press opens the compact menu and actor is `200px`.
- [x] Assert editor reading metrics, review evidence treatment, accepted review
  feedback, `320/390px` no-overflow and reduced-motion state.
- [x] Capture desktop Dashboard, focus/feedback, mobile and quiet editor/review
  screenshots using real WebGL rendering.
- [x] Inspect screenshots at original detail and fix hierarchy, typography,
  collision or template-like presentation before continuing.

## Task 6: Run local quality gates

- [x] Focused reducer and browser tests GREEN.
- [x] Web test suite, typecheck and production build GREEN.
- [x] Root lint, docs-sync audit, docs lint and `git diff --check` GREEN.
- [x] Review the final diff for API writes, accidental authenticated-page edits,
  accessibility regressions, styling drift and secret exposure.
- [x] Read the `ui-ux-pro-max` quick-reference delivery sections and perform its
  final responsive/accessibility checklist.

## Task 7: Synchronize project memory and create the release commit

**Files:**

- Modify `docs/progress.md`.
- Modify `docs/handoff/2026-08-16-hermes-2d-pet-handoff.md`.
- Modify `docs/runbooks/deployment.md`.
- Modify `project_index.md`.

- [x] Record user approval, implemented route and tests without
  claiming deployment early.
- [x] Register all newly created product and documentation files.
- [x] Preserve the application release / ECS release / rollback distinction.
- [x] Commit the complete candidate so `git status` is clean and release source
  verification can succeed.

## Task 8: Deploy and verify the public visual URL

- [x] Run the read-only ECS checkup and database backup from Windows Git Bash.
- [x] Run deployment dry-run, then confirmed deployment with `--skip-migrate`
  and explicit rollback ref after revalidating the exact candidate SHA.
- [x] Verify target containers, public route HTTP 200, exact `/__release` SHA,
  no `.release-failed` marker and retained rollback release.
- [x] Run the no-write Playwright acceptance against the public URL and capture
  production screenshots.
- [x] Update deployment evidence in progress, handoff, runbook and index in a
  docs-only follow-up commit; do not redeploy that documentation-only HEAD.
- [x] Give the user the direct public URL and ask only for concrete feedback on
  silhouette, paper/ink texture, cuteness, menu density and action feedback.
