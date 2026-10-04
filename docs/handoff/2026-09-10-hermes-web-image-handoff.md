# Hermes / 论文视觉叙事 CURRENT
> 唯一交付树 `.worktrees/onchip-video-release`，分支 `release/onchip-production-line`；根 main 只作导航。

## 目标与决定
- 先完整验收生图前置：真实 NousResearch Hermes Agent 忠实理解论文并核对我们的转述，自动保存六维/Claims/Evidence、科学分镜、构图、完整可迁移提示词和1–2个合适风格；默认首选。用户10-03已给Synclip图像API文档并授权先用`gpt-image-2`试效果，2.5后续再接；不自动切Nano Banana/Midjourney。新接口应用接线已部署，Key已私密保存，host尚未启用/调用；旧image-api-pending保留至受控接入。物理正确、读者能理解贡献和条件、艺术质量均须实际验收。10-04用户再明确：Hermes能力改进须通用，当前论文只是验收样本；不将其坐标、参数、正确答案固化进通用Skill，跨论文/研究类型验收仍保留。
- 最新用户纠正：论文是事实来源，默认任务是忠实理解作者主旨、机制、算例和条件，并核对我们的摘要、Claims、prompt和图像有没有曲解/遗漏/添加；不是论文有效性、质量、偏倚或创新性的同行评议。Hermes＋MiniMax-M3负责理解与自身来源核对，critical-thinking完整能力保留给另行请求的评议；服务器GPT不参与新论文前置。旧paid路径与收据保留。
- 目标链路：既有PDF/OCR/SourceMap → 原生Hermes理解/核源 → 六维/Claim/Evidence → 原生Hermes科学分镜/风格/完整prompt → Synclip `gpt-image-2`（应用已接线、host待启用）→ Hermes像素核查 → 用户确认/现有发布流程 → 匿名读者页。文档[入口](https://synclip.ai/dev/docs/image)为异步POST /v1/image＋GET /v1/tasks/:id；公开文档模型列表未更新，具体模型采用用户明确给定值。接口备忘`tmp/hermes-cleanup-20261003/synclip-image-api-notes.md`，未知提交不可盲重发，未读取凭据或提交生图。
- 用户已认可第二篇物理正确图2cc5003f及细化图681ef614；其科学内容不重做。创建RO和效果展示需少操作；局部管理员/API成功不代表普通用户旅程通过。
- 三篇整体验收、原文疑点回读、可复用经验与定量几何核验仍未全部完成。开源GPU生图第二通道暂停；视频及UI改造独立推进，局部返工不取消这些目标。
- 保留原PDF、SourceMap、认可图片、旧公开版本及paid回答/失败/费用/期限。unknown不重发、失败任务不重开、不猜补科学内容、不放宽来源/Claims/权限守卫；人工核源brief只能作参照。

## 当前运行与实现
- app `be20fccb81b8cb6192005e7cb862d60837cab443`，rollback `be5cc92b192fdef227349af0ec9d276be93322c9`；开发HEAD按Git。精确media CI37224331222 success，正常deploy exit0/public exact/retention PREPARE+COMPLETE/journalclear。独立Code/Ops GO，复用Native/runtime/catalogue789ff，M3、timer enabled active。后验核心7running/OOMfalse、API/Worker Memory2GiB/MemorySwap4GiB、两个app目录be20+be5、0pending/tombstone/failed、FD9释放；旧86eb应用源按正常retention删除。Synclipfalse/未调用，host尚未安装；科学和图像效果未验收。证据tmp/hermes-cleanup-20261003/native-source-repair-{ci-result.json,ci-success.log,deploy.log,runtime-after.json}。
- 新Native来源修订已接现有reanalyze/API、同源SourceMap及逐字段/Claim工具；仅新intent revise_saved_source生成新paper-author私有稿，保留旧版本。父稿/CP/Map/权限在执行、终态与采用重验，旧paid/历史私有恢复合同保持。Domain283/Worker142/实际HTTP41、Domain build及四包TC/scopedlint通过；profile/marker绕过和请求键namespace兼容两项High P2有真实RED→GREEN。API helper已接类型但无新UI入口，不称普通用户旅程通过。
- 首份0c854 CI37218137751仅旧Synclip fixture两次Date.now造成期限偶发600001ms失败；测试统一时钟起点，生产600000限制保持，实际tick-clock RED→GREEN/transport15及最终Linux CI通过。失败证据保留；发布及新模型任务只用了最终be5。

## 已结束的真实来源修订与当前断点
- run `f98496ab-373d-4cfe-8db7-deca67b1d2cf` / ingestion `5fb2ffe6-da15-411b-99a5-f7a8fb740544` / author `bffd4b99-6fc6-4987-9a81-4601a174bb9f`，ROc896802c。新once key native-source-correction-20261005-cds-1；远端/opt/openscience-hermes/observations/native-source-correction-20261005-cds-1-fresh.json已创建，native-source-correction-create.py已执行一次，禁止重放。提交前intent文件/目录fsync、完成结果原子替换；未知只读原intent/audit，不盲重发。
- 17:45:24Z最新只读：author succeeded/19帧/4m30s，真实读取openscience-source-review和原文，自动确认来源并建私有version6ffba95c；Map仍1f26178d。整稿保真High NO-GO：父稿四项结果对象/趋势/范围/条件失真全部保留，只有problem/reproducibility修订，其余四字段与全部六Claims逐字未改；不是修改在保存时丢失。分镜3ffee5fd自然failed/32帧，无asset或图片；不重开、不扩预算，Synclipfalse。实际状态、作者与独立核源报告在native-source-correction-{status-latest.json,author-result.json,author-source-check.md}。
- 零外呼实际工具回放完整重现10次字段拒收：issue.problem551字符超500、补充段落仅搜索未完整读取、缺sourcePassageIds，以及accepted带替换字段。旧反馈统一笼统错误，Agent反复改长度/正文却未定位未读来源；同时先读旧稿后聚焦两处次要表述，主结果未核正。当前最小修复方向是明确失败路径与修复动作、原文主线/代表结果优先，再对照不可变旧稿；不新增评议角色或样本答案。分镜词法重复拒收另做有界诊断，先修前置真实断点再新一次受控验证。证据native-source-correction-offline-replay.{json,log}，全部paid/版本/失败保留。
- Worker六文件修复已上线：详细字段反馈/原文主线优先；分镜精确表达式绑定、完整谓词与单位区分、源ID/短quote/qualifier位置诊断。歧义括号仍拒收并提示分号独立比较，不放宽数学外壳。新首轮保存描述启用；旧paid grammar/回执及根层行为保持。413/413、Worker TC/build0、5文件scopedlint0；planner5个lint错误严格复现be5基线。原作者/分镜paid逐回执回放及guard33边界等旧行为、actual s29两项误拒恢复且错符号/分母仍拒。缺首轮定义错误升级的High P2已2项RED→GREEN关闭，最终六文件Code High与Native789复用/Ops GO；根Skill未改。精确CI/正常部署已完成，新实际稿仍待原文验收，不以机械通过解除保真NO-GO。证据native-{field-feedback-*,source-repair-*,source-prose-*,planner-prose-replay.*}及既有Native计划。
- native-source-role-create.py已在精确CI/部署及789配对/idle后执行一次：oncekey native-source-role-20261005-cds-1，run `aa86d3a3-27c6-4bbe-b802-84f9226fbc4c` / ingestion `3eb44848-4e9c-421e-a3a0-737a9b0e22d0` / author `c0bace46-7023-4b89-8e97-3deeff85ad5e`。18:42:39Z只读run/author running，前三帧实际加载openscience-source-review，调用paper_overview、paper_read后取得paper_candidate；未据调用顺序认定理解正确。父source5fb2/authorbffd/CPb4453ad2，同一PDF/Map，durable intent及原子完成收据已保存；远端/opt/openscience-hermes/observations/native-source-role-20261005-cds-1-fresh.json已存在，禁止重发。只用native-source-role-status.py观察；旧两次once也禁止重放。新实际来源及分镜均通过原文核对后才启用Synclip。证据native-source-role-{created.json,status-latest.json}。
- 父来源b84578a7 / 作者1558e1a9 / CP55402795 / 私有versionc98afa31保留。其旧run83153f39自然failed：作者5m44s技术成功并自动确认来源/建私有版本，planner14帧/98304预算失败，无asset或图。整稿保真NO-GO：19-fs ICS输出误标驱动宽度、波长趋势反向、ζ算例误称上界、单电子例遗漏1-MeV条件；主机制/C3代表例正确，PDF/Map相应原文完整。报告native-source-fidelity-author-source-check.md只比较我们的转述与作者原文，不评议论文。旧once native-source-fidelity-20261004-cds-1及其远端-fresh.json禁止重放。
- 单位/括号变量/is-of词法误拒收已发布（157定向、实际paid输入零外呼对照、Code High及Native789复用Ops GO）；仅新保存描述启用，数值/单位/ownQuote/数学式及旧paid严格恢复保持。此修复不等于语义错误已纠正。历史其他Native修复与失败只在Git/既有证据按需查，所有paid/CP/原稿保留，不能据旧next action重开。

## Illustration delivery
| 论文 / Taskmaster | 已见产品与用户反馈 | 剩余交付 |
|---|---|---|
| 第一篇 / 1、5 | RO9067a2d5，六维/6Claim/58Evidence；公开v3/v4保留，v5选65ffbfee（hash54484359…），正式审图/人工像素/High通过，匿名入口已实点。私有v11的失败图与收据保留。 | 用户整体审美与可理解性反馈待收，不批量冷启动。 |
| 第二篇 / 2、5 | ROc896802c；旧v4物理被用户否定，只作误判证据。私有v14/771ff7f3，用户认可2cc5003f物理及681ef614最终细节（hashad79b0a0…），未公开。 | 可沿现有流程采用/新公开；新的原生自动理解与计划仍须另行证明，不能借用旧图冒充。 |
| 第三篇 / 3、5 | ROaa450f1e，公开v2/OSR-2026-000024，7eb1b7ee与4e64c389两图、六维/5Claim/30Evidence、匿名轮播与PDF边界已实测；用户称赞首图。 | 单图称赞不等于整篇科学叙事验收；旧MOED错图留私有。 |
| 能力 / 4 | 原配图Skill v16、原生Agent科学与设计入口、自动计划接线存在。 | 核源/条件保真、跨任务经验、几何检查、Fig.2重复plan及d5087b03悬空copy仍待处理；Fig.1原字节展示方案已否定。 |

## Capability linkage
- 入口、调用与未消费能力见[能力台账](../runbooks/hermes-capability-registry.md)。新Native任务不走旧固定map/reduce/compose/GPT来源链；历史消费者、共同守卫、paid回放和控制测试有真实引用，不能整块删除。SourceMap/PDF/OCR及隔离science-worker继续复用；Native计算器适配尚缺，不裸开主机terminal，也不默认重算论文。
- Computer Use读取Chrome窗口因不能可靠确认URL而被策略停止；未获得页面/截图、未点击或绕过。独立server/code路径继续，CI网页fixture不替代实际角色入口。本轮新API助手接口未做真实站内点击验收。

## 其他交付与保护
- 运维/视频：用户选择现ECS先做好功能/展示，集群与异机存储后续；API真实生成/审核/入库前不退役旧浏览器。用户已授权视频会话协调，本次be5发布起止和资源保留已通知；新Native运行期间避免Worker并行发布。架构/资源定位见[服务器能力](../runbooks/server-capabilities.md)。
- 10-04已清85旧app目录/300指定tag/73cap，回收42.04GiB；正常发布只留active+rollback，本次又按现有策略移除无依赖旧app789目录。Native独立runtime/catalogue789与旧61、论文/媒体/模型/数据卷/备份/profile/spool/paid保留。8个自有完成测试stage已同文件系统归档，保留2.25MiB证据/权限/恢复映射；此前自动审批拒绝的旧baseline/文档脚本仍保留且无重试。不能按年龄删他人worktree或唯一资产。
- 运维未完成：对象定时、当前全量隔离恢复、独立站外/备份失败/欠费告警及测试站；恢复候选仍High NO-GO（Docker变更日志须有界），无云目标，不当完整灾备。crypto维持用户暂停，不新run/重试/合成key/读旧私钥或DPAPI；真实加密/传输/恢复未执行，KNOWN对照不改写旧失败根因。checkpoint在tmp/ops-readiness-20261003/crypto-phase-checkpoint.json；ops证据在tmp/ops-readiness-20261004/与服务器私有observations。日志轮转/开发历史保留另处理。
- UI质感/Word/公司包已交付，全部角色/低频表单/长期性能与最终用户审美认可未完成。公司负责正式上线与年度运维，继续脱敏交接；期刊真实试用、权限/版权与额度见[期刊CURRENT](2026-09-15-journal-onboarding-handoff.md)。视频画面认可不等于旁白/成片，402任务边界、原片/Qwen/marker保留，视频会话继续。
- 独立债务保留：第14页BGE表格dense超限、lexical已恢复69chunks；旧v11的58chunks保留。备用key已修，无当前余额耗尽证据，不重复鉴权。科学返工/经验/几何、悬空copy和三篇整体验收仍按上表，局部返工不取消目标。

## Read first / 历史
- 启动读本页、Git和必要最新只读运行事实、能力台账对应入口；现有read-current-management-context/Taskmaster保存验收要求，不另建状态库。计划与详细方法见[原生接入计划](../plans/2026-10-01-native-hermes-agent-plan.md)。
- 10-05检查点以前的完整执行记录在Git be5cc92b的本页及tmp/hermes-cleanup-20261003/，更早GPT菜单/收费/v1–v10记录在Git ce513eba及tmp/ro-journey-20260929/；它们不作当前next action。[09-18交接](2026-09-18-figure3-image-and-cleanup-handoff.md)的禁止重放和用户资产保护继续有效。
