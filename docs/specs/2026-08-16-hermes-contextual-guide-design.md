# Hermes Contextual Guide Design

Status: **Approved for planning**
Date: 2026-08-16
Supersedes: none
Related visual asset spec: `docs/specs/2026-08-15-hermes-2d-pet-design.md`

## 1. Goal

Turn the Dashboard Hermes candidate from a lightly animated linked illustration into a contextual research guide that:

1. feels alive before pointer input;
2. offers restrained, truthful next-step guidance;
3. opens a real Hermes assistant without leaving the Workspace;
4. preserves the existing AgentTask, credit, permission, and approval model.

The approved product direction is **B — Contextual Guide**. Hermes is a guide and assistant, not a decorative pet, generic chatbot, or dense mission-control panel.

## 2. Experience contract

### 2.1 Idle behaviour

Hermes uses an asynchronous behaviour grammar rather than one short repeating loop:

- slow body breathing and floating;
- natural blink moments;
- small observation turns that do not track an absent pointer;
- six evidence nodes waking in sequence;
- a brief vermilion citation-tail trace that visually connects evidence to an RO;
- long rests between accents so the work surface remains calm.

The six nodes represent SDF structure; the vermilion tail represents citation and provenance. Motion must communicate `observe → organise → guide`, not add unrelated glow.

The sequence must not expose duplicate character pixels, ghosting, rapid periodic loops, or continuous attention-seeking. `prefers-reduced-motion`, approval, and other explicit still states remain fully still.

### 2.2 Contextual prompt

Hermes may show one concise suggestion derived from real Dashboard data:

1. an actionable ingestion or approval task;
2. an existing RO that can be continued;
3. an import/create starting point;
4. a neutral invitation when no context exists.

It must not claim to have found evidence, errors, or incomplete work unless the corresponding data is present. Prompts are low-frequency, dismissible, and do not repeatedly reappear during the same page visit.

### 2.3 Pointer and focus

On hover or keyboard focus, Hermes changes from autonomous observation to user attention:

- observation motion yields to the existing bounded gaze response;
- evidence nodes converge into a focused state;
- the label becomes an explicit `Invoke Hermes` action;
- leaving restores the idle grammar without snapping.

### 2.4 Invocation

Clicking the character, prompt, or explicit action opens a right-side assistant drawer. It does not navigate away from the Dashboard.

The drawer contains:

- Hermes identity and current contextual suggestion;
- the current session/task state;
- supported next actions;
- a goal composer;
- links into existing RO-specific Hermes review pages when needed.

On mobile, the same capability is presented as a full-height bottom sheet. Escape closes it, focus returns to the opener, and all actions remain keyboard accessible.

## 3. Real Hermes task loop

### 3.1 Task kind

Add the formal AgentTask kind `workspace.guide`. Do not use the worker's unknown-kind/demo fallback as a production assistant.

Input is a bounded payload containing:

- the user's stated goal;
- locale;
- route identifier;
- a minimal Dashboard context summary consisting only of IDs, titles, states, and counts already available to the current user.

The task must not receive arbitrary DOM text, hidden page content, credentials, or unrelated Workspace data.

### 3.2 Existing infrastructure

Reuse:

- `AgentSession` and `AgentTask` persistence;
- the existing `/agent/sessions` and `/agent/tasks` APIs;
- AI Credit checks;
- Redis dispatch and polling;
- AI Gateway provider routing and call logging;
- the R0–R4 approval model.

No database migration or parallel chat subsystem is required.

### 3.3 Result boundary

The first `workspace.guide` result is a structured research-guidance response:

- concise understanding of the goal;
- up to three ordered next steps;
- zero or more supported navigation/action intents;
- an explicit note when more information is required.

Read-only analysis may complete directly. Any write, delete, Merge, publish, or permission change must continue through the existing approval mechanism; the drawer cannot bypass or silently grant approval.

Unsupported goals return a useful limitation and safe next route rather than a fabricated success.

## 4. Component boundaries

### `deriveHermesGuide`

A pure function converts Dashboard overview data into one truthful prompt and supported action. It contains no timers, DOM access, or network calls.

### `HermesGuidePresence`

Owns the character, idle behaviour phase, prompt visibility, pointer/focus attention, and the drawer opener. It does not submit AgentTasks.

### `HermesAssistantDrawer`

Owns accessible modal behaviour, goal composition, task polling, retry, result rendering, and links to existing RO-specific workflows.

### `workspace.guide` worker handler

Validates the bounded task payload, calls the AI Gateway, validates the structured result, and records a recoverable AgentTask result. It cannot perform high-impact mutations.

These boundaries keep visual iteration independent from the Agent execution path and allow either side to fail without hiding the other.

## 5. States and failure handling

- `idle`: autonomous behaviour grammar and truthful prompt.
- `attentive`: pointer/focus attention; idle observation pauses.
- `open`: drawer visible; character remains attentive.
- `working`: submitted task is pending/running; working frame and progress are shown.
- `result`: structured guidance and actions are visible.
- `awaiting_approval`: all decorative motion stops immediately.
- `failed`: preserve the user's goal, show a retry action, and keep existing navigation available.
- asset failure: retain the current SVG fallback and full assistant functionality.
- API/auth failure: show the existing recoverable error or login path; never leave a blank drawer.

Closing and reopening the drawer restores the current session/task. A page reload recovers persisted task status through the existing API.

## 6. Accessibility, i18n, and performance

- All user-facing strings use the existing `next-intl` message files.
- The character action has an explicit accessible name; the prompt is not announced repeatedly.
- Drawer focus is trapped, Escape closes it, and focus returns to the opener.
- Desktop and mobile expose equivalent functionality.
- Reduced motion disables idle, pointer, transition, and prompt entrance animation while retaining content and actions.
- The implementation adds no Canvas, WebGL, Live2D runtime, 3D asset, or third-party mascot dependency.
- Timers pause while the document is hidden and are disposed on unmount.

## 7. Verification

### Unit and contract tests

- prompt derivation for actionable task, existing RO, empty Workspace, and error cases;
- no unsupported or fabricated claims;
- formal `workspace.guide` payload/result validation;
- AgentTask credit, ownership, idempotency, and unknown-kind boundaries;
- approval-required intents cannot execute directly.

### Browser tests

- idle behaviour shows multiple distinct, non-synchronous actions over time;
- no duplicate character frame or ghost exposure;
- prompt appears once and matches real mock Dashboard data;
- pointer/focus enters attentive state and leave restores idle;
- click opens the right drawer without route navigation;
- goal submission creates and polls a real `workspace.guide` task;
- result, failure/retry, close/reopen recovery, and RO deep links work;
- approval and reduced-motion states are immediately still;
- desktop, 390 px mobile, keyboard, overflow, console, and asset fallback gates pass.

### Acceptance

Automation is necessary but not sufficient. Final acceptance requires a user-visible local preview demonstrating the idle story, contextual prompt, pointer transition, drawer invocation, and one real Hermes response before merge or deployment.

## 8. Non-goals

- replacing the approved 2.5D constellation-dragon asset;
- returning to rejected Blender/3D/robot concepts;
- introducing Live2D before the ADR-010 licence gate is satisfied;
- creating unrestricted autonomous actions;
- building a general multi-thread chat product in this increment;
- changing database schema, quotas, or approval policy.
