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
| 生图系统开发 / `01a0e831-be19-7813-8379-58313178ff26` | 科学分镜、风格冲突、新草稿可见与生图入口、真实私有图验收；先核对 S(z) 与 y–z 椭圆编码冲突 | `C:/Users/Mac/.codex/worktrees/illustration-chain-repair/XGS`，`codex/illustration-chain-repair` |
| 视频系统开发 / `01a0e851-4d6c-7221-9559-b8c56a3413fe` | Synclip adapter/spool/broker、首帧传输边界、审阅恢复、第三幕修订、镜头/音轨/成片 | `C:/Users/Mac/.codex/worktrees/synclip-video-delivery/XGS`，`codex/synclip-video-delivery`；canonical 中原 broker 差异已由 owner 移出 |
| UI优化 / `01a0f118-e09d-7671-af09-0592d6062a6c` | 指南、探索、期刊、研究桌面等全站构图、字体和视觉节奏；真实桌面/窄屏入口验收 | `.worktrees/research-product-craft`，`codex/ui-art-direction-20261008` |
- 生图主责 PresentationWorkbench/ResearchPresentation 的分镜选择与修订行为，UI 主责全站外观；共用 handler、image-review、Gateway provider、api.ts 等须先报具体符号范围，由总控协调顺序。不得覆盖、还原或混入他人改动。
- 使用任务独立工作树，canonical 只集成已明确归属的提交；生产发布按已有锁和干净、已推送精确 SHA 规则串行排程。在途部署/付费任务自然完成后交接，不因协调重启、扩预算或重发。进度写在各自 session，总控只读收取，不另建任务库。

## 当前版本与观察边界
- 2026-10-08 总控只读实核：`/opt/openscience/.release-id` 与公网 `/__release` 均为 `45a577a3a8f6bca78a063e7478fba131c5efb375`；`.rollback-id` 为 `3d6f24a5161665fded3af87111a73f6c69eca736`。两 SHA 均可在本仓解析，Worker 镜像标签匹配；Web/API/Worker 等容器 healthy。
- 接管时 canonical HEAD 为 `748e33a42fe9619365ee8ad5f9e28ead2c1e3594`，其中指南 Hermes 专属栏调整尚未上线；本轮文档提交身份以 Git HEAD 为准。旧 e4ed2457、52f6c1a3、4ed53b71 等是历史发布，不是当前线上锚点。
- 本轮没有部署、迁移、模型请求、真实业务写入或新增功能验收；容器健康与版本一致仅证明运行身份。三个开发 session 的既有操作与付费任务继续按各自授权和证据单独记录。

## 未完成与下一动作
- 生图：新 editorial 草稿同时要求 S(z) 曲线与旧 y–z 椭圆包络，session 正核对坐标、FWHM 与来源；保留已有全文提取。科学编码有冲突时须由原生 Hermes 同源核对，不能把仅改艺术风格当作科学修订已完成。session 已定位修订草稿藏于折叠区、多个旧方案同时带生图按钮，正改为默认最新待审方案、显式选择旧方案、按钮绑定当前选择；候选及真实入口验收未完成，“缓存导致”仍未证实。
- 视频：session 已发现整份请求 256KB 上限与约 500KB 首帧 PNG 不匹配，正修传输边界并复核审阅恢复；报告 broker 旧任务过期、未知付费结果与长任务存活修复已首轮验证，改动限 adapter/spool/broker 及测试，新部署和付费调用未开始。第三幕须纠正二维横向角谱被画成含实数 kz 轴截面，再推进镜头/成片/音轨；候选仍待集成审查，单次正常 JSON 不证明长期稳定。
- UI：用户要求提升整站审美，不能收缩成 Hermes 位置修补。依 [产品 UI 计划](../plans/2026-10-07-product-ui-quality-plan.md) 与现有审美 Skill 逐页改进；代码检查、截图与用户审美认可分别记录。
- 生图 session 本轮报告浏览器工具因无法可靠识别 URL 停止，未继续点击；这不妨碍代码/来源核对，但真实视觉与站内入口仍未验收。不得绕过浏览器策略，也不按此错误推断产品故障。
- RO9067 第四幕 `28ab61b0-7931-41d3-8200-2d63c1f986ad` 的供应商 POST 终态未知且无 receipt；需可核实的关联/幂等查询合同才能恢复，不为补齐 4/4 重发。分镜后是否强制用户审核再生图仍待产品策略确认；公开确认边界不变。

## 已观察产物与保护
- ROc896802c：生图 session 已报告旧首幕 `27b2381a`、`fc1c5474`、`73746a85`、`b3c023bf` 通过产品回收站移除，保留 30 天恢复期；保留父分镜 `36727536`、第二幕私有图 `e8b6cb5d`、新 editorial 草稿 `3e607af0`。父分镜仍被引用；旧图不得被历史“成功”记录重新选入当前入口。
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

## Read first / 历史
- 启动定向读本页、`node scripts/read-current-management-context.mjs`、Git 与必要只读运行事实，再查能力台账对应入口；progress/index 只定位/摘要，不维护第二份动态任务表。
- 本轮压缩前的全部历史验证、Native 来源修订、精确 oncekey/CP/收据与旧发布记录保留在 Git `748e33a42fe9619365ee8ad5f9e28ead2c1e3594:docs/handoff/2026-09-10-hermes-web-image-handoff.md`；更早证据仍在原 tmp/Git，不删除资产或原记录。它们不是当前 next action。
- 原生方法见 [接入计划](../plans/2026-10-01-native-hermes-agent-plan.md)；[09-18交接](2026-09-18-figure3-image-and-cleanup-handoff.md) 的禁止重放与用户资产保护继续有效。总控核验仅版本/文档一致性；候选、部署、真实观察和用户认可须分开报告。
