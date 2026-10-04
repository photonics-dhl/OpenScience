# 原生 Hermes Agent 接入

> 接入设计与历史实施记录：原生论文及自动规划入口已部署，真实科学质量仍待验收；当前版本、任务、断点与下一步只见[CURRENT](../handoff/2026-09-10-hermes-web-image-handoff.md)。下方阶段性准备状态不得作为重新接入或重新付费的指令。

## 已保存来源稿的原生修订

10-05有界方向已获独立High GO并已部署；Domain283/Worker142/实际HTTP41及Domain build、Domain/Worker/API/Web TC和14文件scopedlint通过。两项High P2已真实RED→GREEN修复，精确CI及正常发布完成，复用Native789。一次真实作者4m30s/19帧完成并自动建私有版本，但整稿来源保真High NO-GO，父稿四项主结果失真未修；分镜自然32帧失败、无图。实际工具回放证明10次拒收因具体字段/未读来源/长度问题却只收到泛化反馈；先修任务组织与诊断再受控验证，不能以工程成功认定内容正确。复用现有reanalyze API、同源SourceMap和原生逐字段/Claim工具，保留原稿、版本与paid；不评议论文、不写样本答案、不重开失败任务。

1. Domain/API：sourceReanalysis按intent区分既有new_paid_private_analysis和新增单字段revise_saved_source。旧请求键/digest保持；新意图只在confirmed且真实Native作者/CP有效时创建普通收费任务。现有reanalyze audit绑定服务端CP；新任务沿原key增加source-fidelity后缀，避免意图缺失时退回普通分析。 resolver在执行、终态及采用的现有Serializable权威检查中重验来源/权限/作者/CP。
2. Worker：在原reanalysis分支取得可信修订上下文，复用runNativeSourceReviewTask的paper_candidate和逐项工具。新执行保持paper-author，终态保留修订后raw Claims及自身完成回执，不带独立reviewer的sourceAgentTaskId；旧稿基准放原binding.sourceReview，旧保存协议不升级。
3. 验证：先证明新作者路径在旧实现拒绝，再验证实际Gateway/session/tool往返、同键回放无新调用；Domain/API验证正常一次收费、旧私有恢复兼容、父稿/CP/Map/权限变化拒绝、终态与采用重复检查、原稿保持。命令采用现有对应vitest定向入口、包TC/build、scopedlint；仅新增CI文件覆盖必要增量。
4. 独立High复核实际增量后完成精确CI与正常应用发布，复用未变Native资源。实际一次修订通过原文对照后再建合法新run继续科学/艺术方案；不把接口/fixture成功称为内容正确或普通用户旅程通过。

### 基于实际失败修正工具反馈与阅读顺序

原生修订已实际执行，保存正确但保真失败；完整工具回放重现10次泛化拒收。最小增量只在Worker既有边界：共享字段校验给出失败路径、超长说明的实际长度与未完整读取的原P，指导只修该问题；新paper_review_field描述启用详细反馈，保存的旧描述仍使用原反馈，校验接受集合不变。新来源修订先用已安装openscience-source-review及原文工具理解主线/主机制/条件完整的代表结果，再读取旧稿核对，辅助实现归因后置。没有新的模型阶段、请求字段、科学门禁、资源安装或样本答案。

新反馈测试RED及缺首轮定义升级的High P2两项RED→GREEN已观察；保存模式只认实际首轮description，不能从当前fallback工具推断旧paid采用新行为。源侧及旧review/materializer验证通过，阅读顺序按方法和调用入口审查，不以静态字符串检查声称Agent已遵循。

同一失败planner的完整context和28个旧拒收回执已零外呼回放一致，证明s29原句的表达式数字binding及完整谓词被误拒；s5页码quote、uppercase IDs及qualifies当supports则是正确拒收。通用分镜增量仅为新保存描述识别精确whole expression representation、完整predicate+article和单位；真实/未知单位、错符号/分母/因子保留拒绝。源ID、12..12000 quote及supports错误给具体scene/subject位置，context/原文/关系不改；歧义括号仍拒并提示分号独立比较，不创造自然语言数学外壳规则。旧base/Hz/annotation paid grammar与回执逐字保持，新mode贯穿call/finish和root层。

最终六文件Code High GO、413/413定向、Worker TC/build0及5文件scopedlint0；planner5处ESLint基线严格复现。实际原句两个正向案例新模式通过、旧模式拒绝，错符号/分母仍拒，回放没有模型调用。SDK、根Skill及Native目录不变，复用Ops GO。精确CI和正常应用发布已完成，受控一次新修订已创建；真实阅读、稿件保真及自动分镜仍须实际验收，唯一运行身份和once状态见CURRENT。

新实际作者6帧/4分钟只修λ趋势，另外三项结果对象/条件/范围失真仍在；五字段accepted及六Claims unchanged真实保留，原段/图注已送达，不是保存丢失。planner16帧截断，无asset/图。下一有界候选只在fresh sourceCorrection动态指引和工具description明确：按拟保留句子及每条Claim的conditions/limits核对，关联简略比较的图注和必要原页；复用共享读者组织，允许省略完整无关辅助断言，immutable基准不等于新稿必须全保留；accepted/unchanged意味着全部保留内容已核且拟保留。纯润色不得编造source issue，原有revised/来源/父Claim/commit合同不放宽。Source88、TC、scopedlint及两项delivery/isolation RED→GREEN已观察；High与实际科学收益仍待，不改根Skill/目录、不另加模型阶段，运行只见CURRENT。

## 独立原生核源接续的设计沿革

接入前paper_review由作者同一Agent会话执行；完整contract5会被automaticIngestionReviewStage直接消费。v13的实际草稿、Claims及所选完整原文已传入，但角度、跨算例参数和条件仍误判。下述独立角色现已实现并部署；它曾真实执行，但未证明科学全部正确。当前断点只见CURRENT，不能把本节当待重新接入的任务。

合同定位经独立High只读审查：复用现有source_review阶段，仅为新任务建立真正原生审阅角色。该角色绑定实际作者候选，独立Agent/store而不继承作者对话，按保留主张渐进回查原SourceMap并复用完整科学物化；原canonical source、run/step、每轮租约/权限/外部处理授权及最终paid回执仍须一致。新角色必要性是原固定请求签名与1/2次检查点不能授权多轮Agent；不能把旧收据转换为新执行或伪造semanticStage。仍占原run槽位和一次普通任务扣费，保留replay-before-debit/max9/CAS/unknown不重发。此段保存已实施设计边界，不代表科学验收。

## Synclip替换图片通道

10-03用户提供[图片API](https://synclip.ai/dev/docs/image)，确认首试模型为gpt-image-2，2.5后续接入；不自动替换Nano Banana或Midjourney。原生Hermes继续负责科学、风格、完整prompt及像素审阅。Gateway接入独立Synclip image spool身份；host保存提交意图并调用POST /v1/image、GET /v1/tasks/:id，复用现有隔离图片正规化。具体实现/配置/真实结果仅见CURRENT。

复用原requestId、promptHash、资产和费用记录；新的持久提交记录只用于防止POST回应丢失或进程重启后重复扣费，既有本地spool标记不能证明外部API是否受理。未知结果且没有task_id时不重发；拿到task_id立即保存，恢复只GET同ID，完成下载及正规化后才发布本地completed。API/Domain只读本地结果，事务内不查询供应商。Native max9补接原任务完成结果恢复、保留原reservation与尚未开始的像素审阅，不新建预算或工作流。Key由用户隐藏输入到host私有文件，不进入业务容器、聊天或spool。

私密配置入口为`infra/synclip-image/configure-key.ps1`，在Windows PowerShell执行文件、按隐藏提示输入；不复制脚本正文。它只保存root私有Key，不启用provider或提交请求。应用默认SYNCLIP_IMAGE_ENABLED=false，安装后的host负责持久提交、续查及正规化；启用前核对待续行的Native任务，确保首张试图对应已审科学方案。Synclip作为主图像通道时忽略备用配置，错误不自动切模型。恢复界面复用image-render/零平台重复收费提示，后续Hermes审阅仍有模型用量。

## 已结束的接入和局部修复记录

下文保存历史设计与执行证据。旧“候选/实施中/下一步”均是当时状态；不得据此重新安装、重新付费或恢复旧GPT来源审阅。

10-02最新用户范围：本轮先交付生图前的正确物理事实、画面叙事、完整指示词、构图和艺术风格及原文依据；用户将更换生图方式。原生理解与规划继续，暂停本轮旧图片通道调用、新图像receiver及生成后像素接线；后续生成方式待用户决定。旧任务、收费、认可图片和公开版本保持，原未完成的其他需求不据此宣称已交付。实际候选、线上及质量只见CURRENT。

10-02历史规划准备（当时记录）：已有generateIllustrationStoryboard内科学物化原样提取为materializeIllustrationScience，旧入口薄委托；从同Claims/settings/原图映射重建原lookup与场景上限，数字、标签和来源守卫不变。当时原生caller尚未接入（现已部署，见CURRENT）；这只是当时复用准备，无新模型、收费、权限或Prompt。RED5→184/184、WorkerTC0及2文件独立High GO，整文件7条旧lint与918d逐项相同、0新增；不能据此宣称Native规划或科学/艺术正确。

用户已明确授权：Hermes专指已安装的NousResearch Hermes Agent，由它承担论文理解、科学Skill发现/引用加载、按问题溯源与图文规划。生图暂停至用户提供新API；GPT来源审阅只留历史兼容。运行状态只见[CURRENT](../handoff/2026-09-10-hermes-web-image-handoff.md)，不再询问是否接入。

## 已核事实与保留边界

服务器`/opt/hermes-agent`为0.10.0/Python3.11.6，实际入口`AIAgent.run_conversation`、客户端工厂与原生Skill工具已核。源目录无Git身份；构建须固定实际源码快照及依赖，不能仅靠版本字符串。接入前产品使用固定Worker模型流程，没有调用原生Agent，是当时的接入断点；不得先跑旧凝练再附加Agent装饰步骤。

保留原PDF/OCR/完整SourceMap、Claims/Evidence、权限、任务租约、费用、公开版本和认可图。新原生执行身份不冒充旧2次model_self_check收据；旧耗尽/未知调用不重开。

## Gateway真实工具往返

范围：`packages/ai-gateway/src/{provider,gateway,native-tool-protocol,index}.ts`和定向用例。原接口没有工具响应，导致调用丢失；已有promptHash缺工具定义，沿原字段绑定完整工具请求，不增加另一套身份。MiniMax要求完整assistant content续传，私有opaque thinking/signature不进日志/UI或科学Evidence。

保留原文本hash/payload，正确传递工具schema、调用ID、参数与结果；Anthropic转换tool_use/tool_result并合并并行结果，OpenAI保留函数合同。空文本只允许有效工具响应。普通complete/structured拒绝工具模式；原生入口强制每轮授权与持久提交回调，未知调用不切换Provider。测试HTTP边界、完整blocks、身份/权限撤回、输入修改及原图片回归。

## 原生适配与零外呼闭环

范围：`infra/hermes-agent/`薄Python适配、Worker内部桥及相关用例，无新增公开API。每任务隔离原生会话，只覆写真实client factory注入SDK transport，不重写Agent循环；SDK禁重试，客户端重建使用独立transport。原生自身重试仍由Worker pending响应约束。

广告与执行白名单一致。保留原生skills_list/skill_view和完整只读引用资源；论文读取/搜索/必要页像素由平台绑定当前来源。无shell、Docker socket、DB、主机home或Provider Key。真实run_conversation零外呼执行Skill发现、正文/引用、来源工具、下一轮与终答，验证续传、禁用工具、客户端重建；工程闭环不能证明科学质量。

## 任务、恢复与部署

范围：Worker原sdf.extract点、Domain原task.result私有执行状态、现有Python3.11不可变运行时快照、systemd RootDirectory模板与窄运维broker。复用parser和任务，不新建任务账本；新的正常研究任务由原生Agent控制阅读/构稿，历史保持原模式。任务私有socket/工作目录连接Worker；运行入口固定模板/挂载/资源，每任务DynamicUser、仅自己的HOME与UDS、无互联网地址族，Worker无容器管理权限。

每模型轮/来源工具核执行租约、用户权限、文档身份及授权。已完成响应可沿同任务恢复，pending未知不得重发；轮次、累计token与deadline明确约束，不能把max9业务任务当90轮Agent预算。沿原任务一次收费，不加工具收费。六字段/Claims经现有科学materializer正式提交。独立High审查具体代码的隔离/恢复/并发/费用，再完成适用CI、干净已推SHA发布与原回退流程。

## 真实交付和清理

普通站内创建一篇真实论文，观察全文/图表理解、Skill实际使用、六维/Claims、默认首选风格、Images2.5和Hermes像素核查；特别核2408论文材料边缘/中心、固定工况和模型假设。JSON/来源绑定通过不算科学正确。完成2–3篇真实论文的用户认可、普通作者/公开展示后，清理确认退役流程与服务器生成物，保留原文、费用、任务、会话、独有Skill及必要回退。

## 原生托管切片验证

私有Worker SDK桥已通过真实安装0.10.0的两进程验证：完整Skill/引用、按call ID关联的原页像素、完整Provider blocks和三份已完成回答重放。9次原生SDK请求只有6次模拟Gateway提交，外部模型0；DynamicUser实际不能访问宿主凭据/spool或创建互联网socket，运行时/Skill只读。模型调用参数JSON键序由原生规范化，按调用ID/类型/名称/JSON语义与未变完整Provider blocks核对；每轮既有请求前缀仍严格匹配。工程证据在CURRENT引用的ignored日志。

后续source候选已接Domain私有对象引用/CAS、当前终态authority重核、server配置新任务marker、原Worker入口和真实paper_draft候选/现有科学Claims materializer；定向工程证据及独立High已收敛，source修复版精确CI、生产安装与激活已成功，真实科学任务仍待质量验证。新任务不先跑静态reader/reducer/composition；历史任务不按新配置改派，未知started不重发。实际独立冻结的已安装0.10.0 Agent→PaperTask/私有Store/科学物化完成11轮零外呼整合，原页与完整Skills/引用实际经过Native dispatch，22私有CP保留。原生512K配置与压缩器256K阈值已生效，压缩后的历史兼容尚未验证，严格停止。不得以模拟终答替代真实论文。

## 实际冷启动差异

首份source候选精确CI通过，但实际应用发布在API启动失败时自动回退。API helper import在main调用后，CommonJS执行有TDZ；修复合入顶部既有import，真实程序入口转译/执行回归已红2→绿2并进入CI。构建与HTTP buildApp夹具不等于入口冷启动；修复版精确CI和正常发布已成功，Native已安装激活，真实论文仍待科学质量验证。首次真实source复用Map后，分别RW bindmount使broker硬链接EXDEV；新增真实systemd回归证实common-parent RW及不可变子路径只读修复，恢复前原任务零模型调用、期限与租约不变，单次托管恢复与最终unit差异已High GO；原安装固定broker在修正隔离命名空间中派发同一task/attempt，费用/期限/租约未改，永久unit与Skill反馈修复ffe4精确CI已通过，Native-only安装/激活exit0，应用保持f011。双方停止后只读确认任务/outbox/Redis/inbox排空；原timer及public runtime配对恢复。完整版本、任务与证据只见CURRENT。

## 原生工具错误语义

实际Native首轮选择science分类为plugin namespace，现有Scope以BaseException硬停止而非给原生工具反馈。没有新增colon alias：仅未知/歧义选择或确认未逃逸的缺失引用返回既有success:false/error形状，让Agent在同一循环纠正；逐slot授权先执行，权限/I/O/绝对路径/父目录或symlink逃逸仍停止。真实隔离的已安装Agent旧实现RED、新实现通过错误反馈→发现→完整方法/引用，模拟SDK回答不冒充真实科学质量。成功Skill trace从最后完整已验证历史按call ID与success:true关联，失败请求不计为已读。永久修复ffe4已通过精确CI并由既有安装器交付；Worker成功读取trace仍为候选。当前真实failed任务/原回答不重开、不新增恢复grant；正常确认来源的新私有cdaafe20复用原PDF/Map，实际工具返回已确认方法Skill success:true与原页page_view_ready。继续检查科学终答，而非将接入通过当质量合格。
## 真实源任务的格式反馈和剩余预算

Native-only ffe4激活后，普通确认来源的新私有cdaafe20复用原PDF/Map，真实读取两方法Skill、来源与像素、保存draft；随后五次复核将科学字段或needsMoreEvidence放错JSON层级，现有纯guard正确拒收但反馈不能定位。未返回可采用的scienceCore，所有18轮已付回答与原failed状态保留，不重开任务或新增恢复grant。

必要修复仅在既有invalid_review反馈指出根对象/fields的具体缺失或错置位置；不会补写、重排或采用Agent科学内容，原finish和所有科学/来源/Claims守卫不变。实际flatten与nested错误回归先红2+1再绿，materializer14通过。

独立session回归复现与原CP相同的66,165已用/98,304总预算/32,768申请：原guard在仍余32,139时拒下轮发布。候选把实际provider上限收窄到当前余量，不增加总额度、轮数、deadline或任务；重放按原cursor之前用量重建原上限，原SDK请求留存，未知started不得重发，overrun原CP保留但拒消费。实际provider上限及四份已付回答重放/session27通过；这证明代码拒绝路径，未证明生产transport stopped的隐藏原因。combined41/41及Worker TC/scopedlint通过，最终High GO；精确CI和正常app交付后再验证新的合法原生任务。Native-only更新不需要随本Worker变化重装运行时；全链科学与图文用户验收继续有效。
## 根据真实失败落实方法消费

1c修复精确CI成功，尚未中间部署；只读确认真实paidCP广告schema根三项、fields六项完整。独立科学审计在真实draft中发现引用编号误当指数、束模型平均条件漏写、传播算例/驱动与输出范围混淆及直接绑定缺口。现有科学规则覆盖，缺口在执行；未安装新Skill或代写科学答案。

仅改Native goal原两句：使用原页区分编号和指数，核对正文/图注/附录同量表达、标明原文冲突；真实draft后主动回读影响核心的断言、算例/条件、平均与叠加操作及直接来源，再修订/review。区分作者采用假设与希望新增验证，收窄无据次要外推；needsMoreEvidence仍保留影响所保留主张且回读无法解决的实质缺口，未声称的扩展不自动卡住已支持核心。无附加审校模型、模板、门禁或本论文PIDs/数字答案，原科学守卫和预算不变。增量High代码/工作流GO；已有41及精确1c CI证据复用，必要入口控制5pass/Windows UDS6skip、未变Linux UDS复用，新Worker TC/scopedlint与文档检查0，新精确CI后合并一次正常app发布，再检查新的合法Native产物；不以提示词检查或fixture证明改善。

执行检查点（10-02）：上述Worker增量已完成正常应用发布，实际Native配对重核通过。唯一新普通私有任务已完成六维物化，但核源发现比较范围、错误缺失判断与因果外推，科学NO-GO，未生成图片。任务成功、Skills读取与科学正确性分别判断；旧任务/回答/费用保留，精确身份和证据只见CURRENT。

## 按真实结果修正方法消费

现有两方法缺完整参考资源，草稿工具重复回传已保存在私有历史的整稿，review_ready措辞还可能让Agent把结构通过误作冻结稿。候选补入[原方法索引](../../infra/hermes-agent/science-references/README.md)与实际MIT原文，按问题经skill_view取引用；不整库注入、不运行原文提及的外部脚本、不添加模型阶段或科学放行条件。紧凑草稿收据保留实际tool-call历史和私有恢复；终审明确可按既有规则继续修订。真实SDK引用访问及恢复/安装工程检查通过、独立High代码GO；精确CI/发布和新的科学效果仍未完成，不重开旧失败或已完成任务。

后续原生分镜已获有界架构方向GO：仅支持新同来源单论文visual-narrative-v1，复用已审科学来源、原checkpoint完整快照、权限与私有asset提交；实际Agent读取适用科学/设计完整资源并控制规划，不先跑旧固定science/art模型。尚未实施。原生像素审阅、既有一次修图的任务恢复和主入口接续仍需具体代码与独立审查，不能以来源接入宣称全链完成。

## 收敛任务组织与重复输出

用户纠正：科研理解的优先级应是主旨、机制、代表结果和成立边界，不能让六维/证据格式驱动逐项堆砌。真实逐轮耗时已定位重复长稿生成与结构纠错。候选不加模型阶段或固定阅读配额，在同一Native循环选择必要来源；paper_draft仍保存真实六维，paper_review基于既有draftToolCallId逐字段明确选择接受或完整修订，Claims明确保留或替换。平台确定性展开后运行原完整科学守卫，缺失选择不能自动接受；工具错误区分展开记录和差分格式。

终答仅指定真实reviewToolCallId；从已验证CP选择最新成功检查的同稿参数，拒绝未知、失败、歧义及已被新稿取代的结果，并再次跑原物化。已有Slot.id/顺序传递，不增加哈希、公开接口、收费、额度或审批；最后hash指短终答，科学全文留paidCP。终审ID接线修正已精确CI/正常发布，实际v5终答选择通过，但五次复杂整稿/三次review与科学失误仍导致质量/时效NO-GO。早轮CP为去重记录不能当提示丢失证据。停止仅改引导后重复请求；保存接口候选已实现paper_field/paper_claim单项记录、paper_draft精确选择及实际成功paidCP重建，旧完整JSON/schema/权限/源/Claims守卫保持。定向工程/零Provider实际稿保真及独立High、精确CI/发布已通过；真实v6一次draft/review与6分14秒说明格式/耗时改善，但光场与电子束条件、跨算例/衰减及束团方法错误仍科学NO-GO。原方法引用与保存后核源未执行，暂停新Provider，定位复核方法/输入组织后才做有依据的实际观察。自动来源消费已有Native直接ready/Claims路径，后续分镜/像素原生接续保持。方法安装不等于消费，实际来源反例检查仍需证明；精确版本/任务/耗时及备份清理仅见CURRENT。

## 核源决策输入与实际方法入口

真实v6减少整稿重写并缩短用时，但复核仅返回全accepted/Claims unchanged，未处理来源中的对象、算例和适用条件差异。补接同一次成功draft工具收据：用该调用实际已选的原始完整段落、页位置及字段/Claims映射提供比较资料；不截断段落、不引入旧Web61440限制，不加入支持判断、模型步骤或审批。失败或未读段落不进入收据，并发旧调用不取较新全局候选。旧付费工具定义和反馈保持，新任务才采用该方法输入。

Native安装器优先用科学Skill的nativeInstructions/nativeSourceReviewInstructions；主入口为原Appraisal Workflow的六步适配：固定问题与比较单位、证据先行、方法假设、适用研究框架、范围内凝练、可追溯差异。完整上游原方法及引用仍按需读取；旧静态v5理解/审校/配图投影未变，不把入口读取冒称全部原方法消费。已选资料不能覆盖未选的相反材料，Hermes仍须按主张实际补读。工程验证只证资料与入口组织正确，科学质量须由真实任务及独立原文评估证明。候选、High/CI、发布/安装和实际结果均只见CURRENT；不重开历史任务。

## 原生分镜与像素接续位置

有界只读合同定位已完成，源科学质量通过后先接单论文同源visual-narrative-v1：任务仍由research-run.createPresentationSteps与既有presentation.generate计费/幂等产生。readVisualNarrativeSource已有同版本/同论文的confirmed ingestion、已审core与完整SourceMap reference；不用18k摘要包冒充完整Map，不重新全文分析。Worker Native adapter复用illustration-planner.materializeScience/combineArt的纯校验及parseIllustrationReview，输出仍为现有StoryboardDocument，保留数值、来源、布局、brief和艺术资源检查。requireHermesPresentationTaskAuthority/requireIllustrationReviewAuthority/withPresentationAssetWrite继续限定现有版本、Claim、base、source与style，私有资产沿原审批消费者。

当前reviewGeneratedImage仍为固定模型调用，须接实际保存图片+approved parent brief+Claim/Evidence的Native loop；保持decision/summary/repairInstruction，但readStoredGeneratedImageReview须识别真正Agent CP，不能冒称旧单次模型回执。native-agent-execution目前只允许sdf.extract/paper-understanding，需窄扩展creation/authority/terminal/store与Worker adapter；复用动态paper工具注册和完整艺术catalogue，SDK不重写。旧任务解释保持，GPT只生Images2.5。以上是接续位置，不是候选代码、部署或图文质量通过。

## 核源发布回退与 Web readiness

核源候选精确CI通过，但正常发布公网阶段失败并完整自动回退，方法目录未安装激活、没有新科研任务。源码和实际容器均证web没有HTTP healthcheck；Compose wait仅证明容器running。切换期间root出现502，后来恢复200；原验收没记录actual，保留唯一失败探针及公网因素的不确定性。补到既有web healthcheck：Node对内部首页精确200、manual redirect和有限超时，沿原Compose等待上限，不增业务Gate或endpoint。公网helpers保持单次200/exactSHA合同，失败打印观测状态/curl code，正文只显示合法SHA或长度。

三条已有静态断言因API embedding网络、显式Windows SSH/3–5参数、quiesced回退提前phase标记而漂移，原SHA同源基线复现；只校正断言，保留隔离、FD9/锁、布尔标志和切换/镜像检查。actualHTTP/实际shell新回归各见红绿，全套和High工程GO；Linux CI新增既有文件命令及双路径。MJS为既有ESLint忽略项，不声称已lint。BGE init/启动/发布重复全模型校验另属部署债，不冒称论文理解慢或为省时跳过。新精确CI/发布/Native消费及科学结果保持未完成，任务、费用、原文、图片和回退不变。

10-02实际检查点：上游应用已正常发布，Native新方法在安装前runtime-snapshot超时，未创建新bundle或v7；保持旧配对。用户最新生图前内容已先人工按原文准备完整可迁移brief，独立复核修正S(z)宽度与结构成缝措辞，不据此宣称Hermes自动改善。共享科学物化器候选精确CI通过、尚无Native caller。安装性能需保留原完整校验定位，不能用新的模型任务绕过；精确线上与证据只见CURRENT。

## 10-02 自动生图前候选（实施中）

用户明确要求原生自动链路到生图前可用，再提供新API。本次给现有新presentation.generate的同源单论文narrative限定paper-illustration profile；继承普通用户计费/幂等、draft版本、SourceMap和Claims。Native复用原host/session/store，自己阅读原文/原页/完整Skills，通过确定性science/art/review工具物化现有StoryboardDocument，不再调用旧固定模型三阶段。工具记录与终答由真实paid历史选择；所有SDK、工具、最终写资产重核权限/原来源/租约和规划输入，started未知不重发，保留CP及完整可迁移prompt。资产私有draft，standalone不自动approve或调用图像；实际run已有自动审批消费者仍须按用户本轮范围避免进入。

运行校验瓶颈实测是100929项walk/文件hash与浏览器cgroup触顶造成的共享磁盘竞争，closure扫描不是瓶颈。每批8个异步identity按原序归并，所有文件/链接/权限/目录闭包范围保持；拒绝前排空本批。旧串行900s未完成、候选740s完成，环境负载不同，暂不作等价实时digest或稳定性能主张。浏览器8→10GiB同容器在线有界缓解经High条件GO，保留无swap/4CPU/只读/无特权/网络none/原profile，无重启/闭页；未知页面不得清理。installer两条全量verify改900s，其他命令120s；Linux验证与真实安装仍待完成。完成证据与运行身份只记录CURRENT。

- 10-02收敛：自动run使用Native私有图解规划，审批和图片派发前都暂停；GET/UI以image-api-pending显示方案就绪。High发现并修复失败结果私有字段丢失、终态来源并发快照和自动旧通道派发三处问题。新增诊断有限记录stop reason，错误不再笼统归为传输问题，未知提交仍拒收且不重发。代码High GO；一次新合法私有任务须待精确CI/部署，用于真实质量和完整诊断，不能证明v7异常已修复；失败不盲重开，图片仍停用。

## 已完成回复缺工具调用的有界纠正

v8实际paid回复stop_reason=tool_use但只有thinking/text，没有tool_use块；不是未知发送或GPT网络故障。保持原CP的other与完整不透明内容，SDK如实标tool_calls而不造调用或标stop。TaskAgent只对这个完整响应沿原AIAgent.run_conversation继续一次，携带完整历史、同task/system并减去已用迭代；原Worker总输出/turn/deadline不变，已付prefix计数保证重放不能增加纠正次数。第二次同类异常保存后拒绝，length/未知started/权限撤回不继续。提示允许为科学核对回读，不重启任务或重复保存未变化字段。最终host仍要求真实终答与原科学物化。

独立High最终GO；Gateway47、Worker35、Python12+1Windows skip、UI24及build/TC/scopedlint通过。真实安装Agent的隔离LinuxUDS离线运行证明首次异常后进程中断、重放5回答、正确后续工具/像素/终答；重复异常零采用，零外呼。该证据不证明真实科学质量。新说明去掉新来源分析入口的旧ChatGPT订阅提示，历史Web任务身份不变。精确CI/配对发布和新的真实论文验证见CURRENT；旧v8不重开。

## 大图片与长历史续行的上下文估量

v9的两页图片编码被已安装Native rough estimator当普通文字，887765估量超过512k上下文的50%阈值；去图片编码仅64579。短历史控制没有进入preflight，实际26消息大图离线重现compression改变原prefix而被Worker拒收。薄适配器沿已有_interruptible_api_call与_compress_context虚方法，仅对同一次缺工具回复、完整历史加固定hint且实际cached system相同的首次API前续行，用供应商明确三个合法usage字段之和加末assistant（含opaque）/hint的UTF8序列化字节作保守增量估量；不称精确token上界。已知总数通过private SDK extra传递，原计费Usage不变；缺失/非法/历史变更或真正超阈值走原compressor，首次API及finally清暂态。原压缩器、阈值、paidCP和权限/预算保持，不新建审批或恢复grant。

元数据依据为[MiniMax官方缓存说明](https://platform.minimax.io/docs/api-reference/text-prompt-caching)。新增native tools/adapter边界回归，tracked offline_host新增missing-tool-after-image及repeated-missing-tool-after-image，保留真实像素/长历史/崩溃重放。实际安装Agent离线已RED→GREEN、零真实Provider；科学未通过，v9保留终态。运行版本、最终审查及真实续作只见CURRENT。

## 直接审阅终稿与可选格式反馈（10-03）

v10在真实draft_ready后连续两次tool_use但无结构化调用，只留下未闭合draftToolCallId JSON；不能将其当作科学审阅、补造字段或增加重试。既有finishNativePaperReview已可从真实paid历史还原最新草稿，并对直接完整紧凑终稿执行同一expandReview/完整科学、来源和Claims物化。候选只把新任务INSTRUCTIONS、review工具说明和nativeSourceReviewInstructions对齐现有入口，明确六字段决定、Claims选择及精确草稿ID；paper_review成为可选结构反馈，实际成功时仍支持原reviewToolCallId终稿。旧paid系统prompt和工具定义继续原样恢复，Host/Store/权限/预算/来源守卫不改。

新增真保存notes无review调用的终稿测试核对实际修订、科学字段与原文证据保真，反例覆盖截断、无/失败/被取代草稿、缺少Claims决定、外来来源和accepted中夹带修改。该检查证明既有通路可用，不是供应商异常的red-green或科学正确性证据；工具schema导致截断仍未经证实。最终工程/真实验收状态见CURRENT。

## 当前分镜修复的精确范围（10-05）

实际528完整context回放确认Tc1/2在自己的支持quote中，但对应subject只描述另一表达式，拒收正确；后续场景同错而反馈缺scene编号。as/that说明短语被解析为单位；现不扩quantity grammar，而明确完整表达式须同时写入对应subject及own quote，比较与说明用分号分离且保留算符/值/单位。只fresh science工具补通用最小叙事、sN/P、availableOriginals指引及既有六domain枚举；sourceQuantityLocations默认false，真实首轮新描述启用scene/root路径。保留be20 PAID_PROSE全部语法/旧反馈，保存schema原样恢复，缺tools回退旧string domain。Source核对方法候选及Planner精确验证/审查/部署/真实结果以CURRENT为准，不重新请求任何旧失败任务。
