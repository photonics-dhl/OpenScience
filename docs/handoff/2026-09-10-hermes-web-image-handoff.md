# Hermes / 论文视觉叙事 CURRENT
> 本聊天按用户最新心跳继续在 `.worktrees/onchip-video-release` / `release/onchip-production-line` 总控生图、视频、UI三线；main只导航。个人主页另获授权从既有frontend/nanqing发布，实际已上线c239及其原收据见[服务对象CURRENT](2026-10-09-researchers-services-handoff.md)，不自动取消本聊天三线目标或写权。
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
| 生图系统开发 / `01a0e831-be19-7813-8379-58313178ff26` | 已真实走dashboard→论文Edit→Overview→图解与视频→来源工具；21:12唯一button提交创建43d78520私有计划，HTTP202/页面10%，正常单幕Native请求已捕获。现仅跟同task核来源绑定/实际方案，不自动审批/生图/公开；旧unknown不重发 | 原illustration-chain-repair树 / codex/research-continuation-surface@269d；submission-receipt保留 |
| 视频系统开发 / `01a0e851-4d6c-7221-9559-b8c56a3413fe` | 2640→1389/afe69→5242已集入，原High关闭selected-only/Unicode唯一P2、组合GO。六新增回归/Worker TC0复用；下一独立产物是最小试听启用与正常发起路径操作包，核已有voice/locale/finite预算来源；无生产动作 | 原synclip-video-delivery树 / codex/synclip-audio-audition@afe69；原receipt保留 |
| UI优化 / `01a0f118-e09d-7671-af09-0592d6062a6c` | 完整9e→ce5a/c644→244f已集入，27unit/7不同浏览器用例/原Godel最终GO；原恢复用例保留业务guards且用实图验证。下一项是已上线c239的短窗口/64px头像最小正常入口只读观察；真实MP3尚无 | 原research-product-craft树 / codex/private-audio-consumer-20261010@c644，源码clean；仅owned证据 |
- 本聊天三线生产操作由总控串行排程；生图owner持有原一次合法私有计划窗口，UI仅只读、root不并行发布/资产写。个人主页发布已带入图入口/短窗口，旧b261/e5脚本未执行且不得再跑。曾出现UI完全访问与运行read-only/消息审批never冲突；20:39环境恢复、协调消息实际成功，不需重复业务授权。

## Git / CI / 运行事实
- canonical=`release/onchip-production-line`，先保留dd25发布docs，再集入私有试听backend/完整Web至代码244f79a5；协作仍frontend/nanqing/[PR113](https://github.com/photonics-dhl/OpenScience/pull/113)，不合main/强推。图入口754c/API f2a/短窗口323d/回归1946均已在c239祖先b261，不能再标待部署。
- 20:28:26 CST root fresh只读：active=`c239c4ecbce98441dfeb05bcd048e38a3c3f484b`、rollback=`04352895148395465fbeaaa29e1cd6540331f36e`；API59c483e9/Webc9813aaa/Workercff55e32均healthy/restart0/source c239，无failed/journal/pending/FD9/Native实例。Native runtime/catalogue/unit仍393202f7、M3不变。原始`tmp/session-coordination-20261008/app-c239-postdeploy-readonly.json`；发布操作原receipt见服务对象CURRENT。
- c239四条实际触发CI全SUCCESS：video PR38048564712、journal PR38048564709/push38048562474、media PR38048564707。其父b261五条全SUCCESS：video38048065913、journal38048065871/38048062891、media38048065897/38048062904；八browser-entry含research-continuation均通过，真实PG profile1及原mock5在日志闭合。root b261-ci-final.json及c239-ci-final.json保存，不以旧失败e5代当前。
- root原准备仅做19:41双库备份`/var/backups/openscience/db-set-20261010T114156Z-532121`：163700200/14257855B、checksum0、0700/0600、旧集合保留。20:18 verifier因active已从043变c239而verified=false，原回执保持；不是dump损坏，不重做备份或执行旧deploy-app-b261.cjs。独立profile发布已完成该新版本，本总控不重复发布。
- 独立Synclip host最后19:39只读仍59a/config原样、adminfalse/audioabsent、timer inactive/disabled/readyabsent；已安装原7模块，受保护目录GET77音色已完成。目录访问不证明LTX生成权限、余额、声音或成片质量，新试听消费者尚未发布/启用。
- 历史工程证据复用：8cc Linux broker/引用合组136/136零skip；59a dashboard32/workspace25；393 deploy/manifest/retention306零skip及Native实际SDK离线loop。它们不覆盖新2640/UI消费者或真实科学产物。原393/59/043部署、失败、回退和paid收据均保留，长记录见Git dd25ae57本页；旧next action不再执行。
- 已观察首页→OSR-2026-000024/v2正文/认可首图、个人中心→研究入口/设置；17:43原账本显示管理员正常事务同oncekey自动adjust+1/consume−1，零平台余额不是该账户正常入口阻断。不是供应商资金授权；普通用户余额规则不变。c239普通生图入口/短窗口的真实点击及实际计划质量本轮继续验收。
- 私有试听集成：25后端文件对owner afe69仅API app多保留原profile两行；Web对c644仅保留原ORCID returnTo两行。唯一API测试冲突解后与owner全文全等。fresh依赖build0、API131+profile5=136PASS、Web27PASS、CI grep实际选15例（新6+原恢复1+原8）；浏览器未在root重复执行。原High、7客户端用例/桌面手机PNG复用，真实解码/声音不冒称通过。既有media CI补Domain/UI命令及paths，原High GO；精确组合CI尚待运行。
- 21:03组合37d7六CI终态：video/journal PR与push四SUCCESS、两media FAIL，八browser-entry均SUCCESS。仅主job旧native-video-readiness装配用例仍期望1回调，新实现为video/audio独立2回调；root同8例RED1/7→Green8、lint0、原High GO，test-only6d59a4ca修复保留两者动态和全部前提守卫，生产源码0改。后续精确修复CI仍须闭合，原37日志与收据保留。
- 新启用断点：installer只允许原defaults+audio，video owner已获install.sh/install.test.mjs独占本地修复；不改生产cfg/开关。站内试听发起尚缺，已有human要求自然科研旁白/历史中文H3，不等于选定Synclip voice或有限coins上限；待具体操作包，不代答偏好或扩预算。

## 当前交付与明确下一步
- 图审a780/3a2→d9cc/f016及a6fa/paired query已收，原测试证据复用。17:06:19–27实际393 SDK0.10.0离线构造/run_conversation PASS：原source5 Mock控制保留，image2 Mock请求消费真实skill_view/paper_image_view、唯一fixture PNG与四身份及终答；stderr空/外部Provider0/Gateway往返false/产品任务与DB0，自有temp已删除。6e3f仅offline_native_loop.py+80，原High GO、root全文diff0收6562；真实科研PNG的模型判断与科学质量仍未验收，不重跑旧paid/unknown。
- UI5b009/6ebb/a917及Settings eaf→32b27随393上线，0a/af/f868随59a上线。真实reload→个人中心→RO9067编辑已观察正文单列/64px键盘开闭回焦，但1536×681线上展开角色裁切。候选217c→323d按实际pane不足切既有modal并保持至关闭，保留真正文字锚点/输入/外部入口；4例通过、3视口截图完整，独立High GO。已随c239上线；同一真实入口的短窗口观察仍待闭合，不能把fixture当线上观察。
- 生图f992/da9→bffbe1f8/2c37f0ae：scientific-comparison仅9行fresh完整有界括号比较，复用原parser，legacy/paid/未知函数/尾随因子/真source拒收不变。High Scoped GO；原2文件252PASS、补充负控7PASS有重叠不加总；cb原输入离线回放1PASS仍拒绝20nm/0.94c错绑。旧dist/Prisma TC失败保留，canonical依赖build后完整WorkerTC0。
- 新私有计划`43d78520-6374-472f-8027-52441e36fecf`：21:12:45.062 CST实际正常GUI一次click/一次POST→202，初始pending/retry0/attempt0；session c7a98134-f7fc-4e29-bf87-424303d6ee0d、原oncekey11b0c555-0eb3-4bc2-829b-5c8762632523。实际zh/auto/outputimage/narrative=true/sceneLimit1、默认核心图解instruction/原6currentClaims，页面随后10%且URL绑定同task；原回执在生图`tmp/native-one-plan-live-20261010/submission-receipt.json`，scope-read/before-submit保留。0approve/render/publish；真实Native/科学质量尚未确认，只读跟原task，未知不重发。
- 历史原生计划`cb063919-3cf7-40ad-aeab-7d802410975f`于10-08T04:02:45.662Z failed/transport stopped；CP started/turn6、11对象保留，M3 provider_timeout600365ms/usage=null，上游终态/计费未知，不重发/新key/扩预算。ROc896/version2047/同6Claims/PDF、父36727536和第二幕保留；代表参数实际在s24，s7/s8/s15错绑及tau时间箭头与空间约束冲突待新合法计划独立核查，Codex不手补。原回执在生图`tmp/first-scene-native-*`。
- 原PNG隔离ea135→9ab、校准54c77→c302与Skill资源候选均保留原High/验证；格式/skill20/paid兼容曾在42fe是历史，45/784未带新目录。正式图审核曾漏方向/FWHM测量轴等真实错误，代码修复不能追认旧稿；新资源、真实Agent执行与实际图片分别验收。
- 视频收费守卫b705→b328、Web helper/phase及期刊shared Native管线已收，原ACK/legacy/unknown封闭保护不变。100fab→a8只给原broker加受保护--list-voices GET目录，无队列/心跳/生成/重试；High及3新例/42过2条件跳过复用。be4418→f89单次取时修fixture，确定性1ms RED→1PASS、bebe Linux视频通过；原失败未保存时间，不能补造唯一归因。
- 视频安装器/完整host/77音色目录已完成；当前推进正常任务的私有试听消费者，有限预算/持久grant/跨attempt不重扣/owner-only MP3与Web结果播放器已审集入，组合CI待新推送。正常站内发起试听尚未接线，不能用隐藏API代替产品路径；配置授权/真实试听/后续整片复用亦未验收。具体声音/语言/预算仍沿直接human证据，不代答偏好。目录无preview不能证明自然声音，也没有LTX实际生成鉴权被拒证据。RO9067第四幕`28ab61b0-7931-41d3-8200-2d63c1f986ad`未知不重发。
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
| ROc896802c / 2、5 | 17:43当前工作draft20471968/内部27、6Claims；2cc5003f物理与681ef614细节有历史认可，整体验收未完成；父36727536 approved/可生成，第二幕e8b6cb5d draft保留 | 沿正常采用/公开流程；原生自动计划质量另证，旧v4误判不追认 |
| ROaa450f1e / 3、5 | 公开v2/OSR-2026-000024，两图7eb1b7ee/4e64c389、5Claim/30Evidence、匿名轮播/PDF边界实测，首图获赞 | 整篇科学叙事认可；旧MOED错图保留私有 |
| 通用能力 / 4 | 原配图Skill/原生科学设计入口/自动计划接线存在 | 来源条件保真、跨任务经验、几何核验、Fig2重复plan/悬空copy；Fig1原字节展示已否定 |
- Taskmaster currentTag=multistyle-research-illustration；1/4/5 in-progress，2/3 done仅原子项，不等于三篇整体验收，本轮未改状态。
- ROc896旧首幕27b2381a/fc1c5474/73746a85/b3c023bf经产品回收保30天恢复；矛盾稿3e607af0于10-08T04:38:17.618Z按普通Domain CAS rejected、providerCalls0，父/第二幕不级联。RO9067 run7a959a7f及第二幕ead639dc成功回执/实际PNG保留，不冒称四幕全过。
- 正例7eb1/d64追到e550/scene0/c54、原Web5.6-sol审阅及1280×720字节已核，不是Native新授权。历史Synclip321b013e阻科学分镜/无POST；H3独立hook447219218062265已收15.084秒H.264/AAC，画面看过、声音未认可，不重发mechanism402，不代表论文成片。

## 其他未完成与资料入口
- [能力台账](../runbooks/hermes-capability-registry.md)定位入口/消费者/缺口；Native不走旧固定map/reduce管线。既有PDF/OCR/BGE、隔离science-worker与历史paid消费者复用；计算器适配未完成，不裸开host terminal/默认重算论文。
- 公司正式上线/年度运维、期刊真实PDF→Hermes试用继续；[期刊独立交付](2026-10-08-journal-workbench-handoff.md)与[原任务](2026-09-15-journal-onboarding-handoff.md)保留。迁移1–52是否已应用以当次双库账本为准，不据源码重跑；不自动扩版权/额度/权限。
- 运维仍以现ECS功能展示为先，集群/异机存储后续；对象定时、完整隔离恢复、独立告警和测试站未完成。恢复候选NO-GO；crypto用户暂停，禁止新run/重试/合成key/读取旧私钥或DPAPI，证据在root原ops-readiness checkpoint。
- 旧Chat浏览器/timer/profile已按授权退役，原spool/媒体/备份保留，ScanSci Xvfb保留。生图CUA原调用及唯一reset均header-policy失败，恢复已耗尽；UI旧preview也曾被自动审批拒绝，不绕过或误报产品不可用。
- Next cache删除曾在CreateProcess前被审批以blocked by policy拒绝、0删除；后被既有3018路径复用，旧无进程证明失效。video两份官网脚本清理亦同样被拒、0删除；各owner原tmp/receipt保留，不绕过审批或清他人资产。
- 启动读本页、Git、`node scripts/read-current-management-context.mjs`及相关短段。progress只放最近摘要、index只定位；完整截至本轮之前的CI、图像/回执、旧发布与禁止重放细节在Git `bebe897c2b11a3684b2a6f53a97b4993c4a86d58:docs/handoff/2026-09-10-hermes-web-image-handoff.md`，更早接管记录在748e33a4同路径。历史next action不是指令。
- [Native接入计划](../plans/2026-10-01-native-hermes-agent-plan.md)、[09-18保护交接](2026-09-18-figure3-image-and-cleanup-handoff.md)仍适用。root已直接核视频聊天human `msg_01a11867-33f5-7eb2-870e-c2450948f922`（10-08 06:06 CST）要求固化服务器/Hermes生图生视频能力；必要可恢复应用发布/既有资源配对沿该授权与原High/CI/串行流程，不要求用户逐字批准技术命令。原记录位置在video `tmp/video-human-authority/receipt.json`；不扩新二进制/付费/预算/未知重试，心跳或High不新增权限。
