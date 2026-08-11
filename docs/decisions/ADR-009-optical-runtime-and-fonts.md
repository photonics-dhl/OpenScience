# ADR-009: Optical Runtime and Font Delivery

- **Status:** Accepted
- **Date:** 2026-08-10 (amended 2026-08-11)
- **Decision owners:** OpenScience product engineering
- **Related:** `docs/specs/2026-08-10-optical-editorial-rebaseline-design.md`, `docs/plans/2026-08-10-optical-editorial-frontend-plan.md`

## Context

Optical Editorial v3 needs a pointer-local halftone/displacement field, a credible editorial type system, reduced-motion behavior and predictable ECS deployment. The previous frontend used a generic blue SaaS palette and one display serif. Adding an opaque hosted animation runtime or an unpinned WebGL package would increase bundle, SSR and deployment risk without improving the required effect.

The built-in web-search endpoint returned HTTP 404 during this audit. The same primary sources were therefore checked through direct HTTPS requests on 2026-08-10; every URL below returned HTTP 200. No community blog or secondary license summary was used.

## Decision

### Optical runtime

Use browser primitives:

- Canvas 2D for deterministic halftone sampling and pointer/touch-local focus.
- SVG/CSS `feDisplacementMap` only where text or a raster layer needs bounded displacement.
- `requestAnimationFrame` for active frames, suspended when the document is hidden.
- A static poster/CSS composition for SSR, no-JavaScript and reduced-motion modes.
- No new runtime dependency in Phase 0. A WebGL helper may be reconsidered only after measured Canvas failure on the ECS acceptance devices.

This keeps SSR safe because the server emits ordinary markup and a poster state; Canvas access occurs only in a client component after mount. Reduced-motion mode does not start the animation loop and preserves all copy, navigation and calls to action.

#### 2026-08-11 isolated Optical Lab amendment

The production Canvas implementation passed engineering gates but failed the user's visual review: its CPU `arc()` loop and separately invented focal/Fresnel passes produced a grey overlay, mechanical lines and decorative wave families instead of continuous glyph deformation. This is the measured Canvas failure anticipated above, but it does **not** authorize a production runtime replacement.

An isolated, no-index route at `/_visual/optical-lab` may therefore use a dependency-free native WebGL experiment with these boundaries:

- the production `/` route and its Canvas renderer remain unchanged and do not import the Lab chunk;
- the server renders a selectable semantic `h1`; Canvas/WebGL access starts only after client mount;
- capability order is WebGL2, then WebGL1 only when half-float support is viable, then DOM/static;
- mobile low-power and `prefers-reduced-motion` use the DOM/static mode without an animation loop;
- the field is a fixed-aperture signed flow texture with bounded glyph displacement, subtle directional caustic/chroma and sparse glyph-edge particles; pointer input changes energy/phase and a bounded vertical bias, never aperture position;
- context loss exposes a fallback state, context restore rebuilds resources, and unmount deletes GL resources and cancels animation frames;
- all per-frame work runs in the visitor's browser. ECS remains a Next.js build/static-delivery host and gains no GPU runtime, driver, compose setting or server-side rendering dependency.

The experiment uses native WebGL rather than OGL, Three.js or a general visual engine, so no package or lockfile change is required. Its route-exclusive emitted client asset measured 19,559 bytes raw / 6,266 bytes gzip and its route CSS 4,134 bytes raw / 1,422 bytes gzip in the 2026-08-11 production build. These figures are evidence for the Lab only; user selection remains a separate gate before any production replacement plan.

Primary references:

- [MDN: SVG `feDisplacementMap`](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feDisplacementMap)
- [MDN: `requestAnimationFrame`](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)
- [MDN: `prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)

### Font roles

Use `next/font` so production serves generated font assets from the OpenScience origin rather than making browser requests to Google:

| Role | Font | License | Loading policy |
|---|---|---|---|
| Display grotesk | Bricolage Grotesque variable | SIL OFL 1.1 | Latin preload, swap |
| Editorial serif | Bodoni Moda variable | SIL OFL 1.1 | Latin preload, swap |
| Chinese editorial | Noto Serif SC 400/600/900 | SIL OFL 1.1 | unicode-range shards, no preload |
| Data / identifiers | IBM Plex Mono 400 | SIL OFL 1.1 | Latin preload, swap |
| UI fallback | System/PingFang stack after Bricolage | Platform licenses | immediate fallback |

Official font-license records:

- [Google Fonts: Bricolage Grotesque OFL](https://github.com/google/fonts/blob/main/ofl/bricolagegrotesque/OFL.txt)
- [Google Fonts: Bodoni Moda OFL](https://github.com/google/fonts/blob/main/ofl/bodonimoda/OFL.txt)
- [Google Fonts: IBM Plex Mono OFL](https://github.com/google/fonts/blob/main/ofl/ibmplexmono/OFL.txt)
- [Google Fonts: Noto Serif SC directory](https://github.com/google/fonts/tree/main/ofl/notoserifsc)

The fonts are visual roles, not a license issued by OpenScience. OpenScience publishes the product and its research-object terms; the font authors retain the OFL notices associated with their font software.

## Runtime and deployment budget

- No JavaScript package or client network request is added by this decision. The isolated Lab adds only its route-scoped native WebGL client/CSS assets described above; the production homepage bundle is unchanged.
- Canvas resolution must be capped by viewport and device-pixel-ratio budgets in Task 4; the effect pauses offscreen and in hidden tabs.
- Only transform/opacity are used for ordinary UI transitions. Displacement is isolated to the optical media layer and never applied to form controls or reading copy.
- `next/font/google` downloads source assets at production image-build time. ECS builds therefore require the existing outbound proxy path; the resulting container serves fonts locally at runtime.
- Production build is a gate. If the font download path fails on ECS, the release does not replace the running image; vendored OFL WOFF2 files are the documented fallback.

## Rejected alternatives

- **Hosted animation/CDN script:** rejected for privacy, availability, CSP and version-pinning risk.
- **Three.js or another general WebGL engine:** rejected because the required 2D field does not justify its bundle and GPU lifecycle cost. The isolated Lab demonstrates the narrower native WebGL path without changing this decision.
- **Shader-only hero:** rejected because it weakens SSR, no-JavaScript and accessibility fallback behavior.
- **Generic all-IBM-Plex composition:** rejected because it reproduces the undifferentiated AI/SaaS appearance identified by the user. IBM Plex Mono remains the approved narrow data role from the canonical design spec.
- **Decorative generated image as the brand:** rejected; the wordmark and interactive optical behavior remain the identity.

## Consequences

The implementation remains small, inspectable and portable, while the visual system gains distinct type voices. Task 4 must prove the Canvas budget with browser measurements and deterministic screenshots. Task 14 must test reduced motion, font readiness and poster fallback before release.
