# Hermes Contextual Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Dashboard Hermes character a living contextual guide that opens a real, recoverable `workspace.guide` assistant drawer.

**Architecture:** Keep visual presence, prompt derivation, drawer orchestration, and Worker execution as separate units. Reuse the existing AgentSession/AgentTask APIs, AI Gateway, credit checks, queue, polling, and approval policy; add one validated Worker task kind and no database migration.

**Tech Stack:** Next.js 14, React 18, next-intl, TypeScript, Fastify/Zod, Redis AgentTask queue, `@openscience/ai-gateway`, Vitest, Playwright.

## Global Constraints

- The existing three 824×824 Hermes PNG frames remain canonical; expose exactly one active frame and no duplicated character pixels.
- Idle motion communicates `observe → organise → guide`; no Canvas, WebGL, Live2D, 3D, or new third-party mascot dependency.
- Prompts may only describe data present in the current Dashboard overview.
- `workspace.guide` may return read-only guidance and navigation intents; writes, deletes, Merge, publish, and permission changes remain subject to R0–R4 approval.
- Desktop and 390 px mobile expose equivalent functionality; reduced-motion and approval states are fully still.
- Do not read or print `.env`; do not deploy until local user visual acceptance.

---

### Task 1: Truthful contextual prompt model

**Files:**
- Create: `apps/web/components/hermes/hermes-guide.ts`
- Modify: `apps/web/test/hermes-state.test.tsx`

**Interfaces:**
- Consumes: `HermesRailTask[]` and Dashboard research summaries already loaded by `DashboardPage`.
- Produces:

```ts
export type HermesGuideKind = 'actionable-task' | 'continue-research' | 'start-import' | 'neutral';
export interface HermesGuideSuggestion {
  kind: HermesGuideKind;
  titleKey: string;
  bodyKey: string;
  href?: string;
  taskId?: string;
  researchObjectId?: string;
}
export function deriveHermesGuide(input: {
  tasks: HermesRailTask[];
  researchObjects: Array<{ id: string; title: string; status: string }>;
}): HermesGuideSuggestion;
```

- [ ] **Step 1: Write failing prompt-priority tests**

Add focused tests proving task → RO → import priority and that empty data returns `neutral` without an evidence claim:

```ts
expect(deriveHermesGuide({ tasks: [task], researchObjects: [] })).toMatchObject({
  kind: 'actionable-task', taskId: task.id, researchObjectId: task.researchObjectId,
});
expect(deriveHermesGuide({ tasks: [], researchObjects: [research] })).toMatchObject({
  kind: 'continue-research', researchObjectId: research.id,
});
expect(deriveHermesGuide({ tasks: [], researchObjects: [] }).kind).toBe('neutral');
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx pnpm@9.15.0 --filter @openscience/web test -- hermes-state.test.tsx`

Expected: FAIL because `deriveHermesGuide` does not exist.

- [ ] **Step 3: Implement the pure priority function**

Return only translation keys and safe IDs; use `hermesTaskHref(task)` for actionable task navigation and `/research-objects/<id>/edit` for an existing RO. Do not generate prose from titles or counts inside the function.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the command from Step 2. Expected: all Hermes state tests pass.

### Task 2: Formal `workspace.guide` Worker contract

**Files:**
- Create: `apps/agent-worker/src/workspace-guide.ts`
- Create: `apps/agent-worker/test/workspace-guide.test.ts`
- Create: `apps/web/test/api-agent.test.ts`
- Modify: `apps/agent-worker/src/index.ts`
- Modify: `apps/web/lib/api.ts`

**Interfaces:**
- Produces:

```ts
export interface WorkspaceGuidePayload {
  goal: string;
  locale: 'zh' | 'en';
  route: '/dashboard';
  context: {
    tasks: Array<{ id: string; researchObjectId: string; state: string }>;
    researchObjects: Array<{ id: string; title: string; status: string }>;
  };
}
export interface WorkspaceGuideResult {
  summary: string;
  nextSteps: Array<{ label: string; intent: 'open-task' | 'open-ro' | 'start-import'; targetId?: string }>;
  needsMoreInformation: boolean;
}
export async function workspaceGuideHandler(
  gateway: AiGateway,
  task: { payload: Record<string, unknown> },
): Promise<Record<string, unknown>>;
```

- Web API helpers:

```ts
export async function createAgentSession(input: {
  kind: 'workspace.guide'; title: string;
}): Promise<{ session: AgentSessionView }>;
export async function submitWorkspaceGuideTask(input: {
  sessionId: string; payload: WorkspaceGuidePayload; idempotencyKey: string;
}): Promise<{ task: AgentTaskView }>;
```

- [ ] **Step 1: Write failing Worker tests**

Test bounded payload validation, JSON structured output, maximum three next steps, supported intent allow-list, and malformed provider output failure. Stub `AiGateway.complete()` with deterministic JSON; do not call a network provider.

- [ ] **Step 2: Run Worker tests and verify RED**

Run: `npx pnpm@9.15.0 --filter @openscience/agent-worker test -- workspace-guide.test.ts`

Expected: FAIL because the handler and registry entry do not exist.

- [ ] **Step 3: Implement the handler and exact registry entry**

Build a system prompt that permits only read-only guidance and the three navigation intents. Parse provider JSON with Zod. Register `'workspace.guide': async (_deps, task) => workspaceGuideHandler(gateway, task)` in `createHandlers`; leave unknown-kind behaviour unchanged but never use it from the drawer.

- [ ] **Step 4: Write failing Web API helper tests**

Assert exact `POST /api/agent/sessions` body `{ kind:'workspace.guide', title }`, exact `POST /api/agent/tasks` payload, and `Idempotency-Key` propagation.

- [ ] **Step 5: Implement Web API helpers and verify GREEN**

Run Worker and Web focused tests. Expected: both pass with no network access.

### Task 3: Accessible Hermes assistant drawer

**Files:**
- Create: `apps/web/components/hermes/HermesAssistantDrawer.tsx`
- Modify: `apps/web/components/hermes/HermesVisualAdapter.tsx`
- Modify: `apps/web/app/dashboard/page.tsx`
- Modify: `apps/web/messages/zh.json`
- Modify: `apps/web/messages/en.json`
- Modify: `apps/web/test/hermes-state.test.tsx`

**Interfaces:**
- `HermesVisualAdapter` changes from a navigation-only link to:

```ts
export interface HermesVisualAdapterProps {
  state: HermesVisualState;
  suggestion: HermesGuideSuggestion;
  onInvoke: () => void;
}
```

- Drawer props:

```ts
export interface HermesAssistantDrawerProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  suggestion: HermesGuideSuggestion;
  dashboardContext: WorkspaceGuidePayload['context'];
}
```

- [ ] **Step 1: Write failing component contracts**

Assert a button with an explicit accessible name invokes `onInvoke`, the drawer renders `role="dialog"` only when open, the goal form preserves text on a failed task, and a real task deep link remains available.

- [ ] **Step 2: Run focused Web tests and verify RED**

Run: `npx pnpm@9.15.0 --filter @openscience/web test -- hermes-state.test.tsx`

Expected: FAIL because invocation still navigates and no drawer exists.

- [ ] **Step 3: Implement drawer orchestration**

Use the existing project dialog/focus pattern. On submit: create one `workspace.guide` session, submit with `crypto.randomUUID()` idempotency, poll the existing task endpoint until succeeded/failed, and render only validated result fields. Do not auto-submit when opening.

- [ ] **Step 4: Add i18n copy**

Add matching `dashboard.hermes.guide` keys in `zh.json` and `en.json` for the truthful prompt variants, drawer labels, loading, retry, limitation, and supported actions.

- [ ] **Step 5: Verify focused GREEN**

Run the focused Web tests and typecheck:

`npx pnpm@9.15.0 --filter @openscience/web typecheck`

### Task 4: Idle behaviour grammar and state transitions

**Files:**
- Modify: `apps/web/components/hermes/HermesPetPortrait.tsx`
- Modify: `apps/web/components/hermes/HermesVisualAdapter.tsx`
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/test/hermes-state.test.tsx`
- Modify: `apps/web/test/e2e/hermes-dashboard.spec.ts`

**Interfaces:**
- Presence exposes `data-hermes-presence="idle|attentive|open|working|still"`.
- Existing one-active-frame and `data-hermes-part-signal` contracts remain.

- [ ] **Step 1: Write failing state and motion contracts**

Assert idle includes separate observation, node-sequence, and citation-trace signals with unequal durations; attentive/open pauses autonomous observation; working uses the working frame; approval/reduced motion sets every signal to `animation:none` and `transform:none`.

- [ ] **Step 2: Run focused tests and verify RED**

Expected failure: the existing implementation has only generic head/body/tail signals and no presence state or contextual prompt choreography.

- [ ] **Step 3: Implement the minimal behaviour grammar**

Reuse CSS-only non-pixel layers. Keep exactly one visible PNG frame. Use long, unequal cycles with rests, pause timers when `document.hidden`, and dispose listeners/timeouts on unmount. Pointer/focus changes presence to attentive; drawer open changes it to open.

- [ ] **Step 4: Add real browser assertions**

In Playwright, sample at condition-based intervals and prove at least three distinct idle changes, no duplicate active frame, prompt shown once, pointer attention, leave recovery, immediate still, and no horizontal overflow at 390 px.

- [ ] **Step 5: Run focused and browser GREEN**

Use the existing external single-server Playwright configuration and locked `playwright.CMD`; do not start a second Next server in the same `.next` directory.

### Task 5: Vertical acceptance, docs, and commit

**Files:**
- Modify: `docs/specs/2026-08-16-hermes-contextual-guide-design.md`
- Modify: `docs/plans/2026-08-16-hermes-contextual-guide-plan.md`
- Modify: `docs/progress.md`
- Modify: `project_index.md`
- Modify: `docs/handoff/2026-08-16-hermes-2d-pet-handoff.md`

**Interfaces:** none; this task records verified truth only.

- [ ] **Step 1: Run the affected automated gates**

Run sequentially:

```powershell
npx pnpm@9.15.0 --filter @openscience/agent-worker test
npx pnpm@9.15.0 --filter @openscience/web test
npx pnpm@9.15.0 --filter @openscience/web typecheck
npx pnpm@9.15.0 --filter @openscience/web build
npx pnpm@9.15.0 lint
npx pnpm@9.15.0 docs:lint
npx pnpm@9.15.0 audit:docs-sync
git diff --check
```

- [ ] **Step 2: Run the production-style browser acceptance**

Verify desktop, 390 px mobile, keyboard focus/close/restore, reduced motion, prompt truthfulness, idle story, pointer transition, drawer invocation, one deterministic mock `workspace.guide` response, task failure/retry, and asset fallback. Inspect screenshots/video; automation does not approve aesthetics.

- [ ] **Step 3: Request independent code review**

Review correctness, AgentTask/approval security, lifecycle cleanup, accessibility, i18n parity, and evidence honesty. Fix all Critical/Important findings and rerun affected gates.

- [ ] **Step 4: Synchronise current truth**

Check completed steps, record exact commands/results in progress and handoff, and update index file ownership/status. Do not claim deployment or user visual approval.

- [ ] **Step 5: Commit the verified implementation**

Stage only the tracked Hermes guide implementation, tests, messages, and synced docs. Preserve ignored visual evidence and unrelated worktrees.

```powershell
git commit -m "feat(web): make Hermes a contextual guide"
```
