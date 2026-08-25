# Hermes Continuous Speech Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the visually rejected broken Hermes feedback bubble and detached tool-sheet placement with a continuous mouth-origin speech silhouette and a bounded, content-safe carried tool sheet, then deploy the corrected release for direct review.

**Architecture:** Keep Radix Context Menu as the accessible behavior primitive, but constrain its placement to the actor with an explicit top-side offset and collision checks. Render Hermes feedback as one semantic text node over one decorative SVG whose single closed path owns the paper fill, ink outline, and tail; verify the visible geometry in original-scale browser screenshots rather than trusting synthetic anchors alone.

**Tech Stack:** Next.js 14, React 18, TypeScript, Radix Context Menu, Vitest, Playwright, project visual gates, immutable ECS deployment scripts.

## Global Constraints

- Work only in `E:/Miscellaneous/XGS/.worktrees/readable-hermes-guidance` on `codex/hermes-wanko-live2d`.
- Preserve unrelated uncommitted work and do not switch to the main workspace.
- Follow approved spec §13.4; no product source change may weaken its visual rejection criteria.
- No new runtime dependency and no shadcn default visual styling.
- Desktop Hermes remains `360px`; compact/mobile remains `200px`.
- The speech silhouette uses exactly one closed SVG path; CSS pseudo-element tails are forbidden.
- The carried tool sheet stays `24–48px` from Hermes and must not cover protected or readable content.
- Preserve right-click, Shift+F10/Menu, long-press, ordinary-click drawer behavior, focus return, reduced motion, and action-language mappings.
- Production is not visually accepted until original-scale Dashboard desktop/mobile and quiet-editor screenshots are manually inspected and the user reviews the deployed result.

---

### Task 1: Make Broken Speech Geometry Structurally Impossible

**Files:**
- Create: `apps/web/components/hermes/HermesSpeechBalloon.tsx`
- Modify: `apps/web/components/hermes/HermesVisualAdapter.tsx`
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/test/hermes-state.test.tsx`
- Modify: `apps/web/test/e2e/product-release.spec.ts`
- Modify: `apps/web/test/visual/hermes-work-assistant-experience-gate.mjs`

**Interfaces:**
- Consumes: translated action feedback text and `HermesActionId` from `HermesVisualAdapter`.
- Produces: `HermesSpeechBalloon({ action, children, compact })`, `[data-hermes-speech-contour="single"]`, `[data-hermes-visible-mouth-anchor="true"]`, and `[data-hermes-speech-tip="true"]`.

- [ ] **Step 1: Write failing component and browser assertions**

  Assert that feedback contains one decorative SVG, exactly one closed contour path, one semantic copy node, no legacy mouth marker, and that the rendered tip is within `8px` of the calibrated visible-mouth anchor without touching the state label or controls.

- [ ] **Step 2: Run the focused tests and record the expected RED result**

  Run `npx pnpm@9.15.0 --filter @openscience/web exec vitest run test/hermes-state.test.tsx` and the focused Playwright editor-feedback case. The old ellipse/pseudo-tail implementation must fail the new contour and collision assertions.

- [ ] **Step 3: Implement the single-contour speech balloon**

  Add a focused component with a semantic `<p>` and one `aria-hidden` SVG path. Replace `.hermes-menu-feedback::before/::after` geometry with the SVG silhouette, calibrate separate desktop/compact mouth endpoints against the real Wanko artwork, and keep text at readable size/line-height inside a compact asymmetric paper body.

- [ ] **Step 4: Run focused tests to GREEN and inspect the editor screenshot at original scale**

  The screenshot must show an unbroken ink outline, a short tail ending at the visible mouth, no state-label collision, and no detached page-note stroke.

- [ ] **Step 5: Commit the speech correction**

  Commit component, CSS, and tests together with message `fix(web): join Hermes speech to the visible mouth`.

### Task 2: Bound Tool-Sheet Placement and Protect Reading Space

**Files:**
- Modify: `apps/web/components/hermes/HermesVisualAdapter.tsx`
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/test/e2e/product-release.spec.ts`
- Modify: `apps/web/test/visual/hermes-work-assistant-experience-gate.mjs`

**Interfaces:**
- Consumes: the actual actor rectangle and Radix virtual context-menu anchor.
- Produces: top-side carried-sheet placement with a `32px` target gap, enforced `24–48px` range, horizontal containment in the Hermes companion margin, and zero protected-region overlap.

- [ ] **Step 1: Tighten tests before production changes**

  Add upper-bound gap assertions, desktop and mobile companion-margin containment, zero protected-region overlap, and absence of the free-floating vermilion tether.

- [ ] **Step 2: Run focused Dashboard desktop/mobile tests and record RED**

  The current placement must fail at least the upper-bound or containment contract demonstrated by the rejected screenshots.

- [ ] **Step 3: Implement actor-relative Radix placement**

  Anchor `ContextMenuContent` above the actor with `side="top"`, `align="center"`, `sideOffset={32}`, suitable collision padding, and pre-open scroll only when the margin lacks vertical space. Remove side-translation hacks and the decorative tether while preserving the actor’s screen position.

- [ ] **Step 4: Run focused tests to GREEN and inspect Dashboard desktop/mobile screenshots at original scale**

  Confirm the sheet remains visibly carried by Hermes, does not cover research copy or controls, and does not jump the actor when opening or closing.

- [ ] **Step 5: Commit the placement correction**

  Commit behavior, CSS, and browser assertions with message `fix(web): keep Hermes tools beside the companion margin`.

### Task 3: Restore the Design Review Gate and Prepare the Release

**Files:**
- Modify: `docs/specs/2026-08-19-hermes-wanko-live2d-design.md`
- Modify: `docs/progress.md`
- Modify: `docs/handoff/2026-08-16-hermes-2d-pet-handoff.md`
- Modify: `project_index.md`
- Modify if operational evidence changes: `docs/runbooks/deployment.md`

**Interfaces:**
- Consumes: fresh test output, inspected screenshots, application commit, ECS release commit, and rollback commit.
- Produces: a truthful version tuple and an explicit account of why the earlier skill-assisted review failed.

- [ ] **Step 1: Run local quality and visual gates**

  Run focused Vitest, product-release Hermes cases, `test:hermes-work-assistant`, web typecheck/build, project lint, and docs-sync. Open the three required screenshots at original scale; screenshot creation alone is not a pass.

- [ ] **Step 2: Review the complete diff**

  Apply `check`, inspect scope drift and visual-contract regressions, and resolve every critical/important finding before deployment. Because project instructions prohibit unrequested delegation, perform the required review passes in-session.

- [ ] **Step 3: Document the review-process correction**

  Record that design skills are rejection gates, not inspiration checklists: irrelevant search results are discarded, synthetic markers cannot prove visible-mouth alignment, unbounded geometry assertions are invalid, and original-scale manual review is mandatory.

- [ ] **Step 4: Commit the locally accepted application candidate and synchronized docs**

  Record branch, HEAD/application candidate, previous production release, and rollback without conflating them.

- [ ] **Step 5: Deploy through the existing immutable ECS runbook**

  Use `infra/scripts/ssh-run.sh` and the repository deployment flow. Verify server build, migration status, target container health, runtime asset loading, internal health, public page, and focused public Hermes E2E; do not print `.env`.

- [ ] **Step 6: Synchronize final deployment evidence and hand off for user visual review**

  Update progress, CURRENT handoff, index, and runbook release evidence with application/release/rollback commits. Report the public review route and ask specifically about outline continuity, mouth connection, sheet density, spacing, and action feedback; do not declare visual success before user review.
