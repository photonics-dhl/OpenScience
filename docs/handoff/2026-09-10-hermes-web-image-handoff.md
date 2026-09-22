# Hermes / Workbench CURRENT Handoff
> 唯一交付树 E:/Miscellaneous/XGS/.worktrees/onchip-video-release，branch release/onchip-production-line。根 main 仅导航，旧 codex/onchip-video-release 不得发版。历史调用、审阅、已消费脚本见[09-18交接](2026-09-18-figure3-image-and-cleanup-handoff.md)，不按历史 next action 重跑。

## 目标与授权
- 需求基线§18.2及已批准docs/proposals/2026-09-21-visual-narrative-review.html：未读论文者通过六维内容和单/多图理解核心思想与关键点，兼顾科学准确、叙事和美感。用户否定原样裁出Fig.1；原图/生图按需，视频尚不执行。
- 原链路：PDF → Hermes已审全文/六维/Claims/Evidence → science/art叙事 → Chat图 → 6Pro像素审阅 → reader → 新公开版本。用户只看最终成果，中间由系统推进；不重造全文分析器，不伪造人工核验或用户审美认可。
- “允许，不限额度，你把整个任务做完”持续有效，不再问费用。先完成三篇/学术、编辑、淡彩；最终用户质量认可前不批量冷启动。不盲重发未知请求、不自动切provider。
- 最新纠正优先用好Hermes的skills、工具及反馈；默认6Pro plan末审候选已撤下并归档tmp/chat-plan-final-review-20260922，未部署。science/art/final仍M3；Chat生图与已有6Pro像素审阅保持。跨任务自学习尚未实现。

## 执行边界
- 禁止测试/预检/演练/CI；本机只静态阅读、编辑、Git、传输。必要服务器构建启动、已知故障最小读取和真实产品路径已授权；先说明范围，不把编译/模型accepted当质量通过。
- 不重启共享浏览器、不改沙箱、不安装工具。SSH仅infra/scripts/ssh-run.sh，显式C:/Program Files/Git/bin/bash.exe，XGS_CONFIG_ROOT=E:/Miscellaneous/XGS；不打印.env/Secret/cookies。
- 本机CUA policy恢复已耗尽；复用服务器openscience-chatgpt-browser的Playwright/CDP9233。自有页面名xgs-pipeline-20260921（第二篇）、xgs-longpaper-20260922（第三篇）；125%缩放用唯一按钮focus/Enter；close只断CDP。tmp/pipeline-browser-continue-20260921.ps1是现有入口。
- 一次性writer先看原私有收据，已消费/未知不得重放。保护PDF、旧/认可图片、失败审阅与旧公开版本，不手改任务/来源/结果来放行。所有本机证据留ignored tmp/；不得堆用户顶层。
- 收尾根main及交付树status必须空，自有改动提交推送，prune/list。只剩这两树。268日志归档、12份长文staging归档均已完成，勿重复处理；不声称根治上游argv缺陷。

## Git与部署
- application production=574c3db2ceeec70f4f1f7b32b8ee43002d63ec17；rollback=f19e99d49862f026d884cdf1e2edf0ae75019973。正常服务器build/start exit0，独立marker一致、journal/failed=false；日志/opt/openscience/observations/deploy-574c3db2-20260922.log。HEAD按Git定锚；root main=acd13a712549e62f8d4b0f3c2f8f064549e226b0。
- 独立Chat provider=574c3db2ceeec70f4f1f7b32b8ee43002d63ec17；两unit/timer曾独立读回，原三锁/空闲/备份安装，无浏览器重启。备份provider-backup-20260922-page-ownership-574c3db2；renderer sha256:4a30b091d4bdeb7dd7670a01521d30d7b32694e1f3b34977a2aa26e91669559f，sceneImage fallback=false。
- 图队列当前4worker总65分钟、最多8为125分钟，private/started固定领取后最多10分钟，旧request/deadline不改；一次oneshot不叠慢恢复与新生成。不保证任意旧积压/多生产者。部署排空600秒不覆盖长排队，先等相关本地任务自然终态；超时上游结果仍未知。
- 0bee5b9b已推送的单文件候选将narrative subjects对齐Domain既有1–4，非narrative保持1–2；各要点独立绑定支持段，art引用实际索引。High修复一项后PASS，已随本次正常发布部署。原场景数/共享预算/来源守卫不变，不保证消除所有推理错误。
- 通用已存方案末审timeout恢复候选沿原STORYBOARD_OUTPUT_RESUME/retry-generation，同task/charge1、保留science/art、原provider。已补裸exec2授权、内部JSON/schema修复反馈与计费语义，原/后续提示身份分开核验并保留旧收据兼容；新增checkpoint私有执行标记区分当轮新生成与预存方案。增量High静态GO，revised不可达批评已撤回。tmp/saved-final-review-recovery-20260922保留补丁/增量；已正常部署，第二篇原页面202已创建真实续接收据并完成正式blocked末审，无新science/art调用。
- 正常发布仍用干净已推SHA、server Gateway及依赖构建、no-tests/skip-migrate/复用未变能力镜像；这次不需迁移或独立Chat receiver更新。新恢复收据消费后必须保留兼容worker，优先前向修复，不删审计/缩额度/回退到不识别收据的代码。

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

## 第二篇：三张PNG已存，审阅未提交，第四张unknown
- ROc896802c-35dd-4b59-8db1-5f374f83a6d8（deep-sub-cycle pulse）；Versiond07cfeee-c81d-4162-a469-0b431f964801；run7e9e1f3e-eafe-440a-be0f-7ff1ed349a8b failed/v61/max43。原PDF7bb96cc1/3770010bytes、source f1bb85c8 v5、7Claims27Evidence及六维保持。
- 旧342保存末审恢复后科学blocked，09:54原按钮创建be793c82-2118-474e-8e8c-a772d2f084c5；本次science/art及M3末审正式accepted、plan approved。8d5f65e9/f92a9723/38c6c8bb真实PNG draft；三次6Pro review均not_submitted/MODEL_6_PRO_NOT_READY，无正式审阅。34d8abc0出图有submitted、无conversation、uncertain，不重发。前三张实看仍见轨迹穿固体、点大小变化等问题，不能发布。
- 旧15b的d6fc/dd07科学blocked/null、1ea仅等径repair、38b4 accepted及所有原图保留。旧公开OSR-2026-000022/v/1及hashe0a8bd972fe2baca099ae198af4b8c02fc7fb503e0902ea476ebc6309a5db4c8保护。
## 第三篇：三张PNG已存，方案科学问题仍在
- ROaa450f1e-fafc-46d8-a072-d935e01b0544（Light–matter interactions with photonic quasiparticles）；Version9373f1e6-9477-4e4a-9b45-b8efca244e70，尚无publicID；runb3eee57a-8a08-4867-9281-cb5b950affbf failed/v52/max44。
- PDFd04add46/4609066bytes/hash4a51048431f20950a01916b50cd87a08642881b20b0a9eac767144031ebc0b1a；原SourceMap e490409c…24页1554blocks；composition1834e21d及8c87b54d v5核源完成、六维657字/5Claims30Evidence，guideaad65431 watercolor；不重做。
- 旧400科学末审blocked公式及额外标题，09:54原按钮创建3d7ee9e7-b5ae-4578-8963-10478d2f7f30；本次M3正式accepted、plan approved。33fdd3f4/77c367a8/96167c38真实PNG draft、三次6Pro review均not_submitted/MODEL_6_PRO_NOT_READY。34ce6503有submitted、无conversation、uncertain，不重发。实际图与方案仍含labels外标题/符号及所选basis不足；A(r)混入N已修正，不重复旧批评。
- 原606五图/全部历史保护；8d4f为blocked但repair非空，c482像素accepted但上游来源无效；34d30e5c/96710033旧提交unknown及6cf未提交保持。旧34一小时grace已过，不延期限或按旧writer取图。1e07仅heading，原SourceMap导言确有类比也不能手补旧Evidence；Box1 k方向索引旧相反批评已撤回。
## 下一步与不可误跑项
- 两篇最新任务自然终态。页面隔离、正式issues到art和六图仅审阅恢复均High GO并正常部署；原GET两篇image-render/charge3已实见。第三篇11:03:54原按钮500，P2028默认5000ms/实际5574ms，事务回滚无新task/receipt，run仍52。仅原retryHermesGeneration期限改30000ms，保留Serializable/全部资格读取/P2034-only重试，High增量GO，待正常发布后用新attempt2收据续原页。第二篇writer未运行，不重发unknown，不把GET/编译当完成。
- 08:13/08:14两writer已消费：/jobs/third-paper-durable-planning-resume-20260922.json、second-paper-skill-v9-replan-20260922.json。此前source-support/defect-aware/saved-final/technical-subset/art-timeout/geometric等历史writer及首篇publish也已消费；完整清单见09-18交接。third-paper-evidence-scoped-replan资格不符，始终禁运行。
- 读取入口：tmp/third-paper-durable-planning-read-20260922.cjs固定400；second-paper-v9-planning-read-20260922.cjs固定342；two-paper-v9-recovery-surface-read-20260922.cjs读当前原页面GET；current-two-paper-scene-reviews-read-20260922.cjs按run现有scene读。历史固定82/606/cb342的reader不能当新任务集合。新读入口tmp/saved-review-two-paper-progress-20260922.cjs定向读两task/当前恢复receipt及后续调用。旧saved-review/source-capacity与最新second-paper-scale-plan-revision-20260922、third-paper-source-root-plan-revision-20260922 writer及/jobs同名json均已消费，不重放。最新reader为tmp/source-root-plan-revision-two-paper-progress-20260922.cjs（be793/3d7），intents-read同前缀；旧342/400 reader仅历史。
- 账号：用户允许切换备用账号但位置未知；已知元数据未找到第二份可直接使用的登录，当前菜单无账号切换入口，未退出/换号/读凭据。当前6Pro可见不证明额度或旧失败原因。
- third-paper-saved-png-review-resume-20260922 writer及/jobs同名json已消费500，不重放；second-paper-saved-png-review-resume-20260922未运行。provider安装助手尾heredoc错误已独立确认不影响实际安装，禁止重放；详情见最新交接。
- 最新证据：tmp/source-root-plan-completion-20260922.json、current-scene-failure-metadata-20260922.json、current-eight-scene-spool-20260922.json；六图 `tmp/current-<taskId>-20260922.png` 已实看。
- stage保存已实见；fresh_art_after_unknown尚未实际触发。原图语义视觉读取、按问题回读全文、跨任务经验检索仍未实现，见能力台账。当前产品Hermes是worker/Gateway调用，不自动消费/opt/hermes-agent的技能发现/记忆循环。
- 本机固定Pro任务exec resume确有成功读写/06:10只读诊断；服务器新scene/revision task仍新Chat会话，revisionAssetId只传repair文本，referenceImage仅风格；同task恢复只取原结果。同图跨任务连续编辑尚未实现，本机Codex任务续接不能冒称GPT网页会话续接。
- Fig.2 d5087b03悬空copy、重复6439150a/ee9bcfb6 draft与6043bebb/75b34c88 approved仍未获明确清理同意；旧929/6088/03a占位清理已完成。不得删除其他认可图、工作树、账号/浏览器数据或所需回滚副本。
