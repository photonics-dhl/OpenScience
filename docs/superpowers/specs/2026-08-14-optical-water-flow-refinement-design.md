# Optical Water-Flow Refinement Design

## Goal

Make the Landing hero feel continuously alive before pointer input: `Science evolves.` and its optical field should move like slow water with restrained grazing light, while pointer motion remains a faster local injection into the same material.

## Approved visual thesis

- **Material:** black optical water, not a CSS spotlight or a smoke layer.
- **Idle:** low-frequency, multi-scale advection with no obvious start, end, or linear sweep.
- **Light:** narrow cool-white-warm highlights derived from local flow curvature; no broad glowing wash.
- **Pointer:** the existing bounded local wake remains stronger and faster, then returns to idle within the accepted 700 ms envelope.
- **Typography:** glyphs remain complete and readable; idle displacement is subtle while the energy/point field carries more motion.

## Root-cause correction

`target-reference.png` is a full-page screenshot containing navigation, lower-left SDF status copy, CTA text, and a captured black arrow cursor. It must no longer contribute pixels outside the headline band. Both the static `<img>` plate and the WebGL target sampling must use a headline-only mask. The baked cursor remains excluded while the live operating-system cursor remains visible.

## Architecture

Reuse the existing OGL renderer, 96×54 ping-pong flow texture, target texture, energy texture, lifecycle ledger, and reduced-motion fallback. Remove the Landing-only CSS pseudo-element sweep. Upgrade only the idle branch of the existing flow/composite shaders:

1. blend several incommensurate wave directions into slow ambient advection;
2. derive a restrained specular/caustic term from spatial flow variation;
3. preserve the existing local pointer memory, overlay, caps, recovery, and ownership lifecycle.

No new dependency, framebuffer, texture, image asset, or route is allowed.

## Acceptance

- With no pointer input, three consecutive observation windows show non-trivial title-band motion in all four quadrants and no frame reads as static.
- Idle motion has no single full-width linear highlight or 3.4 s CSS loop.
- Pointer input still passes the existing multi-position centroid, locality, halo, layer-order, cap, recovery, touch, and lifecycle matrix.
- The Landing stage uses the operating-system cursor (`auto`/`default`), while native links and controls retain their semantic pointer cursors; no custom ring, dot or replacement cursor is drawn.
- Pixels below the headline band contain neither the captured arrow nor the lower-left status copy from `target-reference.png`.
- Mobile retains autonomous flow; `prefers-reduced-motion: reduce` retains the clean static composition and mounts no interaction canvas.

## Task 23 perceptual correction

The first release satisfied temporal pixel coverage but failed the product goal: adjacent idle captures are technically different while the title still reads as stationary to a person. The acceptance contract therefore distinguishes motion existence from motion salience.

- Within a 720 ms observation window, at least 4% of title-band pixels must change by at least 4 RGB levels and their accumulated change must average at least 0.20 RGB levels across the full title band.
- Idle displacement and grazing light may increase only on the ambient branch. The accepted pointer limits, local radius, recovery, overlay ownership, contamination masks, and reduced-motion fixture remain unchanged.
- The visual character is a slow liquid breathing of the letterforms and centre field, not a sweep, pulse, flash, chromatic wash, or cursor-centred halo.

### Approved attention refinement

The user approved one further restrained enhancement after reviewing the local
Task 23 candidate. The idle state has three related layers rather than unrelated
decorations:

1. the existing low-frequency global liquid advection remains the base;
2. a centre-weighted, curvature-gated caustic breath makes the optical seam open
   and close slowly without a circular boundary;
3. a sparse, non-linear highlight follows glyph edge energy rather than sweeping
   across the whole viewport.

The two presentation accents are Landing-only, near-neutral, phase-offset, and
multiplied by `(1.0 - localAmount)` so the accepted pointer wake becomes the
single dominant response during interaction. They add no DOM layer, texture,
framebuffer, package, image, timer, or animation owner. Reduced motion remains
the exact static fixture. Final-surface browser evidence must use 1.2-second
windows and prove stable visible motion without broad row/column bands.

## Task 24 cursor-preserving perceptual water correction

### Reopened product defect

The 2026-08-26 production review showed that Task 23's numerical salience gate
still accepts a surface that a researcher reads as a static image. The same
release deliberately hides the operating-system cursor, so the user also loses
their spatial reference while crossing the black field.

Production evidence identifies both causes:

- `.candidate[data-accepted-optical-surface='landing'] *` applies
  `cursor: none !important`, and the browser gate requires that value;
- the Landing presentation branch is capped at a 10-second cycle and 2.2px
  drift, while the local input path is velocity-only. A measured ordinary slow
  traverse publishes `follow ≈ 0.007`; the same route reaches `≈ 0.31` only for
  a fast two-step movement. Small temporal pixel changes therefore pass while
  normal use produces no legible wake.

### Approved interaction contract

- Restore the real operating-system cursor over the optical field. Links and
  controls keep browser-native cursor semantics. Do not introduce a custom
  cursor, halo, dot, label or cursor-following DOM element.
- Keep one black optical-water material. Idle motion is a legible low-frequency
  current in the point field and letter edges, not a sweep, pulse, glow or
  whole-image translation.
- Local water uses pointer position plus bounded movement energy. Slow movement
  must create a visible compact wake; faster movement may lengthen and brighten
  that same wake without changing its material or exceeding the existing
  refraction, gain, locality and layer-order safety caps unless a failing
  perceptual proof shows a specific cap is the blocker.
- The wake follows the real pointer location, responds during traversal, and
  returns to the autonomous field within 700–900ms after input stops or leaves.
- Touch retains bounded drag response. `prefers-reduced-motion: reduce` keeps
  the approved static composition and mounts no animation canvas.
- Hermes, navigation, typography, accepted image assets, route structure and
  the warm-paper product surfaces are outside this correction.

### Acceptance contract

- Computed style proves a visible system cursor on the Landing field and native
  pointer semantics on links; no descendant may force `cursor: none`.
- A deliberately slow multi-step traverse must produce a non-trivial published
  follow signal and a final-composite local change centred near the pointer.
- A fast traverse must remain stronger than the slow traverse, within the
  accepted cap and without a circular cursor halo or broad chromatic band.
- Three idle observation windows must show a coherent displacement/current,
  not only sparse luminance noise. The gate must separately measure spatially
  connected motion and local pointer response; aggregate changed-pixel counts
  alone are insufficient.
- Pointer leave and input stop recover within 900ms; reduced motion remains
  byte-stable and canvas-free; lifecycle, context-loss, mobile overflow,
  typography completeness and contamination gates remain green.
- Final approval requires an original-size production screenshot sequence or
  recording inspected as a user, in addition to automated telemetry.

### WebGL-unavailable continuity amendment

Production review on 2026-08-26 established that a browser without WebGL or
WebGL2 bypasses every OGL motion proof and receives only the exact static plate.
Normal WebGL remains the primary and exclusive OGL owner. In normal-motion mode
only, an unavailable context must therefore mount the retained Canvas optical
field inside the same accepted surface and animate the accepted typography
plate as one clipped title-band water material. It must retain the system
cursor, mobile geometry, offscreen pause/resume and pointer response. It may not
change the composition, introduce a second visible command layer, or run under
`prefers-reduced-motion: reduce`. A production gate must explicitly disable
WebGL and prove visible bright-glyph motion plus viewport leave/re-entry.
