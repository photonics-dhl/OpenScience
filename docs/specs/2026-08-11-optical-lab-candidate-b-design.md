# Optical Lab Candidate B Design

> **DEPRECATED → see
> `docs/specs/2026-08-11-optical-lab-high-fidelity-design.md`.** Candidate B
> passed engineering gates but was rejected by the user for typography,
> reference fidelity and material quality. This file remains historical.

## Status

Approved visual direction on 2026-08-11. This document defines an isolated
Candidate B experiment. It does not authorize replacing or deploying the
production Landing.

## Goal

Make the resting desktop composition visibly closer to the user reference:
one continuous `OpenScience evolves.` wordmark, a fixed optical waist at 58%,
a bright but narrow focal caustic, and a directional downstream emission.
Pointer input adds a restrained whole-line liquid-refraction response; it does
not create the primary effect and never moves the optical axis.

## Visual Thesis

- **Atmosphere:** precise black optical bench with warm-white type and one
  restrained vermilion spectral accent.
- **Content:** preserve the existing three-way Lab comparison; change only the
  Candidate renderer so reference, production baseline and Candidate B remain
  directly comparable.
- **Interaction:** the resting frame carries the complete optical topology;
  pointer movement produces smooth, low-amplitude refraction across the whole
  line and settles without bounce.

The Lab continues the existing dark editorial vocabulary. It introduces no
new cards, gradients, fonts, navigation, imagery or decorative page sections.
The CSS strategy remains the repository's existing global utility/style layer;
the optical material itself remains native WebGL shader code.

## Selected Approach

Use one visible GPU-rendered glyph layer whenever WebGL is ready. The semantic
DOM `h1` remains in the document, selectable and available to accessibility
tools, but its duplicate visual ink is suppressed only while the GPU layer is
ready. DOM ink immediately returns for WebGL failure, context loss, mobile
low-power policy and reduced motion.

This replaces Candidate A's visually competing DOM/GPU ink. It is preferred
over a local GPU overlay because whole-line refraction must remain continuous,
and over multilayer volumetric scattering because that would add cost and
visual invention without improving reference fidelity.

## Resting Composition

Candidate B must look intentional before any pointer event:

1. The glyph texture remains legible as one continuous title.
2. Upstream glyph coordinates compress monotonically toward the fixed aperture
   at normalized `x = 0.58` without creating a circular boundary or hole.
3. A narrow high-energy waist appears at the aperture, aligned to the title's
   optical center rather than the pointer position.
4. Downstream energy opens directionally to the right as sparse rays and
   glyph-derived particles; it must not become a symmetric spider-web fan.
5. Chroma remains subordinate: warm white is dominant and vermilion is a small
   focal accent, not a full-title RGB split.
6. No grey DOM ghost, duplicate title or mechanical vertical divider is visible.

## Pointer Response

- Pointer position is converted to smoothed phase, energy and a whole-line
  refraction vector. It is never used as a new aperture or radial mask center.
- The whole title responds through a spatially smooth displacement field. The
  peak visible displacement budget is 8 CSS pixels at desktop reference size.
- The fixed aperture, waist and downstream direction remain spatially stable.
- Response uses exponential ease-out with no elastic bounce. Stopping input
  returns to the resting composition within the existing 650 ms recovery
  window.
- Pointer motion may strengthen the waist and emission slightly, but the
  resting frame must already contain both.

## Rendering Architecture

```text
SSR semantic h1
      |
      +-- WebGL unavailable/policy fallback --> visible DOM title
      |
      +-- WebGL ready --> visually suppressed DOM ink
                            |
                            v
                    glyph alpha texture
                            |
              resting fixed-slit displacement
                            |
               smoothed pointer refraction
                            |
             continuous title + caustic + rays
                            |
             sparse instanced edge particles
```

Candidate B reuses the reviewed transactional renderer lifecycle:

- fresh-canvas WebGL2 initialization;
- rollback and fresh-canvas WebGL1 retry after any WebGL2 failure;
- DOM fallback after both attempts fail;
- explicit context-loss recovery and exact resource cleanup;
- no server-side canvas, WebGL or GPU work.

The server only delivers the Next.js document and client assets. Rendering
runs on the visitor's browser GPU through WebGL2 or WebGL1. Therefore the ECS
does not need a GPU, GPU driver, container runtime change or compose change.

## Accessibility and Fallback

- Keep exactly one semantic, selectable `h1` in the Candidate panel.
- The canvas remains `aria-hidden`.
- GPU readiness controls only visual DOM ink; it never removes the heading from
  the accessibility tree or changes its layout bounds.
- The transparent-ready state defines an explicit `::selection` treatment that
  reveals warm-white selected glyphs, so copy selection remains visibly usable.
- Context loss must reveal DOM ink in the same frame that the GPU state becomes
  unavailable.
- Mobile low-power and reduced-motion modes keep the current readable static
  DOM fallback for this Candidate B iteration. Mobile optical parity is a
  separate decision after desktop visual selection.

## Acceptance Gates

Implementation follows RED-GREEN-REFACTOR. Before shader changes, tests must
fail for Candidate A and prove the missing Candidate B behaviors:

1. **Single visual ink:** when WebGL is ready, a browser ghost probe sees no
   duplicate DOM title; fallback cases see readable DOM ink.
2. **Resting optical energy:** before pointer input, candidate-only pixels show
   a narrow aperture waist and nonzero directional downstream energy.
3. **Reference topology:** the resting frame rejects circular boundaries,
   white rings, mechanical lines and symmetric radial fans.
4. **Interaction:** left/slit/right pointer frames differ meaningfully from the
   resting frame, remain mutually distinct, and stay within the 8 px response
   budget without moving the aperture.
5. **Continuity:** glyph occupancy remains connected across the aperture region
   instead of producing a dark overlap or severed word.
6. **Lifecycle:** existing WebGL2/WebGL1/failure/context-loss/resource-cleanup
   gates remain green.
7. **Performance:** headless production-start gate keeps a viable rendered
   frame rate and records CPU/GPU diagnostics. Real-device performance remains
   part of the later user selection gate.

## Scope

### In scope

- Candidate-only shader, model parameters and visual acceptance probes.
- Candidate DOM/GPU visual-ink state synchronization.
- Local production-build screenshots and metrics.
- Existing Optical Lab documentation and task ledger updates.

### Out of scope

- Production `/` replacement or deployment.
- ECS, Docker, API, schema, authentication or dependency changes.
- New fonts, image assets, WebGL libraries or server-side rendering work.
- Mobile optical-effect redesign.

## Decision Gate

Candidate B remains inside `/_visual/optical-lab` until the user compares the
fresh local evidence with the target reference. Production replacement, if
selected, requires a separate implementation plan and explicit deployment
authorization.
