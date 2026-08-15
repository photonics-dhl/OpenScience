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

1. The production Hermes renderer progressively enhances the original SVG/CSS Optical Guide with an original OpenScience glTF 2.0 scholar robot rendered by the existing OGL 1.0.11 dependency. The GLB loads after the page and first swaps in only after one successful real frame. It has no Pixi, Cubism Core, `.moc3` or third-party character binary.
2. `HermesVisualState` and `hermesTaskHref` remain renderer-independent. The visual and queue row resolve to the same caller-owned `IngestionTask` and Research Object route.
3. The GLB contains six actions mapped exhaustively from `HermesVisualState`. `awaiting_approval` is a still clip; reduced motion creates no WebGL context. Failure, context loss and route transfer restore the original vector portrait.
4. The canonical runtime marker is `data-hermes-renderer="ogl-gltf"`; fallback remains `original-vector`. Code and tests must not label either renderer as Live2D. A future Live2D runtime may only claim that marker after its own license and performance acceptance.
5. The editable `.blend`, deterministic builder, GLB inspector, poster and browser gate are versioned together. Blender is portable and project-local on E:, never installed to C: by this workflow.
6. Wanko remains an optional replaceable renderer. It may be enabled only after the operating customer records its legal identity, applicable category, current agreement acceptance, required copyright notice, permitted purpose and termination response. This decision must be reviewed if any of those facts change.

## Consequences

- Dashboard gains a real, original 3D agent without shipping an unlicensed asset or misrepresenting it as Live2D.
- The runtime stays route-local and lazy. The accepted asset is 1,143,636 bytes raw / 298,555 bytes gzip, 19,024 triangles, six materials and six steady draws; Dashboard first-load JavaScript remains 130 kB in the verified production build.
- The original vector remains a reversible, accessible fallback, while Wanko-specific liveliness is expressed through original motion rather than copied assets.
