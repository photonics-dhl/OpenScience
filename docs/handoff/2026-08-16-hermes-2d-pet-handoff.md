# Hermes Research Intelligence CURRENT Handoff

## Goal / constraints
- PDF→服务器OCR/全文理解→六维凝练与原文→Hermes规划→服务器网页生图→画廊（Codex原失败记录保留）。视频暂停。
- 用户已批准实际生图、预设imagegen skill和页面优化。禁止测试/预检/CI测试/本地构建；允许必要服务器部署与真实任务。保留权限、计费、来源、回滚；不删除文件、不读取打印密钥。
- 六维不是章节模板；方法可隐含在推导/结果/附录。来源整理失败不等于论文未报告。不能放行科学错误。

## Full-flow optimization — current batch
- 用户明确先完成附件预览→自动全文凝练→用户确认→选图/视频→生成审核→发布→公开RO；2–3篇高质量精选完成并获认可前暂停冷启动。
- 普通Chat6aa162f9已实际发送/读回完整产品建议；旧Chat6a9e7dac本轮接口无匹配，不推断Chat整体不可用。此次没有截图评审。
- 本批已部署c2d11326：ArtifactViewer、媒体类型选择、公开页顺序/去重、索引从草稿改读发布manifest、归档过滤、理解skill v3精确来源恢复。尚未重新提取；问题台账在integrated-research-product-plan最新节。
- 服务器部署exit0，production c2d113263ee48f276e9dedc4e4dc8a3229b4ceed / rollback7f8e47d931b751cc28c1000325128c2ca86566cb。已正常domain可恢复归档18旧demo-source记录与16个人测试草稿（共34），脚本archive-legacy-showcase；3条实际研究记录保护（其中2条同一PDF，不能计作3篇精选），不删文件/账号/公开版本。

- 下一批候选：已确认论文重新分析为独立待确认草稿（复用SourceMap，事务内权限/408与429幂等修复）、归档Hermes任务过滤、MaterialQueue预览、Hermes默认紧凑静态回退。网页spool接入另批已完成静态修复/High复核，尚未启用或实际回传。
- 用户已登录服务器产品页；实际Overview可截图，工作台旧9任务/Hermes常驻重试问题已记录。Chat截图在页面reload后上传成功并实际发送6 Pro，已收到视觉建议并实现紧凑工作台/队列3条折叠/长任务名换行；此前文字讨论已返回。

## Server browser continuation (2026-09-09)
- 用户要求服务器任务先查能力清单；已新增 docs/runbooks/server-capabilities.md 并写入AGENTS。发现共享缓存与ScanSci镜像已有完整Chrome+Xvfb，已停止重复下载，改为复用镜像，仅补远程桌面组件。
- 独立浏览器镜像272a5ed57d27已构建；bridge与浏览器已运行，noVNC HTTP200；trace定位openat2/clone3/pkey/chroot并修复seccomp兼容，用户已登录且网页生成/保存一次PNG成功，见下方最新记录；生产release未变，产品资产回传尚未接入。固定SSH6081隧道已启动，CUA仍fetch失败。不得按下方旧Codex retry步骤重复消耗额度。

## R1 record hardening integration
- Branch codex/r1-record-hardening now integrates production3446f309 plus Stage2 source identity, missing-cause, evidence and conflict fixes. Existing frozen records remain immutable; nine-PDF Stage2 replay is pending exact candidate deployment.

## Deployed recovery and cost behavior
- POST /research-objects/:id/hermes-runs/:runId/retry-generation, expectedVersion+Idempotency-Key; optional canRetryGeneration/chargeableAttempts on GET; UI Continue unfinished generation + new-task count.
- Prior image task3712f315 failed external image server error. Recovery preserved image0; charged one new scene1 task; rearmed original scene2/3 only after proof all durable submission/inbox/result paths were absent. Old failed tasks remain.
- API requires every rearm proof before transaction debit; worker rechecks before one-use marker consumption. Unsupported/disabled providers fail closed. API mounts only inbox/results read-only, no credentials/private/state. Existing worker writable inbox preserved; parser unchanged.
- All historical generation tasks including replacements plus future video count against grant8. No generic paid retry bypass, permission weakening, or DB reset.
- Recovery helper ALREADY submitted HTTP202 using keyhermes-recover-image-service-v1, log1788889410160-5a331eff-da10-4492-b4d3-31d8da774eae. Never blindly resubmit any prior generation helper.
- Early image0 approval during generating state returned403; normal user review is allowed once whole batch reaches awaiting_scene_images_review. No permission code change was needed.
- Main retains selected model; Sol/medium implementation, Sol/high credit/authority review; prior WebChat6Pro architecture advice reused. No reliable overall Codex savings percentage established.

## Latest actual web image
- 服务器执行/Save成功：会话6aa162f9-d0e4-83ea-afbf-243f7aae8a22；私有jobs/f6f29af4-b3c8-4609-93ac-4572970cc4b8/output/image.png，PNG1225x1284/1556710bytes。仅一次提交，原Codex失败任务未伪改成功。
- 图片额外画了孔板几何/场线，违背brief，需网页修订后才可产品展示。通用runner已保存，execute/resume尚未整体运行，Gateway/生产队列与资产回传尚未接入。
- 用户确认并本轮验证直接Chat可读；CUA坏不等于Chat不可用。用户接受本机出口，不因此停工。资源pids512、镜像9f44e1267fba、CDP仅容器loopback9233，状态细节见browser runbook。

## Versions
- worktree E:/Miscellaneous/XGS/.worktrees/onchip-video-release；branch codex/onchip-video-release。
- production ea95e63cc2d62eba7c65494fc713856d7416df42，rollback c2d113263ee48f276e9dedc4e4dc8a3229b4ceed。
- 部署exit0，日志1788953754740-78c2a47b-196d-4fce-8cfa-98cf09c48cf0。没有运行中的部署。
- 宿主Codex runner独立bundle1ad54c72f794ba46ee5f423875b9f231d32d4ea1，canonical install成功，含预设skill；此后应用版本没有runner代码变化，不需重装。
- 早先2000f508 build阶段SSH重置exit255，生产无切换/无journal。后续1ad54c72/929667dd/7f8e47d9均部署exit0。

## Actual paper / run
- RO9067a2d5-42ad-4c06-b234-753728b71064；ingestion7a28a7c8-90f7-429b-a519-53397cf58856；artifact4b94c626-1748-4c5a-934b-2bb94585bd9c。
- Quantization of a Deep-Subwavelength-Aperture-Confined Optical Near Field.pdf，15页。分析Agentadfc1d11-2935-4768-8257-aca5beb3eae4，sourceMapReused=true，understanding skill v2。
- 分析仍partial：method passage_ids_required，reproducibility source_text_limit_8000，limitations有科学问题。不能称完整论文分析成功。
- 只将有原文支持的服务器problem确认到此前空SDF，其余草稿保留。version58a45cb5-758f-4d6f-9e94-533b460e8b06，ROversion3，ingestion confirmed。
- owner10baa655-772e-4aca-9a5d-00ca0547084f；workspace28d7f25f-aba8-4ffb-adcb-46b4739f2f75。
- Hermes run46442dc4-44d4-4f63-bf39-75bd985f3218，当前failed/version9/error image generation failed。
- Claim7397c444-19d4-4900-b060-b9e1004261f4：正文未改，仅normal updateClaim assessment supported；15条normal verifyEvidence成功。
- 初稿asset3a809f33-823b-41bb-8829-b501dee66ffb与第一修订833a2def-ce90-4471-8da4-991cb1be5cb5存在虚构波矢谱/亚纳米等同，均未批准。
- 修复提示后第二修订asset10f36f01-3521-47b5-bdbd-f491ec3f5b8a正常生成并approved。仅1幅定性研究动机图：原框架、Bethe经典描述局限、局域孔径模式量子化目标；无虚构谱线/场图。
- 原run自动采用approved revision并创建scene_image task f6f29af4-b3c8-4609-93ac-4572970cc4b8。Hermes真实详细brief已读取，含构图/标签/条件/非实验声明；不是Codex手工代写。

## ACTUAL BLOCKER: server Codex subscription exhausted
- 服务器Codex实际启动thread01a085fa-2111-7392-a4c1-a12427c55cc4，events明确turn.failed：You've hit your usage limit，返回Sep15 2026 1:35 AM（原工具文本，时区未确认）。
- 证据 /opt/openscience-codex/private/f6f29af4-b3c8-4609-93ac-4572970cc4b8/work/events.jsonl；无图片生成。
- spool results同task result.json errorCode EXECUTION_FAILED；应用目前只显示image generation failed，尚未把额度原因细分显示。
- 不重复重试/切API key/消费reset。恢复订阅额度或用户明确授权其它可用账号/额度后，正常retryHermesGeneration；先fresh GET对账，复用approved plan与原论文，不能重跑OCR。

## Delivered
- 2000f508 additive DB grant：保留null/null、onchip7、video8，增加image7；已随1ad54c72部署。
- 1ad54c72 runner固定只读注入官方imagegen skill/prompting；仅内置image_gen、low reasoning、现有订阅登录；无API fallback/额外工具/重试/第二图。install复制bundle。独立High复核无阻塞。
- PresentationResultGallery单图全宽、多图2xl双列已部署；浏览器未能视觉查看。
- 929667dd兼容正常人工审核保留的sourceTaskLineage，严格原Evidence/task/artifact/hash不变；只恢复exact误停且无生成steps、来源ready的run。正常retry已成功，后续自动规划。
- 7f8e47d9 image planner明确执行修订，base非科学权威，独立user指令但科学system优先，禁止重新引入被拒特征；不增加正常模型调用轮次。第二修订实际遵循。
- OCR隔离和成功reuse保持；全文提取的科学忠实性/部分来源整理仍待修复。

## Next
1. 当前先修订已保存的网页图片，再接入Hermes正常队列/Gateway/资产导入；Codex旧任务受额度阻塞，未经恢复不重试、不换计费。
2. 恢复后读取run最新版本与正常retry能力，正常retry原run生成已批准的1图；随后实际查看图片，不因任务succeeded自动认可图像科学质量。
3. 页面视觉：本机CUA仍失败，但服务器Playwright可操作/截图，直接Chat可读；不要因此再次阻塞网页工作。
4. 全论文method/reproducibility/limitations仍未解决。本次问题概念图不能冒充完整论文分析能力，产品端科学语义复核仍需落地。
5. 额度错误需从runner传为用户可理解原因；现generic错误不能称体验完善。

## Routing / sources
- Sol/high独立复核迁移、runner、lineage恢复、修订提示均通过。两个实现agent额度失败，root实现与部署；不能编造节省比例。
- 网页Chat此前给出全文综合→六维→来源核对；本批直接Chat已取回完整旅程建议，见上方。
- 原Chat https://chatgpt.com/c/6a9e7dac-e4c8-83ea-9857-4c52ad66c8ec。
- 需求docs/OpenScience_Kimi_Development_Spec.md §5.4/§9；计划docs/plans/2026-09-05-integrated-research-product-plan.md。
- 服务器只走显式Git Bash+E:/Miscellaneous/XGS/infra/scripts/ssh-run.sh，发布docs/runbooks/deployment.md。所有本轮运行均在服务器，未测试。
- b9e326b2部署首轮SSH reset exit255，进程退出后release仍c2d11326且journal清空；重试明确因agent-worker unhealthy回滚，release仍c2d11326。模块无网络加载成功，但不代表启动成功。已移除违反用户禁测试要求的自动fixture self-test；不能未经日志断言它是根因。

- 后续候选含网页provider、UI整理、浅色PDF预览，以及启动失败回滚前私有日志保留。当前尚未部署。实际PDF预览已截图显示15页。

- ea95e63c正式部署exit0；新分析/网页provider/UI已上线。网页broker安装成功，timer active/service success；在生产锁内将API/worker HERMES_SCENE_IMAGE_PROVIDER切换chatgpt-web并启动成功。回滚需恢复selector codex。
- 已通过用户已登录的服务器页面，从原confirmed task点击一次Reanalyze and create new draft，新任务已排队，旧记录保留；新taskID待读取。尚未得到新六维结果/产品图。
- 新任务c22927f9-68c5-4671-a3df-a81475f2c849已返回needs_review并复用SourceMap；method仍source_text_limit_8000，reproducibility仍segment_count_1_to_32。定位到同一block不连续passage被min/max错误扩成整段，精确range union及下游有序不重叠guard正在修复。
- Codex重启后直接Chat接口正常，6 Pro已返回精确range/失败字段单次修订建议；约4分钟。CUA浏览器枚举经一次重试和内核重置仍nodeRepl.fetch失败，无法比较本机Chrome另一账号；服务器网页生图执行器不依赖该桥。
