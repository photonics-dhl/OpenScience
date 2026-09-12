# Hermes / Workbench CURRENT Handoff

- 2026-09-12 最新纠正：生产继续使用现有 MiniMax-M3，不要求额外强模型 API。官方 Anthropic 文档明确 M3 默认 thinking 关闭；当前适配器未传 thinking，structured 固定4096、超时60s。不能将此前错误直接归因于模型能力。候选已接入科学阶段 adaptive、16k/32k预算、180/300s超时及截断不重放；尚待部署和实际结果。Chat只作开发诊断，网页生产硬依赖尚待替换，绝不把已知错误放行。

## 目标与执行约束
- 最新用户追问“科学定稿交给6Pro是什么意思，会不稳定”：已澄清本次开发辅助复核不能等同于长期生产依赖。现有extractor确实强依赖网页科学复核，网页故障可阻断；生产路由需重新讨论，暂停扩展该硬依赖，不得直接撤掉复核后放行已知有错的MiniMax结果。已明确的网页生图方案不受此讨论自动改变。
- 已部署f2889c86的旧参数结果不作科学成稿。Chat最终综合已保存/jobs/hermes-stage2-chat-final-20260912.json，仅作开发校准；生产路线以本页最新MiniMax决定为准。
- 用户2026-09-12批准逐项实施。第1项CodeFormulaV2/TeX/KaTeX已接入；真实26页/32公式中28式可排版、4式损坏。统一创建/持续对话、科学写作/引用、精美输出与媒体风格仍按顺序继续，不能冒称全部完成。
- 主屏顺序：贡献 → 核心概念图/可选视频 → 凝练六字段 → 文末资料。Hermes对话为主要操作入口；不恢复冗余制作表单。
- 本机只编辑/静态阅读/传输；禁止测试、预检、CI、本机构建。只做服务器部署必要build/start及授权真实产品操作；视频和批量冷启动暂停。
- 工作树 E:/Miscellaneous/XGS/.worktrees/onchip-video-release；branch codex/onchip-video-release。根目录无关脏文件不碰。
- Read first：docs/OpenScience_Kimi_Development_Spec.md、docs/specs/2026-09-05-integrated-research-product-design.md、docs/runbooks/server-capabilities.md。

## 精确版本
- 应用源码提交 / ECS release：f2889c867826c30ceb72c6172f8b7d74434a93fa；rollback7c6b79754da20f28ac71080e5809cce62db396f5。deploy精确release切换成功；后续docs-only HEAD以git为准，不等于新的应用release；未合并main。
- 服务器必要build/start完成，deploy --no-tests --skip-migrate --reuse-unchanged-capability-images exit0；未运行测试/CI/本机构建。
- 最后部署日志 C:/Users/Mac/AppData/Local/Temp/xgs-stage2-semantics-deploy-20260912.log，exit0；前序stage2/qualifier日志保留。Sol Medium负责公式回退，Sol High定向复核源码/依赖与空值修复。
- provider d1630135d569d28364d295380bb4e0333c3ee264 / rollback92cc416ee3fe921f62c75cbe6f69e48d0b55227d；供应商/账号不变，仅补公式模型、KaTeX依赖与既有理解指令。
- 2026-09-12实际交付：Docling1.30.0+CodeFormulaV2只读缓存，公式增强true、parser并发2；公式TeX/位置保留、空/乱码/降级明确标记；理解skill v6实际导入。统一KaTeX覆盖编辑、公开、发布、Hermes及来源引用。其余候选不冒称已安装。

## 已实现的产品改造
- 研究桌面：继续研究直达编辑器；每项真实任务归“需要我处理/后台进行”，相同ID去重，保留真实并发和历史恢复入口；有后台任务时仅可见页定时静默更新，focus可恢复失败读取；区分初次loading/局部unavailable/真实empty。专用读取失败使用成功global结果，失败不清屏。
- Hermes：透明Wanko形象、简短介绍、一个对话入口，与实际HermesAssistantDrawer相连；关闭该页旧全局fallback，去掉形象遮挡与重复建议动作。
- 编辑器：用户截图四个大区归入文末一个“资料与修改记录”；真实未确认提取在正文位置处理，保留缺失字段确认、PDF预览/上传/来源/历史；已确认后不重复展示空建议或旧diff。
- 公开RO：标题/公开版/日期/复制引用同行；完整大图、可选视频（无视频为短行）、精炼正文，来源/引用/历史一个次级入口。隐藏内部认证枚举和空作者占位。
- 首页/探索：共享真实公开版卡片、approved image/chart完整缩略图、绑定版本URL；搜索保留上一批结果，拒绝迟到响应覆盖，分页按已应用筛选；只有一条结果时复用横向图文卡，避免标题落在首屏之外。
- 排序是publicId倒序的“新公开研究优先”，不是最新版本发表时间；最新公开不能冒称精选。已有Ultrafast Science编辑集合未擅自背书新论文。
- 站内主要链接改Next Link、编辑器加载沿用同一底色；根SessionProvider保留跨路由账户，validated /auth/me续7天Cookie；网络失败不当退出，明确401/账号切换/跨标签失效有竞态处理。
- 实际应用项目apple-design/emil-design-eng/frontend-design，后者加入每个UI的产品目的约束；既有SOURCE/MIT许可证保留，无重复安装。
- Chat6Pro本轮完整产品分析已收到并采纳：会话OpenScience落地方案，6aa3a4a4-f7a0-83ea-a0be-fc2f7eba4581；本轮提供页面文字与问题描述，不冒称新截图已交6Pro验收。
- Sol Medium负责桌面，Sol High负责会话连续性，独立Sol High复核鉴权/公开数据/归档；已修续期漏接、晚401/切换账号竞态与缺失字段确认入口。未运行测试。

## 实际观察与范围
- 本轮已对照原PDF第2/3页两个代表公式；同一ScientificText生成/jobs/formula-reading-20260912.html，32式中28式可排版，4式识别重复/混入正文/缺配对符，不等于32式物理正确。源Docling任务缓存404，不重跑26页；原解析输出保留。阅读截图/jobs/formula-reader-20260912.png已查看，公开RO未改。
- 真实阅读结果/parser-jobs/hermes-reading-stage2-final-20260912.json：5个已保存MiniMax分段经相同输入/新guard复用，67观察、覆盖94段、保留32段限定上下文；仅新增一次MiniMax-M3 reduce，47秒，报告7753输入/3002输出token。这是本次人工恢复复用，不是已实现自动断点缓存；不据此推算整体节省比例。
- 原候选/parser-jobs/hermes-reading-stage2-candidates-20260912.json仍保留；Chat6Pro复核原文/jobs/hermes-stage2-chat-scientific-review-20260912.txt已取回。原页数组顺序1–26，发送包误用了pageNumber导致页属性缺省，内容完整；任何具体页号须对原结果page字段核实。候选不直接写入SDF/发布，公开v10未改。
- MiniMax修订/parser-jobs/hermes-reading-stage2-revised-20260912.json：17秒，24667输入/3008输出；仍把19 as与66/99 as视作同参数，把P段说成缺页、已披露耦合说成缺失，拒绝作为写作/成稿事实。原始观察只作来源线索；最终生成/独立6Pro审查的重要性已获真实反例，不取消已有审查。
- 4909与c0fd部署exit0。真实桌面→编辑器→探索→公开页保持同一账号；/me200，实际Set-Cookie Max-Age604800。公开22-v10图片naturalWidth1280。c0fd截图发现旧global重复头像与短暂假空任务，363定向修复。
- 363最终实页：桌面floating stage=0、卡片头像=1，真实2项需处理任务和6条历史可見；对话Drawer可打开/关闭，未发送新模型请求；探索单篇横卡图文同屏且账户保持。已查看最终桌面/探索及未变化的c0fd公开/编辑器截图。
- 部署前未复现真实401：/auth/me为200、Cookie存在。已修硬编码“登录”、Cookie与Redis续期不一致；短期实际导航观察不能证明七天后或所有网络条件下永不掉线。
- 正确截图：Chrome125%时用Page.getLayoutMetrics的非css layoutViewport尺寸作为Page.captureScreenshot clip；截图完整1424×816。旧普通截图裁切不等于DOM溢出。
- 截图位置 /jobs/product-*-20260911.png；本机静态副本C:/Users/Mac/AppData/Local/Temp/xgs-product-*-20260911.png。
- 已由scripts/archive-legacy-showcase.mjs --confirm精确归档Task/E2E：19=3fdc4e14-0129-4b01-9b43-562294f016a4，20=6c86454a-d4c4-40e1-b390-fa6a8389c56c，21=43fbdc04-3fad-49d3-a4dd-46af0a6e45b1。原status均draft，更新后版本3/4/4；域服务审计保留，可恢复。
- 实际公开index200，只剩22。未删除文件、Publication/公共ID或真实论文；更大范围清理尚未完成。

## 已带图公开的真实论文（保护）
- RO c896802c-35dd-4b59-8db1-5f374f83a6d8，deep-sub-cycle pulse。正式v10=f4e2dc71-1fe8-406f-8c19-e1849503d698；草稿修订11，不是正式v11。
- 公共URL https://openscience.428312321.xyz/research/OSR-2026-000022/v/10 。Hermes“确认公开发布”review200/status200/publish201，时间2026-09-11T14:39:38.371Z。
- PDF7bb96cc1-bb6f-4d3b-b0bf-352f41971faf；高级解析1e324308-fd26-4cc1-8612-8a1c269909a9；六字段服务器Hermes凝练，仅人工移除results一句无依据概括。
- 核心图b19a65bd-6497-4b61-bb81-0154b264d58c，源plan3a6ed136-002a-4301-8505-ca14e3dbbc53；PNG1672×941/622483bytes，/jobs/b19a65bd-6497-4b61-bb81-0154b264d58c/output/image.png。
- 原Chat https://chatgpt.com/c/6aa4065f-b358-83ea-a624-11ce6cdc21b3 刷新后取回图，无重复生成；锁内恢复marker后原task retry入库，有人工恢复参与。
- 主会话/Sol High/Chat6Pro已审此PNG：k⊥z、独立S(z)/E(t)、异号旁瓣和限制；仅概念示意，不冒充测量数据。Hermes“采用1”PATCH200后approved。
- 48条context来源人工确认，2条只有章节标题的关联移除，102Evidence保留；12claims/6core，重复节点归supporting，ID/text/来源保留。备份/jobs/evidence-association-review-20260911-backup.json、core-claim-curation-20260911-backup.json及同名result.json。
- e0/43cc等旧错误素材仍rejected，旧失败请求不重发；不从历史示例继承审核。
- 已部署378历史修复：review前移Claim图校验，publish终检保留；未公开审核版本Hermes“继续编辑”可撤回draft，权限/Serializable/Publication保护及审计保留。

## 后续工作与边界
- 用户再次要求牢记：文档/理解/写作准备后继续图片/视频的艺术风格、构图、叙事、镜头/旁白与实际产物复核。此项未开始，不因当前公式步骤完成而丢失。
- 本轮UI交付后才提升Hermes全文理解、来源关联、去重和科学自审；必须把上述人工整理变为可靠服务器能力，不能以UI简化取消科学正确性。
- 目前一篇真实带图发布；其余2–3篇精选、视频、真实多图HTML样本/独立导出及广泛旧数据清理未全部完成；不批量凑数。
- 全自动浏览器异常恢复、任意新论文准确理解尚未证明；不声称量化token节省比例。
- 发现与已确认叙事/科学事实偏离，及时停下对齐，不再沿旧错误计划扩展。

## 控制入口
- openscience-chatgpt-browser；CDP容器内127.0.0.1:9233；复用/app/node_modules/playwright-core，复用已登录产品页。noVNC localhost6081。
- Chat6Pro直接read_thread/send_message与服务器网页分开判断；CUA失败不代表Chat不可用。发送超时先查原会话，避免重复。
- SSH仅infra/scripts/ssh-run.sh；Windows显式C:/Program Files/Git/bin/bash.exe，XGS_CONFIG_ROOT=E:/Miscellaneous/XGS；deploy PATH额外加入/e/Miscellaneous/software_development/Android_studio/jbr/node_js。
- 不读取/打印.env、Cookie值、密码/OTP；页面fetch走浏览器实际网络，不用Playwright request绕过Chrome代理。
