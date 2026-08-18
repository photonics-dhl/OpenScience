# Readable Workspace and Hermes Guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a readable three-surface product system and an elegant, non-obstructive Hermes that guides a real public blank-RO workflow through evidence-bounded field diffs and commit.

**Architecture:** Keep the existing Optical Editorial tokens, Workspace Stage, semantic part rig, Agent task/credit/audit chain, and SDF schema. Add browser-independent control foundations and semantic reading roles; make the measured Hermes footprint part of travel planning; expose existing extractor missing-information evidence in the editor; extend the suggestion state machine for edit-before-accept; and validate character pixels plus the real public workflow.

**Tech Stack:** Next.js 14, React 18, TypeScript, Tailwind v4 utilities without preflight, OGL/WebGL2, Vitest, Playwright, MiniMax through the existing AI Gateway, Fastify/Prisma/Redis production stack.

## Global Constraints

- Preserve the distinct authenticated workspace, public RO, and Landing visual systems.
- Essential body copy is 15–17 px; editable research content is 17–18 px where space permits; navigation and controls are at least 14 px.
- 10–11 px text must not carry an action, field name, instruction, error, or other necessary meaning.
- The Hermes character, bubble, trail, and diff surface must not intersect the active editable rectangle.
- Generation alone never mutates SDF. Only explicitly accepted text is written.
- Missing results remain missing and receive an explicit evidence warning; no result sentence or number is invented.
- Approval and explicit reduced motion remain still.
- Do not replace the mascot, renderer, permission model, AI Credit policy, schema, Landing optical composition, or production topology.
- Do not read or print `.env`, commit secrets, use local Docker, delete user files, or delete the private acceptance RO.
- Local evidence is preflight. ECS public-browser evidence is the final acceptance standard.

---

### Task 1: Browser-independent controls and reading tokens

**Files:**
- Modify: `apps/web/app/tokens.css`
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/components/hermes/HermesGuideBubble.tsx`
- Test: `apps/web/test/workspace-readability.test.ts`

**Interfaces:**
- Produces CSS variables `--text-caption`, `--text-control`, `--text-body`, `--text-reading`, `--leading-body`, and `--leading-reading`.
- Produces explicit button/input/select/textarea inheritance and transparent button fallback without Tailwind preflight.

- [ ] **Step 1: Write the failing foundation contract**

```ts
it('defines readable semantic roles and browser-independent controls', () => {
  expect(tokens).toContain('--text-control: 0.875rem');
  expect(tokens).toContain('--text-reading: 1.0625rem');
  expect(globals).toMatch(/button,\s*input,\s*select,\s*textarea[\s\S]*font:\s*inherit/);
  expect(globals).toMatch(/button[\s\S]*background:\s*transparent/);
  expect(globals).toMatch(/\.hermes-companion-actions button[\s\S]*font-size:\s*var\(--text-control\)/);
});
```

- [ ] **Step 2: Verify RED**

Run: `npx pnpm@9.15.0 --filter @openscience/web exec vitest run test/workspace-readability.test.ts`

Expected: FAIL because semantic roles and the explicit Hermes action control contract do not exist.

- [ ] **Step 3: Add the minimal foundation**

```css
:root {
  --text-caption: 0.75rem;
  --text-control: 0.875rem;
  --text-body: 1rem;
  --text-reading: 1.0625rem;
  --leading-body: 1.6;
  --leading-reading: 1.7;
}

button, input, select, textarea { color: inherit; font: inherit; }
button { background: transparent; }
```

Give `.hermes-companion-actions button`, `.hermes-companion-take-me`, and dismiss controls explicit border, background, foreground, size, hover, focus, and disabled states.

- [ ] **Step 4: Verify GREEN and commit**

Run: focused Vitest, Web typecheck, and `git diff --check`.

Commit: `fix(web): establish readable control foundations`

---

### Task 2: Apply the balanced scholarly reading hierarchy

**Files:**
- Modify: `apps/web/app/dashboard/page.tsx`
- Modify: `apps/web/components/dashboard/ImportStage.tsx`
- Modify: `apps/web/app/research-objects/new/page.tsx`
- Modify: `apps/web/components/editor/CoreEditor.tsx`
- Modify: `apps/web/components/editor/SuggestionsPanel.tsx`
- Modify: `apps/web/components/research/BeforeAfterProposal.tsx`
- Modify: `apps/web/components/public/PublicVersionPage.tsx`
- Modify: `apps/web/components/landing/SiteHeader.tsx`
- Test: `apps/web/test/e2e/workspace-readability.spec.ts`
- Create: `apps/web/test/visual/workspace-readability-gate.mjs`
- Modify: `apps/web/package.json`

**Interfaces:**
- Consumes the Task 1 semantic type roles.
- Produces `data-reading-role="body|control|caption|reading"` hooks used only for honest browser acceptance.

- [ ] **Step 1: Add a failing representative-route browser test**

```ts
async function assertReadable(locator: Locator, minimumPx: number) {
  const sizes = await locator.evaluateAll((nodes) => nodes.map((node) => Number.parseFloat(getComputedStyle(node).fontSize)));
  expect(sizes.length).toBeGreaterThan(0);
  expect(Math.min(...sizes)).toBeGreaterThanOrEqual(minimumPx);
}

await assertReadable(page.locator('[data-reading-role="control"]'), 14);
await assertReadable(page.locator('[data-reading-role="body"]'), 15);
await expect(page.locator('[data-reading-role="control"]')).toHaveCSS('background-color', /^(?!rgb\(255, 255, 255\)$)/);
```

Cover Landing, Dashboard, settings, explore, blank/import create, SDF editor, collaboration, and public RO at 1440×900 and 390×844. The visual gate scans every visible button, link, input, select, textarea, and label for a 14 px minimum; rejects any visible text below 12 px unless it is an explicitly non-essential caption; checks necessary muted text at 4.5:1; rejects clipped action text; and requires non-empty accessible names.

- [ ] **Step 2: Verify RED on the current public-shaped UI**

Run: `npx pnpm@9.15.0 --filter @openscience/web exec playwright test test/e2e/workspace-readability.spec.ts`

Expected: FAIL on 10–12 px essential labels and the Hermes guide action background.

- [ ] **Step 3: Replace microtype only where it carries meaning**

Use semantic type roles rather than blanket scaling:

```tsx
<p data-reading-role="caption" className="font-data text-xs uppercase tracking-[0.1em]">…</p>
<p data-reading-role="body" className="text-base leading-[var(--leading-body)]">…</p>
<button data-reading-role="control" className="text-sm">…</button>
<textarea data-reading-role="reading" className="font-editorial text-[1.0625rem] leading-[var(--leading-reading)]" />
```

Retain editorial display headings and data identifiers. Do not increase non-essential version/hash metadata beyond the caption role.

- [ ] **Step 4: Verify desktop/mobile and commit**

Run the focused browser test, complete readability route gate, existing public-reading shots, workspace shots, Web typecheck, and `git diff --check`.

Commit: `fix(web): improve scholarly reading hierarchy`

---

### Task 3: Make the complete Hermes footprint collision-safe

**Files:**
- Modify: `apps/web/lib/hermes/travel-path.ts`
- Modify: `apps/web/components/hermes/HermesGuideBubble.tsx`
- Modify: `apps/web/components/hermes/HermesWorkspaceStage.tsx`
- Modify: `apps/web/app/globals.css`
- Test: `apps/web/test/hermes-travel-path.test.ts`
- Test: `apps/web/test/e2e/hermes-field-guide.spec.ts`

**Interfaces:**
- Adds `HermesFootprintInsets { left: number; right: number; top: number; bottom: number }`.
- Adds `footprint: HermesFootprintInsets` to `HermesTravelInput`.
- Adds `visible: boolean` and a forwarded `HTMLElement` ref to `HermesGuideBubble` so the bubble can be measured while visually hidden.

- [ ] **Step 1: Write RED tests for actor-plus-bubble collision**

```ts
const plan = planHermesTravel({
  from, target, editable, viewport, preferredSides: ['right'],
  footprint: { left: 150, right: 150, top: 230, bottom: 150 },
});
const footprint = rectForFootprint(plan.dock, input.footprint);
expect(footprint.right <= editable.left || footprint.left >= editable.right
  || footprint.bottom <= editable.top || footprint.top >= editable.bottom).toBe(true);
```

In Playwright, calculate the union of `[data-hermes-companion-actor]` and `[data-hermes-guide-bubble]` and assert it does not intersect each of the six active textareas or the before/after diff on desktop and mobile.

- [ ] **Step 2: Verify RED**

Run: focused travel-path Vitest and `hermes-field-guide.spec.ts`.

Expected: the actor rectangle may pass while the overflowing bubble intersects the target.

- [ ] **Step 3: Plan travel from the measured union footprint**

```ts
export interface HermesFootprintInsets { left: number; right: number; top: number; bottom: number }

export function rectForFootprint(center: Point, footprint: HermesFootprintInsets): Bounds {
  return {
    left: center.x - footprint.left,
    right: center.x + footprint.right,
    top: center.y - footprint.top,
    bottom: center.y + footprint.bottom,
  };
}
```

Render the bubble in an inert, `visibility:hidden` measurement state before arrival. Measure actor and bubble relative to the Stage centre, pass the union insets into `planHermesTravel`, use the registered `clearancePx`, and fall back to `edge-stop` when no collision-free side exists. On mobile, keep the guide inside the bottom guidance region rather than above the character.

- [ ] **Step 4: Verify all six targets and commit**

Run focused Vitest, field-guide E2E, guidance geometry gate, Web typecheck, and diff check.

Commit: `fix(web): keep Hermes guidance clear of research fields`

---

### Task 4: Support edit-before-accept and explicit missing-evidence guidance

**Files:**
- Modify: `apps/web/lib/suggestions.ts`
- Modify: `apps/web/components/research/BeforeAfterProposal.tsx`
- Modify: `apps/web/components/editor/SuggestionsPanel.tsx`
- Modify: `apps/web/app/research-objects/[id]/edit/page.tsx`
- Modify: `apps/web/messages/en.json`
- Modify: `apps/web/messages/zh.json`
- Test: `apps/web/test/editor.test.ts`
- Test: `apps/web/test/extractor.test.ts`
- Test: `apps/web/test/e2e/hermes-draft-diff.spec.ts`

**Interfaces:**
- Adds `SuggestionAction = { type: 'revise'; id: string; suggestion: string }`.
- Changes proposal acceptance to `onReview(value: string): void`.
- Reads the existing task result `needsMoreInformation: SdfField[]` and exposes it as a non-writing evidence warning.
- Produces deterministic next-field guidance after apply, edit-apply, dismiss, or missing-evidence acknowledgement.

```ts
const SDF_FIELDS = ['problem', 'insight', 'method', 'results', 'limitations', 'reproducibility'] as const;
type SdfField = (typeof SDF_FIELDS)[number];
const isSdfField = (value: unknown): value is SdfField => typeof value === 'string' && SDF_FIELDS.includes(value as SdfField);
```

- [ ] **Step 1: Write RED reducer and browser contracts**

```ts
const revised = suggestionReducer([pending], { type: 'revise', id: pending.id, suggestion: 'Researcher-edited text' });
const applied = suggestionReducer(revised, { type: 'apply', id: pending.id });
expect(applySuggestionsToCore(emptyCore(), applied).problem).toBe('Researcher-edited text');
```

Browser assertions:

```ts
await proposal.getByRole('button', { name: /Edit suggestion|编辑建议/ }).click();
await proposal.getByRole('textbox').fill('Researcher-edited text');
await proposal.getByRole('button', { name: /Apply edited change|应用已编辑内容/ }).click();
await expect(problem).toHaveValue('Researcher-edited text');
await expect(resultsNotice).toContainText(/no result evidence|没有结果证据/i);
await expect(results).toHaveValue('');
```

- [ ] **Step 2: Verify RED**

Run focused editor/extractor Vitest and `hermes-draft-diff.spec.ts`.

- [ ] **Step 3: Implement the suggestion transition and disclosure UI**

Keep missing fields separate from suggestions:

```ts
const missing = Array.isArray(cur.task.result?.needsMoreInformation)
  ? cur.task.result.needsMoreInformation.filter(isSdfField)
  : [];
```

Never synthesize a result sentence. Display a warning tied to `sdf-results`; accepting or dismissing one suggestion advances to the next pending/missing field and requests the corresponding Hermes anchor.

- [ ] **Step 4: Verify no silent writes and commit**

Run focused tests, Web typecheck, and diff check.

Commit: `feat(web): add reviewable Hermes field drafts`

---

### Task 5: Replace coarse presentation motion with richer semantic articulation

**Files:**
- Modify: `apps/web/lib/hermes/action-catalog.ts`
- Modify: `apps/web/lib/hermes/behavior-director.ts`
- Modify: `apps/web/lib/hermes/pet-motion.ts`
- Modify: `apps/web/lib/hermes/part-rig.ts`
- Modify: `apps/web/app/globals.css`
- Test: `apps/web/test/hermes-behavior-director.test.ts`
- Test: `apps/web/test/hermes-part-rig.test.ts`
- Test: `apps/web/test/visual/hermes-companion-motion-gate.mjs`

**Interfaces:**
- Keeps the existing action IDs and renderer input shape.
- Produces independent head, torso, forepaw, tail, page-crown, gaze, and evidence-node joint changes for idle, discovery, travel, arrival, work, review, and completion.

- [ ] **Step 1: Add RED diversity and perceptibility contracts**

```ts
let current = createInitialHermesBehavior(input({ nowMs: 0, seed: 37 }));
const observed = [current.primary];
for (let nowMs = 250; nowMs <= 90_000; nowMs += 250) {
  const next = stepHermesBehavior(current, input({ nowMs, seed: 37 }));
  if (next.primary !== current.primary) observed.push(next.primary);
  current = next;
}
expect(new Set(observed).size).toBeGreaterThanOrEqual(8);
expect(observed.every((action, index) => index === 0 || action !== observed[index - 1])).toBe(true);

const citation = createHermesPartPoses(sampleAction('citation-trace', 1_050), 'citation-trace', .5);
expect(citation.tail.angle).not.toBe(citation.torso.angle);
const writing = createHermesPartPoses(sampleAction('quiet-write', 1_000), 'quiet-write', .5);
expect(writing.base).toEqual({ angle: 0, x: 0, y: 0 });
```

The real-pixel gate freezes autonomous time for pointer attribution, then separately samples a 90-second idle window. It requires non-affine region vectors, visible eye/head/tail/node activity, and no open seams.

- [ ] **Step 2: Verify RED against the coarse repertoire**

Run focused Vitest and the current companion motion gate. Record exact missing signatures or overused whole-character motion.

- [ ] **Step 3: Tune semantic joints, not the enclosing bitmap**

Remove whole-character scale/ellipse gestures for internal actions. Preserve whole-character translation only for travel, landing compression, user drag, and milestone dance. Tune anticipation, hold, and release in `part-rig.ts`; keep quiet-write restrained and approval still.

- [ ] **Step 4: Verify pixels and commit**

Run behavior/rig Vitest, articulation gate, companion gate, performance gate, reduced-motion E2E, Web typecheck, and diff check.

Commit: `feat(web): enrich Hermes scholarly motion`

---

### Task 6: Add a real blank-RO production gate

**Files:**
- Create: `apps/web/test/visual/hermes-blank-ro-production-gate.mjs`
- Modify: `apps/web/package.json`
- Modify: `apps/web/test/visual/hermes-release-gate.mjs`
- Test: `apps/web/test/e2e/hermes-blank-ro-flow.spec.ts`

**Interfaces:**
- Adds `pnpm --filter @openscience/web test:hermes-blank-ro-production`.
- Writes only ignored screenshots/video/metrics under `apps/web/test/visual/out/hermes-blank-ro/`.

- [ ] **Step 1: Write the public-gate contract before product changes are declared complete**

The script uses a real short-lived administrator session without printing it and asserts:

```js
assert.equal(networkInterceptions, 0);
assert.deepEqual(missingEvidence, ['results']);
assert.equal(unsupportedClaims.length, 0);
assert.equal(accepted.problem, gold.problem);
assert.equal(accepted.results, '');
assert.equal(persistedAfterReload.results, '');
assert.equal(taskIds.length, new Set(taskIds).size);
assert.ok(motionStates.has('idle') && motionStates.has('travel') && motionStates.has('working') && motionStates.has('review'));
```

The run performs one accept, one edit-accept, one reject, save, refresh, and commit. It retains the labelled private acceptance RO.

- [ ] **Step 2: Run the local mocked flow only as RED/preflight**

Run the focused E2E against a production Next build. Expected initial failures identify missing edit-accept, missing-evidence, or geometry behaviour; mocked GREEN is not release evidence.

- [ ] **Step 3: Wire the gate into the Hermes aggregate**

Do not expose credentials or enable the gate in ordinary CI. Require explicit production base URL and the existing secure session bootstrap path.

- [ ] **Step 4: Commit the acceptance gate**

Run MJS syntax check, focused E2E, release gate excluding the ECS-only leg, Web typecheck, and diff check.

Commit: `test(web): verify blank RO Hermes guidance`

---

### Task 7: Full verification, docs sync, and ECS release checkpoint

**Files:**
- Modify: `docs/progress.md`
- Modify: `docs/handoff/2026-08-16-hermes-2d-pet-handoff.md`
- Modify: `project_index.md`
- Modify: `docs/runbooks/deployment.md`
- Modify: `docs/specs/2026-08-18-readable-workspace-hermes-guidance-design.md`
- Modify: `docs/plans/2026-08-18-readable-workspace-hermes-guidance-plan.md`

**Interfaces:**
- Produces a version tuple for local branch/HEAD, GitHub branch/main, ECS release, and rollback.
- Does not deploy until the required cloud-write confirmation is present.

- [ ] **Step 1: Run sequential local release gates**

Run focused tests, full Web Vitest, Web typecheck, root lint, production build, representative desktop/mobile/reduced E2E, all Hermes pixel/performance gates, docs lint, docs sync, and diff check. Do not parallelize build with a running Next server.

- [ ] **Step 2: Request independent review**

Review the complete diff for correctness, UX, accessibility, security/privacy, lifecycle, performance, test honesty, and stale CURRENT claims. Resolve every Critical/Important finding before release.

- [ ] **Step 3: Commit and push the reviewed candidate**

Stage only tracked task files; preserve `docs/user_ideas/8.10/*`. Record exact commit hashes in progress/handoff/index.

- [ ] **Step 4: Stop at the ECS write checkpoint if confirmation is absent**

Run read-only checkup and deployment dry-run. Obtain explicit confirmation before backup/deploy.

- [ ] **Step 5: Deploy and run the public acceptance**

On confirmation: run ECS backup, confirmed deploy without migration/seed unless the diff proves otherwise, post-checkup, public HTTP checks, the uninterrupted blank-RO production gate, and direct user visual review.

- [ ] **Step 6: Final docs sync and release record**

Record release/rollback, real public metrics, the retained private acceptance RO label, and any honestly unresolved aesthetic issue. Run docs lint, docs sync, and diff check again; commit/push the release record.
