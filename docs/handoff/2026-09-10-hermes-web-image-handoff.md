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
| 生图系统开发 / `01a0e831-be19-7813-8379-58313178ff26` | b572+87045已全等收为61598e21+1cad42a7；原High闭合，4acd两套实际Linux Host37/37含六Unix、图审54/54。代码已交付，实际installedSDK/PNG依赖root完整发布，当前不重复测试或付费调用 | `C:/Users/Mac/.codex/worktrees/illustration-chain-repair/XGS` / `codex/native-image-host-ci-fix`@87045；原refs/证据保留 |
| 视频系统开发 / `01a0e851-4d6c-7221-9559-b8c56a3413fe` | 一次fresh classifier已成功交付。已立即分派本次真实发布根因：retention的旧五键拒绝合法nativeRefresh，仅原retention.mjs/test.mjs；复用现有validator，真实prepare/abort/legacy及拒绝无副作用回归，root原High增量审 | `C:/Users/Mac/.codex/worktrees/synclip-video-delivery/XGS`，从4acd新独立codex分支；原fdf/compat/query/4bc及回执保留，无生产写权 |
| UI优化 / `01a0f118-e09d-7671-af09-0592d6062a6c` | settings eaf已全等收为32b27，最终1PASS14.6s/两file lint0、root已看1440/390/error原图；已分派编辑页主任务与正文密度，从32b27沿原Figma2138:117与实际fixture作最小差额，保业务和已有消费者断言 | `.worktrees/research-product-craft`；edit/page.tsx仅JSX呈现、原workbench.module.css、原hermes-workspace-stage.spec.ts必要编辑呈现用例；eaf/ad/consumer refs保留 |
- root独占生产；12:19自动回退完整结束后发布/资产窗口关闭。各owner只写上表范围、不回退他人；UI与科研资产/paid unknown交付目标不因发布返工取消，Fig2仍0写/无writer。

## Git / CI / 运行事实
- 交付branch=`release/onchip-production-line`，本轮精确已推候选`4acd855479248915e11afdf35544be6728164877`（frontend/nanqing）；settings32b27与Host61598/1cad均全等收取。[PR113](https://github.com/photonics-dhl/OpenScience/pull/113)打开，不合main/强推。4acd曾进入一次发布、最终收尾失败且已自动回退；当前新功能不能称上线，下一候选待下述retention最小修复。
- 4acd五CI实际SUCCESS：media PR38020752546/push38020750287、video38020752610、journals38020752543/38020750358。main jobs114121009656/114121002510：Host37/37含六Unix、图审54/54、Worker642/642、主browser34/34及八browser-entry均过。原完整`4acd-media-main-{pr,push}.log`在root tmp；这些只证明CI，不覆盖下述真实retention失配。
- 旧342与ed491的两media失败、其余CI成功及完整日志保留；342的Host短路径6FAIL和ed491的fresh paired恢复4FAIL已由4acd真实Linux闭合。历史b579/d8具体证据仍在Git4acd本页及原tmp，不复跑旧失败清单。
- 12:07一次新只读分类器exit0：复用已核6f镜像/manifest与正式4acd完整paired query；safe=true/nativePending=false/nativeBoundPending=false，前后临时容器clear。合法image-review在旧runtime会保守HOLD而不降级；原High Scoped GO、逐字消费及one-shot原回执在video `tmp/synclip-host-readonly/prepublish-work-4acd/`。
- 12:08新双库`/var/backups/openscience/db-set-20261010T040806Z-3254071`两dump163693443/14257855B、checksum0、0700/0600/旧集合保留已核。12:09–12:19正式4acd部署exit65；Native安装、三新容器配对启动、nginx/active CAS和公开精确release验收已过，最终retention prepare才失败，未提交事务。
- 12:19:31 fresh运行active=`a6f068a5ebefdab3427e8f01d110ca440fa9f97d`，rollback=`45a577a3a8f6bca78a063e7478fba131c5efb375`，Native env/unit=`784c6b25342c29bdc5c2db193258d34dfafd4e64`。旧版本新建API1996bdd2/Web4dac7953/Worker9d1dd159均healthy/restart0、镜像原值；timer enabled/active、无Native实例/FD9/候选进程，journal/failed/pending均无。Chrome匿名正常首页已实际呈现；认证/新功能入口未验收。
- 本次自动回退沿正式流程成功恢复原Native fixed files与应用，末尾NATIVE_OPERATION_OK→原active CAS→JOURNAL_CLEARED；未用人工恢复或重放旧事故。依赖已健康启动，先前08:57的d8依赖身份现属历史，不将其沿用为当前。保留本次候选目录/镜像、原备份及paid/unknown；模型/研究/资产请求0。
- 新根因由原独立High确认：`production-release-retention.mjs:198-205`仍只接受旧五键，正式published journal附合法nativeRefresh即被拒；`production-deploy-transaction.sh:831`在公开验收后调用它，非CAS或journal损坏。video只修原两file并复用`validateNativeJournalState`；保published/顶层精确键/FD9/权限/引用保护，不人工松生产记录。
- 本次4acd原证据在root `tmp/session-coordination-20261008/deploy-native-4acd{.log,-command.json}`、`native-4acd-{predeploy,rollback}-readonly.json`、`backup-before-native-4acd*`；状态同步原release-preparation，原4acd完整CI证据复用。新修复未经High/对应CI及新鲜发布条件前不开下一写窗口。
- 自动restore失败独立定因：`install.py:201`将source/infra正式root:root0775当作私有目录拒绝，早于install.lock/任何fixed-file写；三unit正式0664同类问题。08:38四live文件仍全candidate、旧784备份完整。不得chmod immutable或重放restore_attempting；源码与私有backup/live的权限合同须分开，复用既有manifest。
- 独立High专用恢复08:47–08:48 exit0：同FD9/install.lock、精确journal/producer集合/现场备份→原子恢复四旧文件→restored_verified→原API/Web/publica6→原timer→原Worker。网站不可用约17分钟。08:57专用finalize inspect0→confirm0，两轮实际状态与依赖身份校验后沿原clear helper清journal，服务/任务写0；禁止重放本次或旧事故脚本。
- 事故证据在root原tmp：`deploy-native-d8*`、`native-d8-{failure,restored}-readonly.json`、`native-d8-restore-metadata.json`、`recover-d8-*`、`native-d8-finalize-once-*.json`。服务器`/opt/openscience/tmp/native-recovery-d8-20261010T003533Z/`保原1120B事故journal、四candidate文件及1119B restored journal；新Native目录/旧备份/任务均保留。
- 原4bc→fbcee535的Worker cwd/query与candidate ID恢复修复保持源码Scoped GO及Linux117证据；本次进一步暴露CLI/installer真实合同缺口，整体发布不能称稳定。21b约9分钟、6f35约6分钟事故已结束，原receipt与细节保留在Git d8本页及原tmp，不重放旧恢复脚本。
- 77dd原NO-GO由6cd闭合：original启动只允许rollback_quiesced且安全install/restore组合，checkpoint=null也覆盖oneoff且先于stop/query/restore拒绝。原High及RED→39/39零skip、b579 Linux发布197证据复用；本次实际自动恢复也成功，不重做这部分审查。
- Linux原artifact保留exact b579 push与PR merge0503547da30a0105c830a00a33e281abec6ecacc的权限RED2/Green39/发布197及ZIP。0775/0664与Compose事故修复已由本次真实Native安装/自动restore消费；新retention收尾缺口独立处理，不能由先前全绿追认发布成功。
- 本地dev auth手机失败证据保留：HTML207906B/10inline parse0，4外部JS trace缺正文，未定根因；原rigready/30s保持且ed491 Linux已通过。creator精确RO recovery GET单行fdf→UI794后原4case实际4PASS54s，原4FAIL/traces及local proxy ECONNREFUSED warning保在UI `b579-video-consumer{,-fixed}-20261010.log`；后续4acd Linux主browser34/34已过，真实模型验收仍独立。
- Native恢复真实缺口已源码修复：自动reconcile产生合法fresh paired，旧deepEqual只收legacy。cca8523显拒null，复用imageReviewHasNoSubmission并捕获malformed return null；保原task/result CAS/attempt1/retry0/供应商completed及来源绑定，零新预留/收费，Worker fresh→prepared不变。7ae3053将原result收紧toEqual，原High最终组合GO。24执行PASS/20名称未选及最终对应2PASS/42名称未选有重叠不相加；own builds0、testlint0、Domain原lint20/current20新增0。原4RED/shape-only3RED1PASS及日志在生图tmp/native-image-flow-linux-fix；root两file与最终owner逐字相同，342两条完整Linux组642PASS闭合本缺口。

## 当前交付与明确下一步
- 图审a780/3a2→d9cc/f016及a6fa消费者、High paired query ea9组合dca5已全等收为7cd343；25file/22源码/18保护file/87原test保留。原Domain40/Gateway27/Worker39/video26/query24复用不相加；4acd实际Linux Host六例已过，installedSDK/真实PNG及通用质量未验收，原paid/unknown拒绝保持。
- UI5b009原32例/5新例/最后CTA1例与6ebb的6PASS+受影响2PASS（8unique）复用；a917三文件37+/11-，手机copy→CTA→完整图/长标题换行。3受影响case PASS及后续2case PASS有重叠不相加；原Godel增量GO、TC/lint0，root实看1440/390。Settings eaf→32b27三file66+/16-全等：Preferences第一、Account第二、原quota/Hermes保留；原Godel/TS复用，最终仅一行局部CSS去双分隔线，1PASS14.6s/页与spec lint0，root实看三张原final图（手机控件首屏/失败提示紧邻且0API写）。原tmp/ui-art-20261008/settings-final-20261010及旧证据保留；均未上线、未作整体审美认可。
- 生图f992/da9→bffbe1f8/2c37f0ae：scientific-comparison仅9行fresh完整有界括号比较，复用原parser，legacy/paid/未知函数/尾随因子/真source拒收不变。High Scoped GO；原2文件252PASS、补充负控7PASS有重叠不加总；cb原输入离线回放1PASS仍拒绝20nm/0.94c错绑。旧dist/Prisma TC失败保留，canonical依赖build后完整WorkerTC0。
- 唯一原生计划`cb063919-3cf7-40ad-aeab-7d802410975f`于10-08T04:02:45.662Z failed/transport stopped；CP started/turn6、11对象保留，M3 provider_timeout600365ms/usage=null，上游终态/计费未知。无新计划/图片，不重发/新key/扩预算。ROc896/version2047/同6Claims/PDF、父36727536和第二幕保留；代表参数实际在s24，s7/s8/s15错绑及tau时间箭头与空间约束冲突待Native纠正，Codex不手补。原回执在生图`tmp/first-scene-native-*`。
- 原PNG隔离ea135→9ab、校准54c77→c302与Skill资源候选均保留原High/验证；格式/skill20/paid兼容曾在42fe是历史，45/784未带新目录。正式图审核曾漏方向/FWHM测量轴等真实错误，代码修复不能追认旧稿；新资源、真实Agent执行与实际图片分别验收。
- 视频收费守卫b705→b328、Web helper/phase及期刊shared Native管线已收，原ACK/legacy/unknown封闭保护不变。100fab→a8只给原broker加受保护--list-voices GET目录，无队列/心跳/生成/重试；High及3新例/42过2条件跳过复用。be4418→f89单次取时修fixture，确定性1ms RED→1PASS、bebe Linux视频通过；原失败未保存时间，不能补造唯一归因。
- 视频待新host后的真实音色目录、用户声音选择与成片；现有CLI没有只读LTX权限判断，未有服务器Key拒绝证据，网页等级/图片成功均不能代证。新公开文档只返回通用页壳，不推断接口变更。原`readonlyVoiceCatalogConsumer`已备实际路径/uid0-gid1000/错误边界，目录未查、未选声音/付费探测。RO9067第四幕`28ab61b0-7931-41d3-8200-2d63c1f986ad`无receipt/POST未知，需真实关联合同，不为4/4重发。
- 编辑CSS3989→221b全等；PostCSS40/99规则parse0，六字段/保存/权限不变。Figma编辑2138:117及头像2138:34/2169:23为候选，root看过原桌面/局部，不能代证运行或审美。两PNG在UI原tmp/ui-art-20261008/figma-hermes-avatar-{desk,entry}-centered-20261009.png；原14journey/High、原文两尺寸/reading20复用，详细静态观察见Git05b本页。
- Dashboard的d1a差额已由7e真实26/26闭合：Account tools、Retry可见入口、回焦attentive/离开idle、缺detail的route fallback；跨RO守卫保留。64px 1440/390框内draw与PNG已核；UI a0→503的手机间距修复随journal通过，21例workspace已过见上。原High/49unit/Web与scoped TS/lint0复用，不等于线上或整体审美认可。
- 共享包络按fd已采关键帧/hover极值向外取整，bottom旧27保持；不为接近边界盲加余量，不称经验网格为全域证明。原数值/786差额/已过loading handler记录见Git f2a2677c本页，当前头像不重做旧巡游。
- 版本原文reader/CSS/两尺寸证据已收；bebe reading20/20，不把历史FastRefresh失踪/foreign loading泛化为生产根因。期刊375初始标题bottom810.953≤812、独立role slot无遮挡，仅该屏证据。Figma同页14frame（含2162:23 reader375）/实际PNG在UI原tmp，均为候选，不代表窄屏产品/整体审美认可。
- Task4长表格57c→aa0、恢复f427→79050/CLI03b3→3a3faa保留High/CI及原预算/CAS/owner。10-08 21:29读：96b0dbe8-b5cc-4784-a9c2-0b62d12cb766/d357/v27为69 active/0 vector，来源6368当时满足；旧049c已非current，不apply。真实BGE未跑，授权与fresh状态另核，回执在生图`tmp/source-index-token-limit-recovery/`。
- Fig2 exact5软回收已获human授权并High GO，接受成员旧URL在restore前404及初始30天条件；对象/任务/费用/Claims/sealed保留，禁止purge/补源/重写封存。e77实际published内部v8/OSR-2026-000023-v2，5项全excluded。10-08 23:03:59五项live/42fe；生图无认证、UI正常入口缺精确ID，双方0写释放。行标识165→ab3已收未发，发布后fresh核身份/引用再沿原授权操作，不重复问。
- Fig2执行只用原allowlist/顺序及returned entries，每项保resourceId/id/ownerId/purgeAfter/state/lastError；HTTP成功不等于search同步成功，需fresh持久化/实际成员与匿名GET，未知只读对账不重发，部分恢复父75b先于d508。77b row live但object absent、929完整UUID无行，不扩scope。原proposal/zero-write/readers/纠正回执在生图`tmp/fig2-cleanup/`，不是server denial。

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
