---
name: openscience-handdraw-style
description: Give approved research illustrations an expressive but legible hand-drawn finish in Hermes art planning and image rendering.
metadata:
  version: "3"
  adapted-from: yang0/handraw-style@e1d7586e8a986deff92860e3e7c053a2bba81b64
---

# Reader-first hand-drawn direction

Adapted from [handraw-style](https://github.com/yang0/handraw-style/tree/e1d7586e8a986deff92860e3e7c053a2bba81b64) (MIT; [license](LICENSE.md)). This is a compact visual vocabulary for the existing OpenScience art and render stages, not a new image provider or source of scientific facts. The upstream gallery, sample images, author-name mimicry and automatic browser/download behavior are not used.

## Composition and material

Start with the sourced relationship as the focal shape. Give it a clear silhouette and one reading path, then subordinate context in line weight, scale and contrast. Use marks with specific jobs: fine ink for a boundary or link, graphite for a quiet structure, a wash for background atmosphere, or limited risograph grain for editorial energy. Keep a single ground and space around the exact required labels. A texture should not imply a measurement, trajectory, boundary, apparatus or material absent from the approved scene.

Choose restrained contrast and a small semantic palette. Use color to reinforce the existing encoding, never remap its meaning; reinforce color with direct labels or line shape when needed. Preserve symbols, units, arrows and conditional annotations exactly. At reader-page size, the contribution and its main relationship should read before decoration. Keep the hand-drawn irregularity at the finish level, while scientifically meaningful geometry and label positions stay precise.

Treat a dimension mark as a physical assertion: its endpoints must touch the specified nearest surfaces in the approved view, even if the label and arrow shaft are offset with leaders for legibility. Do not let a stylized edge turn a 20 nm gap into an oblique, wider chord. Reproduce every approved numeric label character for character; a third digit, changed unit or dropped subscript changes the scientific claim. Keep an explanatory pulse or field abstract unless the approved encoding supports its waveform: decorative lobes can be mistaken for data or an extra physical period. These are rendering checks, not permission to revise the approved science.

For an editorial scene, a strong ink silhouette or limited print texture may draw attention. For watercolor, use transparent atmosphere behind sharp meaningful marks. For academic scientific style, use controlled pencil/ink with subtle handmade warmth. If none helps the scene, omit the hand-drawn effect rather than forcing a trend. The final image still needs pixel review against the sources and the approved brief.

## Numbered style catalogue for automatic art direction

`references/style-catalogue.json` is an MIT-licensed, read-only snapshot of numbered style names and descriptive traits from `yang0/handraw-style` at the `adapted-from` commit above; its author field and gallery images are not copied. The catalogue has 277 entries. Twenty-one lack descriptive traits in that upstream index and require a reference image, so they are unavailable for automatic selection in this text-only adaptation. Hermes selects from the remaining entries only after source-grounded scientific intent and visual encoding are fixed. The internal art treatment records the selected number as `HANDDRAW_STYLE=#NNN`; this marker never belongs in visible labels.

The numbered style supplies linework, material, texture and palette, not scientific subjects, apparatus, claims, example objects or copied reference-image composition. Hermes may instead choose a family-qualified Baoyu article or infographic style; Baoyu layout guidance can arrange the already selected relation. Neither catalogue is a required style quota. A catalogue choice and a generated PNG are not evidence of reader understanding or aesthetic acceptance; evaluate the actual image at reader-page size and retain the original source and rejected attempts.
