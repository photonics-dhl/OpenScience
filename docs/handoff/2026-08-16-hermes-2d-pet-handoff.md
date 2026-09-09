# Hermes Research Intelligence CURRENT Handoff

## Goal / constraints
- PDF→服务器OCR/全文理解→六维凝练与独立原文→Hermes规划→服务器Codex订阅生图→画廊。视频暂停。
- 用户已批准服务器生图、应用预设imagegen skill、真实流程观察与页面优化。禁止测试/预检/CI测试/本地构建；保留必要服务器构建部署、权限/计费/来源核对。不删除文件、不读打印密钥。
- 六维不是同名章节模板；方法可隐含在全文推导/结果/附录。来源整理失败≠论文未报告，不能把错误内容放行。

## Version
- worktree E:/Miscellaneous/XGS/.worktrees/onchip-video-release；branch codex/onchip-video-release。
- production/HEAD 1ad54c72f794ba46ee5f423875b9f231d32d4ea1，rollback85f6545134553b17fc0f383a58d86797f0074435；部署exit0，日志1788952477772-69e8c3de-c876-41e9-b399-78092b8474d0。宿主runner install成功同SHA。
- 2000f508部署在build时SSH重置exit255；已确认没有部署进程/残留journal，生产未切换。保留日志1788952221719-d0fcbd4b-f96c-42d4-9f1a-d8a8b7414254。

## Actual paper / run
- RO9067a2d5-42ad-4c06-b234-753728b71064；ingestion7a28a7c8-90f7-429b-a519-53397cf58856；artifact4b94c626-1748-4c5a-934b-2bb94585bd9c。
- Quantization of a Deep-Subwavelength-Aperture-Confined Optical Near Field.pdf，15页。当前Agentadfc1d11-2935-4768-8257-aca5beb3eae4，OCR sourceMapReused=true，understanding skill v2。
- Agent succeeded但canonical_partial_validation_exhausted：method passage_ids_required、reproducibility source_text_limit_8000；limitations仍有科学问题，不得称完整论文处理成功。
- 只确认服务器生成且原文支持的problem到此前全空SDF。version58a45cb5-758f-4d6f-9e94-533b460e8b06，versionNo2，ROversion3；ingestion confirmed，不再直接refresh。其余草稿保留，未手写结果。
- Hermes run46442dc4-44d4-4f63-bf39-75bd985f3218；最新实际status stopped/version4：正常updateClaim审核后source变human，旧validateReviewedSources误判失效。目标仅problem概念图；尚无图片。
- owner10baa655-772e-4aca-9a5d-00ca0547084f；workspace28d7f25f-aba8-4ffb-adcb-46b4739f2f75。

## Implemented / deployment candidates
- OCR实际可用并复用；native/vision原文独立来源，parser隔离无网络/secret、非root、readonly、512MiB。
- extractor完整全文≤120k，摘要4k，32source IDs/32原blocks/8k证据。未绑定摘要保留只读unverifiedSummaries。最多3次固定结构化尝试。
- Hermes scene-image planner实际模型调用产生详细brief：对象/物理属性/关系/构图/风格/标签/科学限定，≤1500chars，不猜乱码公式。
- 2000f508新增image grant迁移，保留null/null、onchip7、video8，增加image7；rollback保留additive schema与数据。独立High静态复核无阻塞。
- 1ad54c72：container-client固定读取官方预设imagegen skill/prompting只读副本注入；执行限制优先，只用内置image_gen，禁止API fallback/其他工具/重试/第二图。install已复制新md到immutablebundle；独立High静态复核无阻塞。
- 必须在应用deploy后单独运行canonical infra/codex-image-runner/install.sh --confirm --source /opt/openscience-releases/<sha>更新宿主服务；应用部署不会自动更新该bundle。
- PresentationResultGallery单图全宽，多图只在2xl双列。尚无浏览器视觉观察，不称页面验收完成。

## Next
1. 候选修复正常human review lineage兼容；retryHermesGeneration仅恢复exact来源错误且无生成steps、完整来源ready的stopped run。部署后正常retry原run；不重建批次。
2. fresh run.version与previewIngestionClaimEvidenceBridge snapshotToken→confirmHermesSourceReview。version如上；sourceField problem/kind core/statement用preview.reviewedStatement/attachSourceQuote true；generationGrant content-driven-image-v1/max7；idempotency quantization-problem-image-source。
3. 正常verifyEvidence定位原文、updateClaim设置经支持assessment并保留正文；自动worker续跑Hermes规划。读真实storyboard后批准，再由服务器生图；不要直接DB改状态或手写图解。
4. 查看真实图片与画廊；完整论文科学忠实性仍需修复，不能将本次局部概念图当全部完成。

## Routing / browser
- 本轮Sol/high独立迁移及runner复核成功；两个实现agent额度限制失败，root实际接手。不能编造节省比例。
- 原网页Chat6Pro已给全文综合→六维→来源核对规划。当前CUA getState连续两次nodeRepl.fetch失败；没有本轮Chat回复或产品截图。
- 浏览器原对话https://chatgpt.com/c/6a9e7dac-e4c8-83ea-9857-4c52ad66c8ec。
- 本轮没有测试/本机构建；部署编译是交付步骤。

## Read first
- docs/OpenScience_Kimi_Development_Spec.md §5.4/§9。
- docs/plans/2026-09-05-integrated-research-product-plan.md。
- docs/runbooks/deployment.md；服务器只走显式Git Bash+E:/Miscellaneous/XGS/infra/scripts/ssh-run.sh。