# Hermes / 论文视觉叙事 CURRENT
> 唯一交付树 `.worktrees/onchip-video-release`，分支 `release/onchip-production-line`；根 main 只作导航。

## 目标与决定
- 先完整验收生图前置：真实 NousResearch Hermes Agent 理解论文并核查科学事实，自动保存六维/Claims/Evidence、科学分镜、构图、完整可迁移提示词和1–2个合适风格；默认首选。用户10-03已给Synclip图像API文档并授权先用`gpt-image-2`试效果，2.5后续再接；不自动切Nano Banana/Midjourney。新接口应用接线已部署，Key已私密保存，host尚未启用/调用；旧image-api-pending保留至受控接入。物理正确、读者能理解贡献和条件、艺术质量均须实际验收。
- 新论文理解与科学审阅由 Hermes＋MiniMax-M3 完成。服务器GPT不是新论文审阅者；旧GPT来源审阅只保留历史收据/任务兼容。不要继续旧菜单、上传或迟到答案采用方案。
- 目标链路：既有PDF/OCR/SourceMap → 原生Hermes理解/核源 → 六维/Claim/Evidence → 原生Hermes科学分镜/风格/完整prompt → Synclip `gpt-image-2`（应用已接线、host待启用）→ Hermes像素核查 → 用户确认/现有发布流程 → 匿名读者页。文档[入口](https://synclip.ai/dev/docs/image)为异步POST /v1/image＋GET /v1/tasks/:id；公开文档模型列表未更新，具体模型采用用户明确给定值。接口备忘`tmp/hermes-cleanup-20261003/synclip-image-api-notes.md`，未知提交不可盲重发，未读取凭据或提交生图。
- 用户已认可第二篇物理正确图2cc5003f及细化图681ef614；其科学内容不重做。创建RO和效果展示需少操作；局部管理员/API成功不代表普通用户旅程通过。
- 三篇整体验收、原文疑点回读、可复用经验与定量几何核验仍未全部完成。开源GPU生图第二通道暂停；视频及UI改造独立推进，局部返工不取消这些目标。
- 保留原PDF、SourceMap、认可图片、旧公开版本及paid回答/失败/费用/期限。unknown不重发、失败任务不重开、不猜补科学内容、不放宽来源/Claims/权限守卫；人工核源brief只能作参照。

## 当前锚点
- canonical分支release/onchip-production-line；已发布app `5b135847831e0e9a4839465a41a56d8c54181524`，rollback `8d371df8e09fd94882886c054891387bd106602b`；最新开发HEAD按Git读取。Native源码/SDK本次未变，继续installed-native/project-catalogue `ef9e44d6aa09ee748e792b19005f831b564182f3`、MiniMax-M3，timer enabled/active。
- 5b135精确CI37136442993 success，Session71、store9、Linux Unix-host14实际通过，独立High最终GO。首次候选上传SSH reset，未进入生产事务；实核旧active及无journal后同SHA重试正常发布exit0，后验active/rollback、无pending部署/retention、API/Worker running/OOMfalse及2GiB内存/4GiB总内存与swap符合预期。日志 `tmp/hermes-cleanup-20261003/native-529-{ci-result.json,ci-success.log,deploy.log,deploy-retry.log,runtime-after.json}`。
- Synclip应用接线已随5b135部署；host尚未安装启用，API/Worker仍SYNCLIP_IMAGE_ENABLED=false，新Native计划维持image-api-pending，不走旧Chat生图。Key已私密配置，目录root700/文件root600实核，不进业务容器/spool。PS5脚本引号修复已验证；没有Synclip请求或新图质量证据。

## 当前科学断点与下一步
- 发布后真实验收run `99321c84-5f55-4c53-b696-b002a92f755b` / author `456bc466-1253-460c-884a-fcbc9d741d91` / ingestion `540e3eec-2d21-402a-a0be-53b6972fa285`，ROc896802c。作者23帧succeeded，独立reviewer `ab3a2dbd-cd6d-442b-9b96-af5a13f92542`在17:08:47Z失败，run failed/versionId=null，无计划/图片。本次未观察529。最后两份保存的供应商content只有thinking/text，无tool_use块，却报告stop_reason=tool_use；一次原生格式纠正也失败。不是本地转换丢调用，供应商为何遗漏尚未确立。原稿及paid记录保留，禁止重放创建或放宽遗漏调用守卫。证据native-overload-{fresh-create,status,author-result}.json及native-reviewer-{terminal,blocks}-read.json。
- 新任务键 `native-hermes-overload-bounded-20261004-cds-1`，远端原收据 `/opt/openscience-hermes/observations/native-overload-bounded-20261004-cds-1-fresh.json`。fresh-create.py已执行，禁止重放。此前本地操作脚本只替了receipt路径、遗漏请求键，返回旧c95e失败任务：没有新调用/扣费，原native-overload-create.json及远端非fresh收据保留，不能冒称新任务；已修正本地标识并核实际新ID。
- 已发布的529修复只允许当前进程亲自收到typed HTTP529时一次同上下文续试；再次授权/核原CP/publish，不改Domain/Gateway/SDK、不重开历史started。529按完整输出预留占原额度，调用次数与原单次600s/任务期限不扩大；成功CP保存失败元数据、重放零调用；迟到paid答案保存而不消费。Session71/store9/TC/scoped lint/docs/High及精确CI证据可复用，不能据此宣称科学合格。
- 新作者独立原文验收NO-GO：主机制、φ=π/2和19as数值虚拟脉冲性质正确；C3趋势写反、C9把19as混作ζ范围、limitations串联2MeV与10–30MeV参数并虚构下限。报告native-overload-author-science.md另列范围/传播距离/功率密度位置限定。原生reviewer虽发现C3，未成功提交任何paper_review，不能当作完成修订。现有科学Skill已有算例、量纲、范围及凝练方法，加载不证明正确执行；不得把人工报告注入为自动成果。
- 有界供应商诊断已完成：3个合成对照中，简单结构和完整schema的unchanged分支成功；Claims数组union分支返回item对象而非数组。独立一次array-only对照保持内容/指令/工具名/参数相同，仅改union为原完整数组schema，返回完全匹配。合计4次真实HTTP，无重试/科研采用/Synclip调用，正常Gateway/audit与私有原响应保留；最初v1仅Worker/API环境读取误用导致提交前失败，审计0/Worker intent不存在实核，原收据保留。证据native-schema-v2-{simple,actual,array}.json、native-array-only-verification.json；不能据此认定历史遗漏调用的完整根因。
- 当前候选仅4个Worker源码/2个测试：新独立审阅拆成unchanged与完整Claims数组两个工具，同一materializer/作者基准/最新提交守卫，旧/新paid CP均恢复原schemas/descriptions，不转写item对象。复用现有scientific-summary组织方法到实际Native Skill，新的作者goal聚焦核心贡献与一个完整代表例（核心比较保留所需对照）；旧paid goal不升级。最终reader111/reviewer52、Worker TC/scoped lint通过，反馈P2已修且科学诊断/legacy回执保留，独立High最终代码GO。日志native-reader-focus-tests.log、independent-domain-review-guidance-final.{test,lint}.log、native-review-claims-final-{tc,lint}.log；尚未CI/部署，旧任务失败与原稿科学NO-GO不变。
- 下一步匹配提交CI；等待运维清盘事务结束和锁释放后正常发布/Native资源配对，再一次针对性真实科学验收。不得增加轮数、从残缺文本拼工具参数或改模型；只有真正保存并验收的科学稿才进入原生计划/风格/prompt，不能借旧认可图冒充新自动成功。
- 当前run终态且科学/计划验收通过后，再沿已审infra/synclip-image/install.sh安装同源host（复用现有renderer、defer timers），核实际待处理范围、受控启用Synclip并首试gpt-image-2。当前activation设计只在ignored `independent-domain-synclip-activation-plan.md`，没有执行脚本/批准的新运行事实；必须按实际授权和现有机制收敛，不把设计稿的额外审批假设当作用户要求。
- Synclip生产实现已High GO：现有image spool、host隔离正规化、本地完成结果恢复，精确消费原生已存prompt，固定gpt-image-2/纯文本/无fallback；恢复重验当前来源，原图原子发布，unknown POST不重发。首次Linux CI28/40的宿主权限差异已修正为生产root运行同测试，40/40及5b135完整CI通过；Gateway/自动接线/配置证据见synclip-*与independent-domain-synclip-*日志。新API实际生成、审核、入库和用户展示尚未验收。
- 需区分：论文作者、独立来源审阅、科学分镜使用原生Agent；当前生成图像素检查的model-native分支仍是Gateway专用M3视觉请求，不是原生Agent工具循环。不能把该名称冒称全部由Nous Agent完成；新API首图尚未验证此后半链。
- 最新历史失败：c95e8ba1 / author632fb62c在10成功帧后第11帧收到provider_http_529（3503ms/usage未知）；原CP started、paid记录与selected-claims-{create,status,transport}.json保留，不据529推断免费，不修改或解锁旧任务。此前6d016ebe/d95ce0d4工具数组与遗漏调用失败、caef5a59/4eba4ea4迭代上限失败均已做对应代码修复，原任务保持失败；旧create/resume/activate脚本一律不是下一步。
- 更早604e8d9a/c801a07f作者及271fcec7独立审阅虽技术成功，科学High NO-GO；私有b2508270、分镜7226c434及原稿/原图/CP仍保留。定位框精度、长工具结果保真、合并稿反馈、终轮无tools请求等修复已发布；旧“候选未部署/待配对”的叙述降级到Git历史。详细历史见本页5b135提交与tmp/hermes-cleanup-20261003/、tmp/ro-journey-20260929/，不重跑旧步骤。
- 临时发布树native-overload-release已归档，worktree list实核已移除；证据日志在canonical ignored tmp。历史240个本地测试fixture删除被自动审批以blocked by policy拒绝，未执行/绕过，仍保留；新fixture退出自动清理。新API真实生成/审核/入库前不退役浏览器。原research-run.ts 20项、handler4项lint为同源已复现基线，不在本修复中掩盖；Native安装0.10.0不因Skill名称存在就视为最新插件可用。

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
- 运维/视频前置：用户决定现ECS先做好功能/展示，集群与异机存储以后配置。在线核心容器上限、Redis384MiB/noeviction及4GiB持久swap已观察；swap接近满，12GiB是本地Qwen语音上限而非云H3需求。24容器实测架构与内存/上限/释放条件见[资源图表](../runbooks/server-capabilities.md#单机运行架构与资源)：10-04 09:27复核浏览器8.95GiB、开发诊断4.51GiB、Web/API/Worker0.99GiB，可用8.48GiB/swap近满；09:37根盘117.06/147.27GiB、剩24.01GiB/83%，较00:19未暴涨；87release仍在，历史44.4GB不当新测量，镜像27.11GB/卷16.91GB/cache230kB，条件释放尚未执行；API真实生成/审核/入库前保留浏览器及旧资料。967对象/2,812,621,957字节已非轮转导出、逐文件校验与0600/0700检查通过，29de来源，旧备份保留。3f备份/retention源码已推且随正常8d应用发布包含同源helper，installedbackup755与源root:root664逐字hash一致；独立installer/chmod已取消。最新DB已按精确664+已审SHA增量High GO完成一次非轮转备份db-set-20261003T155448Z-2579020：core144762792B/search7162966B、checksum通过、旧set保留、锁释放；首次模式guard失败在写入前，无源改动。1GiB恢复候选35pass/1Windows skip，但High仍NO-GO（未知Docker变更的诊断日志无界，须有界后再复核）；Windows加密副本准备已定向测试/High审阅；当前KNOWN兼容run已实过3.0.12→3.5.4、4135字节一致及GCM篡改拒绝，真实备份加密/传输/恢复未执行。用户10-04要求停止新run/重试/合成key，只核阶段证据：旧失败仅证明encrypt/cmsout，旧decrypt与rootcause未确立；PowerShell对照证明原生66可映为tool1，但不是旧根因证据。保持暂停，保留失败资料，不读旧私钥/DPAPI。无云目标，不当完整灾备；checkpoint见tmp/ops-readiness-20261003/crypto-phase-checkpoint.json。旧82release/288tag准备已取消；10-04用户要求app仅当前+回滚，内存调整等生图完成。六installed bundle闭合扫描通过，手动H3原7b迁到/opt/openscience-video/cloud自有bundle（20files/Gateway216317B、逐字比较/真实import通过，0paid请求），不改已装Native/runtime/catalogue。源transaction恢复prune-unused1、定向RED→GREEN2/2及HighGO，待下次正常发布；schema3额外keep候选已归档未选，原schema2 helper不改。新prepare85dirs/300tags/73cap及精确计划HighGO；一次托管job已执行原complete（1GiB/1CPU/128Tasks、swap0、nice19/idle），FD9由job持有，pending存在时不发版。已归档独立运行包后旧源已转tombstone逐一回收，观察根盘78%/31.5GiB可用，事务仍进行中，不当清盘完成；证据tmp/ops-readiness-20261004/；对象定时、恢复、独立站外/备份失败/欠费告警、测试站及浏览器残留尚未完成；Netdata邮件有既往实投记录，不称完全无告警。证据tmp/ops-readiness-20261003/及服务器私有observations同目录；不重复对象导出、不重放paid。
- UI：b7ad37f2帽沿气泡/单Live2D/窄屏修复已合入并上线；132定向/TC/lint/High/精确CI通过，真实逐页视觉/角色/键盘与动效仍待验。公司Word已按实际交付同步；证据 `tmp/ui-hat-polish-20261002/`，细节见[设计](../specs/2026-09-05-integrated-research-product-design.md)和[公司交接](2026-09-30-vendor-evaluation.md)。
- UI质感：源f9f86e24已随组合ef9e44d6合入/推送并于10-03 21:38正常发布，rollback29de；精确CI37125218586与独立High GO。第三张guide/Figma、GSAP/Canvas、非Landing字体/层次继续有效。Browser从官网实际走指南切换→桌面→原研究编辑、账户→设置/API、期刊搜索/清空→探索→公开研究；1440/390无横向溢出，字体生效，单Live2D，手机展开/Escape/焦点返回通过。帽沿与身份页候选实拍证据保留；69陪伴＋8期刊及58传输/登录证据适用。24个HTTPS响应及最终四容器healthy/restarts0/OOMfalse；Native同源配对由生图会话完成。公司Word10页/21项/7表已逐页实看，对外固定ZIP1854条目、17行样例脱敏、164新增候选独立复核及重压核对GO。证据tmp/ui-release-20261003/、tmp/vendor-delivery-20261003/；详情见[公司交接](2026-09-30-vendor-evaluation.md)。整站审美仍待用户反馈，未穷尽低频页/所有角色/手机软键盘/长期负载，不把科学/异机恢复标完成。
- 视频：品牌原片447219588464928已取回且用户认可画面，配音仍待改善；论文首镜447314218062265实看发现符号/波纹问题，第二镜HTTP402无taskId，不能重放create或把未听验声音标通过。原片/marker/Qwen权重及临时发布树保留；下一步余额对账与旁白/运动修订由视频会话持有，见 `tmp/video-system-20260930/` 和原Task4计划。
- 公司：只负责正式上线与年度运维，我方继续功能开发；脱敏包/屏幕共享，不给GitHub/服务器账号。21项PDF修正已合入部署；期刊真实试用、版权与额度见[期刊CURRENT](2026-09-15-journal-onboarding-handoff.md)。
- 已知独立债务：第14页BGE表格超token限制已恢复lexical（69active chunks），dense未完成；旧v11的58chunks保留。备用key已修好，当前失败无余额耗尽证据，不再重复鉴权任务。视频43旧缓存的13.04GB清理已完成，不重放维护。
- 清理仅确认归属且无活动/发布/回退依赖的生成物；不删浏览器profile/spool、历史paid回答、模型权重、用户资料或他人worktree。来源/匿名PDF下载边界及公开版本保护保持。
- 运维owner明确同意两个已HighGO Compose原样独立提交，现为已推`7342bae3f9e4069a49d01849932594dd9dea9f7e`，媒体CI37124667930进行中；其余backup/retention五文件继续归ops，不混入。用户已授权UI/视频/本会话协调一次组合发布：UI会话01a0f118负责最终合并及正常app部署，本会话负责同最终SHA Native配对与一次普通科研验证；不得并发发版。正常deploy会更新backup.sh，须与ops新备份安装顺序协调。原临时29de树已归档；临时native-prerequisites-release未部署，改组合发布后已归档移除。证据留ignored tmp。

## Read first / 历史
- 启动读本页、必要的当前代码/服务器事实与[能力台账](../runbooks/hermes-capability-registry.md)对应条目；管理任务用现有read-current-management-context/Taskmaster，不另建状态库。
- 10-03以前的应用、GPT菜单/来源审校、v1–v10失败、旧发布与收费过程从Git `ce513eba` 的本页及 `tmp/ro-journey-20260929/` 按需查。它们不是当前next action；[09-18交接](2026-09-18-figure3-image-and-cleanup-handoff.md)的禁止重放事项仍有效。
