# Hermes Articulated Mesh Pet Design

Status: **DEPRECATED → superseded by `docs/specs/2026-08-17-hermes-workspace-companion-motion-design.md`**

Supersedes the renderer in `docs/specs/2026-08-15-hermes-2d-pet-design.md`. It preserves the accepted constellation-dragon identity and the completed contextual-guide/task system.

## 1. Incident and invariant

The failed renderer displayed one complete PNG and animated the whole image by only a few pixels. Its named head/body/tail layers contained glow shapes rather than character pixels, so automated transform checks passed while the user still saw a static picture. A later prototype constraint had incorrectly overridden the 2026-08-06 product baseline, which required a companion with independent motion, random idle behaviour and state-driven expression.

The new invariant is:

> A Hermes motion claim must be proven on character pixels or mesh joints. Moving labels, halos, nodes or an enclosing bitmap does not count.

## 2. Chosen architecture

Use the existing original 824×824 transparent constellation-dragon PNG as a texture on one subdivided OGL plane. A vertex shader applies weighted two-dimensional joints to actual character pixels:

- **head/page crown**: observation tilt, nod and pointer lead;
- **torso**: breathing and delayed follow-through;
- **tail/citation leaves**: counter-rotation, swish and settling overshoot;
- **eye regions**: bounded gaze warp and blink texture transition;
- **evidence spine**: state-linked pulse remains registered to the deformed body.

The mesh uses one canvas, one program, one plane and at most three existing textures (`idle`, `blink`, `working`). No new character binary, Cubism runtime, Pixi instance, Three.js dependency or generated replacement artwork is introduced. The existing static image/SVG stays behind the canvas until the first successful frame and is the reduced-motion/failure fallback.

## 3. Behaviour grammar

Hermes must look alive without input within two seconds. Continuous breathing is intentionally subordinate to discrete gestures.

Idle actions use a deterministic scheduler with varied rests, not synchronized infinite CSS loops:

1. `observe`: head turns, eye warp leads, torso follows slightly, then settles;
2. `page-flick`: page crown makes a short asymmetric flick;
3. `citation-swish`: tail tip sweeps and rebounds while the torso remains grounded;
4. `evidence-check`: head nods toward the six-node spine and nodes answer sequentially;
5. `blink`: one or two short blinks with irregular spacing.

At least one readable gesture starts during the first 1.2–1.8 seconds, followed by rests. Gesture selection avoids immediate repetition. Pointer motion adds gaze/head lead within 100ms, torso follow within 180ms and tail counter-motion within 260ms. Pointer leave settles through a damped return rather than snapping.

State precedence remains `awaiting_approval > active guide task > ingestion state > idle`:

- `scanning`: working texture, focused forward pose and evidence sweep;
- `guiding/suggesting`: attentive head pose and one restrained nod;
- `awaiting_approval`: no autonomous gesture; the character holds a quiet, readable pose;
- `failed`: no comic shake; a small downward head response settles to still;
- reduced motion: static fallback with all functionality and copy retained.

## 4. Runtime and lifecycle

- Dynamically import OGL after hydration; Landing receives no Hermes runtime.
- Cap DPR at 1.5 and mesh resolution at 28×28; one transparent draw per active frame.
- Pause RAF and scheduler when hidden or outside the viewport.
- Dispose RAF, observers, listeners, textures, program, geometry, GL context and diagnostic bridge on suspend/unmount/failure.
- Canvas never captures pointer events; the existing accessible Hermes button remains the input owner.
- Only one `data-hermes-instance="single"` and one active WebGL canvas may exist.

## 5. Acceptance

Automated acceptance must prove all of the following on the real production renderer:

- idle character-pixel motion becomes visible within two seconds;
- head, torso and tail have different motion vectors relative to one another, so a whole-image affine transform cannot satisfy the gate;
- pointer motion changes gaze/head before torso and tail, then returns with bounded overshoot;
- at least three distinct idle gestures occur during a bounded observation run;
- `scanning`, approval, failure, reduced motion, asset failure and WebGL failure preserve truthful state and actions;
- no duplicate character exposure, seam, blank frame, overflow or console error at desktop and 390px;
- first-load budget and sustained frame cadence are measured rather than inferred.

Final acceptance remains visual: the user must perceive Hermes as a living guide, not merely observe a passing numeric gate.

## 6. Memory hygiene

- Historical note only: this document no longer defines the CURRENT renderer or guide contract; the superseding 2026-08-17 Workspace Companion spec owns that status.
- Failed prototype documents retain `DEPRECATED` or `VISUAL NO-GO` at the top and may not appear in CURRENT handoff `Read first` lists.
- A prototype's performance or licensing constraint may narrow its own implementation, but cannot silently replace an already accepted product experience. Such a downgrade requires an explicit ADR amendment and user decision.
