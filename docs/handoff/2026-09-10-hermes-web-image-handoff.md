# Hermes / 论文视觉叙事 CURRENT
> 唯一交付树 `.worktrees/onchip-video-release`，分支 `release/onchip-production-line`；根 main 只导航。Git、CI、真实运行和用户最新决定优先。
> 导航/服务对象先前已独立发布，见 [服务对象 CURRENT](2026-10-09-researchers-services-handoff.md)；本页总控维护后续生图、视频与UI统一交付，按下方精确CI和串行流程排程。历史导航会话的仅分支整合状态不改变未完成目标。

## 目标与边界
- 依据[开发规格](../OpenScience_Kimi_Development_Spec.md)：真实 NousResearch Hermes Agent 理解全文、提炼六维/Claims/Evidence，再规划视觉叙事并交 Synclip；论文是事实来源，不做额外同行评议，不以 Codex 手稿替代自动科学能力。
- 10-09用户明确纠正过度复杂化并同意继续：复用已有理解→按需回读关键原文/图页→简洁分镜、风格与提示词→出图→核对实际图片。只修涉及画面含义/定义和工具阻力，不再把UI收尾算作生图进度。
- UI human已选“默认头像，点击展开”（原回复`01a11f96-9a15-7fb0-a144-e771eb3859e0`已核）；10-09在总控追加“头像稍微大一点、像框里的小精灵保持互动”。root先按56→64px落实，框内复用Live2D眨眼/呼吸/轻微动作及指针反馈，遵循原reduced-motion，不降为静态图；点击开对话，全身仅在助手区，Landing无角色。旧360常驻/宽屏常开已替代；原patrol证据保留，验收随新路径更新，不再堆旧呈现诊断或容差。
- 2–3篇真实论文的凝练、用户确认、配图与公开展示仍是目标；三篇整体验收、普通用户旅程、完整视频、整站审美均未完成。单图认可、单测、CI或部署不代替质量认可，不批量冷启动。
- 图片已验证gpt-image-2；新图片/视频按既有Synclip授权、视频目标LTX。旧gpt-image-2.5无receipt那次仍UNCERTAIN，不盲重试/自动换供应商。原生独立像素核验未通用验收，现Worker→Gateway单次vision不冒称Nous审阅loop。
- 保留原PDF/SourceMap、认可图片、公开标识、sealed记录、原失败/费用/receipt/oncekey。日常结果私有，公开沿原确认流程；主Gateway/Native M3不全局切换，未知paid/started CP不重放，不因idle扩预算/安装/重启。

## 总控与并行分工
- 总控`01a1197c-7a1e-7631-b1c1-2d09b587be9a`负责集成、CI、CURRENT/progress/index和串行发布；openscience ACTIVE。idle不等于完成，不用重复检查填充工作；已交付且被真实依赖阻塞时明确下一位owner。
| Session / ID | 当前责任与依赖 | 工作树 / branch |
|---|---|---|
| 生图系统开发 / `01a0e831-be19-7813-8379-58313178ff26` | cb完整context50,204字/25来源含s24、6Skill/page3已实际消费，无截断证据；科学错绑未修，不猜叠提示。offline_native_loop.py新增80行真实SDK离线图片工具loop候选及原393venv隔离producer等待窄High，尚未执行/付费 | 原illustration-chain-repair树 / `codex/native-illustration-source-repair`@59a；原2cd/870/SDK/Fig2/CP证据全保留 |
| 视频系统开发 / `01a0e851-4d6c-7221-9559-b8c56a3413fe` | 独立host59a已实际安装并保持接单关闭；唯一真实目录GET成功77音色/8语言/16中文。已交owner消费目录及原human声音偏好、明确合法下一任务/预算缺口；不默认选声/改audio/admin/timer或发新模型 | 原synclip-video-delivery树；host-59a操作包与root实际安装/目录回执全保留 |
| UI优化 / `01a0f118-e09d-7671-af09-0592d6062a6c` | 59a实际编辑布局/64px/焦点及开闭已观察，但1536×681空会话slot约11.69而stage90导致只露帽沿。立即授Stage/Drawer/companion.css及原workspace spec最小修复写权，原Controller/Portal/API/资产不动；先同尺寸RED | `.worktrees/research-product-craft`，从59a另分支修复；原af/生产截图/精确geometry保留 |
- root独占生产排程；human直接确认1961/ead6/2ef0三项非target回收与1614采用属于其手动操作，原样保留、无restore。Fig2五项、59a应用发布及之后单独host升级均已完成，生产写窗口全关；生图仅获准一次已审SDK离线运输验证，UI修短窗口，视频不开放生成。

## Git / CI / 运行事实
- canonical=`release/onchip-production-line`；已推已发布`59a23906cec85092a6100a7a281a24079136cf4d`。UI348c/10f、installer029b、focus f868及workspace spec dbc7全等集入，原High GO；后续docs提交不冒称运行版。正常推frontend/nanqing，[PR113](https://github.com/photonics-dhl/OpenScience/pull/113)打开，不合main/强推。
- 59a精确五CI全SUCCESS：media PR38034914193/push38034911405、video PR38034914188、journals PR38034914218/push38034911402；原dashboard32/32、workspace25/25，原focus/同canvas/scroll/disabled→editable断言保留。root原59a-ci-final.json与两browser日志保留，未重复未变测试。
- 16:16:20–16:22:47 CST普通应用发布exit0，无refresh-native；公开精确release、retention prepare/complete及journal clear成功。16:23:02 fresh active59a/rollback393，API a192ab23/Web e40b3510/Worker2ca49952 healthy/restart0/source59a，无journal/failed/pending/FD9；Native runtime/catalogue/unit仍393、timer enabled/active、无实例，主M3保持。应用构建/运行成功不代替实际科学质量。
- 发布前16:14 formal work只读safe=true/nativePending=false/nativeBoundPending=false，pending/running/queue/processing/journal非终态/lease全0，历史3unknown hold原样保留。五项回收之后新双库`/var/backups/openscience/db-set-20261010T081534Z-4063098`已核163698832/14257855B、checksum0、0700/0600、旧集合保留；root原app-59a-readiness/deploy-app-59a/backup-before-app-59a收据保留。下列393及更早发布/CI均为历史证据。
- 16:56:34–51 CST独立Synclip host59a同FD9安装/postverify exit0：timer先hold，service自然idle，紧邻安装正式work/queue/outbox上界/journal/9状态active video run均0，3历史unknown精确身份/状态/updatedAt全等。actual source59a/7模块含audio/原config与previous逐字相同；adminfalse/audioabsent、timer inactive/disabled、readyabsent、旧42bundle/held snapshot保留。16:59:05–07仅一次受保护uid0/gid1000目录GET成功77项，stderr0、生成0；root synclip-host59-install与synclip-voices-59a收据保留，不据目录成功宣称LTX权限/余额/声音或成片质量。
- 393五CI全SUCCESS：media PR38025073327/push38025070870、video38025073354、journals38025073326/push38025070875。Linux main114134084085/114134076089的deploy+manifest+retention合组306/306、0skip，新增retention87含Native prepare/abort/legacy/malformed/权限/FD9；主browser34/34、八entry job均过。原完整393-media-main-{pr,push}.log在root tmp。旧4acd Host37/图审54/Worker642未变证据复用，不叠加重叠数量。
- 13:03:21–13:11:15 CST正式393部署exit0：Native/application配对、公开精确release验收、retention prepare、journal clear与complete全通过，迁移无pending。13:13:05只读active=`393202f7c863e9d87011049668594bcb0f8c1dfb`、rollback=`a6f068a5ebefdab3427e8f01d110ca440fa9f97d`，Native runtime/catalogue/unit同393；API af63ece1/Web ef00cbc8/Worker459a5887均healthy/restart0/source393，无journal/failed/pending、Native实例或FD9 owner，M3保持。13:45 Fig2前后marker/Worker仍稳定。
- 原审393 one-shot执行safe=true/nativePending=false/nativeBoundPending=false，执行标记保留不可重跑；新双库`/var/backups/openscience/db-set-20261010T050021Z-3432378`两dump163693443/14257855B、checksum0、0700/0600已核，旧集合保留。首次只读backup verifier因本机ISO转DateTime失败，未重做backup；Node保留ISO后成功，原错误/纠正保留。
- 本轮原回执：root `tmp/session-coordination-20261008/deploy-native-393{.log,-command.json}`、`native-393-postdeploy-readonly.json`、`backup-before-native-393*`；video原tmp/synclip-host-readonly/prepublish-work-393记录one-shot。标准seed/注册随发布执行；该发布期间模型/paid/科研资产写0；后续Fig2写入另见下方，不把标准发布称全DB零写。
- Chrome真实首页→OSR-2026-000024/v/2已显示正文/六维/认可首图7eb1；个人中心→研究入口与网站设置沿可见导航可读，正常DHL会话、Preferences先于账户。余额实际显示剩余0 AI credit/月500，仅UI usage快照，不是供应商资格拒绝或完整计费对账，不扩预算。已部署与整体艺术/真实自动科研质量分别判断。
- 生图13:23在实际393 venv导入hermes-agent0.10.0/AIAgent薄适配，核三工具注册/schema/selected方法/SkillScope并运行合成metadata handler；未实例化或跑run_conversation，无真实PNG/Provider。正式路径runNativeImageReviewTask→Host→broker/task unit→SDK；需合法新任务及原预算才可验收真实像素，旧unknown不得重放。
- 历史13:20–13:22 host42fe只读无list-voices/client；旧安装器与正式0775/0664 archive不兼容，后以root:root/原manifest及broker metadata闭合，private/dist/rollback不放宽。该旧阻点已由上方16:56实际升级解决；主应用开关、音色目录访问与LTX实际生成分开判断。
- 历史4acd在retention旧schema处失败，12:19正常自动回退结束；由990e6e85复用validateNativeJournalState及393原workflow五行补丁闭合，原High GO。更早d8 Compose/权限误用及专用恢复已结束。原事故/备份/paid证据保留，长记录见Git393本页及原tmp，禁止重跑旧恢复/reader。51e4 superseded media已cancelled、其余三CI成功，不作393证明。

- 4f4d3cf六CI终态四SUCCESS/两mediaFAIL：video38032804874/38032802974、journal38032804864/38032802991成功；media PR38032804955/push38032803015的main均成功，dashboard各focus一败、workspace各running两败。PR实际installer40/40零skip含gid负控；原完整4f4d日志在root tmp。对应新两file已由原High GO，workspace同路径2/2、focus仅scoped lint/语法0（非WebTC/browser）；原焦点/同canvas/scroll/timeout断言全保，最终组合依实际CI。

## 当前交付与明确下一步
- 图审a780/3a2→d9cc/f016及a6fa消费者、High paired query ea9组合dca5已全等收为7cd343；原Domain40/Gateway27/Worker39/video26/query24不相加。Linux Host六例与393 installed-SDK有限消费已核；实际Agent构造/循环、真实PNG和通用质量仍未验收，原paid/unknown拒绝保持。
- UI5b009/6ebb/a917及Settings eaf→32b27随393上线，正常设置入口已观察；0a/af/f868随59a发布。实际reload→个人中心→RO9067编辑，正文1000px/单列无空侧栏，64px/键盘focus→Enter开→close回焦/输入可达；1536×681真实短窗口角色被裁切，root已看原JPG，明确FAIL并派最小修复。独立hover工具不支持，未冒称通过；原32/25 CI及双尺寸fixture复用，不能覆盖这处新视觉缺口。
- 生图f992/da9→bffbe1f8/2c37f0ae：scientific-comparison仅9行fresh完整有界括号比较，复用原parser，legacy/paid/未知函数/尾随因子/真source拒收不变。High Scoped GO；原2文件252PASS、补充负控7PASS有重叠不加总；cb原输入离线回放1PASS仍拒绝20nm/0.94c错绑。旧dist/Prisma TC失败保留，canonical依赖build后完整WorkerTC0。
- 唯一原生计划`cb063919-3cf7-40ad-aeab-7d802410975f`于10-08T04:02:45.662Z failed/transport stopped；CP started/turn6、11对象保留，M3 provider_timeout600365ms/usage=null，上游终态/计费未知。无新计划/图片，不重发/新key/扩预算。ROc896/version2047/同6Claims/PDF、父36727536和第二幕保留；代表参数实际在s24，s7/s8/s15错绑及tau时间箭头与空间约束冲突待Native纠正，Codex不手补。原回执在生图`tmp/first-scene-native-*`。
- 原PNG隔离ea135→9ab、校准54c77→c302与Skill资源候选均保留原High/验证；格式/skill20/paid兼容曾在42fe是历史，45/784未带新目录。正式图审核曾漏方向/FWHM测量轴等真实错误，代码修复不能追认旧稿；新资源、真实Agent执行与实际图片分别验收。
- 视频收费守卫b705→b328、Web helper/phase及期刊shared Native管线已收，原ACK/legacy/unknown封闭保护不变。100fab→a8只给原broker加受保护--list-voices GET目录，无队列/心跳/生成/重试；High及3新例/42过2条件跳过复用。be4418→f89单次取时修fixture，确定性1ms RED→1PASS、bebe Linux视频通过；原失败未保存时间，不能补造唯一归因。
- 视频安装器/完整host/真实目录已完成；下一步由owner核既有human语言/声音偏好、合法成片来源及原预算，不擅自选声或开放生成。77项均未提供可用preview，目录不能证明声音自然；没有LTX生成鉴权被拒证据，不以网页等级或图片成功代证。RO9067第四幕`28ab61b0-7931-41d3-8200-2d63c1f986ad`无receipt/POST未知，不为4/4重发。
- 编辑CSS3989→221b全等；PostCSS40/99规则parse0，六字段/保存/权限不变。Figma编辑2138:117及头像2138:34/2169:23为候选，root看过原桌面/局部，不能代证运行或审美。两PNG在UI原tmp/ui-art-20261008/figma-hermes-avatar-{desk,entry}-centered-20261009.png；原14journey/High、原文两尺寸/reading20复用，详细静态观察见Git05b本页。
- Dashboard的d1a差额已由7e真实26/26闭合：Account tools、Retry可见入口、回焦attentive/离开idle、缺detail的route fallback；跨RO守卫保留。64px 1440/390框内draw与PNG已核；UI a0→503的手机间距修复随journal通过，21例workspace已过见上。原High/49unit/Web与scoped TS/lint0复用，不等于线上或整体审美认可。
- 共享包络按fd已采关键帧/hover极值向外取整，bottom旧27保持；不为接近边界盲加余量，不称经验网格为全域证明。原数值/786差额/已过loading handler记录见Git f2a2677c本页，当前头像不重做旧巡游。
- 版本原文reader/CSS/两尺寸证据已收；bebe reading20/20，不把历史FastRefresh失踪/foreign loading泛化为生产根因。期刊375初始标题bottom810.953≤812、独立role slot无遮挡，仅该屏证据。Figma同页14frame（含2162:23 reader375）/实际PNG在UI原tmp，均为候选，不代表窄屏产品/整体审美认可。
- Task4长表格57c→aa0、恢复f427→79050/CLI03b3→3a3faa保留High/CI及原预算/CAS/owner。10-08 21:29读：96b0dbe8-b5cc-4784-a9c2-0b62d12cb766/d357/v27为69 active/0 vector，来源6368当时满足；旧049c已非current，不apply。真实BGE未跑，授权与fresh状态另核，回执在生图`tmp/source-index-token-limit-recovery/`。
- Fig2 exact5已全持久化确认：d508→d1b3a6d0、75b→6ab33d52、6439→29588a02、ee9→5c9007c0、604→b6e99349；5唯一asset entry均trashed/lastError=null/原owner/parentnull/RO/绑定正确，初始各保30天。604 deletedAt07:44:52.746Z/purgeAfter11-09同UTC时点；每项精确字段见生图原tmp/fig2-cleanup/final-five-393{,-comparison}.json。所有writer关闭，不purge/restore或扩77/929债务。
- 15:54最终一次reader：5资产仅deletedAt/trashEntryId改变，原5 producer succeeded/live、捕获Claims/provenance/版本sealed/publicID/current65ff及5对象HEAD不变；原10audit保留，新增准确5条trash.move，非audits全等。复用incident的203非target媒体、23关联task和3human TrashEntry投影逐项无差额；原false/addendum/75首次0entry/原归因记录全保留。
- 正常产品manager五asset行消失/五task保留，Trash可见恢复期限且未点恢复/彻删；正常search→唯一RO→公开v5→65ff原图complete1280×720实测。root15:50匿名GET公开v5页面200和65ff PNG200/1409898B/原SHA54484359匹配。旧成员d508精确媒体URL被浏览器工具ERR_BLOCKED_BY_CLIENT，停止该路径族，余4未测，不能冒称实际HTTP404；search只展示RO，不代证asset索引级结果，持久化lastError均null。

- UI14:47 Weyl提示与图数变化已由一次RO限域审计证实3非target回收及1614采用；human直接答“是，我手动操作的”，来源已澄清、必须保留，不计入exact5完成数。原75b提交no_matches且DB仍live/0entry，重新操作使用完整ID限定的独立标签；原raw/false比较/审计addendum/旧DOM与时段调用均保留，77/929不扩原债务。

## 真实论文交付
| 论文 / Taskmaster | 保留的真实成果与反馈 | 尚未完成 |
|---|---|---|
| RO9067a2d5 / 1、5 | 六维/6Claim/58Evidence；原公开v3/v4、v5选65ff及匿名验证保留；Fig2内部v8状态见上项 | 用户整篇审美/可理解性认可；第三幕审阅阻断，第四幕外部未知 |
| ROc896802c / 2、5 | 私有v14/771ff7f3；2cc5003f物理与681ef614细节获认可，未公开；父36727536 approved、第二幕e8b6cb5d private | 沿正常采用/公开流程；原生自动计划质量另证，旧v4误判不追认 |
| ROaa450f1e / 3、5 | 公开v2/OSR-2026-000024，两图7eb1b7ee/4e64c389、5Claim/30Evidence、匿名轮播/PDF边界实测，首图获赞 | 整篇科学叙事认可；旧MOED错图保留私有 |
| 通用能力 / 4 | 原配图Skill/原生科学设计入口/自动计划接线存在 | 来源条件保真、跨任务经验、几何核验、Fig2重复plan/悬空copy；Fig1原字节展示已否定 |
- Taskmaster currentTag=multistyle-research-illustration；1/4/5 in-progress，2/3 done仅原子项，不等于三篇整体验收，本轮未改状态。
- ROc896旧首幕27b2381a/fc1c5474/73746a85/b3c023bf经产品回收保30天恢复；矛盾稿3e607af0于10-08T04:38:17.618Z按普通Domain CAS rejected、providerCalls0，父/第二幕不级联。RO9067 run7a959a7f及第二幕ead639dc成功回执/实际PNG保留，不冒称四幕全过。
- 正例7eb1/d64追到e550/scene0/c54、原Web5.6-sol审阅及1280×720字节已核，不是Native新授权。历史Synclip321b013e阻科学分镜/无POST；H3独立hook447219218062265已收15.084秒H.264/AAC，画面看过、声音未认可，不重发mechanism402，不代表论文成片。

## 其他未完成与资料入口
- [能力台账](../runbooks/hermes-capability-registry.md)定位入口/消费者/缺口；Native不走旧固定map/reduce管线。既有PDF/OCR/BGE、隔离science-worker与历史paid消费者复用；计算器适配未完成，不裸开host terminal/默认重算论文。
- 公司正式上线/年度运维、期刊真实PDF→Hermes试用继续；[期刊独立交付](2026-10-08-journal-workbench-handoff.md)与[原任务](2026-09-15-journal-onboarding-handoff.md)保留。迁移1–51是否已应用以当次双库账本为准，不据源码重跑；不自动扩版权/额度/权限。
- 运维仍以现ECS功能展示为先，集群/异机存储后续；对象定时、完整隔离恢复、独立告警和测试站未完成。恢复候选NO-GO；crypto用户暂停，禁止新run/重试/合成key/读取旧私钥或DPAPI，证据在root原ops-readiness checkpoint。
- 旧Chat浏览器/timer/profile已按授权退役，原spool/媒体/备份保留，ScanSci Xvfb保留。生图CUA原调用及唯一reset均header-policy失败，恢复已耗尽；UI旧preview也曾被自动审批拒绝，不绕过或误报产品不可用。
- Next cache删除曾在CreateProcess前被审批以blocked by policy拒绝、0删除；后被既有3018路径复用，旧无进程证明失效。video两份官网脚本清理亦同样被拒、0删除；各owner原tmp/receipt保留，不绕过审批或清他人资产。
- 启动读本页、Git、`node scripts/read-current-management-context.mjs`及相关短段。progress只放最近摘要、index只定位；完整截至本轮之前的CI、图像/回执、旧发布与禁止重放细节在Git `bebe897c2b11a3684b2a6f53a97b4993c4a86d58:docs/handoff/2026-09-10-hermes-web-image-handoff.md`，更早接管记录在748e33a4同路径。历史next action不是指令。
- [Native接入计划](../plans/2026-10-01-native-hermes-agent-plan.md)、[09-18保护交接](2026-09-18-figure3-image-and-cleanup-handoff.md)仍适用。root已直接核视频聊天human `msg_01a11867-33f5-7eb2-870e-c2450948f922`（10-08 06:06 CST）要求固化服务器/Hermes生图生视频能力；必要可恢复应用发布/既有资源配对沿该授权与原High/CI/串行流程，不要求用户逐字批准技术命令。原记录位置在video `tmp/video-human-authority/receipt.json`；不扩新二进制/付费/预算/未知重试，心跳或High不新增权限。
