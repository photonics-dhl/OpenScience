# Hermes / Workbench CURRENT Handoff

## Goal and constraints
- 用户要求复用现有及GitHub成熟能力，实际核对科学质量，不以部署或模型success结案。当前第一篇真实论文未完成自动科学质量，视频/批量暂停。
- 生产使用MiniMax-M3；服务器自动稿、引导共编、人工校正须分别标记。私有92审校稿已通过独立原文复核，仍待用户采用/发布确认。
- 本机仅编辑/静态阅读/传输；无测试、预检、CI或本机构建。必要服务器build/start与实际产品生成/阅读按授权执行。

## Version and workspace
- 交付树 E:/Miscellaneous/XGS/.worktrees/onchip-video-release，branch codex/onchip-video-release；代码08ed3b35113a512fbd414524ab8958ec4f87deeb已推送部署；含602c6c09显式来源选择及分片metadata压缩，独立High复核通过；后续docs-only HEAD不是新release。
- 当前应用release 08ed3b35113a512fbd414524ab8958ec4f87deeb / rollback df94fae0e25b109791f41d71691611bb88d78ebd；xgs-writing-source-confidence-deploy-20260913.log exit0，必要服务器build/start完成，实际页面/__release200同SHA。1e/a8为历史应用版本。
- 根目录旧dirty main不是生产基线；未合并main。unrelated dirty docs/specs/2026-09-05-integrated-research-product-design.md不得覆盖/提交。
- 网页生图provider d1630135d569d28364d295380bb4e0333c3ee264 / rollback92cc416ee3fe921f62c75cbe6f69e48d0b55227d；video runner0df87c9bee98c2280396551ed522e66230eaf381。
- TTS a2158409、renderer ff6042f6、模型qwen3-tts-customvoice-0c0e305复用；无新服务/依赖/媒体实产，媒体版本不能混作应用release。

## Protected private and public content
- 私有92cafb82-73bc-4937-bb9c-bf1228b23dd3《深亚周期光脉冲：六字段审校稿》：1118字符/17引用，user_edited；服务器共编后人工校正，独立High六段原文/引用复核通过，真实UI保存/重载/来源/下载一致。
- 私有入口：https://openscience.428312321.xyz/research-objects/c896802c-35dd-4b59-8db1-5f374f83a6d8/edit?hermesTask=92cafb82-73bc-4937-bb9c-bf1228b23dd3
- 原40e23948-4b41-4440-a3a1-49dd9acb8824《深亚周期光脉冲：机制与适用条件》：2696字符/41引用/57式0排版错误，人工四处校正且原文复核通过；原来源a1c0da49-d2ea-4407-b3e6-b68eadd72ceb保留。
- RO c896802c-35dd-4b59-8db1-5f374f83a6d8，草稿revision11；正式v10 f4e2dc71-1fe8-406f-8c19-e1849503d698，公开OSR-2026-000022/v/10不变。
- PDF7bb96cc1-bb6f-4d3b-b0bf-352f41971faf；已批图b19a65bd-6497-4b61-bb81-0154b264d58c、plan3a6ed136-002a-4301-8505-ca14e3dbbc53保护。
- 原确认ingestion2fdb78de-b52b-40f6-832f-faa3fdd9f4e2 / agent1e324308-fd26-4cc1-8612-8a1c269909a9保护。所有新自动产物未采用/发布。
- 本机证据 C:/Users/Mac/AppData/Local/Temp/xgs-six-field-reviewed-{download,result,reading}-20260912.*、xgs-six-field-final-core-20260912.json；旧真实UI成功不证明当前浏览器长期稳定。

## Current automatic draft: NOT scientifically accepted
- ingestion840e24f9-cf9b-471f-a38c-7331705b1003，当前agent d5c6f699-c055-4bb8-a737-8f30932bf585。1bf reviewOnly显式审校当前4b46，SourceMap/旧bridge复用，保留scientific-summary v6与review critical-thinking v2 lineage。
- 1bf复用既有scientificReviewPrompt/Guard执行真实逐字段审校；不再以重新成稿+issues[]冒充review。保留原事务授权/CAS、引用边界、原schema retry；High静态复核通过。
- 实产d5c6仍失败：接受已知错误method/limitations，反而以缺其它算例为由把正确代表结果扩成三案，混淆Gaussian比较、遗漏产额条件，repro正文夹P编号。needsMoreEvidence为空不等于科学正确。
- 历史4b46/v6的单电子19as/1.9PHz代表结果正确，但method直接变换I(t)、repro把Fig3互证混向单电子、limitations泛化；479证据导航已实现但未解决质量。
- d5c6结果API只记录final usage14239in/13867out，尚未据完整Worker日志确认调用次数，不得报单call。4b46此前实际两次final，首个JSON拒绝后原一次重试。
- 证据：xgs-claim-review-result-20260913.json；服务器/jobs/hermes-claim-review-{refresh,result,ui}-20260913.json。不得再次盲跑整稿review或summary prompt补丁。

## Focused source reading and bounded editing
- 复用既有workspace.guide科学写作：服务端自动授权解析SourceMap→完整原文packet→M3写作→原文引用绑定，未安装PaperQA/新服务；借鉴其具体问题→来源证据→回答的工作方式。
- 首次043f6030-892e-4340-a097-d93bcf98d38a只返回导航：“写一篇不超过700字的中文方法核对笔记”未命中writingIntent的相邻词正则，不能算写作成功。
- 明确“科研笔记”后4bedbb4b-96a3-486b-ab1f-3b920d11816e成功，题《方法原文核对：散射光子数到频谱的运算链》，source d5c6，1246字符/15引用。独立High确认核心科学链PASS。
- 回读正确区分n(z)→n(t,θ)→I(t,θ)→角积分I(t)，以及强度+继承驱动场相位→E_y(t,θ)→角积分E_y(t)→Fourier E(ν)。末尾修正语仍漏远场/正峰同步前提；超过700字目标，不能声称全文要求全部通过。
- 五问合并的63e2acc5-8ed4-45d6-9005-f41ae1911dce再次失败：正碰与π/2自相矛盾，声称单电子未披露N_SP但其S16原文明给2.5e-8/1.7e16 W/m²，30dB仍未保留up to；“无法直接复现/未公开原始数值”等超出S103支持。原文绑定不等于科学正确，不能采用。
- 8ff290f5-9b14-4e39-9478-90dda22dc309复用editorDraft只改method，1653字符原文目标来自4bed引用；M3已改Fourier对象但遗漏I(t)支路与明确同步，不满足完整修订。保留为共编建议，不写入SDF。
- 代码根因之一：科学写作使用adaptive，而editorDraft共编原来只传temperature0.2，M3兼容默认thinking off。a8已部署，仅共编复用既有SCIENTIFIC_SYNTHESIS_OPTIONS，导航保持原选项；同时修复有长度/语言/主题修饰的明确笔记请求，保留否定/咨询/保存语义。精确diff High静态复核通过。
- a8新配置实产10799ba3-87c0-450b-971f-6f8dd9f3678f，仅method/183字符符合篇幅，但独立High判NOT ACCEPTED：删正确n(z)→时间压缩起始链，对I直接赋相位漏√I幅度，正峰同步仍不明确。只修对Fourier对象不构成合格，未采用；停止同路线模型重试。
- 普通editorDraft仍不自动加载全文；本次由既有写作任务的原文引用传入goal完成桥接。这是来源引导的共编路径，尚不是端到端自动纠错。
- 证据本机Temp：xgs-focused-method-v2-result-20260913.json、xgs-focused-case-result-20260913.json、xgs-focused-method-thinking-result-20260913.json、xgs-focused-method-edit-{submit,read}-20260913.sh；服务器/jobs/hermes-focused-*。

## Grounded writing revision: bounded quality PASS (2026-09-13)
- 用户继续要求推进质量。新取证：普通editorDraft没有自动全文/字段来源回写；旧手工请求甚至把agentTaskId放入ingestion scope（真实UI是ingestionTaskId）。不可把手工截取goal当完整来源路径。独立High建议复用已有writingDraft修订，不扩展纯文本draftChanges以免继续挂旧字段证据。
- 既有handleScientificWriting→resolveScientificWritingSource从服务端基稿绑定sourceTaskId，校验同用户/RO/workspace/artifact/hash/旧quote，加载全文SourceMap并重映射引用；无latest猜测、无新API/服务/依赖/应用代码改动，无OCR/map重跑。runtime scientific-writing v3与research-note-formatting真实复用。
- 4bed基稿→79751c95-8857-461e-b357-264d9791cadd：只要求修订末段，未给成稿；原标题/前文逐字保留，1487字符/17引用。独立复核最终结论为科学PASS，球面几何缺紧邻locator。√I省略与单电子同步不是科学错误，新增φ90°及θ积分限有原文明文支持，不能误删。
- 797→867ce8b9-1e48-4412-b1bf-1800a5d64dc9：第二个限定修订请求增强√I表述/电子或束团中心同步，收窄为有引用的远场近似；仍由服务器M3成稿，无人工正文替换。全稿1605字符/19引用，末段582字符，原标题/前文叙述逐字未变，第5步一处引用由S84改S235。独立High原文核对最终PASS，无必要修正；不将初轮过严判断写成模型科学错误。
- 867真实页面打开/只读编辑/展开来源：正文逐字等保存API，19条quote全相等，0保存按钮/0KaTeX错误（正文主要为文本符号，不代表全公式排版）。实际点击Markdown下载，13420字符含完整正文和19来源；截图阅读可用。服务器/jobs/hermes-grounded-method-{revision,final}-*及本机Temp/xgs-grounded-method-{revision,final}-20260913相关文件为证据。
- 可用路径已推进为“已有来源基稿→全文绑定→限定局部修订→独立原文核对→真实阅读/导出”，并非全自动纠错或六字段质量通过；两次有界任务的scope/目标不同，不再重试旧editorDraft路线。普通editorDraft的来源回写仍是后续边界；未采用/发布任何新内容。

## Results revision and general capability (2026-09-13)
- 代码High复核确认已部署写作/来源/引用机制无本论文硬编码，scientific-writing v3已有同算例、条件、物理量和披露范围指令；具体问题提示与独立原文复核仍由本会话承担，不是Hermes内部自动审校闭环。第二篇首稿仍科学/引用失败，来源指导修订后通过；602c6c09已接通显式来源选择，多个artifact未选择时先提示，见Hermes台账“通用能力与人工环节”。
- 63e→74d38bc8-e168-4216-b158-a82030979ecd：441字错误类别指导，无手写数值答案，服务器生成1731字符/19引用，修正垂直几何、条件性单电子产额、扫描变量、30dB上限和披露过度断言；仍保留“仅保持”及两处参数引用不全，不能直接PASS。
- 74→3f68d30b-5cab-44f9-9623-2f057aada7ff：266字最小指导，只删“仅”并补Fig.S7与扫描的参数来源；1745字符/19引用，原标题/其余正文/全部quote和locator均未变。独立High最终科学/引用PASS，无人工正文替换、无OCR重跑、未采用/发布；实际任务为两次，未宣称已核实供应商调用数。
- 3f68实际打开/只读编辑/展开来源与保存API逐字一致，Markdown实下载20620字符包含完整正文与19来源。但截图暴露通用Markdown转义缺陷：26个KaTeX式0errors仍有6处TeX间距反斜杠丢失变逗号。真实DOM annotation与保存源已确认；本轮修复显示层，稿件无需重生成。证据Temp/xgs-grounded-case-{revision,final}-*，服务器/jobs/hermes-grounded-case-*及hermes-writing-math-escapes-before-20260913.json。
- 0685已修复部署：ScientificText既有splitMath用于数学区ASCII标点保护，Hermes在非代码区域累计原文后转换；不新增解析器/依赖，60k预处理匹配既有稿件合同，渲染默认50k及全部TeX安全/数量边界不变。部署后重新打开3f68，26/26 MathML annotation逐字等保存TeX、6处间距全保留、0公式错误，截图正常；正文/19引用逐字等API，实下载20620字符与部署前完全相同。证据Temp/xgs-writing-math-escapes-{reading,export,download}-20260913.*。

## Browser recovery
- Chrome曾报ERR_INSUFFICIENT_RESOURCES；Mojo压缩解码data-pipe 14/324创建失败，根因未定。空编码override已清理。依据Stop/停止控件确认14页空闲、三锁/空队列及profile/jobs持久化后，仅在2026-09-12T18:55:50Z重启一次，登录保留；不复用旧整页关键词generatingPages判定，不再循环重启。历史诊断见server-capabilities及/jobs/hermes-browser-*-20260913b.json。
- Playwright CDP握手仍偶发超时，现有raw per-target CDP可用。current-ingestion已实读6字段/35来源等API，revision11；质量仍失败。私有92链接曾出现摘要92/正文最新63e，1e627已部署同RO合法writing优先initialTaskId；实际92正文1118字符/17引用逐字等保存API、无63e替代，user_edited保留。
- 证据Temp/xgs-explicit-writing-{reading,saved}-20260913.*、/jobs/hermes-restored-reading-20260913b.json。后续Quantization复用server tab D2790CF1E8E440EB316D387CDE119E69；浏览器长期稳定未确认，不重开第一篇已验证流程。
## Second paper and next action
- 602c6c09六文件接通严格context.writingSource.ingestionTaskId，复用现有select；base优先，所选不可用不降级；无选择按artifact分组，多原文（含未完成）先提示。High安全/合同/并发复核通过；真实UI选择cee71443准确传递。多artifact提示分支尚无真实样本观察。
- Quantization RO9067a2d5-42ad-4c06-b234-753728b71064；ingestion cee71443-ae46-4ed1-b4e4-6c5b59e674ef / source agent960ffcc1-75f6-4418-b9a6-8bf413f4e18d / artifact4b94c626-1748-4c5a-934b-2bb94585bd9c。复用15页旧SourceMap，source导出Temp/xgs-quantization-writing-source-20260913.json；无新Parser/OCR。
- eda892b4、c4f3ce06均模型前超180k失败。服务器只读量测：原source JSON353628字符，含confidence连续分组208568/1079组；08ed逐片保留confidence、仅共享kind/parser后143941/70组，2201 id/text、16部分range、53954全文及完整locator保留，180k不变。证据Temp/xgs-quantization-source-budget-confidence-20260913.json，勿重复预估或盲增limit。
- 首稿e758f33f-1cd1-42f9-b4d1-bb548acf98fb（2374字符/14引用）NOT ACCEPTED：把source IDs按脚注重排、错误基底/亚1nm设定/功率与能流式/极化率算符说法。实际UI来源指导修订链 e758→918b9ca4-6fbc-4493-aae4-a83f8372c40e→b66fc123-cd68-4982-b527-24cdf7c97626→71ed6fae-21c3-49d2-bfff-e394bf307323，均精确base/source；最后仅补S2029/S2030和去裸ID说明，原38引用/其余科学内容不变。最终71独立High科学/引用PASS，无Codex正文替换；不是自动首稿质量通过。
- 最终71《深度亚波长小孔限制光学近场的量子化：Bethe偶极到Weyl角谱》：3643字符/40引用；真实UI正文/quotes逐字等API，57/57 TeX源一致/0排版错误；截图实读可用，Markdown27609字符完整。证据Temp/xgs-quantization-writing-citation-{task,result,reading,math,tail,export,download}-20260913.*及服务器/jobs/hermes-quantization-writing-citation-*。RO实读仍private/draft/version3；sourceStatus仍grounded_with_unresolved_review，外部High结论未冒充产品自动审校状态。
- 最终私有入口：https://openscience.428312321.xyz/research-objects/9067a2d5-42ad-4c06-b234-753728b71064/edit?hermesTask=71ed6fae-21c3-49d2-bfff-e394bf307323 。第一篇92/40e/867/3f68及v10/已批图保留；采用/公开仍待用户质量确认，视频/批量暂停。
- 下一步优先把真实暴露的“来源key被脚注重排、quote不支持断言”接入既有写作/审校能力；目前结构校验只能确认ID/quote/locator真实，独立科学核对与具体修订指导仍由本会话承担。第二篇证明通用来源与修订流程可用，不能称跨论文自动科学质量稳定；不回到无来源editorDraft或整稿自省循环。
- 长综述ROaa450f1e旧任务因163815字符超过120k理解上限模型前失败，24页完整SourceMap已定位：derived/source-maps/1bdef65fc775a9b89e71ca81fb71988c9cbaa07f71209ea3ecc581406a4222c0.json（4,661,218 bytes）。ref未挂失败任务、无普通retry；后续复用既有解析收敛续跑路线，未实现新恢复能力，勿重解析或只增limit。
- 继续前读此handoff、需求基线相关章节、server-capabilities；GitHub方法及真实调用对照见Hermes台账。当前版本看Git/服务器，不恢复旧MVP next action。