# OpenScience Art Direction v3 — Optical Editorial Instrument

> 本文件在视觉层面覆盖 `OpenScience_Design_Masterplan_v2.md`。
> v2 继续负责产品结构、组件语义、响应式、权限与工程实施；v3 是唯一艺术指导基线。

## 1. 为什么推翻 v2 视觉

v2 的蓝紫粒子、黑洞圆环、六点轨道和描边卡片属于通用 AI 科幻语言。它能说明“关系”，但不能形成 OpenScience 独有的品牌记忆，也会把严肃科研产品做成概念游戏界面。

新方向不再“描绘太空”，而是把科研中的光学现象、排版、校准、证据和版本本身转化为媒介。

## 2. 一句话方向

**OpenScience 是一台会影响文字、证据与版本的光学研究仪器。**

- Landing：Typography is the medium。
- Workspace：Evidence is the interface。
- Public RO：Reading is the proof。
- Hermes：Presence, not decoration。

## 3. 视觉语汇

### 必须使用

- 大尺度黑白排版。
- 局部衍射、折射、半色调和扫描纹理。
- 非对称编辑网格。
- 细规则线和校准标记。
- 单一 vermilion/orange 状态色。
- Serif research prose + Grotesk UI + Mono metadata。
- 触觉感：轻微胶片颗粒、纸张或扫描介质，而非光滑玻璃。

### 必须取消

- 蓝紫渐变和霓虹光晕。
- 通用黑洞/星球素材。
- 对称六节点圆环。
- 玻璃卡、胶囊堆叠、大面积圆角。
- 把星空、银河、宇航员当成“科研感”。
- 每个组件都拥有独立背景和边框。
- 为了显得未来而加入 HUD 装饰。

## 4. 色彩

| Token | 值 | 用途 |
|---|---:|---|
| `black.0` | `#050606` | Landing / Workspace 主背景 |
| `black.1` | `#0A0B0B` | 编辑面和 rail |
| `black.2` | `#111312` | Hover / 局部抬升 |
| `white.0` | `#F0EEE9` | 大标题与研究正文 |
| `white.1` | `#C9C7C1` | 次文本 |
| `gray.rule` | `rgba(232,230,222,.16)` | 规则线 |
| `gray.dim` | `#777A76` | Metadata |
| `signal.vermilion` | `#FF4E22` | 当前、Live、Diff、待确认 |
| `signal.green` | `#85B77D` | 已确认的 diff 内容；只在需要时出现 |
| `paper` | `#F1EEE7` | Public RO |
| `paper.ink` | `#191A18` | Public RO 正文 |

删除装饰性 `signal.blue/cyan/violet`。证据链接默认使用银灰；只有交互 focus 可使用低饱和冷灰蓝。

## 5. 字体与排版

### 字体角色

- Display Grotesk：Geist / Neue Montreal 类比例，用于巨大 “Science”。
- Editorial Serif：Instrument Serif / Source Serif 4，用于 “evolves” 和研究正文。
- Chinese Serif：Noto Serif SC。
- UI Sans：Geist / Inter + Noto Sans SC。
- Mono：IBM Plex Mono。

### Landing

- 关键词排版占视口 60%–75%。
- Grotesk 与 Serif 必须在同一主标题中形成冲突和转换。
- 主标题不是放在主视觉旁边；主标题本身就是主视觉。
- 标题允许越界和被局部光学场扭曲，但 DOM 文本保持可访问。
- CTA 位于排版形成的负空间，不做居中按钮组。

### Workspace

- 研究正文 18–21px serif，行高 1.55–1.7。
- UI 11–14px grotesk；metadata 9–11px mono。
- 通过细线、缩进和对齐分区，不通过卡片。
- 主编辑列必须占视口 52%–60%。

## 6. Landing 构图

### Desktop

1. 顶部 48–56px 极简导航。
2. `Science` 使用粗 Grotesk，占左上至中部。
3. `evolves.` 使用超大 Serif，从中部延伸到右下。
4. 光学场位于两个词的交界，局部折射字符和半色调点阵。
5. 左侧或底部只放一组真实仪器式 metadata；内容应与演示 RO 状态相关，不写随机科幻数值。
6. 一个 4–6px vermilion 信号点作为焦点。
7. Create / Explore 入口可在首屏下缘或鼠标静止后显现。

### Pointer interaction

- 指针局部影响文字的 displacement map 和 halftone field。
- 作用半径 140–220px。
- 字形最大视觉位移 8–14px；不得破坏阅读超过 600ms。
- 移动速度影响折射强度；静止后场逐渐恢复。
- 点击/按住短暂显示六个 SDF 证据层，但不形成常驻对称轨道。

### Mobile

- `Science` 与 `evolves.` 上下交错，占 65svh。
- 光学场使用简化的 CSS mask/Canvas，粒子数量低于桌面 30%。
- CTA 固定在首屏下方安全区；不要求 hover。

## 7. Workspace 构图

### Top object line

单行显示：`RO-ID | Title | Version | Visibility | Saved | Save Version`。禁止把它们拆成卡片或彩色 pills；使用规则线和文字重量区分。

### Three planes

- Left 19%：Document / Graph 切换、章节和 SDF 六节点。
- Center 56%：研究正文、inline AI diff、公式、Figure、Table。
- Right 25%：Evidence / Provenance / Links / Review anchors。

### SDF nodes

使用几何符号和线性序号 N1–N6；不同形状表达字段类型或状态。只有当前节点使用 vermilion 小点，不再使用发光彩色节点。

### AI proposal

- 使用单条 vermilion 竖线建立层级。
- Before / After 并排。
- 删除使用克制红色 strike；新增使用低饱和绿色。
- 必须显示 Source、影响范围和 Review diff 动作。

### Hermes

- 放在 Evidence rail 底部，显示小型 Live2D/点阵轮廓。
- 只显示 1–3 个当前步骤。
- Thinking/Scanning 可以有微弱扫描线；审批时静止。

## 8. Public RO

Public RO 继续使用纸面，但应继承相同排版冲突：

- 大标题 Serif；RO ID/版本使用 Mono。
- vermilion 只标记当前版本、修订或编辑批注。
- 不移植 Workspace 黑色框架。
- Figure 和 provenance 使用学术 caption，而不是媒体卡。
- 页面必须适合打印和生成 PDF。

## 9. Figma 修改指令

1. 新建 `01 Foundations / V3 Optical Editorial`。
2. 废弃 v2 蓝紫色 variables；建立 monochrome + vermilion modes。
3. 新建混排 typography specimen：Grotesk/Serif/Mono/Chinese。
4. 所有 12px 以上圆角组件进入 deprecated；基础容器 0–8px。
5. 取消大部分 card backgrounds，只保留 rule-based regions。
6. Landing Figma 只表达静态构图和 optical-field 边界；真实扭曲在浏览器实现。
7. Workspace 按 19/56/25 比例重新排布。
8. 新建 `AI Proposal / Before-After`、`Evidence Source`、`SDF Geometric Node`。
9. Prototype 添加鼠标作用范围、静止回弹、reduced-motion 注释。
10. 旧 `OpenScience_Visual_Blueprint.html` 仅作 IA 参考，不导入为视觉组件。

## 10. Codex 实施覆盖指令

```text
视觉规范以 OpenScience_Art_Direction_v3.md 为最高优先级。
Masterplan v2 的业务结构、组件语义和实施阶段继续有效，但废止其蓝紫宇宙、
发光圆环、卡片化和对称六节点视觉。

先用真实 HTML/CSS 排版复现 v3 Landing 静态画面，再实现局部 optical field。
禁止先做 WebGL 再往上贴文字。主标题必须是可选择、可访问的 DOM 文本；
WebGL/Canvas 只生成 displacement、halftone 和局部折射媒介。

Workspace 通过 grid、rule、typography 和 density 建立美感，不通过装饰性背景。
提交时提供 1440×900 与 390×844 截图，并逐项说明与 v3 的差异。
```

## 11. 验收问题

1. 去掉所有动效后，纯排版是否仍然成立？
2. 去掉 Logo 后，是否仍能区别于通用 AI 网站？
3. 是否只有一个 vermilion 视觉焦点？
4. Workspace 是否主要依赖线、排版和对齐，而不是卡片？
5. 光学场是否影响“文字/证据”，而不是在背后播放壁纸？
6. Hermes 是否在工作时提供存在感，在阅读与审批时主动安静？

任一答案为“否”，不得进入动效精修阶段。
