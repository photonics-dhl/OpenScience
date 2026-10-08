# Hermes / 论文视觉叙事 CURRENT
> 总控集成树 .worktrees/onchip-video-release，分支 release/onchip-production-line；根 main 只作导航。期刊按用户指定独立克隆发布；跨团队状态以实际 Git、运行事实及用户最新决定为准。

## 目标与决定
- 需求依据仍为 [开发规格](../OpenScience_Kimi_Development_Spec.md) 和用户最新决定：真实 NousResearch Hermes Agent 理解全文、核对转述、生成六维/Claims/Evidence、科学分镜与完整提示词，再交给 Synclip。论文是事实来源，不用固定答案或 Codex 手稿替代自动科学能力。
- 先完成 2–3 篇真实论文的凝练、用户确认、配图审核与公开展示；三篇整体验收、普通用户旅程、视频成片及整站审美均未完成。单图认可、构建成功、模型成功或部署成功不能代替对应验收。
- 新图片与视频按既有 Synclip 授权继续；图片已验证 gpt-image-2，视频目标 LTX。gpt-image-2.5 曾无 receipt 返回 UNCERTAIN，确切模型合同仍待核实，不盲重试或自动切换供应商。Hermes 独立像素核验尚不能算通用已验收能力。
- 保留原 PDF/SourceMap、认可图片、公开标识、旧版本和失败/费用/回执；日常结果为私有草稿，公开沿现有确认流程。未知外部提交、旧 oncekey、paid/started checkpoint 不得因接管或旧文档提示而重放。

## 总控与并行分工
- 总控`01a1197c-7a1e-7631-b1c1-2d09b587be9a`负责三线写权/依赖/集成/发布与CURRENT/progress/index，各owner保留原任务和专属计划。线程心跳`openscience`已ACTIVE，每10分钟检查三线；完成、idle或受阻时及时补派有用且已授权的独立下一步，状态不变不通知，不用无关检查充数。
| Session / ID | 主责与本轮焦点 | 活动工作树 |
|---|---|---|
| 生图系统开发 / `01a0e831-be19-7813-8379-58313178ff26` | CLI及ACK差额已交；续核Fig.2重复plan/d508悬空copy当前引用，交可恢复方案，只读不清理 | `C:/Users/Mac/.codex/worktrees/illustration-chain-repair/XGS`，`codex/search-long-table-dense` |
| 视频系统开发 / `01a0e851-4d6c-7221-9559-b8c56a3413fe` | 优先P1：付费前server-owned资格及park/release业务交错，不写agent.ts | `C:/Users/Mac/.codex/worktrees/synclip-video-delivery/XGS`，`codex/video-paid-readiness` |
| UI优化 / `01a0f118-e09d-7671-af09-0592d6062a6c` | 修导航测试缺失mock并消费视频付费前DTO；在途页面保留，不扩新视觉 | `.worktrees/research-product-craft`，`codex/ui-art-direction-20261008` |
- 视频确认无共用文件在途写入后，生图另获GatewayOptions/constructor/native PNG分支/completeWithControls局部provider选择与Worker `buildGateway`可选审图模型构造、对应测试；不改provider.ts、Native/Text或全局M3。视频保留其余已授Native/Domain/Worker/音频，Web归UI；未知付费保护只约束具体任务，不扩成整线待命。
- 使用任务独立工作树，canonical 只集成已明确归属的提交；生产发布按已有锁和干净、已推送精确 SHA 规则串行排程。在途部署/付费任务自然完成后交接，不因协调重启、扩预算或重发。进度写在各自 session，总控只读收取，不另建任务库。

## 当前版本与观察边界
- 2026-10-08 release=`42fe1a974fb62e5a868d3a4f1da812065cb148b1`，rollback=`45a577a3a8f6bca78a063e7478fba131c5efb375`。18:28 CST总控核Web/API/Worker healthy、restart0/OOMfalse，global/Native均M3，runtime/catalogue均42fe；21:17/21:29生图只读再核app marker及实际Worker label稳定42fe，不将此扩称全服务复验。证据分别在总控live-release-investigation.json和生图source-index-token-limit-recovery/。本批未部署。
- 期刊独立发布时远端为9eb8bc01，已完整合入；精确42fe四CI及原事务/Native配对、公网站内验收见[期刊交接](2026-10-08-journal-workbench-handoff.md)。视频host v2仍adminModelsEnabled=false/accepting=false；不强推、不合并PR/main，不将期刊验收扩成其它产品完成。
- 远端frontend/nanqing为e43123db6877a1cc1c500ee33608152d2f17f40f：[PR113](https://github.com/photonics-dhl/OpenScience/pull/113)视频37782272323成功；期刊push/PR失败于双语fixture，media两CI在20分钟取消，已过原27例后进入68例导航组，缺mock。本地代码89d6ba06含期刊323→0147、失败artifact/首错trace、CLI03b3及ACK f1de/cc1e，尚未推，等已知导航修复同批CI。0b六CI/host32/broker114属前批，取消不计通过；完整日志在总控tmp。发布P1仍NO-GO；安装授权仅临时CI。
- M3恢复已High GO/applied/verified，原Gateway M3.1与Native M3错配已消除；同版本重建时无模型/迁移，Native身份未变。私有回退证据`/opt/openscience/observations/model-m3-restore-20261008T034213Z`；不据此重做恢复。
- 唯一原生计划`cb063919-3cf7-40ad-aeab-7d802410975f`于2026-10-08T04:02:45.662Z failed/transport stopped；CP仍started/turn6，11对象保留。Gateway M3/provider_timeout/600365ms、token usage=null，上游终态/计费未知，无新计划/图片。证据在生图`tmp/first-scene-native-{request,submission,status,latency}.json`；不重发/新key/扩预算/改模型。ROc896/version2047/同6Claims/原PDF、父36727536和第二幕保留，旧3e607af0矛盾稿不采用；科学错误不因配置恢复而完成。

## 未完成与下一动作
- 格式db5884b5、Skill20/d82e79c2、paid兼容0d7d493d已在42fe上线。fresh采用sourceNotation，旧paid/未知仍旧语法；真实错误引用仍拒。回放沿已核prefix/exact call、current-first和唯一历史Execution19，完整deepEqual不删。原验证/RED见生图tmp/source-notation-*、native-skill-replay-final-*；上线不解除cb未知终态。
- PNG隔离ea135→9ab与校准54c77→c302均全等/High GO；Gateway23/Worker29、回放52+2及0b CI证据保留。MINIMAX_IMAGE_REVIEW_MODEL仅PNG、未配仍primary；主/Native M3不变，生产未配。root21的science/plan/render沿20、review21、历史19优先，不降未来版本。仍是Worker→Gateway单次vision，非Nous SDK审图循环；科学改善未实测，详见生图tmp/pixel-review-calibration-*。
- wire离线证据：生图tmp/pixel-review-wire-receipt.json的2ef原/重建promptHash5d424、PNG6ebb一致；fc仅PNGf0e/sourceIdentity一致，promptHash21eca→7ed745，不能认作原packet。0模型外呼，不是历史外网抓包。fc有效accepted承认轴冲突却列非阻塞；普通audit succeeded不等于accepted，传输/结构合格不证明科学正确。
- cb科学诊断见生图tmp/first-scene-native-diagnostics.json：第6轮1,721,322bytes/20消息低于本机上限，仅排除本地oversize，超时未定因；完成turn的压缩空messages不是原请求尺寸。20/500/77nm、1MeV/0.94c错来源及Gaussian1.8、tau/时空/virtual-real问题仍须Native修订，不由代码补论文答案。
- 视频主候选及9914已集入、High闭合，原Worker67/Domain175/run57/API7/音频179证据保留；新CI见上。host3603→92bf全等集入、High GO，Linux含子项32/32；原renderer已有codec，未生产切换。[视频计划](../plans/2026-09-05-hermes-presentation-assets-plan.md)的合同14fd→c07c已集入：LTX原生声/多镜头存在，15秒分段不推出必须外置TTS，当前换轨会替代原生人声/音乐/环境声；这是实现取舍。原生合格实片尚缺，暂不改模式，现只读核账户权限/音色；坏镜头及真实音画待验。
- 普通video沿原hermes-runs/9任务授权，旧image不升级；guide/query160→68及21/26/23保留。集成High P1：UI重分析、Domain来源reviewer/分镜/成图可早于不可用host检查收费。视频补fresh readiness/收费前检查，UI在source准备前消费。ACK f1de/cc1e→a5d792/89d6ba全等收取：snapshot CAS+显式max(now,snapshot+1ms)，ORM回退RED→Green3/3、原High P2关闭，84未跑；原CI增对应组。22:18视频同源c513的真实dispatcher交错2/2通过（其tmp/video-paid-readiness/dispatch-ack-green.log），整体收费边界/TC/集成High仍待，组件通过不放行。原run/key/paid保留，admin=true不是权限证据。原审查在总控integration-high-c3ebf728.md。
- UI fe12→2265含构图/普通视频/期刊，原High/定向与c3 build证据保留；c7ed/2123/3decb/323全等收取，保留实际点击/幂等/多PDF/窄屏/权限。OA11与期刊20本地通过；e431缺323双语fixture修正，待下一CI。导航68例缺mock、来源ID和两个已移除保存入口断言，由UI同批按真实确认→版本页修复，保留各业务目的，不故意跑已知失败。bc996视觉未收；P1 Web待backend DTO，新UI未部署或验收。
- Task4长表格57c→aa0全等，High闭3P2，Search29/Worker25已CI实跑；同源行窗口失败保lexical。内部恢复f427→79050保留原retry/canRetry/双预算/CAS/fence，Domain34/CLI23/Storage16本地通过。21:17实核旧049c/be071已非current、active0；当前96b0dbe8-b5cc-4784-a9c2-0b62d12cb766/d357/v27为active69/vector0。21:29核6368来源/确认/v27 manifest/模型/owner/budgets全部满足；只是只读时点，不是执行许可。CLI03b3→3a3faa两文件High GO/31通过：显式UUID、scope current take2、唯一后严格owner，不自动换owner；旧049c拒绝。真实BGE恢复未跑，发布后操作前须freshread；回执在生图tmp/source-index-token-limit-recovery/，原表3051/607仅离线。
- 生图浏览器getState及唯一reset后的getState均为request-header policy错误，已停循环；不绕过、不据此判产品故障或宣称实点。UI先前预览启动也曾被自动审批拒绝；按各自真实观察范围记录。
- RO9067 第四幕 `28ab61b0-7931-41d3-8200-2d63c1f986ad` 的供应商 POST 终态未知且无receipt；需可核实的关联/幂等查询合同恢复，不为补齐4/4重发。用户已要求减少中间人工审核；按此接产品流程，公开确认边界不变。

## 已观察产物与保护
- ROc896802c：旧首幕 `27b2381a`、`fc1c5474`、`73746a85`、`b3c023bf` 已通过产品回收站移除并保留30天恢复期。矛盾艺术稿 `3e607af0` 经fresh身份/0子任务/expectedUpdatedAt核对后用普通Domain CAS拒绝，2026-10-08T04:38:17.618Z已rejected，providerCalls0；before/after回执在生图ignored tmp。父 `36727536` 仍approved、第二幕 `e8b6cb5d` 仍private draft，不级联或据旧“成功”重新采用坏稿。
- RO9067 的 run `7a959a7f` 已观察到 SourceMap、paper-author、独立来源审阅与四幕分镜成功；三张图有供应商成功回执，其中第三幕审阅阻断，第四幕外部终态未知。后续第二幕 `ead639dc-e480-4520-8f0c-691402c8b739` 单次成功、两路审阅 accepted、私有 PNG 已实看；不代表全文链路或其余镜头已验收。
- 正例7eb1/d64经historyCopy追到原e550/scene0/c54，原Web5.6-sol accepted、sourceIdentity/5Claims/30Evidence及PDF/Map/PNG字节均核对，PNG实际1280×720。生图tmp/accepted-image-*保存审计，image-reference-case-input.json去掉历史判定/认可标签；不是Native身份或新授权。现存仅published，旧approved带prior review不能直接重开，未造alias/改旧记录；站内实点与合法新任务验收仍缺。
- Synclip video bundle 曾安装并接线，旧任务 `321b013e-9606-4858-82a7-f767105d0069` 在科学分镜结构化阶段阻断，无 Synclip POST/视频费用；现存失败、bundle 收据和后续修复均保留，当前进展由视频 owner 提供。
- H3 独立 pilot 的 hook 任务 `447219218062265` 已取回 5,654,125 bytes、2560×1440、15.084 秒 H.264/AAC 原片；画面已看，音轨自然度未获人工认可。mechanism 的 402 拒绝不重发，mapping/result 当时未提交；该产物不证明 Synclip 适配或四幕成片完成。

## Illustration delivery
| 论文 / Taskmaster | 已见产品与用户反馈 | 剩余交付 |
|---|---|---|
| RO9067a2d5 / 1、5 | 六维/6Claim/58Evidence；公开 v3/v4 保留，v5 选 65ffbfee，正式审图/人工像素/High 通过，匿名入口已实点。私有 v11 失败图与收据保留。 | 用户整体审美与可理解性反馈待收，不批量冷启动。 |
| ROc896802c / 2、5 | 旧 v4 物理被用户否定，只作误判证据；私有 v14/771ff7f3，用户认可 2cc5003f 物理及 681ef614 最终细节，未公开。 | 可沿现有流程采用/新公开；新原生自动理解与计划仍须另证，不借旧图冒充。 |
| ROaa450f1e / 3、5 | 公开 v2/OSR-2026-000024，7eb1b7ee 与 4e64c389 两图、六维/5Claim/30Evidence、匿名轮播与 PDF 边界已实测；用户称赞首图。 | 整篇科学叙事未验收；旧 MOED 错图留私有。 |
| 能力 / 4 | 原配图 Skill、原生 Agent 科学与设计入口、自动计划接线存在。 | 核源/条件保真、跨任务经验、几何检查、Fig.2 重复 plan 与 d5087b03 悬空 copy 待处理；Fig.1 原字节展示方案已否定。 |
- Taskmaster currentTag 为 `multistyle-research-illustration`：1/4/5 in-progress，2/3 done 是既有子项状态，不代表三篇整体验收；本轮未改任务验收状态。

## Capability linkage
- 入口、调用、未消费能力与债务见 [能力台账](../runbooks/hermes-capability-registry.md)。新 Native 不走旧固定 map/reduce/compose/GPT 来源链；SourceMap/PDF/OCR、隔离 science-worker、历史消费者及 paid 回放继续复用。Native 计算器适配尚缺，不裸开主机 terminal 或默认重算论文。
- 10-05 旧来源修订中，19-fs ICS 输出误标驱动、波长趋势反向、ζ算例误称上界、单电子例缺 1-MeV 条件曾导致整稿 NO-GO；后续工具反馈/词法修复不追认旧稿。旧 original/paid/CP/failed 及 oncekey 全部保留，禁止据历史 next action 重开；全文与各回执见下方 Git 记录。
- 旧 ChatGPT 浏览器链路、timer 与登录 profile 已按用户授权停用/清理；历史 spool/媒体/备份/回执保留，ScanSci Xvfb 保留。独立债务包括第14页 BGE dense 超限、旧 v11 的58 chunks、科学返工/经验/几何与三篇整体验收，局部修复不取消目标。
- 运维目标保持现 ECS 先做功能/展示，集群和异机存储后续；对象定时、完整隔离恢复、独立告警及测试站未完成。恢复候选仍 NO-GO，crypto 保持用户暂停，不新 run/重试/合成 key/读旧私钥或 DPAPI。证据 `tmp/ops-readiness-20261003/crypto-phase-checkpoint.json` 与既有 observations 保留；只清理已确认归属且不再使用的生成物。
- 公司正式上线/年度运维交接、期刊真实试用继续；[原期刊任务](2026-09-15-journal-onboarding-handoff.md)与[10-08交付](2026-10-08-journal-workbench-handoff.md)分工保留。期刊页面/权限验收不等于真实PDF→Hermes科学质量通过；10-06证据只作历史，不扩大权限/版权/额度。
- 生图旧离线安装目录及可选Junction备份/临时tsconfig/重复wire日志清理被自动审批拒绝，未绕过，仍隔离在ignored tmp；活动依赖overlay与必要回执保留。下一发布回退基线为当前app42/Native42，旧784仅保留旧paid；操作时重捕drain/timer，不使用17:00的45/784快照当当前状态。

## Read first / 历史
- 启动定向读本页、`node scripts/read-current-management-context.mjs`、Git 与必要只读运行事实，再查能力台账对应入口；progress/index 只定位/摘要，不维护第二份动态任务表。
- 本轮压缩前的全部历史验证、Native 来源修订、精确 oncekey/CP/收据与旧发布记录保留在 Git `748e33a42fe9619365ee8ad5f9e28ead2c1e3594:docs/handoff/2026-09-10-hermes-web-image-handoff.md`；更早证据仍在原 tmp/Git，不删除资产或原记录。它们不是当前 next action。
- 原生方法见 [接入计划](../plans/2026-10-01-native-hermes-agent-plan.md)；[09-18交接](2026-09-18-figure3-image-and-cleanup-handoff.md) 的禁止重放与用户资产保护继续有效。总控核验仅版本/文档一致性；候选、部署、真实观察和用户认可须分开报告。
