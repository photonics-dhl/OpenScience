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
| 生图系统开发 / `01a0e831-be19-7813-8379-58313178ff26` | 实际installed SDK有限只读消费已交付，未构造Agent/跑循环/看真实PNG。Fig2 fresh exact5全等、身份关联已核；现独占逐项Prisma对账，等UI一次动作结果才读取，不执行POST | `C:/Users/Mac/.codex/worktrees/illustration-chain-repair/XGS` / `codex/native-image-host-ci-fix`@87045；原tmp/native-image-host-ci-fix、tmp/fig2-cleanup保留 |
| 视频系统开发 / `01a0e851-4d6c-7221-9559-b8c56a3413fe` | 独立Synclip仍42fe且无目录/audio client；正式source0775/0664被旧source_path误拒。已派仅install.sh/install.test.mjs修复与原High增量审，保私有文件/rollback守卫；host更新由root串行安排 | `C:/Users/Mac/.codex/worktrees/synclip-video-delivery/XGS`；从canonical10f新codex分支，6e243和原tmp/synclip-host-readonly回执保留 |
| UI优化 / `01a0f118-e09d-7671-af09-0592d6062a6c` | 编辑0a及空会话裁切af已审、全等集入348c/10f待下一批；Fig2五asset行与同ID task行已核。现唯一资产writer，仅首项d508一次普通UI软回收，后续须逐项对账后root放行 | `.worktrees/research-product-craft` / `codex/ui-hermes-initial-scroll`@af231a；原tmp/ui-art-20261008保图/日志，不改共享API/生产配置 |
- root独占生产排程；393正式发布窗口已结束，现Fig2唯一UI writer逐项窗口，首次POST结果待报。其它发布/资产写冻结；生图只对账、视频只修本地安装器，禁止因idle扩生产范围。

## Git / CI / 运行事实
- canonical=`release/onchip-production-line`；393正式已推`frontend/nanqing`并成功上线。其后UI0a→`348c127d7aa08e53dad86276b0e363907dbf67c2`、af→`10f135817c796529e5a7b79af78718c14c08230c`全等集入，四文件对owner af diff0；docs另提交，精确HEAD以Git为准。[PR113](https://github.com/photonics-dhl/OpenScience/pull/113)打开，不合main/强推。UI两commit尚未发布。
- 393五CI全SUCCESS：media PR38025073327/push38025070870、video38025073354、journals38025073326/push38025070875。Linux main114134084085/114134076089的deploy+manifest+retention合组306/306、0skip，新增retention87含Native prepare/abort/legacy/malformed/权限/FD9；主browser34/34、八entry job均过。原完整393-media-main-{pr,push}.log在root tmp。旧4acd Host37/图审54/Worker642未变证据复用，不叠加重叠数量。
- 13:03:21–13:11:15 CST正式393部署exit0：Native/application配对、公开精确release验收、retention prepare、journal clear与complete全通过，迁移无pending。13:13:05只读active=`393202f7c863e9d87011049668594bcb0f8c1dfb`、rollback=`a6f068a5ebefdab3427e8f01d110ca440fa9f97d`，Native runtime/catalogue/unit同393；API af63ece1/Web ef00cbc8/Worker459a5887均healthy/restart0/source393，无journal/failed/pending、Native实例或FD9 owner，M3保持。13:45 Fig2前后marker/Worker仍稳定。
- 原审393 one-shot执行safe=true/nativePending=false/nativeBoundPending=false，执行标记保留不可重跑；新双库`/var/backups/openscience/db-set-20261010T050021Z-3432378`两dump163693443/14257855B、checksum0、0700/0600已核，旧集合保留。首次只读backup verifier因本机ISO转DateTime失败，未重做backup；Node保留ISO后成功，原错误/纠正保留。
- 本轮原回执：root `tmp/session-coordination-20261008/deploy-native-393{.log,-command.json}`、`native-393-postdeploy-readonly.json`、`backup-before-native-393*`；video原tmp/synclip-host-readonly/prepublish-work-393记录one-shot。标准seed/注册随发布执行；模型/paid/科研资产写0，不把标准发布称全DB零写。
- Chrome真实首页→OSR-2026-000024/v/2已显示正文/六维/认可首图7eb1；个人中心→研究入口与网站设置沿可见导航可读，正常DHL会话、Preferences先于账户。余额实际显示剩余0 AI credit/月500，仅UI usage快照，不是供应商资格拒绝或完整计费对账，不扩预算。已部署与整体艺术/真实自动科研质量分别判断。
- 生图13:23在实际393 venv导入hermes-agent0.10.0/AIAgent薄适配，核三工具注册/schema/selected方法/SkillScope并运行合成metadata handler；未实例化或跑run_conversation，无真实PNG/Provider。正式路径runNativeImageReviewTask→Host→broker/task unit→SDK；需合法新任务及原预算才可验收真实像素，旧unknown不得重放。
- 视频13:20–13:22只读独立host仍`42fe1a974fb62e5a868d3a4f1da812065cb148b1`，adminModelsEnabled=false/audio absent、无list-voices/client；正式source0775/0664被install.sh 0022拒绝（源码推断exit66，未安装）。主应用开关true不能证明host更新或LTX可用；目录GET0/付费0，现本地修最小安装差额。
- 历史4acd在retention旧schema处失败，12:19正常自动回退结束；由990e6e85复用validateNativeJournalState及393原workflow五行补丁闭合，原High GO。更早d8 Compose/权限误用及专用恢复已结束。原事故/备份/paid证据保留，长记录见Git393本页及原tmp，禁止重跑旧恢复/reader。51e4 superseded media已cancelled、其余三CI成功，不作393证明。

## 当前交付与明确下一步
- 图审a780/3a2→d9cc/f016及a6fa消费者、High paired query ea9组合dca5已全等收为7cd343；原Domain40/Gateway27/Worker39/video26/query24不相加。Linux Host六例与393 installed-SDK有限消费已核；实际Agent构造/循环、真实PNG和通用质量仍未验收，原paid/unknown拒绝保持。
- UI5b009/6ebb/a917及Settings eaf→32b27随393上线，原局部High/浏览器/截图复用，正常设置入口已观察。新0a版式1PASS38.1s/TS0/lint0，af空会话修复8unique cases/TS0/lint0/原Godel ScopedGO已集入未发：有内容才初开跟底，conversation slot按真实容器限高。root实看1440/390原final图，完整角色和输入可见；恢复中会话初始155px差未解释，不泛称全部滚动/整站审美已完成。
- 生图f992/da9→bffbe1f8/2c37f0ae：scientific-comparison仅9行fresh完整有界括号比较，复用原parser，legacy/paid/未知函数/尾随因子/真source拒收不变。High Scoped GO；原2文件252PASS、补充负控7PASS有重叠不加总；cb原输入离线回放1PASS仍拒绝20nm/0.94c错绑。旧dist/Prisma TC失败保留，canonical依赖build后完整WorkerTC0。
- 唯一原生计划`cb063919-3cf7-40ad-aeab-7d802410975f`于10-08T04:02:45.662Z failed/transport stopped；CP started/turn6、11对象保留，M3 provider_timeout600365ms/usage=null，上游终态/计费未知。无新计划/图片，不重发/新key/扩预算。ROc896/version2047/同6Claims/PDF、父36727536和第二幕保留；代表参数实际在s24，s7/s8/s15错绑及tau时间箭头与空间约束冲突待Native纠正，Codex不手补。原回执在生图`tmp/first-scene-native-*`。
- 原PNG隔离ea135→9ab、校准54c77→c302与Skill资源候选均保留原High/验证；格式/skill20/paid兼容曾在42fe是历史，45/784未带新目录。正式图审核曾漏方向/FWHM测量轴等真实错误，代码修复不能追认旧稿；新资源、真实Agent执行与实际图片分别验收。
- 视频收费守卫b705→b328、Web helper/phase及期刊shared Native管线已收，原ACK/legacy/unknown封闭保护不变。100fab→a8只给原broker加受保护--list-voices GET目录，无队列/心跳/生成/重试；High及3新例/42过2条件跳过复用。be4418→f89单次取时修fixture，确定性1ms RED→1PASS、bebe Linux视频通过；原失败未保存时间，不能补造唯一归因。
- 视频待Synclip安装器最小修复、root串行更新host后真实音色目录与用户声音选择，再推进成片；没有服务器Key被LTX拒绝的证据，不以网页等级/图片成功代证。原readonlyVoiceCatalogConsumer保持受保护入口，当前未GET/选声/付费探测。RO9067第四幕`28ab61b0-7931-41d3-8200-2d63c1f986ad`无receipt/POST未知，须真实关联合同，不为4/4重发。
- 编辑CSS3989→221b全等；PostCSS40/99规则parse0，六字段/保存/权限不变。Figma编辑2138:117及头像2138:34/2169:23为候选，root看过原桌面/局部，不能代证运行或审美。两PNG在UI原tmp/ui-art-20261008/figma-hermes-avatar-{desk,entry}-centered-20261009.png；原14journey/High、原文两尺寸/reading20复用，详细静态观察见Git05b本页。
- Dashboard的d1a差额已由7e真实26/26闭合：Account tools、Retry可见入口、回焦attentive/离开idle、缺detail的route fallback；跨RO守卫保留。64px 1440/390框内draw与PNG已核；UI a0→503的手机间距修复随journal通过，21例workspace已过见上。原High/49unit/Web与scoped TS/lint0复用，不等于线上或整体审美认可。
- 共享包络按fd已采关键帧/hover极值向外取整，bottom旧27保持；不为接近边界盲加余量，不称经验网格为全域证明。原数值/786差额/已过loading handler记录见Git f2a2677c本页，当前头像不重做旧巡游。
- 版本原文reader/CSS/两尺寸证据已收；bebe reading20/20，不把历史FastRefresh失踪/foreign loading泛化为生产根因。期刊375初始标题bottom810.953≤812、独立role slot无遮挡，仅该屏证据。Figma同页14frame（含2162:23 reader375）/实际PNG在UI原tmp，均为候选，不代表窄屏产品/整体审美认可。
- Task4长表格57c→aa0、恢复f427→79050/CLI03b3→3a3faa保留High/CI及原预算/CAS/owner。10-08 21:29读：96b0dbe8-b5cc-4784-a9c2-0b62d12cb766/d357/v27为69 active/0 vector，来源6368当时满足；旧049c已非current，不apply。真实BGE未跑，授权与fresh状态另核，回执在生图`tmp/source-index-token-limit-recovery/`。
- Fig2 exact5已获human及原High批准（成员旧URL恢复前404/初始30天）。393行标识已上线；UI管理内容每ID各有asset/task行，必须kind=asset+UUID。13:45:43–48 fresh资产/5HEAD/任务/refs/sealed全等原回执；原e77内部v8/OSR23-v2五项excluded，当前公开v5/internal11选65ff，私有draft6236/internal13，不能混为同版本。
- Fig2沿原allowlist/顺序，保对象/任务/费用/Claims/sealed，禁purge/补源。正常Settings账号唯一关联原owner10baa；浏览器/api/auth/me被ERR_BLOCKED_BY_CLIENT已停止不绕过，High确认无需另取sessionGUID。UI丢弃POST body，原High条件GO允许明确标注数据库对账收据：每POST后唯一active entry、owner/parent/RO/asset.deletedAt及trashEntryId一致，保存原五字段；pending/未知/不一致停且不重发，正常Trash/search/member/匿名GET另验。部分恢复75b先于d508，77/929不扩；原tmp/fig2-cleanup保全回执。

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
