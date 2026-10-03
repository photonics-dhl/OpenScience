# Hermes / 论文视觉叙事 CURRENT
> 唯一交付树 `.worktrees/onchip-video-release`，分支 `release/onchip-production-line`；根 main 只作导航。

## 目标与决定
- 本轮交付止于生图前：真实 NousResearch Hermes Agent 理解论文并核查科学事实，自动保存六维/Claims/Evidence、科学分镜、构图、完整可迁移提示词和1–2个合适风格；默认首选。随后由用户提供新生图API。物理正确、读者能理解贡献和条件、艺术质量均须实际验收。
- 新论文理解与科学审阅由 Hermes＋MiniMax-M3 完成。服务器GPT不是新论文审阅者；旧GPT来源审阅只保留历史收据/任务兼容。不要继续旧菜单、上传或迟到答案采用方案。
- 目标链路：既有PDF/OCR/SourceMap → 原生Hermes理解/核源 → 六维/Claim/Evidence → 原生Hermes科学分镜/风格/完整prompt → 新生图API（待提供）→ Hermes像素核查 → 用户确认/现有发布流程 → 匿名读者页。
- 用户已认可第二篇物理正确图2cc5003f及细化图681ef614；其科学内容不重做。创建RO和效果展示需少操作；局部管理员/API成功不代表普通用户旅程通过。
- 三篇整体验收、原文疑点回读、可复用经验与定量几何核验仍未全部完成。开源GPU生图第二通道暂停；视频及UI改造独立推进，局部返工不取消这些目标。
- 保留原PDF、SourceMap、认可图片、旧公开版本及paid回答/失败/费用/期限。unknown不重发、失败任务不重开、不猜补科学内容、不放宽来源/Claims/权限守卫；人工核源brief只能作参照。

## 当前锚点
- 分支release/onchip-production-line；10-03已发布源代码提交/app `0d86f351dc01114ffaf517314a5cd8196f2a0bcb`，rollback `33aa38489e1f8418bf7ece866078a38bbfbfcd64`。最后文档同步提交按Git读取，不代表另一轮部署。
- 精确CI37111385512 success及独立High GO；正常app发布exit0，公网/exact release及原部署事务通过。API/Worker running、OOM=false；两者均使用`installed-native-28d637de61f2a12e5c1f4171cf3a00fbcb0dc89e`及`project-catalogue-28d637de61f2a12e5c1f4171cf3a00fbcb0dc89e`、MiniMax-M3，timer enabled/active、实核无活动实例。adapter/资源未变，经High兼容GO复用该安装，未堆新副本。证据 `tmp/hermes-cleanup-20261003/initialization-{ci-result.json,deploy.log,runtime-after.json}`。
- 作者和独立审阅已使用真实paper_review回执保存科学数据，不依赖最后普通回复抄写JSON；旧paid回放及来源/权限/正常stop验证保持。作者实际提交已成功，独立审阅的最新状态见下一节。
- 原生科学分镜caller已部署：同源已审Claims、原文/图页、设计Skill及共享物化保存私有完整prompt。自动run在审批及旧图片派发两处停在awaiting_storyboard_review，即使手工批准也不走旧生图；GET/UI为image-api-pending。尚无新原生科学合格稿贯通到计划的真实验收。

## 当前科学断点与下一步
- 本次run `604e8d9a-c573-4b0d-a404-8dabc5cb664a`、ingestion `b0e4d11c-492f-453a-85af-e9c3337fd4cb`，成功author `c801a07f-8441-4f9d-814e-f4c492474c5f`（约6分14秒/23paid轮、8原页图、两科学Skill）；作者尚需修正角度、传播距离、损伤位置、束流算例及非普适表述。独立核源记录 `tmp/hermes-cleanup-20261003/independent-author-science.md`；原稿/CP/PDF/26页85段Map保留，不再执行创建脚本。
- 0d86修复Worker自动调度漏runtime；初始化恢复沿原retry/同run/原作者，76+280 Domain、80 Worker及TC/build/High/精确CI通过。仅当前run/ingestion已提交才阻断，旧同PDF版本771ff7f3保持。实际恢复回执 `independent-real-resume.json`：version3→4，没有重跑作者或再扣作者费用。
- 实际创建reviewer `271fcec7-bf89-4199-a546-03c3b065305a` 后，在任何模型提交前被新restoration比较拒绝；当前run failed/version6，错误 `[blocked] Native author science/source data changed`。实际task attempt1/retry0、source retry0，1原reservation/1绑定审计、0Gateway调用、无Native CP；result只有sourceMapRef和Native标识。只读证据 `native-review-preflight.json`，SourceMap原字节hash相符。
- 根因已用真实稿/真实Map离线复现：仅evidenceSegments定位框存在IEEE-754末位差异，正文/引用/Claims/其余字段完全一致。Worker候选复用现有resolveSourceLocator的序列化容差，只归一已验证定位框后仍严格比较其他内容；真实离线1/1、Worker120/TC/lint及High GO；同task/原预留恢复Domain376/TC/build、Web26/TC/lint及真实浏览器fixture2/2已通过，最终组合High与精确CI待完，未再提交模型；不得套用“尚未创建审阅”的旧初始化恢复。
- 下一步完成该窄修复/恢复的最终审查与精确CI，发布后沿原reviewer继续。审阅结果须独立对原文确认，再验自动私有分镜、完整prompt及1–2风格；新API前旧生图继续暂停。工程通过不等于科学通过。
- 历史v11–v13失败/paid证据、33aa独立角色增量及早期终稿JSON故障见Git0d86本页与tmp/hermes-cleanup-20261003/、tmp/ro-journey-20260929/；不是新建任务/重放步骤。旧bridge唯一基线失败、research-run.ts既有20lint均保留，不改不相关行为。安装0.10.0缺最新structured plugin/grounded-citations；不因名称存在就冒称可用，不盲升级或叠Skill。

## Illustration delivery
| 论文 / Taskmaster | 已见产品与用户反馈 | 剩余交付 |
|---|---|---|
| 第一篇 / 1、5 | RO9067a2d5，六维/6Claim/58Evidence；公开v3/v4保留，v5选65ffbfee（hash54484359…），正式审图/人工像素/High通过，匿名入口已实点。私有v11的失败图与收据保留。 | 用户整体审美与可理解性反馈待收，不批量冷启动。 |
| 第二篇 / 2、5 | ROc896802c；旧v4物理被用户否定，只作误判证据。私有v14/771ff7f3，用户认可2cc5003f物理及681ef614最终细节（hashad79b0a0…），未公开。 | 可沿现有流程采用/新公开；新的原生自动理解与计划仍须另行证明，不能借用旧图冒充。 |
| 第三篇 / 3、5 | ROaa450f1e，公开v2/OSR-2026-000024，7eb1b7ee与4e64c389两图、六维/5Claim/30Evidence、匿名轮播与PDF边界已实测；用户称赞首图。 | 单图称赞不等于整篇科学叙事验收；旧MOED错图留私有。 |
| 能力 / 4 | 原配图Skill v16、原生Agent科学与设计入口、自动计划接线存在。 | 核源/条件保真、跨任务经验、几何检查、Fig.2重复plan及d5087b03悬空copy仍待处理；Fig.1原字节展示方案已否定。 |

## Capability linkage
- 入口/真实调用/消费缺口见[能力台账](../runbooks/hermes-capability-registry.md)；历史固定map/reduce/compose仍服务无Native marker及manuscript-only任务，GPT web分支仍服务绑定历史收据，不能整块删。新Native paper在Worker入口直接返回，不经过这些路径。
- 本轮仅删无tracked调用的readResearchDocument包装；内部buildPaperReadingSynthesis及历史控制测试保留。已移除确认结束的本任务baseline副本/压缩包，154文件/3,854,474字节及1个依赖junction；只删链接本身，共享依赖未动，基线结果日志保留。收据 `tmp/hermes-cleanup-20261003/baseline-cleanup.json`。另两份旧文档脚本、当前independent-domain-baseline目录/归档的删除被自动审批以blocked by policy拒绝，未执行/重试，保留且不作为当前操作入口；baseline内依赖junction目标须保护。
- 当前开发树/线上/真实科学结果必须分别判断。10-03 Browser26.930.21537成功选择iab但一次站点导航仍因saved browser permissions无法核验而停止，未读页面且未绕过，收据independent-browser-limit.txt；CI浏览器不能代替真实角色入口。

## 其他交付与保护
- UI：b7ad37f2帽沿气泡/单Live2D/窄屏修复已合入并上线；132定向/TC/lint/High/精确CI通过，真实逐页视觉/角色/键盘与动效仍待验。公司Word已按实际交付同步；证据 `tmp/ui-hat-polish-20261002/`，细节见[设计](../specs/2026-09-05-integrated-research-product-design.md)和[公司交接](2026-09-30-vendor-evaluation.md)。
- UI质感候选独立归属codex/research-product-craft：用户认可第三张guide方向、Figma已实看；GSAP/Canvas及多页布局候选通过49定向/High，尚未合入或部署。10-03已定位权限核验断点：本机默认C:/Users/Mac/.codex为Junction，native TOML读取拒绝所有符号链接祖先；独立High与反汇编核实。User CODEX_HOME已指向同一数据的E:/Softlinks_to_C/.codex，未改权限/安全检查；已接入用户桌面“Codex 代理启动”的原start-codex-proxy.ps1，保留Store激活及127.0.0.1:7890代理；PS5语法/实际root设置与子进程继承通过，原脚本备份和回退收据在UI树tmp/design-tools-20261002/implementation/。10-03重启后Process/User真实root已实核；另发现bundled marketplace仍用旧verbatim路径，官方CLI清单为空；只修同目录source行后六个既有插件恢复installed/enabled，其他配置字节/代理/安全守卫未变。私密非Secret表备份及精确回退在同收据目录；当前回合缺Browser技能，待新一轮载入后实际验页面读取/截图/交互，插件清单恢复不等于浏览器或UI验收。保留其预览、旧UI树和证据，不能按本轮清理删除。当前Git身份以该会话/worktree实查为准。
- 视频：品牌原片447219588464928已取回且用户认可画面，配音仍待改善；论文首镜447314218062265实看发现符号/波纹问题，第二镜HTTP402无taskId，不能重放create或把未听验声音标通过。原片/marker/Qwen权重及临时发布树保留；下一步余额对账与旁白/运动修订由视频会话持有，见 `tmp/video-system-20260930/` 和原Task4计划。
- 公司：只负责正式上线与年度运维，我方继续功能开发；脱敏包/屏幕共享，不给GitHub/服务器账号。21项PDF修正已合入部署；期刊真实试用、版权与额度见[期刊CURRENT](2026-09-15-journal-onboarding-handoff.md)。
- 已知独立债务：第14页BGE表格超token限制已恢复lexical（69active chunks），dense未完成；旧v11的58chunks保留。备用key已修好，当前失败无余额耗尽证据，不再重复鉴权任务。视频43旧缓存的13.04GB清理已完成，不重放维护。
- 清理仅确认归属且无活动/发布/回退依赖的生成物；不删浏览器profile/spool、历史paid回答、模型权重、用户资料或他人worktree。来源/匿名PDF下载边界及公开版本保护保持。

## Read first / 历史
- 启动读本页、必要的当前代码/服务器事实与[能力台账](../runbooks/hermes-capability-registry.md)对应条目；管理任务用现有read-current-management-context/Taskmaster，不另建状态库。
- 10-03以前的应用、GPT菜单/来源审校、v1–v10失败、旧发布与收费过程从Git `ce513eba` 的本页及 `tmp/ro-journey-20260929/` 按需查。它们不是当前next action；[09-18交接](2026-09-18-figure3-image-and-cleanup-handoff.md)的禁止重放事项仍有效。
