# OpenScience 进度（CURRENT window）

> 最新同步：2026-09-06 +08。应用/main3d518af已部署，rollback615ca2d；demo7e1b6ea独立发布。后续文档提交不改变生产。

## Hermes Codex integration and revised video — deployed and accepted

- PR97/main source3d518af1433e4e1e91de0ebbb0d9a12d4bedfa52; PR/main CI passed. ECS full build/Parser16/BGE/ScanSci/core36/search2/health/public/retention passed; rollback615ca2d, no pending transaction. One local pre-transaction EPIPE retried only after confirming intact source/old release.
- Real administrator task4661e80a-526e-4a4a-8b11-47359e9c1f6b: Gateway codex-image66.103s, draft1280×720/1298085bytes, exact parent+3Claims,1task/1attempt/0retry/1Credit/1generated audit/1image audit. Spool hash matches,1raw image, runtime containers cleaned. zh/en×1440/390,PNG200/anon401/logout passed. Cost/token fields null.
- Missing validator export and umask input ownership both reproduced/fixed before model use. Final runner10 tests and complete install import preflight pass; controller3d518af active, input1000:1000/0400. Existing runtime/auth/network/image foundation reused.
- Demo7e1b6ea third mechanism scene updated;39.101s render/41.292s video/Range206/mobile passed. Original WAV/JSON/artwork and actual AAC stream unchanged. No new TTS or generation for this render.
- CPU model remains paused; generated image remains draft for scientific/visual approval. Global conversation editing and generic RO-to-video still pending. Exact evidence and next actions in CURRENT handoff and science-video runbook.

## 科学构图修订与 RO 草稿导入完成

- 服务器完成两次图片修订：密集波前版保留为候选；稀疏版消除分色/蓝色暗斑歧义，1672×941，65.309秒完整任务。示意波前和屏上亮度不代表实验数据，图片额度/美元成本未知。
- 复用当前615ca2d导入CLI，私有RO新增draft666606ad-4f4a-45e6-ae7f-d8ff29ebfa28；3条Claims、1条导入审计已核验。没有批准/发布，没有分镜父绑定，没有Gateway/Codex自动接入。
- 桌面与390px图片解码、无横向溢出、下载hash、登录200/匿名401均通过；会话注销、临时代理停止，生产版本不变。证据见science-video runbook与CURRENT handoff。

## Server Codex image generation verified

- Existing v2ray/SSH/Squid reused through restricted Unixsocket proxy; generationcontainer networknone, no production/firewallchanges. Freshapprelease/public615ca2d unchanged; proxiesstopped.
- v3 CLIexit0 in56.012s, actualPNG1536×1024/2261484bytes downloaded to ignored codex-server-builtin-v1.png. Oneoutputfileverified; CLIreportsoneimagecall but JSONLdoesnotexpose nestedtool count. Modelusage21205input/417output, imagequota/dollarsunknown.
- v1 readonlyCODEX_HOME blockedinit beforemodel; v2 cachedirectoryfix allowedtext but disabledcode_mode_host blockedimage (19205input/420output). v3 enabledalreadybundledhost, preserved disabledshell/MCP/browser and nestedreadonlyauthfile. Noadditionalbinaryinstall.
- Screen/wavefront moreexplicit; scientificvisualreview remains. NoROimport/approval/publication; privatevalidationdoesnotestablishsupportedpublicbackend. CPUmodeldownloadpaused. Fullcheckpoint in science-video runbook andCURRENT handoff.

## User steering: local installation paused; MiniMax retested

- 下载已停止，约1.1GB临时内容保留，无完整模型/推理运行。生产615ca2d/rollbackd6507ea未变。
- 3次MiniMax图片调用：image-01固定seed/短构图prompt，优化关33s、开58s；屏面更清楚但机制仍有错误。live89s失败、原因未知，不自动重试；成本美元null，无新M3/产品扣额。
- 官方支持Codex ChatGPT/device-auth，源码有内置imagegen条件门槛；可以隔离验证，不能仅据API key缺失否定。服务器现已安装Codex并完成ChatGPT登录，一次内置生图已验证，产品API与订阅计费仍独立。

## Composition candidate — visual acceptance failed, no deployment

- 五字段构图规划与44focused/529Worker测试、全仓build/typecheck/lint及独立审查通过；基于f7a80ea，生产仍615ca2d/rollbackd6507ea。
- M3本轮6文字调用（3失败结构、1诊断、最终2次含1重试）；最终一次MiniMax生图仍丢失接收屏。一次内置生图同prompt对照更完整，但不等于服务器已接入；保留候选和样本，不批准/不部署。
- 现有Worker OpenAI/Gemini独立key配置布尔false。下一步验证服务器可用的高保真生成路径或可控布局；不重复付费碰运气。ignored composition-eval.json和两张composition-artwork.jpg/composition-builtin-comparison.png为证据。

## Scene imagery deployed; quality iteration next

- PR95/main CI33986402240通过；全仓build/typecheck/test/lint、Web504+5与12E2E通过（原有search测试8项跳过）。服务器全build、Parser16、BGE/ScanSci、core36/search2、13运行/10健康及公网/loopback精确版本通过。
- 已审批分镜单幕真实生图已上线，管理员试用；API/Gateway/Worker/媒体预览、父稿场景与3Claims关联可用。没有安装新模型或永久服务。
- 首次global图片调用失败；CN额度查询通过后配置MINIMAX_IMAGE_REGION=cn，仅重建Worker，同版本健康与release通过。第二次9cccb431-7e41-4d2a-bc01-5116902516de成功，图片调用27.588s；两个任务各1Credit reservation，美元成本未提供。
- 实图1280×720，四组语言/视口、匿名拒绝、服务器现有Chromium解码及会话注销通过。图像偏抽象、机制关系不清楚，保持draft，不声称视觉验收或真实批准通过；下一步优化构图，然后接CPU视频。
- canonical deploy首次journal前EPIPE未切换，重试成功；production615ca2d/rollbackd6507ea。ignored scene-image-*证据已保存。

## Sourced storyboard delivered

- PR93：RO内Hermes分镜创建、自然语言修订、原稿/新稿对比与审批；媒体先于分镜、分镜全宽，中英文与手机可用。复用Gateway/任务/素材/Claim失效，无新依赖或迁移；计划不是生成图片/视频。
- 全仓build/typecheck/lint/test通过（现有search storage.integration8项需测试库而跳过）；最终Web503+5测试、11项浏览器通过，独立后端与前端复审、PR93和最终main CI通过。
- ECS最终d6507eaa07edfdacabe135fd30ff9f91183e0c02，rollback64ae87252ebf183742bb0cdfa96941be0fea3cf6；全build、Parser精确报告、BGE真实向量、ScanSci运行/OA、公网/loopback通过。core36/search2迁移最新，13容器运行/10健康，约94GiB磁盘可用；journal清除、retention完成。
- 受控私有RO bcbf1586-b6bd-44b6-ab66-c675fcddce78：3分镜任务、4次MiniMax-M3调用（1次结构化重试）、3扣额/3审计。旧两稿draft，纠正稿74ef00f4-be7e-4a95-9256-c22dbee7ad33 approved，六幕45秒规划。美元成本未提供，不编造金额。
- 内容审阅纠正了模型把平台来源说明误推成论文无独立复核的说法，改进研究者称谓与波前表达后再审批；JSON有效不代表科学正确。公网4组视口/语言、对比、批准刷新/重放、旧图解码与旧视频播放通过；测试会话注销。
- 证据ignored science-video目录：storyboard-browser-evidence.json、storyboard-audit-evidence.json、storyboard-approved-{1440,390}.png、storyboard-parser.log、storyboard-deploy.log。

## Existing foundations

- PR91媒体优先布局、PR88/89受审图片/视频导入/单Range/审批/Claim失效已部署；原媒体两资产保持历史失效测试rejected，没有公开论文或改变用户权限。
- 淡彩demo381705a/run381705a-20260905T121000Z保持；2172×724五层/十探测区域图，41.292秒视频3,203,000bytes，CPU渲染37.76秒。
- v4 Serena完整WAV41.28秒保留，未分段/补静音/变速。复用Chromium/Canvas/Qwen；torch基础约0.97GB、Qwen子镜像约2.04GB含基础、模型4.52GB。无新模型安装或本轮图片/视频调用。

## Next and limits

- 下一步让已核对分镜驱动可溯源图片和隔离CPU视频渲染，再接全局Hermes对话目标；当前只有RO内专门分镜入口。自动全文理解、生图、视频与语音对话不能标完成。
- 所选RO Claims及条件/限制是本轮输入，没有新增Evidence/SourceMap检索。现有PDF流程仍缺method/results/reproducibility自动提取，演示主张为人工核对。
- 并发撤权/来源失效可扣额后阻止落库；模型返回到素材提交之间故障可能重复provider调用，幂等重放产品只扣一次；Storage孤立对象/公开review digest历史债务保留。
- 唯一CURRENT交接docs/handoff/2026-08-16-hermes-2d-pet-handoff.md；根目录旧checkout与用户资料未动。已有前端分支定期巡检，不重复创建。
