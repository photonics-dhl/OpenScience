# Integrated Research Product Design

> CURRENT；用户已确认产品方向与分段效果验收，2026-09-05。
> 本文记录批准范围与推荐交互；用户已认可科学插图样张方向，视频样片与产品接入仍需实际验收。
> 需求基线：`docs/OpenScience_Kimi_Development_Spec.md`。

## 2026-09-11 已确认的交互收敛

以下为用户经 grill-me 确认的目标交互，优先于下文较早的逐步页面/逐次建议确认描述；不代表当前生产已全部实现。真实进度见 CURRENT handoff。

- 每篇 RO 默认是可阅读、可直接修改的研究成稿，精华与已有图片占主区；Hermes 在侧边协助并可收起，共享同一内容、任务和媒体状态。附件、证据、历史、详细制作指令按需展开。
- 公开页以标题、署名与来源、一句话核心贡献、核心媒体进入阅读。有视频时与核心示意图一起直接展示，各有短说明。六字段组织为凝练连贯正文，重要科学限制直接呈现；不把公开页做成编辑表单或字段卡片墙。
- 尽可能减少操作：上传后自动解析、凝练并填入可改草稿。第一个主要确认节点为用户查看内容并选择图片、视频或两者后“开始制作”；后续规划、详细指令整理、生成和回传由 Hermes 自动连续处理，不逐字段/提示词反复确认。
- 第二个主要确认节点为用户查看同版正文与媒体、选定本次公开内容后“公开发布”。中间普通草稿修改自动保存、可撤销；用户主动通过 Hermes 的普通修改直接回显，不要求每次再弹确认。涉及科学不确定性时集中给出具体问题。
- 自动推进不覆盖原件、已公开版本或他人未合并修改，不改变权限边界；原文引用不得被润色。用户选择制作/发布覆盖明确范围，不能据此自动重复扣费重做或扩大公开范围。
- 布局先用同一真实论文的可点击线框讨论，保持一套已选结构；具体视觉、空间分配与窄屏排列在样稿中收敛，不继续叠加零散页面补丁。
- 用户看过线框后确认布局与信息密度更舒适（2026-09-11），保留主体布局。下一步重做视觉、控件及自然过渡；Hermes 必须显示既有形象，以对话式输入承接指令并判断处置路径，用户不需要先选择底层工具。任务与内容在同一工作台回显；此处是目标能力，独立交互稿中的预设动作不能冒充真实模型路由。
- 用户进一步批准高保真稿风格并要求正式落实（2026-09-11）：采用冷白底、墨色正文和青绿色操作色；工作台/公开页六栏目需要突出，以20px半粗标题、简洁标记、细分隔线和留白建立层级，正文保持18px/31px凝练连贯阅读。Hermes展示完整透明形象、固定对话输入；细节指令默认折叠。无须重新确认已批准的布局、风格和两个主要确认节点。

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

以上为最初设计阶段约束，实际交付状态以CURRENT handoff为准。Research Intelligence旧Task1–12保持完成；当前是新的产品交付主题。

## 7. Reviewed-media integration slice

First integrate already reviewed PNG/MP4 into existing PresentationAsset records through an administrator maintenance CLI, never a fake generation task. The actor must also have write membership in the active workspace and the exact version must be draft. Source Claims must belong to that version; import creates draft assets with truthful admin_reviewed_import provenance and audit, explicit approval remains separate. Existing Claim edits/deletes invalidate imported assets. No arbitrary user media upload or automatic paper generation is claimed.

Private/public safe-video reads support one HTTP byte range after existing authorization and full-object checksum validation. The existing16MiB buffer limit stays; first samples are below4MiB. List metadata adds canTransition, computed from draft/writer/admin restrictions; frontend media controls fail closed if absent. Private workbench has inline native video, clear creator text and linked Claims. No schema migration or new provider.

The old ordinary-user personal acceptance workspace cannot invite an admin; do not change roles or bypass scope. Use the already-existing administrator E2E account and a new private same-paper acceptance RO, with human-authored summaries/Claims and source URL. This validates the product capability without claiming the original RO has been modified.

## 8. Media-first RO layout (approved continuation)

The reader should encounter the reviewed explanation before the source editing form. Retain the existing warm paper/ink/vermilion workspace aesthetic and Tailwind tokens. Use full-width content, responsive two-column media tiles on desktop and one column on phones; scientifically important imagery uses contain, never cropping. Each tile exposes type, status, playback/full-size access and existing permitted approval actions. Source Claims and truthful production metadata use native disclosure; a short presentation-not-evidence distinction remains visible. No autoplay or new dependencies.

Move source creation/selection and deterministic concept-map generation below the gallery in a clearly named disclosure. Empty workspaces and active/error/recovery tasks must expose an obvious next action; disclosure must not hide failures, lose typed input or change authorization. Page/navigation terminology covers image/video while generation text specifically describes the existing concept map. Native controls follow WAI disclosure keyboard conventions and Carbon's grouped content-tile approach. Automatic media generation and Hermes editing remain separate later slices.

References: https://carbondesignsystem.com/components/tile/usage/ and https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/ . Browser acceptance covers media-before-editor geometry, intact illustration, mobile overflow, keyboard disclosures, visible review actions, source editing and active/error recovery. Production uses the existing canonical release process.

## 9. Sourced storyboard and Hermes revision (approved continuation)

Deliver a complete plan-generation/revision/approval slice before rendering: select current RO Claims, choose watercolor/technical/ink and language, explicitly submit one AI-credit task, inspect 3–6 scenes with title, narration, visualAction, durationSeconds and sourceClaimIds, then submit feedback against an existing non-rejected storyboard to create a separate draft. Existing approved/old drafts remain unchanged; approval adopts a draft through current transition controls. Scene-by-scene previous/current comparison supports review. A storyboard is a plan, not generated imagery or video. No automatic full-paper understanding claim: this slice reads selected RO Claims and their conditions/limitations only; raw Evidence/SourceMap retrieval is deferred.

Use existing presentation.generate task, Gateway structured text, PresentationAsset interactive_html and source Claim links. Optional storyboard request {locale:zh|en,style:watercolor|technical|ink,instruction:nonempty trimmed string<=1000,baseAssetId?:uuid} is valid only for interactive_html; legacy strict payload remains compatible. Output StoryboardDocument {schemaVersion:1,title,scenes:[{title,narration,visualAction,durationSeconds,sourceClaimIds}]} uses bounded text, 3–6 scenes, 4–20 seconds each, total24–90 seconds, only requested Claim IDs. Metadata view exposes only validated storyboard document plus server locale/style/baseAssetId, never arbitrary provenance. Render escaped script-free downloadable HTML, not model-authored executable HTML. No schema migration/new queue/model install/provider bypass.

Base draft or approved storyboard must belong to the exact RO/version and retain the same Claim set; the server captures base immutable content/provenance/Claim identity before generation and rechecks it plus non-rejected status inside the existing version-fenced Serializable write. All input Claims are revalidated immediately before persistence; changed/revoked/published sources block completion. Each revision is an independent immutable draft with parent ID; no overwrite and no automatic supersession. Existing Claim invalidation rejects plans. Input instructions and Claim text are untrusted model data; generated scientific content still requires human review. The existing one-credit charged-on-submit policy and bounded Gateway retries apply; show charge before each new task, including revisions; bounded Gateway retries and exact idempotent replay stay within the original credit.

UI: a clearly labelled Hermes storyboard section alongside the existing source selection; 3 style choices describe intended artwork direction, not completed image styles. Scene list separates spoken narration from visual action, preserves source links and shows a revision comparison. Error/task recovery remains visible. Bilingual responsive native forms reuse current Folio tokens; no new frontend dependency. Reference: gnipbao/story-to-handdrawn-video separates visual planning and rendering and provides style families; use its workflow idea, not install its renderer.

## 10. Reviewed storyboard scene imagery — implementation scope

User authorized continuation on 2026-09-06. First validate the image-producing link before batching images into video. Each task consumes one scene of an approved storyboard in the exact draft RO version, retains all storyboard Claim dependencies, and creates one separate draft image. The user chooses a scene, sees the one-credit charge, then reviews the real returned picture. No automatic approval, overwrite, or claim that an illustration is evidence. Existing media administrator authorization is retained for this first rollout; ordinary writers still create/revise storyboards. Video consumes reviewed imagery in the next slice, reusing CPU Chromium/FFmpeg and the accepted voice runtime.

Reuse presentation.generate and existing storage/approval/Claim invalidation; add optional sceneImage {storyboardAssetId:uuid,sceneIndex:integer0..5} exclusively for kind=image, mutually exclusive with storyboard. Validate approved parent, exact source set and scene bounds before charge/model and within final Serializable persistence. Rejecting the parent invalidates linked draft/approved scene images; generated imagery has a narrow parent/scene DTO and no raw prompt. The task keeps all parent Claims because the visual prompt includes their conditions/limits. Idempotent replay does not add credits or repeat successful work.

AI Gateway owns MiniMax image-01 requests using the configured server credential, one image, 16:9, prompt optimizer off, bounded base64 response and no URL downloads. No automatic paid image retry. No model SDK, CLI or new local model installation. Metadata-only Gateway audit reports unavailable dollar cost as null. Renderer/browser cannot receive provider keys. A bounded text planning call may condense reviewed scene/context into the provider's 1500-character prompt limit without silent truncation; actual calls and provider failure are recorded, not represented as free generation. UI remains media-first and uses the existing task recovery/epoch logic.

Reference inspected 2026-09-06: MiniMax official Token Plan/CLI documentation and MiniMax-AI/cli image SDK use /v1/image_generation; base64 image_base64 response avoids fetching untrusted returned URLs. Subscription quota support does not prove a particular key currently has quota; real controlled acceptance must verify it. Critical failure cases are scientific drawing errors, source/permission changes during paid generation and provider success before persistence failure; reuse existing fences and human review rather than adding a new general gate framework.

Acceptance 2026-09-06: scene generation is deployed615ca2d for administrator trials. Explicit CN image region matches the existing credential; first global attempt failed, CN retry succeeded. The actual1280×720 image is decodable but too abstract to explain the mechanism clearly, so remains draft. Next prioritize concrete subjects, spatial relationships and causal visual progression; technical success does not authorize scientific approval.

## 11. Concrete scene composition

User approved improving the image design before further video work. Replace freeform prompt condensation with one structured visual brief: teaching point, concrete subjects, spatial arrangement, visible causal mechanism and fidelity constraints. Compile those fields deterministically into the existing1500-character image request; retain the approved scene and all Claim context, explicit uncertainty and illustration status. No new provider call, dependency, schema, or source-access permission. This slice does not add PDF/BGE retrieval; source images remain future scoped evidence support. Compare the same controlled diffraction/interference scene; a visible phase sheet, propagation and receiving screen with bright/dark distribution should be intelligible, without claiming measured output or wavelength splitting. Preserve the old draft and require visual review.

Concrete-composition candidate (basef7a80ea, production615ca2d/rollbackd6507ea unchanged): five-field brief with explicit string schema, subject placement and causal screen output. Worker529 tests, focused44, workspacebuild/typecheck/lint and independent review passed. Real planning initially failed schema (3 text calls); one additional text-only diagnostic found subjects array/overlength, prompting a schema example and concise budgets. Final candidate used2 text calls (one structured retry) and1 image-01 call; image is still scientifically insufficient (screen lost, floating patches), so no deploy or approval. Same1351-character prompt in one built-in imagegen call better retained plates, wavefronts and receiving screen; this single sample is a comparison, not a provider benchmark or a production integration. Existing Worker OPENAI_API_KEY/GEMINI_API_KEY readiness booleans were false; no secrets printed. No models or runtimes installed.

## 12. Bounded CPU image feasibility experiment

Evaluate official stable-diffusion.cpp with FLUX.2-klein4B Q4, Qwen3-4B Q4 and the official small decoder before adding a provider. Public upstream weight metadata totals5,240,163,463bytes including the33MB runtime archive; Apache2 weight licenses and MIT runtime. Reuse the existing Python CPU base by exact image ID (glibc2.41) to run the official Linux binary; no PyTorch/CMake install, no new production service. Start512×288/4steps/6CPU/12GiB/10min with no network or secrets, read-only models and separate output. Stop on resource/health regression; quality and latency decide whether to proceed. This is an isolated experiment, not an API-backed product feature.

2026-09-06 user steering: PAUSE local model preparation; retest MiniMax before any further installation. Exact download container stopped; about1.1GB archive/partial remains under /opt/openscience-evals/local-image, no weights complete and no inference/runtime install executed. Do not resume automatically. Production615ca2d/rollbackd6507ea unchanged.

Revised access finding: Codex supports ChatGPT sign-in and headless device authentication. Local CLI0.153.0 exposes image_generation stabletrue; official matching source additionally gates imagegen on plan/provider/model/auth. Thus a server Codex worker experiment is technically plausible, not verified. This is distinct from a supported public image API; ChatGPT and API billing are separate. No server Codex install, login or auth transfer performed.

## Global Hermes presentation actions — approved workflow continuation

Extend the existing global composer with explicit storyboard creation/revision and scene-image intents. Intent detection only prepares a review card; it never writes or guesses a scene target. The card loads the exact RO/version/Claims/assets through existing APIs, shows scope, original retained behavior and1Credit, and lets the user select the parent/scene or Claims. Dashboard users explicitly select a research object; an explicit unavailable/published version does not silently fall back to another draft. Switching RO/version discards the old preparation.

Confirming creates a real existing presentation.generate task, then opens the existing presentation page with exact version/task parameters for progress, recovery, preview and diff/approval. This reuses the shipped task owner instead of duplicating a second polling/approval subsystem inside the drawer. Uncertain submission retains the same idempotency key/request and requires an explicit retry; no automatic paid retry. Image generation still requires server-reported approved-parent capability. Normal research guidance and literature acquisition continue through their existing paths.

No new model/provider, endpoint, schema, storage or dependency. The bounded natural-language shortcuts are complemented by an explicit presentation-action entry; unsupported free-form edits stay guidance. Primary files: HermesAssistantDrawer, HermesWorkspaceStage, new HermesPresentationAction and presentation-intent helper, zh/en messages and tests. Risks: stale context, accidental image spending, duplicate submit, version fallback, and mobile drawer nesting; verify them with targeted browser tests and actual server workflow.

## 2026-09-06 confirmed journey and selective integration

用户确认首轮主线为论文导入→Hermes凝练/修改RO→可视化→审核发布→读者理解与讨论；要求整体调整页面布局、UI、配色与艺术表现。页面职责和整站设计继续grill-me逐项讨论，不把主线确认当作完整页面设计已批准。

选择性吸收同事30fabce与b0741eb的登录恢复/密码显隐、资料dirty/save/discard。登录保留真实错误语义与returnTo；资料写入沿用现有API/profileVersion。保存冲突按原已保存值识别本地改动，保留服务器独立字段变更；冲突后须用户选择保留本地修改或撤销，才可再保存。原注册完成页、ORCID/机构步骤等候选留待整体页面职责决定，不夹带部署脚本或旧交接文档。

## 2026-09-06 page decisions and visual-reference reassessment

### Confirmed page responsibilities

用户连续确认：同一RO使用连续研究工作区，公开阅读页独立；RO默认研究概览，再深入证据/编辑/媒体；Hermes以关联当前内容的助手侧栏为主要入口，复杂任务保留详情页；研究桌面围绕继续研究、开始研究、处理待办。用户已选择A配色，并同意先制作三态高保真交互样稿；整站实施待样稿验收。

### Reference evidence and applicability

已重新阅读用户两篇文章，并浏览/截图官方参考页；证据在Git忽略的 `apps/web/test/visual/out/science-video/design-reference-{linear,distill,elicit,happy-hues}.png` 和 `design-reference-evidence.json`。Linear为官方文档中的产品截图；Elicit为公开官网演示，均非登录后完整产品试用。

| Reference | Verified useful pattern | OpenScience application | Boundary |
|---|---|---|---|
| [Emil design engineering](https://github.com/emilkowalski/skills/blob/main/skills/emil-design-eng/SKILL.md) | 动效先判断频率/目的，精确指定属性，强调响应和中断 | Hermes展开、修改预览、生成完成后的定位与反馈 | 是设计判断规则，不是完整模板；高频操作少动效，不能把苹果感理解成全站玻璃层 |
| [Linear Projects](https://linear.app/docs/projects) | 项目总览、稳定导航、状态/资源组织、按需详情侧栏 | 研究桌面及RO操作壳层 | 借鉴信息组织；不照搬深色、密集英文小字或软件项目术语 |
| [Elicit](https://elicit.com/) | 科研语境、清楚的主操作、正文与工具控件区分 | 导入/任务引导、科研字体与控件组合参考 | 本轮只看公开展示；官网大Hero/粒子背景不适合日常工作区 |
| [Distill Feature Visualization](https://distill.pub/2017/feature-visualization/) | 图像直接解释概念，宽图与正文/旁注形成节奏 | RO首屏图解、方法展开、原始证据关联 | 历史文章是视觉参考，不引入旧框架；每篇复杂交互不是首轮必须功能 |
| [Happy Hues](https://www.happyhues.co/) / [Realtime Colors](https://www.realtimecolors.com/) | 将颜色分别应用到背景、文字、按钮、插画，看整页效果 | 同一真实RO上的配色比较 | 不照搬其卡通粗描边、粉紫色或营销排版 |
| [用户配色文章](https://mp.weixin.qq.com/s/JvO0PVLCXiZKE3TijZH21Q) | Huemint选候选、Happy Hues看应用、Realtime Colors看页面、CSS Gradient辅助渐变 | 配色验证方法 | 不是代码仓库或完整设计系统；全站不需要为渐变增加实现负担 |

本地ui-ux-pro-max两次查询分别偏向海报/奢华排版与玻璃营销Hero，和科研操作场景不符，未采纳其自动推荐。以下为结合现有产品与参考的人工作用判断，不是来源原样方案。

### Approved prototype direction — production redesign pending

统一导航、控件、字体角色、间距及状态色；随任务切换信息密度。工作区操作壳采用低彩度浅色表面，阅读内容以图解和正文构图体现辨识度。避免把工作区、阅读页分别实现成互不相关的主题。

- 研究桌面：紧凑续接列表 + 明确开始入口 + 少量待办；不使用大宣传标题和重复嵌套卡片。
- RO概览：标题/一两句贡献与机制图并列或上下组合，图解比元数据更突出；再展开方法、结果、局限，证据可就近查看。不要把媒体排在版本hash和整段SDF之后。
- Hermes：侧栏和正文同一视觉规则，气泡/工具提示/预览/确认有不同角色；默认不遮挡正在阅读和操作的区域。
- 证据与编辑：中性表面、清晰选中和来源定位；代码与diff可以使用局部深色，避免整页突然换肤。
- Explore：有图解缩略图、核心结论、主题和作者的研究条目；精选可使用更有节奏的图文编排，普通列表保持可扫描性。
- 登录/资料/设置：明确输入框与标签、短步骤/分组、稳定保存反馈；不承担品牌海报功能，不堆大标题和长篇能力说明。
- 艺术图解：同一论文内统一对象形状、配色和视觉语法；淡彩/手绘可作为资产风格，而页面控件维持一致。原始图表与生成解释始终可区分。

已选A（用于样稿，未决定替换现有品牌）：工作区底#F7F8FA、内容#FFFFFF、正文#20252B、次级正文#626C76、主操作深青#125D66，朱红#BA442F用于少量品牌点缀。候选B保留朱红为主操作色、采用更浅的近白暖底；以同一内容/同一布局对比后决定。深色全站和高饱和渐变不推荐作为首轮方向。

计算的静态文字对比度：正文/工作区底14.52，次级正文/白底5.35，白字/深青7.54，白字/朱红5.31；这些只证明四个色对，不代表整页无障碍验收通过。

样稿参数建议而非冻结规范：工具正文14–16px，中文阅读17–18px、行高1.65–1.8；长段阅读约32–40汉字/行，媒体允许宽于正文；主要控件统一温和圆角与清晰焦点，悬浮层少量阴影。正文主要使用清晰的中文无衬线，衬线限于少量标题或阅读强调，先复用已有字体再判断是否需要新增。

已获授权以同一D2NN论文展示研究桌面、RO概览、Hermes展开三个连续状态，采用A配色。首要验收是能看懂、知道下一步、阅读与操作舒适，其后再评估插图和动效的吸引力。本轮制作隔离本地样稿，不替换生产页面、安装依赖或部署。

### Hermes identity retained — user acceptance correction

用户基本认可A样稿，并明确阿拉丁神狗不可丢失：Hermes须持续作为产品记忆与陪伴助手。复用现有Wanko/神灯模型和静态回退；桌面侧边陪伴入口、展开侧栏中的原角色静态头像、段落入口小头像保持一致，不再以H字母替代。模型固定挂载于陪伴区，展开助手不重建；安静/系统减少动效/待确认时显示原静态图并通过既有可见性检测暂停隐藏模型，不遮挡正文或伪造AI任务状态。下一实施段以真实研究桌面承接此视觉与身份，再推进RO/助手页面；逐段验证现有权限、任务与真实上下文。

## 2026-09-06 production screenshot correction — immediate delivery

用户否定上一轮整体视觉成效并要求快速服务器交付、减少重复测试。直接落实已确认A，而非再做样稿：统一 WorkspaceShell 与 presentation 的浅灰白/深青/无衬线控件；RO常用导航为概览、编辑、可视化、原始文件，其余保留在More菜单。概览移除固定左侧SDF目录与重复状态链接，空内容强调添加论文/调用Hermes、整理内容与制作图解的顺序；编辑改为明确当前字段、宽松书写区与简洁建议卡，去掉永久pending占位；无版本媒体页提供三步准备说明。保持真实版本/权限/生成边界，不自动写入或消费额度。

Hermes继续原Wanko与神灯。真实Chromium复现旧实例销毁共享Pixi纹理导致下一实例黑色几何块；修正texture ownership，保留固定atlas缓存，正常释放每实例GL资源。加载失败显示原静态角色。缩小验收为相关runtime回归、Web构建、页面截图/关键入口和现有服务器发布脚本，不重复全站浏览器矩阵。

## 2026-09-11 用户纠偏：操作汇入Hermes对话

本节覆盖早期多阶段制作表单方案。保持已批准正文成果主屏+Hermes侧栏与冷白/青绿视觉，六栏目标题突出。主区提供直接编辑与真实媒体，附件、证据、历史按需展开；不得重新加入保存、提交、正文继续、选主张、选风格和制作/发布的重复按钮。

Hermes是操作入口：普通指令由模型理解，直接修改与对话修改共用草稿；保存与创建所需版本由内部回调完成。制作前清楚说明当前目标与费用，可回复“确认制作”；公开前说明具体版本、许可与已审媒体，可回复“确认公开发布”。待确认范围变化时原安排失效。素材审核在对话内显示真实对象/方案与编号并调用现有审批接口，不把生成成功当科学通过。失败原因与续办、任务回执和公开入口必须回到同一工作台，不能让用户返回旧表单补操作。
## 2026-09-11 — 成果优先的展示顺序（最新用户确认）

标题与一句话贡献之后，先展示总结性核心概念图及视频，再展示精炼六项正文；附件、证据、解析记录、版本历史合并为文末折叠资料，不能先于媒体。各区使用同一左边界与内容网格。空媒体需要稳定比例、简洁说明的占位；现有真实结果回传后原位替换。默认一张核心图，多图用HTML幻灯片按叙事顺序串联，首张保持核心图，不自动播放；公开只使用该发布版本允许的资产。

Hermes完整形象与固定对话输入保持，普通选择/制作/审核/发布经对话，不回退为步骤表单。详细生成指令只对AI充分展开，给用户的回复与六项正文保持凝练。设计实施读取项目安装的apple-design、emil-design-eng、design-artifact、html-prototype，并以frontend-design入口约束应用范围；第三方示例不覆盖用户已确认方向。

本轮用户明确授权服务器实际完成带图流程并由Codex代为科学审核、正确后发布；不是重新开放全仓测试/CI。视频生成和批量冷启动仍暂缓。
