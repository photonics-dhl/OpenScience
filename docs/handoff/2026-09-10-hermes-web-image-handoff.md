# Hermes / Workbench CURRENT Handoff

## Goal and constraints
- 用户要求复用现有及GitHub成熟能力，实际核对科学质量，不以部署或模型success结案。当前第一篇真实论文未完成自动科学质量，视频/批量暂停。
- 生产使用MiniMax-M3；服务器自动稿、引导共编、人工校正须分别标记。私有92审校稿已通过独立原文复核，仍待用户采用/发布确认。
- 本机仅编辑/静态阅读/传输；无测试、预检、CI或本机构建。必要服务器build/start与实际产品生成/阅读按授权执行。

## Version and workspace
- 交付树 E:/Miscellaneous/XGS/.worktrees/onchip-video-release，branch codex/onchip-video-release；代码提交1e6271776a9ef5a542c3e0f4b50d2188ef808c67已推送并部署，独立High复核通过；后续docs-only HEAD不是新release。
- 当前应用release 1e6271776a9ef5a542c3e0f4b50d2188ef808c67 / rollback a8ce22dddfef85c487ff4ed4dcd44e0da4f4c03a；xgs-explicit-writing-deploy-20260913.log exit0，必要服务器build/start完成，实际页面/__release200同SHA。1bf/479转历史。
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
- 可用路径已推进为“已有来源基稿→全文绑定→限定局部修订→独立原文核对→真实阅读/导出”，并非全自动纠错或六字段质量通过；两次有界任务的scope/目标不同，不再重试旧editorDraft路线。普通editorDraft与多PDF初次写作latest fallback仍是后续边界；未采用/发布任何新内容。

## Browser recovery
- v6新页12个JS ERR_INSUFFICIENT_RESOURCES，一次重载后空白；1bf单个替代#claim-review页仍13个CSS/JS失败，只显示壳。未循环重载。
- 只读诊断定位Chrome压缩内容解码的Mojo data-pipe创建失败：Network.ContentDecodingInterceptor.CreateDataPipeSuccess.URLLoaderThrottle计324中14失败。PID/内存/fd/socket/shared memory/disk余量未触限，无OOM/crash；底层分配失败原因仍未知。
- 单target空编码实际reload已发生：31个200、0资源不足，但7个gzip/zstd脚本仍压缩而被当明文解析，SyntaxError阻止挂载；override已清理。两次调用中首次同URLnavigate无load，不算完整重载。证据/jobs/hermes-claim-review-{recovery,reload-recovery}-20260913.json。
- 旧generatingPages=1来自整页历史文本关键词，并非实际生成控件，不能作为活动证据。复用review-runner既有Stop/停止控件判断后，14页stop/composer/dirty均0；三锁持有、队列空、profile/jobs持久化核对后，2026-09-12T18:55:50Z仅重启浏览器一次，exit0/CDP恢复且登录保留。证据/jobs/hermes-browser-{actual-state,pre-restart-actual,restart-container}-20260913b.json。
- 实际current-ingestion阅读成功：6字段与保存API逐字相等、35条来源全部显示、RO revision11。科学失败结论不变。证据/jobs/hermes-restored-reading-20260913b.json及hermes-restored-ingestion-reading-20260913b.png。
- 后续Playwright CDP握手仍超时，现成raw target-CDP可用。仅重载私有92页后发现摘要为92而正文为较新的失败63e；恢复逻辑忽略initialTaskId、按时间选最新writing，1e627已部署为同RO合法writing中优先指定任务，无指定writing则原latest回退。
- 1e627实际打开92、切编辑只读正文、完成后展开来源并截图：1118字符/17引用，正文与全部引用逐字等保存API及此前独立复核稿，user_edited保留、0保存按钮/0排版错误、无63e卡片；未修改或采用内容。证据本机Temp/xgs-explicit-writing-{reading,saved}-20260913.*、服务器/jobs/hermes-explicit-writing-*。截图阅读正常；浏览器底层分配根因及长期稳定性仍未知。

## Next and read-first
- 867方法笔记已完成服务器来源修订、独立科学/引用核对及真实UI/下载，92六字段人工审校稿仍保留；后续局部修订优先复用已验证writingDraft来源路径，不能回到无来源editorDraft盲改或整稿重生成。
- 私有方法稿入口：同RO edit?hermesTask=867ce8b9-1e48-4412-b1bf-1800a5d64dc9；92精华稿供最终采用审阅。采用到研究正文及公开发布待用户质量确认，视频/批量暂停；六字段全自动科学质量与浏览器长期稳定性仍未解决。
- GitHub源文件/真实调用对照见hermes-capability-registry“来源与选择”；用户复用优先已入AGENTS/Memory。优先单个争议回读与最小改动，不能宣称M3全自动文献凝练已可靠。
- 继续前读此handoff、需求基线相关章节、server-capabilities；当前版本看Git/服务器，不恢复旧MVP next action。
