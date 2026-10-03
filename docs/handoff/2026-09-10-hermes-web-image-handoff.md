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
- 10-03发布后实核：app `28d637de61f2a12e5c1f4171cf3a00fbcb0dc89e`；rollback `2db4cfa2cf44664b07128e8349e6a2c3ef11e1ac`。API/Worker running、OOM=false；两者Native runtime/catalogue均同28d完整SHA、MiniMax-M3，broker timer enabled/active，采样时无活动Native实例（随后创建下方v13）。证据 `tmp/hermes-cleanup-20261003/paired-runtime-after.json`。
- 本轮起点HEAD `ce513eba57261d368756ddf8ce0ca75243adb90a`，干净；同分支新增候选见下行，文档提交不代表部署。
- c6精确CI37038196528 success、正常app发布和Native安装激活exit0。直接紧凑审阅终稿已接通，paper_review仅作可选格式反馈；107定向pass/8Windows UDSskip、TC/lint/High GO。工程通过与科学质量分开。
- 原生科学分镜caller已部署：复用已审科学来源、原文/图页、设计Skill和共享科学艺术物化，保存私有完整prompt；自动run在旧审批和图片派发两处停在awaiting_storyboard_review，即使手工批准也不走旧生图，GET/UI明确image-api-pending。尚无新原生科学合格稿贯通到计划的真实验收。

## 当前科学断点
- 历史私有v11：ingestion `02c1e0f9-68dd-4b9b-beb9-7a3224b26b41`，task `8e184f93-937c-4022-9247-9616fde89b0c`，key `native-hermes-paper-20261003-cds-v11`。复用原26页/85段SourceMap；3分42秒/12paid回复后failed，完整end_turn终稿存在，未采用/规划/生图。
- 格式拒收：accepted附重复正文和来源；五字段逐字同稿，results只删五处换行。现有accepted必须选择原稿，不能把修改伪装为接受；仅修格式不能消除科学错误。
- 独立科学NO-GO：材料内边缘损伤阈值错放狭缝中心、正文/附录公式冲突未披露、10cm算例条件泛化、背景跨方法因果外推、复现强断言。完整审查见 `tmp/ro-journey-20260929/native-real-paper-v11-scientific-acceptance.md`。
- 真实Skill使用：读取scientific-critical-thinking及完整原方法，读P00001–35/85并看原页6/7；没有paper_search、source-review Skill或draft后回读，关键p24/P00076未读。overview已包含附录标题，不能归罪于缺源或未安装Skill。
- 本轮已部署：把现有openscience-source-review明确放到draft_ready后的任务指令及现有Skill方法，方法按保留结论的对象/量/条件/算例渐进核源，说明来源冲突和accepted选择原稿。没有新模型阶段、额度、门禁或科学答案注入；守卫及原paid工具description/schema不改。72项科学物化、WorkerTC、三文件lint、文档audit/lint通过；High指出历史draft反馈不可变，已保留原反馈。最终High GO，精确CI37087580638 success，正常app发布及Native安装激活exit0，两运行时/方法目录配对；证据 `tmp/hermes-cleanup-20261003/{ci-result.json,deploy.log,native-activation.log}`，不能声称Hermes已实际遵循或科学改善。
- 单一新私有验证v12：ingestion `d9cafbd9-ff1c-415e-ae17-42e455bd904b`，task `ac817822-4a03-4b92-a903-aa7f584ac985`，key `native-hermes-paper-20261003-cds-v12`；正常有费用重分析，复用原PDF/SourceMap，不重新OCR，不重开v11。已failed（02:14:36.994Z，3分27.399秒/11paid）；accepted-only表示正确，但C2的真实P8/P9未归入method字段来源，最终守卫拒收。独立科学NO-GO：近垂直被写成对头、单电子/电子束运算混用、10cm传播算例写成必要门槛；未采用/规划/生图，不重开或追加连续新分析。科学记录 `tmp/hermes-cleanup-20261003/real-paper-science-v12.md`；创建/进度/原答证据在 `tmp/hermes-cleanup-20261003/real-paper-*-v12.*`。
- 新对照输入已部署：草稿回执配对本次实际选中的summary和完整Claim及完整原P，复用原field-Claim诊断提前提示现有绑定错误；历史无context/旧context/新rich描述精确区分，旧paid工具/反馈/属性顺序不变。113定向pass、WorkerTC/四文件lint0、独立High GO；旧源码两项真实回归RED，原v12真实notes离线捕获1/1、零provider。精确CI37092238580 success，正常app发布及Native配对exit0；证据 `tmp/hermes-cleanup-20261003/paired-*`。无新模型阶段/额度/门禁/Domain或API变化，不能据部署证明科学改善。
- 新私有v13已failed：ingestion `366931b0-acbc-4038-95c3-edc478cb98ca`，task `64b2aaf8-57e6-4401-bc89-78e9f849884d`，key `native-hermes-paper-20261003-cds-v13`；复用原Map，5分13.871秒/9paid回复，正常stop但只给普通解释、无JSON，原守卫拒收。实际最后请求已有完整草稿/Claims/原P及两绑定诊断；离线1/1证明本次配对与原P一致、零provider、控制提示初末不变，排除这些候选的丢传/投影错误，不能推断模型为何误判。
- v13独立科学NO-GO：保存稿把近垂直误写近正碰，终答把0.4THz的10cm示例泛化，棱镜直径跨算例移用；材料内缘阈值表述局部改善。两个Skill在稿前已读，未调用原页/专项引用/稿后核源。未采用/规划/生图，不重开或发v14。原文依据与完整记录 `tmp/hermes-cleanup-20261003/real-paper-science-v13.md`。
- 工具提交候选：新任务用现成paper_review保存完整终审对象，普通末回复不再复制科学JSON；仅精确新description启用，旧工具/feedback/system/goal及严格JSON回放保持。重新校验最新唯一成功回执、真实draft及全部原科学守卫；后续写入/失败review不退回旧成功。stop/provider/model/authority与实际responseHash不改，无自动重试/新模型阶段/额度/审批/hash。新字段来源容量对齐现有64，旧schema和issues仍12；已观察17来源真回归RED，132/TC/四文件lint通过，最终High GO，待精确CI及app发布，未新call。证据 `tmp/hermes-cleanup-20261003/tool-submission-*`。
- 下一步：收敛工具提交候选High、精确CI并正常app发布，兼容复用现有immutable28d Native（adapter/科学资源未变，不新增安装副本）；随后解决实际科学核源效果，真实科学通过才验证自动计划。v13及其科学NO-GO保持，无依据不发v14、不升预算/补普通正文。GitHub最新structured plugin/grounded-citations不在当前安装；delegate文件存在不代表当前transport可调用，实核 `native-completion-capabilities.json`，不盲升级/叠Skill。

## Illustration delivery
| 论文 / Taskmaster | 已见产品与用户反馈 | 剩余交付 |
|---|---|---|
| 第一篇 / 1、5 | RO9067a2d5，六维/6Claim/58Evidence；公开v3/v4保留，v5选65ffbfee（hash54484359…），正式审图/人工像素/High通过，匿名入口已实点。私有v11的失败图与收据保留。 | 用户整体审美与可理解性反馈待收，不批量冷启动。 |
| 第二篇 / 2、5 | ROc896802c；旧v4物理被用户否定，只作误判证据。私有v14/771ff7f3，用户认可2cc5003f物理及681ef614最终细节（hashad79b0a0…），未公开。 | 可沿现有流程采用/新公开；新的原生自动理解与计划仍须另行证明，不能借用旧图冒充。 |
| 第三篇 / 3、5 | ROaa450f1e，公开v2/OSR-2026-000024，7eb1b7ee与4e64c389两图、六维/5Claim/30Evidence、匿名轮播与PDF边界已实测；用户称赞首图。 | 单图称赞不等于整篇科学叙事验收；旧MOED错图留私有。 |
| 能力 / 4 | 原配图Skill v16、原生Agent科学与设计入口、自动计划接线存在。 | 核源/条件保真、跨任务经验、几何检查、Fig.2重复plan及d5087b03悬空copy仍待处理；Fig.1原字节展示方案已否定。 |

## Capability linkage
- 入口/真实调用/消费缺口见[能力台账](../runbooks/hermes-capability-registry.md)；历史固定map/reduce/compose仍服务无Native marker及manuscript-only任务，GPT web分支仍服务绑定历史收据，不能整块删。新Native paper在Worker入口直接返回，不经过这些路径。
- 本轮仅删无tracked调用的readResearchDocument包装；内部buildPaperReadingSynthesis及历史控制测试保留。已移除确认结束的本任务baseline副本/压缩包，154文件/3,854,474字节及1个依赖junction；只删链接本身，共享依赖未动，基线结果日志保留。收据 `tmp/hermes-cleanup-20261003/baseline-cleanup.json`。另两份旧文档重写脚本的删除被自动审批以blocked by policy拒绝，未执行；保留且不作为当前操作入口。
- 当前开发树/线上/真实科学结果必须分别判断。Windows账号UI观察仍因工具URL策略停止，没有绕过；CI浏览器不能代替真实角色入口。

## 其他交付与保护
- UI：b7ad37f2帽沿气泡/单Live2D/窄屏修复已合入并上线；132定向/TC/lint/High/精确CI通过，真实逐页视觉/角色/键盘与动效仍待验。公司Word已按实际交付同步；证据 `tmp/ui-hat-polish-20261002/`，细节见[设计](../specs/2026-09-05-integrated-research-product-design.md)和[公司交接](2026-09-30-vendor-evaluation.md)。
- UI质感候选独立归属codex/research-product-craft：用户认可第三张guide方向、Figma已实看；GSAP/Canvas及多页布局候选通过49定向/High，尚未合入或部署，真实浏览器权限核验阻塞。保留其预览、旧UI树和证据，不能按本轮清理删除。当前Git身份以该会话/worktree实查为准。
- 视频：品牌原片447219588464928已取回且用户认可画面，配音仍待改善；论文首镜447314218062265实看发现符号/波纹问题，第二镜HTTP402无taskId，不能重放create或把未听验声音标通过。原片/marker/Qwen权重及临时发布树保留；下一步余额对账与旁白/运动修订由视频会话持有，见 `tmp/video-system-20260930/` 和原Task4计划。
- 公司：只负责正式上线与年度运维，我方继续功能开发；脱敏包/屏幕共享，不给GitHub/服务器账号。21项PDF修正已合入部署；期刊真实试用、版权与额度见[期刊CURRENT](2026-09-15-journal-onboarding-handoff.md)。
- 已知独立债务：第14页BGE表格超token限制已恢复lexical（69active chunks），dense未完成；旧v11的58chunks保留。备用key已修好，当前失败无余额耗尽证据，不再重复鉴权任务。视频43旧缓存的13.04GB清理已完成，不重放维护。
- 清理仅确认归属且无活动/发布/回退依赖的生成物；不删浏览器profile/spool、历史paid回答、模型权重、用户资料或他人worktree。来源/匿名PDF下载边界及公开版本保护保持。

## Read first / 历史
- 启动读本页、必要的当前代码/服务器事实与[能力台账](../runbooks/hermes-capability-registry.md)对应条目；管理任务用现有read-current-management-context/Taskmaster，不另建状态库。
- 10-03以前的应用、GPT菜单/来源审校、v1–v10失败、旧发布与收费过程从Git `ce513eba` 的本页及 `tmp/ro-journey-20260929/` 按需查。它们不是当前next action；[09-18交接](2026-09-18-figure3-image-and-cleanup-handoff.md)的禁止重放事项仍有效。

