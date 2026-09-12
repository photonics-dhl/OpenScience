# Hermes / Workbench CURRENT Handoff

## 任务与授权
- 用户最新要求“请继续落实并实际校验质量，而不是部署即算任务结束”。继续当前论文私有科研笔记、语义结果保留/续final及真实产物核对；不再等待旧类型/续跑问题。
- 生产MiniMax-M3，Chat6Pro仅开发讨论。已授权当前研究私稿/必要原文处理；普通问答不自动写稿，不自动采用或发布。
- 本机仅编辑、静态阅读、传输；不测试/预检/CI/本机构建。必要服务器build/start及真实产品操作按授权进行。

## 版本与工作区
- 交付树 E:/Miscellaneous/XGS/.worktrees/onchip-video-release，branch codex/onchip-video-release；HEAD以Git为准，未合并main。根目录main很旧且有其他改动，不作为生产基线。
- 当前应用236dfdb88c101c0a4e476e2ea597fe7026d6e8c5 / rollbackf2a533836f8ab949d6b9b07731b8cc867e13d490；必要build/start exit0，日志xgs-final-reasoning-deploy-20260912.log。
- 干净发布树 E:/Miscellaneous/XGS/.worktrees/deploy-m3-thinking。提交/push使用[skip ci]，不触发测试。
- 网页生图provider d1630135d569d28364d295380bb4e0333c3ee264 / rollback92cc416e；浏览器/会话/出网路线未改。
- video runner仍0df87c9bee98c2280396551ed522e66230eaf381；原TTS a2158409、renderer ff6042f6、模型qwen3-tts-customvoice-0c0e305复用，中文入口保持。旧service在/opt/openscience-video/service-before-0df87c9bee98c2280396551ed522e66230eaf381。

## 已实际完成的私有笔记
- 当前稿40e23948-4b41-4440-a3a1-49dd9acb8824：《深亚周期光脉冲：机制与适用条件》，2696字符、41条程序绑定原文引用，sourceStatus=user_edited。
- 链路：37ba18af首次schema失败 → ee842ec4实产 → 5cba07a6服务器按科学审阅意见修订 → cd80a9f3在真实UI改标题并保存 → 40e23948在UI做4处来源约束局部校正并保存。后两次保存无模型，不冒充自动科学通过。
- ee842ec4读100563/100563字符、306摘录、0遗漏；M3 38437输入+5257输出/43852ms。旧48k packet只113摘录且漏193段，已修为120k全文范围、180k含metadata请求上限。
- ee842ec4独立对原文发现6项问题：垂直碰撞写正碰、理论性质不明、中心/边缘阈值误比、角分辨/整体未分、相位式错引与同步假设遗漏、THz光子数假设不紧邻。
- 5cba07a6由M3修订：44979输入+9317输出/125306ms，2725字符/43引用。仍有首句作者列表错引、“自编”无依据、中心/边缘阈值夸大和频率式引文损坏；最终UI局部校正这些问题，保留真实编辑稿身份。
- 实际重载/打开/编辑/保存/来源展开/Markdown下载完成；57处KaTeX、0渲染错误，下载正文与保存稿一致，旧sourceTask a1c0da49经过论文refresh后仍可引用。发布后首次加载多次停留，最新捕获7个JS的ERR_INSUFFICIENT_RESOURCES；再次刷新后JS/API全200。浏览器1.7/4GiB、454/1024pids、shm56%、OOM0，未证实具体资源根因，不宣称长期稳定。
- 私有入口：https://openscience.428312321.xyz/research-objects/c896802c-35dd-4b59-8db1-5f374f83a6d8/edit?hermesTask=40e23948-4b41-4440-a3a1-49dd9acb8824
- 证据在服务器浏览器/jobs/hermes-writing-quality-corrected-{result,ui}-20260912.json、同前缀reading/sources PNG及Markdown；本机副本C:/Users/Mac/AppData/Local/Temp/xgs-writing-quality-corrected-result-20260912.json及reading PNG。

## 六字段仍未通过
- 未确认ingestion840e24f9-cf9b-471f-a38c-7331705b1003，当前agent4099a967-a918-4b36-92b0-06edede4d552。实际复用0a9555bc的成功bridge（stage报告in32/out12858/93822ms），仅一次final in16282/out10724/104012ms/stop；六字段已产出，未采用。
- 4099a967结构通过但独立原文复核否决：THz光子数漏1.4mJ/5%邻接条件；Fig3边缘阈值混入THz；5pC→270/1nC→2.3e6伪单变量关系；FigS7公式25/27归属错误、补专名/过度复现声称。method抄式且漏同步假设。不得称科学通过。
- a1c0da49此前bridge曾成功42191tokens/124574ms，但final主接口空正文、备用HTTP401；旧结果只存元数据，成功bridge正文不可恢复。旧final真实usage未知，不能记0或由耗时推断。
- bff63acb的成功semanticStage保留与原source身份/schema复验，现已在4099a967实际确认复用；不要重跑bridge。0a9555bc旧final曾in16287/out32768/108584ms/length/text0/thinking1，236dfdb8仅final提高至65536，仍adaptive/300s，不扩共享预算。
- f2a53383已部署Gateway可选includeRejectedResponseOnRetry，只有source_bridge开启；原输入+assistant拒绝候选+修复说明进入既有一次retry，同guard/maxTokens，不截断/强转，不增加调用/存储/正文日志。High静态review通过，最新bridge第一call成功，未走修复retry。

## 已部署/剩余能力
- 写作v3、来源origin（含llm_ocr_candidate）、程序派生引用、旧稿编号回映、论文refresh后旧稿来源恢复已部署。GET单task漏researchObjectId导致稿件隐藏已修，并在真实页面观察到稿件。
- Docling CPU1.30/CodeFormulaV2、TeX来源、安全KaTeX已生产；26页32式中28可排版、4损坏。两个代表式对原页，不声称全文公式物理已验证。
- paper-analysis v8/scientific-summary v2已部署；当前v3候选final只接收各字段P并集和原始P，移除上游候选文字/公式/主张分组/自由文本chosenCase；保留同字段guard和全部召回原文，重新选条件完整算例，无论文专用硬编码。High设计复核认可。
- XLSX/PPTX/HTML上传已接入，真实多样样本兼容未观察；统一创建/首条Hermes、常驻输入和阅读布局已上线。
- 媒体艺术/构图/叙事旁白与locale/style已部署0df87c9b；无新媒体实产，视频/批量冷启动仍暂缓。代码/部署不等于质量确认。
- ScientificText下标末端padding2px已随236dfdb8部署；实际稿件57式中原5处小滚动条均消失，dialog900/viewport1151。KaTeX负margin根因已定位，长式滚动边界保留。

## 保护内容与下一步
- RO c896802c-35dd-4b59-8db1-5f374f83a6d8；正式v10 f4e2dc71-1fe8-406f-8c19-e1849503d698，草稿修订11；公开OSR-2026-000022/v/10。原确认稿/公开版未写入。
- PDF 7bb96cc1-bb6f-4d3b-b0bf-352f41971faf；已批图b19a65bd-6497-4b61-bb81-0154b264d58c、plan3a6ed136-002a-4301-8505-ca14e3dbbc53。
- 原确认ingestion2fdb78de-b52b-40f6-832f-faa3fdd9f4e2 / agent1e324308-fd26-4cc1-8612-8a1c269909a9保护。旧19/20/21仅按既有范围可恢复归档，原文件/公开ID保留。
- 下一步：发布source-only final候选，复用当前成功stage再生成一份实际六字段并独立核读；保持笔记真实编辑稿身份，不以已有保存/部署结束整个自动质量任务。
