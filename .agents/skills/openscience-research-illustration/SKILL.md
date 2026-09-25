---
name: openscience-research-illustration
description: Plan and refine evidence-grounded research illustrations for OpenScience through Hermes and Chat image generation, using structured briefs, source-scoped visual references and reusable art directions. Use for paper illustrations, scientific concept images and research covers; quantitative plots require a data renderer.
metadata:
  version: "12"
---

# OpenScience research illustration

Create a readable scientific image with a deliberate composition. The source supplies the science; the user's accepted images and feedback guide the art. Chat image generation is the current primary execution path. Keep Codex CLI available as a reserve; never select it automatically or consume its quota as a fallback.

## Scientific intent

Use the upstream reviewed scientific result and its bound original passages before selecting a visual explanation. In Hermes, the existing `scientific-critical-thinking` runtime skill supplies shared scientific reasoning to this stage and scientific review; this skill adds visual meaning and art direction. Read the actual loader/call path to distinguish installed guidance from consumed guidance. Do not repeat the full paper analysis when a supported upstream focus already exists; unresolved upstream conclusions must not become image facts.

Claim `kind` and `assessment` describe argument role and internal review state, not additional evidence. Do not present partial/disputed/missing support or a counter/boundary Claim as an unqualified established result. Such inputs can explain uncertainty or limits when supported; do not discard them merely for their status. Ingestion completion alone does not establish scientific support.

For a local illustration or an explicit figurePlan, select one useful scientific explanation per requested image from the upstream reviewed analysis and its complete original passages. This stage chooses what the reader should understand, not an artistic style. Preserve complete source context: do not split equations from definitions or qualifiers to fit a short quotation field.

Write each scene `narration` as a reader-facing scientific explanation of what the selected relationship establishes and why its condition or limit matters. A local scene has only 120 characters: narrow the takeaway instead of spending that space on the layout. Do not narrate drawing instructions, gaze order, label positions or phrases such as “the reader sees”; those belong in `composition`/`treatment`. The image shows the relationship; the narration explains its paper-supported meaning. A poor narration needs ordinary scientific planning revision, because art-only revision preserves it.

For an explicit whole-paper narrative, consume the existing same-version SDF, reviewed full-paper analysis and internal scientific review; do not run another whole-paper analysis. Establish the main contribution and intended reader, then choose 1–6 focused scenes in an explanatory reading order. Distinguish original contributions from background and connect the key steps without a fixed number or panel template. Each scene still explains one coherent supported relationship. Titles and reader narrations explain its role, define essential terminology and preserve conditions; they are scientific content, not decorative copy. SourceMap excerpts provide additional context with explicit coverage, never a claim that a partial packet contains the whole paper. Insufficient reviewed evidence must remain a gap, not become a visual invention.

Use available approved paper figures when their unchanged content serves a narrative step, including quantitative results lacking reusable data. Place originals where the reader needs them, not automatically first. An original is source material with a sourced reader explanation; copying it does not constitute a redesigned illustration or automatically satisfy narrative review. Generate a new conceptual visual only for a supported explanatory role. Never turn absent data into an AI-drawn quantitative curve.

For each selected explanation, establish the domain, the minimum subjects and relationships, exact short labels, essential conditions and the meaning of every intended visual mark. Use complete original passage identifiers; the server supplies their actual text. The passage must support the full statement, including qualifiers. Reviewed summaries supply context but do not override a conflicting or narrower original passage. Unsupported details should be left out or reported as missing, not repaired from general knowledge.

The renderer uses `labels` as the complete visible-text list. A variable mentioned only in a subject, encoding or composition will not be printed. Reserve labels for every necessary coordinate axis, classification boundary and essential condition before optional titles or decorative annotations. Bind each label to its corresponding mark in the encoding. If the label budget cannot make the picture self-contained, narrow the explanation instead of dropping its coordinate or threshold meaning.

When the takeaway is a classification, each region needs its source-supported category name as well as any defining criterion. An inequality alone may identify a boundary without telling the reader what the category means. Combine the name and criterion in the same short label when appropriate.

## Scientific encoding

Establish the source-supported coordinate domain and viewing plane before arranging a physical scene. Describe object extents, openings, trajectories and incoming/outgoing directions in that frame, then project them into the chosen view. Distinguish directions within the plane from directions into or out of it. Trace each physical path through the proposed arrangement and compare the depicted directions with the source relationship; a logical arrow is a different kind of mark. Put the necessary frame or projection indicators in the visible labels. When the sources do not establish a consistent spatial construction, choose a narrower supported conceptual relationship.

Assign each visible group its fixed conditions, varied quantities and reported outcomes. Combine results only when those conditions agree. A parameter sweep and a fixed-parameter example need distinct condition ownership even when they concern the same material. Match each promised takeaway to a visible label or supported visual relation; a result present only in a caption, subject or constraint does not make it visible in the image. Narrow the takeaway if its essential outcome and conditions cannot be shown clearly.

Decide whether lengths, areas, spacing and point sizes encode values or merely arrange an explanation. Quantitative comparisons conveyed by geometry require a common scale within each stated coordinate system. Use an available data renderer or approved original when exact ratios or data-derived shapes carry the takeaway. A generated conceptual schematic can use sourced dimension annotations with explicit non-scaled meaning, but cannot simultaneously claim proportional comparison through rulers or geometry. A non-scaled label does not excuse impossible topology, intersecting trajectories or wrong directions. For qualitative density encoding, vary only the quantity the encoding names; do not also vary point size unless it has its own supported meaning. A meaningful color has one consistent role.

The science fields and encodings are carried into art direction unchanged. Later stages can arrange and style them but cannot introduce another scientific idea, equation, numerical example or relationship. An invalid scientific intent must return for correction before image generation.

A replaceable artistic container is not scientific encoding: a stamp, badge, seal or decorative frame cannot be prescribed by `encoding` or the scientific narration merely to display a supported conclusion. State the mark's source-supported meaning and its limits there; put its replaceable shape, placement and material in `composition`/`treatment`. If an inherited science field names a rejected artistic form, an art-only revision cannot remove the conflict. Use the existing ordinary planning revision to clarify that field against the same sources before rendering, while preserving unaffected scientific content.

Read equations literally before turning them into visual motion. A dot-product condition constrains a projection; it does not by itself require parallel vectors. In a dispersion relation, `ω(k)` is frequency, not the spatial distance between wave crests. A qualitative wave motif may explain a relation, but its orientation, spacing and motion must not silently add a second physical condition or quantitative claim. Additional requirements for emission or coupling need their own bound source, even when they sound physically plausible.

## Planning

Design the already selected scientific intent. The upstream literature analysis and its reviewed original passages establish what was studied, what was established, how it works, and under which conditions. Its visual explanation may be a physical arrangement, mechanism, comparison, classification or another relationship; do not assume every paper needs the same kind or number of pictures. A generated conceptual illustration cannot replace a quantitative data renderer.

Identify what must remain invariant before considering style: the scientific domain, source-supported subjects, relationships, quantities and essential conditions. A reference image is visual guidance, not evidence for the new paper. A changed upstream analysis invalidates the old visual intent; derive a new one rather than preserving a stale picture.

Produce a structured illustration brief, not a long drawing monologue:

- `message`: one concise scientific takeaway.
- `domain`: the single domain depicted in this image: real-space, wavevector-space, time, frequency, parameter-space or conceptual.
- `subjects`: the scientific elements and relationships needed for the takeaway, each linked to the supplied Claim and original passage. A description can establish a relationship or condition, not just name an object. Select supplied passage identifiers; the server resolves them to exact evidence, never manufacture a quotation.
- `encoding`: the scientific meaning of each necessary mark, axis, region, arrow or color, kept separate from artwork in a v2 brief.
- `composition`: focal scale, reading path, spacing and placement of existing subjects and labels; it cannot redefine their scientific meaning.
- `treatment`: concrete material, palette, line/edge treatment and type hierarchy; select a relevant direction from [art-directions.md](references/art-directions.md).
- `labels`: the exact short visible text. Essential symbols and conditions must survive intact. Put titles, long equations and derivations in the article unless indispensable to this picture.
- `constraints`: the few source conditions and visual exclusions needed to prevent a wrong reading.

Every scientific relationship, variable, formula and condition in `message`, `encoding`, `labels` or `constraints` must be established in at least one subject description and supported by that subject's original basis. Composition and treatment concern visual design only. An object existing in the source does not establish an invented relationship between objects.

Resolve the visual encoding before arranging the composition. For each meaningful axis, distance, region, line, arrow or color, state which sourced subject/relationship it represents and in which domain. Physical position, a parameter coordinate and a logical grouping are different encodings; do not turn one into another for visual richness. Calling a mark symbolic does not excuse a false mapping. Keep one consistent meaning per color. Put semantic color/mark meanings in `encoding`; keep `treatment` to material, palette, edges and typography. Prefer a narrower takeaway over a collage of loosely related source facts. Each basis must support the complete subject description, including its qualifiers; remove unsupported extensions instead of attaching a nearby quotation.

Keep independent scientific domains distinct. Coordinate dimensionality, units and variables must agree with their stated domain. When an explanation needs several domains, use separate scenes/images with explicit relationships, rather than blending axes and gradients. Every mark that looks like data needs source support. Texture belongs to the artistic treatment and must not imply a measured field.

Choose composition from the relationship, not the style name. A process may use a sequence; classification may use a domain partition; a cover may use one expressive subject. Do not turn every paper into a process diagram, a decorated circle or a grid of summary cards. A small label budget is a reason to simplify the explanation, not to shrink text or drop an essential condition.

For a revision, distinguish a local correction from a new style variant or a rejected overall design. Retain unaffected science and only artwork aspects explicitly accepted by the user. Scientific approval of an old plan does not make its layout or treatment aesthetically accepted. A new art direction or rejected design can change hierarchy, composition and material; changing a background or recoloring a motif is insufficient. Preserve useful reference qualities without copying unrelated scientific content. Watercolor is one supported direction, not a default for every paper.

For an art-only revision of an existing structured image plan, use the existing storyboard generation request with `baseAssetId` and `revisionMode: "art"`. It reuses scientific fields directly and runs the installed art guidance plus the existing final scientific review. Locale and scientific content stay unchanged; a request to alter either needs the ordinary planning path. Replace rejected choices in composition/treatment rather than preserving them as old instructions alongside a conflicting reference.

For whole-paper art revisions, preserve the main message, audience, scene order and every reader title/narration. Apply the selected style only to generated scenes; original images retain their bytes and placement in the reading sequence.

Assign palette and emphasis to the already established visual roles. Categories that readers must distinguish need visible separation; supporting axes and leaders should remain quieter than the subject. Put primary label phrases at the first reading level and their existing definitions at a smaller, still readable second level. Describe these choices in composition/treatment so the renderer receives them; a style name or reference attachment alone does not make them happen.

If scientific review only found missing explanations in existing labels, reuse the saved candidate through the scoped label-clarification path. Preserve label indices, symbols, axes, domains and artwork; do not regenerate the whole scientific intent to add a category name. This path cannot repair a missing axis, incorrect equation or changed source. Such problems require a new scientific plan. Every clarified candidate still needs the existing scientific review before rendering.

Before submitting a brief, read its subjects, labels and constraints together: they must use consistent variables, domains and assumptions. Remove a formula if the image does not need it; never invent or approximate one. The brief should fit the actual image transport's prompt budget without a second model having to reinterpret it.

## Visual craft

Composition and treatment are design decisions, but they are not free-form. Use the concrete laws in [art-directions.md](references/art-directions.md); the following are the ones that most often fail on real submissions.

**One ground.** The whole canvas is a single flat surface of one chosen colour. Two grounds, a recoloured panel, a band, a vignette or a wash falloff read to the viewer as a broken image, not as design. If the explanation genuinely needs panels, they share the identical ground and are separated by spacing and line work alone.

**Dividers must assert something true.** A rule, frame, box or band is justified only when it corresponds to a real source-supported boundary. A decorative rule between two halves of a picture, or a "top half / bottom half" split introduced purely to organise the page, is removed. If the sourced meaning of a mark cannot be named, the mark does not ship.

**One focal point and an explicit reading path.** State which element is seen first and in what order the rest is read. All remaining marks are subordinate in scale, weight and contrast. Concentrate the visual daring in the focal relation and keep the surrounding field quiet.

**A catalogue default is not a design.** Swapped-in infographic galleries offer multi-module layouts (bento grids, dense modules, dashboards). These are options, never the requested structure: one scientific relationship normally wants one continuous composition, not a panelised poster. Do not adopt a gallery's default layout, palette or framing merely because it was offered.

**Neutrals are chosen, colour is semantic.** Decide the ground deliberately and tint neutrals toward the subject's own hue family. Never mix a warm ground with a pure-white area inside one picture; that reads as two images. Keep one meaning per colour, and keep axes, leaders and grids quieter than the subject.

**Two label levels, fixed.** Primary labels carry variables, categories and boundary values; a smaller secondary level carries essential qualifiers. Do not introduce a third decorative level, and do not use text as ornament.

**Check at reading size.** Verify the composition at single-column width. If the ground reads as two pieces or the hierarchy collapses, simplify rather than add.

## Scientific review

Review the selected scientific intent against its complete bound original passages and the upstream conditions, limitations and conflicting evidence, including meanings introduced by composition and treatment. Do not repeat the whole-paper synthesis. Citation identity establishes where text came from; it does not establish that a description follows from it. Check each subject, relationship, condition, formula and visible label, then the meaning of axes, distances, regions, arrows, curves and semantic colors. A layout must not turn a logical relationship into a physical trajectory or invent data from an equation.

For a whole-paper narrative, use the already completed upstream analysis to review the main message, intended audience, titles, narrations and reading sequence in this same call. A collection of individually correct scenes may still omit the main contribution or fail to connect its steps. Return an upstream replanning issue for those gaps or unexplained essential terminology. Review the scientific explanation surrounding an unchanged source image just as rigorously; registration and copying do not establish the caption. Art corrections must not pretend to alter a verbatim original.

For every scene, inspect the title and `narration` as text the reader will actually see beside the image. If the narration mainly describes the drawing or omits the selected scientific takeaway and its necessary limit, block it for upstream planning correction even when the image brief is scientifically accurate. Do not repair this scientific reader text through an art-only correction.

Assess the picture a reader can actually see: `labels` is its exclusive visible-text list, while other fields guide drawing. A necessary axis variable or boundary value present only in encoding is still missing from the picture; return a scientific-field correction upstream. A function drawn against coordinate axes asserts its shape, signs, zero crossings and relative extrema even without numeric ticks or with a conceptual disclaimer. Such a plot needs a data renderer. For Chat illustration, select a supported nonquantitative relationship rather than accepting an invented curve because its formula is correct.

For every generated scene, compare the proposed `encoding`, `composition` and `treatment` mark by mark, including direction, connectivity, implied distances and all text callouts. Check vector operations and frequency/wavelength language against the exact original passage; do not accept a correct displayed equation beside a contradictory drawing or explanation. A reviewer summary must not substitute for this comparison.

If encoding or narration prescribes a rejected decorative form while composition or treatment forbids it, return a blocked upstream issue naming both fields. Do not accept the candidate or claim an art-only correction can override unchanged science fields. Keep the supported relationship and label; revise only the misplaced visual-form instruction through the existing science planning path.

Retain the selected Claim's complete reviewed statement and Evidence while source roles remain field-scoped: an unselected passage marked `supports` may contain essential qualifiers. Claim kind/assessment are review context, not evidence or visible labels; preserve partial, disputed, counterexample and boundary meaning. Unconfirmed intermediate semanticStage output is not an approved finer-grained source. Do not silently reduce the context to subject citations alone.

Use the workflow's existing final review with its configured provider and the caller's exact decision and output schema. Accept a faithful candidate unchanged. When the caller permits local art corrections, change only the affected scene's composition/treatment while preserving scientific fields, scene order and unaffected artwork; otherwise report the unresolved issue as blocked. A scientific error must identify the scene, field, source and needed upstream correction; it cannot be repaired by silently substituting another relationship or rewriting the complete storyboard. Compile accepted fields directly without another creative rewrite. Keep the review attached to the actual task, version, source evidence and candidate in internal provenance. A missing, ambiguous or unusable review does not authorize image generation. Scientific review is separate from the user's aesthetic approval.

In that same existing review, compare composition and treatment with the explicit user art request. If the planner materially ignored a requested art direction, background, layout, texture or typography, report the mismatch through the caller's allowed feedback or composition/treatment correction fields while preserving all science. Do not preserve a previous art choice merely because its scientific plan was approved. Distinguish an objective instruction mismatch from subjective taste; conformance does not certify beauty or replace the user's judgment. Do not add another review call or change science to accommodate decoration.

## Execution

Use the existing Hermes task, source, permission and approval workflow. Its science and art planning stages produce a candidate; the configured final reviewer checks its complete scientific meaning before the final brief is saved. This skill supplies task methods, not provider selection or an additional review stage. Generate from that saved structured brief; compile its fields into the drawing request without another free-form scientific rewrite. Do not claim that JSON validity or a model's acceptance proves scientific or artistic quality.

When the user specifies an existing image as a reference, pass its actual bytes through the authorized Chat reference-image path. Restrict it to the allowed research object/version. Record the reference asset and its existing content identity; state whether it is style guidance or scientific source material. This skill's default reference role is style only. If the transport cannot attach it, report that limitation rather than claiming a text description is reference-image generation.

Generate one selected candidate through Chat, inspect the actual returned image at its product display size, and assess science, labels, visual hierarchy and fidelity to the selected reference separately. Retain the original and candidates. A failed or ambiguous send must use the existing recovery rules; do not regenerate just because the reply was slow. Stop a scientifically misleading candidate from entering publication.

If a correction is needed, change the relevant structured field or select a different reference. Do not append another round of universal prohibitions. Keep case-specific preferences in the task/brief, not in this skill. Update reusable guidance only for demonstrated general failure modes.

## References and reuse

Use [art-directions.md](references/art-directions.md) for concrete art direction. The installed MIT-licensed `baoyu-article-illustrator`, `baoyu-cover-image` and `baoyu-infographic` provide original composition and style references; Hermes loads relevant design sections only. Scientific constraints and the user's current request take precedence over template defaults. `baoyu-image-gen` informed reference-image and execution separation; it does not itself provide our Chat webpage transport. Do not install or switch providers merely because an upstream example uses one.
