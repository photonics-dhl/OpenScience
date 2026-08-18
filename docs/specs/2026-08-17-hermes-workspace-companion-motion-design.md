# Hermes Workspace Companion Motion Design

Status: **CURRENT — user-approved for direct implementation on 2026-08-17; final visual acceptance pending**

Supersedes:

- `docs/specs/2026-08-16-hermes-articulated-mesh-pet-design.md`
- `docs/specs/2026-08-16-hermes-contextual-guide-design.md`

The superseded documents remain historical implementation evidence. This document is the only CURRENT product and renderer design for Hermes motion, contextual guidance, and Workspace presence.

## 1. Goal and invariant

Hermes is a living scholarly navigator and the primary entry to the platform assistant. It must:

1. establish life before pointer input;
2. react to pointer, focus, drag, task state, and writing state through visible character-pixel articulation;
3. travel to real workflow targets without covering the input area or stealing scroll control;
4. explain, draft, and review research content through the existing Hermes task, credit, permission, and audit chain;
5. remain interruptible, accessible, performant, and subordinate to the research work.

The non-negotiable visual invariant remains:

> A Hermes motion claim must be visible in character pixels or mesh joints. Moving only an enclosing bitmap, DOM label, glow, particle, or diagnostic attribute does not count.

## 2. Product character

Hermes uses a **70% scholar / 30% spirit-pet** personality mix.

- Scholar behaviour: reading, observing, comparing evidence, inspecting the six SDF nodes, tracing citations, composing a draft, checking a claim, and waiting quietly for a decision.
- Spirit-pet behaviour: stretching, curiosity, a brief doze and wake, gentle pointer avoidance, a small landing compression, limited patrol, and milestone dancing.
- It never scolds, begs for attention, performs unrelated comedy during focused work, or turns the Workspace into a game surface.
- The six evidence nodes remain the SDF memory device. The vermilion citation tail remains the provenance device. Star-ink wakes and page-crown motion must reinforce those meanings.

Default activity is **scholarly active**: after the 2026-08-17 product-size perceptual rejection, a readable micro-action occurs every 2.4–4.2 seconds and a signature action every 14–22 seconds. Actions use a quick anticipation, readable hold, and calm release rather than a brief sine pulse; the same action may not repeat immediately. Quiet writing and approval still retain their stricter suppression rules.

## 3. Motion architecture

Keep the original Hermes artwork, one Workspace owner, lifecycle ledger, WebGL2 preflight, and static fallback. Do not add Cubism, Rive, Three.js, Pixi, or a third-party character binary. The 2026-08-18 product-size browser review invalidates the former single full-image `Plane` constraint: a catalogue of named actions rendered through one warped illustration is not sufficient character articulation.

The live renderer therefore uses one WebGL context with a **semantic multi-bone rig**. Head and page-crown, eyes/face, torso, forepaws, citation tail, and six evidence nodes have independent pivots and pose channels while sharing one continuous character texture. Smooth authored joint weights preserve a single connected silhouette, so stronger articulation does not introduce raster cutout seams. Face state blends the approved idle/blink/working textures; effects remain separate and never count as character motion.

This is not a new mascot or a new assistant backend. It is a renderer correction that makes the already-approved character and action language perceptible.

Motion is composed from four independent layers:

1. **Base life layer** — slow breath, gaze drift, page-crown inertia, tail secondary motion, and sparse blinking. Parameters use independent periods and small stochastic variation.
2. **Primary action layer** — exactly one locomotion or semantic action such as patrol, guide, read, compare, draft, question, celebrate, or return-to-dock.
3. **Expression layer** — curiosity, focus, doubt, waiting, success, and failure offsets can blend over the current primary action.
4. **Brand-effect layer** — short star-ink wake, evidence-node sequence, vermilion citation arc, target marker, and bounded celebration particles. Effects never substitute for character articulation.

Priority is strict:

```text
approval still
> user drag
> contextual guide travel / target arrival
> Hermes task work
> pointer and focus interaction
> bounded idle patrol
> base life
```

Higher-priority input interrupts a lower-priority action immediately and begins from the current pose through a bounded blend. Users never have to wait for an animation to finish before typing, navigating, closing, or approving.

Each primary action is a short readable arc rather than a label applied to continuous idle noise:

1. anticipation (80–180 ms);
2. decisive action with a distinct silhouette or expression (180–700 ms);
3. feedback/hold (120–600 ms);
4. settled return from the current pose (180–500 ms).

At the rendered Workspace size, blink must close the visible eyes, observation must lead with pupils/head before the torso, stretch must separate crown/head/forepaws from the torso, citation trace must visibly articulate the tail, and patrol must translate the whole character. These are visual contracts, not diagnostic state names.

## 4. Action catalogue

The first release contains at least 25 action prototypes. Each prototype has direction, speed, rest, or amplitude variants rather than a single fixed loop.

### 4.1 Idle and patrol

- single and double blink;
- left/right observation with gaze leading the head;
- evidence-spine inspection;
- page-crown tidy and asymmetric flick;
- citation-tail trace and rebound;
- breath change and short stretch;
- brief doze, ear/page drop, and quiet wake;
- small surprise followed by recovery;
- notice a real task or notification;
- depart dock, inspect one real Workspace region, and return;
- reorient after viewport resize;
- settle after user drag.

Idle patrol stays on screen edges and outside the editing surface. It never scrolls, opens copy, or crosses the central writing region. Feature discovery may occur at most once per session and only for a real relevant capability; copy appears only after hover, focus, or click.

At product scale, the mesh-joint layer is supplemented by one bounded whole-character presentation layer. Patrol, observation, evidence check, stretch, doze, wake, surprise, and citation tracing may translate/rotate the character silhouette inside its safe dock without moving the prompt, invocation control, editor, or saved dock. At least six autonomous actions must move the real product silhouette by 8px or more; patrol must leave by 30px or more and return within 6px before the next autonomous action. Pointer approach moves the whole silhouette by at least 8px and resets only the pointer contribution on leave. Approval and reduced motion disable this layer exactly.

### 4.2 Pointer and direct manipulation

- gaze and head lead on approach;
- delayed torso follow and tail counter-motion;
- restrained lean toward slow pointer movement;
- small avoidance response to a fast pass;
- click acknowledgement before opening the assistant drawer;
- bounded press-and-drag pose;
- elastic travel to the user-selected dock after release.

The user may choose a dock even when it overlaps content. The system does not override that choice. Dock preferences are saved locally per device and Workspace, so desktop coordinates are not copied to mobile.

### 4.3 Work and result states

- read source;
- scan evidence nodes;
- compare two claims;
- organize a draft;
- trace citation provenance;
- wait on a tool;
- deliver a draft;
- discover a possible evidence gap;
- restrained failure settle;
- ordinary completion;
- milestone dance.

Ordinary field completion uses node light and a short citation arc. Completing a SDF group, creating an RO, committing, or publishing may trigger a 2–6 second dance with sparse local particles. It is skippable; reduced motion receives a static success pose.

## 5. Contextual travel and target guidance

### 5.1 Trigger policy

Use a hybrid policy:

- the first encounter with a critical step may guide automatically;
- later guidance requires a user request, a validation error, or at least two uncertainty signals;
- uncertainty signals include a critical empty field plus dwell, repeated validation failures, repeated delete/rewrite, or prior opening of relevant help;
- pause alone never triggers guidance;
- each field receives at most one proactive prompt per workflow version, subject to a global cooldown.

### 5.2 Semantic targets

Pages register targets through stable semantic IDs such as `research-question`, `source-import`, `sdf-method`, `evidence`, `hermes-diff`, and `commit`. A registry entry supplies:

- the live element resolver;
- allowed docking sides;
- safe clearance;
- guide intent and short localized copy;
- whether drafting, checking, or explanation is available;
- mobile placement rules.

The director must not use brittle visual selectors as the product contract. Missing or unmounted targets cancel travel and return Hermes safely.

### 5.3 Safe route

Hermes normally remains at the user dock. For guidance it:

1. resolves the target and current viewport;
2. travels along the nearest screen-edge corridor;
3. approaches from an allowed side without covering the editable rectangle;
4. uses a star-ink S-curve during travel;
5. performs one small body compression and page-crown opening on arrival;
6. shows a one-line bubble of at most 24 Chinese characters or an equivalent localized length.

If the target is off-screen, Hermes stops at the corresponding viewport edge and offers **Take me there**. Only explicit activation starts smooth scrolling. Hermes then follows and docks beside the target.

### 5.4 Guidance content and writing

The first bubble remains concise. Expansion offers three actions:

- explain the field requirement;
- draft from already authorized research materials;
- check the current content.

Generated content is displayed as a field-level highlighted diff. Generation alone never mutates the field. The user can accept all, accept selected hunks, edit a hunk, or reject. Accepted changes use the existing audit and approval rules.

While the user types, Hermes enters **quiet co-writing**: no patrol, no autonomous bubble, no travel, and no celebration. Only slow breath, gaze, and an occasional restrained nod remain. Rich motion resumes after writing settles.

## 6. Feedback semantics

- **Possible issue**: a small backward response, evidence nodes partially dim, and a vermilion marker beside the suspect content. Copy is evidence-oriented, not accusatory.
- **Success**: nodes illuminate in sequence and the citation tail closes a short arc. Milestones add the bounded dance and particles.
- **Failure**: Hermes remains present, settles, and truthfully offers retry, preserve input, and view reason. It does not silently replay a paid task.
- **Approval**: Hermes may escort the approval card into view and summarize scope. Once the approval UI is present, all character and effect motion stops until approve, reject, or close.

Sound is off by default. Optional sound uses restrained water, paper, and evidence-node cues. Voice starts only after explicit activation.

## 7. Responsive, accessibility, and preferences

- Desktop safe corridors use screen edges and target-side clearance.
- Mobile uses left/right edges and the area above the software keyboard. Hermes shrinks at a field target; guidance copy stays above the keyboard and outside the input.
- Hermes defaults to full motion on first use so the companion is visibly alive. A persistent stage control lets the user explicitly choose reduced motion; that saved choice and `?hermes-motion=reduced` retain the character, guidance, diff, and assistant actions while replacing travel, bounce, elastic return, and particles with static pose changes and fades. The control remains visible in both modes so the current state is never implicit.
- Keyboard users can invoke, dismiss, move between bubble actions, request travel, and return focus without pointer input.
- Escape cancels travel or closes the current bubble before closing the assistant drawer.
- A role menu exposed by right click, long press, or drawer settings offers Quiet / Balanced / Active, proactive hints, sound, particles, and reset dock. Default is Balanced/Scholarly Active.

## 8. Components and data flow

- `HermesStage`: the single Workspace-level character, Portal, drag, dock, and cross-route owner.
- `HermesAnchorRegistry`: semantic target registration and live geometry.
- `HermesBehaviorDirector`: priority, cooldown, anti-repeat, interruption, and deterministic test clock.
- `HermesMotionMixer`: four-layer parameter composition for the existing mesh renderer.
- `HermesPartRig`: semantic bones, pivots, joint weights, and per-bone transforms over the continuous approved texture.
- `HermesRuntimeStatus`: `starting | ready | fallback` plus safe reason, context generation, last real draw time, and retry intent.
- `HermesGuideBubble`: short guidance, off-screen edge action, and expanded help actions.
- `HermesDraftDiff`: formal Hermes task integration and non-mutating diff review.
- local preference adapter: device-and-Workspace position and motion settings.

```text
real page/task/input state
→ uncertainty and explicit intent
→ behavior priority
→ semantic target and route
→ layered mesh motion
→ guide action / formal Hermes task
→ highlighted diff
→ user-approved write
```

Visual navigation is R0. Drafting and checking use the existing AgentSession, AgentTask, AI Credit, queue, provider, permission, audit, idempotency, and crash-recovery chain. No parallel assistant backend is introduced.

## 9. Lifecycle and performance

- One Workspace owner, one mesh canvas, one WebGL context, and one active character.
- Multiple semantic bones share that one mesh, context, RAF, and lifecycle ledger; no bone may create its own draw owner or context.
- The stage transfers across route changes without duplicating character pixels.
- Hidden, offscreen, reduced, approval-still, failure-settled, and long quiet states stop unnecessary drawing while keeping event wake-up paths.
- Pending initialization remains abortable and context ownership remains transactional.
- Route or target teardown cancels geometry reads, travel, bubbles, timers, and task UI subscriptions.
- The scheduler uses bounded seeded variation for deterministic tests but does not expose a visibly short loop.
- No effect may require an additional full-screen WebGL context.

## 10. Acceptance

Automated and human acceptance must include:

1. a 90-second real idle recording with at least eight visible action types, no consecutive duplicate, and the approved cadence;
2. real character-pixel proof that head, torso, tail, crown, and eye regions do not reduce to one affine transform;
3. mixed-layer proof showing a base action continues under a one-shot interaction without seams, ghosting, or jumps;
4. five real semantic targets reached from different user docks without crossing the input rectangle;
5. an off-screen target that does not scroll until **Take me there** is activated;
6. quiet co-writing, issue feedback, ordinary completion, milestone dance, approval still, and failure recovery;
7. generation that leaves the field unchanged until full or partial diff acceptance;
8. mouse, keyboard, drag, touch, mobile keyboard, reduced-motion, asset failure, context loss, resize, and route-transfer coverage;
9. real renderer draw cadence, first-ready, resource transfer, suspension, and cleanup evidence;
10. final user review of the actual Workspace video and live preview. Numeric gates do not replace visual acceptance.
11. a product-size contact sheet in which at least eight autonomous actions are distinguishable without action labels or diagnostic attributes;
12. live runtime status that distinguishes `starting`, `ready`, and `fallback`, exposes a safe fallback reason and retry, and proves recent renderer-owned draws instead of equating a saved preference with a working canvas;
13. same-session acceptance using the user's motion preference and actual WebGL path; a fresh mocked Playwright context is supporting evidence only.

## 11. Research basis

The design adapts, rather than embeds, the following mature patterns:

- Rive state-machine transitions, layered animation mixing, and settled playback;
- Live2D motion priority, separate expression composition, and random parameter posing;
- Duolingo's shared character language, unique success reactions, and simultaneous pose/expression state;
- element-anchored contextual help and viewport-aware placement from Driver.js;
- purposeful, brief, cancellable, and reduced alternatives from Apple HIG and WCAG.

No official OpenAI document was found that specifies Codex Pet's animation grammar. Local Codex state confirms an independent avatar overlay and placement memory by display/resolution; unverified internal animation details are not requirements.

## 12. Memory hygiene

- This file is the only CURRENT Hermes visual/guide design.
- Superseded designs remain readable but start with `DEPRECATED` and point here.
- The CURRENT handoff, progress header, project index, and docs-sync renderer gate must all name this file.
- Tests must measure character pixels, target geometry, actual writes, and actual renderer draws; DOM diagnostics alone cannot establish visible completion.

## 13. Real Research Object production workflow acceptance

The canonical end-to-end sample is the public arXiv paper `2009.06045`, *On-chip sampling of optical fields with attosecond resolution*. The test imports the real PDF through the production ingestion path; a fixture, prefilled SDF, intercepted task result, or browser-only simulation cannot establish semantic acceptance.

The six-field extraction output must carry field text plus bounded source locators. The human gold rubric checks:

- `problem`: why visible/near-infrared field sampling remains inaccessible;
- `insight`: an ambient, integrated optoelectronic sampling device;
- `method`: resonant nanoantenna emission, attosecond electron bursts, weak probe and strong drive;
- `results`: the reported pulse energies and recovered transient/plasmonic response;
- `limitations`: boundaries actually stated or conservatively marked missing, never invented;
- `reproducibility`: device/material/setup/data/code facts actually present, with missing details disclosed.

The extractor must not truncate the document to one leading character window. It uses bounded section-aware chunks, preserves source offsets/page locators, merges claims without duplication, and returns `needsMoreInformation` for unsupported fields. Every proposal remains separate from SDF state until the user accepts that field. Partial acceptance writes only selected fields; version conflict, provider failure, parsing review, refresh, and retry preserve the task and source evidence.

Hermes motion is driven by the same real workflow state: receiving material, parsing, locating a field, drafting, checking evidence, waiting for a decision, missing information, accepted field, completed SDF, committed version, and failure. Each state has a distinct silhouette/expression/evidence-node sequence. Hermes travels only to the active semantic anchor, keeps the editable rectangle clear, and never performs success motion before the corresponding durable state succeeds.

Acceptance runs against the ECS production stack and the real MiniMax Gateway. Per the 2026-08-17 operator decision, local Docker is prohibited for this workflow; the local machine may edit code and act as a browser client only. Secrets come only from an existing server Secret or ephemeral authenticated browser session and are never printed, copied into reports, or committed.
