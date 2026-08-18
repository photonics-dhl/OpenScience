# Readable Workspace and Hermes Guidance Design

Status: **CURRENT — approved for implementation**

Date: 2026-08-18
Extends: `docs/specs/2026-08-17-hermes-workspace-companion-motion-design.md`

## 1. Goal

The next release must solve one joined product problem rather than three visual symptoms:

1. authenticated and public product surfaces are tiring to read;
2. controls can become visually blank because component styles rely on browser defaults;
3. Hermes is animated but does not yet feel like an elegant, useful guide through a real blank-RO workflow.

The release succeeds only when a real user can create a private Research Object from a blank start, understand every option, receive visible but non-obstructive Hermes guidance, review field-level AI suggestions, and commit the accepted result on the public ECS deployment.

## 2. Product boundaries

The three established visual systems remain distinct:

- **Authenticated workspace:** a balanced scholarly workbench with moderate information density.
- **Public Research Object:** a serious editorial reading surface with improved navigation and metadata readability.
- **Landing:** the accepted optical art direction remains unchanged; only navigation, controls, and supporting-copy readability are corrected.

This work does not replace the Hermes character, WebGL renderer, Agent architecture, permission model, credit model, or SDF schema.

## 3. Reading system

### 3.1 Type roles

- Essential body and explanatory copy: 15–17 px, with 1.55–1.75 line height.
- Editable research content: 17–18 px where space permits.
- Navigation and controls: at least 14 px.
- Non-essential identifiers, timestamps, and technical status: at least 12 px.
- 10–11 px text must not carry an action, field name, instruction, error, or other necessary meaning.
- Monospace is reserved for identifiers, hashes, versions, and compact system status.
- Wide uppercase tracking is reserved for a few section eyebrows; it is not used for primary navigation, buttons, field labels, or instructions.

Chinese and English body copy use fonts intended for sustained reading. Mixed-script lines must retain stable baseline, weight, spacing, and fallback behaviour.

### 3.2 Contrast and controls

Every interactive element explicitly owns its foreground, background, border, disabled, hover, focus, and selected styles. No component may rely on the user agent button background or inherited foreground colour.

Necessary text and controls target WCAG AA contrast. Muted colours are limited to genuinely secondary information. Focus remains visually stronger than hover.

### 3.3 Layout

- Long-form copy uses bounded line length instead of stretching across the viewport.
- Primary action, field title, help, error, and current state form one obvious hierarchy.
- The authenticated desktop workspace reserves a stable assistant rail for Hermes.
- The public RO remains editorial, but its navigation and metadata cannot collapse into microtype.
- Mobile retains all actions and replaces the desktop assistant rail with a non-obstructive bottom guidance region.

## 4. Hermes behaviour

Hermes remains a 70% scholar / 30% spirit-pet guide. Its visible behaviour follows the existing semantic multi-part rig and action director; moving only a container, glow, label, or diagnostic attribute is not character motion.

### 4.1 Idle life

Idle motion must be perceptible without demanding attention. The repertoire includes breathing, gaze, evidence-node inspection, page-crown movement, citation-tail tracing, brief observation, stretch, doze/wake, and restrained patrol. Repetition is bounded so the same signature action does not immediately repeat.

During typing, Hermes enters quiet co-writing: breath, gaze, and occasional restrained acknowledgement remain; patrol, unsolicited bubbles, and celebration stop.

### 4.2 Guidance sequence

For a real workflow target Hermes performs:

1. **Observe:** identify the current route, focused field, completeness, and task state.
2. **Signal:** show one concise, evidence-oriented hint only when the target is actionable.
3. **Travel:** leave the user dock only for a specific target and use a viewport-edge corridor.
4. **Arrive:** make a short landing/attention action beside the target.
5. **Assist:** offer Explain, Draft, and Check only when supported by the target.
6. **Review:** show an evidence-bounded field-level diff; never mutate a field on generation alone.
7. **Resolve:** acknowledge accept/edit/reject, then return to the chosen dock.

### 4.3 Non-obstruction invariant

The Hermes character, bubble, trail, and diff surface must not intersect the active editable rectangle.

Placement order is:

1. reserved assistant rail;
2. available whitespace beside the target;
3. viewport edge with a **Take me there** action;
4. mobile bottom guidance region.

If no safe placement exists, Hermes stays docked and highlights the target without travelling. User-selected docking remains allowed because the user explicitly accepts that placement risk, but automatic guidance still avoids the active input.

Approval and explicit reduced-motion states remain still. Missing targets cancel travel and return Hermes safely.

## 5. Draft and approval contract

The blank-RO path accepts the researcher's own title and short research brief as the evidence boundary. Hermes may transform that material into suggestions, but it must distinguish provided facts, plans, hypotheses, unknowns, and absent results.

Generated content is displayed as a field-level highlighted diff. The user may:

- accept a complete suggestion;
- edit before accepting;
- reject it;
- leave a field unresolved.

Only accepted text is written. Existing permission, AI Credit, idempotency, audit, save, and commit boundaries remain authoritative.

## 6. Public production acceptance

Acceptance runs on the public ECS deployment with a real administrator account, real MiniMax routing, real APIs, and no request interception or visual-harness route.

### 6.1 Controlled blank-RO scenario

Create a private RO from blank input. The source brief describes a planned comparison between unconstrained generation and evidence-bounded, field-level extraction with human diff approval. It explicitly provides a problem, hypothesis, method, sample boundary, limitations, and reproducibility plan, while deliberately providing no experimental result.

Hermes must:

- guide the user from title to the relevant six SDF fields;
- extract `problem`, `insight`, `method`, `limitations`, and `reproducibility` without changing scientific meaning;
- state that `results` are not yet available instead of inventing a number or conclusion;
- support at least one accept, one edit-then-accept, and one reject action;
- persist only accepted text through save, refresh, and commit;
- expose the resulting task, credit, and audit facts without duplicate submission.

The private acceptance RO remains labelled as test evidence. It is not deleted without explicit user approval.

### 6.2 Visual evidence

One uninterrupted public-browser recording must visibly include:

- readable blank-create and editor controls;
- natural idle motion before interaction;
- missing-field signal;
- safe travel and arrival beside the correct field;
- working motion during generation;
- still review posture while the user decides;
- accept/edit/reject feedback and completion response;
- no overlap with active fields, diff text, or primary actions.

Desktop, mobile, Chinese, English, keyboard focus, explicit reduced motion, and normal motion are checked. Automated evidence must use final rendered pixels or computed styles; renderer data attributes alone are insufficient.

## 7. Error and recovery behaviour

- Model, network, or task failure leaves the user's text intact and offers a single idempotent retry.
- Refresh restores the same task and pending diff instead of creating another task or charging twice.
- Missing or off-screen anchors return Hermes to a safe dock.
- Renderer failure uses a static portrait without hiding controls or guidance copy.
- Approval never proceeds silently when a suggestion lacks evidence or contains an unresolved claim.

## 8. Out of scope

- A new mascot or 3D/Live2D/Rive runtime.
- Automatic publication or silent SDF mutation.
- Changing AI Credit policy, permissions, schema, or production topology.
- Redesigning the accepted Landing optical composition.
- Deleting historical or user-owned assets.

## 9. Release decision

Local tests and recordings are preflight only. The feature is releasable after public ECS build and health checks, the real blank-RO acceptance above, and direct user visual review. A technically moving character does not substitute for elegance, readability, or useful guidance.
