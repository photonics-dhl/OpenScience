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
- application production=86a8f871063d8372f6cecf942f18fba662bfd3e1；rollback=5b44d893d2b024abcc31fffce3fcf2f64623443f。正常无迁移/无测试服务器build/start exit0，独立marker一致，journal/failed无；日志/opt/openscience/observations/deploy-86a8f871-20260922.log。HEAD按Git定锚；root main=acd13a712549e62f8d4b0f3c2f8f064549e226b0。
- 独立Chat provider=faa20ab05674cebc5955d6ba7de7f3fb67ca53c2，未随应用改动；自然timer enabled/active，共享浏览器未重启。sceneImage fallback配置false；原renderer sha256:4a30b091d4bdeb7dd7670a01521d30d7b32694e1f3b34977a2aa26e91669559f保留。receiver备份/容量协议见详细交接，不退到不支持长请求的旧bundle。
- 应用已含动态图修正grant>=9迁移；Domain仍要求精确恢复收据，不能以DB允许任意数字绕授权。现rollback5b44含动态格式约束，但不能消费新generic/schema回执；不能直接回滚到旧固定额度版本。
- Pro代码合作已实测原生CLI exec resume/chatgpt-web/pro/ultra/STDIN短任务读取→写报告→读回；长任务工具续接与Desktop完整补丁仍未安装，不能称全局稳定。本机桥用于代码合作，服务器image/review provider负责产品图片。

## 产品目标与交付差额
| 交付 / Taskmaster ID | 当前实际结果与剩余工作 |
|---|---|
| 论文视觉叙事 · 5 | 首篇v3已走完整真实链路，最终用户质量认可pending；第二篇四张Chat图已保存，真实6Pro四图均阻断并要求科学返工；第三篇全文/六维/v5及原设计恢复成功，5图经6Pro审阅2通过/3拒收，待整组返工。不得以task succeeded冒称科学通过。 |
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
- 第二篇来源f1bb85c8 v5已成功，私有Versiond07cfeee-c81d-4162-a469-0b431f964801。原7bd6恢复后65K science成功，末审因脉宽排序阻断，系统自动修订c65a0488-2c0b-4096-8619-bb45af25a4f5并获M3 accepted。原恢复收据/jobs/second-paper-science-resume-20260922.json已消费。run当前stopped/version13/max9；四图1dcb1f66/b4744b85/34eb749e/4a4e115c字节已保存，未发布。
- 独立High确认c65仍有强度与电场混同、跨工况共用高斯基线、额外hν、固定又扫描同一波长等错误；不能因M3 accepted公开。1dcb真实Chat6Pro已blocked/repairInstruction null，指出穿缝几何、77nm含义、虚拟脉冲限定、收尖光束误导、相遇角表述等；四图已全部正式blocked/repairInstruction null并rejected，0活动；后两张正式审计覆盖强度/电场混同、hν重复、条件矛盾等。证据tmp/second-paper-revised-narrative-read-20260922.json、second-paper-image-reviews-read-20260922.json；继续沿既有科学修订路径处理，保留全部图片与历史。
- 第三篇ROaa450f1e-fafc-46d8-a072-d935e01b0544，原PDFd04add46/4609066bytes/hash4a51048431f20950a01916b50cd87a08642881b20b0a9eac767144031ebc0b1a；原retry收据、watercolor guide及run-start收据均已消费。run b3eee57a-8a08-4867-9281-cb5b950affbf复用原SourceMap e490409c…（24页/1554blocks/818144bytes），composition1834e21d已13次text完成map/reduce/六维，sourceMapReused true，无新解析。8c87b54d v5核源成功（65K ceiling、294816ms、stop），六维约657中文字符/5Claims，Version9373f1e6-9477-4e4a-9b45-b8efca244e70。
- 第三篇a4c5990b初始thinking-only失败，经21:12:02Z原按钮HTTP202恢复同task（/jobs/third-paper-science-resume-20260922.json已消费）；exec2三次65K stop正文分别因mainMessage266>240/unknown_original_source/subject_requires_supporting_evidence失败，resultNULL/run failedv11。没有保存被拒正文，不猜具体sourceId。原SourceMap/六维/Claims保持。
- 第三篇原task exec3已完成science/art/M3末审accepted，plan a4c hashca448fd8…/5场景。五张Chat实图全部落存并完成6Pro：scene1 d6e75a46、scene3 666f1aef accepted/approved；scene0 bbef0877因补边接缝blocked（有render repair），scene2 9a86fac1、scene4 ce332e5d因科学关系/适用范围blocked（repair null）并rejected。run stopped/v16/max9，原入口canRetry/narrative-scientific-replan/6项；尚未续接。第三篇独立静态审查还发现MQED叙述中k/方向、解析解承诺问题，正式scene1像素审查未覆盖，下一稿仍须核对，不能因该图accepted放过。
- 通用全组像素反馈科学返工已实现，原retry-generation按1计划+N图/完整正式反馈/current parent/CAS/审计；旧approved sibling在新parent批准同事务退役并留审计的P1已High PASS，本次4图皆rejected无额外退役。后续科学blocked方案显式只追加1plan并继承N图的P2冻结tmp/pixel-plan-revision-review-20260922，独立High PASS；Web复用原按钮。全叙事science65K/600s/primary-only与worker singleton maintenance已High PASS/提交61c440b2，已随86a8部署。第二篇原页面仍不可恢复：RO有公开历史visibility=public而当前Version是未发布draft，被新eligibility多余visibility条件误挡；source完整4图校验有效，未POST且pixel-set-replan收据不存在。两处最小条件修复High PASS，待与画幅提示一并部署。
## 其他受保护资产与入口
- ac455b2f真实Chat产物approved；77b3f559历史Fig.2占位、557c3db6来源待核均approved，不能直接公开全部approved。d5087b03悬空draft copy；重复计划6439150a/ee9bcfb6 draft、6043bebb/75b34c88 approved，清理未获明确同意。旧占位929bd95d/6088f11b/03a160aa早先已授权删除，不能重处理。
- 能力位置/最新实际效果查docs/runbooks/hermes-capability-registry.md；完整故障/调用/部署/恢复收据查docs/handoff/2026-09-18-figure3-image-and-cleanup-handoff.md。此前中断、300秒传输、Claims缺失、长度、渲染拒收等历史已在该文件/Git保留，不按历史next action重跑。
- 下一步：两篇均停止、无在途模型。部署已High PASS的两处visibility条件与共享16:9画幅提示；原页面继续第二篇1+4、第三篇1+5整组科学返工，观察新设计/实际6Pro/reader/新公开版本。精确旧源、全部图和公开历史保留，最终用户认可pending；不因局部通过结束任务。
