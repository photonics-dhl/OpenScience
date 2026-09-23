# Hermes / Workbench CURRENT Handoff
> 唯一交付树 E:/Miscellaneous/XGS/.worktrees/onchip-video-release；canonical branch 为 release/onchip-production-line，另有独立集成候选 codex/visual-journal-integration-20260923。根 main 仅导航，旧 codex/onchip-video-release 不得发版。历史调用、审阅、已消费脚本见[09-18交接](2026-09-18-figure3-image-and-cleanup-handoff.md)，不按历史 next action 重跑。

## 目标与授权
- 需求基线§18.2及已批准docs/proposals/2026-09-21-visual-narrative-review.html：未读论文者通过六维内容和单/多图理解核心思想与关键点，兼顾科学准确、叙事和美感。用户否定原样裁出Fig.1；原图/生图按需，视频尚不执行。
- 原链路：PDF → Hermes已审全文/六维/Claims/Evidence → science/art叙事 → Chat图 → 6Pro像素审阅 → reader → 新公开版本。用户只看最终成果，中间由系统推进；不重造全文分析器，不伪造人工核验或用户审美认可。
- “允许，不限额度，你把整个任务做完”持续有效，不再问费用。先完成三篇/学术、编辑、淡彩；最终用户质量认可前不批量冷启动。不盲重发未知请求、不自动切provider。
- 最新纠正优先用好Hermes的skills、工具及反馈；默认6Pro plan末审候选已撤下并归档tmp/chat-plan-final-review-20260922，未部署。science/art/final仍M3、Chat仍负责生图；用户改用5.6Sol看图，当前只作本任务独立咨询，产品正式Sol像素审阅尚未接线，旧6Pro历史收据保留。跨任务自学习尚未实现。

## 执行边界
- 2026-09-23 用户澄清：避免无关、重复或过度测试，但新 Skill 与链路改动须做针对性测试、必要 CI 和真实效果核验；本机可做相关构建/测试。范围按 AGENTS.md，模型 accepted 或容器 healthy 不能替代科学与画面质量。
- 不重启共享浏览器、不改沙箱、不安装工具。SSH仅infra/scripts/ssh-run.sh，显式C:/Program Files/Git/bin/bash.exe，XGS_CONFIG_ROOT=E:/Miscellaneous/XGS；不打印.env/Secret/cookies。
- 本机CUA policy恢复已耗尽；复用服务器openscience-chatgpt-browser的Playwright/CDP9233。自有页面名xgs-pipeline-20260921（第二篇）、xgs-longpaper-20260922（第三篇）；125%缩放用唯一按钮focus/Enter；close只断CDP。tmp/pipeline-browser-continue-20260921.ps1是现有入口。
- 一次性writer先看原私有收据，已消费/未知不得重放。保护PDF、旧/认可图片、失败审阅与旧公开版本，不手改任务/来源/结果来放行。所有本机证据留ignored tmp/；不得堆用户顶层。
- 收尾根main及交付树status必须空，自有改动提交推送，prune/list。只剩这两树。268日志归档、12份长文staging归档均已完成，勿重复处理；不声称根治上游argv缺陷。

## Git与部署
- application production=326f117ecd2a690dcb5f3c252df7295fa8a6ef7f，rollback=f5dff6f46044ed9cd1e46b83facc9350622c6596；canonical release/onchip-production-line已推送该完整SHA，根main=acd13a712549e62f8d4b0f3c2f8f064549e226b0。新版本仅增加科学视觉清晰度skill的science/plan接线与本地只读看板；`deploy.sh --confirm --no-tests --skip-migrate --reuse-unchanged-capability-images`正常构建/启动exit0，Agent Worker等服务healthy、release CAS/retention完成；当时功能探针/模型任务按旧约束跳过，真实新skill消费与质量仍未知。此前f5d修复第三篇原恢复入口并曾实见两篇image-render/canRetry=true、3个续审任务；新release未重新点击旧6Pro续审，原候选和图片保留。期刊与媒体合并基线来自PR #110，旧158为更早回滚。
- 独立Chat provider bundle=a6a27ef543f3217a94b02ed4ee281e01e8e1e4a4（集成候选）；两unit指向该bundle、三份live runner与该源码一致、两timer active/enabled，浏览器未重启。三锁/空闲安装；备份provider-backup-20260923-visual-journal-retry-a6a27ef5，首次失败备份同前缀去掉-retry。首次因构建日志留在immutable source被manifest阻断，日志已完整归档至首次备份并记录原路径/权限；第二次安装成功但助手尾heredoc缺LF报exit1，已精确读回安装完成，均不得重放。renderer sha256:4a30b091d4bdeb7dd7670a01521d30d7b32694e1f3b34977a2aa26e91669559f，sceneImage fallback=false。
- 图队列当前4worker总65分钟、最多8为125分钟，private/started固定领取后最多10分钟，旧request/deadline不改；一次oneshot不叠慢恢复与新生成。不保证任意旧积压/多生产者。部署排空600秒不覆盖长排队，先等相关本地任务自然终态；超时上游结果仍未知。
- 0bee5b9b已推送的单文件候选将narrative subjects对齐Domain既有1–4，非narrative保持1–2；各要点独立绑定支持段，art引用实际索引。High修复一项后PASS，已随本次正常发布部署。原场景数/共享预算/来源守卫不变，不保证消除所有推理错误。
- 通用已存方案末审timeout恢复候选沿原STORYBOARD_OUTPUT_RESUME/retry-generation，同task/charge1、保留science/art、原provider。已补裸exec2授权、内部JSON/schema修复反馈与计费语义，原/后续提示身份分开核验并保留旧收据兼容；新增checkpoint私有执行标记区分当轮新生成与预存方案。增量High静态GO，revised不可达批评已撤回。tmp/saved-final-review-recovery-20260922保留补丁/增量；已正常部署，第二篇原页面202已创建真实续接收据并完成正式blocked末审，无新science/art调用。
- 正常发布仍用干净已推SHA、server Gateway及依赖构建、按当前测试政策选择检查范围、skip-migrate/复用未变能力镜像；这次不需迁移或独立Chat receiver更新。新恢复收据消费后必须保留兼容worker，优先前向修复，不删审计/缩额度/回退到不识别收据的代码。

## 交付差额（Taskmaster currentTag=multistyle-research-illustration）
| ID / 交付 | 已有结果与未完成范围 |
|---|---|
| 5 / 完整叙事 | 第一篇公开v3；后两篇reader/新公开版本未完成，三篇最终用户质量认可pending。 |
| 1 / 学术机制 | 首篇8bbc已6Pro accepted并公开；旧原图/失败候选保留，待用户反馈。 |
| 2 / 编辑封面 | 第二篇be793已approved、三图保存但审阅未提交，第四图unknown；reader/新公开版本未完成。 |
| 3 / 淡彩 | 旧aa41a018-b2ff-4ffb-9557-19ecabe104bc用户认可且公开v2，保护；第三篇完整淡彩叙事仍未完成，不扩大旧认可。 |
| 4 / 检索与管理 | dense58/58、42/42及hybrid曾实见；Pro短CLI合作有效，完整Desktop补丁/科学质量边界保持，不能因部署置done。 |
| Fig.3 / reuse | 9f7恢复图用户认可；Fig.1原字节reuse已公开v2但展示被否定；保留原件/8141b5fd，不冒認叙事通过。 |

## 第一篇：已公开，保护不重做
- RO9067a2d5-42ad-4c06-b234-753728b71064；Version3051b0c5-a51e-4ddd-833b-b232578bf0ee；rune3ef004f-38bb-4fa2-88e4-e6df4f07a0b2 succeeded/v53/max14。6字段821字/6Claims58Evidence；原PDF4b94c626/568765bytes/15页。
- plan5226fcf5，图8bbcfd9b-95a9-4bdd-a202-3ebfb61594e3，1280×720/526396bytes/hash778815c8fd54996e99abbad2e6d39a17edcf294f109e615cb56015e1d2fff8a8；6Pro90ada2a8 accepted，tmp/visual-narrative-8bbcfd9b-20260922.png已实看。
- 原overview→更多工具→发布→只选8bbc→201→公开链接已实际走通：https://openscience.428312321.xyz/research/OSR-2026-000023/v/3。版本hashd34d5d70344cc7f7f6ee0ed7906836d74492cc9a815a5ceb188b7dbdcbe88c66；匿名v1/v2/v3均200、旧快照不变。系统核源不伪造人工字段；PDF workspace_member，text/data CC-BY-4.0/code MIT；最终用户质量认可仍pending。

## 2026-09-23 新图与当前边界
- 第二篇在原7 Claims/证据上完成单幕 editorial 分镜 9a1b1a31（父 9c37cbe9，已批准）；Chat 生图 cebcef87-f71e-43cf-97ff-d0747a82bce7 succeeded/draft，PNG 715699 bytes、SHA256 bbfaf594c6ef14ff33b2e51fe73e074a11a22a16ba40086bcccadc71262f85b0，私有本机副本 `tmp/second-9a1b-scene0-20260923.png`。5.6Sol High 内部来源/像素咨询 GO：20 nm 双箭头端点落在两 CdS 相对表面，1 MeV 电子沿缝、λ₀=1.8 μm 光带及沿 z 的 FWHM_S≈77 nm 可读。旧 e397 PNG 的标尺只量蓝光带，继续保留但不采用。
- 第三篇两幕 watercolor 分镜 c54dc291（父 97f3bc46，已批准）；旧父分镜 scene0 图 d1ff4d86-fc86-4fba-a72e-103d46a88a5a 已获5.6Sol内部像素 GO，结构化绘图内容在新父分镜保持；新父分镜 scene1 图 68215708-3fd4-40d5-b7e1-8b48e3ed6b9b succeeded/draft，PNG 1198197 bytes、SHA256 d693c00eaddda9ed6819c8b8c56c45ee24ee32fac4826a4621359995832a3269，本机 `tmp/third-c54-scene1-20260923.png`；5.6Sol内部像素 GO，自由电子辐射的相位匹配公式与平移对称条件只挂自由电子分支。scene0 仍属于旧父分镜，未为 c54 重生成，也未组成产品内同父双幕发布包。
- 三张新图均为私有草稿，未经产品正式审图、读者页与新公开版本；5.6Sol 在本轮是 Codex 独立咨询，正式产品 provider 尚未接线，不能把内部 GO 冒充产品审核。用户最新要求用好skill并展示实时开发细节；本次部署技能接线未对旧图重新生成/审阅。管理员曾按现有 Domain `topupCredit` + 审计给本次生图补3 credits，旧官方 HTTP 超时但未入账，Domain 入账一次；后续提交经产品正常扣额。
- Guide 曾把可见标签修改错分到 art-only：b9443fa1 只更新 visualAction，`scene-image.ts` 对结构化 illustration 优先，故旧标签仍进入生图 prompt；该草稿未批准/生图。改走产品普通分镜修订已得到上述新图。根因与后续最小修复登记于能力台账，禁止把 art-only 结果当成结构化标签已改。
- 用户要求说明 Hermes 的 skill 消费与理解力差额，并查看开发各阶段状态/效果。已建立只读 [研发观察台 HTML](../proposals/2026-09-23-hermes-development-live.html)：按三篇论文展示来源、六维、方案、真实图、内部/正式审阅与公开边界；页面可读取 ignored `tmp/hermes-development-live-feed.js` 每15秒显示本轮检查点，超过15分钟明确标为过期，CURRENT仍唯一权威。当前仅是本机展示候选，不是产品后台或自动遥测；Codex 浏览器的 file URL 策略拒绝代理预览，未作视觉运行观察。科学 skill v3、自有插图 skill 当前 loader v9、Baoyu 白名单风格均已接线，旧任务曾记录实际消费；按疑点回读原文和跨任务经验检索仍未实现。
- 2026-09-23用户新增要求：看板先显示核心目标及当前生图任务的执行角色/技能/产物/效果/下一步，已原地修改HTML；`find-skills` 已本机安装，项目官方技能CLI已有只读find，不重复安装。检索K-Dense scientific-visualization后新增适配版`openscience-scientific-visual-clarity` v1，loader仅限定science/plan；独立High发现拆场景指令错投art及review提示占100k来源预算，已改为science读者目标/art现有布局可读性、不改正式review，复核PASS。326f已部署，尚未见新任务消费或质量效果；未引入上游脚本/新provider。看板feed与任务链静态时间分别标示，不冒充自动遥测；原文疑点回读、正式5.6Sol审图与后两篇发布仍未完成。

- 2026-09-23新候选：按用户测试纠正更新双 AGENTS/索引、为交付分支增加定向媒体技能 CI；把 handraw-style-router 和 handraw-style 的手绘风格匹配/表现方法分别适配到原 art plan/render，科学阶段与正式末审不变。新技能阶段/非目标风格/图像请求预算测试5/5、worker依赖构建与类型检查通过；现有 scene-image 与 presentation-generation 测试分别3/3、14/39失败，原因是旧fixture仍要求无模型调用/缺version.commit.branchId，非新技能加载测试通过的替代证据。候选未部署、无新真实Hermes消费或图像质量结论；先处理审查/必要CI，再部署并走一篇真实来源任务评估，不动旧批准/公开图片。

## 第二篇：旧资产与失败审阅（保留）
- ROc896802c-35dd-4b59-8db1-5f374f83a6d8（deep-sub-cycle pulse）；Versiond07cfeee-c81d-4162-a469-0b431f964801；run7e9e1f3e-eafe-440a-be0f-7ff1ed349a8b failed/v61/max43。原PDF7bb96cc1/3770010bytes、source f1bb85c8 v5、7Claims27Evidence及六维保持。
- 旧342保存末审恢复后科学blocked，09:54原按钮创建be793c82-2118-474e-8e8c-a772d2f084c5；本次science/art及M3末审正式accepted、plan approved。8d5f65e9/f92a9723/38c6c8bb真实PNG draft；11:22新review-only三项667ba9c1/e1559769/55e9bb24均failed、桥spool明确not_submitted/MODEL_6_PRO_NOT_READY，run failed/v63/max46，无正式像素审阅。34d8abc0出图有submitted、无conversation、uncertain，不重发。前三张实看仍见轨迹穿固体、点大小变化等问题，不能发布。
- 旧15b的d6fc/dd07科学blocked/null、1ea仅等径repair、38b4 accepted及所有原图保留。旧公开OSR-2026-000022/v/1及hashe0a8bd972fe2baca099ae198af4b8c02fc7fb503e0902ea476ebc6309a5db4c8保护。
## 第三篇：旧资产与失败审阅（保留）
- ROaa450f1e-fafc-46d8-a072-d935e01b0544（Light–matter interactions with photonic quasiparticles）；Version9373f1e6-9477-4e4a-9b45-b8efca244e70，尚无publicID；runb3eee57a-8a08-4867-9281-cb5b950affbf failed/v52/max44。
- PDFd04add46/4609066bytes/hash4a51048431f20950a01916b50cd87a08642881b20b0a9eac767144031ebc0b1a；原SourceMap e490409c…24页1554blocks；composition1834e21d及8c87b54d v5核源完成、六维657字/5Claims30Evidence，guideaad65431 watercolor；不重做。
- 旧400科学末审blocked公式及额外标题，09:54原按钮创建3d7ee9e7-b5ae-4578-8963-10478d2f7f30；本次M3正式accepted、plan approved。33fdd3f4/77c367a8/96167c38真实PNG draft；11:22新review-only b219e8e4在供应商前P2034、17b7b1fb明确not_submitted/MODEL_6_PRO_NOT_READY，6dee9fd3有submitted/conversation/result但正文为额度拒绝，不是科学审阅；产品任务failed，不得重发。run failed/v54/max46。34ce6503出图有submitted、无conversation、uncertain，不重发。实际图与方案仍含labels外标题/符号及所选basis不足；A(r)混入N已修正，不重复旧批评。
- 原606五图/全部历史保护；8d4f为blocked但repair非空，c482像素accepted但上游来源无效；34d30e5c/96710033旧提交unknown及6cf未提交保持。旧34一小时grace已过，不延期限或按旧writer取图。1e07仅heading，原SourceMap导言确有类比也不能手补旧Evidence；Box1 k方向索引旧相反批评已撤回。
## 下一步与不可误跑项
- 2026-09-22历史恢复：c085事务修复和f5d终态error修复已部署；旧6Pro续审仍未点击，旧unknown提交不得重发。第二篇旧a843/133/bc1及第三篇旧a96/307/73e科学返工的完整记录留Git和09-18交接；本轮新计划/PNG以本页2026-09-23段为准，不再按旧next action续跑。
- 08:13/08:14两writer已消费：/jobs/third-paper-durable-planning-resume-20260922.json、second-paper-skill-v9-replan-20260922.json。此前source-support/defect-aware/saved-final/technical-subset/art-timeout/geometric等历史writer及首篇publish也已消费；完整清单见09-18交接。third-paper-evidence-scoped-replan资格不符，始终禁运行。
- 读取入口：tmp/third-paper-durable-planning-read-20260922.cjs固定400；second-paper-v9-planning-read-20260922.cjs固定342；two-paper-v9-recovery-surface-read-20260922.cjs读当前原页面GET；current-two-paper-scene-reviews-read-20260922.cjs按run现有scene读。历史固定82/606/cb342的reader不能当新任务集合。新读入口tmp/saved-review-two-paper-progress-20260922.cjs定向读两task/当前恢复receipt及后续调用。旧saved-review/source-capacity与最新second-paper-scale-plan-revision-20260922、third-paper-source-root-plan-revision-20260922 writer及/jobs同名json均已消费，不重放。最新reader为tmp/source-root-plan-revision-two-paper-progress-20260922.cjs（be793/3d7），intents-read同前缀；旧342/400 reader仅历史。
- 账号：已知元数据未找到第二份可直接使用的登录，当前菜单无账号切换入口，未退出/换号/读凭据。2026-09-23新空白页Pro选项disabled且界面未给原因；6dee9fd3实际回复明确当前账号额度受限，不把界面禁用单独当成原因证明。用户随后改选5.6Sol审图，不再等待备用账号登录。
- third-paper-saved-png-review-resume-20260922旧writer500及新attempt2、second-paper-saved-png-review-resume-20260922均已消费，不重放。provider安装助手尾heredoc错误已独立确认不影响实际安装，禁止重放；详情见最新交接。
- 最新证据：tmp/source-root-plan-completion-20260922.json、current-scene-failure-metadata-20260922.json、current-eight-scene-spool-20260922.json；六图 `tmp/current-<taskId>-20260922.png` 已实看。
- stage保存已实见；fresh_art_after_unknown尚未实际触发。原图语义视觉读取、按问题回读全文、跨任务经验检索仍未实现，见能力台账。当前产品Hermes是worker/Gateway调用，不自动消费/opt/hermes-agent的技能发现/记忆循环。
- 本机固定Pro任务exec resume确有成功读写/06:10只读诊断；服务器新scene/revision task仍新Chat会话，revisionAssetId只传repair文本，referenceImage仅风格；同task恢复只取原结果。同图跨任务连续编辑尚未实现，本机Codex任务续接不能冒称GPT网页会话续接。
- Fig.2 d5087b03悬空copy、重复6439150a/ee9bcfb6 draft与6043bebb/75b34c88 approved仍未获明确清理同意；旧929/6088/03a占位清理已完成。不得删除其他认可图、工作树、账号/浏览器数据或所需回滚副本。
