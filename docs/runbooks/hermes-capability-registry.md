# Hermes Capability Registry

## 当前状态（2026-09-12）
- 生产应用d8de966f40ca2922956d7fe82858eb1f5cff6fab，rollbacke4bd57904b8cdbb0eb55dc19dd4cfb3fc6c8adb1；服务器网页生图provider d1630135、rollback92cc416e，路线未改。唯一任务接续入口[CURRENT handoff](../handoff/2026-09-10-hermes-web-image-handoff.md)。
- 生产用现有MiniMax-M3，不要求新API。Anthropic兼容接口显式adaptive thinking；分段16k/180s、整合32k/300s，temperature1/top_p.95。主机skills不自动注入产品，Worker必须显式加载。
- 真实任务62ae384d已完成，但旧最终自检仍产出长稿和过强表述，未采用/未发布。正常响应、来源编号存在、review_received均不等于科学正确。
- Chat6Pro已按用户明确授权完成开发诊断，/jobs/hermes-m3-actual-diagnosis-20260912.txt：最终步骤改为来源约束的短成稿，避免审稿schema/长候选锚定；不增加预算或更换供应商。生产不依赖Chat科学定稿。
- 已部署scientific-summary v1及统一创建/首条指令接续。真实final0e38446e使用M3 12083输入+7297输出，较旧最终步少51.83%，但多算例和科学限定仍不够，未采用。第二次Chat6Pro诊断已收到；当前v2候选让语义点连同条件/比较/操作对象进入final，旧候选与短文直接读P段bridge，正常长文map→semantic reduce→final，移除默认中间长稿调用。创建页布局/资料文案d8de966f已部署，208×208实测；淡化状态一行修复待同批发布。
- 新增“私有草稿+摘录→MiniMax写作”曾被自动审批拒绝，精确问题仍待用户答复。写作合同/来源/引用/排版指令仅准备，未接通；不能写成已部署。Chat开发材料外发已另获明确批准。
- 禁止测试/预检/CI/本机构建；保留必要服务器build/start及真实产品任务。变化后同步本台账、server-capabilities.md、索引。

| 顺序 | 能力 | 真实状态 / 后续 |
|---|---|---|
| 1 | 科学文档与公式 | Docling Serve1.30.0 + CodeFormulaV2缓存 + TeX/页/bbox + 安全KaTeX已部署；26页32式中28式可排版、4式损坏标低置信保留原文。两个代表式已对原页，不声称全部物理正确。 |
| 2 | 全文理解与凝练 | paper-analysis v7、research-understanding v6、critical-thinking v2及M3思考已接入。真实5窗口+reduce118秒、66观察/94段；最终成稿质量未过。scientific-summary v1已部署并只重跑final，19380 tokens；仍有语义过强和算例堆砌，质量未达标，原确认稿保留。 |
| 3 | 科学写作与引用 | 未接通。独立私有note/review/manuscript，真实SourceMap和程序引用；不挤六字段、不把文献实验当用户原创。scientific-writing.ts/citation-management.ts/scientific-writing-source.ts待调用授权与整合。 |
| 4 | 精美笔记/报告 | research-note-formatting运行时指令已准备、未加载；复用已安装前端设计与KaTeX，默认精炼、真实来源按需展开。Markdown/HTML及后续文档导出尚待接入。beautiful-notes没有唯一来源，不能冒名安装。 |
| 5 | 多格式附件 | XLSX/PPTX/HTML已接入上传/MIME/现有解析链；HTML资源和PPTX外链仅清洗派生副本，原件保留，PPTX媒体流式复制；archiver7.0.1复用，parser独立锁保留5项依赖。真实多样文件兼容尚未观察。没有另装OCR/浏览器。 |
| 6 | 艺术图片与视频 | 明确保留后续：不同画风、构图、视觉叙事、镜头/旁白、TTS/FFmpeg。先做好科学内容与写作，再按已讨论方案补齐；网页生图现有路线不变，视频和批量冷启动暂缓。 |

用户流程：一句话或附件开始同一私有研究 → Hermes后台理解/自动整理 → 用户少量修改/确认 → 图或视频 → 审核发布。主屏标题/贡献→核心媒体→六字段→文末资料；长笔记是独立产物。

## 来源与选择
- [K-Dense scientific-writing](https://github.com/K-Dense-AI/scientific-agent-skills/tree/main/skills/scientific-writing)、[critical-thinking](https://github.com/K-Dense-AI/scientific-agent-skills/tree/main/skills/scientific-critical-thinking)、[citation-management](https://github.com/K-Dense-AI/scientific-agent-skills/tree/main/skills/citation-management)：此前已核来源/MIT元数据，项目适配方法，工具映射现有Gateway/ScanSci/SourceMap，不复制额外供应商或逐条人工门禁。
- [Docling公式增强](https://docling-project.github.io/docling/usage/enrichments/)用于TeX识别；[KaTeX](https://katex.org/docs/options.html)只负责受限排版；两者不证明公式物理正确。
- [Microsoft MarkItDown](https://github.com/microsoft/markitdown)是转换工具，不是科学理解或公式校验器。已有Docling/结构化XLSX先复用；只为实际格式缺口增加依赖，不装all整包。
- [Pandoc](https://pandoc.org/MANUAL.html)只在具体导出需要时补齐；未安装/未接通状态不写成可用。

以下为既有能力与历史部署记录；涉及当前版本/质量的判断以上文及CURRENT handoff为准。

## 1. Purpose
- 后续实时观察：fd719902服务器网页生图成功并回传，读取时已approved；FWHMₛ图示方向/含义仍需修正，不能以运输或批准状态代替科学质量。用户已指定第二账号；正常退出旧账号、Google OAuth两个必要精确域已放行，随后已完成用户身份验证（见本页最新更新）。自动跨账号轮换尚未实现，也不承诺轮换免限额。旧3814f844限额不得扩展为当前生图能力不可用。

2026-09-11 production f909c3a4：workspace-guide/Gateway显式对话改稿已实际用于当前论文，单字段修改、正文同步、撤销及确认版本已观察成功。首次JSON/schema失败已修复提示与纠错反馈；旧commit/live SDF衔接与继承全降级已修复，v3保存刷新一致。请求绑定RO/草稿范围/版本，正式写入走原API；无新服务、模型或插件。单图方案经Hermes修订批准，新图片任务3814f844明确网页rate limit，未发布；不能据共编成功声称整个发布流程已完成。Chat6Pro规划已收到，追加复核限流；Sol medium实现、Sol high复核完成。

本台账防止 Hermes 能力在后续迭代中被重复安装、遗忘、误判或污染服务器。新增、升级、启用、停用、替换或删除任何 Skill、MCP、模型、parser、provider 或运行容器时，必须同步本文件与 `project_index.md`。

状态定义：

- `PRODUCTION`：生产已运行并有验收证据。
- `AVAILABLE_LOCAL`：本机已挂载或可调用，不代表生产可用。
- `APPROVED_PILOT`：用户已批准评测/安装，尚未进入生产。
- `BLOCKED`：存在凭据、额度、授权、安全或性能阻断。
- `PATTERN_ONLY`：只参考工作流，不复制或安装。
- `REJECTED`：已明确不适用于当前基础设施。

## 2. Capability table

| Capability | Purpose | Current state | Auth/cost policy | Runtime/install boundary | Retention gate |
|---|---|---|---|---|---|
| Existing `document-parser` sidecar | PDF/DOCX/OCR isolation | `PRODUCTION` | 无外部 API | release `b32d81c…`；无网络/Secret、只读、非 root、512 MiB/64 PID、bounded IPC | schema 3：14/2/0/0、false-ready 0、successful locator 26/26；exact report `6b2f1ead…087d3` |
| Tesseract `eng+chi_sim` | 扫描页 OCR fallback | `PRODUCTION` | 免费、本地 CPU | release `abd38d3…`；仅 parser 镜像；禁止宿主全局安装 | canonical scan 的 text、跨 block locator、Tesseract 5.3.0、confidence、bbox 全通过 |
| ClamAV | 上传文件恶意内容扫描 | `PRODUCTION` | 免费、本地 CPU | agent-worker/隔离边界；fail-closed | signature freshness、blocked path、资源峰值 |
| MiniMax text/vision | LLM OCR、复杂表格/公式补救 | `APPROVED_PILOT / BLOCKED` | 自动平台处理；最少页；凭据已在聊天暴露，轮换前不得调用 vision | 仅 AI Gateway；`openscience-ocr-v1` route 已实现但默认 disabled + external-policy deny；生产 worker 当前有变量注入，文档不记录值 | locator 复验、页成本、数据外发、错误率、审计 |
| MiniMax image/video | 代表性 RO 展示资产 | `APPROVED_PILOT / BLOCKED` | 仅管理员；逐项批准公开；凭据轮换前阻断 | 外部 API，经 AI Gateway；不在 CPU 服务器部署模型 | 科学真实性、成本、prompt/source provenance、可撤回 |
| ChatGPT web image/science review | 内容驱动生图与原PDF独立科学复核 | `PRODUCTION` | 使用已授权服务器浏览器会话；不计入Codex调用；精确canonical续取、禁止重发，最终确认仍由用户完成 | 当前release/provider `4b4e365c…`；图片与科学审阅独立锁；附件仅经受限OpenAI域名；科学审阅1800秒、持锁期间15秒heartbeat；science-v4合同 | 已回传真实PNG；Deep-sub-cycle task `1e324308…` / attempt `6cc0a17c…`六字段非空、无补证。候选可按SourceMap复用，网页答复仍要求候选hash+合同版本完全相同 |
| Tavily MCP/API | 通用网页发现 | `PRODUCTION / BLOCKED` | 生产 Secret 已注入；四个授权 key 的最小探测均返回供应商套餐/单 key 额度耗尽 | `source.retrieve` discovery-only adapter；不得成为唯一来源 | quota 恢复前稳定 `unavailable/rate_limited`；source precision、成本、隐私 |
| Semantic Scholar MCP/API | 论文、作者、引用关系 | `PRODUCTION` | 有效 Secret 由既有本地 Secret 安全注入；真实 Hermes 任务返回 3 sources，连续请求仍可能 429 | `source.retrieve` native-fetch adapter；provider schema 不越过 Domain | metadata/OA/rights accuracy、1 req/s、429 显式降级 |
| ScanSci PDF | 全文发现/下载 | `PRODUCTION` | 官方 MCP；浙江大学认证作为平台持久 session；管理员在普通浏览器认证后以官方 `cookie_import` 导入，不部署第二 browser/auth 服务。官方来源策略默认不覆盖，17 tools 均保留 | release `b32d81c…` / rollback `0aaf52f…`；`scansci-pdf==1.13.1`，CPU-only、固定 Squid、持久 `scansci-data`、瞬态 `scansci-papers` | MCP 版本/17 tools/Worker、24,671,920-byte OA、1,873,303-byte ZJU subscription-only Nature、四入口、72h/600s/one-use 全通过；ScienceDirect 等待官方 entitlement |
| Temporary document lifecycle | 受控全文缓存与下载 | `PRODUCTION` | 无用户模式切换；逐来源 rights 决定 | SeaweedFS `hermes-cache/<workspace>/<document>/<hash>`；72h、600s HttpOnly one-use capability、Worker lease/fence GC | 真实 24,671,920-byte PDF：retention 71.995h、signed link 599.48s、download hash exact、replay 404 |
| BGE-M3 | 多语 dense embedding | `PRODUCTION` | MIT；无 API 费，运营成本为 CPU/内存/磁盘 | 独立 internal-only `embedding-worker`；exact revision/hash、只读 versioned volume、2 CPU/6 GiB/128 PID | nDCG@10 `0.996655`、Recall@10 `1`、P95 `240 ms`、peak RSS `2,244,235,264` bytes |
| PostgreSQL lexical search | 无模型词法基线与降级 | `PRODUCTION` | PostgreSQL 内置 FTS；无新增 extension/API 费 | `packages/search` + 独立 `SEARCH_DATABASE_URL`/迁移/连接池 | tenant-safe BM25、migration/restore、embedding outage 降级通过 |
| Docling Serve | PDF布局/表格/来源与公式增强 | `PRODUCTION` | CPU镜像v1.30.0固定digest；CodeFormulaV2只读缓存已接入 | `paper-analysis`只读6CPU/8GiB，parser_net；Node经DOCLING_SERVE_URL异步调用，保留页码/bbox；公式增强true | 真实26页/32公式，4条坏式须区分处理；运行正常不能证明所有公式正确。旧wheel试验保持HISTORICAL |
| LiteParse | bbox/layout parser 候选 | `APPROVED_PILOT` | Apache-2.0；npm `2.14.0` 与 Linux x64 包已锁定 | 独立 parser candidate image；ECS evidence only，未进生产 Compose | 5/7 ready、13/16 locator、P95 163 ms、peak RSS 61,300,736 bytes；优于 measured current 7/16，但 Docling 尚无可比结果 |
| GROBID | 学术元数据、章节、引用解析 | `APPROVED_PILOT` | 开源、本地 CPU；exact license/model terms 仍待 digest 后复核 | provider-neutral TEI adapter 已完成；`0.9.1-crf` 单次 ECS pull 在 180s cutoff 前未取得 digest，未进 Compose | 无质量/P50/P95/RSS 结果；pull 失败不得推断能力，fallback 固定保留 layout map |
| PaddleOCR | 复杂中英扫描 OCR 候选 | `APPROVED_PILOT` | Apache-2.0 package `3.7.0`/SHA-256 `c0f0a81a…d338` 已锁定；模型条款/hash 未取得 | 独立 CPU candidate image/model volume；`libgomp1` 已修复，corrected exact ECS build 在依赖下载阶段 bounded cutoff，未产出 image | 无 OCR 质量结果；corrected Tesseract baseline 为 2/2 locator、419 ms、candidate-wide RSS 141,406,208 B |
| Deterministic SVG chart | Claim graph、流程与方法图 | `PRODUCTION` | 免费；普通用户受任务资源配额 | Worker 确定性 renderer → content-addressed object storage | production replay SHA `8d5f8f23…c640`；同版本 verified Claims、审批、公开与 `presentation_not_evidence` 通过 |
| Interactive HTML | 真实 Claim/Evidence/条件/限制交互 | `PRODUCTION` | 免费；普通用户受任务资源配额 | Worker 受控 renderer；无 script、无网络；对象存储 attachment | production replay SHA `b20f83cc…1198`；2090 bytes、public 200、CSP/标签通过 |
| Existing science-worker | Notebook/科学计算与产物收集 | `PRODUCTION` | 平台配额 | 无网络/Secret、非 root 沙箱，产物经 collector | AST policy、资源限额、artifact provenance |
| `beautiful-notes` workflow | 长文结构与笔记呈现参考 | `PATTERN_ONLY` | 不自动复制第三方 Skill | 只抽取可验证工作流模式；安装前审许可证与输入输出 | 对 RO 阅读质量的可测提升，否则不保留 |
| `humanizer` workflow | 减少机械生成文风参考 | `PATTERN_ONLY` | 不允许改写 exact quote | 只可处理说明/摘要，不触碰 Evidence 原文 | 事实保持、引用不变、语言质量人工盲评 |
| `bishe-guider` workflow | 学生/毕业研究引导参考 | `PATTERN_ONLY` | 身份静默路由给 student，不成为显式模式 | 只参考任务分解模式 | 对学生任务完成率的增益与错误建议率 |
| 本地 GPU 生图/视频栈 | 生成式展示 | `REJECTED` | ECS 无 GPU 预算 | 禁止安装 Stable Diffusion/ComfyUI/Wan 等服务 | 基础设施改变前不得重开 |

### 2.1 Approved-pilot evaluation ownership

历史说明：下表旧Docling wheel `2.123.0`候选的构建失败属于HISTORICAL，已由上表生产Docling Serve路径取代，不得据此再次安装主解析器。其余候选的历史结果不因Docling上线而转成当前部署或新的测试任务。

本表与上表所有 `APPROVED_PILOT` 行必须一一对应。`UNLOCKED` 是阻止生产启用的显式状态，不是待填占位；只有完成精确版本/摘要和许可证复核后才可变化。

| Candidate | Owner | License/source terms | Version/digest | CPU/RSS boundary | Latency/throughput | Cost boundary | Data flow | Evaluation | Kill switch | Rollback |
|---|---|---|---|---|---|---|---|---|---|---|
| MiniMax text/vision | Hermes AI Gateway owner | Official Coding Plan VLM HTTP transport reviewed；provider terms/data policy must be rechecked before enable | Gateway contract `openscience-ocr-v1`；underlying provider model `UNLOCKED`，credential rotation blocks canary | External compute；adapter stays inside existing worker budget；internal cap 4 pages/4 MiB each/8 MiB aggregate | One page per attempt；attempt/total latency and error code audited | Versioned integer micro-USD estimate；unknown billing is explicit null；no unbounded retry | Authorized selected raster page bytes → AI Gateway → `/v1/coding_plan/vlm`；candidate text returns；no URL/full document | OCR/table/formula fidelity、page cost、audit completeness、locator revalidation | `MINIMAX_VISION_ENABLED=false` default；async provider policy；`AI_DISABLED_PROVIDERS=minimax-vision` | Disable route/policy；local parser and explicit review remain available；revert adapter release |
| MiniMax image/video | RO presentation owner | Provider terms plus generated-media disclosure required | `UNLOCKED`; credential rotation and model ID pin required | External compute；no GPU or model on ECS | Async admin job；queue and generation P95 recorded before use | Administrator-only capped showcase budget | Approved representative RO summary → provider；asset → object storage | Scientific fidelity、provenance、cost、removal drill | Media-generation admin flag | Disable generation；unpublish generated asset while RO evidence remains |
| Docling | Document intelligence owner | MIT upstream release；bundled model terms/hash manifest required before retention | wheel `2.123.0`/SHA-256 `95c0a4d…fde9c`；official CPU `torch 2.13.0+cpu`/`torchvision 0.28.0+cpu`；exact `e50a560…` build stopped at model download (`Errno 99`)，image digest pending | Isolated 2 CPU/2 GiB/64 PID image；non-root/read-only/network none；OCR/remote/plugin disabled；build/preflight reject GPU packages | No corpus latency result；network/model download failure is not a quality result | No API fee；failed build resources removed | Read-only self-authored corpus intended → isolated candidate → 64 KiB content-free attached outcome；execution not reached | Package install passed；model acquisition failed before aggregate lock/preflight/cases；no fidelity/RSS inference | Parser route weight zero；exact failed container/staging/image count 0 | Keep `APPROVED_PILOT`；production unchanged；repeat only with a bounded, source/model-equivalent download path |
| LiteParse | Document intelligence owner | Apache-2.0 upstream npm package；transitive lock retained for review | npm `2.14.0`，integrity `sha512-lIFB…ThWA==`；exact-SHA ECS image `sha256:352cf5d985c7fbf11e936c12e8878fc83bee6e08bb3a0fb4fe53c5e1d34c5601` | 2 CPU、2 GiB/64 PID、non-root/read-only/network none；observed peak RSS `61,300,736` bytes | 7-PDF P50 `8 ms`、P95 `163 ms`；5 succeeded/1 needs review/1 failed | No API fee；candidate image/eval storage only；exact resources removed after evidence | Read-only self-authored corpus → isolated candidate → 64 KiB content-free attached outcome；OCR disabled | 13/16 locators versus measured current 7/16；native/dual/table/formula/references exact，scan correctly needs review，corrupt fails；P95/RSS within gate | No production route；ephemeral containers；120s timeout；overflow fail-closed | Remains `APPROVED_PILOT` pending Docling result；not in active release `c581712…` |
| GROBID | Scholarly metadata owner | Exact upstream release license and bundled model terms required | adapter `85ba051…`；requested tag `0.9.1-crf`，180s ECS pull cutoff 前 digest unresolved | Intended internal-only 2 CPU/4 GiB/256 PID/read-only/no-port gate；container 未启动，故 topology/RSS 均未宣称 | No latency/throughput result；request stage not reached | No API fee；exact eval root/container/network/new image cleaned to 0 | Self-authored references + bounded scholarly PDFs staged；provider request not reached | No heading/reference fidelity or resource inference；Domain adapter/fallback `20/20` GREEN | No production route or Compose service；fixed stage returns layout map | Keep `APPROVED_PILOT`；production unchanged；repeat only as a new bounded exact-digest evaluation |
| PaddleOCR | Document intelligence owner | Apache-2.0 wheel `3.7.0` locked；OCR model terms/hash manifest still required | wheel SHA-256 `c0f0a81a…d338`；CPU PaddlePaddle `3.3.1` and Debian `libgomp1` installed in corrected exact `7ea900d…` build；no image/model digest because dependency acquisition reached bounded cutoff | Intended 2 CPU/2 GiB/64 PID、non-root/read-only/network none；execution not reached | No Paddle latency result；corrected Tesseract baseline is 419 ms on selected scan | No API fee；exact build container/intermediates/eval root removed | Selected scan PDF intended → isolated OCR → locator revalidation；model acquisition not reached | Build stopped at PaddleOCR/PaddleX dependency download before model lock/preflight；no quality inference or Paddle/Tesseract comparison | No production route；candidate image absent | Keep `APPROVED_PILOT`；current Tesseract fallback remains production |

## 3. Current credential and runtime truth

2026-09-02 只记录目标进程注入状态与最小健康探测，未输出任何值：

| Layer | MiniMax | Tavily | Semantic Scholar | ScanSci |
|---|---|---|---|---|
| Current local process | 未注入 | 未注入；本地 Secret 文件有四个授权 key，均额度耗尽 | 未注入；既有项目 Secret 有一份有效 key | 未读取/未注入；仅完成 code/contract gate |
| Current user environment | 未注入 | 未注入 | 未注入 | 未注入 |
| Production `agent-worker` | 已注入 | 已注入；供应商额度耗尽 | 已注入；真实任务成功，连续请求可被 429 节流 | `b32d81c…` 运行 official MCP client；17 tools、持久 cookie、OA/机构 PDF、四入口和 lifecycle 已生产验收 |

“仓库或服务器 `.env` 中存在”不等于“目标进程已注入”。以后排障按四层分别记录：配置文件变量存在性、Compose 映射、容器环境存在性、provider 最小健康探测。任一层失败都不得笼统写成“API key 失败”。

用户在聊天中提供的 MiniMax 与 Semantic Scholar 明文仍视为已暴露，未作为部署来源。Task 10 使用既有本地 Secret 文件中的有效 Semantic Scholar key，并通过 stdin 原子写入生产 Secret；Tavily 同样从本地 Secret 注入。后续固定按“只检查存在性 → 最小健康探测 → 记录日期/状态”操作，不把值写入仓库、命令或日志。

## 4. Installation and directory policy

### 4.1 Repository

- Node：根 `devDependencies` 或对应 workspace package，使用 `npx pnpm@9.15.0`，提交 lockfile。
- Python 评测：项目 `.venv` 或 `uvx`；`.venv`、缓存和模型权重必须 gitignored。
- Production：固定版本和 digest 的独立容器；禁止 `pip install`/`npm install -g` 到宿主机。
- Skill/MCP：项目级配置优先；登记来源 repo、commit/tag、license、入口与需要的变量名。

### 4.2 Server

允许的持久位置：

- 应用 release：`/opt/openscience-releases/<sha>`，不可写。
- 稳定配置：`/opt/openscience/.env.prod` 或后续 Secret manager，只保存于服务器。
- 模型：版本化只读 Docker named volume，例如 `embedding-models-v1`、`parser-models-v1`。
- 临时文档：独立 object-storage prefix/volume `hermes-cache/<workspace>/<job>`，带 TTL 与容量配额。
- 任务 IPC：现有 bounded `parser-jobs` tmpfs 或专用 bounded queue/volume。

禁止位置：应用源码目录、release tree、用户 HOME、`/usr/local`、应用容器 rootfs、未命名临时目录。

### 4.3 Cleanup

- PDF/OCR page cache：默认 72 小时。
- Signed download URL：10 分钟。
- 失败任务临时输入：任务终态后最多 24 小时，安全事件可按审计政策延长但不得向用户提供下载。
- Embedding/model：不按 TTL 清理，只按版本退役；退役前保留上一个健康版本和索引可重建证明。
- 永久保留：内容哈希、来源 URL、rights decision、Claim/Evidence locator、parser/model 版本、审计与用户确认记录。

清理必须由可观测 job 完成，记录 scanned/deleted/skipped/bytes/failures；禁止用未校验路径的递归删除命令。

## 5. Evaluation matrix

每个候选使用相同 golden corpus，与当前生产基线比较：

| Axis | Required evidence |
|---|---|
| Claim quality | 双盲人工 precision、漏失与重复 Claim |
| Evidence fidelity | exact quote round-trip、page/bbox 命中率、反证识别 |
| Document coverage | native/scanned/double-column/table/formula/reference/zh-en |
| Interest relevance | identity + current goal 的 top-k 相关性与可解释理由 |
| Performance | P50/P95、CPU、RSS、磁盘、冷启动、队列吞吐 |
| Cost | 每文档/API 页/媒体资产成本与额度行为 |
| Reliability | timeout、rate limit、partial result、retry、provider outage |
| Security/privacy | data destination、Secret scope、network、CSP/XSS、malware boundary |
| Operations | healthcheck、metrics、kill switch、rollback、index rebuild |
| Licensing | source license、model/data restrictions、学校访问和再分发边界 |

保留条件：质量在关键轴优于现有基线，或以显著更低资源达到同等质量；且无未缓解的安全/许可问题。否则停用并记录原因，不因已经安装而保留。

2026-08-26 Foundation 当时仅建立 `BASELINE_ONLY`。截至 2026-09-05，CPU parser cascade/Tesseract、BGE-M3、PostgreSQL lexical search、official ScanSci MCP、deterministic SVG 与 interactive HTML 已通过 exact-SHA ECS 评测、隔离部署、降级/恢复或真实生产门禁升为 `PRODUCTION`；ScanSci 官方 cookie import、持久 session、OA 与 subscription-only Nature PDF 均已通过。Docling、LiteParse、GROBID、PaddleOCR 仍为 `APPROVED_PILOT`，MiniMax OCR 继续 `BLOCKED`。现行 16-case parser 为 14 succeeded / 2 intentional needs_review / 0 failed / 0 false-ready，因此不再为“软件齐全”重试 Docling；只有真实用户文档暴露可归因的双栏、公式或表格缺口时，才以同一 ECS CPU/model/RSS/quality gate 重开评估。

## 6. Change record template

每次能力变更在本节顶部追加一行：

| Date | Capability | From → To | Version/digest | Evidence | Rollback | Operator |
|---|---|---|---|---|---|---|
| 2026-09-05 | Hermes Tasks 10–12 full closeout | 9/12 candidate → `PRODUCTION 12/12` | release `b32d81c…`；aggregate `1ca3b0e1…08f2`；official ScanSci `1.13.1` | Parser 14/2/0/0 + locator 26/26；BGE live hybrid/fallback + P95 240 ms；OA/institution/four-entry/72h/600s；SVG/HTML replay；fresh 2.2 MB upload/parser/review/publish/public journey `OSR-2026-000021`；core/search 36/2 | rollback `0aaf52f…`；retain active/rollback, ScanSci session, model/data/backup/cache；exact stale resources removed | Codex |
| 2026-09-03 | ScanSci official-only final release and hygiene | upstream-only active / legacy rollback → upstream-only active+rollback | release `80db41e…`；upstream `1.13.1`；PR #50 | CI `33653209566`；core/search 34/2；Parser/BGE；17 tools、Worker MCP、real OA、public CAS；38 acceptance/5 eval/anonymous container/dangling/cache cleaned；old runtime counters 0 | rollback `761b93d…`；disk 50G/148G，保留 `scansci-data`/`scansci-papers` 和产品数据 | Codex |
| 2026-09-02 | ScanSci official MCP production + auth bridge | OA production / institutional pending | release `7daff3f…`；upstream `1.13.1` | CI `33606675500`；core/search 34/2；17 tools、Worker OA、exact Parser report/BGE/public/bridge green | rollback `ab290579…`；保留 `scansci-data`；ZJU Cookie pending | Codex |
| 2026-09-02 | ScanSci official MCP candidate review closeout | review with 5 Important → local fixed candidate | code `336955e…`；prior ECS MCP image `sha256:551684a7…e4570e8`；upstream `1.13.1` | auth-only network、schema-5 next deploy、durable ack/upload-failure retention、real MCP health/child supervision、providerVersion evidence focused gates green；prior real ECS OA evidence retained，new image pending | production unchanged `405b85a…` / `09093e7…`；old implementation retained until acceptance | Codex |
| 2026-09-02 | ScanSci ZJU/CARSI return gate | false publisher return → deployed fail-closed gate / credential blocked | PR #38 merge/release `405b85a…`；upstream unchanged | CI `33550018143`；ScanSci `174/11/0`；schema-v3 Parser、core/search、BGE CPU、OA/public green；ZJU CAS rejects supplied credential | immutable `09093e7…`；auth helper/eval exact-cleaned；session stays `auth_required` | Codex |
| 2026-09-01 | ScanSci strict browser release integration | Task 3D local → Task 4 local READY | `8c35179`；production unchanged `2019f8a…` | browser_net/proxy-only firewall、boot fail-closed、fsync exact Squid preimage、schema3/4 recovery；Task 4 `69/5/0`、release `111/7/0`；三路 review READY | no deployment；production/rollback `2019f8a…` / `9eeb8d5…` | Codex |
| 2026-08-31 | ScanSci controlled-proxy production | Task 10 ECS pending → `PRODUCTION OA / CARSI PILOT` | release `abd38d3…`；legal `sha256:c3466317…5aaa`；auth `sha256:248fd663…a579` | CI `33397550370`；Parser 16-case；core/search 33/2；BGE CPU；source/topology/policy/token/session；Worker OA `%PDF-` 24,671,920 bytes | immutable rollback `6893318…`；disable adapter/CARSI；retain provenance | Codex |
| 2026-08-31 | ScanSci Task 9 final whole-branch review | fresh-tmpfs gated → first-deploy review-ready | `672ec14`；upstream archive unchanged | prepublication exact SHA/image IDs without sidecar；actual Worker env attestation；locked publish + canonical verify；behavioral before/after rollback；infra `74/79`；release `95/102`；full local `2115/22/0` | no deployment；candidate sidecar exact-cleaned；previous release uses own Compose/verifier | Codex |
| 2026-08-31 | ScanSci Task 9 review fix 4 | common-entry gated → fresh-tmpfs gated | `755b7b5`；upstream archive unchanged | verifier exact `/tmp`；absent hidden-subdir/no-file/no-upstream probe；acquisition config still required；ScanSci `82/89`；infra `72/77`；full local `2114/22/0` | no deployment；acquisition/resource/image identity unchanged | Codex |
| 2026-08-31 | ScanSci Task 9 review fix 3 | cache/file-limit gated → common-entry gated | `63a0b56`；upstream archive unchanged | acquisition/probe share unconditional install+read-back prelude；probe has no upstream/Secret/direct-installer path；ScanSci `81/88`；infra `72/77`；full local `2113/22/0` | no deployment；runtime/resource/image identity unchanged | Codex |
| 2026-08-31 | ScanSci Task 9 review fix 2 | review-ready local gated → cache/file-limit gated | `36f985c`；shared max 104857600 | negative cache cross-invocation；EFBIG cleanup/continue；exact-temp rename；runtime `FILE_LIMIT_OK`；ScanSci `80/86`；full local `2112/21/0` | no deployment；post-check retained as defense; prior SHA/resource identity unchanged | Codex |
| 2026-08-31 | ScanSci Task 9 review fix 1 | local gated → review-ready local gated | `2560bd8`；upstream archive unchanged | NAT64/transition literals；behavioral serial max concurrency 1/no executor/cleanup；ScanSci `75/80`；infra `71/76`；full `2107/20/0` | no deployment；previous release Compose/verifier owns old tmpfs；exact SHA rollback unchanged | Codex |
| 2026-08-30 | ScanSci default literature acquisition | approved design → local Task 9 gated | fixes `4f6361e` + `cfc0ddc`；upstream commit/archive pinned；image IDs ECS pending | forbidden matches 33 all negative；Knip/dep/deps；build/typecheck/integration compile；full test `2105 pass / 20 skip / 0 fail`；open P0/P1 0 | no deployment；production remains `6893318…`/`c435c4c…`；Task 10 may disable `SCANSCI_ENABLED` or restore exact prior SHA | Codex |
| 2026-08-29 | Task 7 identity-aware Hermes routing | candidate → `PRODUCTION` | release `5e5ae36…`；rollback `6cabe422…`；core/search `30/30` / `2/2` | CI `33246701963`；公网 signup/profile、两次真实 MiniMax guide、signal correction、InterestContext version 1→2/`accepted_history`、logout 与 exact cleanup GREEN | immutable rollback `6cabe422…`；profile/context columns rollback SQL only；no visible mode switch | Codex |
| 2026-08-29 | Task 4 final source-safety deployment | schema-v3 14/2 profile retained → final reviewed production | source/release `6cabe422…`；Worker `sha256:11f36807…951a02`；Parser `sha256:4e4819ec…c70d8` | CI `33240457443` / job `99068791412` success 11m10s；14/2/0/0，gateway 14/0/0，26 locators/3 table-cell，runtime/core 29/29/search 2/2/BGE/backups 7/markers GREEN；source review READY 0/0/0 | immutable rollback `28a3d5c…`；no migration；Vision disabled；no cleanup | Codex |
| 2026-08-29 | Task 4 parser acceptance debt closeout | 10/6 baseline → schema-v3 14/2 production profile | source/release `28a3d5c…`；Worker `sha256:35191f65…5ec5aa`；Parser `sha256:aed451e9…577dbe` | CI `33235948918`；ECS `hermes-parser-14-2-v1` 14/2/0/0；structured fake 14/external 0；formal locator/runtime/core 29/29/search 2/2/BGE/public/journal GREEN | immutable rollback `c581712…`；Vision disabled；failed `63eb…`/`9e9…` objects retained pending exact whitelist approval | Codex |
| 2026-08-29 | Task 4 CPU parser cascade / Tesseract | candidate → `PRODUCTION` | source/release `c581712…`；Worker `sha256:ae98ea5f…cbe8`；Parser `sha256:0ac86bfc…d902` | CI `33221760698`；ECS 16-case 10/6/0/0、P50/P95 151.9/1255.32 ms；formal contract、isolated/production startup、core 29/29、search 2/2、BGE/public/journal GREEN | immutable rollback `e2c0eaf…`；Vision disabled；failed generations exact-cleaned to 0 | Codex |
| 2026-08-28 | Task 5 selected-page local OCR cascade | production Tesseract route unchanged; new code pending ECS runtime | code `622cc24`；Tesseract `5.3.0` metadata；production remains `e2c0eaf…` | independent Ready/no findings；focused `75/75`、ECS exact-SHA full build GREEN；final image build bounded cutoff before packaged scan/CPU responsiveness，exact candidate cleanup `FINAL_ECS_ATTEMPT_CLEAN` | no deployment；retain current production parser and explicit review/LLM fallback policy | Codex |
| 2026-08-28 | Task 4 normalized layout + GROBID adapter | GROBID pilot unchanged | adapter `85ba051…`；requested `grobid/grobid:0.9.1-crf`，digest unresolved | adapter focused `20/20` + independent review；single ECS pull hit 180s cutoff before container/quality/RSS；exact cleanup containers/networks/root/new image = 0 | no concrete layout/GROBID route；no Compose change；return non-enriched layout map | Codex |
| 2026-08-28 | Task 1 specification-review correction | pilots unchanged | corrections `4eabdf7…` + archive sync `7ea900d…`；production parser `e2c0eaf…`/image `sha256:88da362b…5606` | release-tree sources refused；NumPy Paddle normalization、bottom-left OCR Y、candidate-wide cgroup RSS GREEN；corrected current 7/16、96/241 ms、104,456,192 B；Tesseract 2/2、419 ms、141,406,208 B；Paddle corrected build bounded cutoff before model/preflight/scan；exact cleanup 0/0 | no production route/Compose/release-tree mutation；active release remains `e2c0eaf…` | Codex |
| 2026-08-28 | Task 1 parser bake-off (HISTORICAL / OCR evidence superseded by row above) | pilots unchanged | harness `04178b4…`；production parser `e2c0eaf…`/image `sha256:88da362b…5606`；LiteParse image `sha256:352cf5d9…5601` | initial current/Tesseract geometry and self-RSS values are not acceptance evidence；LiteParse 13/16、8/163 ms、61,300,736 B remains valid；Docling model download `Errno 99` and initial Paddle native-runtime failure have no quality inference；exact cleanup counts 0 | no production route/Compose mutation；active release remains `e2c0eaf…` | Codex |
| 2026-08-28 | BGE-M3 hybrid retrieval | `APPROVED_PILOT` → `PRODUCTION` | revision `5617a9f…b181`；model manifest `08cc5a6…78e4`；image `sha256:137352df…0a3e`；release `8163f8b…` | exact-SHA ECS nDCG/Recall/P95/RSS pass；internal-only CPU isolation；lexical outage fallback/recovery；search migration `2/2`；dual-DB restore | disable `BGE_M3_ENABLED` for lexical-only or deploy `f9659668…` | Codex |
| 2026-08-27 | Docling evaluation candidate | untracked → source-locked pilot | official wheel `2.123.0`/MIT；SHA-256 `95c0a4d…fde9c`；official CPU `torch 2.13.0+cpu`/`torchvision 0.28.0+cpu`；image digest pending | local runner `3/3`、worker `14/14`、Bash GREEN；ECS caught invalid wheel filename then default CUDA dependency before corpus；CPU lock now requires build/preflight `gpuPackageCount=0` | keep `APPROVED_PILOT`; no production route/Compose change | Codex |
| 2026-08-27 | MiniMax LLM OCR Gateway route | absent → deployed/default disabled | `openscience-ocr-v1`；release `f965966`；provider model unresolved | mocked route、strict image/input/result bounds、policy/kill-switch、redacted audit、ECS `AI_GATEWAY_OCR_CONTRACT_OK`；no paid call | keep vision disabled and external policy deny；rollback `ef043eb` | Codex |
| 2026-08-27 | LiteParse evaluation harness | untracked → source-locked evaluated pilot | npm `2.14.0` / Apache-2.0；image `sha256:b2c9bf96…eaa60f` | exact-SHA ECS 7-PDF：5 succeeded/1 review/1 failed、13/16 locator、P50 8 ms/P95 163 ms、peak RSS 61,599,744 bytes；timeout/overflow fail-closed且无残留 | keep `APPROVED_PILOT`; compare Docling/current before retention | Codex |
| 2026-08-26 | Current parser benchmark | unmeasured → `BASELINE_ONLY` | corpus schema 1 / 13 self-authored hashes + locators | recorded local run: 7 ready、6 expected-text matched、6 explicit review；image-only PDF 的页分隔符造成 1 项 false-ready；P50 0.03 ms、P95 226.09 ms、max RSS delta 28,672 B；deterministic facts repeat stable | delete ignored report and revert benchmark commits；production unchanged | Codex |
| 2026-08-26 | Registry baseline | untracked → registered | docs-only | local/process/container existence checks; Taskmaster alignment | revert docs commit | Codex |

禁止把 key、cookie、学校账号、容器完整环境或认证响应写入 Evidence 栏。

## 7. Windows SSH preflight

服务器能力核验和安装只能从 PowerShell 显式调用 Git Bash：

```powershell
& 'C:\Program Files\Git\bin\bash.exe' ./infra/scripts/checkup.sh
& 'C:\Program Files\Git\bin\bash.exe' ./infra/scripts/ssh-run.sh '<read-only command>'
```

日志出现 `wsl: Failed to translate` 代表误用了 WSL，不代表 SSH key 失效。详细根因与禁令见 `docs/runbooks/deployment.md` §1.1。

## CURRENT 2026-09-11 — Chat网页图解与产品回传
- production9b97522f/providerf4832487：Deep-sub-cycle来源及方案已确认，两张1280×720 PNG已由Hermes/chatgpt-web入产品draft，尚缺四个场景；原会话明确USAGE_LIMIT。没有切换API或重跑全文分析。已通过产品入口单次继续五个未完成场景，POST202/run version8；五项在网页提交前失败后，provider已修正图片模式误要求6Pro文本的条件。真实产品单图8b0ca4c9成功回传并自动展示，原批量run仍failed/version9。
- 原图有内部制作指令外露，不能精选发布。已部署prompt把内部规则与可见标签分开，支持注明非按比例的概念图；新scene0未见原图的重复禁止文案，但科学细节仍需审核；旧scene4仍保留draft。
- 继续使用既有API、队列、版本/权限和人工审核；未来真实并发增长后再引入API生图，不扩建恢复框架。
