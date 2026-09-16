# OpenScience Multi-Style Art Direction Pack v1

本包用于从四套艺术方向中选择并实施 OpenScience 的最终视觉系统。它不是“把四套风格全部混合”，而是一个有决策门的设计探索包。

## 推荐结论

- **主推荐：A Optical Editorial** — 最适合品牌 Landing，兼具冲击、原创性和前端可实现性。
- **产品界面借鉴：A + C** — Workspace 使用 A 的排版纪律和 C 的静谧材料感。
- **Public RO 借鉴：D** — 档案、版本和 provenance 是 OpenScience 最独特的公共表达。
- **营销活动/Collection 借鉴：B** — 暖纸色 brutalism 适合专题、期刊和活动页，不建议作为整个工作台。

不要把 A/B/C/D 同时放在一个页面。最终系统应采用：A 作为品牌骨架，C/D 作为不同 surface 的受控变体。

## 阅读顺序

1. `STYLE_DIRECTIONS.md`
2. `STYLE_SCORECARD.md`
3. `codex/CODEX_MASTER_PROMPT.md`
4. `codex/IMPLEMENTATION_PLAN.md`
5. `figma/FIGMA_BUILD_SPEC.md`
6. `references/ASSET_ACQUISITION.md`
7. `references/REFERENCE_MATRIX.md`
8. `IMAGEGEN_PROMPTS.md`

## 目录

```text
openscience-style-pack-v1/
├── README_FIRST.md
├── STYLE_DIRECTIONS.md
├── STYLE_SCORECARD.md
├── IMAGEGEN_PROMPTS.md
├── gallery.html
├── codex/
│   ├── CODEX_MASTER_PROMPT.md
│   ├── IMPLEMENTATION_PLAN.md
│   ├── PHASE_PROMPTS.md
│   └── ACCEPTANCE_CHECKLIST.md
├── figma/
│   └── FIGMA_BUILD_SPEC.md
├── references/
│   ├── ASSET_ACQUISITION.md
│   ├── REFERENCE_MATRIX.md
│   └── media-manifest.template.json
└── assets/
    ├── svg/
    ├── shaders/
    └── css/
```

## 重要说明

AI 生成的高保真 raster 参考图在本次对话中作为独立生成资产展示。包内提供完整 prompt、可编辑 SVG、CSS、Shader 和实现说明，以便 Codex 在代码中忠实重建；不得将 AI 图中的伪文字、伪坐标或伪科学数据直接投入生产。
