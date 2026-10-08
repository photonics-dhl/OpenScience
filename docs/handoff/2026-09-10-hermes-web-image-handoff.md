# Hermes / 论文视觉叙事 CURRENT
> 唯一交付树 .worktrees/onchip-video-release，分支 release/onchip-production-line；根 main 只作导航。2026-10-08 总控接管，状态以实际 Git、运行事实与各 session 的最新用户决定为准。

## 目标与决定
- 需求依据仍为 [开发规格](../OpenScience_Kimi_Development_Spec.md) 和用户最新决定：真实 NousResearch Hermes Agent 理解全文、核对转述、生成六维/Claims/Evidence、科学分镜与完整提示词，再交给 Synclip。论文是事实来源，不用固定答案或 Codex 手稿替代自动科学能力。
- 先完成 2–3 篇真实论文的凝练、用户确认、配图审核与公开展示；三篇整体验收、普通用户旅程、视频成片及整站审美均未完成。单图认可、构建成功、模型成功或部署成功不能代替对应验收。
- 新图片与视频按既有 Synclip 授权继续；图片已验证 gpt-image-2，视频目标 LTX。gpt-image-2.5 曾无 receipt 返回 UNCERTAIN，确切模型合同仍待核实，不盲重试或自动切换供应商。Hermes 独立像素核验尚不能算通用已验收能力。
- 保留原 PDF/SourceMap、认可图片、公开标识、旧版本和失败/费用/回执；日常结果为私有草稿，公开沿现有确认流程。未知外部提交、旧 oncekey、paid/started checkpoint 不得因接管或旧文档提示而重放。

## 总控与并行分工
- 用户于 2026-10-08 指定总控「协调三个并行开发会话」：`01a1197c-7a1e-7631-b1c1-2d09b587be9a`。总控负责范围/依赖协调、集成审查、发布排程和 CURRENT/progress/index 汇总；其他 session 保留其既有用户任务，专属计划仍由对应 owner 维护。
| Session / ID | 主责与本轮焦点 | 活动工作树 |
|---|---|---|
| 生图系统开发 / `01a0e831-be19-7813-8379-58313178ff26` | paid兼容已集入/CI通过；科学草稿与图片质量待真实Native纠正，无新付费 | `C:/Users/Mac/.codex/worktrees/illustration-chain-repair/XGS`，`codex/illustration-chain-repair` |
| 视频系统开发 / `01a0e851-4d6c-7221-9559-b8c56a3413fe` | Native/Domain/Worker接线、草稿技术资格与自动推进、Gateway音频/broker；依已审计划实施 | `C:/Users/Mac/.codex/worktrees/synclip-video-delivery/XGS`，`codex/synclip-video-delivery`；从7755a5ef续作 |
| UI优化 / `01a0f118-e09d-7671-af09-0592d6062a6c` | 指南、探索、期刊、研究桌面等全站构图、字体和视觉节奏；真实桌面/窄屏入口验收 | `.worktrees/research-product-craft`，`codex/ui-art-direction-20261008` |
- 生图主责 PresentationWorkbench/ResearchPresentation 的分镜选择与修订行为，UI 主责全站外观；共用 handler、image-review、Gateway provider、api.ts 等须先报具体符号范围，由总控协调顺序。不得覆盖、还原或混入他人改动。
- 使用任务独立工作树，canonical 只集成已明确归属的提交；生产发布按已有锁和干净、已推送精确 SHA 规则串行排程。在途部署/付费任务自然完成后交接，不因协调重启、扩预算或重发。进度写在各自 session，总控只读收取，不另建任务库。

## 当前版本与观察边界
- 2026-10-08 总控只读实核：`/opt/openscience/.release-id` 与公网 `/__release` 均为 `45a577a3a8f6bca78a063e7478fba131c5efb375`；`.rollback-id` 为 `3d6f24a5161665fded3af87111a73f6c69eca736`。两 SHA 均可在本仓解析，Worker 镜像标签匹配；Web/API/Worker 等容器 healthy。
- 接管时 canonical HEAD 为 `748e33a42fe9619365ee8ad5f9e28ead2c1e3594`，其中指南 Hermes 专属栏调整尚未上线；本轮文档提交身份以 Git HEAD 为准。旧 e4ed2457、52f6c1a3、4ed53b71 等是历史发布，不是当前线上锚点。
- 已推候选 `7755a5ef7ab0a6bfa5184b54dd93c4054f883be4`（frontend/nanqing）含视频/恢复、分镜UI、格式/Skill20/paid兼容及期刊交接；[PR113](https://github.com/photonics-dhl/OpenScience/pull/113) base为release/onchip-production-line，说明已对齐，未合并PR/main或部署。媒体push/PR `37738191707`/`37738197341`、视频 `37738197340`、期刊 `37738197385` 全success；新15回放与浏览器6/6在Linux实跑。证据 `tmp/session-coordination-20261008/paid-replay-ci-7755.json`、`paid-replay-linux-complete.log`；后续仅文档检查点随下一代码批次并推，CI不代表真实科学/成片质量。
- 2026-10-08 M3配置错配已修：原Gateway=MiniMax-M3.1-Flash-Preview、Native=M3会在外呼前拒绝。High GO后只恢复 .env.prod 的MINIMAX_MODEL=M3，原锁/私有备份/空闲复核下同版本重建Worker/API/Web；Native、镜像/挂载及release/rollback/公网身份不变。apply exit0、applied/verified，三次AgentTask/ResearchRun/JournalJob均0，无模型/迁移。私有备份/receipt在 `/opt/openscience/observations/model-m3-restore-20261008T034213Z`，本机完整核验及预备失败在 `tmp/session-coordination-20261008/`；未创建服务器.env，未放宽身份检查。
- 唯一原生计划 `cb063919-3cf7-40ad-aeab-7d802410975f` 已实际failed，updatedAt=2026-10-08T04:02:45.662Z，error为Native task transport stopped/original receipts retained；CP仍started/turn6，11 Native对象保留。按CP promptHash查Gateway为M3/provider_timeout/600365ms，input/outputTokens=null，上游终态与计费未知；没有新计划资产/图片。此前已读源/页图及6次skill_view，第5轮science因source-boundnumber/expression拒收而自修；配置修复不等于科学前置完成。其树 `tmp/first-scene-native-{request,submission,status,latency}.json` 保存证据，owner仅继续输入尺寸/耗时/绑定错配的有界只读诊断；不重发/新key/扩预算/改模型。ROc896/version2047/同6Claims/原PDF与父36727536、第二幕保护不变；旧3e607af0矛盾稿不采用。

## 未完成与下一动作
- 格式修复a03e3b06→db5884b5已High GO；Fig/TeX/因子边界RED→GREEN，P1后250/250，末改Native185新跑、parser56/materializer10复用，TC0；原5lint错误同基线。fresh/精确新description采用sourceNotation，旧paid/未知/非Native仍旧规则，不追改旧标量缺口；真实25片段错引用仍拒。证据在生图tmp/source-notation-*，Windows接线收集失败后Linux实际通过；尚未部署或新生图。
- Skill20 efa2ff69→d82e79c2已CI通过，Native/Synclip、转述保真与sN规则保留。真实v19→v20的art/handdraw与repair回放RED后，8df0c4dcd194923966c6c3fe15683c4db3720652五文件已High GO并全等集为0d7d493d；唯一历史Execution仅用于已验证CP完整prefix的exact call恢复，当前先重编译，必要时还原私有前置state再历史重编译，完整deepEqual保留，science/profile不回退。实际NativeSession cursor0回放/后续paid/finish覆盖auto/aged/handdraw/repair，modelComplete0/CPwrite0；新请求仍20，tamper/unknownstarted阻断。最后新15+原185=200/200，复用未变handdraw18和完整真实v19两例；TC/scopedlint/diff0。日志生图tmp/native-skill-replay-final-*及各RED，bcbc9b5f接入的本批media CI已通过；生产安装/真实效果未验收，cb旧CP继续hold。
- 有界诊断见生图树 `tmp/first-scene-native-diagnostics.json`：实际前4次调用12.7/7.0/14.9/15.3s，第5科学草稿340815ms/12665输出含reasoning，第6有效1721322bytes/20消息、maxTokens32768/600秒，低于64000000本地上限；只排除本机oversize拒绝，超时未定因。已完成turn的压缩后空messages不可当历史外发尺寸。High诊断指出20/500/77nm及1MeV/0.94c引用错来源、Gaussian1.8缺对应段；须Native改正，不由归一化补映射。额外tau箭头、观察/渡越时间与virtual/real歧义仍待科学修订。
- 视频828f82ce/ec305b85已集为9b2e08d0/a74b34a0，Linux CI通过；其树`tmp/synclip-video-contract/integration-evidence.md`保留14项展示fixture/1项Domain空稿既有失败，不报全仓通过。参考帧1074f761水印/z/k⊥、第三幕2ef0b5f2、账户权限/音轨/成片仍未验收。cdad0ce7→172b8072的[Native视频接线](../plans/2026-09-05-hermes-presentation-assets-plan.md#2026-10-08-原生论文视频接线设计候选源码仍只读)已High设计GO；总控已授该表Native/Domain/Worker/后端API及Gateway音频/broker写权给视频owner，Web意图/客户端类型归UI，稳定合同先对齐。按7755完整paid能力元组与回放续作，复用单一Agent/队列、真实技术审阅与既有授权槽位；未知付费hold不解除。当前是实施分工，未证明新接线、自动推进或自然配音完成。
- 生图UI八文件 `4e312895a4e3eb5a236ee43b17c80f0fea37d662` 已集为 `a3355eef`，八文件与owner源全等；三个lifecycle P2已真实React 5项RED→GREEN，19单测/WebTC/scopedlint及High GO。其树 `tmp/illustration-{plan-selection-tests,lifecycle-final,lifecycle-red,web-typecheck,plan-selection-lint}.log` 保留证据；总控接入的Linux完整retention E2E已6/6通过。WEB_BASE_URL=3037只免重复启动无关注册页fixture，beforeAll自启原Vite，不跳过用例。仍未上线或生产入口验收；科学任务失败不改变这组独立代码证据。
- UI候选8137bb0e/d8e5ec2b仍在专属树，Web构建/55定向通过，官网登录已有；预览启动自动审批仅返回blocked by policy，无绕过，新布局/键盘/角色连续性待实际验收。用户要求参考成熟助手/Figma重做功能层级与审美，已确认研究桌面完整Hermes工作席、阅读/设置按场景收起；测试/中间记录退出主视野，用户聚焦最终效果/采用。依[产品UI计划](../plans/2026-10-07-product-ui-quality-plan.md)继续，Figma认证由原会话处理；Web视频意图待后端稳定合同接入，不另造资格规则。真实资产/未知付费证据保护，尚未审美验收。
- 生图 session 本轮报告浏览器工具因无法可靠识别 URL 停止，未继续点击；这不妨碍代码/来源核对，但真实视觉与站内入口仍未验收。不得绕过浏览器策略，也不按此错误推断产品故障。
- RO9067 第四幕 `28ab61b0-7931-41d3-8200-2d63c1f986ad` 的供应商 POST 终态未知且无receipt；需可核实的关联/幂等查询合同恢复，不为补齐4/4重发。用户已要求减少中间人工审核；按此接产品流程，公开确认边界不变。

## 已观察产物与保护
- ROc896802c：旧首幕 `27b2381a`、`fc1c5474`、`73746a85`、`b3c023bf` 已通过产品回收站移除并保留30天恢复期。矛盾艺术稿 `3e607af0` 经fresh身份/0子任务/expectedUpdatedAt核对后用普通Domain CAS拒绝，2026-10-08T04:38:17.618Z已rejected，providerCalls0；before/after回执在生图ignored tmp。父 `36727536` 仍approved、第二幕 `e8b6cb5d` 仍private draft，不级联或据旧“成功”重新采用坏稿。
- RO9067 的 run `7a959a7f` 已观察到 SourceMap、paper-author、独立来源审阅与四幕分镜成功；三张图有供应商成功回执，其中第三幕审阅阻断，第四幕外部终态未知。后续第二幕 `ead639dc-e480-4520-8f0c-691402c8b739` 单次成功、两路审阅 accepted、私有 PNG 已实看；不代表全文链路或其余镜头已验收。
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
- 公司正式上线与年度运维交接、期刊真实试用等既有目标保留，期刊任务见 [期刊 CURRENT](2026-09-15-journal-onboarding-handoff.md)；本次协调未扩大权限、版权或额度范围。
- 已合入远端独有的10-06期刊交接 `6d1e8bd6`：共享理解代码da3045当时已部署，精确期刊/Hermes CI、16例Parser及ScanSci/BGE探针通过；真实期刊PDF→Hermes与人工科学质量仍未验收。历史部署证据保存在期刊CURRENT，不能覆盖本页当前生产锚点。生图unused离线安装目录的删除被自动审批policy拒绝，未执行且不绕过；仍在ignored tmp隔离，既有依赖与产品路径保留。

## Read first / 历史
- 启动定向读本页、`node scripts/read-current-management-context.mjs`、Git 与必要只读运行事实，再查能力台账对应入口；progress/index 只定位/摘要，不维护第二份动态任务表。
- 本轮压缩前的全部历史验证、Native 来源修订、精确 oncekey/CP/收据与旧发布记录保留在 Git `748e33a42fe9619365ee8ad5f9e28ead2c1e3594:docs/handoff/2026-09-10-hermes-web-image-handoff.md`；更早证据仍在原 tmp/Git，不删除资产或原记录。它们不是当前 next action。
- 原生方法见 [接入计划](../plans/2026-10-01-native-hermes-agent-plan.md)；[09-18交接](2026-09-18-figure3-image-and-cleanup-handoff.md) 的禁止重放与用户资产保护继续有效。总控核验仅版本/文档一致性；候选、部署、真实观察和用户认可须分开报告。
