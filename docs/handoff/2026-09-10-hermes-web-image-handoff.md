# Hermes / Workbench CURRENT Handoff

## Goal and constraints
- 用户要求继续落实并实际校验质量，不能部署即结束。当前先完成真实论文私有笔记/六字段与原文、实际页面核对；视频/批量冷启动暂停，不自动采用或发布。
- 生产MiniMax-M3，Chat6Pro仅开发讨论。已授权当前研究私稿与必要原文处理；不得将Codex人工修稿伪称服务器自动能力。
- 本机仅编辑/静态阅读/传输；无测试/预检/CI/本机构建。必要服务器build/start与真实产品操作按授权执行。

## Version and workspace
- 交付树 E:/Miscellaneous/XGS/.worktrees/onchip-video-release，branch codex/onchip-video-release；HEAD以Git为准，未合并main。根目录旧dirty main不作生产基线。
- 当前应用0fc5b7d91de5b57b6147d0bf8b8a84865a805c1a / rollbackc1e694e44eece4c3368ffaf45055aaab3f447f78；服务器build/start exit0，xgs-final-quality-deploy-20260912.log。
- 网页生图provider d1630135d569d28364d295380bb4e0333c3ee264 / rollback92cc416ee3fe921f62c75cbe6f69e48d0b55227d；video runner0df87c9bee98c2280396551ed522e66230eaf381，未产新视频。
- TTS镜像a2158409、renderer ff6042f6；现有模型/容器复用，不新增服务/依赖安装。独立媒体版本不可混作应用release。
- unrelated dirty docs/specs/2026-09-05-integrated-research-product-design.md不得覆盖/提交。

## Actual private note: source-reviewed, user edited
- 私有笔记40e23948-4b41-4440-a3a1-49dd9acb8824，《深亚周期光脉冲：机制与适用条件》；2696字符/41引用/57式。M3生成修订后仍有错误，最终真实UI四处人工校正，保持user_edited；独立原文复核通过，不证明自动初稿可靠。
- 已真实保存/重载/展开引用/Markdown下载；57式0排版错误、原5处微小横滚动经padding2px修复。旧sourceTask a1c0da49经过ingestion refresh仍可引用。
- 私有入口：https://openscience.428312321.xyz/research-objects/c896802c-35dd-4b59-8db1-5f374f83a6d8/edit?hermesTask=40e23948-4b41-4440-a3a1-49dd9acb8824
- 本机真实下载 C:/Users/Mac/AppData/Local/Temp/xgs-hermes-note-20260912.md；完整结果xgs-writing-quality-corrected-result-20260912.json；服务器/jobs/hermes-writing-quality-corrected-*。

## Current six-field proposal: NOT scientifically accepted
- ingestion840e24f9-cf9b-471f-a38c-7331705b1003，当前agentd6808a4c-a96e-4f69-aa3e-3f665792420a。显式current b6 + base4099仅续成稿成功；0OCR/map/bridge，sourceMapReused true，stage responseHash与4099完全相同，单次final in13105/out11564/81061ms/stop，scientific-summary v4。
- 当前四处科学阻断：method把perpendicular/φπ/2写成正碰；repro截面10^-29抄成10^-2；THz产额只留5%漏1.4mJ/0.4THz/1ps输入；TE0-like删去like。原绑定段落清楚，均为模型误读/转录/压缩，不是召回缺失。
- 4.4μm蓝宝石CNP原文明确由六棱柱对组成，不是几何错误；99as结果/该算例经典模型互证有依据，不误套旧reduction疑点。
- 实际UI已ready、首次无JS失败，6栏逐字匹配本轮API结果，旧saved core遮蔽已修；RO仍version11，未确认。但sourceMapIdentity缺失，6栏quote0。
- 引文根因纠正：existing shared canonical envelope是64段/24000字符（816d33a8、56f5c1ea），0fc final guard正确执行了shared值；agent projection/web仍旧32/8000，skill也误写旧值。不是guard跳过。d680 method14089/repro12273合规于shared，API已下发raw segments；只被旧consumer隐藏identity/UI，不能继续称已恢复8000门禁。
- d680 insight还有2个同block有序不重叠片段，domain已允许而web旧seen blockId拒绝，必须同步consumer算法。
- 本机证据 C:/Users/Mac/AppData/Local/Temp/xgs-final-quality-result-20260912.json；服务器/jobs/hermes-final-quality-{result,ui}-20260912.json/png；读取脚本与完整deploy日志在同Temp目录。

## Deployed and candidate
- 0fc已部署global P并集成稿（不按上游字段分类限引用）、两条final的shared预算/定位guard和既有一次schema retry；没有新model calls。final保持65536/adaptive/300s，不扩其他阶段。
- 0fc已部署真实proposal/sourceCore分离、agentTaskId草稿隔离、只保护实际未保存编辑；confirm必传sourceAgentTaskId并在Serializable/CAS核对，旧代409保留草稿并三方合并，确认/reconcile同步server refs。High静态复核通过；实际默认展示已观察，未人为触发确认/竞态测试。
- 当前候选：API projection与web使用既有64/24000共享常量；纯domain subpath避免Node依赖入浏览器；web接受same-block合法ordered ranges并计段间换行，身份/页码/定位/原quote约束保持。不是新增上限或扩大原文访问权限。
- 当前候选v5：自然语言method不抄常数/式链，核准几何方向与like/近似限定；results只一个条件完整算例；limitations不另罗列别案产额；repro只披露输入/求解方法/实现缺口。通用写作规则无论文常数硬编码，待真实再成稿判质量。
- Docling/M3/公式/多格式上传与写作已部署；26页32原式28可排版、4解析损坏。未声称全篇公式物理通过；真实多格式样本兼容仍未观察。
- 首次加载过去偶发7–8 JS ERR_INSUFFICIENT_RESOURCES，后刷新200；资源1.7/4GiB、454/1024pids、shm56%、OOM0，尚无精确根因。最新UI无该错误不能称长期稳定。

## Protected content and next
- RO c896802c-35dd-4b59-8db1-5f374f83a6d8；正式v10 f4e2dc71-1fe8-406f-8c19-e1849503d698；公开OSR-2026-000022/v/10；草稿修订11。原确认ingestion2fdb78de-b52b-40f6-832f-faa3fdd9f4e2 / agent1e324308-fd26-4cc1-8612-8a1c269909a9保护。
- PDF7bb96cc1-bb6f-4d3b-b0bf-352f41971faf；已批图b19a65bd-6497-4b61-bb81-0154b264d58c、plan3a6ed136-002a-4301-8505-ca14e3dbbc53保护。旧数据只按原范围可恢复归档，原件/公开ID保留。
- 下一步：High复核候选后部署，再以current d680 + compositionSourceAgentTaskId=4099a967-a918-4b36-92b0-06edede4d552显式仅续final；准备新receipt名，禁止误复用旧已提交脚本。核新六字段科学内容与真实每栏quote显示，再如实报告质量。
- 历史：d5cad55d默认refresh实际13OCR+4map后失败，不是final-only；c1新增显式current/base请求后b6与d680均证明0OCR/map/bridge复用。0a9555bc成功stage曾因final32768thinking-only截断；4099后仅提高final并成功保留stage。不要重跑parser/bridge，不改旧task状态/来源。