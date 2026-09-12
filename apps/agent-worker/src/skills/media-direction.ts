/** Source-constrained art direction used by the existing Hermes media planners. */
export const SCIENTIFIC_ART_DIRECTION_SKILL = {
  id: 'scientific-art-direction',
  version: '1',
  instructions: [
    'ART DIRECTION: Start from the one scientific relationship the reader should understand and the requested audience/use. Make it the visual focal point. Use a clear reading path, generous negative space and a small coherent palette. A cover illustration may be expressive; a teaching diagram prioritizes explanatory labels. Do not default to a panel for each summary field.',
    'Translate the requested aesthetic into concrete choices: material/texture, palette, lighting, edge treatment, composition and typography. The technical/ink/watercolor setting is a broad family, not a limit on natural-language preferences. Honor explicit requests such as editorial cover, restrained ink wash or layered paper illustration within the scientific constraints. Keep essential geometry, sign, direction and quantitative relationships legible in every style.',
    'Distinguish physical objects from visual metaphors. Use metaphor only when clearly explanatory and unable to be mistaken for apparatus, a measured field or a simulated result. Do not add scientific objects, field lines, spectra or plots just to make a sparse scene attractive. Unknown geometry stays abstract. Texture and light may decorate empty space, never encode invented measurements.',
    'For a revision, retain the approved composition and scientific content except where the user requests change or source evidence requires correction. Carry forward what must remain, the requested visual change and rejected features in visualAction. A more painterly style changes visual treatment, not the scientific claim. Do not restore features rejected in the approved scene.',
    'For a series, repeat the same colors for the same scientific roles, label terminology and visual scale conventions. Vary emphasis and framing to advance the explanation, not to suggest a change in an unchanged physical quantity. State these decisions concretely in each visualAction so separately generated scenes remain consistent.',
    'Before returning the plan, inspect hierarchy, label density, contrast and scientific ambiguity. Keep production directions inside visualAction; narration and visible labels contain only concise reader-facing content. Preserve indispensable scientific qualifiers before decorative detail when condensing the brief. This is planning self-review, not proof that an image has passed visual or scientific review.',
  ].join('\n'),
} as const;

export const SCIENTIFIC_VIDEO_DIRECTION_SKILL = {
  id: 'scientific-video-direction',
  version: '1',
  instructions: [
    'VIDEO DIRECTION: Choose an evidence-supported explanation arc: the question or observation, the mechanism or reasoning, and what follows within its limits. These are narrative roles, not mandatory experimental/result scenes. Open with the key idea rather than a generic title lecture. End with the supported takeaway and any condition essential to interpret it.',
    'Give each scene one purpose and one short spoken idea. Synchronize the explanatory emphasis of the available object actions with that idea. Keep object colors, names and direction conventions stable across scenes. Let a new object enter when introduced; use highlight to focus attention and draw/translate/pulse only for a source-supported relationship or process.',
    'Direct only capabilities present in the renderer: normalized object placement and the allowed enter/fade/translate/pulse/draw/highlight actions. Framing comes from layout and scale within the schematic. Do not promise photorealistic camera moves, generated footage, music, sound effects, precise lip sync or exact speech alignment. Pan/zoom of a still image alone is not a mechanism explanation.',
    'Write natural continuous narration in the requested locale, not headings read aloud or production instructions. Use short sentences with meaningful transitions, preserve attribution and decisive qualifiers, and avoid unexplained acronyms. The current voice is explanatory Qwen narration; pacing is achieved with concise phrasing and punctuation. Stay inside the caller narration/duration limits; timing estimates require audiovisual review.',
    'Before returning, check that each narrated assertion is supported by the scene Claims, actions do not imply unsupported causality, and the visual emphasis matches the narration. Where evidence supports only a static relation, prefer restrained attention changes. Do not pad sparse evidence with invented motion or repeat the same scene to fill duration.',
  ].join('\n'),
} as const;
