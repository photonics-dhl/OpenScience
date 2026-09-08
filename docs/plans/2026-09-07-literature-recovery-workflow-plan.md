# 文献任务恢复与可见状态完整验收

## 范围与基线

- 分支 `codex/token-smart-live-workflow`，起点 `1b974dd`；生产 `5e4b4d4`，rollback `8e4ecb2`（本任务不部署）。
- 来源：当前 handoff 的 RO Files/Hermes 内部恢复任务仍被折叠隐藏问题。
- 交付：恢复、轮询、成功/失败/重试、全文入口、手动折叠与 scope 切换的完整前端流程；沿用现有后端、身份与幂等合同。
- 不把旧本地 Task2 当作未完成任务；新远端 Task1–12 已全部完成。旧隔离目录保留、不合入。

## 执行与验收

1. 使用现有真实页面/API fixture 复现 `initialTask` 缺省时恢复结果不可见，保留 RED。
2. 网页普通 Chat 分析状态归属与切换竞态；本地根据当前源码采纳具体建议。
3. Terra 实现并验证修复；Sol/high 在独立同基线 worktree 作纯本地对照，不读取网页答案或另一实现。
4. 浏览器验收：Files/Hermes 自动恢复展开、进度到成功/错误、可恢复重试、全文操作不重复创建任务、手动关闭不被同任务轮询重开、新任务打开、跨用户/RO旧响应不泄漏。
5. 必需质量：针对性 RED→GREEN、相关 Web 单元与已有文献 browser 回归、Web typecheck/build/lint、独立高推理复核。测试 API fixture 不代表生产全链路验收，不写生产业务数据。

## 成本口径

- 记录主会话、所有实际子任务、浏览器调用/失败/恢复及必要复核的 Codex tokens；普通 Chat 服务端生成独立，不计入 Codex。
- 按公开标准模型/缓存费率估算 credits，非账单。纯本地对照与优化实现都使用同一基线和验收要求；对照一次，不反复抽样直到出现正结果。
- 错误基线发现、环境准备、研究及脚本配置单列但不隐去；完整本轮净消耗与稳定执行阶段估算分开。
- 原始证据留 `test/research-intelligence/out/token-smart-live/`；对照留其独立 worktree。没有完成质量与成本核对前不声明净节省。

## 实际路由与证据

- 普通 Chat `6 Pro` 已收到状态设计问题并返回完整分析：[状态设计验收](https://chatgpt.com/c/6a9e62fb-4164-83ea-929a-8d7eb35aeff0)。采用了任务状态由子组件管理、展开由外层管理、同任务更新尊重手动折叠、按用户/RO和请求代次隔离的建议。原文留 `web-response.txt`；这不是网页执行本地测试的证明。
- 优化候选由 Terra/medium 实现；独立同基线 Sol/high 对照位于 `../token-smart-live-control`，对照完成前不得读取候选。随后复用 Sol 作独立审查，阶段分开。
- Sol独立审查进一步确认用户身份state滞后、旧task跨scope显示、initial intent一次性boolean、卸载后下载副作用未失效。已升级由Sol/high接手候选组件，Terra仅负责真实生命周期测试；最终由主会话复核。该返工计入优化路线，不能报告Terra首轮达到同等质量。
- 首版候选浏览器8项、focused unit9项、Web typecheck/build通过；主会话运行 Web 全套得到68文件526项 Vitest及5项 Node测试通过。后续复核发现旧scope提交/重试/下载仍可写回，首版通过不足以交付；随后补充真实回归并升级修复，最终结果见下。
- 候选最初RED受旧依赖构建阻断，不记为有效行为RED。独立对照在同基线上观察到恢复后 `details.open=false` 的有效失败。
- 当前试验的会话日志读取/汇总命令被自动审批以 `blocked by policy` 拒绝，没有提供具体原因；未换路径重试。无法取得本轮完整、可比的tokens与模型加权消耗，因此当前净节省率为**不可测，不是0%，也不是此前局部试验的63.5%**。
- 错误基线派工、环境准备、主会话转交、返工及独立对照都是本轮真实开销。不能用普通Chat生成不占Codex额度，推导整个开发任务必定节省。路由已实际发生；质量和成本应分别判定。

## 最终代码复核与验证

- Sol修复后主会话复核了完整组件diff，并要求补正恢复等待期间手动关闭、跨scope恢复完成状态两项边界；修订后未发现本任务范围内的未处理阻断问题。网页负责候选设计，Sol与主会话承担工程正确性，测试采用真实组件而非只断言guard辅助函数。
- 当前源码 Web 全套：68个文件、526项Vitest和5项Node测试通过；根 `lint`（含workspace与docs-sync）通过。最终单独执行 Web production build退出0、21/21静态页面生成完成。先前缺失 `/_document` 的构建失败已在停止测试server后的串行构建消失，不能证明最初失败一定由并发导致。
- 最终日志：`1788767507111-0e4e71e7-c7e3-403c-9a23-9c8926c9217b.log`（Web test）、`1788767523054-9ca89401-f622-48ca-ae9e-1f7db7a09eff.log`（lint）、`1788767545975-8331f6a3-dcac-43c2-8e0a-a7ee95f7b72e.log`（build），均位于本计划所列忽略输出目录。
- 最终浏览器回归已串行完成：新增12/12（22.5s），既有文献1/1（8.6s）；主会话已核对原始日志 `final-literature-disclosure-recovery.log` 与 `final-existing-literature.log`，均位于根 `test/research-intelligence/out/token-smart-live/`。覆盖真实同组件RO/user切换、延迟提交/重试、卸载后下载以及pending期间键盘开关；没有专门A→B→A的行为用例，不将代次代码审查冒充该场景的实测。测试使用受控API响应，不等于真实生产获取论文、对象存储下载或完整科研业务链已经验收。
- 全局 `token-smart/references/routing.md` 已将跨用户/对象异步状态归为Sol复杂工程路由，并明确同组件竞态必须有真实行为证据；原文件备份在本机Codex备份目录。此规则来自本轮发现，不冒充模型性能统计。

## 复现与交付边界

从本候选worktree执行：

```powershell
npx pnpm@9.15.0 --filter @openscience/web test
npx pnpm@9.15.0 --filter @openscience/web typecheck
npx pnpm@9.15.0 lint
npx pnpm@9.15.0 --filter @openscience/web build
npx pnpm@9.15.0 --filter @openscience/web exec playwright test test/e2e/literature-disclosure-recovery.spec.ts --config playwright.config.ts
npx pnpm@9.15.0 --filter @openscience/web exec playwright test test/e2e/auth-dashboard.spec.ts --grep literature --config playwright.config.ts
```

build与使用同一目录的Next测试服务串行运行；harness依赖现有锁定依赖，未新增安装。测试启动服务仅监听回环地址，运行结束后已停止。

本地产品修复和流程试验已完成；未提交、合并或部署。后续集成应沿CURRENT生产验收规则执行。此次结果支持“网页分析可进入真实开发流程，模型可实际委派并按质量问题升级”；不支持“Terra可独立完成这类复杂任务且保持同等质量”或“已证明整项任务净省量”。正常开发不再为计量重复实现一遍对照。

## 2026-09-07 用量、路由和质量的获取调查

### 已实际核验的入口

- 当前官方账号工具能返回额度窗口和credits余额，但不是单任务明细，无法用一张事后快照还原本任务成本。
- 本机 `codex-cli 0.153.4` 的 `app-server generate-ts` 已成功生成协议；只生成公开类型，未读取历史会话。类型证据位于本机临时目录 `C:/Users/Mac/AppData/Local/Temp/codex-metrics-schema-20260907/v2/`。
- `GetAccountTokenUsageParams` 支持 `threadId`；返回的可选 `ThreadUsage` 包含 `estimatedUsageCreditsMicros`、按 `model/reasoningEffort/speed` 分组的tokens。字段单位是百万分之一credit，须除以1,000,000；它仍称estimated，不能当发票实扣。
- 官方 `codex app-server proxy` 连接桌面控制socket失败：Windows错误10050。未修改代理、权限或重启桌面程序。
- 使用官方独立 `app-server --stdio` 初始化后，仅调用 `account/usage/read` 指定当前任务，成功返回账号summary，但 `threadUsage=null`。未发起 `turn/start`、未读取会话正文、未运行额外模型任务；探测进程随后关闭。null表示该入口没有提供明细，不能解释为免费或零消耗。
- 上述是公开用量接口调查，不是换工具重试被拒绝的历史会话日志读取。历史净节省率依然不可得，不能因为发现接口就宣称计量已接通。

### 后续任务应采集什么

| 指标 | 一手来源 | 处理要求 |
| --- | --- | --- |
| 请求与实际模型 | thread设置/turn请求、settings更新、`model/rerouted` | 保存model、effort、serviceTier及切换时间；仅记录委派参数不能证明服务未重路由 |
| 分任务tokens | `thread/tokenUsage/updated` | 保存threadId、turnId、total/last内输入、缓存、输出；累计total取差值，不能逐事件相加 |
| 子任务归属 | parentThreadId/委派事件 | 对每个实际子任务建立归属，查明父统计是否包含子任务后再汇总，不能漏算或重复算 |
| credits | `account/usage/read`任务分组；缺失时按官方费率估算 | 按实际模型、缓存与速度加权；模型切换区间无法归属时标unknown |
| 完成质量 | 同需求验收用例、独立审查、实际构建/运行证据 | 分开首次通过率、返工次数、最终通过、未测场景；最终绿灯不表示首轮质量相同 |

本机类型 `TokenUsageBreakdown` 还含 `cacheWriteInputTokens`、`reasoningOutputTokens`；保留原始字段，未明确收费关系时不擅自额外计费。推理输出若已包含在输出tokens中不得二次相加。官方OTel另提供conversation模型/推理设置和response.completed token事件；这是后续运行的候选采集途径，当前没有启用或验证桌面进程导出。若采用OTel，原始工具事件可能含输出片段，须本机接收并只保留所需用量字段，不能以关闭prompt记录就声称全部事件无内容。

### 节省率与质量判定

```text
token节省率 = (1 - 优化路线Codex总tokens / 同任务对照总tokens) × 100%
credits节省率 = (1 - 优化路线Codex总credits / 同任务对照总credits) × 100%
```

二者必须分列。分母必须大于0，且两边覆盖同一质量范围、主会话、所有子任务、网页操控/取回、升级和返工。普通Chat服务端生成单列，不混入Codex用量；Codex整理/传输/读取答案的开销仍纳入。重复或断流事件应去重并标记缺口；缺失不补0。一次性研究/安装/对照成本与常规执行阶段分别显示，但完整实验总量不能隐去它们。

本次只能判定最终本地验收通过、Terra首轮未达到交付要求、后续已升级修复；没有干净的同质量成本对照和完整用量，不给模型总体质量评分或净节省百分比。下一次有代表性的任务先验证采集器收到主/子任务用量、模型与结束事件，再进行一次有边界的同任务比较；正常开发不默认双份实现。采集器目前尚未接入桌面执行链，Skills文字本身不会创建事件订阅。

官方依据：[App Server事件和协议](https://learn.chatgpt.com/docs/app-server)、[OTel与指标](https://learn.chatgpt.com/docs/config-file/config-advanced#observability-and-telemetry)、[credits费率](https://learn.chatgpt.com/docs/pricing)。本机生成协议比网页当前account示例提供了更多可选字段，是否返回仍以实测为准。

## 2026-09-07 采集器实现与首次实测

全局token-smart增加 `scripts/metered-run.mjs`、`metered-run-core.mjs`、`metered-run.test.mjs` 和条件加载的 `references/metering.md`；SKILL.md仅增加计量入口，保留implicit invocation。只启动已授权的新只读任务，显式exe/model/effort/tier/cwd/prompt/out；不改全局config，不重启桌面程序，不读取原受阻的历史会话。

采集器白名单保存实际模型/推理/速度、thread/turn、累计tokens、完成及缺口；回答仅在显式answer-out时另存。官方stdout协议中的父子事件兼容 `collabAgentToolCall.receiverThreadIds` 和 `subAgentActivity.agentThreadId`；只对本次新创建子任务作 `thread/resume excludeTurns:true` 订阅。重复、乱序、非法数值、模型切换、无用量、断流与缺子任务均有处理，缺失不补0。当前固定read-only，不能代替写代码、构建或整条桌面开发链；这些未覆盖环节仍不能算作已计量。

### 同一真实代码审查的一次对照

| 指标 | Astra | Sol |
| --- | --- | --- |
| 服务返回模型 | gpt-6-astra | gpt-5.6-sol |
| 推理/速度 | high/default | high/default |
| 总tokens | 32,369 | 32,254 |
| 输入（含缓存） | 30,371 | 29,478 |
| 缓存输入 | 7,168 | 6,784 |
| 输出（已含推理） | 1,998 | 2,776 |
| 标准费率估算credits | 8.47745 | 3.72524 |
| 实测耗时 | 74.827s | 98.347s |
| 预先确定的必需缺陷类别 | 4/4 | 4/4 |

Sol相对Astra：原始tokens低**0.3553%**，标准credits估算低**56.0571%**；本例主要省模型加权消耗，Sol用时更长。两边读取同一份1b974dd真实组件片段，明确不调用工具/委派，回答均为一次静态审查。主会话逐项核对原码和预先保存的rubric：两者均覆盖内部恢复不可见、旧scope异步响应、切换时旧状态、新意图被boolean抑制；没有无依据的后端越权指控，Astra提供了更细的身份解析和阻塞意图说明。4/4仅为本次验收范围，不是模型整体质量100%或实现等价证明。

证据都在忽略目录 `test/research-intelligence/out/token-smart-meter/`：`review-prompt.txt`、`review-rubric.json`、`astra-review-{metrics.json,answer.txt}`、`sol-review-{metrics.json,answer.txt}`、`review-comparison.json`。两边原记录stream complete、actual model匹配、usage present、flags为空，且各只有一次usage更新。未反复抽样挑选正结果。

上述百分比**不是此前完整开发任务、网页分流或本轮采集器开发的净收益**。主会话、采集器实现、探针/调试开销位于该审查区间之外；普通Chat没有参与此次对照。原完整文献任务的费用结论保持未测得，不替换为56.06%。

### 探针与验证

- Luna单任务真实probe完整：24,192 tokens（24,185输入/11,008缓存/7输出），actual Luna/low/default、turn completed、METER_OK。
- 子任务probe发现旧解析字段与现代SubAgentActivity差异，已定向修正；Luna一次有真实spawn/wait事件，一次未委派且报告unavailable，不能视为稳定调度。Sol probe实际捕获了子任务24,797 tokens和completed；官方metadata-only读取核验其模型为Luna/low、父ID正确、turnsReturned=0，原不完整记录保留并另存 `child-sol-metadata-verification.json`，不改写历史证据。
- `--expect-children 1` 在无子任务记录时明确标incomplete。原始probe文件全部保留，不把探针费用当免费，不以子agent自称完成替代事件。
- 采集器最终13项确定性测试通过；runner/core语法检查通过；skill官方quick_validate在Python UTF-8模式通过（默认GBK读取中文曾失败）。最终真实父子probe已捕获root Sol/high/default 79,669 tokens及子任务24,800 tokens、正确parent和completed；子任务metadata resume返回-32603，原记录诚实保留children_incomplete/usage_model_unknown，不据此估计父子总credits。后续仅针对这个新子任务补查官方metadata，不重跑付费模型。

- 最终新child经官方 `thread/read {includeTurns:false}` 实测核验：`01a07b07-6edb-7811-94d3-1569b46ce51d`，父`01a07b07-3775-7ae0-a976-13f565d6eaa5`，model `gpt-5.6-luna` / effort `low`，provider openai、status notLoaded、turnsReturned=0。路由身份得到独立metadata佐证；serviceTier未提供，历史unknown用量分桶及resume错误不改写，父子总credits仍不报。没有为补查再启动模型。

- 已把上述metadata-only fallback落实到runner：仅新child的resume失败后读取，另存verifiedMetadata并保留失败；unknown用量不重新归属，modelAttributionIncomplete包含unknown。13/13确定性回归、两脚本语法检查及skill校验通过；fallback官方只读接口已实测，修改后的整个付费父子流程未再次运行。

## 下一项真实任务：抽取证据与 SourceMap 定位（进行中）

用户要求降低默认模型档位并实际引入普通网页Chat规划。已fetch确认origin/main=1b974dd；2026-09-07只读巡检及.release-id确认生产仍为5e4b4d4、服务healthy、公网200。本地继续现有候选，不覆盖上一项已验证的文献恢复改动。

- 定向取证：explorer角色Luna/low，发现extractor返回chars字符串与SourceLocator结构化定位之间的缺口；此为范围定位，不把推断当成完整根因。
- 网页：普通聊天6 Pro，已提交一次项目事实与边界/验收规划请求，会话 https://chatgpt.com/c/6a9e7dac-e4c8-83ea-9857-4c52ad66c8ec 。本地等待正文后再实施，不重复生成规划。
- 必须保持：纯文本兼容、人工确认SDF、可信SourceMap身份、无法唯一定位时明确不确定性；不新增provider/迁移/权限，不以字符串格式转化冒充科学语义正确。
- 额外核验：parser-acceptance-contract严格检查返回字段，新增数据必须同步合同及回归。
- 路由按风险采用适配的较低档，Astra/high不默认；高风险独立复核优先Sol/high。网页传输/读取和主协调仍产生Codex开销，尚无完整任务节省率。

### 网页规划已取回，实施启动

普通聊天页面显示6 Pro，实际一次提交、思考4m33s后完整返回；采用其确定性映射路线，而非新增模型blockId输出。canonical上下文从可信worker参数传入，纯文本兼容；原始block偏移及空白归一化逆映射，枚举重复并消歧，仅唯一单块回查成功才标located。重复/跨块/missing明确降级，显式字段fallback同样校验。延后跨块多定位、人工消歧UI、模型辅助blockId；不把定位成功等同科研结论正确。

已实际委派implement_evidence_locations，显式Terra/medium、fork_turns=none，负责worker抽取/接线/合同及回归，主会话不重复实现。Luna/low取证已完成；计划Sol/high独立复核，Astra不参与本轮新增委派。普通网页Pro规划与Codex Work不同；浏览器传输及主会话仍计Codex开销。本轮原生子任务计量未完整接入，不以请求参数冒称服务端全程用量归属。

预定验收：纯文本旧返回；trim/空块/存储顺序；CRLF/emoji/组合字符；多页唯一且拒绝伪造定位；同块和跨页重复及空白等价重复；跨块命中；缺失/回查失败；显式fallback；真实worker接线与严格合同；不写SDF及不新增provider调用。

### 实施与复核过程

Terra实现后的完整agent-worker测试35文件/534项通过；worker构建含10项compiled检查通过，修改文件lint通过。首次RED因缺失dist未实际执行行为测试；后续发现并修复纯文本标点等价回归，保留测试日志，不声称首轮无返工。manifest工作副本因Windows换行转化与冻结字节hash不符，已恢复HEAD原始字节，未修改预期hash/合同。

独立Sol/high/default计量审查首次失败：Windows sandbox-helper路径错误导致源码读取不可用，回答全部not_assessed，因此不算review通过。记录367,322tokens（363,308输入、310,272缓存、4,014输出），标准credits估算10.41332。原始metrics/answer保留source-map-review-*，失败用量不隐去。已改为有界证据包且禁止任何工具调用进行一次复核，不改sandbox/权限，也不重复调试同一失败。

第二次Sol/high/default仅使用43,502字节的源码/测试证据包，不调用工具，已完成实质审查：41,901tokens（36,896输入/0缓存/5,005输出），标准credits估算6.19210。两次复核合计已测409,223tokens/16.60542预估credits，含失败尝试；不是本轮完整开发费用或节省率。

审查提出：canonical正文与map需在handler内部绑定；located的artifact/hash需与sourceMapRef一致；ambiguous不应把首个matching标为全体模式。主会话确认后交Terra补修及RED/GREEN。审查建议同时拒绝历史sourceMapRef-only结果未采纳，因为该形式是本次前已接受的兼容合同；只拒绝新增evidenceLocation无ref或身份不一致。review未提供部分helper的源码限制已记录，不以其空finding/断言代替本地验证。

### SourceMap 本地交付结果

最终修复由主会话逐项检查：handler从可信map派生正文；定位回查原文片段；located的artifact/hash与ref绑定；ambiguous不声称单一matching。针对复核问题记录真实RED 3失败/95通过，再GREEN 98/98；worker构建与10项compiled检查通过。完整worker回归、lint和文档检查由主会话最终运行并记录。未再付费重复复核；Sol的初审拒绝结论与后续修复核验分开，不冒称Sol复审通过。

本轮实现触及5个worker源码/测试文件：extractor、index、parser-acceptance-contract及对应2份测试。新增定位sidecar保持既有纯文本/旧ref-only兼容；没有新增模型调用、provider、数据库迁移或自动SDF写入。图形UI消费、跨块多定位、歧义人工消歧和科研结论充分性不在本轮范围。此前文献恢复改动保留；没有提交、合并或部署本轮改动。生产仍5e4b4d4。

成本结论：网页规划确实完成且被采用；Luna取证、Terra实施、Sol实质复核已执行，新增委派未用Astra。原生取证/实施及主会话与浏览器开销没有完整计量，因此本轮净节省率未知，不能宣称成本目标已验证。已测两次审查预估16.60542 credits包含失败，不是总成本；之后复用证据包避免同类失败，正常开发不默认A/B双跑。高质量目标用范围内回归和独立发现后的修复佐证，不保证所有任务永不回归。

最终主会话检查：agent-worker35文件/535项通过，修改文件lint通过；日志 `C:/Users/Mac/AppData/Local/Temp/token-smart-checks/1788773372381-b9c92473-97cc-44d2-9f89-021498b13b4f.log`。

## 同会话接续：前端建议定位状态与 Astra/low（进行中）

2026-09-07继续现有候选；fetch后仍base1b974dd，既有本地修复保留。沿用网页会话6a9e7dac-e4c8-83ea-9857-4c52ad66c8ec，增量反馈535项worker验收与已修复的身份绑定问题，提出前端未消费evidenceLocation的新缺口。调用超时后确认消息已发送，没有重发；网页6 Pro思考1m59s返回接续方案。

采用：同次结果上下文映射到located/ambiguous/cross_block/missing/unverified；显示已有页码/块号，不构造跳转链接；所有状态保留引文与原人工apply/dismiss/高风险确认，定位不等于科研结论获证。未知/结构或identity/quote不符降级未验证，不从旧chars重建可信位置。

实际分工：Astra/low/default通过计量runner生成纯TypeScript显示适配器，完整必要约束随prompt提供且禁止工具调用；主会话负责预定行为验收与落地。Terra/medium原生worker负责既有SuggestionsPanel/编辑页接线/i18n和集成回归，不重复实现适配器。新helper测试先占位运行：6个行为失败/7通过；日志1788775684806-d85e18f3-ffad-4972-ae80-7805dd457883.log。初始模块不存在的失败不作为行为RED证据。

Astra/low实测完成：actual gpt-6-astra/low/default，29,226tokens（27,655输入、0缓存、1,571输出，其中157推理已计入输出），62.478秒，无工具调用，stream complete/flags空。生成源码经主会话检查后直接落地（只规范结尾换行），预先13项行为测试首轮全通过，无模型重试/升级。按标准费率估算8.87750credits（输入6.91375、输出1.96375）。证据astra-low-display-{prompt.txt,answer.txt,metrics.json}；绿色日志1788775888180-8c3e0455-39e1-4b51-a25b-a436df898d41.log。这是实现子任务用量，不与此前不同任务的Sol审查作节省率比较，也不代表原生UI worker/主会话/网页操控的完整费用。

同会话连贯性已实测：旧规划→本地实施与复核反馈→同URL新问题→1m59s接续规划→本地适配器及UI实施。网页自身生成与Codex传输开销分列；本轮有一次3步浏览器调用合并后超时，核对后未重复发送。后续同环境拆开输入、发送和完成读取，避免再触发60秒调用超时及重新加载文档。

### 前端本地验收

主会话检查Astra生成源码后原样应用（仅结尾换行），Terra接线并修复主审指出的manual来源兼容问题。最终全Web543项Vitest+5项Node、TypeScript通过；focused23项通过。浏览器既有blank-RO flow4/4通过，测试同次完成结果的定位状态及人工操作；1440桌面和390移动截图已由主会话实际查看，无移动水平溢出，使用既有AI Suggestions标签打开面板。首次mobile可见性失败是测试漏开标签，修正测试后通过；产品布局未为此改动。

截图保留apps/web/test-results/hermes-blank-ro-flow-blank-2a3b9-sing-results-through-commit/evidence-location-{desktop,mobile}.png。完整Web日志C:/Users/Mac/AppData/Local/Temp/token-smart-checks/1788776214952-12269b3d-afe9-440c-9460-2d497907746d.log。这是API fixture/本地UI验收，不声称真实论文解析到生产页面的整链验证，也不把位置状态当成科学结论正确性。生产未变。

最终生产构建通过，日志C:/Users/Mac/AppData/Local/Temp/token-smart-checks/1788776333198-90e0f032-2f29-47f7-a9e2-b973a51b096f.log；修改文件lint通过，日志1788776379319-cc918702-8961-49da-96cc-decaa96c88a6.log。当前结果已回填原网页会话，不另建新规划。
## Production release review and minimum product handoff (2026-09-07)

User authorized deploying the accumulated candidate and validating the minimum workspace paper → Hermes structured analysis → image/video journey. Fresh production remained5e4b4d47cba918db5a9b7f7092de32aa244c258e, rollback8e4ecb2b5f9e291385b0df8495082e923af328a6. Candidate89e60ea was materialized and passed server fullbuild/Parser16, but was NOT deployed after independent review found blockers. Its prebuild log is1788777075909-ef144f76-5167-49f4-9931-0e53527489ad.log under the local token-smart-checks directory.

Actual routing: Luna/low bounded read-only product-chain discovery; Sol/high independent release review; Sol/high implementation for API serialization and cross-scope privacy fixes; main handles bounded matcher correction, scripts, production validation and integration. The SAME ordinary Chat6Pro conversation received corrected implementation facts and the new minimum-product question; its completed3m17s response was retrieved. No new A/B and no default Astra/high worker. Native worker/main/browser usage remains unmetered; no full-chain net saving claim.

Review invalidated the earlier implication of complete frontend wiring: taskToView removed sourceMapRef, so fixtures containing rawref could pass while the real API always produced unverified. Ingestion detail repeated the same stripping. Repair must retain private objectKey redaction and expose only a validated artifact/content identity. Separate scope-query persistence could carry an old RO query into another RO/user. Finally, canonical matching enumerated all repeated occurrences. Main regression measured48,024/24,024 occurrence searches on exact/whitespace repetitions before repair; after stopping at the second distinct match and reusing ranges,100 focused extractor/acceptance tests passed. Independent reviewer approved the matcher. Global token-smart metering guidance now explicitly disclaims end-to-end quality from the earlier13-test Astra/low sample; later repair costs cannot be omitted.

Verified minimum-product gap: presentation-assets.ts rejects video and genericimage without sceneImage; worker registration lacks mediaGenerator. Existing presentation UI can play stored video and apps/media-demo provides a deterministic D2NN demo, but neither proves an RO-connected paper-to-video generator. The real production paper gate ends at extraction, manual confirmation and commit.

Same-web continuation proposed a candidate slice (NOT accepted as the product requirement; see correction below): confirmed same-RO/version Claims → deterministic explanatory image → the same image with source-backed captions/transitions as a short video. Use text diagrams when evidence lacks numeric data; never invent scientific curves or claim this is simulation. Before implementing, verify the image/sceneImage contract, mediaGenerator interface, controlled renderer isolation/dependencies, artifact storage and authenticated playback. Reuse approved templates and existing providers; preserve approvals and do not simply remove unavailable guards. Acceptance requires a fresh real UI paper upload, actual Hermes invocation, manual confirmation/commit, generated image/video IDs and provenance, decoded dimensions/duration and in-RO playback, plus cross-RO/permission/approval failures. Standalone demos and manually imported media do not satisfy generation acceptance. This is a next-slice plan, not an implemented or passed minimum product.
Local source check rejected the web proposal's lowered visual bar: docs/specs/2026-09-05-integrated-research-product-design.md explicitly says text Claim cards are not scientific illustrations; use scenes, structure, propagation/action and local magnification to explain mechanism. project_index.md marks the repeated-panorama/slideshow delivery visually rejected. Preserve accepted continuous Serena narration and actual D2NN animation, and respect USER-PAUSED CPU image installation. The next slice must connect actual paper-derived mechanism illustrations and meaningful local animation/storyboarding to the same RO/Hermes task, not declare a static card plus transitions complete. The webpage was missing this earlier approved requirement; external reasoning is advisory and local requirement verification takes precedence.

Final release fixes: domain83/83, Worker537 tests, Web544+5 and relevant typechecks/domain build/lint passed. The final extended first-commit target/user query regression initially timed out because switching RO closes the disclosure; the test-only correction reopens before typing and records scope identity with the commit-time query. Fresh affected browser17/17 passed23.4s; test-only commit8928a9d follows applicationc9439ae. Do not cite the earlier17-test run as covering this later extension. Predeployment backup succeeded (core28M/search20K), without old-backup deletion. Applicationc9439ae server fullbuild and Parser16 preacceptance passed; log1788778447440-aeaf3a4c-89f4-4659-adb9-ac3e4c8afc84.log. Canonical deployment completed from isolated exact worktree token-smart-production-c9439ae with rollback5e4b4d47cba918db5a9b7f7092de32aa244c258e. Full serverbuild, Parser16, core36/search2 (no pending migrations), database isolation, BGE runtime, ScanSci/OA/storage/worker, public/loopback200, egress204, journal clear and retention complete were verified. Deploy log1788778768188-ddef03fe-f00a-4cbb-b993-28d7229a2095.log; health1788779287297-b34ac338-9d1e-4b3f-a0c0-4eb58103cb5a.log.
### Real production paper test: minimum workflow not accepted

Fresh controlled UI upload used arXiv2009.06045v1,24,671,920bytes, sha256d57dc94c05ca99ccb33f8186e9317353c663a638cde1c0c8a90c7c2d029f484a. New private RO ba7920d1-ea3c-4355-b479-8d7a203d3a94, ingestion bfeb3d55-4f31-4bb4-9c56-0a7a280d5d01, agentTask ed2554fd-f909-43cc-aeb3-009007bd63e9. Worker execution succeeded as a state transition but its result remained needs_review: parser-failed; all local parser stages failed; unresolved pages remain. A SourceMap reference was persisted, but no core/evidenceLocation was generated. The test correctly failed missing core field problem; manual confirmation/commit and media probes were not reached. Session closure succeeded; source/test data retained privately. No full research journey or new image/video generation success is claimed.

A separate one-shot replay sent the SAME hash-verified public PDF to the deployed Parser image with network none, read-only root, user1000,512MiB/2CPU/64PID and no host data mounts. parseStructuredPdfResult failed with invalid PDF text geometry. This isolates the next blocker to native PDF geometry handling; no model upgrade or isolation relaxation was attempted. Start at native-pdf-text-items.ts:textItemBoundingBox with a regression using this real document. The production task did not reach LLM extraction, and its bounded audit window had zero gateway-call records; this does not measure Codex development costs or establish a successful product-model route.

Evidence: ignored apps/web/test/visual/out/token-smart-release/real-paper-run.json, real-paper/{checkpoint.json,extraction-checkpoint.json}, native-parser-replay.json and the three adjacent reproducible helpers. Failed gate log1788779301585-98b3e68e-c546-4570-b03b-b452807dd5f9.log. Keep original failure files before any retry. Deployment is complete; minimum-product acceptance is FAILED, with geometry repair, actual structured extraction and same-RO mechanism image/animated-video integration explicitly next. The same web6Pro conversation acknowledged the corrected no-card/no-slideshow requirement after28seconds; no new design was requested.

## Continued full-pipeline execution: webpage plan (2026-09-07)

User authorized continued implementation and deployment, with ordinary webpage planning and quality-first routing. Fresh fetch and production check confirm application/public c9439ae and rollback5e4; health log1788780828854-9b7acb71-1c9b-4dcf-8fb0-68a95fc8f47c.log passed. Working HEAD2ce1c83 before this continuation; root dirty main preserved.

Same ordinary Chat6Pro conversation6a9e7dac-e4c8-83ea-9857-4c52ad66c8ec received one incremental evidence package and completed its plan in3m41s. Adopted sequence: numeric PDF diagnosis → text-preserving repair and same-PDF regression → real Hermes model/confirmation/commit → same-version Claims → mechanism artwork and substantive animation → authenticated RO playback and production acceptance. No fabricated rectangles, silent text loss, fixture-only success or security relaxation. Sol/medium actually dispatched for numeric diagnosis; existing Sol/high reviewer dispatched for bounded media architecture review. Main preserves client model settings and owns integration. Full-chain cost/savings remain unmeasured.

Scientific correction: arXiv2009.06045 is *On-chip sampling of optical fields with attosecond resolution* (https://arxiv.org/abs/2009.06045), verified against the primary abstract. The prior accepted D2NN demo supplies a visual-quality/rendering reference, not this paper's mechanism or narration. Do not reuse D2NN physics for this paper. CPU image-model installation remains paused; no new provider/install authorized by webpage advice.

Numeric investigation reproduced25pages/2559nonblank items with only two zero-width U+0036 items on page22. Same-origin positive-width equals signs and rendered page prove these positions visibly mean Phi_CEP not-equal0 and f_CEO not-equal0; repairing only rectangle validation would retain scientific text corruption. Original PDF and numeric/rendered evidence are preserved in ignored token-smart-release files. Web6Pro followup completed in2minutes: use targeted isolated page OCR with scientific comparison, retain24healthy native pages and existing limits/privacy, reject fake boxes, neighboring-box borrowing and hardcoded6→not-equal conversion. OCR confidence alone is not formula correctness. Implementation assigned to Sol/medium; real symbol recovery and independent review remain pending.

Sol/high bounded media review found reusable task/storage/range-playback but missing confirmedSDF→evidence-backedClaims, same-paper narration adapter and isolated renderer integration. Proposed first scope is a server-owned on-chip-sampling animation profile with data-only approved inputs, not arbitrary code or D2NN physics; no new interface is implemented or video capability enabled yet. Source/approval invalidation and final version revalidation remain required; reuse existing identities before adding new contracts.

Actual isolated Tesseract page22 failed scientific fidelity (f_CEO not-equal0 became /cao,4,0; Phi_CEP also corrupted), despite some high-confidence ordinary text. Independent Sol/high review therefore blocked aggregate-confidence-only recovery; native geometry-fallback pages must retain a fidelity needs_review reason. No deployment performed with that false-success path.

Further original-glyph diagnosis found embedded FPGIHJ+CMSY10, originalCharCode54(hex36), zero advance, followed by a same-origin equals glyph. Primary LaTeX encoding source defines OMS/cmsy, not at hex36, and neq as not+equals: https://raw.githubusercontent.com/latex3/latex2e/develop/base/fontdef.dtx (lines654,1122,1169 at retrieval). A narrowly validated native composition is now being implemented with unknown-font/orphan/misaligned cases retaining review; no global digit replacement or arbitrary box inflation. Exact-PDF fidelity and independent review remain pending.

Final scoped repair review has no remaining material blocker. Fresh fullWorker36files/556tests passed13.33s (log1788783045448-62885f2c-2e13-495e-a668-5f1cd3e000c5); changed-file lint exit0 (1788783045430-264319f2-6986-4aad-840b-af8c53b8f117), typecheck exit0 (1788783023666-aef5c87b-36bf-4bc6-b8da-d137bdf93ae3). Worker focused37 and compiled10 passed. Exact repaired-native-pdf-replay-20260907.json proves25pages/2557blocks/two not-equals/no empty pages or warnings under unchanged512MiB sandbox. This is native-parser recovery evidence, not yet production Hermes/media completion.

## Parser release and actual extraction follow-up

Application17eb209d15cc427d33b426e8430fa87006e899c2 passed exact server build/Parser acceptance (log1788783256989-48745134-6088-40fa-ba5f-523854d33a0f), canonical deployment (1788784055257-c35543ae-b8e1-4fcc-bf40-dbf24929aaeb) and post-health (1788784544659-1638841d-491f-439b-add6-eb2d9ecdf66d). Active/public17eb209, rollbackc9439ae; journal clear and retention complete. Backup core28M/search20K preserved. Detached clean deployment worktree token-smart-production-17eb209 avoids mixing later dirty development code into release inputs.

Same public PDF actual UI attempt (log1788784549637-bb9e51a7-235a-4ddb-9e98-787734e3e58a): RO7e586b12-4c6c-4676-9453-0df42078e66b; ingestion218f4b94-e91c-47c6-9391-a0ec3021c5a7; AgentTask526d0515-b215-49fc-8ce4-bea8f8acb754. Parser succeeded with safe identity. Gateway audit in the bounded attempt window records MiniMax-M3,6318input/1669output,12.438seconds, no fallback/retry. Semantic rubric correctly FAILED: all six quotes were no-match and core values cleared. Session closed. Evidence remains under ignored token-smart-release/real-paper-17eb209 and real-paper-run-17eb209.json. This usage is product extraction, not Codex development consumption.

Single controlled diagnostic found layout reconstruction: optical- plus newline field became optical-field; line-end hyphenation was removed, math tokens combined, punctuation added. The24k selection included substantive content. Strict exact/whitespace matching is preserved. The diagnostic incorrectly parsed the PDF in the credentialed/networked worker before a later boundary correction arrived; no DB/task/storage/SDF writes occurred. Its gateway log reported input1/output1035,7.574seconds but no audit sink, so input/cost metadata is incomplete and cannot be used as a saving measurement. No second diagnostic call was made. Future PDF parsing uses the original isolated runtime exclusively.

Same ordinary Web6Pro returned a3m02 Claim bridge plan: immutable committed Version/SDF snapshot plus the same extraction, manual select/split/type, original/reviewed quote comparison, no model rerun or automatic verified status. Local bridge/UI implement that flow. Independent review found and fixed exact-task SourceMap binding, inside-transaction snapshot revalidation, repeated SourceMap loading, prefilter-before-limit, private caching, concurrent P2002 replay and lineage erasure on Claim edits. Domain28/API5 passed before multiblock adaptation; UI helper5/browser3 and fullWeb549/types/lint passed, log1788785754168-e3660261-a197-4978-8d89-c056395a1f6a. No bridge deployment yet.

Same Web6Pro follow-up completed3m06: additive evidenceSegments, one exact canonical quote and existing locator per block; do not merge parser blocks or attribute multiple blocks to one locator. Model selects prompt-listed IDs, server resolves; order/conditions/formulas must survive, oversize or invalid input fails explicitly. Multi-block legacy view remains unverified; UI presents boundaries and bridge creates one candidate Evidence per segment. Human source sufficiency review and missing/needs_review status remain. This fixes a concrete failure where model quotation rewriting loses all usable analysis; existing single-locator contracts cannot represent sufficient multi-line evidence. Implementation and final real-paper retest are ongoing.

Same Web6Pro media continuation completed5m02, with primary paper retrieval. Next implementation uses a fixed on-chip-field-sampling profile consuming the exact approved same-version storyboard and scene images, with full Serena narration and real dynamic primitives. Independent Sol/high mapped reuse of the existing host-spool boundary: distinct video namespace/heartbeat, host-only controller and private ledger, no Worker Docker socket, isolated offline TTS then isolated Chromium/FFmpeg. Existing private MP4/hash/Range/draft handling is reused. Submit/pre-run/final-write authority and parent identities must be revalidated; invalidated Claims/parents invalidate the output. This is still a plan, not an enabled video feature.

Scientific check against https://arxiv.org/html/2009.06045v1: animate the strong driving pulse and weak signal, local field enhancement at a gold tip, electron emission into the collection gap, and delay-dependent average current. Weak signal alone does not drive emission; distinguish local from incident fields and label enlarged signal amplitudes and all animation as explanatory, not measured or simulated results. The profile is specific to this mechanism, not proof of arbitrary-paper video support. Existing D2NN motion/voice quality is a reference only. Preserve continuous narration, approval, source linkage and explicit uncertainty; static panoramas or text cards remain rejected.

## 2026-09-07 focused extraction and UX candidate
Actual stored SourceMap diagnosis identified field constraint failures; bounded reason-only retry feedback and valid-field preservation keep existing strict limits. UI empty-state guidance and Hermes confirmation contrast repaired. Production005ffb8 unchanged until independent review and exact candidate acceptance. Incomplete media isolated in development worktree; installed dependencies, UID boundaries, queue recovery and deployment wiring require further repair.

## 2026-09-08 ordered excerpt repair after real fbb failure

Canonical fbb5405/rollback005ffb8 deployment and public/runtime acceptance passed; real taskc7f00b13-3563-47cd-965f-51f990679de5 still returned allmissing and stopped before confirmation. Controlled session closed. UX separately passed actual writable-version desktop/mobile guide/CTA/no-overflow capture (ux-deployed-v3-*); first404 capture is not acceptance.

Current candidate changes strictly contiguous to strictly source-ordered separate authentic blocks. It preserves32/8000 bounds, unique allowed IDs, original text/identity/locators, manual verification and first-valid retention. Joined quote remains compatibility projection only. Three UI surfaces disclose independent potentially noncontiguous excerpts. Full batch regression verifies two gap-separated blocks produce two needs_review, unverified Evidence rows; reverse/unknown/duplicate/identity failures remain rejected. Sol/medium119extractor/26domain; High consumer review GO with fresh43extractor/36domain/26Web. Prepared real ordered-v5 gate uses hash-verified cached PDF, requires substantive four primary fields and exact separate displayed blockquotes/notice. Media remains excluded and disabled.

### 2026-09-08: same-version recovery and media candidate

a73 production now extracts all six fields and confirms/commits the actual paper. Claim bridge409 was traced to persisted floating-point bounding-box rounding; the candidate shares a machine-precision comparison between batch and single-source resolution, keeps all source identity/text/range/order checks exact, and derives regions from canonical geometry. High GO, focused40 tests and actual94-segment replay passed with no model calls. Resume the existing version after deployment, not a new extraction.

Candidate media remains disabled until the existing immutable-source installer configures the validated offline TTS/renderer and the authorized deployment enables the capability. Five approved same-version scene images and scientifically reviewed sources are required; first image must pass review before remaining images. Isolated runtime25/runner15 and Domain/Worker/API44 each, Web16, config17/typechecks passed. A runtime fixture does not prove business playback; final video must remain below existing16MiB read limit and pass full decode, audit, authentication/Range, scientific motion and narration review. CPU image-model installation stays paused; existing codex-image runner is available and its model usage is counted separately from webpage analysis.
