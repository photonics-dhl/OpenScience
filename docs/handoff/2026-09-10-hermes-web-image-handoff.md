# Hermes / 论文视觉叙事 CURRENT
> 唯一交付树 `.worktrees/onchip-video-release`，分支 `release/onchip-production-line`；根 main 只导航。Git、CI、真实运行和用户最新决定优先。
> 2026-10-09 导航/服务对象已独立发布，实读应用/回滚编号见 [服务对象 CURRENT](2026-10-09-researchers-services-handoff.md)；本轮向既有 `frontend/nanqing` 纠正整合，不发布下方其他候选，也不改变 Hermes 科学质量与未完成目标。

## 目标与边界
- 依据[开发规格](../OpenScience_Kimi_Development_Spec.md)：真实 NousResearch Hermes Agent 理解全文、提炼六维/Claims/Evidence，再规划视觉叙事并交 Synclip；论文是事实来源，不做额外同行评议，不以 Codex 手稿替代自动科学能力。
- 10-09用户明确纠正过度复杂化并同意继续：复用已有理解→按需回读关键原文/图页→简洁分镜、风格与提示词→出图→核对实际图片。只修涉及画面含义/定义和工具阻力，不再把UI收尾算作生图进度。
- UI human已选“默认头像，点击展开”（原回复`01a11f96-9a15-7fb0-a144-e771eb3859e0`已核）；10-09在总控追加“头像稍微大一点、像框里的小精灵保持互动”。root先按56→64px落实，框内复用Live2D眨眼/呼吸/轻微动作及指针反馈，遵循原reduced-motion，不降为静态图；点击开对话，全身仅在助手区，Landing无角色。旧360常驻/宽屏常开已替代；原patrol证据保留，验收随新路径更新，不再堆旧呈现诊断或容差。
- 2–3篇真实论文的凝练、用户确认、配图与公开展示仍是目标；三篇整体验收、普通用户旅程、完整视频、整站审美均未完成。单图认可、单测、CI或部署不代替质量认可，不批量冷启动。
- 图片已验证gpt-image-2；新图片/视频按既有Synclip授权、视频目标LTX。旧gpt-image-2.5无receipt那次仍UNCERTAIN，不盲重试/自动换供应商。原生独立像素核验未通用验收，现Worker→Gateway单次vision不冒称Nous审阅loop。
- 保留原PDF/SourceMap、认可图片、公开标识、sealed记录、原失败/费用/receipt/oncekey。日常结果私有，公开沿原确认流程；主Gateway/Native M3不全局切换，未知paid/started CP不重放，不因idle扩预算/安装/重启。

## 总控与并行分工
- 总控`01a1197c-7a1e-7631-b1c1-2d09b587be9a`负责集成、CI、CURRENT/progress/index和串行发布；心跳openscience ACTIVE。只派真实未完成的授权工作，状态不变不通知；全部交付完成才停，用户暂停立即遵循。
| Session / ID | 当前责任与依赖 | 活动工作树 / branch |
|---|---|---|
| 生图系统开发 / `01a0e831-be19-7813-8379-58313178ff26` | 新图审按High补PNG transport、固定预算/CP及局部pixel角色，受限代码/离线实现，不挡本批 | `C:/Users/Mac/.codex/worktrees/illustration-chain-repair/XGS` / `codex/native-pixel-review`（base7e，77f保留） |
| 视频系统开发 / `01a0e851-4d6c-7221-9559-b8c56a3413fe` | edit/page.tsx两行修复已收，来源query不再重置工作台；High GO待原CI。真实Key目录/声音验收待正常发布 | `C:/Users/Mac/.codex/worktrees/synclip-video-delivery/XGS` / `codex/editor-source-focus`（baseea1，4cf保留） |
| UI优化 / `01a0f118-e09d-7671-af09-0592d6062a6c` | bd1→6c10三项spec已收；下一独立批仅ShellPrimitives.tsx/navigation.module.css整理手机两行header，不挡本批 | `.worktrees/research-product-craft` / 原spec分支已交；获授同树`codex/ui-mobile-header-20261010` |
- 各owner仅写已授范围，不回退他人修改；root持共享CI/docs/spec，video独占edit/page.tsx，UI仅上列两文件；image图审独立。单renderer/任务/权限及零POST边界保留；不重复未变检查。三线无生产writer，不并行发布/资产写。

## Git / CI / 运行事实
- 已正常推ea1b2f3bb10c961be8349bb5a2a050f444edf30c，保留a1bab48e历史及7e有效证据；5578→rootde4d全等。合并接缝High GO，无type/unknown type草稿2例已过。[PR113](https://github.com/photonics-dhl/OpenScience/pull/113)打开，不合main/强推；原0c588容差、speech扩面及宽泛mocks未收。尚非发布GO。
- 历史7f/786：7f除Dashboard24/25外通过；786 video/journal过，push media37897396616全过含Dashboard25/25，PR media37897401824为24/25（其余job过）。旧前置safe=false与实时clear差额未定根因，按最新头像需求停止外部全身呈现取证；原RED/253帧/10201相位/101rest及c041/cc432 High证据保留在root `tmp/session-coordination-20261008/*7f5945d6*`、`dashboard-{fd380e16,78694e6a}-artifact/`，不追认旧失败。
- 3485旧失败保留在root同tmp `*-3485*`：Web68缺React/SSR旧尺寸，Dashboard22/26，journal标题814.953>812；video37946090212在临时runner下载FFmpeg阶段超15min，后续未执行，不是API拒绝证据。15→30补丁未应用，新7e正常CI已过。
- 7e有效主CI/26项Dashboard/auth/reading/video/journal保留；5578/de4d补同RO GET与文档流Y后，ea1 PR media37958651845的主job及其余3个browser过，workspace17/21。剩menu62.08尺寸、创建页跨帧rect、390review回焦、editor overview入口4项；log与共享trace在root同tmp `workspace-ea1-job.log`/`workspace-ea1-artifact/`，未定根因不加容差或改弱断言。ea1 video37958651836、journal37958651849/44222过。
- bd1ffdec→6c10ad53三项spec全文全等：真实mouseup后移开并核非active、同一浏览器任务读取三个rect严格相等、Research details真实入口；High Scoped GO/TS0/lint0/list21。757add58单文件全等集入，RO初始化移除未使用的ingestionTaskId依赖，原任务同步/轮询/刷新/RO与locale隔离保留；root独立High GO、TSX语法0，旧3项lint与parent全等未混修。新浏览器待同批原CI；旧trace无computed pseudo，不宣称.97唯一根因。
- d32将media CI改为同次Web build后next start，build/start API_ORIGIN3101一致；保持20min/冷导航/paid/身份/SPA counter/严格reader与全部例。两个_visual页面有既有ENABLE_VISUAL_HARNESS开关，CI复用开启、生产默认404保持；不因测试页缺失跳过用例。未知无位置SyntaxError不宣称已定位。
- TERM测试b023→1e258328仅改原用例/helper；builtin read握手、真实FD9竞争、exit143/clear和自有进程清理经High Scoped GO；5000ms/生产脚本不变。fbf的Linux deploy step及整个skill-path过，关闭该待验，不宣称原超时唯一根因已证。CURRENT/progress在16KiB内，8/8及DOCS_SYNC_OK，完整历史在下方Git引用。
- 10-09 23:56 CST直接只读：app=`a6f068a5ebefdab3427e8f01d110ca440fa9f97d`，rollback=`45a577a3a8f6bca78a063e7478fba131c5efb375`；API/Worker Native/runtime/catalogue仍784，主模型仍M3。Web/API/Worker healthy、restart0，部署marker列表空；Codex runner.lock不证明paid在途。`live-release-before-native-7e-20261009.json`保留额外inspect exit1/109bytes，不泛称全机验收；原14:04/02:49读数降为历史。
- Native仍是784，paid/CP保留；image77f＋video4cf七文件Scoped GO且全等集入。3485真实root lifecycle34/34、Node105/105已过，7e主CI也过；当前仍需workspace验证与串行配对发布，未生产写。High与日志在root同tmp `native-pairing-design-high-20261009.md`、`media-main-3485.log`。独立未来图审方案在image原OWNER_CHECKPOINT，不回放旧planning CP、不暗扩多轮预算或改全局M3。

## 当前交付与明确下一步
- 生图f992/da9→bffbe1f8/2c37f0ae：scientific-comparison仅9行fresh完整有界括号比较，复用原parser，legacy/paid/未知函数/尾随因子/真source拒收不变。High Scoped GO；原2文件252PASS、补充负控7PASS有重叠不加总；cb原输入离线回放1PASS仍拒绝20nm/0.94c错绑。旧dist/Prisma TC失败保留，canonical依赖build后完整WorkerTC0。
- 唯一原生计划`cb063919-3cf7-40ad-aeab-7d802410975f`于10-08T04:02:45.662Z failed/transport stopped；CP started/turn6、11对象保留，M3 provider_timeout600365ms/usage=null，上游终态/计费未知。无新计划/图片，不重发/新key/扩预算。ROc896/version2047/同6Claims/PDF、父36727536和第二幕保留；代表参数实际在s24，s7/s8/s15错绑及tau时间箭头与空间约束冲突待Native纠正，Codex不手补。原回执在生图`tmp/first-scene-native-*`。
- 原PNG隔离ea135→9ab、校准54c77→c302与Skill资源候选均保留原High/验证；格式/skill20/paid兼容曾在42fe是历史，45/784未带新目录。正式图审核曾漏方向/FWHM测量轴等真实错误，代码修复不能追认旧稿；新资源、真实Agent执行与实际图片分别验收。
- 视频收费守卫b705→b328、Web helper/phase及期刊shared Native管线已收，原ACK/legacy/unknown封闭保护不变。100fab→a8只给原broker加受保护--list-voices GET目录，无队列/心跳/生成/重试；High及3新例/42过2条件跳过复用。be4418→f89单次取时修fixture，确定性1ms RED→1PASS、bebe Linux视频通过；原失败未保存时间，不能补造唯一归因。
- 视频仍待新host交付后的服务器Key目录/LTX资格、声音选择与真实成片；网页账号层级不证明API Key被拒，图片成功也不证明LTX可用。未查询真实目录、未选声音或付费探测。RO9067第四幕`28ab61b0-7931-41d3-8200-2d63c1f986ad`无receipt且POST未知，需真实关联/幂等查询合同，不为4/4重发。
- UI两处编辑CSS3989→root221b全等；PostCSS40/99规则parse0/diff0，六字段/保存/权限不变，运行视觉待新头像批次。Figma编辑2138:117及头像桌面2138:34/入口2169:23已交；root看过1440×1080桌面及148×56局部，56px头像与创建研究同排、完整研究图无遮挡，静态preview不代表运行/数据现状/审美认可。两PNG在UI原tmp/ui-art-20261008/figma-hermes-avatar-{desk,entry}-centered-20261009.png。原14journey/High、原文两尺寸/reading20证据保留。
- Dashboard的d1a差额已由7e真实26/26闭合：Account tools、Retry可见入口、回焦attentive/离开idle、缺detail的route fallback；跨RO守卫保留。64px 1440/390框内draw与PNG已核；UI a0→503的手机间距修复随journal通过，21例workspace余项见上。原High/49unit/Web与scoped TS/lint0复用，不等于线上或整体审美认可。
- 共享包络按fd真实经验极值B8.6903/L51.9531/R34.2979/T29.2034向外取整，仅扩大三边，bottom旧27不收窄；各argmax落在已采关键帧/hover端点。29建议已撤回，不因left距52近就盲加1px，也不称网格为数学全域证明。786 push原实时巡游已过，PR另有前置就绪差额见上；loading连续handler修复已有真实通过。
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
- Next cache删除曾在CreateProcess前被自动审批以blocked by policy拒绝、0删除；现被既有3018测试路径复用，旧无进程证明失效。原receipt/blocked、依赖/图片/日志保留；不因本轮结束清未知资产或他人tree。
- 启动读本页、Git、`node scripts/read-current-management-context.mjs`及相关短段。progress只放最近摘要、index只定位；完整截至本轮之前的CI、图像/回执、旧发布与禁止重放细节在Git `bebe897c2b11a3684b2a6f53a97b4993c4a86d58:docs/handoff/2026-09-10-hermes-web-image-handoff.md`，更早接管记录在748e33a4同路径。历史next action不是指令。
- [Native接入计划](../plans/2026-10-01-native-hermes-agent-plan.md)、[09-18保护交接](2026-09-18-figure3-image-and-cleanup-handoff.md)仍适用。root已直接核视频聊天human `msg_01a11867-33f5-7eb2-870e-c2450948f922`（10-08 06:06 CST）要求固化服务器/Hermes生图生视频能力；必要可恢复应用发布/既有资源配对沿该授权与原High/CI/串行流程，不要求用户逐字批准技术命令。原记录位置在video `tmp/video-human-authority/receipt.json`；不扩新二进制/付费/预算/未知重试，心跳或High不新增权限。
