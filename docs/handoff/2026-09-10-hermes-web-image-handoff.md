# Hermes / 论文视觉叙事 CURRENT
> 唯一状态入口：`.worktrees/onchip-video-release` / `release/onchip-production-line`；root main 仅导航。历史过程与完整资产表保存在本文件 Git 历史（例如 caf7b280），不得执行旧 next action。

## 最新授权与执行边界（2026-10-15）
- 最新人类已明确：**UI 可单独修复并部署；71e 仍不部署**。UI 不等待无真实依赖的 R04/R12；仍禁止 Provider、商业视频、新生图/音频/收费重试。保留视频与生图最终目标，不把当前冻结解释为取消目标，也不把旧条件式许可当现在执行窗口。
- 目标仍为 2–3 篇真实论文经 NousResearch Hermes 全文理解、Claims/Evidence、凝练、配图、用户质量确认及公开展示；普通用户旅程、完整视频、整站审美仍未完成。Codex 不冒充 Hermes 产物，测试/安装/accepted 不等于科学质量或用户认可。
- UI 已认可 P03 Guide、P04 研究桌面及既定四视图，最新许可覆盖独立修复与原流程部署；其他页面仍按44页手册逐页认可，不自动整站改写。现有 Guide/P04 旧版本上线证据不能代替新四视图的运行验收。
- 生图执行恢复时仍须 API-only / gpt-image-2.5，只有结构化明确模型不可用才一次降级 gpt-image-2；不用 chatgpt-web。原一次 cb9 迁移/新 Guide/首图已消费，不再据该许可 POST。其他独立生图目标保留待核授权，当前无 Provider 执行窗口。
- 保护 PDF/SourceMap、认可图片、公开版本、私有原稿、failed/UNCERTAIN/attempt/receipt/oncekey 与费用记录。未知 paid/started 不重放；无可信原ID与供应商查询/幂等合同时不承诺自动恢复。指定私有v3去重已完成，不扩大清理。

## 总控与当前并行写权
- root `01a1197c-7a1e-7631-b1c1-2d09b587be9a` 单写 CURRENT/progress/index/registry，串行集成与发布；owner 仅写分配路径、交 commit/实际验证/独立 High/未决项。所有源码/CI/High 至少 gpt-6.1-sol；独立审查不以主线程自审替代。
- UI `01a12fc3-b66e-7090-b95e-b7dccfa6ccb8`：已完成四视图及 canonical 历史 Native fixture 修复至 caf7b280；只收该轮38612456058终态，不再扩修不属于发布包的 Native fixture。下一职责为隔离3118候选唯一Media日志/artifact及Web验收；隔离源码root单写。
- 视频 `01a0e851-4d6c-7221-9559-b8c56a3413fe`：Node24三文件候选79c1c239已完成High并交回；已完成只读源码核对：无现成的无Provider/新任务编辑入口，回执 tmp/coordination/71e-private-revision-entry.md；当前真实等待，不另造任务；不SSH/写DB/新任务/Provider/部署。
- 架构 `01a134bd-6630-7ae2-beba-0c1d0287b948`：独立树 codex/architecture-remediation 处理R04默认self/Worker闭包；最新d52deb64受控诊断已推、High GO，唯一Linux38612878746待结果。R12整体仍NO-GO；R08等独立候选不混UI发布。
- 生图 `01a0e831-be19-7813-8379-58313178ff26`：当前Provider冻结、无业务/SSH窗口；已收原首图保护/费用/质量BLOCKED与相关恢复源码回执，既有待交付质量目标保留。
- 心跳openscience保留；实际独立执行心跳才递增 tmp/openscience-heartbeat-count.txt，普通人类回合不加。cursor仅运行状态；完成后发有因果的下一指令，以STARTED/实际输出确认，不重复空等待。

## 当前 Git / CI / 发布候选
- canonical当前源码为caf7b280afe25681efabbb2e0d0e8174f39646c0（后继文档提交以Git为准）；含尚未完成Linux/运行验收的R01/R12/Ops，**不能整包按UI许可发布**。根main只导航；本机依赖缺失仍在，源码clean不等于依赖恢复。
- 复用root-owned `C:/Users/Mac/.codex/worktrees/media-reviewed-integration/XGS` / `codex/p04-media-integration`；生产84为祖先，UI候选 **3118f4a43769b5b601fc019a11f86763f057e314** 已clean正常push。26文件536+/383−：23 Web + Node24三文件。
- 精确来源：5dd687f6→32b412ef；5e7b430a→ac2fb194；b2756b42→9c69c46c；3cff5edf仅Web→c69ac3b6；235ae555→81e6ff7e；ea0885a9仅Web→edd1c25e；79c1c239三文件patch→3118f4a4。不取HEAD整份compose/domain index，不带R12/R01/R02 fresh runtime/Gateway/Ops。
- 隔离scope与3118实际组合独立High均GO/P0P1P2=0，回执 tmp/coordination/ui-release-scope-high.md。新组合compose4/4、diffcheck0；唯一精确Media **38613196449** queued/in-progress，UI为唯一日志owner。旧84/canonical绿灯不可替代。既有Media包含四浏览器、skill-path、真实PG及类型/build；主ci.yml不因本分支push自动运行，不能冒称主仓全CI通过。
- canonical旧38610929208：4浏览器+PG成功，skill-path native-image-review 45pass/4fail；Worker step54已通过。caf7b280仅修历史no-marker fixture与fresh marker断言，独立High GO，新38612456058终态待收。单次浏览器通过不证明旧flaky根因。该组fixture与隔离84旧runtime不同，不自动搬入。
- Node24原候选79c1c239：仅Web从node22改为已缓存node24-bookworm@sha256:3d27e5c11e5786e309ec3e03f93ae536eb36e6e5eb3714d5eb3300a36157add0（v24.21.0），API22/Worker22-bookworm不变；test:release-contract接入compose合同。原compose4/4、deploy178pass/6Linux skips、隔离有界竞态not-reproduced、第二High GO零项，证据 tmp/coordination/node24-transform-race-20261015.md。不冒称生产修复或Native截断已关闭。
- 下一步：3118精确CI/组合High通过后root沿原发布流程执行；先核fresh实际active=84、已推clean源/祖先/必要备份/既有guard，保持Native refresh关闭、VIDEO off与无Provider。发布后核Node版本、Web digest错误、health/journal/active/public release，并从首页→Guide→P04→编辑四视图实际点击；失败先原trace/源码，不加timeout/强制可见/放宽断言。

## 最新已核生产事实
- fresh只读 tmp/coordination/ui-3118-before.json（2026-10-14T18:16:53Z）核active84、无journal/failed、候选目录未存在、47.84GiB余量、Web v22.23.2/健康；本机curl公网/__release为200/精确84（服务器Python请求HTTPError不冒称公网故障）。此前完整发布回执 tmp/coordination/media-84-deployment-readback.json observedAt=2026-10-14T18:05:31+08:00：active/public=84c2640b2ecf790fdbe89b2d958ea5dc4a13c8b2，rollback=cb9f9916eaa5202671080dc31eaa552bb22413e9，completed、healthy、无journal/failed marker。84精确Media38514277609六jobs成功。新发布须重新只读核身份，不能把此历史快照当fresh。
- 84已沿原FD9发布；--no-tests明确跳过Parser/ScanSci/embedding及相应功能probe，不宣称这些验收通过。Native/runtime/catalogue/两Skill与IMAGE保留ea81bd69840c46a9e84349a70787f40f5cbbc1c3；VIDEO59a23906cec85092a6100a7a281a24079136cf4d关闭，未refresh/新Provider/商业视频。
- cb9为**此前迁移发布**：core53 validated，ledger54含既有历史ledger-only，search2；原双库备份db-set-20261014T023924Z-129937/checksumsOK，5旧checksum已证CRLF不改SQL。当前线上不是cb9。原release-cb9f9916与migration/release High证据保留。
- 首图开始后generic Native safe不能证明旧应用回退安全；同一producer-held窗口仍覆盖failed/UNCERTAIN迟到恢复。未证明安全维持配对前向修复，journal清除不等于自动rollback许可；普通匹配host timer恢复后才能核fresh.ready。旧Web已退役、固定可恢复归档及双位置cleanup reader必须保留。

## 71e 科学分镜与能力差额
- 原父任务71e70ae3-be30-43ce-8c2f-496d9220ec6b与同父修订591e9fd8-14ed-4ef4-885f-0f6ade1d386d均已有真实succeeded/attempt1/retry0，后者100%、result100848B、final-brief accepted；ledger各一次正常+1管理员fund/-1submit。不能继续称这两任务容量失败，也不重新提交。92df持久化失败为Native Agent output truncated，与Web systemError分开。
- 先前两项修订（超强耦合限超导量子比特—微波腔；scene1唯一v·k=ω(k)）已进入私有草稿并High GO，未公开/批准成片。新三项仅方案High GO：scene3统一few-nanometre gap；从10/10/10/15=45s恢复父计划5/10/10/10=35s；>1000x限该金纳米立方体/金膜nanoparticle-on-mirror实验，不推广一般polaritons或未验证mid-IR。
- 新三项**尚未写回草稿**；只读源码已证现有鉴权入口只支持新Native重新规划任务，PATCH只改审批状态，Storage草稿与历史replay不能改服务器分镜正文；此轮不创建新任务、不直写DB、不用Codex文件冒充Hermes自动结果。报告 tmp/coordination/71e-three-item-high-review-20261015.md；claims13c0de89-3863-40cd-aaac-8bf547ebe702 p11与b6a…边界保留。71e不部署、无新任务、无Provider。
- Synclip公开Docs/用户截图已并入原能力台账：Veo Fast18/Pro54不是LTX报价；音频standard1/premium4每started1000chars/request，1200字2/8，供应商credits/coins与平台AI点分开。LTX23/ltx23fast账户资格、5/10/15s价格、有限总预算与所选音轨仍需真实依据；不重复向用户索取已给公开页/原ID/Key。
- 音色旧reader credits_per_1k_chars/coins_per_char差额源码已审并在应用84收取；VIDEO host旧59a/ltx23/720p/receipt-v2/adminfalse/timer disabled/ready null未改。安装源码、实际消费、产品质量分别判断；不启用/试听/生成。

## 架构源码与未决验收
- R02 source-composition已收a3be7786/063daf29，owner历史fixture125/125、七套772/772、domain tsc/ESLint及独立High GO；canonical本机依赖缺失不能伪称复跑通过。R02不属于本轮UI隔离发布差额。
- R04独立树最新d52deb64b9b4e2c5f9e23d0290c164e21c989763：默认静默，diagnostics===true才输出固定stage/白名单code/最多3条本文件整数行号，无message/path/raw stack/env，sink异常仍fail-closed。定向2/2、full216/210pass/0fail/6skip、双syntax/diff与独立High GO。整体R04仍不是部署GO。
- 原Linux38610730798 database/search generate与双musl断言已成功，但full-root self verifier仍失败；新38612878746终态failure明确closure-candidate/COMPATIBILITY_UNKNOWN/行66,419,406；真实Gateway this.scientificReviewProvider成员supplier追踪不支持，非engine问题。owner已STARTED在原verifier/test/workflow范围补class readonly property→constructor opts→真实new/factory静态来源证明，未知/动态/重赋值仍fail-closed，独立High后新精确SHA一次Linux。P2：pnpm virtual-store单测实际flat fixture，真实Linux正向尚需证；owner只取本run日志一次并按实际stage修因果差额。
- R12后续提交整体独立High NO-GO（CAS/saveWarnings同事务、API/Worker Native stop、producer围栏、presentation.generate Gateway等仍按架构原计划收敛）；已收旧source不等于新整体ready。R08独立源码候选未部署，R01 SDK/凭据/完整bundle与Ops运行未完成。R13真实OOM根因不因重建容器或日志改进而关闭。详见既有能力台账/整改计划，不新增任务库。

## 研究生命周期角色与入口
- **研究者**：现有 `/guide` 上传材料 → `/dashboard` 进入私有 RO 核对六字段与来源 → RO `edit?stage=media` / `presentation?version=:version` 查看分镜与媒体 → 显式公开。新版Guide与P04已按认可图实施、配对上线且从可见入口走通原私有v3；P05独立重设计仍须评审，现仅复用既有工作台。复用已有授权与审核守卫，不新增逐幕批准关卡；直接视频/试听提交仍受 Domain 的 platform_admin 限制，入口存在不等于普通用户已可用。
- **Hermes**：从 RO 助手承接已授权任务，复用 PDF/OCR、SourceMap、Claims/Evidence、配图与 Skill，理解全文后形成分镜、原旁白、来源绑定动作和镜头；商业模型执行画面表达。科学与像素审核沿既有任务链，缺依据或执行失败保留私有草稿，不由 Codex 手稿替代。
- **读者**：`/explore` → 固定公开研究版本，阅读成片、图文与原文来源；不能读取私有任务、音频试听或失败回执。来源可核验不等于平台证明论文结论或视频质量。
- **期刊/协作者**：期刊目录 `/journals` → 有权限的 `journals/manage/:id/articles/:articleId` 接续共用论文与媒体链；协作者经 RO `collab`/版本入口按成员权限讨论与修订私有工作稿。公开修改形成新版本或勘误；业务权限不授予 Hermes 运维或 Provider Key 权限。角色入口证据：`apps/web/lib/guide-page-copy.ts` 与现有 RO/期刊路由。

## 原图恢复与费用保护证据
- 本次实测：Native plan f00b0377于11:18:34Z成功，final-brief来源审核accepted；只提交一次image e343eaba-0a3c-45db-8631-63afa0912ff7，11:24:40Z首次UNCERTAIN，原记录仍保留。人类消息01a13523-da21-7f23-acf9-3b0baf12fd02提供同账户原ID `d44506f0-5753-4eeb-9201-a59ff0a69d47`、gpt-image-2.5、51s/Success/-6/Deducted及匹配prompt。经独立High核原ID关联后，12:17:28Z原GET返回completed，raw/normalized/receipt存在，spool e343 succeeded且model2.5，新增POST=0。12:20平台沿可见“继续处理”恢复原task succeeded/attempt2；同ID私有image资产draft且2.5，Native imageReview M3 accepted、runtime/catalogue393未变，原trace确认两轮实际skill_view/paper_image_view（image-f804-image-review-trace.json）；ledger仍6行，恢复无第二笔平台扣费。总控已看实际1280×720图：中心清晰/主标签可读，但额外文字、渐变、左下小标记未严格遵循brief，不自动批准/公开；此视觉限制与Native accepted分别记录。证据`tmp/coordination/image-f804-original-{association.log,recovery-before.json,recovery-after.json}`，旧initial receipt/timing保留。
- 保护与费用：恢复前总控独立比对published v1/v2与protected originals不变、v3仍私有、task87→90；平台gross3credits且auto-fund3/net0，不是免费。供应商账单由用户提供扣减6/Deducted；随后官方/dev/docs/image核到2.5=6 coins/image，货币折算未证，文档快照synclip-image-docs-20261013.json。用户新授权私有v3去重，owner回传39→9且选中9身份一致、30进入产品30天可恢复回收站；总控独立比较清理后DB确认公开v1/v2与protected originals不变、v3仍draft；恢复后为9张保留旧图+1张新draft。证据`image-v3-cleanup-before.json`/after.png；平台Native像素审查已accepted，Codex视觉仍指出brief贴合度限制，未获用户质量确认。最小终态回执`image-f804-recovery-final-receipt.json`，总控保护复核`hb89-cleanup-preservation.json`，实际图`image-f804-original-2.5-preview.png`。

## 工作区保护与延续
- 原删除/预览启动被自动审批拒绝不得重试或绕过；全部本机archive/cleanup/prune冻结。此前359 tracked源码已恢复，但.bin/katex等依赖未恢复；不得修store、整拷node_modules、安装或伤共享junction/他人Skills/AGENTS/ADR。原Domain donor Prisma缺AcademicProfile/JournalSharedBinding，不能冒充正式suite；ESLint初始化失败不算源码lint通过。
- 仅复用已审等价隔离快照、现存同版本工具与有效CI；tmp只存ignored证据，正式文档按索引。原dependency-loss-readonly.md/dependency-validation-recovery-high.md及hb89证据保留。R08文档/示意收取不代表部署；完整历史回执与资产ID按本文件Git历史定向读取。
- Taskmaster currentTag=multistyle-research-illustration；1/4/5仍in-progress，2/3仅原子项done。node scripts/read-current-management-context.mjs与本CURRENT对齐，要求用户认可的交付不因accepted/CI/部署置done；全部授权交付完成且无剩余工作才删除心跳。
