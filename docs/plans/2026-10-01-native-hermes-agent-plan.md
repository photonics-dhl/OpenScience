# 原生 Hermes Agent 接入

用户已明确授权：Hermes专指已安装的NousResearch Hermes Agent，由它承担论文理解、科学Skill发现/引用加载、按问题溯源与图文规划。GPT只执行Images2.5生图。运行状态只见[CURRENT](../handoff/2026-09-10-hermes-web-image-handoff.md)，不再询问是否接入。

## 已核事实与保留边界

服务器`/opt/hermes-agent`为0.10.0/Python3.11.6，实际入口`AIAgent.run_conversation`、客户端工厂与原生Skill工具已核。源目录无Git身份；构建须固定实际源码快照及依赖，不能仅靠版本字符串。产品现在使用固定Worker模型流程，没有调用原生Agent，是接入断点；不得先跑旧凝练再附加Agent装饰步骤。

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

后续source候选已接Domain私有对象引用/CAS、当前终态authority重核、server配置新任务marker、原Worker入口和真实paper_draft候选/现有科学Claims materializer；定向工程证据及独立High已收敛，尚待精确CI、生产协调安装和真实科学任务验证。新任务不先跑静态reader/reducer/composition；历史任务不按新配置改派，未知started不重发。实际独立冻结的已安装0.10.0 Agent→PaperTask/私有Store/科学物化完成11轮零外呼整合，原页与完整Skills/引用实际经过Native dispatch，22私有CP保留。原生512K配置与压缩器256K阈值已生效，压缩后的历史兼容尚未验证，严格停止。不得以模拟终答替代真实论文。

## 实际冷启动差异

首份source候选精确CI通过，但实际应用发布在API启动失败时自动回退。API helper import在main调用后，CommonJS执行有TDZ；修复合入顶部既有import，真实程序入口转译/执行回归已红2→绿2并进入CI。构建与HTTP buildApp夹具不等于入口冷启动；原生尚未安装，真实论文与全链质量仍待验证。版本与证据只见CURRENT。
