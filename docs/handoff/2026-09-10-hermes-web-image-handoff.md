# Hermes / Workbench CURRENT Handoff
> 唯一交付树：E:/Miscellaneous/XGS/.worktrees/onchip-video-release，branch release/onchip-production-line。根 main 仅导航；旧 codex/onchip-video-release 缺 journals/学术身份，不得发版。本文独占当前执行状态；长证据见本次交接和 Git。

## 目标、授权与边界
- 需求：docs/OpenScience_Kimi_Development_Spec.md §18.2及已批准docs/proposals/2026-09-21-visual-narrative-review.html。让未读论文者通过六维内容、单/多图理解核心思想和关键点，兼顾叙事、科学准确与美感；原图/生图按需，视频暂不执行。用户否定原样裁出的Fig.1交付。
- 完整链路：原PDF → 既有Hermes全文理解/六维/Claims/Evidence及系统核源 → 既有science/art叙事 → Chat图 → 6Pro像素审阅 → reader → 新公开版本。用户看最终成果，中间系统推进；不伪造人工verifiedByUserId或用户审美认可，不另造分析器。
- 最新授权“允许，不限额度，你把整个任务做完”持续有效，不重复问费用。先完成2–3篇真实论文/学术、编辑封面、淡彩；最终用户质量认可前不批量冷启动。保留全部未完成目标，不盲重发未知请求或自动切provider。
- 禁止测试/预检/演练/CI；本机仅静态阅读、编辑、Git、传输。必要服务器构建/启动、已知故障最小读取和真实产品路径已说明范围；构建不等于质量认可。
- 不重启共享浏览器、不改沙箱、不安装新工具。本机CUA policy恢复已耗尽；沿服务器Playwright/CDP，openscience-chatgpt-browser/9233；close只断CDP，自有页面名xgs-pipeline-20260921（第二篇）/xgs-longpaper-20260922（第三篇）。125%缩放用唯一可见按钮focus/Enter，截图viewport。
- SSH仅infra/scripts/ssh-run.sh及C:/Program Files/Git/bin/bash.exe，XGS_CONFIG_ROOT=根；不打印.env/Secret/cookies。证据放ignored tmp/或服务器私有目录，不在用户顶层生成。
- 一次性writer/收据不可重放，未知响应先读结果。保护PDF、已认可图、失败/拒收历史及旧公开版本；Fig.2五项清理仍未获明确同意。
- 根main与交付树收尾status空，自己的改动提交推送，prune/list；仅根+交付两树。清理只限明确自有已结束不用的产物；268日志归档不重复，不声称根治argv。12份长文staging已移tmp/archived/long-paper-staging-20260922，restore.json含路径/ACL，原base-head/交接保留；不重删。

## Git、部署与恢复边界
- application production=8c0edd6c989f2acebb7162d70fecb00fd9e849e2；rollback=f44dc25c653c3013182c192f06f1ded155765ea2。正常服务器build/start exit0，无迁移/测试，独立marker一致、journal/failed=false。日志/opt/openscience/observations/deploy-8c0edd6c-20260922.log；HEAD按Git定锚。root main=acd13a712549e62f8d4b0f3c2f8f064549e226b0。
- 独立Chat provider=d8305c93c0d87b7923c617800056c29246ac892b；安装时Gateway及依赖与a78未变，复用其服务器dist，f44内部末审授权不改Chat协议。原三锁/空闲备份安装exit0，两unit和timer active独立读回，无共享浏览器重启；备份provider-backup-20260922-existing-image-recovery-d8305c93。renderer仍sha256:4a30b091d4bdeb7dd7670a01521d30d7b32694e1f3b34977a2aa26e91669559f，sceneImage fallback=false。
- 新队列预算当前4worker=65分钟、最多8=125分钟；private/started固定领取后最多10分钟执行，Codex原10分钟。一次image oneshot只慢恢复或新生成，原660秒不改。旧请求/deadline/身份不变；覆盖单实例本波次，不保证任意旧积压。provider必须先于新producer，长请求在途时600秒部署排空不够，先自然终态。六文件两P1修正后High静态PASS。
- 技术子集恢复已High两P1修正后PASS：原GET/retry-generation+收据/CAS/来源/实际任务数；不重做已通过方案，保留accepted sibling，可信not_submitted才替代失败任务；review-only复用原PNG字节。exec2继续同reservation，不误入completed-only；动态text审计独立分类。primary-only禁止切provider；本轮四任务已提交，不能交旧worker或回退额度/删marker，优先前向修复。
- 新science/终审几何可实现性与视觉分组条件检查两句High PASS并已部署；原b285反馈隔离/当前encoding权威仍有效。没有新科学分析器、模型阶段或正则门禁。c855键盘plus、review真实正文差异安全诊断仍保留。
- 既有P2034仅事务有限重试、完整job结果复用、exec3已知持久化失败恢复均已交付；不重放历史收据。DB visual grant已>=9，无新迁移；收据授权仍严格，旧固定额度/仅exec2应用不兼容已用新收据。
- 本机Pro短CLI exec resume/chatgpt-web/pro/ultra真实读写回合有效；Desktop完整补丁未装。本机合作与服务器provider分开。服务器新scene/修订task均新Chat会话，revisionAssetId只读repair文本、不带原图编辑，referenceImage仅风格；同task恢复只取原结果，不追加消息。06:10原collaborate固定Pro任务只读诊断已exit0、4次静态命令exit0，log tmp/pro-collaboration/2026-09-22T06-10-23-811Z.jsonl；无共享桥改动。Codex任务续接不冒称同GPT网页对话。

## 交付差额（Taskmaster currentTag=multistyle-research-illustration）
| 交付 / ID | 实际结果与剩余工作 |
|---|---|
| 完整叙事 · 5 | 首篇v3已公开；后两篇已沿原入口继续Hermes新方案，最新任务及收据见文末。reader/新公开版本未完成，全部最终用户质量认可pending。 |
| 学术机制 · 1 | 首篇8bbc通过6Pro且公开v3；旧原图/失败候选保留，待用户反馈。旧145af7bf/父d0b36138不冒认v2公开，旧a7488c14资产rejected保持。 |
| 编辑封面 · 2 | 当前第二篇run7e9e完整叙事；旧51eb/e253/aaf7不放行、不重跑代替本目标。 |
| 淡彩手绘 · 3 | 旧aa41a018-b2ff-4ffb-9557-19ecabe104bc用户认可/approved/公开v2，保护。第三篇整套淡彩仍待完成，不把旧认可扩大。 |
| 检索/管理 · 4 | dense58/58、42/42及hybrid曾实见；Pro短合作有效。科学质量/Desktop完整补丁边界仍在，不因部署置done。 |
| Fig.3/原图reuse | 9f7恢复图用户认可；Fig.1 c1e2/39f/6871真实原字节复用公开v2但展示被用户否定。保留原件/8141b5fd，不冒认叙事通过。 |

## 首篇已公开（保护，不重做）
- RO9067a2d5-42ad-4c06-b234-753728b71064，Version3051b0c5-a51e-4ddd-833b-b232578bf0ee公开v3；run e3ef004f-38bb-4fa2-88e4-e6df4f07a0b2 succeeded/v53/max14。6字段821中文字符/6Claims58Evidence；原PDF4b94c626/568765bytes/15页。
- plan5226fcf5；图8bbcfd9b-95a9-4bdd-a202-3ebfb61594e3，1280×720/526396bytes/hash778815c8fd54996e99abbad2e6d39a17edcf294f109e615cb56015e1d2fff8a8；6Pro90ada2a8 accepted。tmp/visual-narrative-8bbcfd9b-20260922.png已实看；旧763b拒收保留。
- 原overview→更多工具→发布→仅8bbc→review passed→publish201→公开链接真实完成。https://openscience.428312321.xyz/research/OSR-2026-000023/v/3；2026-09-21T19:48:46.366Z，hashd34d5d70344cc7f7f6ee0ed7906836d74492cc9a815a5ceb188b7dbdcbe88c66。匿名v1/v2/v3均200，旧SDF/hash不变；PDF workspace_member，text/data CC-BY-4.0/code MIT。
- 发布消费真实evidence.system_verify/同源v5完整审计，未伪造人工字段；继承分支仅静态审查。/jobs/visual-narrative-system-verified-publish-20260922.json已消费；viewport已看，无横溢出，图注16px/28px。最终用户科学/审美认可pending。

## 第二篇：新方案通过、四图已生成，像素审阅在途（见文末）
- ROc896802c-35dd-4b59-8db1-5f374f83a6d8（deep-sub-cycle pulse），私有Versiond07cfeee-c81d-4162-a469-0b431f964801，run7e9e1f3e-eafe-440a-be0f-7ff1ed349a8b。原PDF7bb96cc1-bb6f-4d3b-b0bf-352f41971faf/3770010bytes；source f1bb85c8 v5 succeeded；六维131/87/69/290/91/289字符、7Claims27Evidence；guideab76b22e editorial。原公开OSR-2026-000022/v/1/hash e0a8bd972fe2baca099ae198af4b8c02fc7fb503e0902ea476ebc6309a5db4c8保护。
- 05:57:22Z原按钮202，同task82c627a4-f253-4a10-94b3-716fa9708666 exec3/retry2仅续末审并approved/M3 accepted；4图357d6ac1/8d2257fc/2dff8d1a/7ab89e78均真实生成/实看，7ab由原请求恢复、未重发。现4图6Pro均blocked/null：几何/尺度/归属/φ、方法输出I(t)与等光程条件缺项、99as错误对比50as、调参适用域/THz限制；run stopped/v48/max32，实际GET科学返工5项可用，未提交。完整f44-current-scene-reviews-20260922.json、f44-two-current-plans-20260922.json、f44-terminal-product-read-20260922.json。second-paper-saved-final-resume已消费；先修已知设计问题，禁止原样重跑。
- 前序plan82c6 failed/exec1/retry0/resultNULL，run stopped/v41/max32，原GET无恢复入口。science主MiniMax-M3 65K/stop/303594ms完成；随后art 16K/300004ms provider_timeout，无fallback，错误Primary provider failed。未保存science中间结果，不能伪造checkpoint；既有同task规划恢复两文件已完成并High静态PASS，已交付，全文/六维不重做。
- 03:20:52Z原页面HTTP202→新plan82c627a4-f253-4a10-94b3-716fa9708666，run generating_storyboard/v40；/jobs/second-paper-geometric-replan-20260922.json已消费，原v39/max27的5项科学返工入口提交。新来源分析未重跑；后续由Hermes修叙事、Chat出图、6Pro审图。
- 直接前序cb342计划approved，4图均完成：459f6bba accepted/approved；4c61b962科学blocked/null（不可能的穿缝几何、无数据定量轮廓、up to30dB限定丢失等）；7b73b96b科学blocked/null（构图要求文字不在排他标签清单）；a1e22cc8渲染blocked/有repair（下标、箭头归属、渐变）。完整官方回执tmp/current-encoding-image-review-read-20260922.json，4c61/7b73 PNG已看。全部旧图/审计保留，不发布拒收图。
- 更早f522/e8bd等通过和拒收资产、各次请求/故障均保留；b285已隔离旧科学反馈覆盖art/currentencoding的问题。真实原始全文是事实依据，审查建议不是科学来源；不能照抄公式或手改科学内容冒充Hermes。

## 第三篇：新science成功但art JSON失败，原中间产物未保存（见文末）
- ROaa450f1e-fafc-46d8-a072-d935e01b0544（Light–matter interactions with photonic quasiparticles），私有Version9373f1e6-9477-4e4a-9b45-b8efca244e70，尚无publicID；runb3eee57a-8a08-4867-9281-cb5b950affbf。原PDFd04add46-9d96-443b-aae1-c1dfc1ecbadb/4609066bytes/hash4a51048431f20950a01916b50cd87a08642881b20b0a9eac767144031ebc0b1a。
- 原SourceMap e490409c…（24页1554blocks818144bytes）复用，composition1834e21d13次原map/reduce；8c87b54d v5核源65K/294816ms/stop，六维657字符/5Claims30Evidence。guideaad65431 watercolor；approved父plan cb2a7a69-8adc-461e-aa9c-6a2352b60ab1保留，不重做科学分析或方案。
- 04:03:49Z原按钮HTTP202→新plan606261f7-d539-465f-bc96-c79db549cfb2，已approved/5图任务；04:29 run failed/v42/max37。8d4f新PNG被6Pro拒收（新增G→j依赖），c482新PNG像素accepted，但原方案仍有标题支撑整段类比、线性条件缺失及固定同向箭头等已知科学问题，不发布。/jobs/third-paper-symbol-source-replan-20260922.json已消费。
- 34d30e5c原图已在原会话生成1672×941，3次Save DOWNLOAD_TIMEOUT，output空/UNCERTAIN；96710033已提交后image_result失败/恢复超时，Inspector未发现crash；6cf47f56未提交/BROWSER_ATTACH_TIMEOUT。05:07原34页对话访问限流，05:33已恢复，但原grace已过；不延旧deadline。05:58正式只读helper证实8d4f的6Pro blocked含非空repairInstruction（仅删G→j），不是科学blocked/null；更正前序摘要。f44 GET无科学返工入口是正确，不能伪造该锚点，third-current-replan-block-read-20260922.json留证。
- 新30条Evidence池已实读：1e07仍只有Photonic quasiparticles标题，合法pool不含Rabi/Compton/Thomson导言。原SourceMap确有类比，但旧冻结lineage不能手补；当前返工须缩窄，若保留则沿既有来源审阅新lineage。scene1卷积现有bf271f76可用且应保留线性前提。M3末审及部分6Pro像素accepted不能消除此已知缺口；独立只读结论及tmp/third-paper-source-pool-read-20260922.json保留。
- 前序run failed/v38/max31，原GET已真实提供narrative-scientific-replan/6项。719/092faccepted；cc6e/cb450科学blocked/null（符号定义缺失、节点语义/方向/具体类比来源绑定等）；707已有PNG但review not_submitted/EXECUTION_FAILED。完整tmp/third-technical-subset-review-read-20260922.json；cc6e及092f本机PNG已实看。后续科学返工路径已独立High静态PASS并由真实GET证实。
- 03:20:29Z原按钮HTTP202，run generating_scene_images/v37；/jobs/third-paper-technical-subset-resume-20260922.json已消费。原v36/max27失败状态显示image-render/4任务入口，真实提交仅新增4项：scene1 cc6e78fa-5bde-42ad-bfda-81eef9fd9fe7为原cf6 PNG的review-only引用；scene2 cb450919-527f-4c8c-bb53-5586ba05d553、scene3 092fdf4b-5156-402a-b703-9a0d7f4e12ee、scene4 707f7a11-8ee7-44c5-9e5e-fc13a959a386为无PNG失败的替代任务。不能重放writer。
- scene0仍原719a330d-1672-42e0-8602-1aa41477880c，PNG+6Pro accepted；1280×720/1155387bytes/hash8a3a8d310a1c67ffcf5a4e8b75a62aab662d7c970a6e94a77c2dd60f1ce7b0d6，本机tmp/third-paper-719a330d-20260922.png已看。旧run失败时asset draft/awaiting_approval，后续正常reconcile处理，非用户审美认可。
- 原cf6da3e9已有PNG，审阅not_submitted/PROMPT_CHANGED；77d527ce/1ff93430/a2480121无PNG且not_submitted，分别image_mode_plus/TimeoutError、page_selection/Error、image_mode_plus/TimeoutError。剩余时间足够，不归因排队EXPIRED；1ff与Mojo/seccomp同窗但不能绑定/OOM定因，cf6真实差异未知。旧请求/deadline/资产不改，可信旁证由broker自然发布。
- 源边界：Box1 k是方向索引，intro明确PINEM/Rabi及自由电子类比，旧相反批评已撤回。MQED建模适用线性介质不等于全部准粒子定义只能线性；相位匹配无来源固定角度与速率/荧光增强混同已由原审阅修正。只以原SourceMap支持，不凭审查建议造事实。

## 新故障修复候选与下一动作
- download-only修复已交付但未实际恢复34，原operationDeadline=1790050663088的一小时grace已过。output-resume/32K600秒已High PASS并f44部署，第二篇真实续末审成功。mixed unknown科学返工单文件High PASS并部署，但第三篇没有blocked/null锚点，未消费新收据；不把修复上线当作入口有效或篡改审查记录。技术恢复仍拒绝unknown。
- 05:33原34页readyState complete/profile可见/原图complete且无dialog，正常访问已观察；无新登录/模型请求，原自动grace仍过期。原SourceMap精确block:…:2:16已只读确认为heading/text Photonic quasiparticles。handler复用原SourceMap向配图投影context、源支持守卫消费relation，两文件候选经High兼容性修正后PASS；旧未传relation调用保持、Evidence身份不改。第二篇8个basis实读7正文/1图注，不受标题限制。现有reanalysis仍会完整重做六维并新lineage/newrun，本轮未执行。
- 单文件review-runner候选High PASS（tmp/review-composer-repair-20260922.patch）：新安全诊断确证两个任务fill后只剩65字保护前缀，正文缺失，具体Playwright/网页状态责任未分清；707第二次另为SEND_NOT_READY，cb450原第二次成功提交。仅未提交/同draft/严格非空前缀或精确正文但Send disabled，原附件/模型/模式/form仍有效时按现有keyboard.insertText一次完整重填；同deadline内再确认所有守卫，不增页面/任务/发送次数，仍不匹配即失败。已随a78交付。第二篇timeout恢复Domain/research-run.ts与worker/handler.ts已冻结并独立High静态PASS，原storyboard_planning_retry同task一次exec2/charge1/max不变，原两条audit与超时结果未知明确保留；该轮现已终态，后续只见上文当前记录。
- 用户新纠正：优先补齐Hermes产品skills/MCP与学习反馈，不能默认靠6Pro增加延迟。Chat plan末审路由/容量候选已撤下活动树、完整补丁存tmp/chat-plan-final-review-20260922，未部署/调用；M3末审保持。实际82/606 checkpoint证明critical-thinking v3、自有illustration v7及对应Baoyu参考已消费；问题不是未安装。固定source packet/无工具回读、同chain反馈未到末审、跨任务经验未消费是当前断点，详见能力台账。
- 自有runtime Skill v8候选仅去过时Chat固定路由文字、服从caller的accepted/blocked或局部art correction权限，loader版本同步；独立High静态PASS，未部署/未实际消费。进程有Markdown缓存，待当前请求自然终态后随正常worker构建启动，不热改在途prompt。私有检索context的小补丁仍只设计，尚未实现/调用；完整sourcePassages另传，不能把18K窗口当已证全部误判根因。
- source-support及previousDefectReport已High PASS并随8c0部署，M3路由保持；旧approved图/unknown不改。06:54原UI两次HTTP202：第二篇科学返工→15b302e7-247e-4e63-b861-6da1f2688901/runv49；第三篇真实来源失效返工→40026425-6df0-4c16-8c32-56e5b365808b/runv43。此前GET分别scientific/5项、source-support/6项，证据tmp/source-feedback-product-read-20260922.json。/jobs/second-paper-defect-aware-replan-20260922.json和third-paper-source-support-replan-20260922.json均已消费，禁止重放；第二篇15b已M3 accepted并进入四图审阅；第三篇400 science成功但art三次JSON失败，resultNULL/run stopped44/max43。旧third-paper-evidence-scoped-replan始终勿运行；reader→新公开版本目标保持。
- 最新第二篇run generating_scene_images/v51/max37，新图d6fc87fe/1ea36453/38b488fd/dd07aa6a已实看，仍有标尺比例/调参条件缺陷，原像素审阅在途，未发布。第三篇400无可恢复science或invalid art正文；通用私有science/art检查点及原retry-generation恢复已独立High设计、正在实现，未部署。当前NULL只可明确完整planning restart，不冒称art-only；不新建分析器或按task特判。证据/详情见09-18交接顶部。
- tmp/remaining-paper-progress-read-20260922.cjs读当前steps/tasks；tmp/two-paper-current-product-read-20260922.cjs读原UI GET；tmp/current-two-paper-scene-reviews-read-20260922.cjs按两run当前scene IDs读取，tmp/two-paper-current-plans-read-20260922.cjs固定本次82c6/606；tmp/current-encoding-image-review-read-20260922.cjs仍指前序第二cb342+第三cb2旧任务，不误作新任务集合。新ID见上；更新读取另存文件，原证据不覆盖。
- 历史writer全部已消费：current-encoding/geometric/symbol-source replan、art-timeout-resume、technical-subset-resume、quantitative/complete-label/mixed-terminal/pixel-set/science/planning恢复、terminal-review/persistence恢复、review-not-submitted-resume、1354死页关闭、首篇publish。详细收据/时间与已修故障见docs/handoff/2026-09-18-figure3-image-and-cleanup-handoff.md，不按历史next action续跑。
- Fig.2 d5087b03悬空copy、重复6439150a/ee9bcfb6 draft及6043bebb/75b34c88 approved未获清理许可；ac455、77b3、557c等历史approved不等于全部可公开。旧929/6088/03a占位已授权清理完成，不重处理。
- 能力断点/调用方见docs/runbooks/hermes-capability-registry.md；部署/回退见deployment.md。候选审查冻结tmp/narrative-technical-recovery-review-20260922与tmp/image-queue-deadline-review-20260922；全部High PASS、现已部署，但新恢复最终模型结果尚未观察，不宣称全链路完成/永不故障。
