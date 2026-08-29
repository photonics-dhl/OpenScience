# Hermes Carried Tool Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status: COMPLETED AND DEPLOYED 2026-08-25.** Application source `1b3badaec5af3330e10b8ca0abb9163ff2af0883`; immutable release `8ed2f3cb895e46cd1b355db0e40883c703140b22`; rollback `7165e9b73df55b00d907080d300ccf97476575e8`. The unchecked boxes below preserve the original execution recipe rather than current task state.

**Goal:** Replace the deployed orbit menu with the approved non-overlapping carried tool sheet and lock each of the twelve menu actions to its matching Live2D motion and localized sentence.

**Architecture:** Keep Radix Context Menu as the only focus and keyboard primitive. `context-menu-actions.ts` remains the single action/motion/message catalog, `HermesVisualAdapter` computes a virtual anchor above the actor and renders one folio sheet, and `HermesWorkspaceStage` continues to own the atomic menu-close → motion → speech → optional navigation beat. CSS owns only the sheet material and the fixed menu-gap-actor geometry.

**Tech Stack:** Next.js 14.2, React 18.3, TypeScript, next-intl, Radix Context Menu 2.3.7, Lucide, Vitest, Playwright, project CSS tokens.

## Global Constraints

- Work only in `E:/Miscellaneous/XGS/.worktrees/readable-hermes-guidance` on `codex/hermes-wanko-live2d`.
- Preserve exact Hermes sizes: desktop `360px`, compact/mobile `200px`.
- Preserve a measured `32px` empty band between menu and actor; neither bounding box may intersect.
- Ordinary click opens the assistant; right click, `Shift+F10`, Menu key and long press open the menu.
- Menu and speech never coexist; research actions keep their current real destinations and perform no hidden write.
- All action targets are at least `44px`; visible labels are at least `14px`; focus remains visible.
- Motion uses only `transform` and `opacity`, finishes within `200ms`, and honors reduced motion.
- Use existing fonts, color tokens, Lucide and Radix. No gradient, glow, glass, emoji, pills, per-item cards or default shadcn appearance.
- Landing, APIs, database, source artwork, voice and TTS stay unchanged.

---

### Task 1: Lock action, motion and language as one catalog contract

**Files:**
- Modify: `apps/web/lib/hermes/context-menu-actions.ts`
- Modify: `apps/web/messages/en.json`
- Modify: `apps/web/messages/zh.json`
- Test: `apps/web/test/hermes-context-menu-actions.test.ts`

**Interfaces:**
- Consumes: `HermesActionId`, next-intl message trees.
- Produces: `HERMES_CONTEXT_ACTIONS`, where every key owns one `action`, `labelKey` and `feedbackKey` used by the same selection beat.

- [ ] **Step 1: Write the failing table-driven contract test**

```ts
const expected = [
  ['greet', 'ear-perk', '你来了，我也在。', 'Hello — I’m right here.'],
  ['rest', 'doze', '先歇一会，我替你守着这一页。', 'Rest a moment. I’ll keep your place.'],
  ['compare', 'compare', '把两个版本并排放好，我们看差异。', 'Let’s place the versions side by side and inspect the differences.'],
] as const;

for (const [key, motion, zh, en] of expected) {
  const item = HERMES_CONTEXT_ACTIONS.find((candidate) => candidate.key === key);
  expect(item?.action).toBe(motion);
  expect(readMessage(zhMessages, item!.feedbackKey)).toBe(zh);
  expect(readMessage(enMessages, item!.feedbackKey)).toBe(en);
}
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx pnpm@9.15.0 --filter @openscience/web test -- hermes-context-menu-actions.test.ts`

Expected: FAIL because the approved literal responses are not yet present and no full twelve-row language-lock test exists.

- [ ] **Step 3: Apply the approved twelve localized responses**

Keep each item’s current real `HermesActionId`; update only its localized sentence and add no alternative random response. The selection path remains:

```ts
onMenuAction?.({ action: item.action, messageKey: item.feedbackKey });
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npx pnpm@9.15.0 --filter @openscience/web test -- hermes-context-menu-actions.test.ts`

Expected: PASS for all twelve unique action/motion/message triples in both locales.

### Task 2: Replace orbit points with one physical tool sheet

**Files:**
- Modify: `apps/web/components/hermes/HermesVisualAdapter.tsx`
- Modify: `apps/web/app/globals.css`
- Test: `apps/web/test/e2e/product-release.spec.ts`
- Test: `apps/web/test/visual/hermes-work-assistant-experience-gate.mjs`

**Interfaces:**
- Consumes: the real actor `getBoundingClientRect()`, `compactMenu`, Radix `data-side`, and the twelve-item catalog.
- Produces: one `[data-hermes-action-menu]` sheet whose bottom edge is at least `32px` above `[data-hermes-input-owner]` and whose actions retain DOM order.

- [ ] **Step 1: Add failing browser assertions for the physical contract**

```ts
const actor = await page.locator('[data-hermes-input-owner="true"]').boundingBox();
const menu = await page.locator('[data-hermes-action-menu="true"]').boundingBox();
expect(menu!.y + menu!.height).toBeLessThanOrEqual(actor!.y - 32);
expect(await page.locator('[data-hermes-action-menu] [data-hermes-action-key]').count()).toBe(12);
```

Repeat the geometry assertion after mobile long press against the exact `200px` actor, with one visible group at a time and all twelve items reachable through the two group controls.

- [ ] **Step 2: Run the browser test and verify RED**

Run: `npx pnpm@9.15.0 --filter @openscience/web exec playwright test test/e2e/product-release.spec.ts --grep "Hermes"`

Expected: FAIL because the deployed orbit content is centered over the actor rather than occupying the band above it.

- [ ] **Step 3: Anchor the Radix virtual point above the actor**

In `dispatchContextMenu`, use the actor center for `clientX`, reserve the measured menu height plus `32px` before dispatch, and set `clientY` to the actor’s top edge. Do not implement focus or Escape manually. Keep long-press cancellation and ordinary-click suppression unchanged.

- [ ] **Step 4: Render the approved folio hierarchy**

Use one static label, two DOM-ordered groups, two-column continuous rows on desktop, group switching on compact/mobile, and a source mark restricted to the empty gap. Remove absolute orbit coordinates and transparent full-size content. Keep each row at least `44px` and each label at least `14px`.

- [ ] **Step 5: Run the browser contract and verify GREEN**

Run: `npx pnpm@9.15.0 --filter @openscience/web exec playwright test test/e2e/product-release.spec.ts --grep "Hermes"`

Expected: PASS for right click, keyboard, mobile long press, assistant click, exact sizes and disjoint geometry.

### Task 3: Preserve the atomic action beat and prevent state collisions

**Files:**
- Modify: `apps/web/components/hermes/HermesWorkspaceStage.tsx` only if the failing test identifies a state-order defect
- Test: `apps/web/test/hermes-state.test.tsx`
- Test: `apps/web/test/e2e/product-release.spec.ts`

**Interfaces:**
- Consumes: `HermesMenuFeedback { action, messageKey }`.
- Produces: menu closed before one action-specific motion and one mouth-origin sentence; optional research navigation retains the existing `900ms` delay.

- [ ] **Step 1: Add a failing selection-order test**

Assert that selecting each catalog item produces the same item’s `action` and `feedbackKey`, that `[data-hermes-action-menu]` is closed before `[data-hermes-menu-feedback]` appears, and that the feedback node exposes the selected action through `data-hermes-feedback-action`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx pnpm@9.15.0 --filter @openscience/web test -- hermes-state.test.tsx`

Expected: FAIL only if the current selection path permits mismatched copy or concurrent menu/speech state; otherwise tighten the test at the first observable missing contract before production changes.

- [ ] **Step 3: Implement the minimal ordering correction**

Selection must execute `setMenuOpen(false)` before dispatching the catalog-owned `{ action, messageKey }`. Do not add random phrases, speech synthesis, hidden writes or a second motion lookup.

- [ ] **Step 4: Verify the focused and neighboring tests**

Run: `npx pnpm@9.15.0 --filter @openscience/web test -- hermes-state.test.tsx hermes-context-menu-actions.test.ts`

Expected: PASS with no warnings.

### Task 4: Visual, repository and production acceptance

**Files:**
- Modify: `docs/progress.md`
- Modify: `docs/handoff/2026-08-16-hermes-2d-pet-handoff.md`
- Modify: `project_index.md`
- Modify: `docs/runbooks/deployment.md`

**Interfaces:**
- Consumes: the immutable candidate commit and current ECS release tuple.
- Produces: local and production evidence for the same commit plus an explicit rollback ref.

- [ ] **Step 1: Run local gates**

Run the focused Vitest and Playwright tests, Hermes visual aggregate, Web test/typecheck/build, root lint/test/build, `audit:docs-sync`, `docs:lint`, and `git diff --check`. Record counts and first failures only.

- [ ] **Step 2: Inspect real screenshots**

Capture Dashboard default, menu, focus, every companion feedback motion, editor quiet and mobile long-press at original scale. Reject any actor/menu intersection, clipped label, detached speech tail, text obstruction or state jump.

- [ ] **Step 3: Request independent review and fix findings through TDD**

Review correctness, accessibility, state safety, route behavior, geometry at 360/200 and reduced motion. Re-run the affected gate after every fix.

- [ ] **Step 4: Commit and deploy the immutable candidate**

Use the deployment runbook and explicit `XGS_CONFIG_ROOT=E:/Miscellaneous/XGS`. Run preflight/checkup and backup, deploy with `--skip-migrate`, verify server full build, 27 migrations current, healthy target containers, Parser isolation, runtime assets, exact `/__release`, absent failure marker and rollback tree.

- [ ] **Step 5: Run public acceptance and synchronize CURRENT docs**

Run no-write public desktop keyboard/right-click, mobile long-press, ordinary-click drawer and action-feedback checks. Update the version tuple and concise evidence in progress, handoff, index and runbook; do not claim deployment until the public release ID matches the candidate.
