# Hermes Research Intelligence CURRENT Handoff

> CURRENT active-memory，2026-09-05 +08。受审图片/视频已接入真实私有 RO 并通过 ECS/browser 验收；任意论文自动生成与 Hermes 修改媒体尚未完成。历史试听与部署过程见 Git history 和 science-video runbook。

## Version tuple

- Worktree: E:/Miscellaneous/XGS/.worktrees/readable-hermes-guidance；branch codex/product-workflow-design；application HEAD/main 83b2933f204894cda43f4bb0d0f8d0c4cbc7b06d（PR88/89）；后续 docs HEAD 以 Git 为准。
- Production source/active/public: 83b2933f204894cda43f4bb0d0f8d0c4cbc7b06d；rollback 390afc09d3b6ec64d5b23e64f6bffe6bf8a375e7。Canonical deploy retry completed，journal cleared，retention completed。核心36/搜索2迁移最新，13容器运行、10项健康检查通过；可用磁盘约94GiB。
- 独立淡彩 demo source381705a32deeed38fb94564eccbcbb2c66fb7739，run381705a-20260905T121000Z；URL /demos/science-video/d2nn/?v=watercolor-v1；不与应用版本混写。
- 根目录旧 main 与用户未提交资料未动，不是部署源。启动先 Git/fetch/checkup/实际 release，再读本 handoff、需求基线相关章节和当前设计/计划。

## Product decisions and delivered behavior

- 功能/展示优先，成熟方案与已有基座优先，分段验收。图片须生动解释论文做什么/怎么做；RO 凝练内容；原始图表/代码是可追溯 Evidence，不是自动证明。暂不做上传音视频理解。
- PR86 的 PDF→Hermes确认→Editor保留源附件→人工 Claims→确定性图解流程已部署。解析仍有 method/results/reproducibility 空缺，演示补充明确标为人工核对，不声称自动完整提取。
- PR88/89：受审 PNG/MP4 管理员CLI，额外要求原有workspace写权限、draft精确版本及有效Claims；默认dry-run、真实provenance、草稿/审计、现有版本锁和幂等重放。未启用占位媒体provider。
- RO内原生视频预览/播放/seek；私有和公开读取链有安全单Range，完整hash校验后才切片，保留16MiB上限。canTransition隐藏普通writer无权执行的媒体审批。
- 图片/视频关联Claims、单独批准；修改来源使关联draft/approved素材rejected；恢复来源不会复活旧审批。同内容重复导入保留原状态，不用于复活rejected素材。
- 用户已接受v4连续Serena旁白41.28秒。原WAV整段保留，无分段、补静音、变速；淡彩视频41.292秒/3,203,000bytes，ECS CPU渲染37.76秒，原图2172×724，五层/十探测区域。
- story-to-handdrawn-video 的完整构图和线稿显色被借鉴到已有Canvas渲染；没有安装/运行上游Remotion。一次内置生图；本轮接入无新媒体生成调用。

## Fresh acceptance

- 全仓build/typecheck/test/lint、focused领域/API/UI/CLI测试及PR88/89与最终main CI通过；独立安全/发布复审通过。
- 最终SHA服务器全build；Parser source/image绑定16-case报告：14succeeded/2needsReview/0failed/0falseReady，14 structuredFake/0 externalProvider；正式verifier通过。BGE真实向量与ScanSci运行依赖通过。
- 受控现有管理员私有RO bcbf1586-b6bd-44b6-ab66-c675fcddce78，version57d10269-2ba7-4eaa-88fc-622a00d20ef5；三个人工核对主张；没有修改普通用户个人RO权限、邀请或公开发布。
- 两个独立Prisma/PostgreSQL连接并发导入：每种媒体仅1asset/1audit/3Claim关联。image76859477-e3a9-4be8-9d2a-22db89768acb，video cffbfaf9-19d0-49c9-b8f3-edc5b9be3f0e。
- 真实browser通过原图hash/解码、41.291667秒视频播放与28秒seek、Range206/1024bytes、匿名401、两次独立批准、390px无横溢出、Claim修改失效与恢复不复活。验收结束两素材为rejected，原Claim文字恢复，会话注销；CLI --confirm再次导入返回同ID/rejected。Approved截图记录失效测试前状态。
- 证据 ignored apps/web/test/visual/out/science-video/：ro-media-browser-evidence.json、ro-media-approved-{desktop,mobile}.png、ro-import-final-concurrent.log、ro-media-final-parser.log、ro-media-final-deploy-retry.log。
- 部署前新备份28M core/20K search，7/7保留。首次83b部署因两个本轮已退出的d174预检容器引用旧候选而自动回滚390；精确检查后仅移除无卷的临时容器，重试成功。所有5个本轮导入测试容器已清理，未做广泛prune。

## Constraints and remaining work

- 用户已授权实施、合入、部署、真实论文验证和必要开源方案；不重复询问。不得读取/打印.env、Cookie、密钥；生产仅项目SSH/deploy脚本。原始论文PDF保持私有。
- 复用已有Chromium、CPU Canvas、Qwen离线运行时；torch2.11CPU基础层约0.97GB、Qwen子镜像约2.04GB含基础层、模型4.52GB。BGE不同依赖版本不合并可变site-packages。无GPU，不新增模型安装。
- Storage先写后DB失败可能留下私有无引用对象；现有公开review digest未纳入PresentationAssets是历史债务，本轮无公开发布，扩大公开媒体前复核。
- UI仍使用Diagram通用标题/生成与失效文案；图片/视频现为受控CLI导入，不能声称普通用户点生成即可生图/视频，也不能把受控管理员RO链接当作用户可访问页面。
- 下一步：把媒体展示与来源编辑整理成清楚的页面层级，随后接有来源的叙事/分镜、Gateway provider或隔离CPU renderer、Hermes修订；延续Claims失效和真实provenance，优先成熟方案，质量与成本兼顾。
- 同事frontend/nanqing上次核实e5db5ae；已有每日10:00巡检自动任务，勿重复创建。下一次合并前重新fetch比较。
