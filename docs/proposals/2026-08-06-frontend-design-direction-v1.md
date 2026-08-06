# OpenScience 前端整体设计方向 v1（三方讨论稿）

> 状态：**v2 已定稿（2026-08-06，用户 × GPT × Kimi 三方）**。定稿决策见文末「## v2 终稿决策层」，**该节效力高于上文 v1.x 各节**；上文保留作历史脉络。下一步：据终稿转正式 design spec（`docs/specs/`）并拆解实施计划。
> 日期：2026-08-06 · 作者：Kimi · 讨论轮次：v1 → v1.1 → v2（定稿）

## 0. 本文档的定位

这不是实施 spec，而是**设计方向稿**：确立审美坐标、信息架构、技术底座和开放问题。所有标 `[待定]` 的条目是留给三方讨论的接口；任何一节都可以在不推翻整体结构的前提下单独修改（见 §10 调整接口）。

## 1. 输入材料与调研结论

| 输入 | 关键结论 |
|---|---|
| 竞品分析报告（34 竞品 / 11 类） | 全部是**战略与信息架构层**启发，无视觉观察。最强信号：Object 中心化（Hugging Face）、Git 式演化（Fork/Branch/Merge/Evolution Tree）、发表后持续演化（F1000/PubPeer）、交互式知识对象（Distill/Observable）、Agent 交互 + 表格化分析（Elicit） |
| moonshot.cn | 首屏一句使命宣言 + 双 CTA；「最新研究」feed 前置；克制的深色场 + 单一强符号（月球）反复出现；Doodle 式人文栏目软化技术品牌。可借鉴的是**克制与符号化**，不是花哨动效 |
| 微信文章（逛逛GitHub） | scroll-world：滚动驱动镜头语言——**只宜小剂量**用于落地页；img2threejs：分阶段 + 视觉回归校验的 agent 产出方法论，且纯代码 Three.js 可支撑未来 RO 内嵌 3D 装置展示 |
| nyblnet/bento | 与 SDF 理念同构：文档 = 明文 JSON + 自包含工具，天然 AI 可读写（`docs/agents.md`）；morph 转场（同 id 元素跨状态补间）适合版本 diff 可视化；字体组合 Fraunces + Instrument Sans（OFL 可商用）现成可用 |
| Ultrafast Science 期刊 | 跑在 AAAS SPJ 共享模板上：一句定位 → 投稿 CTA → 最新文章列表的克制层级；一套模板 + 每刊一个 accent 色的多租户主题架构；视觉意象域 = 飞秒脉冲波形、激光光斑（Airy/涡旋环）、泵浦-探测光路、等离子体丝 |
| GitHub UI 设计 skill/插件生态 | 见 §8，结论是：真正该做的是设计系统底座 + 截图迭代闭环，而不是堆 skill |
| 仓库现状摸底 | 近从零起步：5 路由、单文件 1397 行全局 CSS、无组件库、无静态资产、无 Dashboard/登录/搜索/Hermes 面板；**i18n provider 疑似未接线（运行时坑）**；公开页文案硬编码中文，违反自家 frontend-design skill 第 11 条 |

## 2. 设计定位

**一句话：做"学术工程感"（Scholarly Engineering）——工程工具的精确效率 × 学术出版的庄重可信 × AI 原生的陪伴温度。**

三个对标各取一段光谱，交集即我们的位置：

- 取 **arXiv / SPJ 期刊**的信息密度与列表克制（内容即界面，不做营销化首页）；
- 取 **GitHub / Hugging Face**的工具效率与 Object 中心范式（RO 是一等公民，像 repo / model card）；
- 取 **moonshot / Distill**的品牌符号与交互叙事（一个标志性视觉符号 + 小剂量动效 + 交互式知识对象）。

**明确不要的**：Aceternity 式全屏炫技动效、SaaS 营销落地页套路（渐变紫 + 3D 插画 + 假数据截图）、PDF 中心的文档墓场气质。

## 3. 品牌视觉系统

### 3.1 标志性符号（对应 moonshot 的"月球"）

候选主符号：**飞秒脉冲波形 / 光束穿过棱镜分光**——一语双关（Ultrafast science 的超快激光 × "把研究解析为结构化光谱/SDF 六字段"）。辅助图形语言：Airy 光斑、涡旋环、衍射图样，用于空状态插画、加载态、404、Doodle 栏目。`[待定：符号最终形态需视觉稿确认]`

### 3.2 色彩（token 化，双主题结构预留）

现状 7 个基础 token 升级为完整设计 token 层（色板 / 间距 / 圆角 / 字号 / 阴影 / 动效时长），`prefers-color-scheme` 双主题结构首版就位（spec §18.2 已要求 token 预留）。

- **工作台（暗色主线）**：深空灰底（非纯黑）+ 单强调色。`[待定 A：激光青蓝 #3B82F6 系]` `[待定 B：光子暖橙]`——建议 A，与"冷光/激光"意象一致，且与现有 slate/blue 雏形连续。
- **公开页（浅色学术）**：纸白底 + 学术衬线正文 + 同一强调色压暗版，确保 WCAG AA（4.5:1）。
- **多租户主题**：借鉴 SPJ 一套模板 + 每刊 accent 色——workspace/社区维度预留 accent override 接口，首版不实现。

### 3.3 字体

- 西文：**Fraunces**（学术衬线，展示/公开页正文）+ **Instrument Sans**（工程无衬线，UI），均 OFL 可商用（bento 同款组合）；
- 中文：思源宋体（公开页正文）/ 思源黑体（UI），系统栈回退 PingFang / 雅黑；
- 等宽：JetBrains Mono（代码、哈希、版本号、数据表）；
- 统一走 `next/font` 自托管，无外链。

### 3.4 Ultrafast science 元素的使用边界

用**视觉意象**（脉冲、光斑、光路图风格插画）而非期刊品牌资产（logo/刊名/封面），除非与期刊方有正式合作授权。`[待定：与 Ultrafast Science 的合作关系是否已到可使用其品牌元素的程度？]`

## 4. 信息架构与页面地图

现状 5 个路由 → 目标结构（★ = 全新，● = 重构，○ = 保留增强）：

```text
/                        ★ 落地页：使命宣言 + 双 CTA + 最新 RO feed + 小剂量滚动叙事（可跳过）
/login /register         ★ 邀请码注册/登录（后端已有，前端缺失）
/dashboard               ★ Spec §18.1 六块：最近 RO / 待办 PR / 笔记 / Hermes 任务 / Credit 用量 / 通知
/search                  ★ 搜索（Spec §12.1，后端 search 包仍占位，可先接 RO 列表过滤）
/research-objects/[id]/edit    ● 三栏 SDF 编辑器（保留架构，换皮 + 修复 i18n + 右栏升级为 Hermes 面板）
/research-objects/[id]/collab  ● 协作单页（保留 tab 架构，GitHub 式视觉具体化）
/research/[publicId]           ○ 公开 RO 页（SSR 保留，学术出版风重构 + 十标签补齐）
/research/[publicId]/v/[n]     ○ 公开版本页（同上 + morph diff 增强）
/settings                ★ 设置/配额/邀请码
```

**Hermes 常驻面板**：不做独立路由，作为全局右侧 dock / 底部抽屉（移动端），默认只读当前页上下文（Spec §9.1），所有页面共享。

## 5. 三套视觉系统具体化（Spec §18.2 → 可执行定义）

| 维度 | 工作台（现代产品式） | 公开页（严肃学术出版风） | 协作区（GitHub 式） |
|---|---|---|---|
| 主题 | 暗色 | 浅色纸感 | 跟随系统，密度优先 |
| 密度 | 中 | 低（留白即庄重） | 高（表格/列表优先） |
| 字体 | Instrument Sans | Fraunces 正文 + Sans UI | Sans + Mono 大量 |
| 动效剂量 | L1 微交互 | L0 近零 | L1（状态反馈） |
| 参照 | Linear / moonshot | SPJ 期刊 / arXiv | GitHub |

## 6. 动效语言（剂量分级制）

全站动效预算分级，防止"AI slop 式过度动效"：

- **L0 无动效**：公开学术页正文区；
- **L1 微交互**（≤200ms，ease-out）：hover、focus、按钮态、骨架屏→内容淡入；
- **L2 结构性转场**：bento 式 morph——同 id 元素跨状态补间，**专用于版本 diff / SDF 建议确认 / 分支切换**（把"演化"做成看得见的动画，是我们产品的核心隐喻）；
- **L3 叙事动效**：仅落地页一段滚动序列（RO → SDF → diff → 发布的流转演示，一屏以内、可跳过、降级为静态图）。

技术选型：CSS transition 优先 → Framer Motion（L2 morph 的 layoutId 正对口）→ 不引入 Three.js 主场景（L3 用 CSS/视频，3D 留给未来 RO 内嵌装置展示，走 img2threejs 式纯代码路线）。

## 7. Hermes 形象：陪伴式 Live2D（已调研 Scholar's Tea 实证方案）

**Scholar's Tea 调研结论（2026-08-06，agent-5）**：其 puppy 用的是 Live2D Inc. 官方免费示例模型「わんころもち PRO」（wanko 小狗），资产仅 876K，**许可允许一般用户/小规模事业者商用**（Live2D 原创角色免费素材协议，需保留出处；若主体变为中大规模公司则仅剩非公开测试权）。

可直接借鉴的成熟配方：

- **形态与定位**：右下角浮动挂件（fixed z-50，~96px 容器放大 2.2 倍显示），可拖拽（Pointer Events + localStorage 位置持久化 + 视口 clamp），特定页面（admin/settings 类）隐藏，移动端 scale-75；聊天面板打开时头像收起。
- **mood 双层映射**（核心设计，迁移成本极低）：21 种情绪 = motion group 映射（12 个官方动作）+ 每帧参数覆盖函数（直接驱动眼/耳/嘴/脸红/蒸汽参数 + sin(t) 呼吸微动）。代码在 `hermes-live2d.html` 的 `moodToMotion`/`expressions`。
- **状态优先级模型**：受控 mood（AI 任务态，如 `isLoading → thinking`）> 内部 mood（交互态）> 定时器复位 idle；外部驱动走 `AvatarCommand` 命令接口——与我们的 agent-approvals 任务态（thinking / done→eureka / error→confused）映射顺滑。
- **陪伴感细节**：45 秒无互动随机小动作、hover 歪头+气泡、拖拽反应（拖中超 800ms 松手→dizzy 冒星星）、气泡文本关键词反向触发 mini 动作、中英双语气泡文案库。
- **R0–R4 审批强度 ↔ 形象介入强度**：R0 无感通过（小气泡日志），R4 形象前置阻断 + 批量预览面板。

**技术路线（Scholar's Tea 踩坑后的实证结论）**：

- **用 iframe 隔离方案**，不用 npm 直渲：`pixi-live2d-display@0.5.0-beta` + pixi v7 有兼容性问题（`_clippingManager` 缺失需打 stub），他们的解法是静态页 `hermes-live2d.html`（离线 pixi6 + cubism4 + live2dcubismcore.min.js）+ 父页面 iframe 嵌入 + postMessage 双向通信（`hermes-mood`/`hermes-tap`/`hermes-ready` 等消息）。我们直接抄这条路。
- **已知代价**：每个 avatar 实例一个 iframe + PIXI 实例，内存不小（他们有过专门优化 commit）；实例数要克制（全站 1 个常驻 + 必要时面板内 1 个）。
- **改进点**：postMessage 要加 origin 校验（他们用 `'*'`）；wanko 模型无 HitAreas，点击靠 canvas 级判定；缩放系数需实测调校。
- Cubism Core 是专有运行时，不得修改再分发；资产只搬 `public/live2d/wanko/`（876K）+ core 库，**绝不连带其 `public/live_2D/` 候选素材目录**（121M 含同人模型，许可不明，有法律风险）。

`[待定：品牌气质匹配——Scholar's Tea 的 wanko 是陪伴宠物，OpenScience 的 Hermes 是学术审查/发布 AI，沿用同一小狗形象是否合适？两个项目形象"撞脸"是否有意为之（同一 AI 宇宙）还是要区分？]`

## 8. 技术底座与工具链决策

### 8.1 引入（建议）

| 项 | 理由 |
|---|---|
| **Tailwind CSS v4 + shadcn/ui + Radix** | 当前零组件库、1397 行单文件 CSS 不可持续；copy-in 模式符合依赖克制原则；Radix a11y 直接支撑 §18.3 WCAG AA |
| **Framer Motion** | L2 morph 转场的成熟实现 |
| **Playwright MCP 截图迭代闭环** | 性价比最高的流程工具：agent 渲染→截图→视觉比对→迭代（仓库已有 `.playwright-mcp/` 痕迹，补进 `.mcp.json`） |
| **vercel-labs/agent-skills**（web-design-guidelines + react-best-practices） | 纯 Markdown、零依赖，作为重构验收清单，风格与现有 skill 体系一致；吸收进现有 frontend-design skill 而非另装 |
| **anthropics frontend-design skill 的排版/配色条目** | 合并进本项目定制 skill，不装第二份 |

### 8.2 不引入（已评估否决）

Figma MCP 类（无 Figma 工作流）、21st.dev Magic（云依赖 + 风格不搭）、v0/Bolt 进生产工作流（代码必须在仓内受控生成；允许用 v0 画 2–3 个方向草图后由 agent 重写）、Aceternity/Magic UI 全库（最多零星抄 1–2 个组件，如 bento grid）。

### 8.3 必须先修的地基（P0，先于任何视觉工作）

1. **i18n provider 接线**：14 个文件用了 `useTranslations` 但全仓无 `NextIntlClientProvider`/`createNextIntlPlugin`——编辑器/协作页按现状运行时即抛错；
2. **公开页硬编码中文**迁移到 messages（违反自家 skill 第 11 条）；
3. **建 `apps/web/public/`**：logo、favicon、OG 图、Hermes 形象占位（layout metadata 现在还是 "web placeholder"）。

## 9. 从竞品与 bento 落到前端的五个具体动作

1. **RO 卡片 = model card**（Hugging Face）：列表/卡片统一展示 RO 标题、作者身份状态、版本号、演化计数、许可徽章——首页 feed、Dashboard、搜索共用同一组件；
2. **Evolution Tree 可视化**（GitHub 网络图 → 科研版）：Versions & Diff 标签页放分支/版本树，L2 morph 转场；
3. **SDF 的 agent 可读指南**（bento 的 `docs/agents.md`）：为 SDF schema 出一份单页 agent 指南，外部 AI 可直接读写 RO——生态位动作，成本低；
4. **发表后演化的 UI 证据**（F1000/PubPeer）：公开页头部展示"最近活动"（新版本/评审/讨论计数），让"活的研究"一眼可见；
5. **表格化分析组件**（Elicit）：Reviews / 引用 / 版本对比场景统一用高密度数据表 + 行内展开，协作区与工作台共用。

## 10. 预留调整接口

- **全部视觉决策 token 化**：换主色/字体/符号只动 token 层，不动组件；
- **组件 copy-in**：shadcn 模式意味着任何组件可原地魔改，无上游升级绑架；
- **文档版本化**：本文档 v1 →（GPT 讨论）→ v2 → 定稿转 `docs/specs/` 正式 spec → 拆 plan；每轮讨论意见以"讨论纪要"节追加在本文档尾部，不另开文件（防重复规范）；
- **动效分级制**即调整阀：任何页面被动效评审打回，降一级即可，不需要重新设计；
- **Hermes 形象与技术选型解耦**：状态机与交互契约先行定义，Live2D/Rive/Lottie 可替换。

## 11. 开放问题清单（供三方讨论）

1. 主色方向 A（激光青蓝）vs B（光子暖橙）？工作台暗色主线是否认可？
2. Ultrafast Science 期刊合作深度：能否用其品牌元素，还是只用视觉意象？
3. ~~Scholar's Tea puppy Live2D：资产与授权？~~ **已调研（见 §7）**：wanko 官方免费模型可商用、iframe 方案可直接搬。剩余待定：两项目形象"撞脸"是有意（同一 AI 宇宙）还是要差异化？
4. 落地页叙事密度：要不要 L3 滚动序列？平台目前是邀请制，落地页优先级是否后置？
5. 字体自托管的中文 Web 字体体积问题（思源宋全字库数 MB）：子集化策略 or 系统栈回退优先？
6. Dashboard 六块内容的首版取舍：哪些接真实数据，哪些先占位？
7. 搜索页：等后端 search 包，还是先接现有 RO 列表过滤出个可用版？
8. Hermes 首版形象介入深度：先做"面板 + 状态气泡"（无 Live2D），Live2D 二期？还是一步到位？
9. 移动端：三套视觉在移动端是否全部对齐桌面功能（spec 要求一致），编辑器之外的页面移动端优先级？
10. 暗色/浅色双主题首版做到什么程度：仅 token 结构预留，还是双主题实装？

## 12. 分期路线图（草案，`[待定]`）

- **P2A 地基**：§8.3 三项 P0 修复 + Tailwind/shadcn 底座 + token 层 + 字体；
- **P2B 骨架**：全局导航壳 + Dashboard + 登录/注册 + 落地页；
- **P2C 换皮**：编辑器/协作区/公开页按 §5 三套视觉重构 + 沙箱组件接线（knip 豁免的三个文件）；
- **P2D Hermes**：常驻面板 + 状态机 + R0–R4 审批交互；
- **P2E 增强**：Evolution Tree morph、Live2D 形象、L3 落地页叙事、双主题实装。

---

## v2 终稿决策层（2026-08-06 三方定稿）

> 本节是三方讨论（用户 × GPT handoff v2 × Kimi grill-me 逐分支确认）后的**最终决策**，效力高于上文 v1.x 各节；上文与之冲突处以本节为准。GPT 交接全文见 `docs/user_ideas/handoff-v2-extract/OpenScience-Kimi-Handoff-v2/HANDOFF.md`，首页 art-direction 参考图 `docs/user_ideas/主页原型图.png`（禁止直接作上线资产）。

### D1 视觉定位

**Monumental Scholarly Intelligence（纪念碑感学术智能）**：Moonshot 式克制、尺度与单一强符号，叠加开放科学的结构化/可验证/可演化。首页"震撼、简约、AI 原生"；进入产品回归高效率与长阅读舒适。取代 v1 的"学术工程感"单一表述（两者不冲突，v2 更精确）。

### D2 核心符号：Evolving Research Object

- 取消"飞秒脉冲/棱镜"全站主符号（过偏光学、缺平台辨识度）。主符号 = 六面组成、中心开放的持续演化研究对象；细薄历史轮廓表 provenance；蓝色智能轨迹（Hermes 驱动）穿过对象并产生一次分支后 merge；唯一暖橙节点只表 diff。
- **六面语义定稿：映射真实 SDF 六节点类型**——`problem / insight / method / results / limitations / reproducibility`（`infra/schema.prisma:317` `SdfNodeType` 实证），数量与结构天然吻合，不采用 GPT 猜测的内容六类（论述/数据/代码…），不为画面改数据模型。
- **资产路线定稿：纯 SVG 手工构建 + 分层辉光**（同色路径 3–4 层：锐核+内辉+外 bloom，feGaussianBlur/feMerge 或叠加 drop-shadow；`mix-blend-mode: screen` 叠光；feTurbulence 细噪点）。环境氛围允许 copy-in 1–2 个现成组件（Magic UI / Aceternity Spotlight 量级），核心符号本身不依赖组件库。原型图仅作 art-direction。
- 动效：8–12s 极轻呼吸；轨迹 4–6s 扫一次后留低亮；橙点只短暂增强一次；历史轮廓视差 ≤4px；`prefers-reduced-motion` 全静态。动画只调 opacity/transform，不动 blur 半径（滤镜每帧重光栅）。
- 首版做**两版变体**（更雕塑化 / 更界面化，其余变量一致），Playwright 截 1440×900、1920×1080、390×844 三尺寸由用户拍板后冻结 token。

### D3 首页信息架构（定稿）

- Header：左 wordmark；右 `探索 / 创建 / 关于 / 登录`；首屏透明、滚后模糊深栏；无 SaaS 多级导航。
- Hero：主标题「让研究，持续演化。」+ 说明「将论文、数据、代码与讨论，组织为开放、可验证、可演化的研究对象。」；CTA `探索研究`（→ 首页 #latest）/ `创建研究对象`（→ 登录/邀请说明，邀请制不显示虚假可用）。
- 区块顺序（只三个）：①最新研究（真实 feed）→ ②四阶段演化面板（同一 RO 贯穿 创建→Hermes 解析→Diff→合并发布；桌面可点 stepper + layout morph，空闲自动推进一次后停；移动端滑动卡片；**禁止 scroll-jacking**）→ ③Hermes 与你共同研究（上下文理解/证据检查/审批，非"万能 AI"罗列）+ 开放但可信（身份/版本/许可/评审/provenance，可合并为同一信任区块）。不做 Bento 功能大全。
- **「最新研究」定稿：feed 嵌首页第二屏，新增轻量公共端点** `GET /explore`（返回统一 RO Card 字段：标题/作者与认证状态/当前版本/更新时间/演化与讨论计数/许可），走 api-contract 流程；独立列表页/搜索后置。

### D4 三套页面视觉系统与 token（按 GPT v2 定稿）

| 场景 | 视觉策略 |
|---|---|
| 落地页 Hero | 近黑暗场（`--hero-bg:#03060B`）、纪念碑尺度、极简内容 |
| Dashboard/编辑器 | 深色导航外壳 + 浅色内容画布（`--canvas-bg:#F6F7F9`） |
| 公开 RO | 纸白（`--paper-bg:#FCFBF7`）、学术出版排版、近零动效 |
| 协作区 | 跟随外壳、高密度表格列表 |

主色 `--accent-primary:#4C8DFF`（激光青蓝方向，v1 开放问题 1 落定）；暖橙 `#FFB454` 只表 diff/新增/合并点；禁大面积紫渐变。token 冻结前过 WCAG AA 对比度验证；双主题首版仅 token 结构预留不实装。三者共享 spacing/radius/状态色/交互逻辑，不共享背景与密度。

### D5 Ultrafast Science 元素（定稿）

**符号通用 + 内容层露出**：主视觉符号保持平台通用，不绑光学意象；期刊露出走内容层（footer/about/专刊 collection 页）；允许一处克制彩蛋（如脉冲波形加载动画）。v1 §3.4 的使用边界问题以此结案——视觉层不使用期刊品牌元素，合作深度问题不再阻塞设计。

### D6 Hermes（定稿：Live2D 一步到位 + 风险缓释）

- 形象沿用 Scholar's Tea wanko，**同一 AI 宇宙为有意为之**（v1 开放问题 3 结案）。
- **首版即 Live2D**，不做静态过渡版；风险缓释五条：①root layout 常驻单 iframe 实例，复用 Scholar's Tea iframe+离线 pixi6 架构与 postMessage mood 协议；②懒加载——hero 关键路径零 pixi，load 后 + 1.5s 再从右下角出现，LCP 前后实测对比超预算则 feature-flag 降级；③首曝场景=Dashboard/登录后页面，首页 hero 接入排在性能验证通过后；④`prefers-reduced-motion` 与加载失败统一回退静态立绘 SVG；⑤全站单 PIXI 实例（验收硬指标）。
- 三模式契约按 GPT：陪伴（活泼、随机小动作）/ 研究（区分事实/来源/推断/建议、明示不确定性、高影响修改给可预览 diff）/ 审批（R0–R4 决定介入强度，停止玩笑，展示对象/范围/影响/可恢复性）。活泼约束不等于学术轻佻。

### D7 字体（定稿）

首屏主标题思源宋体**子集化自托管 woff2**（仅落地页实际字符集，preload + `font-display: swap`）；UI/正文走系统字体栈（PingFang/雅黑/Noto 回退链）；Fraunces 与思源黑体自托管均暂缓（不为字体方案破坏中英一致性）。

### D8 分期路线图（定稿，取代 v1 §12 与 GPT §11 原序）

- **P0 地基收尾**：Tailwind/shadcn/token/字体底座（i18n provider、messages 迁移、public 资产已完成）。
- **P1 首页视觉原型**：Header+Hero+#latest 衔接，真实 DOM + SVG 符号两版变体，三尺寸截图用户确认。
- **P2 首页全内容**：`GET /explore` 端点 + 真实 feed、四阶段演化面板、Hermes 与信任区块。
- **P3 产品壳与核心页面**：Dashboard/登录注册、编辑器/协作区/公开 RO 三套视觉重构、Hermes 全局状态机 + R0–R4 + **Live2D 集成（首曝 Dashboard）**。
- **P4 增强**：Evolution Tree morph、首页 hero Live2D 曝光（性能验证后）、完整双主题、更高级 Hero 动效（如需 Three.js 先出包体/内存/LCP 数据与决策记录）。

### D9 沿用不改的 GPT 验收标准

视觉：3 秒读出"一个持续演化的研究对象"；320px 仍认出开放结构与蓝/橙分支合并；首屏单一主焦点；禁月球/星空/发光大脑/文档堆/紫渐变模板元素。内容：CTA 全真、feed 真实或明确 skeleton、文案全走 i18n、RO Card 跨页复用。工程：WCAG AA、键盘可达、reduced-motion 完整、动效失败页面仍可用、LCP ≤2.5s、单 PIXI 实例。

### v1 开放问题结案对照

| # | 问题 | 结案 |
|---|---|---|
| 1 | 主色/暗色主线 | D4：蓝主色+暖橙 diff；工作台深壳浅布 |
| 2 | 期刊元素边界 | D5：符号通用+内容层露出 |
| 3 | Hermes 撞脸 | D6：有意同一 AI 宇宙 |
| 4 | 落地页优先级 | D3+D8：邀请制仍做落地页，P1 先行，无 scroll-jacking |
| 5 | 中文字体体积 | D7：宋体子集化+系统正文 |
| 6 | Dashboard 首版取舍 | 移交 P3 实施计划细化 |
| 7 | 搜索先后端 | D3：feed 先行，搜索后置 |
| 8 | Hermes 介入深度 | D6：Live2D 一步到位+缓释 |
| 9 | 移动端对齐度 | GPT §10：功能一致，编辑器改分步/抽屉 |
| 10 | 双主题程度 | D4：token 预留，不实装 |

---

## 讨论纪要

（每轮三方意见追加在此，最新置顶）

- **v2（2026-08-06，三方定稿）**：输入 = GPT handoff v2（`docs/user_ideas/OpenScience-Kimi-Handoff-v2.zip`，含 HANDOFF.md 与 hero 参考图）+ 主页原型图。Kimi 校验代码库后发现两点并已纳入定稿：①SDF 真实六节点类型与 GPT 猜测的内容六类不符 → D2 语义映射修正；②API 无公开 RO 列表端点 → D3 新增 `GET /explore`。Kimi 完成"AI poster 质感的纯前端复现"调研（SVG 分层辉光/copy-in 生态）→ D2 资产路线。用户经 grill-me 逐分支确认 D1–D9，其中对 GPT handoff 的两处主动修正：Live2D 从 P4 提前到 P3（一步到位+风险缓释）、六面语义改映射真实 SDF 节点。详见上方「v2 终稿决策层」。
- **v1（2026-08-06, Kimi）**：初版。基于竞品分析报告、moonshot.cn、scroll-world/img2threejs、nyblnet/bento、SPJ 期刊模板、GitHub 设计 skill 生态调研。
- **v1.1（2026-08-06, Kimi）**：§7 Hermes Live2D 改写为实证方案——完成 Scholar's Tea 项目调研（`Z:/data/home/zju321/321/DHL/scholars_tea`）：wanko 官方免费模型许可可商用、iframe+pixi6 隔离架构、mood 双层映射与陪伴感配方可直接迁移；§11 问题 3 相应收窄为品牌差异化问题。
