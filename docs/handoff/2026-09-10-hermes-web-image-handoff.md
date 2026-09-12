# Hermes / Workbench CURRENT Handoff

## Goal and constraints
- 用户要求继续落实并实际校验质量，不能部署即结束。本轮真实论文六字段私有审校稿已保存并核读；自动初稿科学质量仍未通过。视频/批量冷启动暂停，不自动采用或发布。
- 生产MiniMax-M3，Chat6Pro仅开发讨论。服务器自动稿、服务器共编、人工校正必须区分；已授权当前研究私稿与必要原文处理。
- 本机仅编辑/静态阅读/传输；无测试/预检/CI/本机构建。必要服务器build/start与真实产品操作按授权执行。

## Version and workspace
- 交付树 E:/Miscellaneous/XGS/.worktrees/onchip-video-release，branch codex/onchip-video-release；应用代码HEAD 9f889d2619290b378d735cb09304ccf640068120，后续docs-only HEAD以git log为准，不是新部署。未合并main，根目录旧dirty main不是生产基线。
- 当前应用release 9f889d2619290b378d735cb09304ccf640068120 / rollback 0fc5b7d91de5b57b6147d0bf8b8a84865a805c1a；服务器build/start exit0，xgs-source-display-deploy-20260912.log。
- 网页生图provider d1630135d569d28364d295380bb4e0333c3ee264 / rollback92cc416ee3fe921f62c75cbe6f69e48d0b55227d；video runner0df87c9bee98c2280396551ed522e66230eaf381，未产新视频。
- TTS镜像a2158409、renderer ff6042f6、模型qwen3-tts-customvoice-0c0e305复用；无新增服务/依赖。独立媒体版本不可混作应用release。
- unrelated dirty docs/specs/2026-09-05-integrated-research-product-design.md不得覆盖/提交。

## Actual private six-field draft: source-reviewed, user edited
- 新稿92cafb82-73bc-4937-bb9c-bf1228b23dd3，《深亚周期光脉冲：六字段审校稿》；1118字符/17原文引用，sourceStatus=user_edited。六段与原文/引用逐项复核，独立High最终复核通过；不代表M3自动初稿可靠。
- 路径：097自动稿 → 既有workspace.guide editorDraft服务器两次共编f5d79d24/e8d225ca → 人工校正问题/方法/边界/复现 → 真实UI编辑并Save。最终保存新稿，原稿40e23948保留，未写入SDF。
- 最终稿保留近乎垂直碰撞、正峰同步、角分辨光子数到时域强度/相位/电场的运算顺序；Fig.3输入含束团截面/六棱柱几何/驱动功率，经典模型互证只限99as与2.6PHz；权衡限定Fig.3扫描，不称已公开完整实现/收敛设置。
- 私有入口：https://openscience.428312321.xyz/research-objects/c896802c-35dd-4b59-8db1-5f374f83a6d8/edit?hermesTask=92cafb82-73bc-4937-bb9c-bf1228b23dd3
- 实际POST201、新task succeeded；新阅读页重载/来源展开/下载完成，RO version11，JS failures=[]，正文与审校artifact逐字一致、下载含正文，下载16648字符。此短稿无独立公式，不能沿用旧稿57式指标。
- 本机证据目录 C:/Users/Mac/AppData/Local/Temp/：xgs-six-field-reviewed-download-20260912.md、xgs-six-field-reviewed-result-20260912.json、xgs-six-field-final-core-20260912.json、xgs-six-field-reviewed-reading-20260912.png；服务器/jobs/hermes-six-field-reviewed-{save,result,ui}-20260912.json、hermes-six-field-reviewed-20260912.md。
- 原私有笔记40e23948-4b41-4440-a3a1-49dd9acb8824，《深亚周期光脉冲：机制与适用条件》仍保留：2696字符/41引用/57式0排版错误，M3修订后人工四处校正、独立原文复核通过；来源a1c0da49-d2ea-4407-b3e6-b68eadd72ceb仍可用。原下载xgs-hermes-note-20260912.md。

## Automatic proposal: NOT scientifically accepted
- ingestion840e24f9-cf9b-471f-a38c-7331705b1003，当前agent097665f1-1654-44b2-af7d-70a43dffd846。使用current d680 + base4099a967-a918-4b36-92b0-06edede4d552显式仅续final；0OCR/map/bridge，sourceMapReused true，旧bridge responseHash完全相同。
- scientific-summary v5实际一call in13067/out5057/53017ms/stop。六字段逐字匹配API；sourceMapIdentity true，实际引用数4/2/13/4/7/11。method17233/repro9908字符合规于现有64段/24000字符上限。
- 097自动稿仍有科学缺口：问题省Gaussian前提、洞见夸大材料共振与跨几何30dB结论、产额漏驱动中心功率、权衡泛化/实现披露夸大。未采用；后续两次服务器共编也仍需人工纠正，不能宣布自动化通过。
- 本机xgs-source-display-result-20260912.json；服务器/jobs/hermes-source-display-{result,ui}-20260912.json。旧d680是v4而非当前稿，正碰/指数/THz条件/TE0-like四错记录仅属历史。

## Deployed code and observed product behavior
- 0fc：global P并集成稿，不按上游字段分类限制引用；两条final按既有shared预算/定位验证并使用原一次schema retry。final保持65536/adaptive/300s，不扩其他阶段。
- 0fc：真实proposal/sourceCore分离、agentTaskId草稿隔离、只保护实际未保存编辑；确认必传sourceAgentTaskId且Serializable/CAS核对，旧代409保留草稿并三方合并，确认/reconcile同步server refs。High静态复核通过；默认显示已实观，未人为触发确认/竞态检查。
- 9f：API projection/web统一既有64段/24000字符常量，纯domain subpath避免Node依赖入浏览器；接受same-block有序非重叠范围并计算换行，保留身份/页码/定位/原quote限制。High最终复核通过。
- 根因纠正：shared envelope本来就是64/24000，0fc guard没有跳过；旧API/web硬编码32/8000隐藏identity/引文。d680在9f不重跑模型即恢复引文3/2/10/7/6/9，097新稿引文也全显示。这不是新增上限或扩大来源访问。
- v5通用写作约束已部署：自然语言method、代表算例条件完整、保留几何/like限定、边界不另列其他产额；实际科学缺口见上，不能把prompt修改等同质量解决。
- Docling/M3/公式/多格式上传已部署；26页32原式28可排版、4解析损坏，未声称全篇公式物理通过或真实多格式样本均兼容。

## Browser limitation and protected content
- 保存92后旧产品页持续停在读取版本，真实trace有6个JS ERR_INSUFFICIENT_RESOURCES，未进入业务请求；无应用JS异常。旧资源采样1.7/4GiB、454/1024pids、shm56%、OOM0，未定位根因。
- 同认证context新建阅读标签页（#quality-reviewed）首开成功，保存稿/来源/下载均可用。保留旧页及其他标签，无重启/登录态变更；新页成功不是资源问题根治或长期稳定证明。
- RO c896802c-35dd-4b59-8db1-5f374f83a6d8；正式v10 f4e2dc71-1fe8-406f-8c19-e1849503d698；公开OSR-2026-000022/v/10；草稿修订11。原确认ingestion2fdb78de-b52b-40f6-832f-faa3fdd9f4e2 / agent1e324308-fd26-4cc1-8612-8a1c269909a9保护。
- PDF7bb96cc1-bb6f-4d3b-b0bf-352f41971faf；已批图b19a65bd-6497-4b61-bb81-0154b264d58c、plan3a6ed136-002a-4301-8505-ca14e3dbbc53保护。旧数据只按原范围可恢复归档，原件/公开ID保留。

## Next and read-first
- 用户最新强调借鉴现有与GitHub成熟Skill、减少重复造轮子和低效迭代；已记入AGENTS/Memory。重新读PaperQA/K-Dense/claude-scholar源文件并对照实际runtime，结果在能力台账“来源与选择”；未安装第三方能力。
- 已有K-Dense批判性阅读规则确实进入reduce/bridge；PaperQA为方法借鉴，完整库未集成；peer-review逐主张证据与claude-scholar措辞边界是明确的复用方向。现有SemanticPoint已有所需核心结构，不另造一套Claim系统；final不传旧语义文本是有意防旧错传播，不能未经核对反向恢复。
- 独立High代码核查后的最小后续方案（尚未实现）：从现有evidenceIds/passageBindings派生仅含分组键、支撑P和限定P的导航，与global原P并集送final；不传旧statement/conditionCase/comparison/operation/case文字，不限制跨字段引用。模型按原文保留/缩小/纠正/丢弃主张；该差异尚不能证明为全部科学错误根因，不直接恢复旧语义成稿或新建Claim结构。
- 交给用户审阅已保存私有六字段稿；采用进SDF/发布须用户确认。当前无需再生成或重跑OCR/bridge；自动化质量与浏览器资源问题保留未完成，视频/批量继续暂停。
- 继续开发先读本handoff、需求基线相关章节与server-capabilities；代码事实优先。明确refresh current/base并用新receipt，禁止重发已提交任务或默认refresh误跑全文。
- 历史纠错：d5默认refresh实际13OCR+4map失败，不是final-only；c1后b6/d680/097已实证0OCR/map/bridge复用。0a的stage成功但final32768 thinking-only截断；4099后只提高final。不得改写旧任务状态/来源。
