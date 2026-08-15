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

`target-reference.png` is a full-page screenshot containing navigation, lower-left SDF status copy, CTA text, and a captured black arrow cursor. It must no longer contribute pixels outside the headline band. Both the static `<img>` plate and the WebGL target sampling must use a headline-only mask so real `cursor: none` is not confused with a cursor baked into the bitmap.

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
- The Landing stage and all descendants compute `cursor: none` during interaction.
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
