# Hermes / 论文视觉叙事 CURRENT
> 唯一交付树 `.worktrees/onchip-video-release`，分支 `release/onchip-production-line`；根 main 只作导航。

## 目标与决定
- 先完整验收生图前置：真实 NousResearch Hermes Agent 理解论文并核查科学事实，自动保存六维/Claims/Evidence、科学分镜、构图、完整可迁移提示词和1–2个合适风格；默认首选。用户10-03已给Synclip图像API文档并授权先用`gpt-image-2`试效果，2.5后续再接；不自动切Nano Banana/Midjourney。新接口尚未实现/配置/调用，旧image-api-pending保留至受控接入。物理正确、读者能理解贡献和条件、艺术质量均须实际验收。
- 新论文理解与科学审阅由 Hermes＋MiniMax-M3 完成。服务器GPT不是新论文审阅者；旧GPT来源审阅只保留历史收据/任务兼容。不要继续旧菜单、上传或迟到答案采用方案。
- 目标链路：既有PDF/OCR/SourceMap → 原生Hermes理解/核源 → 六维/Claim/Evidence → 原生Hermes科学分镜/风格/完整prompt → Synclip `gpt-image-2`（待接入）→ Hermes像素核查 → 用户确认/现有发布流程 → 匿名读者页。文档[入口](https://synclip.ai/dev/docs/image)为异步POST /v1/image＋GET /v1/tasks/:id；公开文档模型列表未更新，具体模型采用用户明确给定值。接口备忘`tmp/hermes-cleanup-20261003/synclip-image-api-notes.md`，未知提交不可盲重发，未读取凭据或提交生图。
- 用户已认可第二篇物理正确图2cc5003f及细化图681ef614；其科学内容不重做。创建RO和效果展示需少操作；局部管理员/API成功不代表普通用户旅程通过。
- 三篇整体验收、原文疑点回读、可复用经验与定量几何核验仍未全部完成。开源GPU生图第二通道暂停；视频及UI改造独立推进，局部返工不取消这些目标。
- 保留原PDF、SourceMap、认可图片、旧公开版本及paid回答/失败/费用/期限。unknown不重发、失败任务不重开、不猜补科学内容、不放宽来源/Claims/权限守卫；人工核源brief只能作参照。

## 当前锚点
- 分支release/onchip-production-line；10-03已发布源代码提交/app `29de74f2e8f53765283a34055850c1f40122575c`，rollback `e48ea03982d6650577e10400503f28ea206e527a`。最后文档同步提交按Git读取，不代表另一轮部署。
- 精确CI37119454968 success及独立High GO；从临时干净29de工作树正常发布exit0，公网/exact release及原部署事务通过；随后沿现有安装器defer配对成功。API/Worker running、OOM=false，均为`installed-native-29de74f2e8f53765283a34055850c1f40122575c`/`project-catalogue-29de74f2e8f53765283a34055850c1f40122575c`、MiniMax-M3，timer enabled/active。证据 `tmp/hermes-cleanup-20261003/consolidated-review-{ci-result.json,deploy-clean.log,activation.json,runtime-after.json}`。canonical并发文档提交及其他会话Compose/保留脚本改动不混入本次发布；首次本地HEAD不符拒绝未触服务器。
- 作者和独立审阅已使用真实paper_review回执保存科学数据，不依赖最后普通回复抄写JSON；旧paid回放及来源/权限/正常stop验证保持。作者实际提交已成功，独立审阅的最新状态见下一节。
- 原生科学分镜caller已部署：同源已审Claims、原文/图页、设计Skill及共享物化保存私有完整prompt。自动run在审批及旧图片派发两处停在awaiting_storyboard_review，即使手工批准也不走旧生图；GET/UI为image-api-pending。尚无新原生科学合格稿贯通到计划的真实验收。

## 当前科学断点与下一步
- 29de配对后仅创建一次正常新分析：run `caef5a59-76ae-410a-bfed-6c48cf284647`、ingestion `da0fcde0-6c94-4dda-8fff-d7379beeb17b`、author `4eba4ea4-65b9-494b-84bc-e6e19661e1e0`；复用原confirmed215d/24e及原PDF/SourceMap，普通收费/max9。11:49–11:54Z作者32轮后failed，未进入独立审阅、未物化版本：末次paper_draft字段映射为item数组，多次非核心Claim缺父项却只收到通用格式反馈；已复现原生迭代耗尽后的额外无tools总结请求导致协议拒绝。应用/配对仍正确，API/Worker无OOM。尚无新科学或计划验收。`consolidated-review-create.json`及只读status记录结果；创建脚本和远端native-consolidated-review-20261003-cds-1收据不得重放/删除。下一步等并发运维会话将已审资源配置提交整合后，从干净且对应CI通过的版本正常发布并配对Native；不扩轮数、不重开失败task或直接重发。生图前科学和完整prompt仍未完成；新API前旧生图保持暂停。
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
- 运维/视频前置：用户10-03决定先在现ECS做好功能与展示，集群以后扩；同机测试隔离网络/数据/账号。用户确认暂时没有异机存储，后续配置；外部备份/监测不必另购计算机，整机高可用/物理隔离才需第二主机。已实设4GiB持久swap及Web/API/Worker/PG/Redis/对象/ClamAV/Netdata/vnStat上限，API/Worker被Native重建后已同PID补回、Redis384MiB/noeviction与原持久配置一致；swap接近满，不当视频容量，12GiB为本地Qwen语音上限而非云端H3内存需求。初查release44.4GB/images26.9GB/models5.16GB、DB backup1.05GB；82旧目录/288tag准备后已取消未执行pending，未实删。已完成单次非轮转对象导出967个/2,812,621,957字节，离线逐文件校验通过、971文件0600/2目录0700、无staging；29de来源，锁已释放，旧备份保留。物理空间/节点余量与不可变同源helper候选32pass/1Windows skip，retention45pass、增量High GO；未装定时脚本，恢复/异机/告警/测试站未验收。证据`tmp/ops-readiness-20261003/`及服务器私有`observations/ops-readiness-20261003/object-backup-verification.json`；操作见[backup](../runbooks/backup-restore.md)、[deployment](../runbooks/deployment.md)。已审候选已推3f490d7ceb75de6553ed6b195610d79a4a35350a，精确源码已私有stage；ef9e app/Native配对完成且资源上限保留。独立安装在文件替换前被目录权限检查拒绝：infra/scripts两层root:root775属于现发布manifest，取消chmod以保护源验证/回滚，未改源目录/backup.sh/cron。967集合已验证且旧DB每日备份保持；对象定时留待正常协调发布包含同源helper后纳入。恢复、异机、外部告警、测试站、浏览器残留和旧release实际清理仍未完成；不重复导出或再发paid任务。
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
