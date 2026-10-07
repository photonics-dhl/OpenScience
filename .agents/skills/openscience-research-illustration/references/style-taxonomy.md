# OpenScience visual style taxonomy

This is the routing layer for the installed visual catalogue. It does not add
scientific knowledge and it does not replace the source-bound illustration
brief. A style is useful only when it makes the selected relationship easier
to read at the final page size.

## Catalogue inventory

- The installed hand-drawn catalogue contains 277 entries. 256 have text
  traits and can be chosen automatically; 21 require an actual reference
  image and remain explicit-only.
- Baoyu article-illustrator contributes 23 styles, infographic contributes 22
  styles, and infographic contributes 21 layout references.
- Every installed id remains selectable when a user or an approved brief
  names it exactly. Automatic selection uses the curated routes below so a
  large catalogue does not become a random style lottery.

## STYLE TAXONOMY

Choose the visual genre from the reader's need and the sourced relationship,
then choose one primary style and at most one materially different alternative.
The ids below are exact family-qualified ids or exact hand-drawn numbers.

| Reader need and source relationship | Primary routes | Useful alternative | Visual decision |
|---|---|---|---|
| A physical mechanism, apparatus or material boundary whose geometry is already resolved | `article:editorial`, `article:blueprint`, `infographic:technical-schematic` | `handdraw:#029`, `article:ink-notes` | Use one continuous composition, a quiet ground, precise silhouettes and direct labels. Use blueprint or technical schematic only when the view, openings and dimension ownership are known. |
| A mathematical or conceptual relation where literal geometry would mislead | `article:ink-notes`, `article:minimal`, `handdraw:#157` | `article:elegant`, `handdraw:#002` | Let the relation be the focal shape. Use restrained ink, negative space and semantic accents instead of decorative apparatus. |
| A sequence, route, transformation or network | `infographic:subway-map`, `article:scientific` | `handdraw:#002`, `article:editorial` | Use a clear reading path and line hierarchy. A route line is logical unless the source explicitly says it is a physical trajectory. |
| A comparison, classification or boundary | `article:editorial`, `infographic:morandi-journal` | `infographic:aged-academia`, `handdraw:#165` | Separate categories by sourced marks, spacing and restrained color; do not turn the scene into a dashboard or card grid by default. |
| A natural, biological or atmospheric explanation where soft material helps the reader | `article:watercolor`, `handdraw:#229` | `infographic:storybook-watercolor`, `handdraw:#258` | Keep meaningful edges and labels crisp; use washes only as atmosphere and never as an invented measured field. |
| A friendly educational explanation for a non-specialist reader | `article:sketch-notes`, `infographic:hand-drawn-edu` | `handdraw:#003`, `article:ink-notes` | Use generous whitespace and one focal explanation. Characters and doodles are optional and must not replace the scientific object or relation. |
| Historical, archival or specimen-like subject matter | `infographic:aged-academia`, `article:vintage` | `handdraw:#255`, `article:screen-print` | Use paper and ink texture as a visual register, not as evidence of age, measurement or material properties. |
| A cover or editorial hero whose job is atmosphere rather than detailed mechanism | `article:elegant`, `article:screen-print` | `handdraw:#129`, `handdraw:#255` | Establish one memorable silhouette and a quiet title area. Do not use a cover treatment for a technical scene that needs exact geometry. |

The hand-drawn catalogue is grouped by visual behavior rather than by author
name: fine conceptual line and diagram (#002, #029, #157), restrained
editorial line (#003, #084, #165, #174), grainy print and East-Asian editorial
(#129, #255), and organic or atmospheric editorial (#229, #258). The remaining
entries are still preserved and can be selected explicitly, but character,
comedy, toy, pixel, cyberpunk and high-decoration groups are not automatic
defaults for a serious scientific mechanism.

## GEOMETRY GATE

Complete this check before style selection and again before rendering:

1. State the material identity, the actual entity, its extent, the section or
   projection shown and the evidence for each. A material label does not decide
   whether an object is a cylinder, disk, slab, sphere or cutaway.
2. State which openings are real, which paths are physical, and which lines are
   only logical correspondences. Solids, gaps, trajectories and fields must not
   intersect in a way the source does not support.
3. Assign every width or dimension to its owner and endpoints. A geometric
   opening, field width and temporal width remain different quantities even if
   their units look similar.
4. Mark non-scaled conceptual geometry explicitly. Never make a shape look
   proportional merely because a numeric label is present.
5. Give every semantic color one job. Texture, glow and gradients are artistic
   only and must not imply a measured field, material property or extra pulse.
6. If the source does not resolve an exact 3-D construction, choose a faithful
   conceptual, orthographic or cross-section encoding and retain the limit.
   Do not let the image model guess a more specific object.

The demonstrated failure class is a generic black-cylinder apparatus with a
blue glow used as a placeholder. It is rejected unless the source explicitly
supports those solids, that view and that field meaning. A style reference can
never repair a geometry gap: **Do not let a style reference decide the
scientific geometry.**

## Visual quality contract

The selected treatment must make these decisions concrete rather than repeat a
style name:

- one focal relationship, one declared reading path and a quiet supporting
  field;
- one ground, generous margins and deliberate negative space;
- a small palette in which color has a single semantic role;
- two readable label levels only, with primary variables and conditions near
  their marks;
- clear silhouettes, controlled line weights and no decorative panel split;
- a visible difference between the selected style and its alternative in
  medium, linework, palette or composition;
- no stock icons, random 3-D gloss, generic neon, fake equations or extra
  labels copied from a catalogue example.

## Rendering checklist

Before submitting an image request, confirm that the final brief still names
the source-supported object form, view, openings, paths, dimensions, semantic
colors and exact labels. Then confirm the treatment names the ground, focal
scale, reading path, material/line behavior, palette and type hierarchy. If any
of those fields is missing, revise the brief or stop; do not compensate with a
longer negative prompt or another random style.
