# Integrated Research Product Design

> CURRENT；用户已确认产品方向与分段效果验收，2026-09-05。
> 本文记录批准范围与推荐交互；具体页面效果尚未实现或验收。
> 需求基线：`docs/OpenScience_Kimi_Development_Spec.md`。

## 1. Product objective

优先完成可使用、可展示的完整网站。工作区、Hermes、RO 编辑、预览发布与讨论共享研究上下文，让用户知道自己在哪里、正在处理什么、下一步做什么。每项能力先交付完整功能和可理解的界面，再迭代生成质量；不得以空按钮、模拟成功或断开的页面代替完成。

用户确认的完整旅程：导入论文 → Hermes 整理研究对象 → 查看并确认建议 → 生成核心图解 → 用文字或语音要求修改 → 预览差异并应用 → 生成讲解视频 → 预览发布 → 围绕具体结论和证据讨论 → 修订下一版本。

图片和视频主要根据论文生成。音频用于 Hermes 与用户交互，不以音频版论文为首要交付。首期不处理用户上传音视频的转录、理解或证据提取。

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
