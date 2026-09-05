# Integrated Research Product Design

> CURRENT；用户已确认产品方向与分段效果验收，2026-09-05。
> 本文记录批准范围与推荐交互；用户已认可科学插图样张方向，视频样片与产品接入仍需实际验收。
> 需求基线：`docs/OpenScience_Kimi_Development_Spec.md`。

## 1. Product objective

优先完成可使用、可展示的完整网站。工作区、Hermes、RO 编辑、预览发布与讨论共享研究上下文，让用户知道自己在哪里、正在处理什么、下一步做什么。每项能力先交付完整功能和可理解的界面，再迭代生成质量；不得以空按钮、模拟成功或断开的页面代替完成。

用户确认的完整旅程：导入论文 → Hermes 整理研究对象 → 查看并确认建议 → 生成核心图解 → 用文字或语音要求修改 → 预览差异并应用 → 生成讲解视频 → 预览发布 → 围绕具体结论和证据讨论 → 修订下一版本。

图片和视频主要根据论文生成。音频用于 Hermes 与用户交互，不以音频版论文为首要交付。首期不处理用户上传音视频的转录、理解或证据提取。

### 1.1 Scientific explanation acceptance (2026-09-05)

用户明确纠正：RO 已承担论文凝练，衍生图必须用场景、结构、传播/作用过程和局部放大解释研究做什么、怎么做、为什么有效；文字主张卡片不能作为科学插图完成。用户认可 D2NN 科普生图的视觉方向，仍需纠正探测面与干涉细节，认可方向不等于免除科学检查。

解析器先保留章节、图表/图注与位置；语义切分后 BGE 负责向量检索，语言/视觉模型负责理解与综合。原始图表和代码引用进入有来源的 Evidence，不能把切块保存或模型生成的说明称为独立证明。生成资产与原文、RO 版本和相关结论关联，修改后重新检查。

用户已同意先做同一论文的真实科普视频演示，再固化进产品。首选少量高质量插图配合本地动画/字幕/剪辑；需要时才调用 MiniMax。既有推荐仓库均为候选，按解释效果、准确性、编辑能力、许可、成本和维护负担选择，不为采用某个仓库而增加依赖。

本次演示采用已有 Playwright/Chromium 与 FFmpeg；先验证 30–45 秒成片、中文可读性与探测区域表达。已有图片复用时本次新增图片/视频 API 调用可为零，但不宣称历史图片免费或服务器运行无成本。演示脚本不接受任意用户 HTML，不作为生产模型调用路径。

## 2. Capability reuse

| Existing owner | Product use |
|---|---|
| Dashboard、ContinueResearch、ImportStage、ResearchList | 从开始研究到继续上次任务的统一入口 |
| HermesAssistantDrawer、workspace.guide、literature-intent | 当前研究目标、任务状态、文献获取与下一步操作 |
| IngestionTask、AgentTask、隔离 parser、SourceMap | 导入进度、解析结果、失败恢复和原文定位 |
| packages/search、BGE-M3、Semantic Scholar、ScanSci | 需要时检索研究材料、补充来源与获取全文 |
| Claim/Evidence API、SDF、现有 diff/审批/版本 | 建议预览、人工确认、持久保存与公开版本 |
| presentation/chart-generator、interactive-html | 图解与可交互展示的现有生成和存储路径 |
| AI Gateway、science-worker | 按需模型生成与受控计算；不重新搭建队列或沙箱 |

只读导航不能冒充已实现任意自然语言编辑。新增编辑意图必须实际连接 proposal、审批和持久化；权限、版本冲突、任务恢复沿用原有机制。模型输出不能直接覆盖已确认内容。

## 3. Unified interaction

工作区以当前研究与待处理事项为主；空态明确显示“导入论文”与“创建研究”。RO 内保留稳定的研究标题、阶段、保存状态、返回工作区入口和当前主要动作。材料、编辑、预览、发布仍可使用现有路由，不要求通过大规模路由重写实现统一。

Hermes 接收当前 Workspace、RO、版本及显式选中对象。跨路由继续同一研究任务；切换 RO 时不沿用另一 RO 的目标。用户从结果进入证据或编辑后，能够返回原任务。恢复优先使用已有服务器 task/session 标识，不另造浏览器里的研究事实副本。

文字修改先支持明确、有范围的操作：改写选定说明、调整核心图解、组织展示顺序。确认前显示修改对象与差异；应用后 RO 可见并能刷新复验。版本冲突要求重新预览，重复提交复用原任务。引用原文不得被润色替换。

生成图片或视频时先提供简短内容规划、目标与预计成本；任务进行中显示可恢复的真实状态，完成后进入同一 RO 展示区。失败保留原稿与重试入口，缺少模型配置时诚实显示不可用。生成展示必须与原始 Evidence 区分。

语音采用用户主动开始/停止的交互，先显示可校正的识别文本，再进入同一文字意图和修改预览路径。麦克风拒绝、识别失败、播放失败时可继续文字操作；不持续后台录音。语音确认不能绕过既有高影响发布确认。

公开 RO 先展示核心贡献与图解，再展开证据、方法和限制。讨论围绕当前 Claim、Evidence 或版本，优先复用现有协作系统；若现有数据不足以表示讨论锚点，再单独设计最小扩展。

## 4. Reuse-first research decisions

每部分实现前比较现有实现与成熟方案；记录可复用内容、许可、运行资源、数据流和舍弃理由。GitHub 热度不能替代适用性判断，安装第三方能力仍须在明确授权范围内。

| Area | Candidate/reference | Initial decision |
|---|---|---|
| 页面与导航 | 现有 Next.js、Radix、Research Folio、frontend/nanqing | 优先复用；先验证完整旅程，不新建 UI 框架 |
| 图解 | cathrynlavery/diagram-design | 已查官方仓库，HTML/SVG 与现有路径匹配；先参考布局和图形语法，尚未安装或选择具体模板 |
| 视频 | gnipbao/story-to-handdrawn-video | 参考分镜、插图与转场流程；其无声画面定位不等于完整科研视频产品 |
| 视频渲染 | Remotion | 官方文档已初查；仅候选，需核实商业许可、CPU 渲染成本和部署边界再决定 |
| 语音输入 | MediaRecorder + 待选 ASR 服务 | 浏览器录音接口不是语音识别器；需比较中文科研术语、延迟与价格 |
| 语音输出与生成媒体 | MiniMax 与适用替代 provider | 经现有 AI Gateway；当前受阻能力不得标记可用或绕过管理员限定 |
| 配色 | Huemint、Happy Hues、Realtime Colors 等参考 | 辅助比较实际页面，保留既有品牌；不把换色当作流程修复 |

参考资料：

- [Diagram Design](https://github.com/cathrynlavery/diagram-design)
- [Story to handdrawn video](https://github.com/gnipbao/story-to-handdrawn-video)
- [Remotion documentation](https://www.remotion.dev/docs/)
- [MediaRecorder documentation](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
- [用户配色参考](https://mp.weixin.qq.com/s/JvO0PVLCXiZKE3TijZH21Q)

## 5. Delivery slices and user acceptance

1. **工作区—Hermes—RO 连贯流程**：真实导入、查看任务、进入对应 RO、确认建议、保存、返回继续研究与预览发布；每页主动作和失败恢复清楚。先交付此段操作效果。
2. **Hermes 文字修改与论文图解**：选定内容 → 提出修改 → 差异预览 → 应用 → 刷新保留；图解来自当前论文/版本，能继续修改。交付真实生成示例供用户验收。
3. **论文视频**：基于同一 RO 的分镜、图片与字幕生成视频，可预览和修改分镜；保留来源和版本关联。使用真实成片验收。
4. **Hermes 语音交互**：录音、识别校正、同一编辑流程、可选语音回复；用真实语音修改 RO 验收。
5. **阅读—讨论—修订回路**：从展示内容回到证据与讨论，再进入修订；验证作者和读者两条路径。

每段交付包括：可操作入口、示例任务、实际结果、桌面/移动交互证据、已知限制和用户效果反馈。现有功能测试、权限/数据安全验证和服务器验收继续执行；不新增无明确失效场景的 hash、baseline 或 gate。用户未验收不得标记视觉或产品效果已接受。

## 6. Collaboration and constraints

用户确认同事分支为 `frontend/nanqing`，授权定期评估并选择性合并优质成果到 main、部署。每日 10:00 巡检已创建；无变化安静。比较实际文件与已移植 patch，不只看 commit 是否在 main；不得覆盖同事未完成工作。

优先采用本机已有独立 worktree，从最新 origin/main 开始，根目录旧 main 与未提交文件保持原样。Landing 与 Wanko 造型保持现状；可优化工作流布局与交互，不顺带重做角色。生产 CPU 条件、权限、审批、来源追踪和受控资源边界继续有效。

本方案未安装依赖、未启用受阻 provider、未修改 API/schema、未部署。Research Intelligence 旧 Task 1–12 保持完成；本轮是新的产品交付主题。

## 7. Reviewed-media integration slice

First integrate already reviewed PNG/MP4 into existing PresentationAsset records through an administrator maintenance CLI, never a fake generation task. The actor must also have write membership in the active workspace and the exact version must be draft. Source Claims must belong to that version; import creates draft assets with truthful admin_reviewed_import provenance and audit, explicit approval remains separate. Existing Claim edits/deletes invalidate imported assets. No arbitrary user media upload or automatic paper generation is claimed.

Private/public safe-video reads support one HTTP byte range after existing authorization and full-object checksum validation. The existing16MiB buffer limit stays; first samples are below4MiB. List metadata adds canTransition, computed from draft/writer/admin restrictions; frontend media controls fail closed if absent. Private workbench has inline native video, clear creator text and linked Claims. No schema migration or new provider.

The old ordinary-user personal acceptance workspace cannot invite an admin; do not change roles or bypass scope. Use the already-existing administrator E2E account and a new private same-paper acceptance RO, with human-authored summaries/Claims and source URL. This validates the product capability without claiming the original RO has been modified.

## 8. Media-first RO layout (approved continuation)

The reader should encounter the reviewed explanation before the source editing form. Retain the existing warm paper/ink/vermilion workspace aesthetic and Tailwind tokens. Use full-width content, responsive two-column media tiles on desktop and one column on phones; scientifically important imagery uses contain, never cropping. Each tile exposes type, status, playback/full-size access and existing permitted approval actions. Source Claims and truthful production metadata use native disclosure; a short presentation-not-evidence distinction remains visible. No autoplay or new dependencies.

Move source creation/selection and deterministic concept-map generation below the gallery in a clearly named disclosure. Empty workspaces and active/error/recovery tasks must expose an obvious next action; disclosure must not hide failures, lose typed input or change authorization. Page/navigation terminology covers image/video while generation text specifically describes the existing concept map. Native controls follow WAI disclosure keyboard conventions and Carbon's grouped content-tile approach. Automatic media generation and Hermes editing remain separate later slices.

References: https://carbondesignsystem.com/components/tile/usage/ and https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/ . Browser acceptance covers media-before-editor geometry, intact illustration, mobile overflow, keyboard disclosures, visible review actions, source editing and active/error recovery. Production uses the existing canonical release process.
