# Living Research Observatory 静态背景设计与 MiniMax Prompt

## 状态

- **当前修订：** v2 设计已批准；v2.1 API 长度修订待复核
- **目标表面：** Landing / Workspace 暗色主视觉
- **生成模型：** MiniMax `image-01`，中国区
- **生成状态：** 尚未调用 API
- **产品依据：** `docs/specs/2026-08-08-openscience-product-web-design.md` §11.1–11.3

## 修订记录

- v1 要求模型同时生成材料场和六节点 RO，输出退化为植物状抽象图，未通过用户审美门。`docs/design-assets/generated/openscience-observatory-v1.png` 只保留为有 provenance 的失败样本，不得导入 Figma 或派生视频。
- v2 将生成层限制为背景空间、材料微纹理、定向光与反射。六节点 RO、证据轨迹、RO ID、版本、artifact、SDF 和 Hermes 状态全部由 Figma、SVG 或 HTML 原生叠加。

## 画面职责

生成结果必须是一张没有产品语义的 16:9 暗色背景。它单独出现时只像精密科研仪器内部的环境摄影，与原生图层合成后才构成 OpenScience 主视觉。

| 区域 | 范围 | 要求 |
|---|---:|---|
| 文案留白 | 左侧 0–40% | 接近 `#03060b`，不得出现强光、高频纹理或第二焦点 |
| 证据走廊 | 中部 38–62% | 低对比材料纹理和由左向右的冷色反射，不得形成可见路径、节点或数据 |
| RO 背景 | 右侧 54–105% | 安静、深色、略有空间纵深，为现有蓝色玻璃 RO 提供轮廓分离，不得生成环形或六分结构 |
| 页面衔接 | 底部 72–100% | 平滑回到 `#03060b`，不得留下图片矩形边缘 |

## 原生叠加层

以下内容不得进入生成图：

- `apps/web/public/hero/ro-loop-poster.webp` 与对应循环视频；
- 六类 SDF 面板及开放中心；
- `#4c8dff` 蓝色证据轨迹；
- 单个 `#ffb454` 版本变化节点；
- RO unique ID、`v0.1 → v0.2 → v0.3` 版本锚点；
- 论文、数据、代码、实验素材和讨论的真实 artifact 摘要；
- SDF 状态、Hermes 介入提示、按钮、文案和其他 UI。

## 材料与光线

视觉语言为 `Precision Evidence Chamber`。背景使用 `#03060b` 深墨基底和接近 `#08101c` 的空间层级，材料限于黑色阳极氧化金属、烟熏光学玻璃、微蚀刻表面和少量半透明薄膜。画面约 70% 保持安静暗场。

单一冷色反射从左中部向右延伸，不画成光束或连接线。生成层的蓝色保持低饱和、低亮度，不能接近原生证据轨迹的视觉强度。生成图中不使用橙色。

## MiniMax Prompt

```text
Generate only a full-bleed 16:9 ambient background plate for a premium scientific research product. Do not create a foreground subject, symbol, interface, diagram, or data visualization.

The environment is the interior atmosphere of a precision evidence chamber: near-black deep ink space, black anodized metal, smoked optical glass, fine micro-etched surfaces, and a few restrained translucent optical-film layers. Keep approximately seventy percent of the frame quiet and dark.

Composition is asymmetric. Keep the left forty percent almost empty and close to #03060b for readable product copy. In the middle, create a narrow low-contrast material corridor with subtle optical-film refraction, faint micro-grain and elongated cool reflections moving visually from mid-left toward the right, without drawing a visible beam, line, route, network or node. Keep the right side deep and spatially layered, suitable for compositing a large existing blue-glass object later, but do not depict that object or any surrounding halo geometry. Fade the bottom smoothly back to #03060b with no visible image boundary.

Use low-chroma steel-blue reflections over a #03060b and #08101c palette. Lighting is controlled and directional, like high-end precision scientific instrument photography. Surfaces are crisp, restrained and physically plausible. No orange is present anywhere in the generated image.
```

## Negative Prompt

```text
No research-object symbol, ring, circle, hexagon, polygon loop, six-part structure, radial arrangement, node, network, connection line, orbit, flower, petal, neuron, brain, DNA, galaxy, planet, star field, particle cloud, lens flare, hologram, gaming HUD, dashboard, interface frame, card, icon, logo, watermark, typography, formula, document page, code, chart, graph, microscopy result, fabricated scientific data, orange light, purple gradient, cyberpunk neon, watercolor, etching, archival paper, steampunk, centered subject, second focal point, camera-motion effect or visible rectangular vignette.
```

## 静态验收门

原图在进入 Figma 前逐项检查：

1. 左侧 0–40% 没有影响标题可读性的亮区或高频细节。
2. 没有环、六边形、六分结构、节点、连线或其他可能被误读为 RO 的几何。
3. 只有一个由左向右的光线方向，没有第二焦点。
4. 没有橙色、文字、公式、文档、图表、UI 或假科研数据。
5. 上下边缘和底部能够与 `#03060b` 无缝融合。
6. 与现有 RO 合成后，RO 是唯一主焦点，生成层不与文案或证据轨迹争夺注意力。
7. 在 390×844 裁切中只保留安静空间和轻微方向性纹理，不承担产品语义。
8. 任一项失败即拒绝，不导入 Figma，不生成视频。

## 合成后的产品叙事

原生层按以下顺序表达证据汇入：真实 artifact 摘要从左侧进入，蓝色路径将它们连接到同一个 RO，六个 SDF 面依次产生轻微响应，汇入完成后出现一个橙色版本变化节点。RO unique ID 和版本锚点始终可见。

3 秒理解测试只有一个判断：用户能否读出“不同研究材料正在进入同一个具有唯一身份、可以持续演化的 Research Object”。生成背景不承担这项语义。

## 视频边界

静态合成通过后再决定是否调用 H3。视频背景保持固定镜头，时长 5–6 秒，只允许一束低亮度冷色反射从左中部缓慢经过材料走廊，在 RO 后方衰减。RO、节点响应、蓝色路径、版本锚点和橙色变化继续由原生动画完成。

视频禁止旋转、镜头推进、粒子喷发、闪烁和全屏呼吸。`prefers-reduced-motion` 使用通过验收的静态背景。

## 输出与 provenance

- 下一次生成使用新文件名 `docs/design-assets/generated/openscience-evidence-chamber-v2.png`，不得覆盖 v1。
- Sidecar 记录 prompt、negative prompt、模型、区域、key slot、生成时间、用途和后处理，不保存远程下载 URL 或查询参数。
- 原图先做用户审美确认，再制作 WebP/AVIF、导入 Figma 或启动视频生成。
