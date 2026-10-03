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
- 分支release/onchip-production-line；10-03已发布源代码提交/app `e48ea03982d6650577e10400503f28ea206e527a`，rollback `0d86f351dc01114ffaf517314a5cd8196f2a0bcb`。最后文档同步提交按Git读取，不代表另一轮部署。
- 精确CI37114648899 success及独立High GO；正常app发布exit0，公网/exact release及原部署事务通过。API/Worker running、OOM=false；两者均使用`installed-native-28d637de61f2a12e5c1f4171cf3a00fbcb0dc89e`及`project-catalogue-28d637de61f2a12e5c1f4171cf3a00fbcb0dc89e`、MiniMax-M3，timer enabled/active。adapter/资源未变，经High兼容GO复用该安装，未堆新副本。证据 `tmp/hermes-cleanup-20261003/native-preflight-{ci-result.json,deploy.log,runtime-after.json}`。
- 作者和独立审阅已使用真实paper_review回执保存科学数据，不依赖最后普通回复抄写JSON；旧paid回放及来源/权限/正常stop验证保持。作者实际提交已成功，独立审阅的最新状态见下一节。
- 原生科学分镜caller已部署：同源已审Claims、原文/图页、设计Skill及共享物化保存私有完整prompt。自动run在审批及旧图片派发两处停在awaiting_storyboard_review，即使手工批准也不走旧生图；GET/UI为image-api-pending。尚无新原生科学合格稿贯通到计划的真实验收。

## 当前科学断点与下一步
- 本次run `604e8d9a-c573-4b0d-a404-8dabc5cb664a`、ingestion `b0e4d11c-492f-453a-85af-e9c3337fd4cb`，成功author `c801a07f-8441-4f9d-814e-f4c492474c5f`（约6分14秒/23paid轮、8原页图、两科学Skill）；作者尚需修正角度、传播距离、损伤位置、束流算例及非普适表述。独立核源记录 `tmp/hermes-cleanup-20261003/independent-author-science.md`；原稿/CP/PDF/26页85段Map保留，不再执行创建脚本。
- 0d86修复Worker自动调度漏runtime；初始化恢复沿原retry/同run/原作者，76+280 Domain、80 Worker及TC/build/High/精确CI通过。仅当前run/ingestion已提交才阻断，旧同PDF版本771ff7f3保持。实际恢复回执 `independent-real-resume.json`：version3→4，没有重跑作者或再扣作者费用。
- reviewer `271fcec7-bf89-4199-a546-03c3b065305a` 首次在任何模型提交前被restoration比较拒绝，错误 `[blocked] Native author science/source data changed`。当时attempt1/retry0、source retry0，1原reservation/1绑定审计、0Gateway调用、无Native CP，证据 `native-review-preflight.json`。e48发布后仅执行一次原retry恢复：同reviewer attempt2已succeeded/18轮，原作者不变；实际调用两科学Skill、paper_read6次、paper_view7次，保留原1笔reservation。回执 `independent-native-preflight-resume.json`；不得重放创建、旧初始化或本次恢复脚本。
- 根因用真实稿/Map离线复现：仅evidenceSegments定位框存在IEEE-754末位差异，其他科学/来源字段相同。已发布修复复用resolveSourceLocator既有容差，仅归一已验证定位框；真实离线1/1（合成决策，不是科学认可）、Worker120、Domain376、Web26及浏览器fixture2/2、相关TC/build/lint、High/精确CI通过。Domain原20lint基线保持，未引入新错误。
- 审阅结果独立High科学NO-GO：limitations已区分10/100cm，results却仍保留≥10cm；另有入射角/公式条件遗漏、束流分组矛盾、损伤内缘遗漏、既有方法不可能与高ζ低光子数的过度外推。详见independent-reviewer-science.md，不能将review_received称合格。自动物化私有draft b2508270-e8a8-4014-a8f9-e8511a16ed4b（6Claims/35Evidence），没有公开。
- 自动分镜task 7226c434-a5b4-483f-9809-ec73937248b3在1个已付费帧后因Native transport停止；run现failed/version11，没有资产或新图片。真实工具参数保存在independent-real-status.json。已用实际native28d方法复现：超过100000字符的工具结果被替换成预览，102278字符重建context变1590字符非JSON，Worker在第二次模型请求前拒绝。当前任务精确DB上下文已用线上编译投影取得：126001字符/164069字节，6Claims/35Evidence/0original、无任务后Claim改动、JSON往返完全一致（native-illustration-context-exact.json）；per-instance原回执保真适配已实现task_agent.py：当前paper调用ID/name/args配对、保留原callback并finally恢复、在图片追加前回填原结果。Python25pass/1Windows skip、真实native方法126001/270000字符回放与host/Session/Gateway7项（含超限拒绝）通过；最终增量代码High GO。原大小/来源校验不放宽，不重放失败任务。
- 反馈/方法候选已补实际合并六维与Claims回执，纠正旧Skill的可选paper_review/最终JSON及paper_draft-only说明；同任务循环核对修订是否传播到其他字段，未新增模型阶段。122定向及最终TC/lint、独立CODE High已过；形状诊断不再误报作者身份，最终普通请求确实消费合并稿。Linux资源检查留精确CI；需新不可变catalogue，不能冒称应用更新已改变28d资源。下一步完成传输根因与独立High、精确CI，再按正常发布安装和有界真实路径验证；新API前旧生图继续暂停。
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
- 当前开发树/线上/真实科学结果必须分别判断。10-03旧Browser曾因saved permissions停止；本轮Computer Use仅列出应用，读取Chrome窗口时因不能可靠确定URL而被策略停止，未得页面/截图、未点击或绕过，收据native-preflight-computer-use-limit.txt。CI浏览器fixture不能代替真实角色入口。

## 其他交付与保护
- UI：b7ad37f2帽沿气泡/单Live2D/窄屏修复已合入并上线；132定向/TC/lint/High/精确CI通过，真实逐页视觉/角色/键盘与动效仍待验。公司Word已按实际交付同步；证据 `tmp/ui-hat-polish-20261002/`，细节见[设计](../specs/2026-09-05-integrated-research-product-design.md)和[公司交接](2026-09-30-vendor-evaluation.md)。
- UI质感候选归属codex/research-product-craft，第三张guide/Figma及GSAP/Canvas方向继续有效；10-03 Browser真实读取/截图/站内点击已恢复，桌面代理入口、物理CODEX_HOME及marketplace source修复收据在该树tmp/design-tools-20261002/implementation/。实际公开内容字体退化与宽屏避让已修候选；50表面/定位＋58传输/登录、TC与代码lint/High通过。退出空POST误标JSON已修并在真实内置浏览器退出，桌面入口重新要求登录；临时直连SSH因会话/管理边界风险撤销，Chrome另一临时会话已由用户确认退出。预览57116只作公开查看；私有验收转官网HTTPS或隔离测试环境。窄屏/密集内容遮挡、帽沿气泡实拍、剩余私有页面、干净构建字体、合入部署和公司Word更新仍待完成；详细证据见[设计10-03节](../specs/2026-09-05-integrated-research-product-design.md)，不把浏览器恢复或局部通过算整站交付。保留候选/旧UI树及回退证据；其他科学会话改动不属于本UI提交。
- 视频：品牌原片447219588464928已取回且用户认可画面，配音仍待改善；论文首镜447314218062265实看发现符号/波纹问题，第二镜HTTP402无taskId，不能重放create或把未听验声音标通过。原片/marker/Qwen权重及临时发布树保留；下一步余额对账与旁白/运动修订由视频会话持有，见 `tmp/video-system-20260930/` 和原Task4计划。
- 公司：只负责正式上线与年度运维，我方继续功能开发；脱敏包/屏幕共享，不给GitHub/服务器账号。21项PDF修正已合入部署；期刊真实试用、版权与额度见[期刊CURRENT](2026-09-15-journal-onboarding-handoff.md)。
- 已知独立债务：第14页BGE表格超token限制已恢复lexical（69active chunks），dense未完成；旧v11的58chunks保留。备用key已修好，当前失败无余额耗尽证据，不再重复鉴权任务。视频43旧缓存的13.04GB清理已完成，不重放维护。
- 清理仅确认归属且无活动/发布/回退依赖的生成物；不删浏览器profile/spool、历史paid回答、模型权重、用户资料或他人worktree。来源/匿名PDF下载边界及公开版本保护保持。

## Read first / 历史
- 启动读本页、必要的当前代码/服务器事实与[能力台账](../runbooks/hermes-capability-registry.md)对应条目；管理任务用现有read-current-management-context/Taskmaster，不另建状态库。
- 10-03以前的应用、GPT菜单/来源审校、v1–v10失败、旧发布与收费过程从Git `ce513eba` 的本页及 `tmp/ro-journey-20260929/` 按需查。它们不是当前next action；[09-18交接](2026-09-18-figure3-image-and-cleanup-handoff.md)的禁止重放事项仍有效。
