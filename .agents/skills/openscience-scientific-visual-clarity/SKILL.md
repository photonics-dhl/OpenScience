---
name: openscience-scientific-visual-clarity
description: Help Hermes choose evidence-faithful scenes and make approved illustrations readable, using reviewed sources and the current image workflow.
metadata:
  version: "1"
  adapted-from: K-Dense-AI/scientific-agent-skills@49c6e97775eaa18ba791bebe23162a70ae601c18/skills/scientific-visualization
---

# Scientific visual clarity for OpenScience

Adapted from K-Dense's MIT-licensed [Scientific Visualization](https://github.com/K-Dense-AI/scientific-agent-skills/tree/49c6e97775eaa18ba791bebe23162a70ae601c18/skills/scientific-visualization). Its data-encoding and accessibility guidance is applied inside Hermes's existing science and art stages. The existing final reviewer keeps its original prompt and source budget. This skill adds no figure generator, provider, model stage, data renderer or claim source. The upstream package's Python tools and publisher-export rules are not installed or used here. License: [LICENSE.md](LICENSE.md).

## Scientific encoding

Before choosing a visual mark, identify whether it means a measured quantity, a modeled relationship, a conceptual relationship or a purely directional cue. Preserve that distinction in the picture and reader caption. For a quantitative figure, use the actual reviewed data and its units, baseline, normalization, uncertainty and missing-value meaning; never invent a curve, smooth away a gap, enlarge a scale effect or turn a conceptual sketch into apparent measurement. If underlying data is unavailable, use the authorized original figure with an explanatory caption or design a clearly conceptual image without quantitative claims.

Map each object, arrow, color, region, axis and label to its supported meaning. An attractive visual device that changes direction, relative magnitude, boundary or physical mechanism is a scientific error. Where two conditions are compared, keep their assumptions and scales visibly distinct. The upstream reviewed source and explicit user goal take precedence over any generic design suggestion.

## Reader goal

Write the one-sentence takeaway a reader should gain without opening the paper. Choose source-supported scenes and essential labels so the main relation, symbols and conditions can be understood from the image plus short narration. Do not pack a full paper into one scene: when the current request allows multiple scenes, split supported explanations if a single view would hide necessary qualifiers. An explicit figurePlan fixes its own eligible scene count; narrow an unsupported or overcrowded relationship instead of changing that count.

## Art legibility

Arrange the already selected marks and exact labels into one clear reading path. Use color with another cue such as shape, line style or direct labeling; keep semantic colors consistent and check foreground/background contrast at the intended reading size. Place each essential condition near the mark it qualifies. Do not add scenes, scientific marks, labels, quantitative geometry or claims in the art stage. A styled brief is not proof that the eventual image pixels will be correct or understandable.
