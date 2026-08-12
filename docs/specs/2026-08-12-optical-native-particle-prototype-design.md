# Optical Native Particle Prototype — Design Gate

**Status:** Approved direction; implementation awaits written-spec review
**Date:** 2026-08-12
**Scope:** Isolated, no-index prototype only; production Hero remains unchanged

## 1. Decision

Build a clean-room, native Three.js/TypeScript particle prototype at
`/_visual/central-particle`. It exists to test whether a shared font-path
coordinate system, regular particle grid, interaction texture and restrained
post-processing can reproduce the supplied optical reference more faithfully
than the current OGL reconstruction.

This is an architecture experiment, not a production migration. The existing
OGL Optical Lab and the production Landing remain untouched. Promotion may be
considered only after a fixed 1672×935 capture is visually preferred by the
user and the route meets the lifecycle, fallback and bundle evidence below.

## 2. Why this prototype is separate

The current Lab independently reconciles DOM text, BMFont/MSDF geometry and a
particle mask. That made engineering metrics improve while the central field
continued to look mechanical. The new prototype instead derives the DOM/SVG
reference, particle grid and renderer coordinates from one generated font
geometry contract. It tests the visual model before any Hero integration.

The route is built in a new worktree and branch. It must not import from, edit,
or conditionally replace `components/landing/Hero.tsx`,
`components/brand/OpticalHeadline.tsx`, or the production Optical Field.

## 3. Dependency and licence boundary

Pin these versions after the implementation plan is approved:

- Runtime: `three@0.185.1` (MIT).
- Runtime: `postprocessing@6.39.4` (Zlib), whose peer range includes Three
  `>=0.168.0 <0.186.0`.
- Development only: `opentype.js@2.0.0` (MIT).

Do not add React Three Fiber, `@react-three/postprocessing`, tsParticles or
particlesGL to this prototype. `opentype.js` must not enter a client chunk.

The TouchTexture and particle-shader concepts may be clean-room reimplemented
from `brunoimbrizi/interactive-particles`, but its source must not be copied.
Its package MIT declaration conflicts with the repository README's Codrops
terms and the repository has no root licence file. Source comments and the
design record will acknowledge Bruno Imbrizi/Codrops as algorithmic research.
Any later substantial source copy requires a licence ruling and an appropriate
third-party notice before it enters the repository.

The committed Archivo and Bodoni Moda font inputs remain governed by their SIL
OFL notices. Generated paths and metrics must retain the existing font
provenance and input hashes.

## 4. Shared typography geometry

A Node-only generator loads the exact committed fonts with `opentype.js` and
produces one deterministic contract for `Science evolves.`:

- SVG path data for each word and the vermilion period;
- `unitsPerEm`, ascender, descender and a common baseline;
- font size, per-glyph advances, kerning pairs and cumulative pen positions;
- visible glyph and word bounding boxes;
- the fixed aperture relationship and normalized stage coordinates;
- a regular grid of candidate points with stable integer IDs.

The generator must use `Font.getPath`, kerning-enabled advances and explicit
baseline coordinates. SVG preview, DOM overlay and particle creation consume
the same JSON values. Browser code must not re-measure the title using a second
font-layout algorithm.

## 5. Particle and interaction model

### 5.1 Regular text grid

Sample the generated word paths with a regular Cartesian grid, not random
points. A candidate is retained when its grid-cell center falls within the
path fill. Stable row, column and glyph IDs allow deterministic debug output.
The period remains a separate vermilion group.

Render particles as instanced camera-facing quads. The fragment shader draws a
soft circular coverage mask; it must not use square sprites or full-screen
random noise. Particle home positions come directly from the generated grid.

### 5.2 Central field

Use a fixed optical center near normalized `(0.573, 0.50)`. The resting field
combines:

- radial convergence toward the center;
- a weaker signed tangential component that bends trajectories into the
  reference's curved fan;
- a narrow seam-local transfer region, without vertical bars;
- deterministic falloff based on grid IDs and source distance.

The title remains legible away from the transfer region. The complete resting
topology must exist without pointer input.

### 5.3 Independent vertical curtain

Create a separate regular curtain grid spanning most of the stage height near
the aperture. It has its own density, opacity and curvature and is not produced
by stretching title particles. Rows remain visible but non-uniform; the result
must reject a solid column, repeated stripes and a uniformly bright rectangle.

### 5.4 TouchTexture

Use a detached 128×128 Canvas texture or an equivalent small GPU interaction
texture. Pointer Events write a velocity-weighted radial brush; simulation
decay is time-based, not frame-count based. The vertex shader samples the
texture to apply a subtle local displacement and return force.

The interaction texture is supplementary. At the fixed debug pointer, title
motion remains small and cannot move the optical center. Reduced-motion mode
does not update the texture or run a continuous RAF.

## 6. Post-processing

Use `postprocessing` directly, without React wrappers:

- low-resolution, low-intensity selective Bloom on the seam/high-energy group;
- one custom local chromatic-aberration effect masked to a small region around
  the optical center;
- no depth of field, vignette, film grain, glitch, god rays or global colour
  grading.

Chromatic aberration must not affect the whole title. Bloom and aberration are
disabled on reduced motion and may be reduced or disabled on mobile. Composer,
effects and render targets must be resized and disposed explicitly.

## 7. Runtime, fallback and cleanup

- Desktop dynamic mode requires WebGL2.
- Mobile and constrained devices use a capped DPR and reduced particle count;
  widths at or below 480px may use the static SVG/DOM result.
- `prefers-reduced-motion: reduce` publishes the semantic DOM/SVG result with
  no continuous animation.
- WebGL initialization, shader, asset or context-restoration failure leaves the
  semantic title visible and removes the failed canvas.
- Resize uses `ResizeObserver` for the prototype host and updates camera,
  renderer, composer, interaction texture mapping and stage coordinates as one
  generation-owned transaction.
- Unmount and context loss cancel RAF and dispose geometry, materials,
  textures, render targets, composer passes, renderer and listeners exactly
  once.

## 8. Deterministic debug and evidence

The prototype exposes an explicit test-only debug query/config with:

- fixed random seed;
- fixed simulation timestamp;
- fixed pointer at normalized `(0.573, 0.50)`;
- fixed viewport 1672×935 and DPR 1;
- stable particle IDs and stage metrics;
- post-processing on/off controls for diagnostic captures.

The browser gate captures at least:

1. resting native frame;
2. fixed-pointer frame;
3. Bloom/aberration disabled diagnostic frame;
4. reduced-motion/static frame;
5. resize and context-restored frames.

It records renderer, Three and postprocessing chunk sizes, particle count,
CPU frame time, GPU timer when available, and resource cleanup evidence.
Headless ANGLE timing is diagnostic rather than a claim about real-device GPU
performance.

## 9. Acceptance and promotion gate

The isolated prototype is successful only if all of the following hold:

- the 1672×935 resting capture is visually closer to the supplied reference
  than the current OGL candidate;
- the title, SVG overlay and particle home grid share one geometry contract;
- the optical field reads as curved convergence and a fine particle curtain,
  not vertical bars, a symmetric fan or generic fog;
- pointer interaction remains a subtle enhancement;
- mobile, reduced-motion, resize, context loss and unmount gates pass;
- production `/` has no import, route-size or screenshot change;
- dependency licences and acknowledgements are recorded;
- the user explicitly approves the fixed capture.

Failure is also a valid result: if the Three prototype is not visibly better,
it is deleted or retained only as an isolated research route, and production
does not migrate. No production Hero edit is authorized by this design.

## 10. Rejected alternatives

- **Continue tuning the OGL Task 5 first:** rejected because it does not test
  whether the current abstraction is the bottleneck.
- **Unicorn Studio as the implementation:** rejected as the primary route
  because exact glyph coordinates, deterministic simulation, source-level
  lifecycle control and automated rendering evidence are required. It may be
  used separately as a visual mood-board tool.
- **React Three Fiber migration:** rejected because the repository does not use
  R3F and React 18 conflicts with the current wrapper's React 19 peer range.
- **tsParticles as final renderer:** rejected unless a separate sample proves
  exact typography, vertical convergence and performance; it is not part of
  this prototype.
- **particlesGL:** rejected until commercial licensing and Three r128
  compatibility are resolved.

## 11. Official research sources

- <https://github.com/brunoimbrizi/interactive-particles>
- <https://github.com/opentypejs/opentype.js>
- <https://github.com/pmndrs/postprocessing>
- <https://github.com/pmndrs/react-postprocessing>
- <https://github.com/tsparticles/tsparticles>
- <https://github.com/naughtyduk/particlesGL>
- <https://www.unicorn.studio/>
