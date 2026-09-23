---
name: openscience-handdraw-router
description: Choose a restrained hand-drawn treatment for an already sourced OpenScience illustration scene during Hermes art planning.
metadata:
  version: "1"
  adapted-from: lacemou/handraw-style-router@a778615aeca393085a1d0a89e7c3cd493ee2f474
---

# Hand-drawn treatment routing

Adapted from [handraw-style-router](https://github.com/lacemou/handraw-style-router/tree/a778615aeca393085a1d0a89e7c3cd493ee2f474) (MIT; [license](LICENSE.md)). Its useful idea is to match visual treatment to subject, action, scene, expression, mood and narrative density. Hermes applies that idea inside its existing art stage, after scientific intent is fixed. No separate analysis, user choice, image download, script or model call is required.

## Match the scene

Read the approved scene's message, encoding, labels, subject relationships and selected OpenScience style. Choose **one** treatment that makes the principal relation easiest to notice and recall:

- `scientific`: controlled technical pencil or fine ink, steady geometry, sparse color accents. Hand-drawn character must not weaken axes, topology, units, conditions or label alignment.
- `editorial`: expressive ink or restrained risograph texture, bold focal contrast and generous negative space. Make the actual paper contribution the visual hook; avoid spectacle that resembles an invented physical effect.
- `watercolor`: light wash plus crisp structural lines, quiet palette and a clear focal edge. Wash is atmosphere, never a measured field or an extra scientific region.

If the approved scene or reference already has a specific visual language, use it when it serves legibility. A reference image guides appearance only; it does not add a subject or claim. Resolve ties by scientific readability at the product's display size, then by distinctiveness from adjacent scenes. Express the choice in the existing `layout` and `treatment` fields; do not add visible labels, new fields or an extra selection step. If hand-drawn texture would obscure quantitative structure, retain the cleaner chosen style and use hand-drawn accents only where harmless.
