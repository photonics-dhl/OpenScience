# Hermes Research Intelligence CURRENT Handoff

> CURRENT active-memory，2026-09-06 +08。RO内Hermes分镜生成、自然语言修订、对比与审批已部署并通过真实模型验收；已审批分镜单幕生图已上线管理员试用；首张图保持draft，解释质量待改善，自动视频与全局Hermes对话编辑未完成。

## Version tuple

- Worktree E:/Miscellaneous/XGS/.worktrees/readable-hermes-guidance；branch codex/product-workflow-design；application source/main 615ca2dc22bcceabc99562a31340053725a81098（PR95）；后续docs HEAD以Git为准。
- Production active/public/loopback 615ca2dc22bcceabc99562a31340053725a81098；rollback d6507eaa07edfdacabe135fd30ff9f91183e0c02。Canonical deploy与retention完成，journal/failed/pending标记均无；core36/search2迁移最新，13容器运行、10健康检查通过，约94GiB磁盘/24GiB内存可用。
- 独立淡彩demo source381705a32deeed38fb94564eccbcbb2c66fb7739，run381705a-20260905T121000Z；/demos/science-video/d2nn/?v=watercolor-v1。应用版本与demo分开记录。
- 根目录旧main和用户未提交资料未动。启动先Git/fetch/checkup/实际release，再读本handoff、需求基线相关章节和当前设计/计划。

## Product decisions and delivered behavior

- 功能/展示优先、成熟方案与已有基座优先、分段效果验收。RO凝练论文，衍生图解释做什么/怎么做，原始图表/代码进入Evidence而非自动证明；暂不做用户上传音视频理解。
- PR86：PDF→Hermes确认→Editor保留源附件→人工Claims→概念图已部署。method/results/reproducibility仍有提取空缺，不声称自动完整理解。
- PR88/89：受审PNG/MP4管理员CLI+原workspace写权限、精确draft版本/Claims、来源/审计/幂等；原生私有视频与单Range；Claims修改使素材rejected，恢复文字不会复活审批。
- PR91：媒体优先、桌面双列/手机单列、完整contain、来源折叠、任务错误可见、当前研究标题和准确文案。
- PR93：选择1–12条当前RO主张，设置中英文与淡彩/技术/水墨预期方向，通过Gateway生成3–6幕分镜；旁白、画面动作、时长和来源逐幕显示。自然语言反馈生成独立新draft，旧稿保留、对比后沿用既有审批；已审批稿仍可作为修订来源。
- 分镜为interactive_html显式子类型，JSONB中存有界结构，DTO只返回验证后的document/locale/style/baseAssetId；HTML转义且仅附件下载。无新表、依赖、队列或SDK；原概念图免费确定性路径保持。
- 分镜任务每次提交1AI Credit，幂等重放只扣一次。Worker模型前与Serializable落库前重验权限、draft、来源、父稿；父稿批准允许继续，拒绝则阻止；异常元数据不可批准。
- 分镜仅使用所选RO Claims及条件/限制，不读取原始Evidence/SourceMap。风格指导规划与单幕生图，尚未自动生成视频；Hermes入口在RO分镜面板，不等于全局自由对话已接通。

## Fresh acceptance

- 全仓build/typecheck/lint/test通过（现有search storage.integration8项因无测试库跳过）；最终Web503+5测试、11浏览器流程通过；独立后端安全/并发与前端复审通过，PR93及最终main CI通过。
- 最终SHA服务器全build、Parser16-case正式source/image报告、BGE真实向量和ScanSci运行/OA检查通过；无迁移，部署前备份core28M/search20K、7/7保留。
- 受控管理员私有RO bcbf1586-b6bd-44b6-ab66-c675fcddce78，version57d10269-2ba7-4eaa-88fc-622a00d20ef5。没有修改普通用户权限、邀请或公开发布。
- 真实MiniMax-M3：3任务/4调用（Worker日志确认1次结构化重试），3扣额/3生成审计；重复提交没有重复素材/扣额，成本日志美元值null，不编造金额。
- 初稿72bfd097-68cd-4b75-8d39-1ce465a14e10及首次修订e959a696-22a0-477c-b2ab-03bb2474f3ef保留draft；科学核对修订74ef00f4-be7e-4a95-9256-c22dbee7ad33已approved，六幕合计45秒为规划时长。
- 初稿错误地把“平台说明不是独立实验验证”推成“论文没有独立复核”。通过反馈纠正了该无来源判断、研究者称谓和波前表达后才审批；模型内容仍需科学审阅，未把JSON有效当作科学正确。
- 公网en/zh×1440/390显示/无溢出、父稿对比、批准/刷新、会话注销通过。旧插图可解码，原41.291667秒视频仍可播放；原两媒体保持rejected（历史Claim失效测试状态）。
- Evidence ignored apps/web/test/visual/out/science-video/: storyboard-browser-evidence.json、storyboard-audit-evidence.json、storyboard-approved-{1440,390}.png、storyboard-parser.log、storyboard-deploy.log。控制账户不是用户个人RO，勿把其链接当作用户可访问展示。

## Scene imagery deployed; visual quality still pending

- PR95/main CI33986402240通过；全仓build/typecheck/test/lint、Web504+5与12E2E通过（原有search测试8项跳过）。服务器全build、Parser16、BGE/ScanSci、core36/search2、13运行/10健康及公网/loopback精确版本通过。
- 已审批分镜→单幕image-01→独立draft与来源/审批已接通；管理员+workspace writer、每任务1Credit、图片无自动重试；无新永久依赖/模型/服务。
- 首次task247f5dc6-0991-418c-9705-ae3214f3be17失败：凭据CN而图片默认global。CN quota只读200/code0后，在生产锁内追加非秘密MINIMAX_IMAGE_REGION=cn，仅重建同版本Worker；独立核验region/镜像/健康/精确release及无journal通过。
- 第二次task/asset9cccb431-7e41-4d2a-bc01-5116902516de成功；M3规划2.791s、image-01生图27.588s，1280×720、3Claim关联，生成审计1。两次任务各有1Credit reservation，不能称总共只用1Credit；美元成本null。
- zh/en×1440/390无溢出、浏览器解码、匿名401、会话注销通过；ECS复用现有Chromium151隔离解码3,686,400像素字节，无新增运行时。
- 实际画面偏抽象，光传播/干涉因果不够直观，保留draft，未执行真实图片批准；审批已有本地E2E覆盖。下一步先强化构图和科学解释，再接CPU视频。
- ignored证据scene-image-browser-evidence.json、scene-image-artwork.png、scene-image-audit-evidence.json、scene-image-attempts-evidence.json、scene-image-ecs-decode.json。首次部署在journal前EPIPE未切换，重试canonical deploy成功；确切底层原因未证实。

## Current integration candidate — not deployed

- 当前未提交候选新增 Codex Gateway/provider、独立持久化 runner 与 demo scene3-artwork；全仓 build/typecheck/lint/test 已通过，最终审查与服务器验收待完成。ADR-013 记录边界。
- Candidate oncodex/product-workflow-design basedf7a80ea; production615ca2d/rollbackd6507ea unchanged. Five-field drawing brief implemented; explicit string schema/budgets added after real planner returned array/overlong content.
- Worker529/focused44、全仓build/typecheck/lint、独立复审通过。实际candidate M3共6文字调用（3结构失败、1诊断、最终2次含1重试），image-01一次；成图仍丢失屏面，未部署/未批准。
- 同一1351字符提示词、内置imagegen一次对照更清楚保留薄片/波前/屏面，但不是服务器能力。Worker的OpenAI/Gemini独立key配置布尔均false；MiniMax图生图官方subject_reference为人物参考，不能假定可约束科学结构。
- ignored composition-eval.json保存实际prompt；composition-artwork.jpg为MiniMax样本；composition-builtin-comparison.png为内置对照；composition-*-logs记录验收。前两次评测启动仅远程shell解析失败，无模型调用；stdin方式已解决。

## Latest steering and retest

- 用户要求先暂停本地安装、充分复测MiniMax，并核实服务器ChatGPT登录生图。下载容器已停止，约1.1GB archive/partial保留，无完整模型/推理安装；infra/local-image-eval为未完成实验脚本，禁止自动恢复。
- 同prompt/seed42：image-01优化关33.039s、开58.000s，屏面保留改善但机制仍不准确，开启优化出现聚焦状结构；live约88.899s失败（根因未知，不称超时）。3图片审计、0新M3调用，无RO资产/产品扣额。
- Codex官方支持服务器device-auth；0.153.0源码允许符合账号/provider/model/auth条件的内置imagegen。因此无独立API key不能证明CLI不可用；服务器现已安装并完成设备登录与一次内置生图验证。正式图片API计费独立，不能把登录权限等同产品后端支持。
- 证据ignored minimax-retest-{A,B}.jpg、各settings/log、minimax-retest-audit.json；生产仍615ca2d/rollbackd6507ea，前端同事e5db5ae无新提交。

## Codex server image generation verified

- Official CLI0.153.0/runtime320MiB, reusedNode9aa18418. Device login successful; originalauth UID1000/mode0600 never read/copied. Model container networknone/nonroot/read-onlyroot; freshcache writable with nestedauth.json bind read-only. Shell/MCP/plugins/browser disabled; bundledcode_mode_host required and enabled, ordinarycode_mode disabled.
- Existing v2ray/SSH/Squid confirmed204/FIRSTUP_PARENT; dedicated Unixsocket CONNECT proxy allowed onlychatgpt.com/auth.openai.com443. No firewall/production-network change. Proxy containersv1/v2/v3 nowexited; do not reuse stale socket blindly.
- v1 failed beforemodel onreadonlycache; v2 textturn succeeded but code_mode_host disabled (input19205/output420), noimage. v3 CLIexit0,56.012s total, textusage21205/417, PNG1536×1024/2261484bytes saved inECS egress-v3/state/generated_images and copiedto ignored codex-server-builtin-v1.png. CLI reportsoneimagecall; JSONL lacks nestedtool event audit, onlyoneimagefile independentlyverified. Dollar/image quota unknown.
- Actualscreen/plates/wavefront readable; artisticconceptcandidate, scientificinterferenceexpression stillneedsreview. NoROimport/approval/deployment. Officialservercapability demonstrated; notproof ofsupportedpublicproductbackend. ab.chatgpt.com telemetry denied withoutblockingcompletion. CPUmodeldownload remains paused.

## Latest refinement and private RO draft

- 2026-09-06：服务器新增两次成图。v4消除彩色薄片/深蓝暗斑，但波前过密；v5简化为三处代表性波前，1672×941、1875121bytes，完整任务65.309s。三处为连续相位面的示意采样，不代表三个孔；不是仿真或实验图。
- v5经现有immutable615ca2d导入CLI写入独立draft666606ad-4f4a-45e6-ae7f-d8ff29ebfa28；hashddda065bad842416433559b703738d4375b18282d8c2a85b0c7054625e3847c1，精确3Claim关联/1导入审计。generator明确assistant visual review；未批准/发布，无分镜父子绑定，也未将Codex接进Gateway。
- 浏览器桌面/390px显示解码、完整字节hash、登录200/匿名401通过，会话已注销；代理v4/v5与模型均退出，生产仍615ca2d。ignored codex-server-builtin-v2/v3.png、codex-ro-browser-evidence.json、codex-ro-audit.json及codex-ro-draft截图。下一步复用该受控生成/导入路径完善分镜素材，再接视频；正式自动接入需另行设计，不得声称Hermes已自动调用Codex。

## Constraints and next action

- 用户已授权实施/合入/部署/真实论文验证/必要开源方案，不重复询问。不得读取/打印.env、Cookie、密钥；云上仅项目SSH/deploy脚本。
- 复用Chromium、CPU Canvas、离线Qwen；torchCPU基础约0.97GB，Qwen子镜像约2.04GB含基础，模型4.52GB。BGE依赖不同，不合并可变环境；无GPU，不重装模型。
- 用户接受v4 Serena完整41.28秒WAV；原WAV不分段/补静音/变速。淡彩视频41.292秒/3,203,000bytes，ECS渲染37.76秒；未以本轮分镜重生成配音或视频。
- 已知边界：来源/权限在扣额后改变可使任务失败；生图崩溃恢复无素材时阻止再次付费，可能需人工核查；Storage先写后DB失败可留私有无引用对象。公开review digest未纳入媒体的历史债务在扩大公开发布前复核。
- 下一步：完成当前 Codex Gateway/隔离 runner 候选的审查与部署；真实管理员任务核验 parent/Claims/审计/draft；复用现有 renderer 更新第三幕机制插图、保留 Serena 音轨。候选尚未部署，CPU 模型仍暂停；全局 Hermes 自由对话与任意 RO 自动视频仍未接入。
- 同事frontend/nanqing上次核实e5db5ae；已有每日10:00巡检自动任务，勿重复创建。下一次合并前重新fetch比较。
