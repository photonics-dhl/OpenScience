# Hermes / Workbench CURRENT Handoff
> 唯一交付树：E:/Miscellaneous/XGS/.worktrees/onchip-video-release，branch release/onchip-production-line。根 main 仅导航；旧 codex/onchip-video-release 缺 journals/学术身份，不得发版。本文独占当前执行状态，历史长证据见本次交接与 Git。

## 目标与授权
- 需求依据：docs/OpenScience_Kimi_Development_Spec.md §18.2，以及已获用户批准的 docs/proposals/2026-09-21-visual-narrative-review.html。让未读论文者通过最终六维内容、单/多图理解核心思想与关键点，兼顾叙事、科学准确和美感；原图/生图按需采用，视频暂不执行。用户明确否定原样裁出的Fig.1作为交付。
- 完整链路：原PDF → 既有Hermes全文理解/六维/Claims/Evidence及系统核源 → 既有science/art叙事设计 → Chat生图 → 6Pro真实像素审阅 → reader → 新公开版本。用户只看最终成果，中间系统推进，不伪造人工verifiedByUserId或审美认可，不另造分析器。
- 用户最新授权“允许，不限额度，你把整个任务做完”持续有效；不重复询问费用。仍不盲重发未知结果、不自动切provider；每次恢复沿原产品身份/事务/审计，先定位具体失败。
- 先完成2–3篇真实论文，覆盖学术、编辑封面、淡彩；最终用户质量认可前不批量冷启动。局部修复不取消其他交付。Taskmaster currentTag=multistyle-research-illustration；1/2/4/5进行中，3仅指此前已认可淡彩单图done。

## 执行边界
- 禁止测试/预检/演练/CI。本机仅静态阅读、编辑、Git、传输；必要服务器构建/启动、已知故障最小读取和真实产品路径先说明范围，不把构建当质量验收。
- 复用当前登录/共享桥，不重启共享浏览器、不改沙箱权限、不安装新工具。CUA本机policy恢复已耗尽；沿服务器Playwright/CDP，既有浏览器container openscience-chatgpt-browser，9233。
- 主owned tab window.name=xgs-pipeline-20260921（第二篇）；第三篇独立owned tab xgs-longpaper-20260922。脚本只操作这两页；浏览器close仅断开CDP。键盘focus/Enter可避125%缩放点击偏差；截图用viewport，fullPage可能被CDP缩放裁边。
- SSH只用infra/scripts/ssh-run.sh及C:/Program Files/Git/bin/bash.exe；不读/打印.env、secret、cookies。证据放ignored tmp/或服务器私有目录，脚本STDIN传输，禁止用户目录顶层堆文件。
- 一次性写脚本/收据不可重放；未知响应先读结果。保护原PDF、已认可图、拒收与失败历史、旧公开版本/标识。Fig.2五项清理尚未明确授权。
- 交付树与根main收尾status必须空，自己的改动提交并推送；prune/list。仅根+交付树，无新worktree。清理仅明确自有、生产者完成且不用的生成物；268日志归档不重复，也不声称根治上游argv缺陷。已结束的12份本轮长文源码staging副本删除被自动审核拦截，已安全移入tmp/archived/long-paper-staging-20260922，restore.json保留路径/内容/ACL，移动后ACL一致；base-head与实现交接原位保留，无活动生产者。

## 版本与独立能力
- application production=1a2efd317e2fffbd561245b7c65bec41abcff671；rollback=2b17a3552b386587bab68c1c1f2fbd2e97177c3f。正常无迁移/无测试服务器build/start exit0，独立marker一致，journal/failed无；日志/opt/openscience/observations/deploy-1a2efd31-20260922.log。HEAD按Git定锚；root main=acd13a712549e62f8d4b0f3c2f8f064549e226b0。
- 独立Chat provider=dd6b53999b12324673a82084a01f9e7cd865137b，已按原三锁备份/空闲切换安装，timer恢复原enabled/active，共享浏览器未重启。sceneImage fallback配置false；原renderer sha256:4a30b091d4bdeb7dd7670a01521d30d7b32694e1f3b34977a2aa26e91669559f保留。最近备份provider-backup-20260922-keyboard-dd6b5399；不能退到不支持长请求的旧bundle。
- 应用已含动态图修正grant>=9迁移；Domain仍要求精确恢复收据，不能以DB允许任意数字绕授权。当前rollback兼容已用generic/schema/pre-provider回执；新增exec3持久化恢复开始后不交给仅支持exec2的旧worker，优先前向修复；不能直接回滚到旧固定额度版本。
- Pro代码合作已实测原生CLI exec resume/chatgpt-web/pro/ultra/STDIN短任务读取→写报告→读回；长任务工具续接与Desktop完整补丁仍未安装，不能称全局稳定。本机桥用于代码合作，服务器image/review provider负责产品图片。

## 产品目标与交付差额
| 交付 / Taskmaster ID | 当前实际结果与剩余工作 |
|---|---|
| 论文视觉叙事 · 5 | 首篇v3已公开，最终用户质量认可pending；后两篇原全组科学返工已生成新计划/实图，混合科学拒收与技术失败仍待处理。第二篇已从OOM原会话取回正式拒收，第三篇已有1新图通过/2科学拒收，完整读者页和新公开版本未完成。 |
| 学术机制图 · 1 | 首篇新8bbc通过6Pro并公开v3，原图/失败候选保留；等待最终用户反馈。历史145af7bf/父d0b36138 approved未纳入v2，旧a7488c14认可版面但资产rejected，不改回状态。 |
| 编辑封面 · 2 | 当前以第二篇完整叙事run7e9e为交付；历史51eb/e253未放行、aaf7 blocked无新Chat图，不能重跑旧任务代替当前方向。 |
| 淡彩手绘 · 3 | aa41a018-b2ff-4ffb-9557-19ecabe104bc已获用户明确认可/approved并在公开v2；保护。第三篇后续按内容采用淡彩叙事，不把旧单图认可当整套完成。 |
| 检索 / 管理补接 · 4 | 两篇dense58/58、42/42及真实hybrid召回曾实见；Pro短合作有效。科学审阅质量与Desktop未安装补丁边界保留，不由发布成功标done。 |
| Fig.3恢复/原图reuse | 9f7ff671恢复图用户认可。Fig.1 source c1e2c18d/plan39f26074/copy6871真实原字节复用并公开v2，但用户否定直接展示效果；保留原件/历史，不冒认叙事通过。8141b5fd原Fig.3计划不改。 |

## 首篇：完整真实图文已发布
- RO9067a2d5-42ad-4c06-b234-753728b71064；run e3ef004f-38bb-4fa2-88e4-e6df4f07a0b2 succeeded/version53/max14；Version3051b0c5-a51e-4ddd-833b-b232578bf0ee为公开v3，6字段821中文字符/6Claims/58Evidence。原PDF4b94c626/568765bytes/15页保留。
- 已审计划5226fcf5，真实Chat图8bbcfd9b-95a9-4bdd-a202-3ebfb61594e3，1280×720/526396bytes/hash778815c8fd54996e99abbad2e6d39a17edcf294f109e615cb56015e1d2fff8a8。6Pro审计90ada2a8 accepted，原763b渲染拒收保留；本机tmp/visual-narrative-8bbcfd9b-20260922.png已实看。
- 0c已修发布只认人工字段的断点：共享helper消费已有evidence.system_verify/同源v5完整审计，未变保存/恢复继承也受既有冻结内容与唯一谱系约束；不填人工字段。High PASS，真实发布已通过。继承分支仅静态审查，未新造副本实跑。
- 真实原overview→更多工具→发布→仅选8bbc→review passed→状态审批→publish201→“查看公开RO”。https://openscience.428312321.xyz/research/OSR-2026-000023/v/3，publishedAt2026-09-21T19:48:46.366Z，hashd34d5d70344cc7f7f6ee0ed7906836d74492cc9a815a5ceb188b7dbdcbe88c66。匿名v1/v2/v3均200、旧正文/hash不变；v3附件workspace_member，许可text/data CC-BY-4.0/code MIT不变。
- 已消费/jobs/visual-narrative-system-verified-publish-20260922.json，匿名观察visual-narrative-public-v3-observe-20260922.json；viewport截图已实看，新图完整、图注16px/28px且无DOM横溢出。最终用户科学/审美认可尚未取得。

## 后两篇：当前阻塞与续作
- 第二篇ROc896802c-35dd-4b59-8db1-5f374f83a6d8（deep-sub-cycle pulse），原PDF7bb96cc1/3770010bytes、公开v1保护。guide ab76b22e明确editorial；独立High选needs_review840e24f9而非confirmed2fdb，避免旧v4确认来源无法composition。原UI启动run7e9e1f3e-eafe-440a-be0f-7ff1ed349a8b，/jobs/second-paper-editorial-run-start-20260922.json已消费。
- 第二篇来源f1bb85c8 v5已成功，私有Versiond07cfeee-c81d-4162-a469-0b431f964801。原7bd6恢复后65K science成功，末审因脉宽排序阻断，系统自动修订c65a0488-2c0b-4096-8619-bb45af25a4f5并获M3 accepted。原恢复收据/jobs/second-paper-science-resume-20260922.json已消费。旧run stopped/version13/max9；四图1dcb1f66/b4744b85/34eb749e/4a4e115c字节已保存，未发布。
- 独立High确认c65仍有强度与电场混同、跨工况共用高斯基线、额外hν、固定又扫描同一波长等错误；不能因M3 accepted公开。1dcb真实Chat6Pro已blocked/repairInstruction null，指出穿缝几何、77nm含义、虚拟脉冲限定、收尖光束误导、相遇角表述等；四图已全部正式blocked/repairInstruction null并rejected，0活动；后两张正式审计覆盖强度/电场混同、hν重复、条件矛盾等。证据tmp/second-paper-revised-narrative-read-20260922.json、second-paper-image-reviews-read-20260922.json；继续沿既有科学修订路径处理，保留全部图片与历史。
- 第三篇ROaa450f1e-fafc-46d8-a072-d935e01b0544，原PDFd04add46/4609066bytes/hash4a51048431f20950a01916b50cd87a08642881b20b0a9eac767144031ebc0b1a；原retry收据、watercolor guide及run-start收据均已消费。run b3eee57a-8a08-4867-9281-cb5b950affbf复用原SourceMap e490409c…（24页/1554blocks/818144bytes），composition1834e21d已13次text完成map/reduce/六维，sourceMapReused true，无新解析。8c87b54d v5核源成功（65K ceiling、294816ms、stop），六维约657中文字符/5Claims，Version9373f1e6-9477-4e4a-9b45-b8efca244e70。
- 第三篇a4c5990b初始thinking-only失败，经21:12:02Z原按钮HTTP202恢复同task（/jobs/third-paper-science-resume-20260922.json已消费）；exec2三次65K stop正文分别因mainMessage266>240/unknown_original_source/subject_requires_supporting_evidence失败，resultNULL/run failedv11。没有保存被拒正文，不猜具体sourceId。原SourceMap/六维/Claims保持。
- 第三篇原task exec3已完成science/art/M3末审accepted，plan a4c hashca448fd8…/5场景。五张Chat实图全部落存并完成6Pro：scene1 d6e75a46、scene3 666f1aef accepted/approved；scene0 bbef0877因补边接缝blocked（有render repair），scene2 9a86fac1、scene4 ce332e5d因科学关系/适用范围blocked（repair null）并rejected。旧run stopped/v16/max9，原入口canRetry/narrative-scientific-replan/6项已实见。旧独立报告的k/类比疑点已被同一SourceMap全文纠正：Box1明确k为方向索引，导言明确类比；新04f静态科学PASS。旧解析解承诺与取代选择定则问题确实存在，已在新稿修正。
- 通用全组反馈/P1/P2、65K及独立maintenance已High PASS并随86部署；父RO visibility误挡当前draft的两行修复和scene-image共享16:9提示也High PASS并随b7上线。原页面第二篇22:37:49Z HTTP202→新plan b88773b7-040e-4443-88d0-e03cb8e4bbe5、runv14/max14（追加1+4）；第三篇22:38:01Z HTTP202→新plan04f19794-7c86-487b-8e37-aa265cc83a3d、runv17/max15（追加1+5）。两份/jobs/{second,third}-paper-pixel-set-replan-20260922.json均已消费，禁止重放；原PDF/Claims/来源/旧图/公开版本保留，两task随后在模型前因storyboard:request_values失败（exec1/retry0/resultNULL）：第二篇runv15、第三篇v18；对应Gateway新调用为0，原授权与计划任务保留。
- 37048恢复真实结果：第二篇b887 science356s/65K、art及末审accepted，run生成4图/version18；第三篇04f science101s/art100s/末审accepted，planapproved并生成5任务。第三篇新scene0 11f0c514正式6Pro accepted，1280×720实图已看（tmp/third-paper-new-scene0-11f0c514-20260922.png）；scene1 95f087f2正式blocked/null，真实问题为FDT桥、j/G→A关系及“介质量子化”歧义。另b9020f19图生成失败无资产、9eab55dc图已存但review provider failed；run failed/version22/max15，GET无canRetry，正在查spool与原动态恢复入口，勿重发。df0be6a2已审，其正式结果待读取。
- 单行审图提示强化已High PASS但暂不部署，冻结tmp/generated-reader-review-prompt-20260922.patch；旧任务必须按原promptHash消费已完成审阅，不能先改prompt。正常review-runner先上传后填正文/发送前逐字核对候选High PASS，原9eab只收到图片与询问答复，不伪造正式审阅。
- 23:19:39Z浏览器4GiB触顶OOM已由内核确证。High批准后在线升8GiB，原container与安全/network/PID/shm不变、无重启；只关闭Inspector.targetCrashed确证的080自有死页，全局attach恢复。原broker23:54:30Z收回080的948bytes正式blocked/null JSON；第二篇run现failed/v19，其余477未审与363/ce336未提交失败保留。资源/关页/结果证据见详细交接。
- 2b17已交付上述混合终态、not-submitted旁证、完成审阅只读consumer、正常composer及原M3末审一致性提示。三条未提交旁证由broker自然补齐；080于00:22:13Z原页面HTTP202恢复，exec2成功/73ms消费原6Pro正式blocked/null，零新provider提交，audit fc09766b。随后第二篇runfailed/v21，第三篇failed/v22，原GET均开放narrative-scientific-replan（5/6项）。
- 00:24:44Z第三篇原按钮HTTP202→新plan53f08786-01b4-4ef4-adba-9b44ecd41aad/runv23；00:24:58Z第二篇HTTP202→新plan221d52ce-eaab-4bc1-afdf-fba445524114/runv22。/jobs/{second,third}-paper-mixed-terminal-replan-20260922.json及second-paper-completed-review-resume-20260922.json已消费。新科学规划在途，不重发；原来源/六维/Claims与旧图保护。
- 最新两plan均获M3 accepted，8张Chat图落存；8条review在Send前PROMPT_CHANGED，实际富文本innerText增换行且附件显示时间戳后缀，完整非空白正文未丢。5544071b已修并只更新provider；新真正审阅待恢复。第二篇runfailed/v25/max17、第三篇failed/v26/max20；f0fd1907图在队列EXPIRED且无private started/job，需补既有not-submitted事实支持。独立科学复核仍发现第二scene3 narration固定波长又扫描、第三漏“线性介质”边界，不能直接发布。
## 其他受保护资产与入口
- ac455b2f真实Chat产物approved；77b3f559历史Fig.2占位、557c3db6来源待核均approved，不能直接公开全部approved。d5087b03悬空draft copy；重复计划6439150a/ee9bcfb6 draft、6043bebb/75b34c88 approved，清理未获明确同意。旧占位929bd95d/6088f11b/03a160aa早先已授权删除，不能重处理。
- 能力位置/最新实际效果查docs/runbooks/hermes-capability-registry.md；完整故障/调用/部署/恢复收据查docs/handoff/2026-09-18-figure3-image-and-cleanup-handoff.md。此前中断、300秒传输、Claims缺失、长度、渲染拒收等历史已在该文件/Git保留，不按历史next action重跑。
- 37048da2已High PASS并部署：共享parser允许原1–6图范围，生产端持久化前复用同一parser；managed task禁止脱离run单独retry。原retry-generation新增精确模型前失败的一次同task恢复：零Gateway audit/result/asset、完整root receipt/来源/全组审阅复核，task/step/run三重CAS，不增加max或任务数，worker exec2各阶段验receipt且保持primary-only。初始science恢复也移除父RO公开历史误挡私有draft。原页面23:04:33Z/23:04:49Z均HTTP202恢复b887/04f，runv16/v19，原任务exec2/max不变，已进入规划。
- 最新：应用已移除独立6/8标签数量限制（仍保留单条与总传输预算），provider已交付队列deadline顺序/EXPIRED未提交证明和键盘Send。8项一次性review恢复得到6份真实6Pro结果；1bbc已留Send但无会话，a90未Send失败，均不盲重发。1354恢复死页以Inspector.targetCrashed确证后精确关闭，CDP恢复、无新OOM或浏览器重启。结果已全部由broker收回；其避免重开已完整结果页的小修复High PASS、候选待部署。
- 原产品01:21:03Z/01:21:47Z两次HTTP202零新模型消费保存结果，收据/jobs/{third,second}-paper-terminal-review-resume-20260922.json已消费。4项exec2成功；a82与eb5在并发version.updateMany写入P2034失败，run现failed/v28及v27、max20/17，step仍running令恢复入口关闭。下一步修持久化事务并恢复保存结果，再用真实反馈修科学计划，完成reader/新公开版本。完整源/图片/审阅和历史保留。
