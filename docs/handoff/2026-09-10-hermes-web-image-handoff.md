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
| 生图系统开发 / `01a0e831-be19-7813-8379-58313178ff26` | loading1PASS；editor退出guide后真回焦RED，待独立Drawer/Stage差额串行消费 | `C:/Users/Mac/.codex/worktrees/illustration-chain-repair/XGS`，`codex/hermes-dashboard-ci` |
| 视频系统开发 / `01a0e851-4d6c-7221-9559-b8c56a3413fe` | 原trace取证完成；loading本次通过无新增错误证据，f90待CI，不重复旧检查 | `C:/Users/Mac/.codex/worktrees/synclip-video-delivery/XGS`，`codex/journal-refinement-option-ci` |
| UI优化 / `01a0f118-e09d-7671-af09-0592d6062a6c` | Drawer759→e637已收/High GO；独占Stage inline新回焦RED最小修复，同Godel审增量 | `.worktrees/research-product-craft`，`codex/ui-wanko-capture-20261009` |
- 写权按当前三线文件归属互斥；root统一共享CI、CURRENT/progress/index与合并。未知付费保护不取消独立实现任务；不并行发布/资产写。
- 使用任务独立工作树，canonical 只集成已明确归属的提交；生产发布按已有锁和干净、已推送精确 SHA 规则串行排程。在途部署/付费任务自然完成后交接，不因协调重启、扩预算或重发。进度写在各自 session，总控只读收取，不另建任务库。

## 当前版本与观察边界
- 2026-10-09 00:42:03 CST总控只读实核：release=`45a577a3a8f6bca78a063e7478fba131c5efb375`，rollback=`42fe1a974fb62e5a868d3a4f1da812065cb148b1`；Web/API/Worker healthy、restart0，global/Native M3，runtime/catalogue784。期刊按用户要求回滚已生效，先前42fe及Fig2 fresh为历史时点；证据`tmp/session-coordination-20261008/live-release-20261009.json`，本批未部署。
- 期刊独立线新增六提交到远端d9eba2c6，包含共享Native管线、私有working RO、赞助额度及迁移51；与本地有重叠，已按真实语义合并，保留唯一Gateway资格权威。原期刊运行/重做边界查远端[期刊交接](2026-10-08-journal-workbench-handoff.md)；实际Git和运行事实优先，不沿旧42fe快照发版。
- 已推58695a2532d8b0288a9b17fb40e674634d3c62b3至frontend/nanqing，[PR113](https://github.com/photonics-dhl/OpenScience/pull/113)打开；视频37842338295通过，期刊37842338312/37842331579失败于option查询转向父select（browser1过/1败）。原预期不变的f90→b013已收，静态0，待下批。media37842338333/37842331571达20分钟被取消；push图文27/指南3通过，导航日志13失败、启动至34/70，非完整结果，auth14未记失败、版本阅读未跑。fac仅补取消时收trace，不扩时限/跳过断言；待owner差额收齐再推，未部署。
- 01:26–01:29只读确认45/784仍在用；实际Native illustration目录v17，缺style-taxonomy/legacy-v19，科学资源缺新定义轴规则。SDK/adapter/unit与候选相同，可复用SDK但须原installer生成新的不可变runtime/catalogue配对，不混配或改写784；旧paid/CP保留。生图tmp/native-deploy-delta-20261009-{installed,receipt}.json；视频tmp/synclip-host-readonly/release-4c1d83e0-compatibility.json确认仅上线提示可保留关闭host，真正启用配音前才升级。最小顺序见deployment.md，未执行生产写。
- 唯一原生计划`cb063919-3cf7-40ad-aeab-7d802410975f`于2026-10-08T04:02:45.662Z failed/transport stopped；CP仍started/turn6，11对象保留。Gateway M3/provider_timeout/600365ms、token usage=null，上游终态/计费未知，无新计划/图片。证据在生图`tmp/first-scene-native-{request,submission,status,latency}.json`；不重发/新key/扩预算/改模型。ROc896/version2047/同6Claims/原PDF、父36727536和第二幕保留，旧3e607af0矛盾稿不采用；科学错误不因配置恢复而完成。

## 未完成与下一动作
- 格式db5884b5、Skill20/d82e79c2、paid兼容0d7d493d是42fe历史上线记录；当前回滚45/784，目录恢复依上项。候选保留fresh sourceNotation与旧paid完整prefix/exact call/current-first/唯一历史19及deepEqual；原验证留生图tmp，不解除cb未知终态。
- PNG隔离ea135→9ab与校准54c77→c302均全等/High GO；Gateway23/Worker29、回放52+2及0b CI证据保留。MINIMAX_IMAGE_REVIEW_MODEL仅PNG、未配仍primary；主/Native M3不变，生产未配。root21的science/plan/render沿20、review21、历史19优先，不降未来版本。仍是Worker→Gateway单次vision，非Nous SDK审图循环；科学改善未实测，详见生图tmp/pixel-review-calibration-*。
- 离线wire只证明已有PNG/prompt传递，不能证明科学正确；有效accepted曾漏矛盾，cb第6轮超时未定因。Gaussian/tau/时空/virtual-real仍须修订；原证据保留生图tmp/pixel-review-wire-receipt.json、first-scene-native-diagnostics.json，0新外呼。
- 视频主候选及host3603→92bf已集入/High闭合，原验证保留、Linux host32/32；renderer已有codec，未切生产。[视频合同](../plans/2026-09-05-hermes-presentation-assets-plan.md)14fd→c07c：LTX有原生声/多镜头，分段不强制外置TTS，当前换轨会替代原声/音乐/环境声。无合格原生实片，暂不改模式；账户权限/音色、坏镜头与实际音画待验。
- 视频收费守卫b705→b328、Web helper/组件及phase af4已收且High闭合；legacy无output原key closed hold，已知run先读，prepared B按读run→fresh capability→原key/body POST，保留paid A/B。期刊语义合并与后端CI已通过，完整测试证据保留原tmp/PR。API账户层级不能证明服务端Key的LTX访问能力，不开付费探测。
- 已收reader/CSS/版式126757/c962；原High、两尺寸Edge2PASS及24单测/TC/build复用，未带bc996。586指南组通过；artifact11579945240七PNG/四JSON已由UI全看：full角色/中文可见，en320按钮两行；zh375 reduced为可见静态回退（starting/lastDraw0），不称WebGL画帧。对话迁移单角色、桌面/手机审批页无遮挡；旧空槽描述过时。403捕获High GO不代替生命周期审查；版本阅读PNG仍缺。
- retry892→dad真恢复2PASS、55eb→d1测试Scoped GO；nudge/离屏/Enable各1PASS、两spec TC0；loading原严格单例本次1PASS11.5s，无fail-only产物，历史SyntaxError未定因，累计11不同完整PASS。643两Talk真RED后，Drawer759→e637仅guard原opener capture不被内部控件覆盖，同Godel增量GO/静态0、生图复验两例中。1ff→bd41扩原editor case，a600→5c4关闭初始inline，28d→b1f真实Escape退出字段guide；compact120/visual打开/关闭回120已过，唯visual回焦inactive真RED，新external仍未到达。UI另修Stage inline回焦，不借noninline修复代验。6ab→0baf保留enum补fresh draw，32/a591撤回；navigation/state-loop及版本阅读待CI。证据留生图tmp/hermes-dashboard-ci、视频tmp/hermes-reload-trace-review和root原tmp，不称全绿。
- Task4长表格57c→aa0已收/High GO，Search29/Worker25已CI通过；行窗口失败保lexical。恢复f427→79050保留原retry/双预算/CAS/fence，CLI03b3→3a3faa显式UUID、scope current take2、唯一后严格owner。10-08 21:29只读：当前96b0dbe8-b5cc-4784-a9c2-0b62d12cb766/d357/v27有69 active/0 vector，6368来源/确认/manifest/模型/owner/budgets当时满足；旧049c/be071已非current、不得apply。真实BGE未跑，许可与freshread仍需分别核；原回执在生图tmp/source-index-token-limit-recovery/。
- Fig.2五项属e77已发布v8/OSR-2026-000023-v2的excluded sealed history；d508为68B、929缺行、77b对象缺失，后两项不扩scope。方案High GO，用户已允许exact5软回收并接受成员直链404/初始30天条件，授权持续有效，禁purge/补源/改封存。10-08 23:03:59 fresh五项live/42fe稳定；生图缺认证、UI正常管理入口缺精确ID，双方0写释放，无writer。行标识165已集入ab3但未发布，正常发布后fresh核对再按原授权操作。截图UI tmp/ui-art-20261008/37-fig2-content-manager-identity-gap.png，原方案/zero-write在生图tmp/fig2-cleanup/；实际回收/GET/HEAD/entry.lastError均待。
- 生图浏览器getState及唯一reset后的getState均为request-header policy错误，已停循环；不绕过、不据此判产品故障或宣称实点。UI先前预览启动也曾被自动审批拒绝；按各自真实观察范围记录。
- RO9067 第四幕 `28ab61b0-7931-41d3-8200-2d63c1f986ad` 的供应商 POST 终态未知且无receipt；需可核实的关联/幂等查询合同恢复，不为补齐4/4重发。用户已要求减少中间人工审核；按此接产品流程，公开确认边界不变。

## 已观察产物与保护
- ROc896802c：旧首幕 `27b2381a`、`fc1c5474`、`73746a85`、`b3c023bf` 已通过产品回收站移除并保留30天恢复期。矛盾艺术稿 `3e607af0` 经fresh身份/0子任务/expectedUpdatedAt核对后用普通Domain CAS拒绝，2026-10-08T04:38:17.618Z已rejected，providerCalls0；before/after回执在生图ignored tmp。父 `36727536` 仍approved、第二幕 `e8b6cb5d` 仍private draft，不级联或据旧“成功”重新采用坏稿。
- RO9067 的 run `7a959a7f` 已观察到 SourceMap、paper-author、独立来源审阅与四幕分镜成功；三张图有供应商成功回执，其中第三幕审阅阻断，第四幕外部终态未知。后续第二幕 `ead639dc-e480-4520-8f0c-691402c8b739` 单次成功、两路审阅 accepted、私有 PNG 已实看；不代表全文链路或其余镜头已验收。
- 正例7eb1/d64经historyCopy追到原e550/scene0/c54，原Web5.6-sol accepted、sourceIdentity/5Claims/30Evidence及PDF/Map/PNG字节均核对，PNG实际1280×720。生图tmp/accepted-image-*保存审计，image-reference-case-input.json去掉历史判定/认可标签；不是Native身份或新授权。现存仅published，旧approved带prior review不能直接重开，未造alias/改旧记录；站内实点与合法新任务验收仍缺。
- 历史Synclip `321b013e-9606-4858-82a7-f767105d0069` 阻于科学分镜、无POST/视频费，原失败/bundle回执保留。独立H3 hook `447219218062265` 已回收2560×1440/15.084秒H.264/AAC，画面已看、音轨未获认可；mechanism402不重发，mapping/result未提交，不证明Synclip或四幕完成。

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
- 清理阻断保留：旧离线目录/Junction未删；Next cache当时无进程/3018监听，删除仍在启动前被自动审批以blocked by policy拒绝，0删除/未绕过。该cache现被既有3018验证路径复用，不能按旧无进程快照清理；生图tmp/version-evidence-reader/next-cache-cleanup-{receipt,blocked}.json及原依赖/日志/图保留。

## Read first / 历史
- 启动定向读本页、`node scripts/read-current-management-context.mjs`、Git 与必要只读运行事实，再查能力台账对应入口；progress/index 只定位/摘要，不维护第二份动态任务表。
- 本轮压缩前的全部历史验证、Native 来源修订、精确 oncekey/CP/收据与旧发布记录保留在 Git `748e33a42fe9619365ee8ad5f9e28ead2c1e3594:docs/handoff/2026-09-10-hermes-web-image-handoff.md`；更早证据仍在原 tmp/Git，不删除资产或原记录。它们不是当前 next action。
- 原生方法见 [接入计划](../plans/2026-10-01-native-hermes-agent-plan.md)；[09-18交接](2026-09-18-figure3-image-and-cleanup-handoff.md) 的禁止重放与用户资产保护继续有效。总控核验仅版本/文档一致性；候选、部署、真实观察和用户认可须分开报告。
