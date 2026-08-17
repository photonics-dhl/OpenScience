# ADR-010: Hermes Visual Runtime and Live2D License Gate

- Status: Accepted
- Date: 2026-08-11

## Context

Hermes must expose the same real ingestion-task deep link as the Dashboard task queue, communicate six honest states, remain still for approval and reduced motion, and add no critical-path runtime to the Landing page. The earlier direction proposed reusing Live2D Inc.'s Wanko sample from Scholar's Tea.

The Wanko `ReadMe.txt` identifies it as a Live2D Original Character and requires acceptance of the Free Material License Agreement. The official agreement retrieved on 2026-08-11 defines public server availability as publication/distribution and grants different rights according to the customer, latest sales and purpose of use. Repository history does not establish the OpenScience operating customer's eligibility or acceptance. A development agent cannot make those representations on the operator's behalf.

Sources:

- <https://www.live2d.com/eula/live2d-free-material-license-agreement_en.html>
- <https://www.live2d.com/eula/live2d-sample-model-terms_en.html>
- Wanko `ReadMe.txt` retained in the user-controlled Scholar's Tea source tree; its binary is not copied into OpenScience.

## Decision

1. The production Hermes renderer is the original SVG/CSS Optical Guide implemented by OpenScience. It loads after the page, uses one visual instance, and has no Pixi, Cubism Core, `.moc3` or third-party character binary.
2. `HermesVisualState` and `hermesTaskHref` remain renderer-independent. The visual and queue row resolve to the same caller-owned `IngestionTask` and Research Object route.
3. Pointer gaze, orbit, evidence-node signal, scan and fault feedback are compositor-friendly. `awaiting_approval`, `prefers-reduced-motion` and failure fallback remain still and usable.
4. Code and tests must not label the original renderer as Live2D. The canonical marker is `data-hermes-renderer="original-vector"`; a real Live2D runtime may only claim a Live2D marker after its own license and performance acceptance.
5. Wanko remains an optional replaceable renderer. It may be enabled only after the operating customer records its legal identity, applicable category, current agreement acceptance, required copyright notice, permitted purpose and termination response. This decision must be reviewed if any of those facts change.

## Consequences

- Task 9 can close without shipping an unlicensed asset or misrepresenting a fallback as Live2D.
- Dashboard remains lightweight: the verified production build adds no third-party visual dependency and keeps the Dashboard first-load JavaScript at 128 kB.
- The product loses Wanko-specific character motion for now, but preserves the same task/state contract and a reversible adapter boundary.

## 2026-08-16 clarification

This ADR gates the Wanko sample, Cubism Core and other third-party character binaries. It does **not** prohibit an original articulated renderer built from OpenScience-owned textures with a dependency already accepted elsewhere in the product. The static SVG/CSS renderer remains the failure and reduced-motion fallback; the current visual implementation is governed by `docs/specs/2026-08-16-hermes-articulated-mesh-pet-design.md`. No implementation may describe peripheral glow movement as character articulation.
