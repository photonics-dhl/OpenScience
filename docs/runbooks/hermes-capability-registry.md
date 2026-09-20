# Hermes Capability Registry

## 当前能力索引：目的、调用、效果

2026-09-20 续作：三类风格链路已补逐图 style、场景对应、科学符号与下载后恢复，以及 Hermes art-only 明确换风格、Web 新 style、figurePlan 确认/草稿/提交贯通。论文原图 art-only 在提交前明确阻断；真实原图 reuse、固定暖底标准化的深色视觉边界仍未交付。**已按 CURRENT 部署；最小 UI 只观察现有图和 Hermes 入口，新风格确认/重放及异常恢复未实跑，不称零技术债**。本机 codex-chatgpt-web 5.0.8 的短 CLI + 精确源码文本已完成 Pro 审查，原图 art 提示 P2 已修。**Windows 206 已环境恢复**：268 日志经授权完整归档且保持原权限，helper 42060→22584，原生 elevated/read-only 读取源码 exit0；本轮仅静态确认 home 仍353，补产物归位规则、两历史脚本归档路径/重跑保护及每日安静维护。未改配置/降低隔离，上游 argv 缺陷仍在。桌面 compaction 的多段环境前导可能被误判为人类修订；native cwd 正确，但缺 raw outbound，尚未修复，不放松信任/turn 校验。完整 Pro 工具回合未实跑，不重发旧任务；本机开发协作不能替代服务器生图 provider。证据、下一步与清理边界见 [本次交接最新节](../handoff/2026-09-18-figure3-image-and-cleanup-handoff.md)。

本页是定位入口，不是自动能力注册器。仅阅读与任务匹配的行，再读取调用代码与已有任务记录。**当前版本/暂停状态唯一锚点：[CURRENT handoff](../handoff/2026-09-10-hermes-web-image-handoff.md)**；资源/缓存/安装入口见[服务器清单](server-capabilities.md)。需求来源是最新用户纠正及[需求基线](../OpenScience_Kimi_Development_Spec.md)。没有任何工具保证对整个产品的绝对掌控；未知状态要可见、可定位。

这些文件/符号按2026-09-15本轮交付代码与已有记录核对；必要服务器构建/启动及真实配图任务见CURRENT；未运行测试。产品域行不把上线当作当前全面验收。AI效果行标明已有实际任务与局限。表内 `skills/`、`presentation/` 和worker文件名相对于 `apps/agent-worker/src/`，其余完整目录从仓库根定位。

| 产品目的 / 能力 | 实现与实际调用入口（仓库相对路径） | 结果依据与边界 |
|---|---|---|
| 上传、全文取得、解析 | `apps/api/src/routes/ingestion.ts` → `apps/agent-worker/src/ingestion-parser.ts`；全文发现走 `apps/agent-worker/src/retrieval/handler.ts`，解析选择走 `apps/agent-worker/src/parsers/cascade-orchestrator.ts` | 既有SourceMap/页码与原始文件是下游来源；解析可读不代表公式正确。复用ScanSci、Docling、Tesseract，资源见服务器清单 |
| 文献语义理解 | `apps/agent-worker/src/extractor.ts` 的 `semanticReductionGuard`/综合链；引用 `skills/paper-analysis.ts`、`scientific-critical-thinking.ts`；经Gateway | 已有semanticStage、条件/算例/操作/来源关系；后续应沿用经审核结果，不能将先前有错候选当成权威。历史d5c6整稿未通过，当前不重跑 |
| 共享科学推理规则 | `skills/scientific-critical-thinking.ts` → `extractor.ts` 的reduce/bridge及科学审校 | K-Dense方法的项目runtime v2，确有调用；并非安装整个K-Dense包。`skills/installed-media-skills.ts` science/review直接引用同一常量并记录id/version，已上线；真实配图1da6/a38的请求与provenance已消费共享规则，效果与缺口见CURRENT |
| 原文科学审阅 | `extractor.ts:2056` 的 `modelScientificReviewCanonicalProposal` 用共享科学Skill调用 `gateway.completeStructuredWithMetadata`，沿MiniMax主路由；`:2562` 仅在显式 `context.mode=web` 时改走 `webScientificReviewCanonicalProposal` → `gateway.reviewScientific` | 普通论文的MiniMax来源审校已经存在，不能因配图审核阻塞再造一套。显式网页复核才依赖Chat；v5建议通过materializeReviewedClaimSuggestions映射原Evidence/确认UI，旧v4保留原身份。代码接线不证明整稿科学正确，历史失真和未观察项保留 |
| 来源约束写作 | `apps/agent-worker/src/workspace-guide.ts` → `scientific-writing-source.ts`、`skills/scientific-writing.ts` | 写作有原始来源恢复和引用回填；本轮未重观其效果。它写稿，不负责验证坐标/色块的物理意义 |
| 语义检索 | 首次`confirmIngestionTask`在同事务调用原agent队列producer，`agent/search-index-source.ts`绑定原确认来源；Worker消费保存的SourceMap。`packages/search/src/runtime-config.ts`共享配置，API原hybrid服务经POST `/research-objects/search`供ResearchList消费 | `ba184541`部署后，两篇原confirmed来源任务真实完成：deep 58/58 dense、Quantization 42/42 dense，当前generation均active；Weyl UI POST 200、`mode=hybrid`，实际召回两篇论文，页面无横向溢出。旧needs_review generations保留，未清零计数；索引闭环不证明科学蕴含或配图质量 | |
| 画面规划 / 设计skill | `presentation/storyboard.ts` → `illustration-planner.ts` → `skills/installed-media-skills.ts` | 自有v5与Baoyu参考已有真实消费；76918e55艺术修订只改变composition/treatment，与原稿科学字段全等，沿用原证据，不重跑全文分析。早期错误曲线候选已拒绝。具体风格交付差额见CURRENT，安装/Schema成功不等于科学或审美合格 |
| 候选画面审阅 | `presentation/handler.ts` → `illustration-review.ts` → `gateway.reviewScientific`；illustration-plan走既有MiniMax结构化池，显式论文web复核保留原Chat provider | 配图不再固定6Pro；共享科学Skill、原规则/字段保护和blocked反馈继续复用，新旧provider/model收据兼容。每次实际provider尝试前复验任务/来源/原稿，失权立即终止；短事务后已发出的请求不可收回，旧结果落库仍复验。部署/新模型实际效果见CURRENT，旧769的6Pro记录不改写 |
| Chat图像生成 / 参考图 | `presentation/scene-image.ts` → `gateway.generateImage` → `infra/chatgpt-browser/` | 服务器Chat直接执行已审方案；原参考图bytes和本批无参考图新风格均有真实成图。学术图c3a497已看图、仍待用户认可，初次封面ac166未合格，修订结果只见CURRENT。保留喜欢的aa41、旧图和公开v1；Codex CLI仅备用且不自动切换 |
| Hermes对话与执行授权 | `apps/api/src/routes/agent.ts`、`research-runs.ts` → `packages/domain/src/agent/research-run.ts`、worker `index.ts` | 对话承接修改、核对、执行；当前能力参数/权限以这些入口为准。开发用MCP与skill目录不自动成为Hermes工具 |
| 私有编辑 / 回收站 | `apps/api/src/routes/research-objects.ts`、`trash.ts` → Domain；`infra/private-cleanup/` | 草稿编辑与公开发行分开；公开资料保留。最近清除证据见历史f8e44815，本轮未删除任何数据 |
| 公开发布 / 标准API | `apps/api/src/routes/publications.ts`、`research.ts`、`research-record.ts`；`packages/domain/src/research-intelligence/publication-snapshot.ts` | 发布快照和署名/许可进入公开成果；公开API不应曝光内部生产信息。本轮未改两篇公开v1；页面与API入口以代码为准 |
| 服务器与调用观察 | `infra/scripts/deploy.sh`、`infra/compose/`；`packages/ai-gateway/src/gateway.ts` 的record；AgentTask/资产provenance | 本次只读确认Portainer、Netdata和应用运行；日志、任务结果、审阅/拒绝记录已存在。服务健康不能作为内容质量证据 |

### 复用与效果查询

- **已经自动联动**：Worker任务执行、SourceMap/Claim/Evidence及RO/version绑定、方案保存/艺术修订复用、Gateway/provider队列、结果回收和资产记录；Gateway审计经既有view/connector自动进入Langfuse并携带taskId。已保存任务/真实产物见CURRENT，链路接线与每一步效果分别判断。
- **同读上下文，完成判定仍由开发者/用户负责**：`management:context`从本交付树同读Git、Taskmaster currentTag/任务和CURRENT指针；Backstage已实际读回同一任务源。Serena实际定位新增producer成功，MCP内容及CLI均返回同一源码revision。现有Skill消费这一入口，不另存状态或自动改任务done；它不是关闭应用回调。精确版本/读取见CURRENT，不能据安装承诺绝对防漂移。
- 最新实证：76918e55实际provenance含共享科学Skill v2、自有v5及Baoyu，Langfuse对应MiniMax规划和Hermes经Gateway调用6Pro末审；Skill与模型不是替代关系。浏览器已定位512MiB共享内存瞬时耗尽并切换1GiB；真实六页加载峰值882MiB、资源错误0，草稿正文恢复与格式差异见CURRENT。不从安装/调用成功推断科学与审美全面合格。
- 开发代理：按产品目的选行 → 查实现符号及调用方 → 查同任务的现有输入/输出与审阅 → 决定直接复用、补接断点或替换。任务说明写清具体缺口即可，不另造审批表、哈希、门禁或第二套任务库。
- 效果证据沿用 `AgentTask.result`、资产 `provenance.designSkills`/`illustrationReview`、Gateway调用日志及现有批准/拒绝记录。`designSkills` 沿用既有JSON槽位，也记录共享科学skill，查询按id区分，不能全部解释成视觉风格。生产读取只限授权任务/工作区，不将全文或秘密搬到管理台账。观察不到用量就写未知；不能从任务成功率推断科学正确率。
- 确认“用过skill”需看到执行注入点及当前产物记录；本机安装、Hermes安装、请求实际消费、结果质量是四个不同事实。修订后只更新受影响行；没变化的能力复用旧证据，不重跑整条流程。
- `scripts/research-intelligence/verify-capability-registry.mjs` 只查下方历史表格格式/状态，不检查调用关系或结果。通过该脚本不能声称能力可用；当前禁止测试，不运行它或新增管理平台验证工程。

### 2026-09-14 定向High审查及处置

1. **构建阻断**：`illustration-review.ts`未收窄decision写入Prisma JSON导致的编译失败已修；本轮必要服务器构建通过并上线。
2. **共享skill断接**：配图science/review已接同一critical-thinking runtime常量，替换重叠原则并上线；真实1da6/a38的science/review阶段已消费，审阅可发现问题但仍会遗漏可见标签，见CURRENT。
3. **过重审阅**：已上线既有场景composition/treatment局部修正；科学字段、来源、场景顺序不能由末审重写，科学错误回上游。v2分开encoding与composition；v1继续原样读取/编译，修订明确要求新建方案，不能静默重画。真实1da6仅修局部构图、a38 accepted已观察；成图仍需实际检查。
4. **上游结果粒度**：已上线版本在既有末审v5同轮输出可选逐条建议；P必须来自对应已审字段，映射最终Evidence索引时拒绝关系冲突或范围覆盖不足。原确认入口预填statement/kind/parent/conditions/limitations与来源关系；编辑后需重确认引用关联。无效可选建议保留六字段回退，不额外请求模型，旧v4与未终审首稿保持。尚无每条condition独立证据表；下游继续保留所选Claim完整上下文，不能仅按画面basis丢掉限定。部署及实际效果以CURRENT为准。
5. **BGE的边界**：检索适合在有明确问题时召回来源，不能替代语义审阅；不因安装了模型就增加无必要的调用。保留已兼容v1/v2的Chat接收端，不整体回退或另装供应商。

### 当前技术债与处理

范围：交付树的规则治理、去重、配图表示/审阅边界和工具联动断点；精确版本见CURRENT。以下是定向诊断，不是全仓无债证明或量化健康评分；执行了必要应用构建/启动和工具实际查询，未运行扫描、测试；已执行用户授权的真实私有配图任务。

本轮实际联动：Backstage 返回 agent-worker 的 Gateway/parser/skills 依赖；Serena 在生产源码快照定位确认 bridge 的 Hermes/API 两条调用，再用候选源码核对；Langfuse最初读到两条历史生图失败、requestCorrelation为unknown；后续真实25215/1da6/2196已具任务关联。沿审计生产者定位到 Worker 已有任务上下文未传给 Gateway sink，补接到既有 requestId/view/connector，不新建观察系统。静态调用/传递断点与运行失败是不同证据，不能据两条失败断言科学内容出错原因。

任务接线经独立High静态审查并上线：逐调用读取上下文而非初始化捕获，已有requestId优先，tx和异常传播保持。旧unknown不回填；25215全部六次、1da6规划/科学审阅及2196生图已按原任务关联。Chat模型标签的SQL/connector/query精确白名单修复已独立安装，下一正常任务观察新标签，不为填数据重跑模型。该修复不等于完整跨任务trace；上游逐条建议现已接入既有末审与确认，实际科学效果仍待正常任务观察。

| 问题 / 位置 | 后果 | 处理与后续 |
|---|---|---|
| runner原执行与recover-late共用waitAndDownload，无条件再写recovery.json | 已消费一次刷新标记时EEXIST提前结束延迟恢复，原诊断只有Error | 7cd真实故障及Git8aa21251/3ee10d6e查实；修复已High GO并独立部署，严格读取同canonical/shape/time原标记，跳过重复写入/刷新，保留原观察/gallery、固定系统错误代码及阶段。保持同一请求、时限和标记；本次仍未取得PNG，详见CURRENT |
| Chrome页面大量ERR_INSUFFICIENT_RESOURCES；旧/images恢复入口变为Library | 原对话只见用户请求，Library页面空壳，无法确认原图；旧fallback无法靠精确chat链接找到图 | 峰值取证证明/dev/shm512MiB瞬时耗尽，原静态内存/pids/fd余量判断不足；1GiB已部署，六页首次加载峰值882MiB/资源错误0，登录保留。Library仍需可证明原会话绑定，不按最新图片猜测；原7cd恢复已过期。此项只关闭已查实的容量故障，未关闭结果绑定缺口 |
| page-lifecycle只按终态结果和target归属回收，不读取后来输入的草稿 | 用户在完成的旧job页输入新草稿后可能被自动关页 | 本次High定位并复审最小修复：只自动回收归属匹配、未提交且失败/过期的about:blank，Chat首页与canonical会话均保留，正常runner自身收尾不变。单文件patch已安装并比对字节，精确版本/回滚见CURRENT；未执行关页演练，异常残留尚需人工确认后清理 |
| Backstage应用/需求导航指向旧main；Langfuse CLI只读最新10条跨任务调用 | 沿管理入口读取不到当前需求，目标任务的规划/审阅调用易被较新调用挤出 | 已部署并实读交付分支导航，仍不当作production快照；原query.mjs增加--task UUID精确metadata过滤，时间/条数/白名单边界保持。625119fa、76918e55规划/审阅及99e4失败guide均已按原task定位，不增加观测写入或模型调用 |
| Taskmaster currentTag仍指向八月已完成的任务组 | 当前多风格目标未进入已有任务管理工具，历史完成状态可被误当作当前完成 | 复用现有Taskmaster加入本批三项稳定验收，只有用户认可才done；CURRENT独占资产/反馈/版本，启动按任务ID对齐，旧tag保留历史。没有新任务数据库或额外状态生成模型 |
| guide在艺术规划前再次扩写科学/构图内容 | 真实059f85ae虽然结构成功，却擅加曲线/偶极子/英语标签并将深墨色误作水墨 | 错误安排未确认且已取消；修复部署后7002真实页面返回及“确认制作”提交均与原要求全等，固定原稿family，无附加正文改动。真正设计由既有艺术planner/科学内容保留/末审承担，已创建76918e55；超过既有长度限制无动作澄清，不截断，也不新增语义分类器 |
| Hermes真实艺术修订的结构回复连续拒绝，只记录nested_fields | 原稿虽合格，无法定位具体字段，通用重试也未修复；没有创建新图 | 原任务与原稿资格已实读；在原validationDiagnostic/validationFeedback接具体字段反馈与原回复修复，不放宽校验、不增加重试次数、不给日志增加正文。部署与观察结果见CURRENT |
| workspace-guide艺术意图未传既有revisionMode；前端自行选择最新原稿 | 换风格仍可能重跑科学规划，确认时可能绑定到不同原稿 | 已部署原结果类型/解析/草稿/回放传递成对art/baseAssetId；7002→769实际UI请求正确绑定原稿和版本。不明确则澄清，普通科学修订保持；无新接口或表，后续换论文效果仍需真实任务观察 |
| 艺术规划保留旧科学已批布局；末审只查科学误导、不查明确艺术要求被忽略 | 本批封面请求深墨负空间，15a方案改成暖白、ac166成图仍像教材图 | 自有Skill v5及原planner已部署；同一次既有6Pro末审核对userRequest，769实际保留深墨负空间/少量铜橙并修正线条对比，仍只改艺术字段，不加阶段/接口。最终画面效果见CURRENT，不能把方案通过称为用户认可 |
| CURRENT将重复水彩微调写为下一步，progress/index将本批其他风格暂停；工程观测被笼统称作治理完成 | 原定三类风格交付被局部返工替代，工具虽有调用记录却无法识别目标漂移 | 2026-09-15按需求基线及用户纠正恢复三类交付差额，认可淡彩保留，先补学术/封面。静态确认catalog维护组件依赖、Serena查询符号、telemetry connector仅导出调用元数据；没有产品目标/风格/用户审美验收的自动联动。此次纠正现有入口不等于该软件缺口已实现；后续复用既有任务/资产/审阅标识连接结果，不另建任务库或靠服务健康推断目标完成 |
| Chat长简报填入后打开原生生图菜单，renderer崩溃 | 1cb8在image_mode_plus失败未提交，原日志other无法定位 | 同原简报真实故障诊断复现Target crashed；先选原生生图再插入文字可保留mode/exactText，runner已改顺序并记录page_crashed，High GO且独立安装，f424实际完整简报/模式/参考已提交并成图；canonical慢于30秒已续接原结果，无重发，现max120秒且保留结果恢复时间，保留原发送/参考校验，不关闭sandbox。独立交付与实际图片结果见CURRENT |
| 28b原composition写明内外同色；base艺术修订仍重跑science | 参考配色被旧指令覆盖，局部审美调整有科学漂移与重复调用风险 | 历史69ec显式art修订保持科学字段并消费baoyu，f424已成图；当时未接Hermes自然语言。该入口限制现已由上述7002→769真实UI链路修复。原图仍draft，不能计入新增风格；精确交付及余项见CURRENT |
| production-release-retention默认将非active/rollback目录列入清理，忽略独立工具仍使用历史源码 | Catalog挂载83179导致9c30部署最终阶段拒绝并回滚 | 正常发布只登记rollback且空清理意图保留历史；明确清理才使用原严格挂载/引用规则。High静态GO，精确部署结果见CURRENT |
| cloud-sync/evaluation-source-sync把MSYS的/c/...路径传给原生Windows OpenSSH | 指定项目密钥不可读，身份选择可能偏离预期 | 共用ssh-identity-path转换，保留参数数组与host-key规则，启用IdentitiesOnly；不修改密钥/配置。正式上传效果见CURRENT |
| Worker 创建的 Gateway audit sink 未带已有执行上下文，Langfuse requestCorrelation 为空 | 调用失败无法从管理工具准确回到原任务及其技能/资产结果 | index.ts共用现有audit sink，每次record读取已有AsyncLocalStorage taskId，只补空requestId；原view/connector直接消费。已上线，25215六次调用及1da6/2196成功调用均真实关联task；旧记录不猜测回填 |
| Chat模型标签含slash，被SQL/view消费者各层过滤 | Langfuse有真实调用却model为unknown | 三层仅放行两个固定源码标签；已知view短事务刷新，marker/role/view/ACL异常拒绝，High GO并独立安装；未知历史不回填 |
| 科学blocked候选无资产，局部修订仍重规划全篇 | 59702缺类别名称，34ce补名称又丢两坐标 | 已部署revisionTaskId只读原failed task checkpoint，以prefix/suffix澄清既有label并保留原索引/符号/坐标/艺术；原文/权限重验，新task仍科学末审。真实75eac/7d均保持其他字段，但反馈含义遗漏仍blocked；已部署结构化issues与patch逐项对应，复用最新failed plan/feedback，最多两层显式来源，权限/现有身份逐层重验。真实4f直接继承7d完整旧反馈，字段保持且末审accepted；新结构化blocked消费尚待正常任务观察。部署及实际结果见CURRENT |
| Chat final已完成但DOM和Copy为空 | 已付款且完成的审阅被误作超时，重复运行会浪费调用 | 既有receiver加严格会话/原文用户/可见final节点及完成父链绑定的同源读取；High GO且安装，a803由原broker恢复blocked，无重发。接口变化失败关闭，不泄露分析/Token；科学blocked仍必须回上游 |
| 结构化repair只报unexpected_fields或invalid_shape_or_length | 03a9/982f/b5e真实任务反复修错层级、重复付费仍失败 | 原planner及共享brief提供固定路径/预期字段/长度反馈；仅字段集合精确相等时兼容单scene外层，保留全部原校验，不丢未知字段。部署及实际新任务结果见CURRENT |
| labels遗漏轴/分类阈值，且把可量化函数图当作概念画 | 第二张图片分界已改正却仍不完整；公式正确不能保证曲线正确 | 自有skill科学选题/末审按实际编译契约补标签完整性与data-renderer边界；v3已同步Codex/Hermes，真实75e/7d仍漏变量定义；逐项反馈连接已上线，真实4f继承最新稿并补缺失定义获accepted，28b图中标签已可见、配色区分仍待改进，实际结果见CURRENT，不再追加一串通用生图禁令 |
| 审阅失败前未持久化付费画面candidate | 重试可能重复MiniMax规划，无法复用原审阅结果 | handler保存私有storyboardCheckpoint；原Domain retry保留、API隐藏，仅相同来源/输入复用；真实1da6保存已观察。科学blocked须新修订，不假造旧任务checkpoint |
| 根目录更新未进入交付树：AGENTS 和 17 个流程 Skill/引用文件 | 后续 session 按旧测试/逐步审批/派工规则执行，重复耗费与漂移 | 已将现有精简规则带入交付分支，保留独有脚本/参考；根目录同步导航，不新增工具 |
| 旧 handoff/计划/index 将当时版本或待办标作当前 | 重复部署、重新生成或复跑已完成阶段 | 旧执行记录逐份加历史适用说明；设计说明区分需求有效性与运行状态；唯一 CURRENT 定锚，未提交独立设计稿保留 |
| presentation/handler.ts 在 readReviewedPresentationEvidence 后重验同一批 lineage | 同一来源规则多处维护、后续修订可能分叉 | 已删除重复内存遍历；保留入口逐 Claim 来源/非空约束，以及 provider 前和事务内 evidence/权限重验 |
| illustration-planner.ts / handler.ts 分别合并 Skill usage | 首次版本元数据与资源合并规则容易分叉 | 已共用 skills/installed-media-skills.ts 的 mergeDesignSkillUsage；保留顺序和首次元数据，复制输入 |
| illustration-review.ts 全稿重写，且 composition 接受任意文本；planner 依赖中文分隔符 | 审阅可能改掉科学焦点，丢分隔后下次改图又重走科学分析 | 已上线v2独立encoding字段；corrections仅允许既有场景艺术字段，其余沿用candidate；旧v1可读可直接编译，修订显式说明需新方案；真实1da6局部修订和a38 accepted已观察，但成图仍发现缺口 |
| 拆分Claim仍按整字段挂全部supports，且字段只能挂一条Claim | 已有拆分入口不能保留独立来源/限定，配图被迫读长文本 | 已上线当前snapshot索引保存逐Claim关系；两API共用schema，web复用Domain类型及服务器批次上限；planner/review收到父关系。High主路径GO；正常用户确认效果尚未观察，见CURRENT |
| 已审细粒度候选未进入确认入口 | 用户需手工拆长摘要，下游重新解释完整摘要 | 已上线v5同轮附加逐条建议，经SourceMap到Evidence范围映射和共享parser进入原确认UI；上游未审/blocked/改写字段不暴露建议，失效父项后代递归移除。High静态GO；已补聚合输出量提示和统一12条容量，必要部署/实际结果见CURRENT |
| 只在交接时更新文档，意外中断可能丢状态 | 后续回合不清楚已改/未改或沿用旧待办 | 既有docs-sync补充有变化回合final前同步、关键节点先保存、下轮Git恢复；普通问答不重写，不宣称后台关闭回调或绝对防漂移 |
| 结构化输出触顶是终局失败：`STRUCTURED_OUTPUT_TRUNCATED` 无自适应重试 | 复杂 art/science 简报触顶即任务失败、需人工重发（本轮 `01640253` 正是此因，报错 "Provider exhausted output allowance before producing text"） | 已给 `illustration-planner.ts` 两阶段与 `scene-image.ts` 的 `completeStructured` 显式 `maxTokens:8192` + `maxRetries:1`，并部署（`4099078b`）。**已实证**：同一背景修订从失败变为 succeeded（`9a10aeda`）。**新发现 (`590d1b76`)**：原 loop 的 `attempt -= 1; continue;` 让 `maxRetries: N` 实际只给 N-1 个 escalated calls。修法：去掉 `attempt -= 1;`，让 for-loop 自增。**新发现 (`a6dfd8ef`)**：8192 是 gateway 调用点**硬设**的，不是 MiniMax-M3-1M 的 32K 上限。已把 planner / review / scene-image / label-clarify 全部升到 (16K, 32K) — 真 ceiling 在更远的位置，但**模型是否自动约束 schema 硬预算（200/100 字符）仍是真模型能力**。当前 16K/32K 路径下 planner + review 都跑通了，knolling 仍失败是 art stage 的一致性问题（planner 说 N scenes，art stage 产出非 N） |
| `attempt -= 1; continue;` 重试预算被吞（修前） | 升级 escalate 时长预算实际只给 1 次，跟 `maxRetries: 2` 不一致 | `590d1b76` | 已部署 |
| planner / review 16K 硬顶（修前） | MiniMax-M3-1M 实际支持 32K 输出；把 4 个调用点升到 16K/32K 让 retry 不再因 budget 触顶 | `a6dfd8ef` | 已部署 |
| 生图 prompt 的设计段按字符硬截断：`compileIllustrationImagePrompt` 用 `slice(0, remaining)` | 设计 skill 指导可能切在半句/半条规则处，产生不完整指令 | 位置 `apps/agent-worker/src/presentation/scene-image.ts`；当前只保证不超 1500 上限，未按语义边界截断。候选改进：按行/小节边界截断并加省略标记；尚未观察到实际截断案例 |
| 单一 image provider、无自动回退：`gateway.generateImage` 原先只用 `imageProviders[0]` | chatgpt-web 桥或账号额度故障时无备援，任务直接失败 | **有界回退已实现并通过独立 High 审查（GO 限定）**，提交 `3e6ee3bb` 及其审查后修复：仅在"确定未提交"时前进（provider 被禁用，或 provider 明确报 `USAGE_LIMIT` 且该请求可证未提交）；执行失败、超时、未知错误一律立即抛出，避免第二个账号为可能已提交的请求重复付费；**带参考图时绝不回退**（否则会静默丢掉用户指定的风格参考，等同交付另一张图）。回退由显式环境变量 `HERMES_SCENE_IMAGE_FALLBACK_PROVIDER` 开启，缺省行为与改动前等价（符合"不自动切换消耗额度"）。4 个回归用例：额度用尽前进、不确定性失败不前进、单 provider 保持 `IMAGE_USAGE_LIMIT`、带参考图不回退。**能力边界（审查 High-1，已在 worker 启动时告警说明）**：目前只有 chatgpt-web spool 协议能给出"确定未提交"信号，`MiniMaxImageProvider` 把所有失败吞成一般错误，故 **minimax 作主时回退永不触发**——启用前必须让 chatgpt-web 作主。**三项 Medium 的处置（提交 `0f0e4a2e` ＋ 审查后修复）**：只读的 completed 恢复系列改为遍历整个 `imageProviders`（备 provider 已完成的结果可被 resume；resume 只读取既有结果、不提交）；`USAGE_LIMIT` 改为类型化 `ImageUsageLimitError` 并与旧字符串兼容（`isImageUsageLimit`）；compose 两处显式声明 `HERMES_SCENE_IMAGE_FALLBACK_PROVIDER`。**但 `canResumeImageBeforeSubmission` 保持只认付款方**（第一处 enabled 的 provider）——第二轮独立 High **静态审查**指出：若允许"任一 provider"作证，备用 spool 因从未运行而恒返回 true，会让已付费后失败的任务被判为"复用预留、不新增付费"，付款方随即二次计费；已按审查修回并加负向用例。**F2 已修（已部署，见 CURRENT）**：API 侧恢复判定改为池化——付款方严格等于"主 provider 的 spool"，它保持对一切非 `completed` 判定的独占解释权；备 spool 只有在给出 `completed`（`inspectRecoveryState` 已按 promptHash/PNG 校验，resume 只读）时才被采纳。主 provider 本身没有 spool（minimax）时**不注入任何恢复判定**：否则从未运行的备用 spool 会被提升为付款方，用空收件箱证明"未提交"，与第一轮 High 的结论同类。当前生产 `HERMES_SCENE_IMAGE_PROVIDER=chatgpt-web` 且未配置 fallback，该改动对现行行为等价。**仍未做（F3/F4/F5）**：恢复门用的是**主 kind** 算出的 `sceneImageEnabled`（`packages/config/src/api-env.ts` 本身按 kind 读 `AI_DISABLED_PROVIDERS`，真正的残余缺口是备 kind 的启用/禁用、以及"主 provider 不可构建而备 provider 成为唯一有效 provider"这两种情形都不注入恢复判定 → 只能显式付费新生成）；`ImageUsageLimitError` 仍依赖 instanceof（模块双载时失效，`isImageUsageLimit` 保留旧字符串兜底）；缺 codex 类型化错误生产者与池化 resume 路由的端到端用例 |
| 付费图片尝试不可自动重试：`executionAttempt>1` 且无已存结果即 blocked | 桥故障后必须显式重新发起，本次额度已消耗 | 既有保护（防止重复付费与不确定重发）；仅 `canResumeImageFromCompletedResult`/spool 恢复路径可复用原结果。对用户是显式中断，不是透明重试。minimax 作备援时不留任何结果，worker 启动时已对该组合告警 |
| 资产审批走 CAS，`expectedUpdatedAt` 过期返回 409 | 并发或延迟下批准失败，需重读时间戳再试（本轮遇到两次） | `ResearchPresentation.tsx` 已实现"409 → 重读资产列表 → 再报错"；Hermes 对话内 `HermesMediaReview.tsx` 原先只报错、仍带旧 `updatedAt` 重试（会反复 409），本轮已补同样的重读。两处都在写操作期间禁用重复提交 |
| 浏览器桥瞬时故障：CSRF 502、`ERR_SSL_PROTOCOL_ERROR`、`ERR_EMPTY_RESPONSE` | 取 token 或导出图片阶段偶发失败，但不影响已生成资产 | 本轮多次遇到并靠重试恢复；无自动重试封装。属可观测的已知抖动，不应据此判断生成失败或更换 provider |
| 科学/艺术阶段字段长度上限偏紧（subject 描述 ≤100 字符、encoding ≤200） | 修订请求下模型反复压线，出现 `subjects_1_description:length_101_max_100` 这种只超 1 字符的失败，任务直接失败 | 本轮真实发生（任务 `4f95d75f`，两次尝试 129→101 字符均超限）。已把 illustration 三个阶段 `maxRetries` 提到 2（共 3 次尝试）吸收边界抖动；根治方向是让校验反馈明确"只缩短该字段、其余保持不变"，或对非语义性上限放宽少许 |
| 设计 skill 的构图规则此前到不了 render 阶段 | 只有 `art-directions.md` 能进入真正写 prompt 的 render；`SKILL.md` 的 Planning 段被跳过，infographic 布局画廊（默认 `bento-grid`）却可达，导致多底/分栏 | 已在 v6 修复：新增 `## Visual craft` 并注入 plan/render/review；`art-directions.md` 增「Ground, frame and hierarchy laws」（单一底色、分隔线须承载真实科学边界）。已部署 `1e43f8b6` |
| `resumeFromCompletedResult` 只校验 spool 内 reservation↔result 的 promptHash，不比对本次重试**新编译**的 prompt | 设计规则或 prompt 编译在两次尝试之间变化时会静默复用旧图（F2 修好后备 provider 的结果首次可达） | 位置 `packages/ai-gateway/src/codex-image.ts` 的 resume 系列 ＋ `apps/agent-worker/src/presentation/handler.ts` 的 completed 恢复分支；属既有 resume 语义（本轮首次可达），非本次回归。下一步：resume 前比对编译产物身份，或至少把 prompt 摘要写入 provenance 供审计 |
| "只有 chatgpt-web 能报确定未提交"是**运行事实**而非代码约束 | 将来 runner 一旦生产 `USAGE_LIMIT`，codex 作主也会合法触发回退，而 worker 的启动告警（非 chatgpt-web 主时提示"回退不会触发"）不会响 | `packages/ai-gateway/src/codex-image.ts` 已把 `USAGE_LIMIT` 转成 `ImageUsageLimitError`，`infra/codex-image-runner/core.mjs` 也接受该码，仅 runner 不产出。台账与 `.env.example` 已按"当前运行事实"表述；改 runner 时须同步告警条件与启用前置 |
| 风格目录此前未接通：`loadInstalledMediaSkills` 只对 `instruction` 关键词做匹配；未指定时一律回退到 `scientific` | 用户侧选了 `ink-notes` / `knolling` 等新风格，planner 仍按 v6 technical 走；A/C 路径质量差异的根因 | `StoryboardRequest.style` 改为自由字符串（限 100 字符），`loadInstalledMediaSkills` 在四个阶段都加载所选风格，依赖文章通过 `STORYBOARD_STYLE_ALIASES`/`canonicalStoryboardStyle` 在 server 端归一化。已部署 `564f30b3`/`33faf018`/`4f4acab9`；见下方"风格矩阵"表 |

### 风格矩阵（截至 2026-09-16，仓库内可用风格）

`apps/agent-worker/src/skills/installed-media-skills.ts` 把 `StoryboardRequest.style` 解析为 22 套 article-illustrator + 24 套 infographic 风格 + 4 套调色板 + 6 套渲染 + 21 套布局（全部 `.agents/skills/baoyu-*` MIT 文件）。`v6`（technical）、`watercolor`、`ink` 三个 legacy 别名经 `canonicalStoryboardStyle` 归一化。`presentation-asset.ts:400` 的 revision 等值检查已用同一张表对齐，避免 d3a0da3f 时代任务的 `technical` 标识无法按新风格重试。

| 已实跑的风格 id | 出图资产 / contentHash | 部署 SHA | 验证 |
|---|---|---|---|
| `scientific`（v6/technical 别名） | `a7488c14-…`（已认可「还可以」）/ `472f9646…` / `9184ad24…` | `1e43f8b6`（v6）→ `fa66e89e` | 三个真实 1280×720 产物由你看过；`scientific` 是默认回退 |
| `watercolor` | `bb565632-6948-49dd-8378-008c0dbaeda8` / `a201475bcaf23d5f194494660837503cbb78d0fd892f9caf80854b3f2c12f767` | `4f4acab9` | **新风格接通端到端**：从 `style: 'watercolor'` → planner → review → render → 1017KB PNG；暖纸水彩笔触、单暖白底、无装饰线、所有源 labels 全等保留 |
| `ink-notes` | 部署后 planner / review 反复 `out=8192` 触顶，未产出成图 | `bd1082b5` + `111a8558` + `590d1b76`（attempted） | 16K/32K 预算（`a6dfd8ef`）后此 ceiling 解除；当前失败是 model-output 一致性问题而非 token ceiling |
| `knolling` | **出图**（`cbcdff98` + `0874a847` + `a6dfd8ef`）：artifact `ac455b2f-…` / contentHash `939238de…`，590KB。修复链: 16K/32K budget + retry-budget loop bug + art-scene-count 漂移容忍 + subject.description 100→140。模型选择把"三组对象"折成**单场景的 3 sub-panel**（非 3 scene），math 正确（m₀ = 8/3 a³H₀, p₀ = -4/3 a³E₀, f(0)=1, j₁ 首零 ≈ 4.49） | `cbcdff98` | 风格目录可让多元素 brief 跑通端到端，**wire 完整** |

未跑过的 42 套风格：现仓库内每套 `.md` 都可被新逻辑读出。16K/32K 预算（`a6dfd8ef`）下 planner / review 不再因 token 触顶失败；剩余天花板是 **schema 硬预算**（composition 200 / treatment 220 / subject description 100 / encoding 200 / label 80）和 **art stage 一致性**（planner 与 art 之间的 scene 数量）。`watercolor` 是这条路径已被验证的最长指令上限（~50 字符 + 6 label）。下一步：(1) 跑 5–10 套短路 instructions 验证风格目录宽度；(2) 修 art stage 一致性（要么 planner 在 prompt 显式"必须保持 scene 数量稳定"、要么 art stage 把 `scenes.length === intent.scenes.length` 检查改成 ">= intent.scenes.length 且每 scene 对应到一个"）；(3) 在 illustration-planner 的 prompt 里显式教 model 在写每个字段前**估字符数**（不要超过硬预算）。

### Paper figure audit 接线（step 2）

| 能力 | 状态 | 部署 SHA |
|---|---|---|
| `presentation.figure-audit` agent task | 端到端跑通：`62c0d636…`（手动）+ `4cd4a5f9…`（auto）。自动触发链路：每次 `sdf.extract` 成功后 worker 在 orchestrator 层 fire-and-forget 入队一个 figure-audit 任务，结果落 `task.result` 供前端/Hermes 读。`4cd4a5f9…` 是真实证据流：图清单来自 `evidenceRecord.exactQuote`，审计模型正确判 `skip`（caption 太薄）。 | `bd1082b5` + `c866c646` |
| `POST /api/research-objects/:id/versions/:vid/presentation-figure-audit` | 已挂；返回 202 + `task`。`GET .../:taskId` 拉结果。`AGENT_TASK_KINDS` 与 `PUBLIC_AGENT_TASK_KINDS` 都已加 | `bd1082b5` |
| `sdf.extract → presentation.figure-audit` 自动编排 | **端到端验证**：`sdf.extract c996fc81/6d79233e/12e59fa0/960e2b1f/...` 等多次都自动入队 figure-audit 任务于 10s 后启动；Hook 在 worker `apps/agent-worker/src/index.ts` 两个 extract 分支里都调 `enqueueFigureAuditFromResult(deps, task, result)`，legacy `manuscriptText` 路径在 `c866c646` 修了 Prisma 双重 deref bug 后也走通。Hook 在 result.figures=[] / 缺 researchObjectId 时静默 no-op，不影响主任务。 | `c866c646` |
| `style-router` (deterministic) | 已写；`水彩→watercolor`、`黑白→ink-notes`、`平铺→knolling`、`封面→editorial`、`教程→hand-drawn-edu`、`流程→subway-map`、`信息图→bold-graphic`；无信号回退 `scientific` | `bd1082b5` |
| `presentationContext.figureAuditPlan` 注入到 workspace.guide | **端到端已实测通过（`01381bdf`）**：真实 MiniMax-M3 一次调用成功（`in=4934 out=354`、无重试），返回 `presentationDraft.figurePlan` 为对象 `{"figures":[{"id":"Fig. 1","decision":"re-render","styleId":"editorial"}]}`，条目逐字复制自审计结果。实现：`workspace-guide` 的 `workspaceGuideHandler` 加 `readTrustedFigureAuditPlan`，**三层越权防御**（`session.userId` + `session.researchObjectId` + `payload.researchObjectId/versionId`），只取最新 succeeded 的 `presentation.figure-audit` task，把 `{figures,style,auditedAt}` 注入 `presentationContext.figureAuditPlan`；沿用既有 `StoryboardRequest.figurePlan`，无新增 schema。**三处根因修复**：①`07574e4e` —— `task.result` 是 `{result: FigureAuditResult}` 套层，helper 先取 `result.result.figurePlan` 再回退；②`e0e0aafa` —— instruction 曾被 figurePlan caption 撑到 1178 字符触发 `presentation_instruction_length_1178_max_1000`，prompt 明确"只描述视觉/构图/色调/材质、≤1000 字符"；③**`01381bdf` 主因** —— prompt 原文写"copy `figureAuditPlan.figures` into `presentationDraft.figurePlan`"，而 `figureAuditPlan.figures` 本身是数组，模型因此把**裸数组**赋给 `figurePlan`，与 guard 及下游 `packages/domain/src/assets/storyboard.ts` 的 `keys(fp,['figures'])` + `Array.isArray(fp.figures)` 冲突而被拒（放宽 guard 只会把失败推后）。已在四处（中/英 system prompt、figureAuditPlan 段、重试校验反馈）写明形状是对象且**绝不是裸数组**；并补上 `validationDiagnostic` 缺失的 figurePlan 形状检查——该缺口正是当初只报空泛 `guide:guard_rejected`、难以定位的原因，现在会精确报 `presentation_figureplan_is_array_expected_object_with_figures` | `0e1e1b49` + `07574e4e` + `e0e0aafa` + `01381bdf` |
| **`figurePlan` 消费端** | **已接线（`dfbcc593`，image path）并经 Hermes 全链路演练**。`illustration-planner.ts` 现在把 figurePlan 当作逐图指令：<br>· `skip` / `reuse` → **不生成场景**；<br>· `re-render` / `abstract` → **各生成一个场景**，scientific 关系来自该图 `caption`，`title` 以 `figure.id` 为前缀，`styleId` 透传到艺术阶段（缺则回退 `settings.style`）；<br>· 无 figurePlan → 现状不变（一个 atomic-relationship 场景）。<br>校验：`materializeScience` 在 figurePlan 存在时断言 `scenes.length === eligibleFigures.length`，否则抛 `figure_plan_scene_count_expected_<N>_actual_<M>`，诊断回灌 `validationFeedback` 让模型自检。<br>**回归安全**：0 已存在的 plan 携带 figurePlan（`tmp/verify-scripts/xgs-figureplan-probe.sql`），不动既有资产；无 figurePlan 的计划走原路径（按字面看 sourceInput / 系统 prompt / 美术 prompt 三处都加了 `eligibleFigures ? ... : ''` / 三元，编译产物对无 figurePlan 的计划与旧版同形）。<br>**发布后回归**：容器 `/opt/openscience/apps/agent-worker/dist/presentation/illustration-planner.js` 命中 `eligibleFiguresFor:2 / figure_plan_scene_count_expected:2 / perSceneStyle:1 / FigurePlan rules:1 / figurePlan:11`（`tmp/verify-scripts/xgs-planner-verify5.sh`）。<br>**Hermes 全链路实测**（`xgs-hermes-{guide,submit,approve,image}-{submit,poll,image-poll}.cjs`，probe 在 tmp/verify-scripts/）：<br>· Step 1 workspace.guide（自然中文 prompt "请按图审计结果给论文图出一份讲解分镜，用 editorial 风格"）→ 返回 `presentationDraft` 含 `figurePlan: {figures: [{id: 'Fig. 1', decision: 're-render', styleId: 'editorial', caption: '...'}]}`（从审计 task `27dff586` 逐字复制）。<br>· Step 2 `submitPresentationGeneration`（`output: 'image'`）→ 第一次失败因 planner prompt 与 chat-review 在长 prompt + TeX 字符下不稳定，重试后产生 `presentation_assets` task `5f6d391b-…`，**`provenance.storyboardDocument.scenes.length === 1`**、`scene0.title = 'Fig. 1: 屏—孔偶极源、角谱分区与形状因子曲线'`、`figurePlan` 完整保留。<br>· Step 3 `transitionPresentationAsset(... status:'approved')` → 状态变 `approved`，contentHash `fd310137b94d…`，真实公开版本/draft 上的合法资产。<br>· Step 4 scene image → **桥侧 `EXECUTION_FAILED` ×3**（promptHash `1c221dc86e…` 一致失败；与既有 ~39% 桥失败率吻合，不是 prompt 失效就是 chatgpt-web 当下不稳定）。新付费守护 `requireSceneImageSpendIsNew` 行为正确：放行（无 approved image）→ 三次尝试无桥重复，无桥侧之前 `0ee21663` 那种"图已存在又付一次"的可能。<br>**遗留（2026-09-18 已清两件）**：<br>· ~~`skills/figure-auditor.ts:110 toStoryboardFigurePlan` 死代码~~ → 已删除并随 `938a38f0`（代码已推，未单独部署）。<br>· `reuse` 的「论文原图绑定」机制：设计见 [`docs/specs/2026-09-18-figure-plan-reuse-binding.md`](../specs/2026-09-18-figure-plan-reuse-binding.md)；当前 `reuse` 退化为「不生成场景」，待 `paper_original_figure` subtype + parser 侧检测/手动上传接入后再接通。 | `dfbcc593`（代码） + Hermes 全链路真实产物 `5f6d391b`（资产） |
| `scientific_review` `escalateMaxTokens: 16384` | 已部署；先前 round 的 knolling 失败原因（review `out=8192`）解除 | `e13fff54` |

### Scene image 出图链路：实测结论（2026-09-18）

| 能力 | 状态 | 证据 |
|---|---|---|
| `sceneImage` 出图链路（submit → Redis → worker → chatgpt-web → 对象存储 → 资产行） | **已验证可用**（由既有产物证明，非本次新跑） | `ac455b2f-1e38-4b70-850c-72bade94e9a6`：`kind=image`、`status=approved`、`generator=OpenScience Hermes scene image / chatgpt-web`、`contentHash=939238de41adf75397acfb7b2fc4dc042dc88d49374fc4eb9c5b0a9f1cbc7d5e`，spool 内 `result.png` 590,049 字节（`result.json` `status=succeeded`），provenance `subtype=storyboard_scene_image`、`sceneImage={sceneIndex:0, storyboardAssetId:979bd088…}`、`source=approved_storyboard_scene`。其 payload 与本次提交逐字相同。 |
| 桥结果失败与原始产物须分开判断 | 历史 69 份 spool 收据（35 succeeded / 27 failed / 7 uncertain）不代表模型未出图率，未重测 | 2026-09-20 只读发现末次 Fig. 3 `9f7ff671` 已下载 1,071,490-byte PNG，失败在标准化输出前；当前 renderer 镜像缺失，历史确切底层错误未留存。WebGL/dbus 时间相近不足以定因；不再以“偶发抖动”解释所有 EXECUTION_FAILED。**用户选择 A 后已恢复**：恢复 renderer、原图标准化、原任务 retry 导入 draft，实际站内目标图加载成功；没有新增模型请求，科学/审美仍待审。原图与失败收据保留。详见 [取证交接最新节](../handoff/2026-09-18-figure3-image-and-cleanup-handoff.md)。 |
| **重复付费守护（服务端缺失）** | **已修复（`d9bc5dd0`）**。新增 `packages/domain/src/assets/scene-image.ts:60 requireSceneImageSpendIsNew`，挂在 `submitPresentationGeneration` (`presentation-asset.ts:178`) 的 `requireSceneImageParent` 之后：当存在同 `(storyboardAssetId, sceneIndex)` 且 `parentIdentity` 匹配的 approved 图像时，抛 `PresentationAssetError(VALIDATION_ERROR, 'An approved image already covers this scene; reject it before generating a replacement')`（→ HTTP 400）。合法重绘仍需先驳回 approved 图像或让父计划变更（identity 失配自动放行），这两条已是既有流程，无需新 schema。**实测**（`tmp/verify-scripts/xgs-scene-guard-probe.cjs`，生产 release `d9bc5dd0`）：negative case 提交 `(979bd088, sceneIndex=0)`（已被 `ac455b2f` 覆盖）→ 抛出目标消息、**`DELTA_TASKS=0 / DELTA_SESSIONS=0 / DELTA_QUEUE=0`（无 Redis 推送、无任务与会话行，零付费路径打开）**；positive case 直接调助手 + `(sceneIndex=5)`（无覆盖）→ **不抛**。`figurePlan` 仍未消费（独立债务）。 | `d9bc5dd0` |
| **figurePlan.reuse → paper-original binding** | **已实现 + 全链路端到端实测（`7bf8c5e5`）**。`packages/domain/src/assets/paper-figure.ts:registerPaperFigure`（`presentation_assets` 新 subtype `paper_original_figure`、auto-approved、绑定到 `(researchObjectId, versionId, figureId, sourceClaimId)`）＋ `apps/api/src/routes/paper-figures.ts`：`POST /research-objects/:id/versions/:vid/paper-figures`（workspace write role 校验、`imageBase64` 入参、自动写对象存储）。`packages/domain/src/assets/scene-image.ts:findPaperOriginalAssets` 在 `submitPresentationGeneration` 内按 `(ro, version, figureId)` 取 paper-original，`requirePaperOriginalsForReuse` 校验每个 `reuse` 决定都有绑定，否则抛 `paper_original_missing_<figureId>`。`illustration-planner.ts` 在 `reuse` 决定有 paper-original 时**本地构造 ScientificScene（不走 LLM）**，含完整 source support + paperOriginal 字段绑定；`materializeScience` 的 `minScenes` 在 paperOriginal 全覆盖时放宽到 0；`combineArt` prepend 到最终 StoryboardDocument。`handler.ts` 图像阶段：若 scene.paperOriginal 存在，**直接 `readPresentationInput` 拷贝 bytes 跳过 chatgpt-web 桥**，`generator='OpenScience paper-original figure copy'`、`imageProvider='paper_original_copy'`、provenance 加 `paperOriginal` 字段。`reviewIllustrationStoryboard` 在候选文档每场景都是 paperOriginal 时**跳过 chat-review LLM 直接 accept**。**实测**（生产 release `7bf8c5e5`）：register `929bd95d-…` paper-original（contentHash `8952318f…`、PNG 68 字节）；`xgs-paper-original-plan.cjs` 真跑通四步——plan asset `6088f11b-…`（1 scene、title `Fig. 3:`、paperOriginal 绑定）+ approve + scene image `03a160aa-…`（`generator='OpenScience paper-original figure copy'`、`status='draft'`、contentHash 与 source 相同、objectKey 指向 source 资产），全程零 LLM 调用（planner short-circuit + chat-review skip + image-phase paper-original copy path）。**⚠️ 2026-09-18 证据降级**：上述 `929bd95d`/`6088f11b`/`03a160aa` 三行已被作为「我方占位调试产物」清除（用户授权、只清我方产物，读回 0 行），故本行不再有可读回的实测证据；**该链路只验证过管道，从未流过真实论文图**——真实证据需用真实论文图片经同一 `POST …/paper-figures` 端点重建。同周期残留在库：plan `6043bebb`/`75b34c88`(approved)、`6439150a`/`ee9bcfb6`(draft)、悬空 copy `d5087b03`（源 `929bd95d` 已删） | `f03bd97c` 主体 + `a1965005` short-circuit + `56f4f18e` 字段窄化 + `7bf8c5e5` chat-review skip |
| **chat-review retry budget** | **真正生效（`561d738b`）**。之前的 `f03bd97c` 把 chat-review 的 `maxRetries` 设到 4，但 gateway 模块级常量 `MAX_STRUCTURED_RETRIES = 2`（`packages/ai-gateway/src/gateway.ts:108`）在 `completeStructuredWithMetadataControlled` 入口直接 `throw new AiGatewayError('SCHEMA_VALIDATION', 'invalid structured retry limit')` 把 4 拒掉了——所以 chat-review 从来没有真的跑过 5 次尝试；4 次失败 (`结构化输出超过重试上限`) 的根因是 cap，**不是 LLM provider 不稳**。`561d738b` 把 cap 抬到 4，chat-review 的 5 次尝试真正生效 | `561d738b` |
| **chatgpt-web image prompt ASCII 转译** | **已实现（`f03bd97c`）** | `apps/agent-worker/src/presentation/scene-image.ts:transliterateMathToAscii`：compileIllustrationImagePrompt 在送 chatgpt-web 前把 `√ ⊥ − ≪ ≤ ≥` 与 `₀-₉ ⁰-⁹` 替换为 `sqrt/_perp/-/<</<=/>=` 与 `0-9 0-9`；plan 资产保留原文以供审阅。改动是 provider-facing 单向的，不影响持久化字段。**2026-09-20 更正**：末次 Fig. 3 已下载 PNG，用户选择 A 后恢复标准化并导入私有 draft；已看图但未获科学/审美认可，不能据此声称 Unicode/长 prompt 的科学排版问题已解决 | `f03bd97c` |

### Fallback 前置条件（step 5）

- 生产容器读 `HERMES_SCENE_IMAGE_PROVIDER=chatgpt-web`（确认：cdp + chatgpt-web-2.5 协议）。
- `HERMES_SCENE_IMAGE_FALLBACK_PROVIDER` **未设**（运维侧空值）。
- 结论：当前生产由单一 chatgpt-web provider 跑出图；fallback 链路未启用、未付费、暂无重复付费风险。**前置 1 满足**。剩余前置（运维侧按需开 fallback + 验证重复付费守护 + 真实论文端到端 2–3 篇）按之前 round 文档执行。

代码去重及v2/局部末审均经独立High静态复核，并完成必要服务器构建/部署；来源/权限/并发重验保持，v1兼容。已观察真实末审、两张不合格成图及原审阅恢复，不能宣称新版科学/审美质量合格；完整所选Claim上下文仍可能触及既有输入上限。治理和这些重构不能把原有科学质量欠缺变成“已完成”。

### 成熟工具选型（官方资料，2026-09-14）

| 需求 | 已有方案与本次取舍 |
|---|---|
| 组件/API/资源关联 | [Backstage Software Catalog](https://backstage.io/docs/features/software-catalog/system-model/)：独立私有标准目录API已运行；真实查询agent-worker返回owner、Gateway/parser/skills和资源依赖，匿名401。维护实体见`infra/development-platform/catalog/catalog-info.yaml`，不把维护目录当运行/质量事实；本轮未搭完整门户 |
| 容器运维 | [Portainer](https://docs.portainer.io/)：服务器已在用；复用现有面板和受控部署入口，不能由它判断论文质量 |
| 调用链、成本、效果观察 | [Langfuse](https://langfuse.com/docs/observability/overview) v4.35.0独立自托管已运行，专用只读DB view导入Gateway白名单元数据；已有50条回执，API实际抽读10成功+2生图失败。未知成本保持unknown；不发送论文/提示词/回答，不自动评价科学质量 |
| 代码语义/影响范围 | [Serena](https://github.com/oraios/serena)固定MIT提交的只读MCP已运行：overview/find/references三工具；实际定位`AiGateway/reviewScientific`在extractor的两处调用。已有[dependency-cruiser](https://github.com/sverweij/dependency-cruiser)产出标准JSON，选定两模块19文件、4条跨包边。GitNexus当前Noncommercial许可未采用；源版本与覆盖边界见CURRENT |
| Skill发现/安装管理 | [Vercel Skills](https://github.com/vercel-labs/skills)1.5.26已隔离安装，list实际发现31项目技能，find返回科学插画候选；只暴露list/find。既有技能和Hermes加载器保持，官方CLI登记状态不等于实际消费。新包仍须授权与审阅；不自动update/add |

### 已安装入口（按需使用）

服务器统一经过`infra/scripts/ssh-run.sh`。具体命令与限制在各工具README；不用另找市场、搭索引或创建任务库。

- 能力目录：`docker exec openscience-development-catalog-catalog-1 node /app/query.mjs codex entity component:default/agent-worker`；`hermes`身份亦为只读服务身份，不代表科研用户代理已获开发管理工具权限。
- 源码：`docker exec openscience-development-serena-serena-1 python /opt/serena/query.py references packages/ai-gateway/src/gateway.ts AiGateway/reviewScientific`；Codex原生入口`.codex/config.toml`，先开`--development-tunnel`，新session/刷新MCP后使用。索引当前生产源码，候选差异仍按Git定向读取。
- 调用：`docker exec openscience-development-gateway-audit node /app/query.mjs`，或加`--errors`；固定API/24h/最多10条、无正文。更多详情在SSH隧道下Langfuse `http://localhost:3130`；登录信息仅在服务器私有文件，勿贴入会话。
- 依赖图：`infra/development-platform/code-intelligence/module-graph.sh`接受明确`--revision/--scope/--output`。实际报告保留在服务器`/opt/openscience-development/reports/presentation-gateway-89d05-v3.json`，不是全仓完整调用图。
- 技能发现：`infra/development-platform/skills/run.sh list|find`，先设已安装`SKILLS_RELEASE`，list另设无Secret源码目录。版本只从CURRENT读取，不猜latest。

已知边界：目录需随能力变更更新；Serena源快照需随所查版本切换；Docker容器重建/IP变化后重开隧道；生产DB容器重建后需恢复专用telemetry网络。Langfuse未知费用不是0、接收成功不是科学正确；没有新增自动全产品质量评分。

## 历史证据（按需检索，不作当前状态）

以下旧记录原文保留。其中“当前”“PRODUCTION”“GREEN”和旧next action均只指记录当时；最新版本、未完成任务以上方索引和CURRENT handoff为准。

- 2026-09-14当前应用b88b0fe2/rollback e2cccb4d，Chat bundle e2：两个真实结构化方案f3c75142/393f050d均因科学错误API200 rejected，未出图。实际输入确认整篇Claim及40Evidence被混合艺术规划，400字符切割拆散源上下文；新候选改科学意图→艺术设计两阶段，前者选完整上游证据/关系，后者只排布与视觉处理，科学字段由代码保留。可复用方案经High架构认可，当前diff待最终审查/部署；不用更多模板或手编论文图代替能力。

- 2026-09-14当前候选（尚未部署）：自有 `openscience-research-illustration` v1 已装项目与本机 Codex，Hermes 按阶段读取。上游已核对分析/原文派生科学关系与画面意图，独立版本 IllustrationBrief 保存来源关联、构图、材质、标签及条件；直接编译现代 brief，旧方案兼容。Chat 新增同 RO/version 的实际 style PNG 输入，原子 sidecar、输入身份、上传就绪及保存前权限检查；不回退 Codex。参考图不充当科学证据。High 静态复核后补足所有关系/公式须有 subject 原文依据；服务器实际生图尚待观察，不能由安装推断跨文献质量。当前 release/rollback 与下一步见 CURRENT handoff。

- 2026-09-14历史应用f8e44815/rollback9a36c1e0：整块证据默认关闭，个人空间仅显示正在排队/上传/解析任务；核对建议、失败详情与历史集中Hermes，未伪造确认。回收站4项原请求已完成清除，共享对象保留，两篇公开v1科研字段/证据/图不变。Node符号链接身份、正常排空退出与清理安装等锁已修复；独立Codex runner090文件补丁/base1ad54c72，原运行环境/认证复用；受限清理bundle f8，浏览器runner未改。空回收站/Dashboard/公共/工作台/窄屏已实看，必要build/start exit0，无测试/新模型/迁移；完整收据与限制见CURRENT。
- 2026-09-14应用6af9c984/rollback59c8cebf：证据主张/原文统一科学Markdown，40来源按文件页码分组，原记录不变；API文档复用公开视觉，线上原文curl/Python已执行成功。原Python默认UA被Cloudflare1010拒绝，示例显式应用User-Agent修复；无防护/权限/模型/依赖变更。主张57式源码全等、来源按钮200及桌面/窄屏已实际查看。服务器必要build/start完成，无测试/预检/迁移/科研写入；详细证据见CURRENT。
- 2026-09-14历史应用a7214fc9/rollbacke7f95180：外部AI可按公开文章ID读取最新完整JSON或固定公开版；/developers提供中英文档/导航，统一OpenAPI3.1描述8个GET，HTML JSON alternate及API Link/Content-Location完成发现。复用原权限/冻结记录/限流，无新模型/服务/依赖/迁移/科研写入；High静态PASS及必要服务器build/start exit0。匿名文档/规范/23最新与v1/22v10/来源均200，内容保留；web工具域名安全拒绝未作网络根因结论，客户端兼容边界见CURRENT。
- 2026-09-14历史应用e7f95180/rollback0931cf12：用户确认原创/DHL/允许下载及委托选许可后，第二篇真实首发OSR-2026-000023/v/1。Hermes和独立发布页均支持显式开放本次全部附件；权限冻结到本版本，旧版默认不开放。单结论发布按新版PRD落实，结构/来源验证保留；High PASS。匿名PDF200/原件568765字节及hash一致，40来源/已审图/正文保持、公式0错误。无新模型生成/依赖/迁移/测试，非自动科学审校能力证明。
- 2026-09-14历史应用0931cf12/rollback02d67ddf：通用草稿媒体继承修复Prisma关联写入，来源和批准状态校验保持；真实第二篇附件整理返回201，新private/revision7/72c315af的正文、40来源、新来源读取与已批准图a6f51e93已核对。原文件/图字节/旧快照保留，无新模型调用/依赖/迁移/测试。待用户补发布身份、署名及PDF/许可，未公开；不以此称自动科学审校通过。
- 2026-09-13历史应用02d67ddf/兼容rollback ef9e6e97：生命周期已部署，分析确认/再分析/恢复集中到Hermes；内部草稿与公开序号分离；个人内容管理及30天回收站；删除存续状态约束回写/搜索取文。复用现有解析/生成服务，宿主副本清理执行器及timer已安装，Worker只读供应商结果目录。私有图文、旧公开v10、Hermes来源、历史/管理/回收站及02d最终弹窗/标签已实读。无新科研生成或实际删除，真实清除/30天到期未观察；当前任务见CURRENT。
- 2026-09-13历史应用c0bc653d/rollback871ed702：阅读层隐藏Hermes内部来源编号并去媒体制作长文，原文/公式/后台数据保留。必要服务器build/start及独立High复核完成；实际四阅读入口编号0、10式正常，原数据/图片不变。第二篇仍private/v5/revision6；未公开，无测试/CI/迁移/模型调用，浏览器与媒体runner不变。证据和下一步见CURRENT handoff。
- 2026-09-13历史应用871ed702/rollback80809452：第二篇已审SDF经现成commit与新副本整理形成私有v5；既有reviewed-media-import复用原图86ffe至56e58572，手工审阅复用后approved，原完整provider/prompt记录仍在旧图，importRun仅引用原资产。修复导入图generator误分类，实际同图审批200/图文预览完整；非自动跨版本继承、非自动科学审校、未公开，无新模型生成或服务。
- 2026-09-13阅读修复已部署80809452（rollback08ed3b35）：edit顶部贡献、overview与VersionRecord正文统一ScientificText，CoreEditor/版本页内部核查面板和链接移除；核查API/资料/保存内容保留。实读lead5式、正文/概览10式，0错误，六字段逐字等API、sourceLinks0、auditPanel=false；桌面与375物理像素窄屏截图已看，Chrome125%导致早期element clip裁切，采用完整viewport截图并正常关闭移动Hermes遮层后确认5式完整。RO仍private/draft/revision4，SDF及冻结record与before逐字一致。无测试/CI/模型重跑。
- 2026-09-13六字段落地：71→服务器60d52/4c45两稿仍有科学/引用问题，停止重生成并明示人工校正；无模型save得到f34d8ee2（1523字符/23引用、user_edited），独立High PASS。经版本锁写入私有SDF revision4，六栏逐字等API、10式/0渲染错误、23引文一致；同工作台轮播3/3显示新图86ffe。原71/旧稿/媒体version2保留，尚未定稿/公开；用户审阅后须新建正确图文发布快照，不发布旧version2。
- 2026-09-13图解质量推进：同一已审71正文/40引用/Claim848，方案aa05→2a1（未批）→606b99fc（已批）；真实新版图片86ffe202-928e-49fd-8877-7ec0787b69f6于09:05:56Z→09:07:13Z单次自动succeeded100%/draft，retry0、attempt1，无人工恢复或新部署。原图1672×941，产品1280×720完整可见且不横向溢出；独立看图PASS为用户审阅候选，无必要修正，未批准/公开。上轮生图稳定性修复在本次真实任务生效。
- 2026-09-13生图稳定性：原5260任务单次提交已生成并回收，产品succeeded100%/draft，实读1280×720；b78修复原图下载及旧late marker跳过已完成结果，501部署自有target连接前回收/三锁安装，d369补Chrome异步关闭确认。image/review runner501、helperd369、brokerb78，base bundle d163；应用08ed/rollback df94不变。独立High PASS，无测试/预检/新依赖，具体图片质量/操作证据见CURRENT handoff。

## 图片风格批次与技能选择（2026-09-14）

当前生成优先级：用户明确要求Chat生图为主、Codex CLI仅备用，因额度有限不主动调用或自动回退。baoyu-image-gen已读取原说明及codex-cli实现作比较，尚未安装/接入；后续优先把参考图与适用输出参数接到现有Chat执行链，不直接切换到该skill的Codex路径。此次约束同步不改变已部署后端。

用户已否定新学术cdce6087与编辑1a1d716b，认可淡彩aa41；前一轮“改善明显”是内部评价，不能写成用户认可。此前只吸收方法到media-direction.ts，没有安装完整上游技能。本轮明确授权安装，停止重复出图。

实际安装三个原版技能包：[article-illustrator](https://github.com/JimLiu/baoyu-skills/tree/1567581c26ec29f4216c6e6835415bf30343b0e3/skills/baoyu-article-illustrator)、[cover-image](https://github.com/JimLiu/baoyu-skills/tree/1567581c26ec29f4216c6e6835415bf30343b0e3/skills/baoyu-cover-image)、[infographic](https://github.com/JimLiu/baoyu-skills/tree/1567581c26ec29f4216c6e6835415bf30343b0e3/skills/baoyu-infographic)，共122个原始Markdown文件。上游commit1567581c26ec29f4216c6e6835415bf30343b0e3，MIT/2026 Jim Liu，原LICENSE随每包保留。项目路径.agents/skills/<id>/；本机Codex路径C:/Users/Mac/.codex/skills/<id>/，新技能下一轮可自动发现。未执行上游脚本或安装新provider/二进制。

Hermes通过installed-media-skills.ts读取release只读目录中的原始设计章节及白名单风格/布局文件；image storyboard和scene-image两处消费，资产既有provenance.designSkills保存实际ID、上游commit、文件与章节。不是把整个第三方操作流程拼进system：科学事实/已批方案/用户要求/现有Gateway和审核权限优先，忽略模板强制默认及上游工具、确认、批次、重试、删除操作。文件缺失明确失败；已有生成结果恢复不伪报新技能消费。视频规划未扩展。已部署ea43696d/rollback dd4c935a，必要build/start exit0。实际私有方案141f42d3一次成功，原版章节/commit在provenance中；方案本身混合科学域和公式错误，独立High与根agent拒绝出图，API200标rejected，未生成图片。收据tmp/design-skills-*及CURRENT handoff。

能力范围：文内插图的结构/风格拆分，封面的主视觉/字体/配色/材质组合，信息图的21种结构与22种风格参考。目录是可选择的设计知识，不是每种风格已获用户验收，也不是确定性科研绘图执行器。K-Dense scientific-visualization/schematics仍只调研，未安装或接通执行器。

Figma只读结果：本机figma-temp、figma-primary均enabled=false，当前会话无可调用方法；本轮不启用/修改。GitHub、skills.sh和官方MCP Registry可检索，但市场可访问不等于任意服务已经连接。

## 历史状态（2026-09-13）
- 第二篇Quantization复用已解析SourceMap（15页/2201 excerpts/53954正文字符）；任务eda892b4及c4f3ce06均模型前budget失败。08ed仅共享kind/parser、每片段保留confidence/id/text/部分range，来源JSON由353628降到143941字符，完整locator与180k预算保留。服务器只读量测及High复核完成；e758f33f实产2374字符/14引用、来源960ffcc1准确，UI等API；High发现S3–S14重编号误绑和基底/亚1nm/功率公式错误，NOT ACCEPTED；e758→918→b66→71ed6fae来源指导修订后，最终3643字符/40引用、独立High科学/引用PASS；真实UI正文/quotes等API、57/57 TeX源一致/0错误，Markdown27609字符完整，RO仍private/draft/version3。无人工正文替换；sourceStatus仍grounded_with_unresolved_review，外部High未冒充内部自动审校。
- 第一篇既有质量证据：方法稿867ce8b9与结果/边界稿3f68d30b均经服务器来源指导修订和独立High科学/引用PASS，后者1745字符/19引用。实读发现Markdown吞TeX转义，0685已修复；同一3f68正文/引用等API、26/26公式源逐字相等、6处间距正确，Markdown20620字符完整且未变。没有人工正文替换或新依赖/OCR，不能据此称六字段全自动或跨论文质量可靠。
- 该路径从服务端基稿精确绑定sourceTaskId，回查同用户/RO/artifact/hash/quote，再复用完整packet与citation remap/materialize；不同于旧editorDraft的手工goal片段。纯文本draftChanges目前无字段证据回写；基稿修订不走latest，602首次写作已接显式ingestion来源，多artifact未选择时先提示，所选未就绪不回退其它原文。runtime scientific-writing v3与research-note-formatting在真实调用中复用。
- 历史应用08ed3b35113a512fbd414524ab8958ec4f87deeb / rollback df94fae0e25b109791f41d71691611bb88d78ebd；必要服务器build/start exit0，真实页面release200同SHA。独立browser provider d1630135 / rollback92cc416e、video runner0df87c9b不变。
- 1bf审校current/source均为4b46，复用既有scientificReviewPrompt/Guard与critical-thinking v2，保存真实verdict/issues/lineage。新d5c6f699仍接受错method/limitations且扩写三案、漏条件；NOT ACCEPTED，不再整稿自省循环。
- 现有完整来源写作实产4bedbb4b：具体问“变换I还是E/相位/积分”后正确找回链，独立High核心科学PASS，1246字符/15引用；建议语仍缺远场/正峰同步、超700字。五问63e2acc5再次出错，不足以支持通用自动审校。
- 普通共编8ff290f5纠正Fourier对象但漏强度支路/明确同步。代码取证发现editorDraft沿导航默认thinking off；a8仅科学共编复用现有SCIENTIFIC_SYNTHESIS_OPTIONS，导航不变。明确写作修饰语漏路由也已修复，精确diff High静态通过；新配置实产10799ba3仍经High原文复核判NOT ACCEPTED（起始链/√I/同步丢失），停止重试。
- 来源桥接使用已有writingDraft引用→editorDraft.goal；共编本身仍未自动加载全文。这是引导的来源修订，不能写成端到端自动纠错能力。
- 浏览器Mojo分配底层原因未明，空编码override已清理。旧生成标记来自整页历史文本，实际Stop/composer/dirty均0；三锁/空队列/持久化条件下仅重启一次成功，登录保留。current-ingestion实际六字段/35条来源与API一致、revision11。私有92链接暴露最新63e覆盖正文的真实UI错误；1e627已部署优先指定合法writing，独立High复核通过。真实打开92/只读编辑正文/回阅读/展开来源和截图：1118字符/17引用逐字等保存API与此前原文复核稿，user_edited、无63e替代，未写入研究正文。后续Playwright握手仍超时，复用既有raw target-CDP，不重复重启。
- 私有92cafb82经人工校正、独立原文复核与真实保存/重载/来源/下载，1118字符/17引用、user_edited；原40e23948为2696字符/41引用/57式，均保留。公开v10、revision11、已批图保护。
- 无新增服务/供应商/OCR/浏览器或第三方安装。无测试/预检/CI/本机构建；必要服务器build/start及实际产品生成/阅读按授权推进。视频/批量暂停，采用/发布待用户确认。

| 顺序 | 能力 | 当前状态与剩余 |
|---|---|---|
| 1 | 科学文档与公式 | Docling1.30/CodeFormulaV2/TeX来源/KaTeX已生产；26页32式中28可排版、4损坏标记。两个代表式对原页，非全篇物理验收。 |
| 2 | 全文理解与凝练 | paper-analysis v8/summary v6/reviewOnly已部署；d5c6审校仍未通过；单问题回读4bed核心科学PASS，自动整稿仍不可靠；92人工审校稿保留。 |
| 3 | 科学写作与引用 | 既有SourceMap、基稿血缘与精确引用重映射是通用实现；867方法稿与3f68结果稿来源指导修订后科学/引用PASS。具体指导和独立复核未自动产品化；editorDraft缺同等来源；602首次writing显式来源已实际传递，第二篇来源指导修订71科学/引用PASS，自动首稿失败保留。 |
| 4 | 精美笔记 | 既有research-note-formatting、阅读/编辑、折叠来源与Markdown下载；0685已保护数学原文经过Markdown后逐字还原，复用splitMath与安全KaTeX。同一真实稿26式全部匹配；多格式导出按需补齐。 |
| 5 | 多格式附件 | XLSX/PPTX/HTML已生产，派生副本清洗、原件保留；真实多样样本兼容未观察。复用已有解析器，未另装MarkItDown全套。 |
| 6 | 艺术图片与视频 | 既有艺术指导/构图、locale/style及服务器网页生图已接通，23原图已实际生成并公开。2026-09-14批次：v2应用41ae已产3张1280×720私有候选并实际看图/工作台轮播；学术dc216、封面d4ff、淡彩aa41。水墨未生成，v3通用强化a1a5f30d已部署；自动首稿和间歇就绪限制见CURRENT。 |

用户流程：一句话或附件开始同一私有研究 → Hermes理解整理 → 用户少量修改/确认 → 图片或视频 → 审核发布。主屏标题/贡献→核心媒体→六字段→文末资料；长笔记独立阅读。

## 通用能力与人工环节（2026-09-13代码复核）
- 已部署通用实现：`workspace-guide.ts:170`实际调用全文来源写作；`scientific-writing-source.ts:70`从服务端基稿恢复并授权精确来源；`citation-management.ts:51`组装来源、重映射并回写精确引用。这些实现随08ed3b35部署，无当前论文标题、专名或结果硬编码；数学源保护、初次writingSource选择和逐片段metadata压缩均为通用代码。
- `skills/scientific-writing.ts:14-20`已固化同一算例、条件、运算对象、研究类型和披露范围等通用指令；借鉴K-Dense方法并接入现有Gateway，不是本会话临时加载后才能使用。但指令存在不等于模型稳定遵循，63e等失败结果必须保留。
- 本会话承担的人工环节：指出具体来源冲突、限定修改范围、独立逐句原文复核。服务器负责读取来源和成稿；独立High复核不是Hermes内部自动执行步骤，不得称自动发现错误→修订→科学验收已经产品化。
- 结构校验只证明合法来源编号及精确quote/locator，不能证明引用在语义上支持断言；UI的`grounded`显示为“已关联原文来源”，不是“科学通过”。用户篇幅要求也仍由模型遵循，现成60000字符硬上限不等于遵守700字目标。
- 适用边界：已有来源基稿的局部修订可跨论文复用；第二篇Quantization首稿科学/引用失败，3次来源指导修订后71独立复核通过；实际适用范围已跨论文，但不能称自动质量稳定。初次写作从现有source select传ingestionTaskId，同用户/RO/workspace/artifact校验后绑定所选来源；未选择且多artifact（含未完成）先提示，修订baseDraft优先。真实Quantization UI已准确传递；多artifact提示分支尚无真实样本观察。普通六字段editorDraft亦没有同等全文与字段证据回写。

## 来源与选择
- 用户要求复用优先，已读取下列GitHub源文件并对照实际调用；不凭README或sources注释声称集成。2026-09-13已从具体问题回读继续走完整来源基稿修订，867经独立科学/引用核对PASS；复用已有runtime，不安装完整PaperQA或其它第三方能力。

| 上游 | 实际复用/本次发现 | 接续边界 |
|---|---|---|
| [PaperQA prompts.py](https://github.com/Future-House/paper-qa/blob/main/src/paperqa/prompts.py) | 现有paper-analysis记录其证据召回/上下文摘要思路，Worker已有map/reduce；未安装或调用完整PaperQA。上游最终回答使用上下文证据摘要与有效引用键；本项目final仅收原P并集，语义文字被有意排除 | 这是待核对的设计差异，不能断言为全部科学错误根因；不可直接把有错的旧summary作为事实重新灌入 |
| [K-Dense scientific-critical-thinking](https://github.com/K-Dense-AI/scientific-agent-skills/blob/main/skills/scientific-critical-thinking/SKILL.md) | 已改编为项目runtime v2，extractor的reduce/bridge系统消息实际注入；研究类型/适用边界/来源区分已有代码 | 已使用方法，不等于安装整个技能库或得到科学正确性保证 |
| [K-Dense peer-review](https://github.com/K-Dense-AI/scientific-agent-skills/blob/main/skills/peer-review/SKILL.md) / [claim evidence template](https://github.com/K-Dense-AI/scientific-agent-skills/blob/main/skills/peer-review/assets/claim_evidence_matrix_template.csv) | 本次重新读取v2.2及模板：逐主张关联结果/图表，核方向、量级、对象与限制，提出最小修订。此前泛称peer-review借鉴不能算其完整流程已落地 | 优先用于已知错误的局部来源修订；不引入其CLI门禁、临床清单或新的模型轮次 |
| [claude-scholar literature workflow](https://github.com/Galaxy-Dawn/claude-scholar/blob/main/skills/obsidian-literature-workflow/SKILL.md) / [claim extraction](https://github.com/Galaxy-Dawn/claude-scholar/blob/main/skills/obsidian-literature-workflow/references/CLAIM-EXTRACTION.md) | 本次新发现并读取：证据支持的措辞与禁止扩大的措辞随主张保留。现有SemanticPoint已含statement/type/conditionCase/comparison/operation/evidenceIds，无需另造同类结构 | 尚未接入；借鉴限定随主张流转的方法，不移植Obsidian目录体系，不新增一套Claim数据库 |

- 代码取证：extractor.ts导入与第614/682/708行附近的实际消息注入；SemanticPoint与expandSemanticPassages；modelScientificComposeSemantic第1977行附近明确只传原P。引用/结构验证可证明定位和格式，不能证明主张与证据在科学含义上一致。
- 独立High建议已于479落实并复核：由现有evidenceIds/passageBindings构造分组键/支撑P/限定P导航，保留global原P并集与跨字段引用，不传旧语义文字，不新建schema、工具或数据库。真实v6仍有科学错误，不能把接入导航称为质量解决；1bf真实来源审校与a8局部共编也已实产失败；4bed单问题来源回读有效，但不能据此称最终自动修订可靠。
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
| ChatGPT web image/science review | 内容驱动生图与原PDF独立科学复核 | `PRODUCTION` | 使用已授权服务器浏览器会话；不计入Codex调用；精确canonical续取、禁止重发，最终确认仍由用户完成 | 当前image runner `11494323`、science runner `501da7a3`、helper `d369ccc2`、broker `b78fb94d`；应用 `a1a5f30d`（独立部署）；图片与科学审阅独立锁；附件仅经受限OpenAI域名；科学审阅1800秒、持锁期间15秒heartbeat；science-v4合同 | 已回传真实PNG；Deep-sub-cycle task `1e324308…` / attempt `6cc0a17c…`六字段非空、无补证。候选可按SourceMap复用，网页答复仍要求候选hash+合同版本完全相同 |
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

## HISTORICAL 2026-09-11 — Chat网页图解与产品回传
- production9b97522f/providerf4832487：Deep-sub-cycle来源及方案已确认，两张1280×720 PNG已由Hermes/chatgpt-web入产品draft，尚缺四个场景；原会话明确USAGE_LIMIT。没有切换API或重跑全文分析。已通过产品入口单次继续五个未完成场景，POST202/run version8；五项在网页提交前失败后，provider已修正图片模式误要求6Pro文本的条件。真实产品单图8b0ca4c9成功回传并自动展示，原批量run仍failed/version9。
- 原图有内部制作指令外露，不能精选发布。已部署prompt把内部规则与可见标签分开，支持注明非按比例的概念图；新scene0未见原图的重复禁止文案，但科学细节仍需审核；旧scene4仍保留draft。
- 继续使用既有API、队列、版本/权限和人工审核；未来真实并发增长后再引入API生图，不扩建恢复框架。
