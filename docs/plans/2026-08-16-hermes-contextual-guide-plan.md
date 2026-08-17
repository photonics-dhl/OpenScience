# Hermes Contextual Guide Implementation Plan

Status: **Guide/task implementation complete; visual renderer is owned by `docs/plans/2026-08-16-hermes-articulated-mesh-pet-plan.md`.** Renderer-specific statements below are historical where superseded by that plan.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Dashboard Hermes character a living contextual guide that opens a real, recoverable `workspace.guide` assistant drawer.

**Architecture:** Keep visual presence, prompt derivation, drawer orchestration, and Worker execution as separate units. Reuse the existing AgentSession/AgentTask APIs, AI Gateway, credit checks, queue, polling, and approval policy; add one validated Worker task kind and no database migration.

**Tech Stack:** Next.js 14, React 18, next-intl, TypeScript, Fastify, Redis AgentTask queue, `@openscience/ai-gateway` `SchemaGuard`, Vitest, Playwright.

## Global Constraints

- The contextual guide remains renderer-independent; visual motion must not alter its task, authorization, recovery or approval contracts.
- The three original PNGs may be textures/fallbacks. Wanko/Cubism/third-party character binaries remain gated by ADR-010, while the original articulated renderer is allowed.
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

- [x] **Step 1: Write failing prompt-priority tests**

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

- [x] **Step 2: Run the focused test and verify RED**

Run: `npx pnpm@9.15.0 --filter @openscience/web test -- hermes-state.test.tsx`

Expected: FAIL because `deriveHermesGuide` does not exist.

- [x] **Step 3: Implement the pure priority function**

Return only translation keys and safe IDs; use `hermesTaskHref(task)` for actionable task navigation and `/research-objects/<id>/edit` for an existing RO. Do not generate prose from titles or counts inside the function.

- [x] **Step 4: Run the focused test and verify GREEN**

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
  deps: Pick<AgentDeps, 'prisma'>,
  task: { id: string; payload: Record<string, unknown> },
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

- [x] **Step 1: Write failing Worker tests**

Test bounded payload validation, JSON structured output, maximum three next steps, supported intent allow-list, and malformed provider output failure. Stub `AiGateway.complete()` with deterministic JSON; do not call a network provider.

- [x] **Step 2: Run Worker tests and verify RED**

Run: `npx pnpm@9.15.0 --filter @openscience/agent-worker test -- workspace-guide.test.ts`

Expected: FAIL because the handler and registry entry do not exist.

- [x] **Step 3: Implement the handler and exact registry entry**

Build a system prompt that permits only read-only guidance and the three navigation intents. Validate provider JSON with the AI Gateway `SchemaGuard`. Anchor authorization to the guide task's AgentSession user, rebuild all requested ingestion/RO context from Prisma with current workspace membership, and revalidate returned targets. Register `'workspace.guide': async (deps, task) => workspaceGuideHandler(gateway, deps, task)` in `createHandlers`; leave unknown-kind behaviour unchanged but never use it from the drawer.

- [x] **Step 4: Write failing Web API helper tests**

Assert exact `POST /api/agent/sessions` body `{ kind:'workspace.guide', title }`, exact `POST /api/agent/tasks` payload, and `Idempotency-Key` propagation.

- [x] **Step 5: Implement Web API helpers and verify GREEN**

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

- [x] **Step 1: Write failing component contracts**

Assert a button with an explicit accessible name invokes `onInvoke`, the drawer renders `role="dialog"` only when open, the goal form preserves text on a failed task, and a real task deep link remains available.

- [x] **Step 2: Run focused Web tests and verify RED**

Run: `npx pnpm@9.15.0 --filter @openscience/web test -- hermes-state.test.tsx`

Expected: FAIL because invocation still navigates and no drawer exists.

- [x] **Step 3: Implement drawer orchestration**

Use the existing project dialog/focus pattern. On submit: synchronously lock the form, create one `workspace.guide` session and one task with separate stable idempotency keys, poll that same task until succeeded/failed, and render only validated result fields. A transient polling failure resumes the same task; a reload restores the newest existing guide task. Do not auto-submit when opening.

- [x] **Step 4: Add i18n copy**

Add matching `dashboard.hermes.guide` keys in `zh.json` and `en.json` for the truthful prompt variants, drawer labels, loading, retry, limitation, and supported actions.

- [x] **Step 5: Verify focused GREEN**

Run the focused Web tests and typecheck:

`npx pnpm@9.15.0 --filter @openscience/web typecheck`

### Task 4: Idle behaviour grammar and state transitions

**Files:**
- Modify: `apps/web/components/hermes/HermesRiggedPortrait.tsx`
- Modify: `apps/web/components/hermes/HermesVisualAdapter.tsx`
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/test/hermes-state.test.tsx`
- Modify: `apps/web/test/e2e/hermes-dashboard.spec.ts`

**Interfaces:**
- Presence exposes `data-hermes-presence="idle|attentive|open|working|still"`.
- One visual owner remains; character motion evidence is owned by the articulated-mesh plan and cannot be satisfied by decorative CSS signals.

- [x] **Step 1: Write failing state and motion contracts**

Assert the shared motion input carries idle, pointer/focus, drawer-open, working and still states into the articulated renderer. Approval/reduced motion must not create an active WebGL canvas; focus/open must change real mesh joints rather than only a DOM presence label.

- [x] **Step 2: Run focused tests and verify RED**

Expected failure: presence labels can change while the visible canvas remains on an autonomous `rest` gesture, and a short fixed loop can repeat without varied rests.

- [x] **Step 3: Implement the minimal behaviour grammar**

Drive the single OGL mesh through `HermesPetMeshInput`. Use a deterministic long grammar with varied action ordering and rests; pointer/focus and drawer-open write bounded engaged targets; hidden/offscreen/unmount pause or dispose the renderer. The three original PNGs remain textures/fallbacks, never stacked CSS animation owners.

- [x] **Step 4: Add real browser assertions**

In Playwright and the real-pixel harness, prove distinct idle character-pixel changes, non-affine head/torso/tail vectors, prompt shown once, focus/open `focus` articulation, pointer/leave recovery, immediate still, context-loss remount, pending-init abort, and no horizontal overflow at 390 px.

- [x] **Step 5: Run focused and browser GREEN**

Use the existing external single-server Playwright configuration and locked `playwright.CMD`; do not start a second Next server in the same `.next` directory.

### Task 5: Vertical acceptance, docs, and commit

**Files:**
- Modify: `docs/specs/2026-08-16-hermes-contextual-guide-design.md`
- Modify: `docs/plans/2026-08-16-hermes-contextual-guide-plan.md`
- Modify: `docs/progress.md`
- Modify: `project_index.md`
- Modify: `docs/handoff/2026-08-16-hermes-2d-pet-handoff.md`

**Interfaces:** none; this task records verified truth only.

- [x] **Step 1: Run the affected automated gates**

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

- [x] **Step 2: Run the production-style browser acceptance**

Verify desktop, 390 px mobile, keyboard focus/close/restore, reduced motion, prompt truthfulness, idle story, pointer transition, drawer invocation, one deterministic mock `workspace.guide` response, task failure/retry, and asset fallback. Inspect screenshots/video; automation does not approve aesthetics.

- [x] **Step 3: Request independent code review**

Review correctness, AgentTask/approval security, lifecycle cleanup, accessibility, i18n parity, and evidence honesty. Fix all Critical/Important findings and rerun affected gates.

- [x] **Step 4: Synchronise current truth**

Check completed steps, record exact commands/results in progress and handoff, and update index file ownership/status. Do not claim deployment or user visual approval.

- [ ] **Step 5: Commit the verified implementation**

Stage only the tracked Hermes guide implementation, tests, messages, and synced docs. Preserve ignored visual evidence and unrelated worktrees.

```powershell
git commit -m "feat(web): make Hermes a contextual guide"
```
