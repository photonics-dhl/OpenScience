# Optical Lab High-Fidelity Reference Reconstruction Design

## Status

Approved visual and runtime design. The user approved the architecture,
typography geometry, static optical field, pointer-response boundary, fallback
strategy and 2026-08-13 production promotion section by section. This document
supersedes Candidate B as the active visual direction and authorizes the local
production replacement implemented through the shared accepted surface.
Deployment remains a separate, explicitly confirmed operation governed by the
deployment runbook.

## Problem

Candidate B is engineering-valid but aesthetically rejected. It preserves a
fixed aperture and avoids rings, fans, duplicate ink and lifecycle failures, but
its small title, isolated point curtain, weak caustic and single-pass material
remain visibly far from `target-reference.png`. Existing gates primarily reject
known failures; they do not enforce the reference's typography proportions,
multi-pass optical material or perceptual similarity.

The next iteration must reconstruct the reference rather than tune Candidate B.

## Goal

At the 1672 × 941 reference viewport, reproduce the reference's dominant visual
relationships:

- one oversized `Science evolves.` line spanning almost the full viewport;
- a real transition between a heavy grotesk and high-contrast Didone italic;
- a fixed optical aperture at 58% viewport width;
- glyph-derived dissolution into a full-height vertical particle curtain;
- a narrow, bright caustic at the aperture;
- directional energy emitted only to the right;
- subtle pointer-follow deformation that enhances an already complete resting
  frame.

The result need not be pixel-identical to a generated reference image, but it
must match its composition, hierarchy, topology and material quality closely
enough to pass a full-size human comparison.

## Selected Rendering Architecture

Use OGL as a small WebGL abstraction and rebuild the visual as a WebGL2
multi-pass pipeline. Do not port Candidate B's point-row formulas.

```text
semantic DOM h1 and measured layout
             |
             v
      licensed font inputs
             |
             v
        MSDF glyph pass ---------> glyph mask
             |                         |
             |                         +--> dissolution seed mask
             |                         +--> fixed-slit velocity field
             v
       flowmap displacement       GPGPU particle state
             |                         |
             +------------+------------+
                          v
                HDR composition target
                          |
             caustic + restrained bloom
             micro-dispersion + fine grain
                          |
                          v
                     final frame
```

OGL is selected because its official examples already cover MSDF text, mouse
flowmaps, GPGPU particles, render targets, bloom and fluid distortion while
remaining close to native WebGL. Three.js + Troika + postprocessing is a valid
alternative, but the current Three.js renderer is WebGL2-only and adds a much
larger scene abstraction than this two-dimensional hero needs. VFX-JS,
Curtains.js and PixiJS remain prototyping references, not the production core.

The implementation must amend ADR-009 after written design approval because the
current ADR records a dependency-free native Lab exception.

## Typography Geometry

The DOM remains the semantic and measurable source of truth. GPU ink may replace
its visible pixels only after the first complete GPU frame is ready.

At 1672 × 941:

| Property | Contract |
| --- | --- |
| Full title bounds | `x = 2.2%–95.7%`, `y = 35.8%–60.0%` |
| Baseline | approximately `y = 54.2%` |
| `Science` allocation | approximately `55.8vw` |
| `evolves.` allocation | approximately `37.7vw` |
| Aperture and type transition | `x = 58%` |
| Line behavior | one line; no centered slogan scale or stacked words |

The font gate precedes renderer work. Compare the existing Bricolage heavy face,
Archivo 900 and a non-shipping Arial Black reference against the target's
`S/c/e` silhouettes; compare the existing Bodoni Moda italic against the target
`e/v/l/s` silhouettes. The selected shipping pair must be redistributable,
self-hosted or provided by Next's build-time font system, and recorded with its
license. Human approval of the full-size specimen is required before generating
the MSDF atlas.

Responsive views preserve the type roles and the 58% transition. They may reduce
font size and crop peripheral optical energy, but may not stack the words or move
the aperture to fit.

## Resting Optical Field

The resting frame contains the full visual idea without pointer input. Five
regions share the same glyph mask and fixed axis:

1. **Intact glyph region:** the left title remains heavy, continuous and fully
   legible.
2. **Glyph dissolution region:** glyph alpha gradually transfers into particles
   before the aperture; it is not a circular explosion or random letter tear.
3. **Vertical particle curtain:** energy spans nearly the full viewport height,
   is densest around the optical center and fades toward the top and bottom.
4. **Narrow caustic:** a 4–6vw warm-white core sits at the aperture with only a
   slight blue/orange spectral edge.
5. **Directional emission:** rays and particles travel only to the right,
   gradually decay, and never erase the readability of `evolves.`.

Particles originate from the glyph mask and evolve in a texture-backed GPGPU
state. The fixed-slit velocity field owns direction; the pointer never becomes a
force-field center.

## Material and Composition

Render the glyph, particle and caustic layers into a high-precision composition
target where supported. Apply restrained bloom only to the caustic and highest
energy particles. Finish with subtle tone mapping, subpixel spectral separation
near the seam and fine monochrome grain.

Prohibited material shortcuts:

- full-frame blur or bloom;
- grey duplicate DOM ink beneath GPU ink;
- uniform white dots with no size or luminance hierarchy;
- radial mouse masks, rings or symmetric fans;
- a hard mechanical vertical divider;
- large RGB glitches across the title;
- decorative noise that reduces text legibility.

## Pointer Response

Pointer movement writes velocity into a low-resolution flowmap. It does not feed
a radial displacement formula directly.

- Whole-line follow: approximately 1–2 CSS px.
- Local refraction peak: at most 4 CSS px.
- Caustic energy increase: at most 8% above the resting frame.
- Particle response: slight deflection along the existing velocity field.
- Follow delay: approximately 100–140 ms with monotonic interpolation.
- Recovery: no bounce; exact resting state within 650 ms.
- Invariant: aperture remains at 58% for every pointer position.

## Runtime and Fallback Policy

| Capability | Result |
| --- | --- |
| WebGL2, normal motion, sufficient budget | Full MSDF + flowmap + GPGPU + HDR composition |
| WebGL2 under load | Reduce particle count and bloom resolution before changing composition |
| WebGL1 or WebGL2 initialization failure | Pre-rendered high-fidelity static optical field plus semantic DOM title |
| `prefers-reduced-motion` | Same high-fidelity static field, no continuous render loop |
| Context loss | Reveal the static field in the same state transition; retry only through the reviewed fresh-canvas lifecycle |
| No canvas support | Readable semantic DOM title with the approved geometry |

The static fallback is generated from an accepted resting WebGL2 frame, not
hand-recreated as a cheaper CSS effect. It must preserve title geometry and the
58% seam. The ECS requires no GPU: it serves assets while rendering occurs in
the visitor's browser.

## Accessibility

- Keep one selectable semantic `h1` with exact text `Science evolves.`.
- Keep the canvas and static decorative field out of the accessibility tree.
- Publish GPU visual ink only after a complete first frame.
- Preserve real mouse text selection and keyboard reading order.
- Context loss and fallback must not move the heading bounds.
- The visual remains understandable with motion disabled.

## Acceptance Strategy

Testing follows RED–GREEN–REFACTOR, but perceptual gates must now describe the
reference rather than merely forbid past regressions.

### Typography gates

- At 1672 × 941, verify title, word, baseline and 58% transition bounds against
  the percentages in this document.
- Compare the accepted DOM font specimen and MSDF render for matching bounds,
  kerning and glyph-edge continuity.
- Reject word stacking, centered-slogan scale and seam drift.

### Static field gates

- Capture the resting frame before any pointer event.
- Measure the five regions independently: intact glyph, dissolution, curtain,
  caustic and downstream emission.
- Add a full-frame perceptual comparison against the reference after masking
  navigation, cursor and non-hero metadata.
- Retain the ring, fan, mechanical-line, duplicate-ink and ghost probes as
  regression guards, not as the primary definition of success.

### Interaction gates

- Capture real pointer left/aperture/right frames after an honest elapsed time.
- Verify total local displacement is at most 4 CSS px and aperture drift is zero.
- Verify monotonic follow, no bounce and exact rest within 650 ms.
- Verify the resting frame remains visually complete when pointer events are
  disabled.

### Runtime gates

- Verify WebGL2 full, performance adaptation, WebGL1 static, reduced motion,
  initialization failure, context loss/restore and exact resource cleanup.
- Enforce a route bundle budget after installing OGL and generated atlas assets.
- Record real-device desktop and mobile frame timings; SwiftShader evidence is
  lifecycle evidence only.

## 2026-08-12 Energy Composition Iteration

The first accepted reconstruction is technically stable but its energy field is
still compositionally weaker than the reference. Multiple parallel vertical
light bars and a broad grey downstream wash compete with the title. The next
iteration keeps typography, interaction bounds, fallback policy and runtime
architecture fixed while rebuilding the resting field around one optical event.

The single source of visual truth is a narrow lens-shaped focal core centered at
the fixed 58% aperture. It must be continuous through the title band, taper above
and below it, and must not read as a straight mechanical divider. Glyph-derived
particles approach this waist from the left, then bend into a full-height curved
curtain. Downstream energy leaves the same core as sparse coherent filaments;
large-area grey illumination behind `evolves.` is prohibited.

The iteration is accepted only when all of these relationships hold at native
size. Early peak-count and row-convergence proposals were discarded after the
target reference itself failed them; acceptance uses reference-valid morphology
instead:

- one continuous particle-owned lens shell remains centered near 58%, within
  the existing 4–6vw caustic geometry, rather than seven parallel focal bars;
- the outer curtain bends toward the focal shell rather than forming parallel
  vertical bars;
- fine downstream filaments occupy more of the emitted energy than broad haze,
  preserve aperture-origin radial continuity, and retain target-relative
  absolute energy;
- vertical blinds, sparse dots, title ink and page chrome cannot satisfy the
  downstream morphology metrics;
- `Science evolves.` remains one line, fully readable and exactly selectable;
- existing five-region, similarity, ring, fan, staircase, mechanical-line,
  duplicate-title, interaction, fallback and resource-cleanup gates stay GREEN.

This restriction is superseded only for the accepted asset interaction overlay
defined below. It still prohibits replacing the approved resting composition,
adding dependencies or changing production integration until the later
`Amplified Field and Production Promotion` amendment records that separate
approval.

### Human gate

Show full-size reference and candidate side by side at 1672 × 941. The user must
approve typography first, then the resting optical material, then pointer motion.
Passing automated gates alone does not authorize production replacement. The
later production-promotion amendment is the explicit approval boundary.

## 2026-08-13 Accepted Asset Interaction Amendment

The user accepted the fixed 1672 × 941 asset candidate as the resting visual
baseline, then selected a bounded mixed-flow interaction. The resting frame is
immutable: with no active pointer, reduced motion, initialization failure or
completed recovery, the rendered pixels must equal the accepted baseline.

### Architecture

Add a dedicated `AssetInteractionRenderer` beside, not inside, the existing
procedural Optical Lab renderer. It owns one transparent WebGL2 canvas above the
accepted static energy and typography plates. The canvas remains visually empty
at exact rest and renders only a feathered central replacement patch while
input or recovery is active. It reuses the pinned OGL dependency and the
existing 96 × 54 velocity flowmap concept; it does not regenerate glyphs,
replace the static plates or import another rendering library.

The interaction renderer samples the same approved energy and typography
textures that define the resting candidate. A shader recomposes those textures,
applies flow displacement inside the central patch and emits transparent pixels
outside it. The patch includes opaque black replacement pixels beneath its
distorted optical material so the unchanged static frame cannot show through as
a duplicate. Feathered edges must not reveal a rectangular boundary.

### Input and response

- The whole Hero receives passive pointer velocity. Visible response remains
  localized around the fixed 58% aperture; the cursor never becomes a radial
  attraction point, ring, symmetric fan or movable light source.
- Desktop pointer movement and mobile pointer/touch dragging use the same
  normalized velocity model. Touch interaction must not block ordinary page
  scrolling until a pointer is actively dragging within the Hero.
- Apparent follow inside the patch is at most 2 CSS px. Local flowmap refraction
  is radially clamped to 4 CSS px. Caustic energy gain is at most 8%.
- Particle evidence bends slightly along the existing positive-x optical field;
  it cannot reverse direction, move the aperture or create new broad haze.
- Response approaches the latest velocity monotonically over approximately
  120ms. Release or inactivity decays without bounce and reaches exact zero by
  650ms, at which point the canvas becomes visually empty and the accepted
  static pixels are authoritative again.
- The earlier whole-line movement contract is narrowed for this asset mode:
  input is global, but the approved title outside the central replacement patch
  does not translate.

### Capability and lifecycle policy

| Condition | Result |
| --- | --- |
| WebGL2, normal motion | Lazy interaction canvas; RAF only during input/recovery |
| `prefers-reduced-motion: reduce` | Accepted static frame; no interaction context or RAF |
| WebGL2 unavailable or initialization failure | Accepted static frame; no visual or layout change |
| Context loss | Remove the overlay, expose the accepted static frame, retry only through a fresh reviewed lifecycle |
| Pointer/touch ends | Monotonic recovery, exact rest and inactive RAF by 650ms |

The canvas is decorative, `aria-hidden`, pointer-transparent and generation
owned. Every context, texture, target, program, buffer, listener and animation
frame must be released exactly once on failure, context replacement and React
unmount. No persistent RAF is allowed at rest.

### Accessibility and selection

The single semantic `h1` remains the only readable title and serializes exactly
as `Science evolves.`. The overlay cannot intercept pointer selection, keyboard
navigation or assistive technology. Selecting the title must still expose a
visible selection highlight. Reduced-motion users receive the complete accepted
resting composition with no functional information loss.

### Acceptance gates

- Native resting capture before any pointer event is pixel-identical to the
  accepted asset baseline; the overlay reports no active RAF and no visible ink.
- Honest elapsed-time captures cover pointer left, aperture, right, touch drag
  and recovery. Displacement stays within 4 CSS px, gain within 8%, aperture at
  58%, downstream direction positive-x and exact rest at 650ms.
- Browser tests reject a radial cursor halo, rectangular patch edge, duplicated
  static ink, whole-title drift, bounce, persistent RAF and leaked resources.
- Reduced-motion, unavailable WebGL2, initialization failure, context loss and
  unmount all retain the accepted static frame and semantic selection.
- Pointer-motion visual acceptance remains a separate user gate. Passing tests
  alone did not authorize production `/` replacement; the later production
  amendment records the separate approval. ECS deployment is still separate.

## Scope

### In scope

- Isolated `/_visual/optical-lab` reconstruction.
- OGL evaluation and dependency/license recording.
- Licensed font specimen and MSDF atlas workflow.
- Multi-pass WebGL2 renderer and generated static fallback.
- Accepted static asset plates and the isolated mixed-flow interaction overlay.
- The accepted shared-surface production `/` Hero integration authorized by the
  final production-promotion amendment.
- Reference-relative browser gates and full-size user review.
- ADR-009, progress, index and handoff synchronization.

### Out of scope

- ECS deployment or any cloud-side operation.
- Backend, API, schema, authentication, upload or Hermes changes.
- WebGPU-only effects.
- Recreating the unrelated blue six-panel Chinese homepage concept.
- Buying commercial shader/font assets without separate user approval.

## Implementation Boundary

The typography and resting asset candidate have passed full-size user review.
After written approval of the interaction amendment, update the implementation
plan beginning with pure response-envelope and lifecycle RED tests, then build
the isolated overlay without reopening the accepted resting composition.
Pointer-motion visual review remains mandatory before any separate production
replacement or deployment decision.

That review and the local production replacement were subsequently accepted in
the `Amplified Field and Production Promotion` amendment. Deployment remains a
separate release operation.

## 2026-08-13 Asset Presentation and Perceptibility Iteration

The first motion review showed two presentation problems rather than a need to
increase the approved safety envelope: target and current-production panels
compete with the deployable candidate, while ordinary mouse motion does not
drive the bounded response close enough to its existing authored limits.

### Approved direction

- Exact `candidate=asset` becomes a single-product acceptance surface. It shows
  only the deployable candidate at the largest available 16:9 size; the target,
  current-production panel, comparison captions and diagnostic grid do not
  occupy the visible acceptance surface.
- The accepted resting composition, typography plate, energy plate and fixed
  `.58` seam remain unchanged. The page retains the one semantic selectable
  `Science evolves.` heading and a minimal way back to the normal site.
- Interaction limits stay unchanged: apparent follow `≤2px`, local refraction
  `≤4px` and caustic gain `≤8%`. No stronger display mode is introduced.
- Pointer/touch velocity sensitivity increases so a normal deliberate gesture
  reaches a meaningful portion of the existing envelope. The normalized vector
  remains capped at one, remains positive-x downstream and uses the existing
  120ms monotonic response and 650ms exact recovery.
- The full candidate surface remains the input region, while the visible change
  stays inside the feathered central seam patch. No cursor halo, radial field,
  title-wide translation or resting animation is added.

### Acceptance

- Exact asset query renders one candidate surface and no target/current panels.
- A representative 18 CSS px deliberate mouse gesture sampled over 24ms reaches
  at least 50% of the response envelope without exceeding any existing cap.
- Slow movement remains smooth; pointer, touch, reduced motion, failures,
  cleanup and native 1672 × 941 resting-pixel identity gates remain GREEN.
- The running local acceptance URL remains isolated. This iteration does not
  authorize production `/` replacement, commit or ECS deployment.

## 2026-08-13 Full-Surface Layered Fluid Interaction

The user rejected the fixed-seam interaction as spatially constrained and
selected option C, a full-surface layered response informed by direct runtime
observation of the Moonshot AI landing experience. The reference uses a
continuously moving horizontal optical medium and a pointer-centred local
disturbance that follows the cursor. This amendment adopts that interaction
principle without copying the reference composition, typography, luminous orb
or custom cursor.

This section supersedes the interaction-specific spatial and resting-motion
requirements in the preceding Asset Presentation and Perceptibility Iteration.
That section remains authoritative for the single-candidate presentation,
accepted static composition and production-isolation boundary only.

### Visual thesis

The accepted `Science evolves.` composition becomes a quiet optical medium:
the resting typography, placement, energy plate and 16:9 framing remain the
visual authority, while low-amplitude ambient flow prevents the surface from
feeling inert. Pointer movement perturbs the medium wherever it occurs rather
than remotely activating a fixed centre seam.

### Layered field

- The interaction canvas covers the complete candidate stage and is not clipped
  by the former radial mask at 58% x.
- A low-amplitude ambient field remains active across the complete stage. It is
  spatially broad, slow and non-directional enough that the accepted resting
  composition remains immediately recognizable.
- Pointer and touch input inject a local two-dimensional disturbance centred on
  the current pointer coordinates. Its visible radius is between 12% and 16%
  of stage width and follows both x and y.
- The field is deliberately layered. Empty black regions receive the weakest
  refractive/brightness response; typography receives a medium response; the
  existing energy/seam region receives the strongest response. Layer weights
  derive from the accepted source plates rather than DOM-wide translation.
- The fixed `.58` aperture is retained only as an authored energy landmark, not
  as the interaction centre or a clipping boundary.

### Motion character

- Ambient motion is continuous but subordinate: no visible title drift, no
  global camera movement, no cursor halo and no periodic scale pulse.
- Pointer response is velocity-aware and position-aware. Slow movement creates
  a smooth local refraction; faster movement adds a restrained trailing wake.
  Input is accumulated through the flow texture rather than replacing the
  whole field per event.
- The local disturbance reaches perceptible strength within 120ms, then decays
  monotonically after input stops and becomes visually inactive within
  700–900ms. Recovery must not snap, reverse direction or leave a hard circular
  boundary.
- Pointer leave decays the existing field in place. Re-entry starts from the
  remaining field rather than resetting the canvas.

### Preservation and accessibility

- At the accepted reference viewport, disabling animation at any frame exposes
  the same approved static plates and selectable semantic `Science evolves.`
  heading. The interaction renderer does not replace the semantic title.
- `prefers-reduced-motion: reduce`, WebGL initialization failure, context loss
  and runtime failure display the exact accepted static composition with no
  ambient RAF or interaction canvas.
- Touch uses the same full-surface field with passive scrolling preserved where
  the gesture is predominantly vertical. Keyboard users receive the same
  static semantic content and exit control.
- The isolated `candidate=asset` route remains the only implementation surface.
  Production `/`, commit and ECS deployment remain outside this amendment.

### Performance and lifecycle budgets

- Continue using one lazy WebGL2/OGL owner and the existing compact ping-pong
  flow texture; increase texture resolution only if the full-surface visual
  gate proves 96 × 54 visibly blocky.
- Ambient animation may initialize after the candidate is visible, but it must
  stop when the document is hidden, the candidate leaves the viewport, reduced
  motion becomes active, context is lost or the component unmounts.
- No more than one canvas, one RAF chain and one owned listener set may exist.
  All GPU resources and diagnostic globals must be released on SPA unmount.

### Acceptance

- Native-size visual evidence preserves the accepted typography and energy
  composition while showing non-zero low-amplitude motion in at least four
  spatial quadrants during ambient operation.
- Representative pointer samples at left, centre, right and upper/lower stage
  positions each produce visible local change around that position; no sample
  is redirected to the fixed 58% seam.
- At least 75% of changed pixels for a stationary local response fall within a
  16%-of-width radius around the pointer, while the ambient field remains
  weaker outside that neighbourhood.
- Typography/energy pixels respond more strongly than empty black regions, but
  no glyph edge moves more than 4 CSS px and no local brightness gain exceeds
  8% above the authored asset.
- Pointer/touch, 700–900ms monotonic decay, pointer leave/re-entry, reduced
  motion, visibility/intersection suspension, initialization/runtime/context
  failure, exact resource cleanup and single-owner gates are executable and
  GREEN before user motion review.
- User motion review at desktop width is mandatory. Automated acceptance does
  not authorize production promotion, commit or deployment.

## Technical References

- OGL core and examples: <https://github.com/oframe/ogl>
- OGL MSDF: <https://oframe.github.io/ogl/examples/msdf-text.html>
- OGL flowmap: <https://oframe.github.io/ogl/examples/mouse-flowmap.html>
- OGL GPGPU particles: <https://oframe.github.io/ogl/examples/gpgpu-particles.html>
- OGL fluid distortion: <https://oframe.github.io/ogl/examples/post-fluid-distortion.html>
- Three.js GPU computation reference: <https://threejs.org/docs/pages/GPUComputationRenderer.html>
- Troika SDF text reference: <https://github.com/protectwise/troika/tree/main/packages/troika-three-text>
- Three.js postprocessing reference: <https://github.com/pmndrs/postprocessing>
- Google Fonts licensing repository: <https://github.com/google/fonts>

## 2026-08-13 Amplified Field and Production Promotion

This amendment records the user's post-acceptance choice to combine the
stronger-response and wider-field options, then deploy the accepted surface as
the production landing Hero.

It supersedes all earlier isolated-only/no-production-integration boundaries in
this document. It authorizes the local shared production implementation, not an
ECS or cloud deployment; the latter remains gated by the release runbooks.

- Preserve the accepted `Science evolves.` typography, energy plate, static
  pixels, 16:9 composition, directional irregular wake, lifecycle and exact
  reduced-motion fallback.
- Increase the authored ambient displacement budget from `.7px` to `1.4px`,
  local displacement from `4px` to `8px`, pointer-local replacement-patch
  follow from `2px` to `4px`, and caustic gain from `.08` to `.14`. The follow
  term is a real signed horizontal shader contribution, bounded by the local
  flow support and authored layer weight; it never translates the whole title
  or camera. The combined follow plus local-flow displacement remains
  vector-clamped to `8px`, so the `4px` term does not create a `12px` envelope.
- Increase local radius from `.14` to `.20` of stage width. This widens the
  response without doubling area twice over; locality acceptance remains
  pointer-centred and must keep at least 75% of changed pixels within `.22` of
  stage width.
- Keep the interaction velocity-aware and anisotropic. The stronger/wider
  field must not create a closed cursor halo, hard circular boundary, global
  title drift, camera movement or scale pulse. The sixteen-sector outer-rim
  halo probe remains at no more than four occupied sectors.
- Maintain `energy > typography > empty`, with typography at least `1.25 ×`
  empty response. Empty black remains visible but subordinate.
- Keep the 120ms approach and visually inactive local response by 900ms while
  full-surface ambient motion continues. Hidden, offscreen, reduced-motion,
  unavailable and disposed states retain the existing exact cleanup contract.
- Promote the exact accepted surface into the production `/` Hero through one
  shared component; the isolated Lab route remains a diagnostic/acceptance
  surface rather than a forked implementation. Production keeps one semantic
  `h1`, existing navigation and downstream Latest Research content.
- Deployment is code-only: no database migration, seed, ECS topology, Nginx,
  API contract or secret change. Use the repository deployment script with
  `--skip-migrate`, a pre-deploy backup/checkup, a verified release ref and a
  recorded rollback ref.

### Final release performance acceptance

- A hardware-rendered physical desktop interval is accepted when the unmasked
  WebGL renderer is not SwiftShader/software, both the 15-second resting and
  15-second pointer intervals stay within the active display cadence
  (`median <= 1.25 × cadence`, `p95 <= 2 × cadence`) and dropped frames are no
  more than 1% of cadence-expected frames. The display/session refresh rate
  must be recorded rather than assumed to be 60Hz.
- A connected physical mobile must run the same two 15-second intervals before
  deployment acceptance. Device emulation is supplemental and cannot close
  this gate. When no device is safely discoverable, physical mobile remains an
  explicit release blocker; no result may be fabricated.
- A conservative quality/DPR downshift is added only when physical measurements
  identify a device class that misses the thresholds. The accepted desktop
  evidence alone does not justify speculative rendering changes.
## 2026-08-14 Responsive Ambient Release Tuning

The user approved a final balanced enhancement and explicitly waived the
otherwise-required physical-mobile performance gate for this release. The
waiver does not convert emulated mobile evidence into physical-device evidence;
it is a documented release risk.

- Reduce the response window from `120ms` to `70ms`. After input stops, the
  local field reaches exact visual zero by `700ms` with no bounce or spring.
  Ambient motion continues. The same-RAF capture and PNG encoding must finish
  before the existing `900ms` acceptance deadline.
- Increase ambient displacement from `1.4px` to `2px` and ambient flow magnitude
  from `.035` to `.05`. Shorten the bounded ambient cycle from `12s` to `8s` so
  the medium is visibly alive before input.
- Increase pointer-local patch follow from `4px` to `5px`, combined local
  displacement from `8px` to `10px`, and local caustic gain from `.14` to `.18`.
  Keep longitudinal radius `.20` and the accepted transverse cap `.14`.
- Scale the empty liquid carrier proportionally to `.27`; its weighted maximum
  is `.22 × .27 = .0594`, below the `.18` gain cap. Preserve
  `energy > typography >= empty × 1.25`.
- Retain the exact `.16–.20` outer-band halo cap of at most `4/16` sectors.
  Across ambient phases `0/.25/.5/.75`, all five pointer samples must keep the
  threshold-3 changed-pixel centroid within `.065` stage width and at least
  `.80` locality inside the accepted neighbourhood. Keep the valid same-RAF
  recovery capture, reduced-motion exact static frame and lifecycle cleanup.
- Idle animation must show nonzero temporal changes in all four quadrants over
  a representative interval without cursor input. It must not introduce a
  global brightness pulse, camera/title drift, scale animation, hard ring or
  closed halo.
- Production deployment remains code-only and uses the confirmed
  `--skip-migrate` path. Record the mobile waiver, rollback ref, backup,
  hardware-desktop evidence and public post-deploy browser/service checks.

### Dual-channel local response architecture

The stronger Task 17 constants exposed a coupling in the original flow. The
composite derived visible change from displaced authored pixels, so the central
typography and energy plate pulled edge-response centroids inward. Scalar
radius, offset and phase changes either failed repeat runs or damaged recovery
and halo evidence. Task 17 therefore separates local geometry from local
visibility inside the existing flow texture.

- The flow pass keeps RG for velocity and B for local geometry memory. A stores
  a pointer-centred visible carrier derived from the same anisotropic `.20/.14`
  support. Ambient phase may move the background field, but it must not move
  the carrier centre.
- The carrier is a signed, zero-mean directional ripple with an open,
  irregular outline. It cannot emit a positive radial disc, closed rim or
  whole-stage brightness pulse.
- The composite uses geometry memory for refraction and the visible carrier for
  a low-amplitude local contrast change. Authored layer weights still produce
  `energy > typography >= empty × 1.25`, but they cannot relocate the carrier.
  Follow remains at most `5px`, the combined local vector remains at most
  `10px`, gain remains at most `.18`, and the static plates do not move.
- The renderer clears both local channels at the `700ms` visual boundary. It
  keeps the ambient RG field and RAF alive. Hidden, offscreen, reduced-motion,
  context-failure and unmount paths retain the existing single-owner cleanup.
- This change stays in the current flow/composite renderer. It adds no texture,
  render pass, package, API, ECS dependency or server-side GPU work.

Acceptance must distinguish the architecture from a diagnostic-only change.
The native gate intercepts the carrier channel and requires real pixel failure,
then restores it and runs the four-phase, five-position matrix. Fixed-centre,
closed-halo, disabled-carrier, `5px` follow and `10→14px` cap mutations must all
be detected. Recovery evidence must contain nontransparent ambient pixels,
show local visual zero at `700ms`, complete PNG encoding by `900ms`, and confirm
that the ambient RAF continues.

### Independent overlay-pass amendment

Native Task 18 evidence showed that the A-channel carrier was centred by itself
but still cancelled against authored displacement when both shared one
composite RGB result. The user approved one final transparent overlay pass to
remove that coupling.

- The flow texture keeps the Task 18 channel contract: RG velocity, B local
  geometry memory and A signed pointer-centred carrier. No new flow texture or
  framebuffer is added.
- The authored composite pass renders first and continues to own displacement,
  follow, gain and plate reconstruction. It clears the canvas exactly once.
- A second transparent program samples the same flow texture and draws after
  the authored composite with `clear: false`. It maps the carrier sign to a
  restrained warm/cool optical tint and uses carrier magnitude as bounded
  alpha. Maximum overlay alpha is `.16`.
- Overlay alpha has a pointer-centred baseline independent of authored layer
  pixels. Existing displacement and gain still enforce
  `energy > typography >= empty × 1.25`; the overlay cannot relocate the
  response centre or create a closed radial rim.
- The overlay program, shader and draw call belong to the existing renderer
  resource ledger and lifecycle. Suspension, context loss, failure and unmount
  must delete the additional program/shaders without adding another owner.
- Local geometry and overlay carrier reach exact zero at `700ms`. Ambient flow
  continues through the authored pass; reduced motion and failure states create
  neither WebGL pass.

The native mutation must identify the overlay shader/program and skip the real
second WebGL draw, making at least one phase/position sample fail. The isolated
mask proof must preserve production overlay output/blending and measure its
framebuffer alpha directly. The unmodified renderer must pass
all twenty samples under the responsibility-specific contract: the isolated
overlay alpha mask has centroid distance `<=.04`, while the final authored plus
overlay composite has centroid distance `<=.08` and locality `>=.80`. The real
`.16–.20` halo band, layer ordering, touch,
700/900ms recovery and exact lifecycle counts. A mutation that skips the second
draw must also fail real pixels; source presence alone is insufficient.
