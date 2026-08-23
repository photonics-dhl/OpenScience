# Hermes Wanko Live2D Companion Design

Status: **CURRENT — smoke-bowl replacement written design approved**

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
