# Hermes / Workbench CURRENT Handoff

## Goal and constraints
- 用户要求继续落实并实际校验质量，不能部署即结束。本轮真实论文六字段私有审校稿已保存并核读；自动初稿科学质量仍未通过。视频/批量冷启动暂停，不自动采用或发布。
- 生产MiniMax-M3，Chat6Pro仅开发讨论。服务器自动稿、服务器共编、人工校正必须区分；已授权当前研究私稿与必要原文处理。
- 本机仅编辑/静态阅读/传输；无测试/预检/CI/本机构建。必要服务器build/start与真实产品操作按授权执行。

## Version and workspace
- 交付树 E:/Miscellaneous/XGS/.worktrees/onchip-video-release，branch codex/onchip-video-release；应用代码HEAD 479cdfa8e7d83e23f951b26c3b6d267e0fed419a，后续docs-only HEAD以git log为准，不是新部署。未合并main，根目录旧dirty main不是生产基线。
- 当前应用release 479cdfa8e7d83e23f951b26c3b6d267e0fed419a / rollback 9f889d2619290b378d735cb09304ccf640068120；服务器build/start exit0，xgs-evidence-navigation-deploy-20260913.log。
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
- ingestion840e24f9-cf9b-471f-a38c-7331705b1003，当前agent4b46aada-39ff-4282-8a98-864c4928e704，scientific-summary v6。以current097 + base4099a967-a918-4b36-92b0-06edede4d552显式仅续final；SourceMap复用且旧bridge responseHash相同，0OCR/map/bridge。
- 真实Worker日志为两次final：第1次in13732/out6041/61057ms/stop但JSON解析拒绝；既有一次重试in13910/out2738/20270ms/stop成功。结果API只记录最后一次，不能报成单call。旧bridge usage12858是复用元数据，不是本轮生成。
- 原文独立High复核：仍NOT ACCEPTED。method从I(t)直接写傅里叶，漏相位→E_y(t,θ)→角积分E_y(t)；repro“同参数”把Fig.3的99as/2.6PHz互证混向所选1.8μm单电子19as/1.9PHz；limitations把Fig.3扫描权衡泛化，耦合效率句无本字段绑定引用。
- 改善已观察：problem去掉无条件ICS半周期断言；insight去掉错误材料共振推论；单电子CdS参数/19as/ζ27/1.9PHz同案相符。较小问题仍有“约30dB”应为最高可达、“同条件Gaussian”应限定相同电子和波长。
- 新稿未采用、未人工覆盖；私有92审校稿保持原样。原文p5/17/19/20支持相位电场链，p23明确Fig.3互证，p6–7支持局部扫描。不能把新稿success/review_received或引用定位合规当科学通过。
- 本机xgs-evidence-navigation-result-20260913.json、xgs-evidence-navigation-deploy-20260913.log；服务器/jobs/hermes-evidence-navigation-{refresh,result,ui,ui-reloaded,ui-observed}-20260913.json。097/v5与d680/v4转历史，失败证据保留。

## Deployed code and observed product behavior
- 0fc：global P并集成稿，不按上游字段分类限制引用；两条final按既有shared预算/定位验证并使用原一次schema retry。final保持65536/adaptive/300s，不扩其他阶段。
- 0fc：真实proposal/sourceCore分离、agentTaskId草稿隔离、只保护实际未保存编辑；确认必传sourceAgentTaskId且Serializable/CAS核对，旧代409保留草稿并三方合并，确认/reconcile同步server refs。High静态复核通过；默认显示已实观，未人为触发确认/竞态检查。
- 9f：API projection/web统一既有64段/24000字符常量，纯domain subpath避免Node依赖入浏览器；接受same-block有序非重叠范围并计算换行，保留身份/页码/定位/原quote限制。High最终复核通过。
- 根因纠正：shared envelope本来就是64/24000，0fc guard没有跳过；旧API/web硬编码32/8000隐藏identity/引文。d680在9f不重跑模型即恢复引文3/2/10/7/6/9，097新稿引文也全显示。这不是新增上限或扩大来源访问。
- v5通用写作约束已部署：自然语言method、代表算例条件完整、保留几何/like限定、边界不另列其他产额；实际科学缺口见上，不能把prompt修改等同质量解决。
- Docling/M3/公式/多格式上传已部署；26页32原式28可排版、4解析损坏，未声称全篇公式物理通过或真实多格式样本均兼容。

## Browser limitation and protected content
- v6新标签页首次12个JS ERR_INSUFFICIENT_RESOURCES；同页只重载一次后正文空白，稍后仅被动读取仍空白。因此本轮未观察到新六字段UI/来源成功展示，API读取结果成功。原9f的正常显示证据不得代替本轮。
- 2026-09-13静态运行采样：pids510/1024、内存2131218432/4294967296 bytes，28个Chrome/Node进程、506线程，最大257个fd且上限未触及；未定位资源错误根因，未重启/改登录态/关其他标签页，不再循环重载。
- 原92私稿在9f新阅读页真实保存/展开来源/下载一致；不能因旧页曾成功声称当前浏览器长期稳定。
- RO c896802c-35dd-4b59-8db1-5f374f83a6d8；正式v10 f4e2dc71-1fe8-406f-8c19-e1849503d698；公开OSR-2026-000022/v/10；草稿修订11。原确认ingestion2fdb78de-b52b-40f6-832f-faa3fdd9f4e2 / agent1e324308-fd26-4cc1-8612-8a1c269909a9保护。
- PDF7bb96cc1-bb6f-4d3b-b0bf-352f41971faf；已批图b19a65bd-6497-4b61-bb81-0154b264d58c、plan3a6ed136-002a-4301-8505-ca14e3dbbc53保护。旧数据只按原范围可恢复归档，原件/公开ID保留。

## Next and read-first
- 用户要求优先复用现有及GitHub成熟Skill，已记入AGENTS/Memory；PaperQA/K-Dense/claude-scholar源文件与实际调用对照在能力台账“来源与选择”，未安装第三方能力。
- 479已落实上轮High建议：复用15个现有语义证据分组，只传G键/支撑P/限定P，不传旧语义断言；原P全局可跨组/跨字段引用。High代码复核通过，实际v6仍未解决科学一致性，不能再把此方案标待实现或已完成质量。
- 按重复失败停止规则，暂停同一路径提示词补丁/模型重生成。下一步需让现有服务器来源审校对最终主张作有证据的局部修订并保留处理结果，而非仅格式/定位验证；在具体方案收敛前不再盲跑。浏览器真实阅读恢复也是未完成项。
- 交给用户审阅已保存私有92稿；采用/发布仍须用户确认，视频/批量暂停。继续前读本handoff、需求基线与server-capabilities；当前版本看Git/服务器，勿恢复旧next action。
- 历史：d5默认refresh实际13OCR+4map失败；c1后b6/d680/097/4b46显式复用已实证。旧stage/receipt不可修改或重复提交，任何新任务必须新receipt及匹配current/base。
