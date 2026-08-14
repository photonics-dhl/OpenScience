# ADR-009: Optical Runtime and Font Delivery

- **Status:** Accepted
- **Date:** 2026-08-10 (amended 2026-08-11 and 2026-08-14)
- **Decision owners:** OpenScience product engineering
- **Related:** `docs/specs/2026-08-10-optical-editorial-rebaseline-design.md`, `docs/plans/2026-08-10-optical-editorial-frontend-plan.md`

## Context

Optical Editorial v3 needs a pointer-local halftone/displacement field, a credible editorial type system, reduced-motion behavior and predictable ECS deployment. The previous frontend used a generic blue SaaS palette and one display serif. Adding an opaque hosted animation runtime or an unpinned WebGL package would increase bundle, SSR and deployment risk without improving the required effect.

The built-in web-search endpoint returned HTTP 404 during this audit. The same primary sources were therefore checked through direct HTTPS requests on 2026-08-10; every URL below returned HTTP 200. No community blog or secondary license summary was used.

## Decision

### Optical runtime

The 2026-08-10 Canvas-only choice and the 2026-08-11 Lab-only/no-Lab-chunk
restriction are retired for the Landing Hero. They remain historical evidence
of the path that was tested and visually rejected, not active production rules.

#### 2026-08-14 production OGL exception

The approved production exception uses pinned `ogl@1.0.11` through one shared
`AcceptedOpticalSurface` consumed by `/` and the no-index asset Lab. It owns the
ordered accepted energy/typography plates, one selectable semantic `h1` and one
client `AssetInteractionMount`; the two routes do not carry forked renderers.

The active boundaries are:

- production is WebGL2-only for dynamic pixels; WebGL1, no-canvas, WebGL2
  initialization/runtime failure and context loss expose the accepted static
  plates without moving layout or title bounds;
- `prefers-reduced-motion: reduce` uses the exact accepted static frame and
  creates no interaction context or RAF;
- normal motion owns one continuous, low-amplitude ambient RAF while visible;
  it suspends and releases its canvas when the document is hidden, the surface
  is offscreen, reduced motion activates, context fails or React unmounts;
- pointer/touch response remains local to the `.20` longitudinal and `.14`
  transverse flow support. The signed replacement-patch follow is capped at
  `5` CSS px; the combined follow/refraction vector is capped at `10` CSS px.
  Neither term translates the whole title or camera;
- the existing flow texture carries separate local geometry and pointer-centred
  visibility channels. The composite uses the visibility channel for a signed,
  zero-mean directional ripple, so authored typography and energy can scale
  response strength without relocating its centre. This adds no render pass or
  texture;
- local channels reach exact visual zero at `700ms`; same-RAF capture and PNG
  encoding must complete by `900ms` while ambient flow and RAF continue;
- the canvas is decorative and pointer-transparent. SSR always emits the
  semantic title and accepted static assets before client initialization;
- every per-frame operation runs in the visitor's browser. ECS is only a
  Next.js/asset delivery boundary and gains no GPU, driver, Compose, Nginx or
  server-rendered WebGL dependency.

OGL is Unlicense-licensed. The pinned `msdf-bmfont-xml@2.8.0` atlas generator
is MIT-licensed. Its deterministic Archivo and Bodoni Moda inputs, source and
output hashes and verbatim SIL OFL 1.1 notices remain recorded in
`apps/web/assets/optical-lab/fonts/manifest.json`; committed atlas files remain
under `apps/web/public/optical-lab/atlas/`.

Rollback is an exact Git/source boundary, not a runtime feature flag. Before
deployment, record the reviewed release ref and the currently live production
rollback ref plus source hash. If public acceptance fails, redeploy that full
rollback ref; the legacy Canvas source is retained only to make the previous
release reproducible and is not imported by the promoted Landing graph.

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

- The 2026-08-14 production build reports `/` at `805 B` route code and
  `132 kB` First Load JS. Exact manifest accounting for the Landing route is
  `461,103 B` raw / `135,268 B` gzip across client JS/CSS, of which
  `119,866 B` raw / `35,935 B` gzip is route-exclusive relative to the root
  layout.
- The two runtime optical PNGs total `2,485,771 B` on disk/network
  (`target-reference.png` `1,934,383 B`; energy plate `551,388 B`). PNG is
  already compressed; gzip changes the pair only to `2,465,418 B`. The release
  route remains below the visual gate's `3.5 MB` transferred-resource budget.
- Dynamic resolution is capped at device pixel ratio `2`; the accepted compact
  flow texture remains `96×54`. The ambient owner suspends offscreen and in
  hidden tabs as defined above.
- Only transform/opacity are used for ordinary UI transitions. Displacement is isolated to the optical media layer and never applied to form controls or reading copy.
- `next/font/google` downloads source assets at production image-build time. ECS builds therefore require the existing outbound proxy path; the resulting container serves fonts locally at runtime.
- Production build is a gate. If the font download path fails on ECS, the release does not replace the running image; vendored OFL WOFF2 files are the documented fallback.

## Rejected alternatives

- **Hosted animation/CDN script:** rejected for privacy, availability, CSP and version-pinning risk.
- **Three.js or another general WebGL engine:** rejected because the required
  2D field does not justify its bundle and GPU lifecycle cost. OGL is the
  approved shared Landing/Lab production exception.
- **Shader-only hero:** rejected because it weakens SSR, no-JavaScript and accessibility fallback behavior.
- **Generic all-IBM-Plex composition:** rejected because it reproduces the undifferentiated AI/SaaS appearance identified by the user. IBM Plex Mono remains the approved narrow data role from the canonical design spec.
- **Decorative generated image as the brand:** rejected; the wordmark and interactive optical behavior remain the identity.

## Consequences

The production Landing now carries the shared OGL client graph and continuous
visible ambient RAF, so release acceptance must include deterministic browser
matrices, physical GPU evidence, visibility/reduced/failure cleanup and the
measured route/static budgets above. The previous “production bundle unchanged”
and “no Lab chunk on `/`” consequences no longer apply. Physical desktop
evidence must identify the unmasked renderer and display cadence; physical
mobile remains required by default. For this release, the user explicitly
accepted the missing physical-mobile measurement as a deployment risk;
emulation remains supplemental and is not recorded as device evidence.
Deployment still requires an exact release/rollback ref pair and the normal
backup/checkup/public verification runbook.
