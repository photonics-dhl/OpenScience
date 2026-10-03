# Hermes / 论文视觉叙事 CURRENT
> 唯一交付树 `.worktrees/onchip-video-release`，分支 `release/onchip-production-line`；根 main 只作导航。

## 目标与决定
- 先完整验收生图前置：真实 NousResearch Hermes Agent 理解论文并核查科学事实，自动保存六维/Claims/Evidence、科学分镜、构图、完整可迁移提示词和1–2个合适风格；默认首选。用户10-03已给Synclip图像API文档并授权先用`gpt-image-2`试效果，2.5后续再接；不自动切Nano Banana/Midjourney。新接口正在实现，Key已私密保存，尚未启用/调用；旧image-api-pending保留至受控接入。物理正确、读者能理解贡献和条件、艺术质量均须实际验收。
- 新论文理解与科学审阅由 Hermes＋MiniMax-M3 完成。服务器GPT不是新论文审阅者；旧GPT来源审阅只保留历史收据/任务兼容。不要继续旧菜单、上传或迟到答案采用方案。
- 目标链路：既有PDF/OCR/SourceMap → 原生Hermes理解/核源 → 六维/Claim/Evidence → 原生Hermes科学分镜/风格/完整prompt → Synclip `gpt-image-2`（待接入）→ Hermes像素核查 → 用户确认/现有发布流程 → 匿名读者页。文档[入口](https://synclip.ai/dev/docs/image)为异步POST /v1/image＋GET /v1/tasks/:id；公开文档模型列表未更新，具体模型采用用户明确给定值。接口备忘`tmp/hermes-cleanup-20261003/synclip-image-api-notes.md`，未知提交不可盲重发，未读取凭据或提交生图。
- 用户已认可第二篇物理正确图2cc5003f及细化图681ef614；其科学内容不重做。创建RO和效果展示需少操作；局部管理员/API成功不代表普通用户旅程通过。
- 三篇整体验收、原文疑点回读、可复用经验与定量几何核验仍未全部完成。开源GPU生图第二通道暂停；视频及UI改造独立推进，局部返工不取消这些目标。
- 保留原PDF、SourceMap、认可图片、旧公开版本及paid回答/失败/费用/期限。unknown不重发、失败任务不重开、不猜补科学内容、不放宽来源/Claims/权限守卫；人工核源brief只能作参照。

## 当前锚点
- 分支release/onchip-production-line；10-03已发布app `8d371df8e09fd94882886c054891387bd106602b`，rollback `ef9e44d6aa09ee748e792b19005f831b564182f3`。未提交Synclip接入不在此次应用发布中；最新HEAD按Git读取。
- 组合精确CI37125218586 success及独立High GO，UI会话从干净树正常部署exit0；首次被对象备份锁拒绝未mutation，锁释放后同SHA成功，无残留journal。本会话独立核对app/rollback后，沿现有安装器完成同ef9e Native配对，API/Worker重建后running/OOM=false，内存2GiB、内存与swap合计4GiB，均为installed-native/project-catalogue ef9e、MiniMax-M3，timer enabled/active。证据 `tmp/hermes-cleanup-20261003/native-prerequisites-{activation.json,runtime-after-app.json,runtime-after-native.json}`；应用日志由UI会话保存于ui-release-20261003。
- 作者和独立审阅已使用真实paper_review回执保存科学数据，不依赖最后普通回复抄写JSON；旧paid回放及来源/权限/正常stop验证保持。作者实际提交已成功，独立审阅的最新状态见下一节。
- 原生科学分镜caller已部署：同源已审Claims、原文/图页、设计Skill及共享物化保存私有完整prompt。自动run在审批及旧图片派发两处停在awaiting_storyboard_review，即使手工批准也不走旧生图；GET/UI为image-api-pending。尚无新原生科学合格稿贯通到计划的真实验收。

## 当前科学断点与下一步
- ef9e配对后仅一次正常新验证：run `6d016ebe-63fd-4616-aeac-d9885c5768df`、ingestion `e26df7bc-e383-4ad0-b134-158a50373382`、author `d95ce0d4-0560-45a7-9625-a6debfbc13ee`。17帧后failed，未进入独立审阅/版本/计划：第15帧paper_review将claimSuggestions及嵌套数组包成item对象，被既有合同拒收；第16/17帧均stop_reason=tool_use却仅有不完整正文、无工具调用，原一次纠错后正确停止。原paid请求maxTokens均32768、总output28109/98304、最后context66843，未耗尽预算；不是余额/OOM证据。实际Skill/正文/原页和draft_ready已出现，但不等于科学终审通过。回执/原轨迹 `native-prerequisites-{create,status,trace}.json`，创建键native-hermes-prerequisites-20261003-cds-1不得重放/删除；合同修复见下一行；不扩预算或重开此任务。
- 作者修复8d371df8e09fd94882886c054891387bd106602b已推送、四文件High GO、精确CI37129950442 success：新作者终审仅选择已保存Claims，纠正走原notebook；旧paid合同及独立审阅完整数组保持。135项定向/Domain build/Worker TC通过，不代表新真实科学成功。主线已从干净临时树正常发布exit0、后验marker/资源/服务符合预期，临时树已归档；Native runtime源码未改，保留installed-native/project-catalogue ef9e配对。证据selected-claims-{deploy.log,runtime-after.json}。当前先留给ops备份恢复窗口，随后仅一次普通新科学验收；创建脚本selected-claims-create.py已准备但未执行，不重放旧失败任务。
- Synclip候选生产代码已High GO：复用image spool、host隔离正规化及本地完成恢复，固定gpt-image-2/纯文本/无fallback；恢复会重验当前来源，原图原子发布，未知POST不重发。未发布/调用。用户Key已私密保存，root目录700/文件600实核；PS5引号问题已真实同通道验证修复，Key不进业务容器/spool。Gateway26、Native自动衔接/原prompt/恢复25、factory22、配置18通过，host/installer定向通过；Domain build、Worker/API/Gateway TC通过，新增TS lint通过（handler四项原有lint以HEAD复现保留）。CI过滤已覆盖新增Synclip用例；精确候选CI待提交后核验。日志统一tmp/hermes-cleanup-20261003/synclip-*及independent-domain-synclip-*。
- 临时发布树已归档。新测试退出会清理本进程fixture；历史本地fixture批量删除被自动审批以blocked by policy拒绝，未执行或绕过，命名日志和临时目录保留。新API未真实生成/审核/入库前不退役浏览器；科学真实任务运行期间不进行下一轮应用重建。
- Synclip候选049adf39aeebab29560d49c5ad1557e89a790bf7首次精确CI37133518262在Linux host测试28/40处失败，生产未发布。12项均走需chown的图片正规化路径，installer10项通过；日志未保留底层errno。CI现按生产root身份运行相同host用例、共享tmp先由runner创建，独立High同意，待后继精确CI验证，不删除断言或放宽运行权限检查。
- 29de配对后仅创建一次正常新分析：run `caef5a59-76ae-410a-bfed-6c48cf284647`、ingestion `da0fcde0-6c94-4dda-8fff-d7379beeb17b`、author `4eba4ea4-65b9-494b-84bc-e6e19661e1e0`；复用原confirmed215d/24e及原PDF/SourceMap，普通收费/max9。11:49–11:54Z作者32轮后failed，未进入独立审阅、未物化版本：末次paper_draft字段映射为item数组，多次非核心Claim缺父项却只收到通用格式反馈；已复现原生迭代耗尽后的额外无tools总结请求导致协议拒绝。应用/配对仍正确，API/Worker无OOM。尚无新科学或计划验收。`consolidated-review-create.json`及只读status记录结果；创建脚本和远端native-consolidated-review-20261003-cds-1收据不得重放/删除。该历史修复已随ef9e发布配对；此任务仍保留失败，不扩轮数或重开。生图前科学和完整prompt仍未完成；新API前旧生图保持暂停。
- 本次run `604e8d9a-c573-4b0d-a404-8dabc5cb664a`、ingestion `b0e4d11c-492f-453a-85af-e9c3337fd4cb`，成功author `c801a07f-8441-4f9d-814e-f4c492474c5f`（约6分14秒/23paid轮、8原页图、两科学Skill）；作者尚需修正角度、传播距离、损伤位置、束流算例及非普适表述。独立核源记录 `tmp/hermes-cleanup-20261003/independent-author-science.md`；原稿/CP/PDF/26页85段Map保留，不再执行创建脚本。
- 0d86修复Worker自动调度漏runtime；初始化恢复沿原retry/同run/原作者，76+280 Domain、80 Worker及TC/build/High/精确CI通过。仅当前run/ingestion已提交才阻断，旧同PDF版本771ff7f3保持。实际恢复回执 `independent-real-resume.json`：version3→4，没有重跑作者或再扣作者费用。
- reviewer `271fcec7-bf89-4199-a546-03c3b065305a` 首次在任何模型提交前被restoration比较拒绝，错误 `[blocked] Native author science/source data changed`。当时attempt1/retry0、source retry0，1原reservation/1绑定审计、0Gateway调用、无Native CP，证据 `native-review-preflight.json`。e48发布后仅执行一次原retry恢复：同reviewer attempt2已succeeded/18轮，原作者不变；实际调用两科学Skill、paper_read6次、paper_view7次，保留原1笔reservation。回执 `independent-native-preflight-resume.json`；不得重放创建、旧初始化或本次恢复脚本。
- 根因用真实稿/Map离线复现：仅evidenceSegments定位框存在IEEE-754末位差异，其他科学/来源字段相同。已发布修复复用resolveSourceLocator既有容差，仅归一已验证定位框；真实离线1/1（合成决策，不是科学认可）、Worker120、Domain376、Web26及浏览器fixture2/2、相关TC/build/lint、High/精确CI通过。Domain原20lint基线保持，未引入新错误。
- 审阅结果独立High科学NO-GO：limitations已区分10/100cm，results却仍保留≥10cm；另有入射角/公式条件遗漏、束流分组矛盾、损伤内缘遗漏、既有方法不可能与高ζ低光子数的过度外推。详见independent-reviewer-science.md，不能将review_received称合格。自动物化私有draft b2508270-e8a8-4014-a8f9-e8511a16ed4b（6Claims/35Evidence），没有公开。
- 自动分镜task 7226c434-a5b4-483f-9809-ec73937248b3在1个已付费帧后因Native transport停止；run现failed/version11，没有资产或新图片。真实工具参数保存在independent-real-status.json。已用实际native28d方法复现：超过100000字符的工具结果被替换成预览，102278字符重建context变1590字符非JSON，Worker在第二次模型请求前拒绝。当前任务精确DB上下文已用线上编译投影取得：126001字符/164069字节，6Claims/35Evidence/0original、无任务后Claim改动、JSON往返完全一致（native-illustration-context-exact.json）；per-instance原回执保真适配已实现task_agent.py：当前paper调用ID/name/args配对、保留原callback并finally恢复、在图片追加前回填原结果。Python25pass/1Windows skip、真实native方法126001/270000字符回放与host/Session/Gateway7项（含超限拒绝）通过；最终增量代码High GO。原大小/来源校验不放宽，不重放失败任务。
- 29de已发布合并六维/Claims反馈及Skill协议修正：同任务循环核对修订传播，未新增模型阶段；122定向/TC/lint、High和精确CI含Linux资源检查通过。形状诊断不再误报作者身份，最终普通请求确实消费合并稿。纸面工具原回执保真修复亦已上线，真实126001字符/270000聚合及Session/Gateway限额回放通过；实际科学及计划效果以本次新run为准，不能沿用旧稿NO-GO当新稿结论或用测试代替科学验收。
- 新作者轨迹诊断：20轮缺parent、21轮补父项后两条保存；另一条引用P00014但到30轮才完整读取，31轮遂保存。候选在原claim校验返回路径/原因并明确真实父clientKey与已读来源，未改变接受条件；按原工具描述保留旧paid反馈，132定向/TC/lint/High通过。最后transport根因已以实际29de dispatcher/normalizer和Host复现：原参数未变，32轮paper_draft正确返回invalid_draft；原生达到max_iterations后额外发无tools的总结请求，被SDK协议解析拒绝，未进入Session/Provider。不是参数变造或已证实网络故障。
- 当前停止修复候选：实例覆盖原_handle_max_iterations，保留消息并直接NativeTaskStopped，沿既有finally→stopped收尾；Host只按可信原config/store恰达上限且全completed给事实性提示，不信任调用者声明。175 Worker pass/12 Windows Unix跳过、真实Host停止回放3/3（含非stopped保持原错，先RED）、Python27pass/1既有Windows跳过、实际native零总结请求回放、TC/scoped lint通过；新增代码最终High GO（显式stopped边界已修）；候选`1eecf30d03e8b1703d00f4fa50ed69457af7685d`的精确CI37122743858完整success，Linux原生/Host及浏览器流程通过，尚未部署。未扩预算/回收额度/重开失败任务；新adapter需新运行时配对。具体日志native-turn-limit-*与independent-domain-native-exhaustion-*。
- 10-03续作只读实核live仍29de/native29de、rollbacke48、API/Worker running/OOM=false、无活动Native实例（native-turn-limit-runtime-before.json）。有界High确认现有schema/SDK未把六字段变成item数组，当前修复可支持一次正常新验证；完整prompt/风格/科学审阅在私有task结果保留，隐藏公开prompt符合产品边界，无需另加公开接口。尚未创建下一任务。准备的native-prerequisites-{activate,create,status}.py只替精确身份/新键，未执行，须改为最终组合SHA后配对。
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
- 运维/视频前置：用户决定现ECS先做好功能/展示，集群与异机存储以后配置。在线核心容器上限、Redis384MiB/noeviction及4GiB持久swap已观察；swap接近满，12GiB是本地Qwen语音上限而非云H3需求。24容器实测架构与内存/上限/释放条件见[资源图表](../runbooks/server-capabilities.md#单机运行架构与资源)：22:42快照浏览器8.36GiB、开发诊断3.99GiB、Web/API/Worker0.96GiB，条件释放尚未执行；API真实生成/审核/入库前保留浏览器及旧资料。967对象/2,812,621,957字节已非轮转导出、逐文件校验与0600/0700检查通过，29de来源，旧备份保留。3f备份/retention源码已推且随正常8d应用发布包含同源helper，installedbackup755与源root:root664逐字hash一致；独立installer/chmod已取消。最新DB已按精确664+已审SHA增量High GO完成一次非轮转备份db-set-20261003T155448Z-2579020：core144762792B/search7162966B、checksum通过、旧set保留、锁释放；首次模式guard失败在写入前，无源改动。1GiB隔离恢复及Windows加密临时异机副本正在离线修订/High审核，尚未执行；无云目标，不当完整灾备。82旧release/288tag准备已取消，未实删；对象定时、恢复、外部告警、测试站及浏览器残留尚未完成。证据tmp/ops-readiness-20261003/及服务器私有observations同目录；不重复对象导出、不重放paid。
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
