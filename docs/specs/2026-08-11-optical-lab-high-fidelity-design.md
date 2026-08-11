# Optical Lab High-Fidelity Reference Reconstruction Design

## Status

Proposed for written review on 2026-08-11. The user approved the architecture,
typography geometry, static optical field, pointer-response boundary and fallback
strategy section by section. This document supersedes Candidate B as the active
visual direction. It does not authorize production replacement or deployment.

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

### Human gate

Show full-size reference and candidate side by side at 1672 × 941. The user must
approve typography first, then the resting optical material, then pointer motion.
Passing automated gates does not authorize production replacement.

## Scope

### In scope

- Isolated `/_visual/optical-lab` reconstruction.
- OGL evaluation and dependency/license recording.
- Licensed font specimen and MSDF atlas workflow.
- Multi-pass WebGL2 renderer and generated static fallback.
- Reference-relative browser gates and full-size user review.
- ADR-009, progress, index and handoff synchronization.

### Out of scope

- Production `/` replacement or ECS deployment.
- Backend, API, schema, authentication, upload or Hermes changes.
- WebGPU-only effects.
- Recreating the unrelated blue six-panel Chinese homepage concept.
- Buying commercial shader/font assets without separate user approval.

## Implementation Boundary

After written approval, create a separate implementation plan. The first task is
a typography-only specimen in the isolated Lab; no particles or postprocessing
may be implemented until that specimen passes full-size user review. Production
replacement and deployment remain later, separately authorized operations.

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
