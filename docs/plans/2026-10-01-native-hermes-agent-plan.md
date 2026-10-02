# 原生 Hermes Agent 接入

用户已明确授权：Hermes专指已安装的NousResearch Hermes Agent，由它承担论文理解、科学Skill发现/引用加载、按问题溯源与图文规划。GPT只执行Images2.5生图。运行状态只见[CURRENT](../handoff/2026-09-10-hermes-web-image-handoff.md)，不再询问是否接入。

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

终答仅指定真实reviewToolCallId；从已验证CP选择最新成功检查的同稿参数，拒绝未知、失败、歧义及已被新稿取代的结果，并再次跑原物化。已有Slot.id/顺序传递，不增加哈希、公开接口、收费、额度或审批；真实最终响应hash仍指短终答，完整科学文本保留在paidCP。历史完整JSON保持原解释。工程/增量High与精确Linux CI通过，应用及原生方法目录已发布；唯一新普通私有论文7分51秒后误选draft ID而失败，科学亦NO-GO。后续候选沿同一Slot回传成功review ID，并一次诊断各字段未读P；主线先固定量/对象/代表结果，保留跨算例或推断时实际读取既有原方法/逻辑参考并核原文支持与反例，代码/网格缺项只限定未保留的复现强断言层级。真实科学改善仍待验收；不能拿旧稿重新采用或据单元测试宣称几分钟达标。精确版本/证据见CURRENT。
