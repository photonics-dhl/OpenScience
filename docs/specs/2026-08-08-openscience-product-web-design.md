# OpenScience 产品级网页设计 Spec

**状态：** 已获用户批准，待书面 spec 审阅  
**日期：** 2026-08-08  
**基线：** `docs/OpenScience_Kimi_Development_Spec.md`  
**视觉依据：** `docs/specs/2026-08-06-frontend-visual-system-design.md`

## 1. 产品命题

OpenScience 是 AI 时代的研究基础设施：研究不是一次性发表的文档，而是一个可验证、可协作、可持续演化的 Research Object（RO）。平台的核心闭环是：

`创建 RO → Hermes 结构化 SDF → 人工确认 → 版本保存 → 公开先发 → 社区 review → 继续演化`

Ultrafast Science 是 OpenScience 上的期刊策展渠道。期刊精选层叠加在 RO 身份之上，不取代 RO 的事实身份，也不把“期刊精选”误写成同行评审通过或最终出版。

## 2. 目标用户与首个成功时刻

主要用户是拥有进行中研究、但论文、数据、代码和素材分散的个人研究者。首个十分钟成功标准是：用户创建一个 RO 草稿，并看到六个 SDF 节点（Problem、Insight、Method、Results、Limitations、Reproducibility）的结构化预览。

首个产品旅程：

1. Landing 进入创建或探索。
2. 邀请用户完成邮箱验证并兑换邀请码。
3. 进入 Dashboard；可跳过只读样例 RO，或创建自己的 RO。
4. 创建向导要求标题，并允许粘贴已有研究材料或选择空白六字段。
5. Hermes 先展示数据处理说明，用户明确确认后解析。
6. 每个字段展示来源片段、置信状态和待确认/缺失/推断标记。
7. 用户编辑并自动保存为草稿，点击“保存版本”后生成不可变快照。
8. 发布前完成轻量 preflight，公开成为 OpenScience preprint。

## 3. 访问与身份流程

### 3.1 邀请制与候补

平台保持 invite-only 测试阶段。无邀请码访客仍可浏览公开 RO、Ultrafast Science Collection 和授权样例；点击创建时可提交邮箱和研究目的进入候补，不显示为死胡同。

获得邀请后，邀请码绑定邮箱。用户完成邮箱验证并设置密码或使用 OAuth 后，邀请码自动兑换为个人工作区权限，保留邀请来源审计记录。

### 3.2 首屏

验证成功后进入研究驾驶舱 Dashboard：

- 主动作：`创建研究对象`。
- 次动作：继续最近 RO、查看待处理任务。
- 认知支架：授权的只读样例 RO，明确标识为样例而非用户数据，可随时跳过。

## 4. 信息架构

### 4.1 公共层

- `/`：创建与探索双入口 Landing。
- `/explore`：feed-first 的公开/精选研究流，支持搜索和渐进式筛选。
- `/ro/:publicId`：公开 RO 研究身份页。
- `/collections/ultrafast-science/...`：期刊、卷、期、栏目和精选作品集合。

### 4.2 产品层

- `/dashboard`：当前研究进度驾驶舱。
- `/ro/:id/workspace`：统一 RO 工作区。
- `/ro/:id/workspace/sdf`：SDF 写作与确认。
- `/ro/:id/workspace/artifacts`：数据、代码和媒体素材。
- `/ro/:id/workspace/versions`：版本、差异和引用。
- `/ro/:id/workspace/collaboration`：协作者、review、issue、branch/PR。
- `/ro/:id/workspace/publish`：可见性、许可、引用和发布前检查。
- `/admin/editorial`：期刊编辑策展工作区。

### 4.3 统一 RO 工作区

所有工作区页面共用同一产品壳层和对象上下文，模式为：`概览 / 写作与 SDF / 数据与代码 / 版本 / 协作 / 发布`。模式可使用独立 URL，但 RO 状态、版本、Hermes 上下文和任务中心保持连续。

## 5. 创建与 Hermes 交互

创建向导是 guided hybrid：标题 + 粘贴研究材料进入 Hermes 解析，或直接开始空白六字段。当前不虚构尚未存在的 PDF/Word/LaTeX 输入能力。

提交材料给 Hermes 前必须显示：本次处理的内容、用途、可见性、保存位置、处理提供商、保留期限和删除方式。默认不用于训练公共模型，只用于当前 RO 的解析与协作任务。

Hermes 输出要求：

- 每字段保存来源片段、模型/提供商、时间、提示模板版本和输入范围。
- 每字段显示 `已确认 / 待确认 / 缺失 / 推断` 状态，不能把推断伪装为事实。
- 英文翻译为独立字段草稿，记录来源语言、模型和人工确认状态，不覆盖中文原文。
- 普通草稿编辑可在用户开启连续协作后自动保存；创建版本、改变可见性、发布、邀请协作者和提交期刊精选必须显示变更摘要并逐项确认。

Live2D 是 Hermes 的可视入口，共用同一账户、工作区、RO ID、任务和版本链。它可创建草稿、查看证据、发起 review 和跳转编辑器，但所有高风险写入仍走统一确认流程。桌面端为可收起助手 rail，移动端为 bottom sheet；编辑、diff、review 和审批时自动安静化，审批模式不使用娱乐化动作。

## 6. 版本、RO 身份与 review

RO unique ID 是长期唯一身份；所有版本、review、artifact、引用和期刊策展记录绑定此 ID。已发布版本不可变，作者通过“继续演化”创建下一版草稿。

- 草稿持续自动保存；`保存版本` 创建不可变快照并允许填写版本说明。
- 新版本页面显示与上一版的 SDF、artifact、权限、许可差异。
- review 默认绑定 RO ID，同时保留提交时的版本锚点。
- 页面区分针对特定版本的意见和面向当前 RO 的持续讨论。
- 提供“引用持续 RO”和“引用具体版本”两个入口；论文与复现实验默认推荐具体版本。

## 7. 发布与许可

发布前 preflight 采用两层检查：

### 7.1 最低可发布

标题、至少一位作者、可见性、版本号，以及 SDF 中至少完成 `Insight` 与 `Method`。其他字段可标记“尚未报告”，系统给出完善建议。

### 7.2 建议完善

作者/机构/贡献、Results、Limitations、Reproducibility、引用、artifact 来源、媒体 alt 文本和许可声明。缺失建议不阻塞草稿或早期公开，但必须在发布前清楚呈现。

### 7.3 平台使用许可与成果再利用许可

OpenScience 作为发布平台负责托管、展示、版本化、时间戳、内容哈希、阅读、引用、评论和审阅能力。作者使用平台即接受平台条款，但这不自动授予外部转载、改编或商业使用权。

无明确成果再利用许可证时，默认允许平台内阅读、引用、评论、审阅和版本链接；外部转载、改编和商业使用需等待作者或有授权的期刊声明。公开页显示：

`Published on OpenScience`、`License declared by author(s) / authorized journal`、`许可待定`（如适用）。许可证设置或修改生成新版本，旧快照不被回写。

## 8. Public RO 与媒体

公开 RO 是“研究身份页 + 分层阅读”结构，首屏依次强调：标题、作者/机构、RO ID、版本/状态、许可证、引用、结论或 Insight。随后展示六节点 SDF 故事，再进入 metadata、files、versions、issues、PR、reviews、citations 等深层标签。

RO Card 优先显示研究身份与演化状态：标题、作者/机构、RO ID、版本/状态、Insight 摘要、更新时间、review/版本计数、许可和一个代表性媒体。期刊标记为次级信息。

所有图片、视频和生成素材都是带 provenance 的 Artifact，至少记录：所属 SDF 节点、标题、caption、类型、来源/生成器、时间、版本、许可证和 alt 文本。AI 生成素材必须标注，并在允许发布时保留 prompt、模型和脚本。公共页默认静态 poster/card；视频点击后播放并展示来源/生成信息。只有 Landing Hero 使用静音循环视频，并提供 poster 与 reduced-motion 降级。

## 9. Review、协作与通知

评论者必须经过平台身份验证；默认显示姓名、机构和角色，可因正当理由提交仅作者与编辑可见的审阅，但不支持完全匿名公开评论。

Review 状态为：`已提交 → 作者/编辑可见 → 作者回应 → 已解决/保留争议`。Review 可绑定 SDF 字段、版本或 artifact；处理举报、限制访问和撤回必须留审计记录，不能无痕删除。

协作者角色使用少量模板：`Owner / Editor / Reviewer / Viewer`。工作区默认私有；发布、改可见性和成员管理需要 Owner 或明确授权。单人或小团队默认线性草稿，需要并行实验或外部贡献时才创建 branch/PR，合并结果生成新版本。

Dashboard 通知中心只呈现可行动事项：Hermes 字段确认、review、PR/权限请求、任务失败、期刊编辑请求和版本发布结果；普通浏览与社交活动不进入主通知。

## 10. Ultrafast Science 策展层

期刊层级为：`journal → volume/issue → section → selected work`，另支持跨期 thematic collection。编辑工作区提供候选队列、完整度/许可/媒体检查、主视觉、编辑说明、栏目、顺序、排期、预览和状态流：`draft → internal review → scheduled → published`。

期刊精选保留 RO 的事实身份，并叠加：期刊 logo、卷/期/栏目、编辑推荐、精选日期和 `Selected by Ultrafast Science`。编辑意见与社区 review 是两条独立轨道，精选不表示同行评审通过或最终出版。

编辑角色为 scoped `Editorial Curator`，只管理被授权的期刊渠道，不获得作者、平台安全或全局权限。作者可在未来认领并继续演化 RO，但不能修改已发布快照或抹除策展历史。

## 11. 视觉与动效系统

采用双表面体系：

- Landing 与工作区：深色科研仪器感，深墨背景、蓝色轨迹、少量橙色差异提示、Noto Serif SC 显示字体与高可读 UI 字体。
- Public RO 与期刊页：纸张白学术阅读面，深色正文、克制蓝色链接和清晰 metadata 层级。

统一连接两套表面的元素是 RO 六节点符号、状态色、字体层级、artifact 图像比例、版本 diff 语言和 Hermes 轨迹。动效只表达研究演化、证据关系、版本差异、任务状态和导航层级；遵守 `prefers-reduced-motion`，媒体和 Live2D 都必须有静态降级。

## 12. 响应式与无障碍

移动端保持功能 parity：顶部显示 RO 状态与版本，底部切换 `概览 / SDF / 数据与代码 / 版本 / 协作 / 发布`；Hermes 使用 bottom sheet，关键确认使用全屏对话框。所有关键状态包含空、加载、错误、成功、权限不足和任务失败视图。

实现必须满足 WCAG AA、键盘可达、清晰焦点、语义 HTML、字幕/alt 文本和 reduced-motion。性能目标沿用现有视觉 spec：LCP ≤ 2.5s，首屏媒体 poster 优先，视频和 Live2D 懒加载。

## 13. Figma 第一轮交付与验收

Figma 专业版开通后，先建立 variables、tokens、组件和响应式断点，再完成六个可点击关键屏幕：

1. Landing
2. Auth / Create
3. Dashboard
4. RO Workspace
5. Public RO
6. Ultrafast Science Collection

每个屏幕都要覆盖主流程和关键状态（空、加载、错误、成功、权限），并标注动效、无障碍和媒体降级。验收包含：可点击主流程、桌面/移动视觉回归、WCAG 检查、LCP/媒体预算和现有截图证据，而不只是 Figma 与代码截图相似。

## 14. 设计边界与后续拆分

本 spec 定义产品体验、信息架构、状态模型、视觉原则和验收标准；不在本轮直接修改 API、数据库或业务组件。实现应拆为独立计划：

1. Figma foundations 与六屏交互原型。
2. 统一 RO workspace 与 Dashboard。
3. Public RO、Explore 与 Artifact provenance。
4. Editorial Curator 与 Ultrafast Science Collection。
5. Hermes/Live2D 状态桥接、任务中心与高风险确认。
6. 视觉回归、无障碍、媒体性能和生产验收。
