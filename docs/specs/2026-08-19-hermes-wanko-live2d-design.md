# Hermes Wanko Live2D Companion Design

Status: **CURRENT — §13.6 application `8d1409e` is deployed in immutable release `6b804f7`; automated, public and original-viewport operator gates pass; user visual acceptance remains pending**

Supersedes only the visual renderer and motion-authoring portions of:

- `docs/specs/2026-08-17-hermes-workspace-companion-motion-design.md`
- the rejected local Codex-Pet-style sprite candidate preserved in Git stash

The existing Workspace guide, semantic anchors, safe path planner, user dock,
reviewable diff, permission, AI Credit, audit and blank-RO workflow remain the
implemented product foundation.

## 1. Product goal

Hermes is the living scholarly navigator and the primary assistant entry for
OpenScience. The first Wanko release must make that role perceptible before any
pointer input and must help users complete real research work rather than merely
decorate the interface.

The character is a phase-one production validation asset, not a permanent or
exclusive OpenScience trademark. Wankoromochi keeps its original mochi-dog
identity. OpenScience identity is added outside the character through evidence
nodes, page trails, restrained scholarly light and field guidance.

## 2. Visual and interaction thesis

- **Visual thesis:** a warm mochi-dog research companion always seated in a
  compact cosmic-teapot starship inside a precise scholarly workbench. The
  carrier is a small cockpit around canonical Wanko, not a large illustration
  that dominates the editor; soft character physics contrast with restrained
  ink, paper, deep blue-black enamel and warm evidence light.
- **Content plan:** orient the user, reveal the next meaningful action, help with
  a reviewable suggestion, then return attention to the research surface.
- **Interaction thesis:** short distances use anticipated hops or steps; long
  distances use a page/evidence trail transition; arrival always settles before
  gaze, gesture and guidance copy begin.

Hermes never moves as a uniformly translated sticker. Every travel sequence is:

1. orient to the target;
2. compress or lean in anticipation;
3. accelerate along the planned safe path;
4. trail physical secondary motion in ears, body, bowl and steam;
5. decelerate and settle at the target-side anchor;
6. look at and indicate the target;
7. wait, react to the user decision, then return or continue.

## 3. Activity policy

Hermes is proactive only at meaningful workflow boundaries:

- blank RO creation;
- artifact ingestion and extraction milestones;
- missing evidence or invalid fields;
- draft/check suggestions becoming reviewable;
- approval or commit decisions;
- successful RO/version creation;
- recoverable failure.

During ordinary typing Hermes remains at its dock and uses quiet local motion.
It never crosses editable content merely to entertain. The user can pause motion,
drag Hermes to a preferred dock and accept the resulting obstruction risk.

## 4. Motion vocabulary

The first release requires at least 24 visibly distinguishable behaviours:

- eight idle behaviours: breathe/blink, left observation, right observation,
  head tilt, ear response, stretch, bowl/steam inspection and doze/wake;
- five direct interactions: gaze follow, tap response, drag resistance, summon
  approach and dismiss retreat;
- five guide behaviours: anticipation, short hop/step, long evidence-trail
  transition, arrival indication and return-to-dock;
- four work behaviours: scan, collect evidence, compare/think and compose;
- two outcomes: milestone dance/celebration and puzzled/missing-evidence response.

Approval and explicit reduced-motion use a deliberately still pose and are not
counted among the 24 behaviours.

Motion is a four-layer composition:

1. original Wanko `.motion3.json` clips;
2. a procedural director for gaze, expression, breathing and secondary physics;
3. additional authored Cubism clips for product-specific gestures;
4. the existing DOM stage path for route-persistent travel and collision safety.

Named catalogue entries do not count as different behaviours unless a browser
pixel gate can distinguish their character motion or pose.

## 5. Runtime architecture

The route-persistent `HermesWorkspaceStage` remains the sole product owner. Its
existing state, anchor, route, dock, bubble and diff interfaces do not change.

`HermesRiggedPortrait` will lazy-load one dedicated Wanko runtime owner:

```ts
export interface HermesLive2DInput {
  action: HermesActionId;
  focus: { x: number; y: number };
  reducedMotion: boolean;
  state: HermesVisualState;
}

export interface HermesLive2DOwner {
  dispose(): void;
  resize(): void;
  setSuspended(value: boolean): void;
  wake(): void;
}
```

The owner dynamically loads Cubism Core, Pixi and the Cubism 4 display adapter;
loads exactly one model, one texture and the selected motion; and reports real
draw/motion snapshots through the existing runtime-status boundary. No second
Hermes canvas or task-state owner is allowed.

Initialization must be abortable. Hidden, offscreen, approval and explicit
reduced states must suspend or dispose work immediately. Context loss gets one
automatic fresh-canvas recovery, then a stable accessible fallback and manual
retry, matching the current production lifecycle contract.

## 6. Asset and licence boundary

Runtime publication contains only the browser-required Wanko `.moc3`, texture,
model/physics/display manifests and motion files. Editable `.cmo3`/`.can3`, source
archives and alternative downloaded models remain outside the public bundle.

The repository records source URL, original file hashes, prescribed copyright
notice and the exact runtime-file inventory. Public deployment is blocked until
the operator records acceptance of the Live2D Free Material/Sample Data terms
and confirms the applicable Cubism SDK AI/chatbot publication licence. Local
development may proceed without representing that publication permission as
complete.

## 7. Brand presentation

OpenScience presentation surrounds canonical Wanko and must not redraw it into
a different character:

- the compact carrier remains visible in every normal-motion state;
- evidence nodes appear only during scan/compare/draft actions;
- a navigation/evidence trail appears only for travel and fades after landing;
- celebration uses a brief vermilion/gold scholarly particle sequence;
- guide copy remains an accessible DOM surface and never becomes texture text;
- controls retain the existing workbench typography, focus and contrast system.

The character and effects remain subordinate to inputs and reading. Automatic
placement must not overlap the active input, diff actions or primary commit
button. Mobile uses edge docking and reduced travel amplitude.

## 8. Cleanup and memory truth

- The rejected v5 sprite candidate is kept only in a named Git stash and removed
  from the active worktree.
- The constellation-dragon worktree retains its latest editable `.blend` source;
  `.blend1`, render frames, contact sheets and generated inspection artefacts may
  be removed after exact path/type/reparse validation.
- Historical specs remain as evidence but are marked superseded and removed from
  the read-first chain. They must not advertise a CURRENT implementation action.
- `docs/progress.md`, the CURRENT handoff and `project_index.md` stay bounded and
  carry the exact branch / HEAD / release / rollback tuple.

## 9. Acceptance

Completion requires all of the following:

1. a real browser shows Wanko pixels before pointer input and at least 24
   distinguishable actions across deterministic fixtures;
2. a 90-second idle record contains no immediate duplicate, no long lifeless gap
   and at least two scholarly signature actions;
3. pointer, drag, summon, guide travel, work, success, failure, approval and
   explicit reduced states are attributed to real pixels, not data attributes;
4. travel paths retain the current collision and target-side arrival gates;
5. one uninterrupted blank RO workflow demonstrates extraction, missing-field
   guidance, evidence-bounded diff, user decision, immutable commit and milestone
   celebration without network interception;
6. normal/reduced, desktop/mobile, hidden/offscreen, context loss, route transfer
   and unmount lifecycle gates pass with one owner and balanced resources;
7. bundle/transfer and sustained renderer cadence are measured rather than
   inferred;
8. the user accepts the live Workspace visual before commit, public deployment or
   retirement of the current production renderer.
9. desktop and mobile captures prove that the carrier's visual, interactive and
   travel bounds remain distinct and that the compact spout/handle do not cover
   an active field, diff action or primary commit control.

## 10. Native Cubism genie-lamp source variant

The pasted carrier, floating-plume correction and flat-vector lamp experiment
are rejected. The accepted direction is a separate Cubism source variant whose
integration quality inherits the original bowl: Wanko is the cute genie rising
from one model-owned opening, with rear ArtMeshes behind the body and a front
rim plus low vapor hiding only the lower body transition. No runtime layer may
impersonate that relationship.

On 2026-08-22 the user explicitly selected the **single approved atlas + native
Cubism ArtMeshes** path. The approved complete lamp raster remains one
model-owned `texture_01` source; separate rear, front-shell, front-rim, opening,
spout, handle and brand ArtMeshes sample controlled regions of that atlas and
obtain their physical relationship from Cubism draw order, masks and deformers.
This approval does not revive automatic PNG cut-outs: two bounded mask-derived
splits produced rectangular alpha artifacts and are permanently excluded.
Because `wanko_genie_v08.cmo3` already exists, the next non-overwriting authoring
target is `wanko_genie_v09.cmo3`; v08 is preserved as prior user work until its
semantics are independently identified.

Cubism 5.3 cannot create model ArtMeshes from arbitrary PNG/JPG canvas drops;
the supported add-to-existing-model path is PSD import. Therefore a PSD may be
used only as a lossless transport container: the approved lamp and brand remain
at their native `2079×756` coordinates with no resize, resample, mask-derived
split or Photoshop color/alpha rewrite. A separately authored front-rim/front-
shell occluder is the only new visible geometry. A solo-layer pixel/alpha audit
must match the signed lamp input before Cubism may open the derivative.

### 10.1 Source and preservation boundary

- `wanko_touch_t01.cmo3` and `wanko_motions_t01.can3` are protected originals.
  Cubism Editor work occurs only on named copies; opening or upgrading the copy
  must never overwrite the source package.
- Canonical Wanko face, ears, upper torso, hands, deformers, physics and motion
  identity stay recognizable. The variant changes the bowl/effect presentation,
  not the character into a newly drawn dog.
- The original native bowl capture is the structural reference: rear opening
  below Wanko, front rim in front of the lower body, and hands remaining above
  the rim. The red bowl pixels are not stretched into a lamp.
- The current zero-image floating plume is historical evidence only and must not
  return as a production fallback.

### 10.2 Model-owned art and draw order

The approved visual thesis is **cute celestial navigator in a miniature
indigo-and-gold genie lamp**. Canonical Wanko is the memory anchor, not the
vehicle. At the neutral front pose Wanko occupies about `68%` of the combined
opaque height and the lamp about `32%`; total lamp width is at most `1.25x`
Wanko body width. The lamp uses a low oval body, narrow gold opening, slender
upturned spout and open S-shaped handle. A kettle, cup, bowl, saucer, UFO, thick
round handle or symmetric clip-art silhouette fails the gate.

Before any Wanko composite or Cubism import, the lamp alone must pass a
silhouette gate. Its central body is `0.82–0.92x` Wanko body width; the complete
spout-to-handle span is at most `1.20x`; the lamp contributes `28–32%` of the
combined character height. The spout is tapered, thin and gently upturned; the
handle is a narrow open S/C curve rather than a closed ring. The source art is
redrawn with Photoshop vector/shape layers from the concept's visual language,
not cut from concept pixels and not derived from the rejected flat-vector
teapot. Deep indigo enamel, restrained warm-gold edges and a low horizontal
silhouette must read as an Aladdin genie lamp at `160 CSS px` before material,
vapor, branding, Wanko placement or Cubism rigging may proceed.

The six-dimensional evolution story is a secondary inlaid surface detail, not
a sticker or dominant neon circuit: one thicker input enters a vertical open
centre, then three independent fan routes carry exactly two blue metadata nodes
each. The upper and lower routes end naturally without rejoining; only the
middle route reaches one warm-orange diff result. The lines follow the lamp
curvature. Vapor, glow and shadow remain separate source layers and cannot
compensate for a weak lamp silhouette.

This is an **original-bowl structural metamorphosis**, not a stretched repaint:

- keep the original bowl Part/deformer relationship and its proven rear/body/
  front-rim/hands ordering;
- author replacement lamp ArtMeshes inside that model hierarchy and inherit the
  restrained `PARAM_BOWL_SWING` response;
- retain the old red-bowl ArtMeshes until the replacement passes Editor and
  browser visual gates, then disable them in the derivative only;
- keep Wanko's canonical head, ears, face, hands and upper torso unobscured;
  hide the original bowl pixels only after the replacement passes its gates,
  while retaining the original bowl rotation deformer as the invisible shared
  root for Wanko and the replacement smoke support;
- let dense blue-gold smoke replace the bowl's visible support and lower-body
  seal, wrapping approximately `28–35%` of the lower abdomen. Its interior reads
  near-opaque and weight-bearing while only the outer contour feathers. It may not erase, redraw or melt
  the character into a ghost tail.

The variant adds model-owned source art and ArtMeshes in this fixed order:

1. rear handle, rear spout, rear shell and opening glow;
2. rear blue smoke crown, left/right flow and gold support core;
3. canonical Wanko torso and head;
4. semi-transparent front smoke veil and denser contact rim, hiding only the
   lower transition;
5. canonical hands above the smoke rim;
6. restrained front highlight and the six-dimensional brand mark.

Wanko remains the largest and cutest visual mass. The lamp stays close to the
original bowl footprint; spout and handle establish the symbol without
dominating the workbench or expanding collision needlessly.

The existing `1024x1024` atlas has no lamp, spout, handle or blue-gold brand art
and is already densely occupied. Preserve canonical Wanko pixels and UVs in
`texture_00`; add a model-owned `texture_01` for lamp, vapor and brand ArtMeshes.
This is ordinary Cubism model authoring exported with one `.moc3` and one
`model3.json`, not runtime image compositing. Active and fallback DOM still use
no carrier `<img>`, `<picture>`, decorative SVG, poster, Pixi sprite, shader mask
or separately decoded lamp/vapor asset.

### 10.3 Parameters, motion and Codex Pet lessons

- Reuse `PARAM_BOWL_SWING` only for restrained lamp-root secondary motion. The
  existing physics output already gives the native bowl its body-coupled sway.
- Do not attach state-critical replacement meshes to `PARAM_BOWL_LID`,
  `PARAM_YUGE_01/02` or `PARAM_EFFECT`. All twelve stock motions contain those
  curves, and the current renderer applies directed parameters before the
  model's motion update, so a stock curve may overwrite them in the same frame.
- Add six isolated parameters outside every stock motion:
  `PARAM_LAMP_COMPACT` (`0..1`, default `0`), `PARAM_LAMP_VAPOR` (`0..1`, default
  `.32`), `PARAM_LAMP_STORY` (`0..1`, default `.18`),
  `PARAM_LAMP_TRAIL_X/Y` (`-1..1`, default `0`) and `PARAM_LAMP_DIFF` (`0..1`,
  default `0`). Compact keyform `1` pulls only the spout and handle inward.
- Add four smoke-only parameters outside every stock motion and Physics output:
  `PARAM_SMOKE_BREATH` (`-1..1`, default `0`), `PARAM_SMOKE_FLOW` (`-1..1`,
  default `0`), `PARAM_SMOKE_TRAIL` (`-1..1`, default `0`) and
  `PARAM_SMOKE_ENERGY` (`0..1`, default `.28`). They respectively own slow
  expansion/lift, opposed left/right flow, travel compression/trailing and the
  work/celebration core width plus luminosity. Wanko pixels never become smoke
  keyforms.
- The pre-existing `PARAM_LAMP_VAPOR` remains an opening-glow/legacy lamp-state
  control and cannot own any replacement-smoke geometry or opacity.
- Frame ownership is fixed: stock motion/expression/Physics evaluate first;
  Hermes writes the four smoke-only parameters second; `model.update()` consumes
  the resulting values. Resume clamps elapsed time and preserves phase so smoke
  cannot jump or reverse after visibility/Intersection suspension.
- State targets are bounded: idle `.32/.18/0`, focus `.38/.32/0`, travel
  `.52/.25` plus route-normalized trail X/Y, work `.58/1` with diff `.2→.85`,
  approval `.30/.55/.75` held exactly still, success `.75/1/1→0`, and reduced
  `.32/.35/0` rendered once then frozen. The triplets are vapor/story/diff.
- Codex Pet contributes behaviour principles only: task-state pose families,
  directional head/body/ear focus, brief hover response, anticipation/settle,
  and a quiet waiting state. No Codex Pet pixels or renderer are copied.
- Workspace continues to own whole-actor travel, drag, collision, dock, guide
  bubble, task state and approval. Model parameters never become page position.

### 10.4 Six-dimensional brand and state isolation

The lamp body contains exactly six blue metadata nodes, one vertical open
centre, three non-rejoining fan routes and one warm-orange diff result reached
only by the middle route. Each route contains exactly two circular blue-white
nodes. They must read as enamel native to the curved lamp surface, never as a
neon circuit diagram pasted over it. These are separate model ArtMeshes so
state opacity and small-size LOD can be driven without baking the travel trail
into the lamp.

- idle/focus: quiet lamp mark, no outbound trail;
- travel: model-owned short directional trail follows the actual route;
- work/scan: the middle route carries the differentiated orange result while
  all six source nodes remain traceable across the three routes;
- approval/reduced: one deterministic non-empty frame, then exact stillness;
- success: one native Wanko celebration plus a single restrained node release.

Rear smoke may rise beside the torso to the ear line, as in the approved genie
reference, but stays behind Wanko and cannot cross the face or close over the
head. Front smoke remains at the lower transition. Neither layer may create a
ghost crown, tentacles, detached foot-tail or body-melting silhouette.

### 10.5 Mobile, hulls and runtime

One model and atlas set serve desktop and mobile. Mobile uses
`PARAM_LAMP_COMPACT=1`, shorter travel and edge docking; CSS cropping or a second
mobile illustration is forbidden. The interaction hull surrounds Wanko and the
opening with a minimum `44 CSS px` target. The travel/collision hull is the alpha
union of desktop/mobile compact endpoints and maximum action poses, including
spout and handle but excluding transient outer smoke wisps, particles or trail.
The smoke `visualBounds` includes those wisps only for crop safety; the movement
hull includes Wanko, the gold support core and lamp; the interaction hit area
remains canonical Wanko and is never blocked by the front veil.

`HermesRiggedPortrait` retains one canvas, one Cubism model, one owner and one
renderer clock. First implementation should use fixed draw order rather than
new clipping masks. If a mask becomes necessary, the real Cubism mask path must
be tested because the current runtime was verified only with the original
no-mask model. Failure remains an accessible textual Hermes control, never a
poster or character illustration.

### 10.6 Tooling and acceptance gate

Cubism Editor `5.3.03` PRO Trial is installed and its executable signature was
verified. Protected `v01` retains the source `.cmo3` SHA-256
`07EE5F56ED4E63A131BE0C2585BDDAA20C54C7BD004AA2DB3EA7F1403FDA1649`.
The v02 path matched that hash at the original checkpoint but was rewritten by
the recorded 2026-08-22 automation incident; it is not a protected-byte anchor
and must not be overwritten or deleted without user approval.
A no-change SDK 4 export closed its manifest and loaded through the existing
browser owner with idle and pointer pixels plus exact-static approval/reduced.
The first flat-vector PSD was visually rejected and remains historical only.
A separate `wanko_genie_v03.cmo3` proves the intended source path with nine
PSD-imported Cubism ArtMeshes while v01 retains the original bytes. The
derivative is a structural checkpoint, not approved art and not a
browser/runtime bundle.

API 1.0.1 confirms all six isolated `PARAM_LAMP_*` definitions. Vapor and story
already have native `0,1` opacity keyforms; compact, trail X/Y and diff remain
unbound. The orange diff result must become its own ArtMesh rather than sharing
the six-dimensional story mesh. Further authoring must first pass a clean Editor
capture showing front-rim lower-body occlusion, spout, handle, low vapor and
enamel topology together; the current checkpoint does not satisfy that gate.
The object inventory fixes the diagnosis: `D_BODY_00` is draw order `400` and
`GENIE_FRONT_SHELL` is already `500`. Residual lower-body pixels therefore must
be fixed by shell coverage and the native bowl parent/deformer relationship,
not by raising front-layer order again.

Acceptance requires direct Editor and real-browser evidence: canonical Wanko
identity preserved, native front-rim occlusion, no feet below the opening,
desktop/mobile compact endpoints, six-node small-size readability, state
isolation, pointer/action pixels, exact static approval/reduced, balanced
resources and real Workspace obstruction gates. ADR-010 operator/sample-data
and SDK publication records, user visual approval and separate ECS authorization
continue to block public deployment.

### 10.7 Smoke-bowl replacement geometry and animation gate

The user-approved smoke-bowl replacement hides the original bowl ArtMeshes but
keeps `B_BOWL_01` and its proven `PARAM_BOWL_SWING` response as an invisible
shared root. Under that root, the minimum authored structure is four new Warp
Deformers and six ArtMeshes:

```text
D_SMOKE_ROOT
├─ D_SMOKE_REAR_FLOW
│  ├─ M_SMOKE_REAR_L
│  ├─ M_SMOKE_REAR_R
│  └─ M_SMOKE_WISPS
├─ D_SMOKE_CORE_LIFT
│  └─ M_SMOKE_CORE
└─ D_SMOKE_FRONT_SEAL
   ├─ M_SMOKE_FRONT_VEIL
   └─ M_SMOKE_FRONT_RIM
```

All six meshes share one source coordinate system and one lamp-opening anchor.
The contact cradle is `60–72%` of Wanko body width and narrows to `20–28%` at the
lamp opening. Fixed draw order is rear smoke/core below the body, front veil/rim
above the body, and canonical front paws above the smoke rim. A monolithic smoke
composite, independently eyeballed anchors or a runtime image layer fails.

Neutral idle uses an `8–11 s` non-resetting breath cycle with opposed rear-flow
phase. Focus contracts the core; travel compresses the support about `12%` and
trails opposite movement; guidance extends one rear wisp toward the target;
work/scan raises `PARAM_SMOKE_ENERGY`; success performs one bounded lift and
settle. Approval and reduced motion render one deterministic non-empty neutral
form and then stop all smoke phase advancement.

State targets are bounded: idle flow amplitude `.22`, trail `0`, energy `.28`;
focus `.08/0/.36`; travel flow follows the local heading, trail is clamped to
`-1..1`, energy `.42`; work/scan `.16/0/.72`; approval and reduced
`0/0/.24` held exactly still; success reaches energy `1` once and settles to
`.28`. Breath is a continuous phase, not an action-reset keyform.

Before final source generation, Editor evidence must prove that the front paws
can remain above the front smoke and that the hidden bowl root can drive Wanko
and smoke without a second owner. Acceptance then requires neutral, swing
extremes, travel trail and exact-static captures; parameter traces proving stock
motions cannot overwrite the four smoke parameters; no mesh inversion, holes or
draw-order swaps at extrema; and real desktop/mobile frame-time, alpha-overdraw,
crop, collision, suspension/resume and context-recovery gates. Until those
checks pass, generated smoke is source-art study only, not a production asset.

## 11. Lively performance beats and annotation bubbles

> **2026-08-23 product-context correction:** The assistant is peripheral
> workspace chrome, never page content. The earlier action-laboratory preview
> over-weighted motion coverage and is visually rejected. Scholar's Tea is the
> behavioural reference for a movable, viewport-clamped, position-persistent
> assistant that recedes while the user works; OpenScience keeps its own
> optical-editorial visual language.

The approved production-ratio enhancement starts from the exact ECS release
`c97926a`, not from the local diagnostic canvas. That release renders ordinary
desktop Hermes at `288 CSS px` and the compact/mobile endpoint at `160 CSS px`.
Both endpoints increase by exactly `1.25x`, to `360 CSS px` and `200 CSS px`.
The approved v09 model, texture, hat, tassel, lamp and smoke silhouette do not
change.

The current Dashboard right-rail `HermesDockAnchor` remains the default home and
the Dashboard information architecture does not move. A deliberate whole-actor
drag detaches Hermes into a floating companion; release commits a viewport-
clamped position, stored separately for desktop and mobile. Resize and
orientation changes reclamp the saved point so the actor always remains
recoverable. A click without drag opens the existing assistant drawer. Dragging
must not open the drawer and must dismiss a speech cue whose placement or
context is no longer current.

The actor and bubble have separate measured collision footprints, with their
union used for viewport clamping and obstruction checks. The bubble flips by
viewport quadrant and prefers the side facing open space. Neither footprint may
cover the Dashboard create/import actions, Continue Research action, current
Hermes task rail, primary navigation, approval controls or assistant drawer
controls. Making Hermes peripheral comes from quiet timing and movable
positioning, never from reducing the agreed `360/200` scale.

### 11.1 One semantic performance owner

Motion and language are selected as one `HermesPerformanceBeat`, never by two
independent random selectors. A beat contains one existing semantic action,
one deterministic visual variant, an optional localized speech cue, duration,
priority, cooldown and interruption policy. The current single Cubism
model/canvas/RAF owner remains unchanged. Phase 1 reuses the twelve exported
v09 motions plus bounded parameter and actor-transform layers; it does not open
Cubism Editor, change source art or export another model.

Four decks share the same director:

- ambient: lively `3–6 s` micro cadence and `12–20 s` signature cadence;
- direct interaction: whole-character hover, press, drag and release feedback;
- field guidance: travel, arrive, point, explain and wait-for-input beats;
- task truth: scan, read, compare, draft, missing evidence, success, failure and
  approval beats derived only from real product state.

The personality mix is approximately `60%` familiar-spirit and `40%` scholar.
Seeded deck traversal must avoid immediate repetition and expose at least twelve
perceptually distinct actions in a 90-second lively idle session. A signature
beat finishes before another autonomous action can replace it.

### 11.2 Bubble language and visual system

The bubble is an optical-editorial edge annotation, not a cartoon cloud, card or
modal: a low-contrast ink surface, paper-white text, one restrained vermilion
status mark and a short citation-thread pointer. It is at most `15.5rem` wide,
uses the fixed `4 px` surface radius, and contains no large light rectangle or
decorative shadow stack. The intent label and speech use the existing compact
UI/data typography so the note reads as workspace chrome rather than an article
excerpt. Entry is only opacity plus a `4 px` upward settle
with `cubic-bezier(.16, 1, .3, 1)`; there is no bounce, glass blur or decorative
gradient. Buttons keep a `40×40 CSS px` minimum hit area, visible focus and an
interruptible `scale(.95)` active state.

Every cue is a `next-intl` key with matched Chinese and English variants. Chinese
ambient lines target at most 16 Han characters; English targets one line or two
short lines. Guide bubbles retain their real field actions. Ambient bubbles have
no invented product action and may offer only the existing Hermes invocation.
The same beat ID appears in DOM diagnostics so browser gates can prove that the
rendered action and localized cue belong together.

Autonomous speech is occasional despite lively silent motion: a deterministic
`25–45 s` cadence, `3–5 s` display duration, no immediate phrase repeat and at
most one bubble. Input/writing, approval, modal/drawer-open, hidden document,
unsafe placement and reduced-motion suppress autonomous speech. Approval and
reduced-motion continue to render one non-empty model frame and then remain
pixel-exact static; functional guide text remains available without animated
entrance when reduced motion is active.

On mobile, an autonomous or task cue is one short sentence and never expands
into a floating action toolbar. Functional actions remain in their existing
drawer or product surface. At every viewport, the bubble is subordinate to the
character and the character is subordinate to the research task: no bubble may
become a feature card, tutorial panel or persistent page section.

### 11.3 Phase boundary and acceptance

Phase 1 is first evaluated against the production Dashboard structure using
authenticated, production-shaped data at `1440×900`, `1920×1080` and
`390×844`. The visual harness must present the real task surface first; its
exhaustive action controls belong in a collapsed developer tray and never
consume the main canvas. Focused tests must fail on a scale other than the exact
production-derived endpoints, a light-card bubble, or action controls presented
as primary content. Acceptance requires:

- exact `360` desktop / `200` compact-mobile product footprints, and no
  regression in the current right-rail anchored position;
- click-to-open, drag-without-click, dock detachment, viewport edge recovery,
  desktop/mobile persistence and resize/orientation reclamping;
- independent actor/bubble measurement, quadrant flipping and no overlap with
  Continue Research, create/import, the Hermes task rail, navigation or drawer;
- no regression in actual-bounds travel or existing safe-path guidance;
- deterministic lively decks, no immediate repeats and truthful priority order;
- action/speech beat identity, bilingual keys and autonomous silence guards;
- accessible bubble semantics, focus states, non-overlapping `40 px` actions,
  and no overlap with the RO title, material intake or primary create action;
- real WebGL screenshots for idle speech, direct interaction, guidance, task
  feedback, mobile edge placement, approval and reduced-motion stillness;
- no new image layer, renderer owner, dependency, API or server contract.

After local browser, WebGL, accessibility and performance gates pass, deploy
through the existing project release script. Final acceptance is the
authenticated public Dashboard at the same three viewports, including a real
drag/click/resize session, target container health, exact release identity and
rollback readiness. Local screenshots cannot substitute for that ECS evidence.

Only after the user judges Phase 1 in-browser may Phase 2 author a small set of
new `.motion3.json` clips for poses that parameter composition cannot express.
Phase 2 remains non-overwriting, changes no art, and requires its own Cubism
source/export and visual acceptance gate before replacing the v09 runtime.

## 12. Contextual research workbench visual acceptance (approved 2026-08-24)

The user approved implementation and ECS deployment after rejecting the prior
menu screenshots as too restrained, unattractive and visibly assembled from
generic AI UI parts. The first deployable slice is therefore an anonymous,
`noindex` visual acceptance route at `/_visual/research-workbench`. It renders
the actual v09 Hermes runtime and production-derived `360/200px` proportions,
but uses fixture research content and performs no API or database writes. The
route is an acceptance surface, not a replacement for authenticated product
pages; its approved language is migrated page by page only after in-browser
review.

### 12.1 Visual thesis and information hierarchy

The committed direction is a daylight warm-paper research workbench: generous
reading typography, mineral paper layers, dark graphite reserved for evidence
inspection, and restrained vermilion used as a research mark rather than a
decoration. Warm paper spans Dashboard, editor, explore and reading contexts;
the former full-page “instrument black” treatment is removed. The utility
sequence is always orient, act, then inspect evidence. Landing-page theatrical
typography is not carried into these working surfaces.

Long-form research text uses a Source Serif 4 and Noto Serif SC reading stack,
with locale-aware targets of `18px / 1.68` for Latin and `18px / 1.82` for CJK.
Bricolage Grotesque remains the interface face; IBM Plex Mono is limited to
identifiers, measurements and evidence metadata. Important text must never rely
on tiny size, tracking or low contrast. Surfaces use the existing flat and `4px`
radii, rules instead of stacked shadows, and project spacing tokens. There are
no gradients, glass blur, glow, purple, emoji icons, generic command palettes,
pill clusters, individual menu-item cards or floating card grids.

### 12.2 Hermes menu semantics and scene variants

The menu unfolds beside Hermes like a small set of carried research tools. A
desktop context click, `Shift+F10` or the Menu key opens it; a mobile long press
opens the compact variant. Ordinary click continues to open an assistant drawer
fixture. The menu mixes companion actions with truthful work entries, uses one
continuous paper plane with grouped rules, and positions beside rather than over
the character. One visible focus treatment and one contextual live-status
region describe selection results.

Dashboard may be lively through Hermes' reaction, cadence and one short text
bubble. Editor, input and approval contexts are quieter: fewer items, no
autonomous distraction and lower-contrast character feedback. Cute expression
comes from the real character scale, reaction timing, paper/ink tactility and
small purposeful motion—not stickers, emoji or infantile copy. Motion is limited
to menu origin, character response and selection result using interruptible
opacity/transform transitions no longer than `180ms`; reduced motion removes
those transitions while preserving state feedback.

### 12.3 Acceptance states and release boundary

The route must directly expose six inspectable states: Dashboard default menu,
menu hover/keyboard focus, companion-action speech feedback, mobile long-press
compact menu, quiet editor, and focused review evidence. It also includes
explore and long-reading contexts so typography and density can be judged in the
actual warm-paper system. Browser gates assert exact Hermes sizes, keyboard and
long-press access, drawer click semantics, focus visibility, `320/390px`
overflow safety, reading metrics, reduced motion, and the absence of API writes.

The route uses CSS Modules for visual styling and Radix/shadcn evidence only for
accessible interaction primitives; shadcn defaults do not determine its visual
language. Deployment uses the existing immutable Git release process with
`--skip-migrate`, an explicit rollback ref, public route and `/__release`
verification, healthy target containers and retained rollback tree. Product
source pages remain unchanged until the user reviews the public URL and gives
specific feedback on silhouette, paper/ink feel, cuteness, density and action
feedback.

### 12.4 Research Session Folio iteration (approved 2026-08-24)

The first deployed review proved the interaction contracts but did not yet read
like a natural research session. Its review-page introduction displaced the
user's real orientation questions, the oversized isolated Hermes rail separated
the character from the current decision, and the menu could appear over the
research body rather than visibly belonging to Hermes. The approved iteration
therefore treats a returning researcher with an active RO as the default user.

The first viewport answers, in order: what study is active, which decision is
open, which evidence must be checked, what version will result, and what Hermes
can do at this boundary. A semantic path—working draft, evidence check, version
record—replaces decorative progress and uses vermilion only for the current
step. Research history, import and other objects remain available but secondary.
The anonymous review controls stay present as a slim utility strip; they must no
longer resemble a marketing hero or dominate the product fixture.

The work surface is one continuous research folio with a readable central
measure and a research margin, not a bordered dashboard-card assembly. Research
titles and sustained prose use Source Serif 4 / Noto Serif SC; CJK long-form text
targets `18px / 1.82`, Latin long-form text `18px / 1.68`, and essential UI text
`14–16px`. IBM Plex Mono remains limited to time, version and evidence IDs.
Bricolage Grotesque is not used for research titles or prose. Chinese labels do
not inherit Latin uppercase tracking, and actionable status never falls below
`12px`.

Hermes sits in the folio margin and shares the open-decision anchor rather than
occupying an empty standalone rail. The exact renderer stage remains `360px` on
desktop and `200px` on mobile. Its resting state may show one factual boundary
status such as one evidence discrepancy; it does not speak until a meaningful
workflow boundary or explicit invocation. The context menu opens immediately
beside the character, retains a visible origin mark, and offers concrete actions:
inspect the current evidence, resume the relevant method paragraph, or accompany
the user through the current reading segment. Generic AI commands such as
"organize this page" are removed. Editor and approval scenes keep Hermes quiet;
mobile keeps the same task order in a compact menu above the character without
covering the primary decision.

The OpenScience brand story is expressed by the work sequence itself: claim,
evidence, human decision and recorded version remain visibly connected. Hermes
points out boundaries and carries tools, while the researcher retains authorship
and every consequential decision. Motion is limited to the menu's origin, one
small character orientation response and the selected workflow result.

## 13. Real-product Research Folio integration (approved 2026-08-24)

The user approved replacing the isolated review-route boundary with the real
non-Landing product system. `2026-08-24-research-folio-product-system-design.md`
is the unique CURRENT specification for product information architecture,
typography, surface hierarchy and page-owned Hermes space. This document remains
CURRENT for the Wanko renderer, exact `360/200px` relationship, interaction and
motion semantics.

Anchored Hermes is rendered in a page-owned research margin and does not travel
across inputs or evidence rows. The production adapter owns the Radix context
menu for right click, `Shift+F10`, Menu key and mobile long press; ordinary click
continues to open the existing assistant drawer. Contextual work entries use the
active Research Object and route. A companion result renders as a short inline
margin note; when no safe margin exists, the drawer is the overflow surface.
Landing, source artwork, APIs, data contracts, voice and TTS remain unchanged.

### 13.1 Mouth-anchored speech and carried-tool ledger (approved 2026-08-25)

The user rejected the deployed rectangular margin note because its detached
box, label and connector did not read as speech from Hermes. Explicit companion
feedback now uses a familiar, lightly asymmetric speech silhouette placed in
the same page-owned research margin as the actor. It contains exactly one short
sentence: no speaker label, tone label, shortcut, completion state, secondary
copy or action toolbar. Its short triangular tail terminates at the visible
mouth in renderer-local coordinates and flips with the bubble side; it must not
terminate at the hat, rail edge or an arbitrary point near the character.

The actor and speech bubble form one local visual unit. A companion action first
closes the menu, then produces one small character response and the four-second
text reply; menu and speech never coexist. The bubble may overlap the actor's
empty background but never research text, form controls or the menu. If the
reserved margin cannot fit the combined footprint, the response moves into the
assistant drawer rather than floating over product content. Reduced motion
removes the entrance and character reaction while preserving the same message
and accessible polite announcement.

The action menu is not a speech bubble. It remains Radix-owned and uses a single
low-radius research-ledger sheet with a ruled spine, grouped row separators and
one vermilion pull tab. Items are continuous rows rather than cards. Dashboard
may show two truthful current-research actions and one companion action; editor,
input and approval contexts use the quieter subset. Desktop keeps the exact
`360px` actor and opens through right click, `Shift+F10` or Menu; compact/mobile
keeps `200px`, opens by long press from the Hermes/lamp hit region and preserves
ordinary tap for the assistant drawer. The menu uses the existing project fonts,
warm paper, ink, icons and focus primitive; it adds no gradient, glass, glow,
pill cluster or default command-palette styling.

### 13.2 Two-beat presence and orbiting action tools (superseded visually by §13.3)

The approved interaction adopts Scholar's Tea's behavior grammar without
copying its orb styling. On the Dashboard, Hermes may introduce itself with two
short consecutive lines in the same mouth-anchored bubble: a presence line,
then one truthful context line. The lines never appear as simultaneous boxes,
never repeat on every navigation, and stop when the user starts typing, opens a
dialog, or enables quiet reactions.

Desktop invocation expands twelve discrete, readable action points from Hermes
rather than opening a rectangular ledger or command palette. Eight companion
actions are available: greet, encourage, think, listen, stretch, rest,
celebrate, and read together. Four research actions are available: continue the
current step, review evidence, inspect sources, and compare versions. Every item
has a 44px minimum target, a project icon, a visible 14px-or-larger label, a
single focus treatment, and an action ID from the existing catalog. No item is
an individual card. The points use free space above and beside the exact 360px
actor and preserve research text and form controls.

Choosing an item is one atomic performance beat: the menu closes, Hermes gives
an immediate action-specific reaction, and one short mouth-anchored sentence
appears. Menu and speech never coexist. A selected work action then opens the
existing product destination or assistant flow; companion actions perform no
hidden data write. Ordinary click continues to open the assistant drawer.
Right click, Shift+F10 and the Menu key invoke the same Radix-owned menu state.

On compact/mobile surfaces the actor remains exactly 200px. Long press opens
the same catalog through two labeled groups, With Hermes and Research tools,
with 44px targets around the actor and no horizontal overflow. An action closes
the points before its reaction and text appear. Editor, input, diff, review and
approval contexts do not produce unsolicited speech; they show only a small
Hermes presence control through which the user may keep the 200px compact size,
restore the 360px original size where space permits, or retain quiet reactions.

All entrance motion is transform/opacity only, finishes within 200ms, and
preserves spatial continuity from the actor. Reduced motion removes expansion
and character motion but keeps focus, labels, selection, speech and destination
behavior. The visual language is warm paper, high-contrast ink, one restrained
vermilion accent, project serif reading type and sans-serif controls. It
excludes gradients, glass, glow, emoji, low-contrast microtype, a translucent
radial disc and shadcn's default visual skin; Radix/shadcn evidence is used only
for semantics, focus and keyboard behavior.

### 13.3 Carried tool sheet and action-language lock (approved 2026-08-25)

The twelve actions and two-beat Dashboard presence from §13.2 remain, but the
desktop orbit presentation is replaced. Right-click, `Shift+F10` and the Menu
key open one warm-paper tool sheet in the page-owned research margin directly
above Hermes. The sheet and the actor are sibling physical bands: the desktop
sheet uses the same `360px` column as the exact `360px` actor and leaves `32px`
of clear space between the sheet's lower edge and the actor's upper footprint.
The actor does not translate, shrink, fade or become a background layer when
the sheet opens. A short vermilion source mark may occupy only the empty gap;
it never crosses the hat, body, lamp or an action target. The sheet may scroll
with its research margin into view, but it never covers research copy or form
controls.

The sheet is one lightly irregular research folio, not twelve cards. It has a
left-aligned Hermes heading, two continuous two-column row groups, thin ruled
separators, `44px` minimum targets, visible `14px`-or-larger labels, existing
Lucide icons and one vermilion focus/hover response. The companion group appears
first and the real research destinations second. The menu and speech bubble are
mutually exclusive. Focus order remains DOM order and Radix remains the sole
owner of roving focus, Escape and selection semantics; the shadcn skin is not
used.

On compact/mobile surfaces the same physical order is preserved with one group
visible at a time: a maximum `304px` sheet, `32px` empty band and exact `200px`
Hermes. Long press opens the sheet, tap opens the assistant drawer, and the two
group controls do not hide any action. The sheet respects safe-area insets and
does not create horizontal overflow. Editor, input, diff, review and approval
surfaces retain the quiet `200px` presence until the user explicitly invokes
the tool sheet.

Every selection is a single locked performance beat. The catalog action ID
chooses the Live2D motion and the same catalog entry chooses exactly one
localized sentence; neither is selected independently. The approved mappings
are:

| Action | Motion | Chinese response | English response |
|---|---|---|---|
| Greet | `ear-perk` | 你来了，我也在。 | Hello — I’m right here. |
| Encourage | `happy-wiggle` | 已经走到这里了，再往前一点。 | You’ve come this far. Let’s take one more step. |
| Think together | `thinking-pause` | 先停一下，我陪你把线索理顺。 | Let’s pause and sort the clues together. |
| Listen | `lamp-listen` | 我在听，你慢慢说。 | I’m listening. Take your time. |
| Stretch | `stretch` | 一起伸伸懒腰，肩膀放松一下。 | Stretch with me — let your shoulders soften. |
| Rest | `doze` | 先歇一会，我替你守着这一页。 | Rest a moment. I’ll keep your place. |
| Celebrate | `milestone-dance` | 这一步完成了，值得庆祝一下。 | This step is done. Let’s celebrate it. |
| Read together | `read` | 翻到这里了，我陪你再读一段。 | We’re here. I’ll read the next passage with you. |
| Continue | `return-dock` | 回到刚才那一步，我们接着做。 | Back to our last step — let’s continue. |
| Review evidence | `evidence-check` | 这条结论先别过，和我核对证据。 | Hold this conclusion — let’s check its evidence. |
| Trace sources | `citation-trace` | 沿着引用往回走，看看它从哪里来。 | Let’s trace the citation back to its source. |
| Compare versions | `compare` | 把两个版本并排放好，我们看差异。 | Let’s place the versions side by side and inspect the differences. |

Selecting an item closes the sheet before motion and speech begin. The sentence
remains visible for four seconds; a research action begins its existing route
transition after the immediate action-specific response. Reduced motion keeps
the same copy, focus and destination but removes character and entrance motion.
Automated gates must assert a disjoint actor/menu bounding-box relationship at
desktop and mobile sizes, all twelve action/motion/message triples, keyboard
focus, long press, ordinary-click drawer behavior and menu/speech exclusion.

Implementation status (2026-08-25): deployed. Application source `1b3bada`
implements this section; immutable ECS release `8ed2f3c` adds the release-build
proxy correction and uses `7165e9b` as rollback. Public no-write Hermes
acceptance is `5/5`; the complete local product release matrix is `62/62`.

### 13.4 Continuous speech contour and bounded tool adjacency (approved correction 2026-08-25)

The user rejected the deployed §13.3 visual result after inspecting production
screenshots. This correction supersedes only the speech silhouette, visible
mouth attachment, tool-sheet source treatment and their visual acceptance
contracts. The twelve action/motion/localized-sentence mappings, Radix input
semantics, exact `360/200px` actor sizes and ordinary-click drawer remain.

Speech is one accessible text element over one decorative SVG silhouette. One
closed SVG path owns the warm-paper fill, ink outline and short tail; CSS
`::before`/`::after` triangles, clipped border patches and separately drawn
tail strokes are forbidden. The path must have no visible seam where the tail
leaves the body. It uses a compact asymmetric rounded shape rather than a large
ellipse and may contain two or three balanced lines without touching the
outline.

The tail endpoint is calibrated against the visible Wanko mouth in renderer
local coordinates for both the `360px` desktop and `200px` compact
presentations. A generic percentage marker in the actor wrapper is not evidence
of mouth attachment. The tail must end at the visible mouth region, not the
hat, ear or wrapper center, and must remain short enough that actor and speech
read as one unit. While speech is visible it must neither cover nor visually
collide with the Hermes state label, presence control, motion control, product
copy or form controls.

The tool sheet has no free-floating vermilion tether or page-note stroke.
Desktop and compact placement must keep the sheet and actor disjoint while
also bounding the open gap to `24–48px`; a minimum-only assertion is invalid.
The entire sheet must remain inside the page-owned Hermes margin and must not
intersect the readable research column, headings, body copy, controls or
focusable content. If the preferred band cannot fit, the page scrolls the
Hermes margin into a valid placement before opening; the sheet does not cover
content and the actor does not visually jump.

Acceptance requires both structural and rendered evidence. Structural tests
assert a single SVG silhouette, absence of pseudo-element tail geometry,
bounded actor/menu gap, desktop and mobile content exclusion, stable actor
position, menu/speech mutual exclusion and the existing action-language lock.
Rendered original-scale screenshots must show continuous ink at the bubble-tail
junction and a tail endpoint at the visible mouth on Dashboard desktop,
Dashboard mobile and quiet editor. A synthetic DOM marker or endpoint-distance
number alone cannot approve the visual result. The production release remains
visually rejected until the user reviews the new deployed result.

Implementation status (2026-08-25): deployed application `9a7263e` in immutable
release `cbf5737`, rollback `cc6cff6`. After the first
`cc6cff6` deployment, original-scale public screenshots rejected a tail base
that still covered the hat/face and an editor capture taken before Live2D was
ready. The deployed correction narrows the same closed contour into a slender mouth line,
keeps the speech body above the visible crown, temporarily recedes Hermes
labels/controls while speaking, and requires renderer-ready screenshots. This
operator and public gates pass; user visual acceptance remains pending.

### 13.5 Design-skill enforcement and visual rejection gate

The rejected result was not caused by missing skill invocation. The design,
frontend, baseline and UI/UX skills were consulted, but their output was treated
as optional guidance rather than as rejection criteria. Weak or empty search
matches were allowed to stand in for design evidence; automated tests measured
a synthetic wrapper marker instead of the visible mouth; the menu asserted only
a minimum gap; and screenshot generation was mistaken for screenshot review.
Those practices are invalid for future Hermes and non-Landing UI work.

Before implementation, the selected skills must produce explicit reject/accept
constraints for typography, hierarchy, physical source, collision, state
transitions and responsive geometry. A weak search result is not positive
evidence and must fall back to established interaction and accessibility
principles plus the current OpenScience visual language. Implementation tests
must reference visible actor landmarks and use bounded relationships on both
sides. Every state that changes menu or speech dimensions must be remeasured;
passing the default group is not evidence for a shorter or longer group.

Before a visual candidate is shown or deployed, an operator must open the
original-scale Dashboard desktop, Dashboard mobile and quiet-editor screenshots.
Any broken contour, detached tail, covered label/control, illegible type,
unbounded empty gap or actor jump rejects the candidate even when all automated
tests are green. Skills inform this gate; they do not replace user aesthetic
judgment or direct rendered inspection.

### 13.6 Viewport-safe tool sheet and living action response (approved 2026-08-25)

The production screenshot exposed two failures not covered by §13.4: Radix
collision placement was followed by a fixed CSS translation that could push the
tool sheet behind the browser edge, and each catalog action resolved to one
unchanging sentence while speech appeared before the character performance was
perceptible. A passing implementation must therefore prove both viewport
containment and a visible action-first response rhythm.

The open sheet is measured from its real portal element after layout. It stays
inside the visual viewport with `8px` collision padding, clears protected
navigation and readable content, and keeps the visible crown-to-sheet gap in
the existing `24–48px` band. Desktop may move only the page-owned Hermes margin
by the measured amount. Compact/mobile counter-scrolls that temporary change so
the exact `200px` actor remains under the user's finger. Closing, navigating or
unmounting restores the original scroll and stage offset; no estimated fixed
menu height or post-collision transform may own placement.

All twelve actions must trigger a real Wanko performance. `doze` and
`thinking-pause` use existing compatible motions plus their semantic parameter
profiles rather than speech alone. The motion starts immediately after menu
selection; companion speech follows after `520ms`, research feedback after
`320ms`. Each action owns three Chinese and three English action-matched lines.
Selection may be random, but the immediately previous line for that action and
locale cannot repeat.

Typing, search, modal/drawer use and approval state interrupt pending speech.
An action selected while already interrupted may perform quietly but must not
schedule a delayed bubble. User-invoked feedback remains available on quiet
editor routes when no interruption is active. `prefers-reduced-motion` keeps
the same language, focus and destination while removing nonessential motion.

Acceptance covers all twelve action profiles and phrase pools, consecutive
no-repeat, action pixels changing before speech, desktop/mobile viewport and
protected-region geometry, close/unmount scroll restoration, input and
approval interruption, ordinary-click drawer behavior, keyboard access and
mobile long press. Application `8d1409e` passes Web `411/411` plus five Node
contracts, product release `65/65`, both focused Hermes visual gates, full root
typecheck/lint/test/build and independent review with no remaining finding.
Immutable release `6b804f7` is active with `cbf5737` retained as rollback.
Public no-write interaction acceptance passes `6/6`; current-viewport and actor
screenshots confirm Wanko and mouth-linked speech are present together. A
Playwright full-page stitched screenshot can clear an offscreen WebGL canvas and
is not valid evidence of actor absence; use current-viewport or element capture.

### 13.7 Short-viewport joint geometry stabilizer (approved 2026-08-25)

The §13.6 release still allowed a one-frame and, after upstream reflow, lasting
split between three coordinate owners: the page-owned Hermes stage, the Radix
portal and the post-placement menu correction. At `1612×729` with DPR `1.875`,
this could leave the carried sheet behind the browser edge even though the
actor and the initial collision calculation were individually valid.

The sheet and actor now form one constrained composition. Each stabilization
restores the opening stage offset, measures the real portal, visible crown,
actor bottom, visual viewport and horizontally intersecting protected regions,
then preserves a `24–48px` crown gap while keeping both sheet and actor inside
the viewport. The first correction occurs in the current layout cycle; two
following animation frames absorb Radix settling without exposing an invalid
intermediate state. Menu/margin resize, upstream protected-geometry changes,
visualViewport changes and compact group changes all schedule the same routine.

Closing or unmounting restores the exact pre-open translate and scroll. Shift+
F10 and the Menu key focus the first action; Escape returns focus to Hermes.
The release gate must reproduce the reported `1612×729 / DPR 1.875` geometry,
mutate an upstream protected header while the menu is open, and assert viewport
edges, actor bottom, horizontal margin containment, zero protected overlap and
the bounded crown gap. Application `5323ba8` passes that regression, five
consecutive repetitions of both critical desktop paths (`10/10`), all Hermes
product interactions (`9/9`), the full product matrix (`66/66`), Web `411+5`,
the three-viewport work-assistant gate and independent review with no finding.
Immutable release `bf54eaa` is active with `6b804f7` retained as rollback;
server build, 27 current migrations, runtime isolation, ingress/assets/markers
and public no-write Hermes `9/9` pass. Visual acceptance remains with the user.
