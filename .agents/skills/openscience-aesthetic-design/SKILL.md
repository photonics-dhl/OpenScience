---
name: openscience-aesthetic-design
description: "Use this skill for every OpenScience UI page, component, shell, Hermes presentation, guide, public reader, research desk, editor, account screen, or management surface. Trigger when the user asks for all-page polish or mentions ugly, flat, toy-like, AI-looking, lacking texture, beauty, artistry, hierarchy, storytelling, mature references, Figma, motion, or visual acceptance. It turns mature product research into a page-specific art direction and verifies the result in a real browser at desktop and narrow widths."
---

# OpenScience aesthetic design

Visual quality is a product requirement. A page that builds and has no runtime error is not aesthetically accepted. OpenScience should feel like an editorial research instrument: calm enough to read, memorable enough to recognize, and composed enough that each page has a point of view.

## Product thesis

The product moves through `encounter → understand → shape → publish → return`.

- Public pages are an exhibition and reading room.
- The private surface is a research desk.
- A work area is an instrument around one research object.
- Hermes is a contextual companion, never a fixed banner or a reading obstruction.

Keep cold paper, ink, teal, restrained vermilion, editorial typography, real research media, measured rules, and intentional asymmetry. Landing keeps its approved optical hero and copy; its navigation may be reconciled with the product shell.

## Workflow

### 1. Write the page brief before styling

Record the surface family (public discovery, reader, guide, research desk, workbench, account, administration, identity), mode (persuade/read/operate/experience), one first-viewport job, one visual anchor, secondary material that should recede, and Hermes' role. Resolve competing primary actions before adding decoration.

### 2. Study mature references

For a system-wide or visibly weak redesign, inspect at least two current official references such as Apple, GitHub, Linear, or Stripe. Record transferable principles: narrative sequencing, what navigation removes, typography-led hierarchy, real work as the visual anchor, and motion as continuity. Use Figma when its connection and a concrete file are available. If it is unavailable or requires reauthentication, record the exact limitation and continue with browser/repository evidence. Never claim a Figma inspection that did not occur.

Do not copy another site's source code, proprietary assets, copy, or brand. Translate principles through OpenScience's research story.

### 3. Lock one art direction

Name the composition in one sentence, such as “a field notebook opening into a public research folio” or “an instrument panel around the next unfinished thought.” Choose one dominant rhythm (editorial columns, exhibition rail, instrument grid, or split plane), one type contrast, one material contrast, one signature detail, and one purposeful motion language with a reduced-motion fallback. Do not combine a generic dashboard card wall, centered marketing hero, glassmorphism, and decorative gradients.

### 4. Compose before decorating

The first viewport must make the title, primary action, visual anchor, and next step legible in that order. Use scale, alignment, crop, whitespace, and contrast before borders or effects. Cards represent meaningful objects or states; avoid identical card grids, equal-weight controls, and repeated pills.

Review an actual before/after pair before retaining a visual treatment. A large dark panel, glass decoration, serif headline or extra shadow is not evidence of better art direction. Ask whether the treatment strengthens the research itself or merely makes its container louder. When two adjacent headings compete, separate their roles through scale, measure and shared baselines. Keep attribution beside the work it describes; captions must remain readable. Preserve the scientific image's complete pixels and labels.

Do not dedicate an empty full-height rail to Hermes. Reserve its shared footprint within the page's meaningful composition. On phones, pair the compact actor with a short supporting passage or action area so that the next real content does not fall behind a separate empty row. Inspect the resulting viewport, not only the actor's bounding box.

### 5. Implement with the existing system

Reuse OpenScience tokens, shell, type, Hermes, media, and route semantics. Add a token/component when a pattern appears on two or more pages; keep page-specific composition in page overrides. Every changed interaction needs visible focus, hover, active, loading, success, error, empty, and disabled states where relevant. Reserve media space, keep touch targets at least 44px, and honor `prefers-reduced-motion`.

Hermes is 360px on desktop. Narrow screens use a compact expandable entry. Speech must emerge from the hat/face anchor without covering titles or controls. Landing does not receive the floating stage. The shared stage must be clamped to the visible viewport after route changes.

### 6. Real-browser acceptance

Open the actual route after implementation. Inspect 1280/1440px and 390/375px, first viewport and full route. Ask:

- Is the page's purpose clear within two seconds?
- Is there one visual anchor and a readable eye path?
- Does the page still feel composed with motion and shadows removed?
- Do long Chinese titles, empty/error states, and media loading preserve hierarchy?
- Is Hermes consistent, contextual, and out of the reading path?
- Are there console errors, overflow, clipping, layout shift, or broken focus states?

Walk public home → explore/guide/journals → sign-in → research desk → create/continue → Hermes/editor. Auth-limited routes are `not browser-observed`, not accepted by inference. Run one batched review, fix it, then one confirmation review.

## Handoff

Report the brief and art direction, reference principles and translation, changed files, browser-observed routes/viewports, remaining tool/auth/deployment limits, and separate `candidate`, `deployed`, `browser-observed`, and `user-accepted`. Never use “looks good” as evidence.
