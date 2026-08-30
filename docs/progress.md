# OpenScience 进度（CURRENT window）

> 最新同步：2026-08-30。历史由 Git 保存；旧计划和 archive 不作为默认输入。

## Current version tuple

- Worktree branch / repository main: `codex/seaweed-metadata-compat` / `689331845574612130f223d08c92e61721c16586`；远端仅保留 `main`。
- Production application source / immutable release: `689331845574612130f223d08c92e61721c16586`。
- Production rollback: `c435c4c8b2800bb20998fd9a9a93f2db96328661`；core/search migrations `32/32` / `2/2`。
- Taskmaster `hermes-research-intelligence` 为 10/12：Tasks 1–10 done；下一产品任务为 Task 11 确定性 PresentationAssets。

## 2026-08-30 — Task 10 external retrieval and temporary documents production-accepted

- Semantic Scholar/Tavily/ScanSci legal-only adapters、provider-neutral rights、`source.retrieve`、migration 32、72h private cache、10min HttpOnly one-use download、GC lease/fence/backoff 与永久 provenance 已完成。ScanSci 保持默认 disabled；Tavily 四个授权 key 均被供应商判定额度耗尽并优雅降级。
- PR #8 实现合入 `c435c4c…`；真实调用发现 SeaweedFS/minio-js 把 `x-amz-meta-sha256` 规范化为 `sha256`，PR #9 以严格 64-hex 双键兼容修复并清除 parser isolation 测试拒绝竞态。Exact CI `33284956868` / job `99186426490` 11m09s 全绿；本地 Storage 22/22、Worker 468/468、API 89/89。
- Final ECS release `6893318…`：migration 32、search 2/2、Parser 16-case、BGE CPU 实向量、数据库隔离、容器/Nginx/public identity 全绿。真实 Semantic Scholar 任务返回 3 sources；连续请求的 provider 429 被正确记录为 unavailable，不影响任务完成。
- 受控自著 PDF 完成 checksum HEAD、一次性下载、77-byte SHA-256、重放 404、精确 72h 边界与真实 60s Worker GC；GC 后对象不存在而 source/rights/provenance/locator 仍在。取证后精确清除 1 user/1 workspace/1 session/5 tasks/4 sources/4 rights/1 document/2 accesses/5 ledger，审计日志保留。
- 远端旧 Task 10 分支经祖先校验后删除，仅 `main`；retention 仅保留 active `6893318…` + rollback `c435c4c…`。精确删除无容器引用、仅属已下线 dev Compose 的 MinIO server/mc 两个镜像后，磁盘 36G/148G（25%）、107G available；保留 390.7MB bounded build cache，无 broad prune。

## 2026-08-30 — Task 9 deployed, production-accepted and merged

- Tasks 1–7 已完成：匿名 DTO 仅暴露 `published + Publication`；R3 发布原子扩大 RO 为 public；generic PATCH 不再接受 visibility；migration 31 保存账号 Evidence 默认折叠偏好；公开 source/approved asset 端点在返回前复验原件、SourceMap、大小与 SHA-256，并隐藏 object key、workspace、验证者和私有 provenance。
- Claim-first Research Folio 已实现 760px 正文 + 280px graphite Evidence rail、3–7 core/child/counter Claim、conditions/limitations、关系型 Evidence、按需原文/页码/归一化区域定位、移动 Radix bottom sheet、焦点返回、账号/匿名偏好与 approved PresentationAsset 的“展示而非证据”分标。Evidence 折叠不使用 `hidden`/`display:none`/`aria-hidden`，SSR、辅助技术与打印保留全文。
- Exact candidate CI `33263991191` / job `99130646214` 全绿；本地全仓 build/typecheck/lint/test、产品视觉 `72/72`、Claim-first Chromium `4/4` 与 Hermes `10/10` 通过。Canonical ECS deploy 应用 migration 31，Parser 16-case、BGE-M3 CPU 实向量、数据库隔离、目标容器、Nginx 与公网/loopback release identity 全绿。
- 真实生产旅程以一次性账号完成 preference CAS、draft→under_review→approved→published、匿名 3 Claims/3 Evidence、3 个可信原文定位；真实 Chromium 再证 Settings、1440px 760/280、375px sheet/focus、print 3/3。夹具数据库行、Blob 与 SourceMap 对象均精确清至 0。
- PR #6 合并为 main `cf63392a…`，远端产品分支删除后仅 `main`。ECS dev 栈/3 卷、390.7MB build cache 与两个未引用旧 Node 镜像精确清理；根盘 `36G/26% → 35G/25%`，生产与回退/模型/沙箱/评测资产保留且健康。

## 2026-08-29 — Main/branch consolidation and Task 9 started

- PR #4 已在精确 CI `33259207780` 全绿后合并为 main `5105b1e…`；旧 PR #3 已关闭，其 9 个独立提交由 annotated tag `archive/hermes-2d-pet-20260829` 保留。GitHub 远端 6 个已合并/被取代分支已删除，收口后一度仅保留 `main`。
- 固定 worktree 已从合并后的 main 创建短分支 `codex/claim-first-public-ro`。Task 9 实施计划登记为 `docs/plans/2026-08-29-hermes-claim-first-public-ro-plan.md`，覆盖 publication-only DTO、R3 publish→public、阅读偏好、Evidence source/asset 安全交付、760/280 页面、移动 sheet、打印/WCAG 与 ECS journey。

## 2026-08-29 — Task 9 backend contracts 1–3 implemented locally

- `82fb874` 将匿名公开读取限制为 `published + Publication`，显式映射 Claims/Evidence/approved PresentationAssets/history，并从 locator/DTO 排除 workspace、验证者、object key、prompt 与私有 provenance；API 81/81、API/Web typecheck 通过。
- `f26d895` 关闭 generic RO PATCH 的 visibility 字段；R3 发布在同一 Serializable 事务内写 Version、Publication、RO public 与 `visibilityFrom/To` 审计，单一确认框明确永久公开 URL/所有人可见；Domain 471/471、API 81/81、Web 417/417。
- `2abf0d6` 增加 core migration 31 `reading_preferences` 与认证 GET/PATCH CAS API：缺省 expanded=`false/version 0`，首次写版本 1，同值幂等，变更递增，用户 ID 只取 session；数据库 21/21、Domain 475/475、API 83/83。生产仍为 core/search `30/30`/`2/2`，migration 31 待最终 ECS 候选部署。

## 2026-08-29 — Task 8 production accepted and evaluation debt removed

- Task 8 Claim/Evidence API、可信 SourceMap、复验/审计、发布双重阻断与 narrative snapshot 已随 `4c73469…` 部署；SeaweedFS HEAD 缺少自定义 SHA metadata 时改为流式重算原件 SHA-256，并按对象去重读取。Exact CI `33257516418` / job `99113706374` 全绿。
- ECS 正式 parser acceptance 通过。一次性真实 RO 旅程得到 5 个 source blocks、3 Claims、3 Evidence；未核验发布正确阻断，篡改 locator 返回冲突，核验后 review passed、publish 成功、公开页 200，测试用户/对象/存储引用精确清零。公开性由一次性 fixture 预置，不冒充可见性扩大审批验收。
- Canonical deploy 全量 build、core/search `30/30`/`2/2`、BGE-M3 CPU 实向量、Parser/API/Web/Worker、Nginx、public/loopback release identity 与 retention 全绿；active `4c73469…`，rollback `cf68bfa7…`。
- 用户批准的精确卫生操作归档 3 份 LiteParse 与 3 份 BGE 报告到 `/opt/openscience-acceptance/capability-evaluations`，7/7 SHA-256 通过；随后在部署锁内删除 40 个无挂载、无容器引用的历史评测工作目录。评测区 `15,405,977,600 → 28,672` bytes，根盘 `48G/34% → 36G/26%`，可用 `106G`；未执行 broad prune。

## 2026-08-29 — Task 8 review blockers closed locally

- Claim/Evidence 的 SourceMap/object-storage 预检已移到 Serializable 事务外；事务内重新校验 version/manifest/artifact/hash/ref 与 CAS。Evidence 幂等重放不依赖对象存储在线。
- `codeRange` 在没有权威 source revision 前由 API/Domain 失败关闭；`review.analyze` 在 API、Domain、Worker 三层绑定同一 RO，Worker 只消费持久化 payload。
- 发布展示资产复用检查改为按全部受审 Evidence hash 精确查询，关闭截断前缀绕过。共享 content-addressed SourceMap 不盲删，引用安全 GC/retention 明确归 Task 10。
- 新鲜本地证据：全仓 build/typecheck/lint/test 通过；Domain 52/470、API 14/78、Worker 26/452 全绿，release contract 91 pass / 7 platform skips / 0 fail；CI 与 ECS 真实 RO journey 尚未完成。

## 2026-08-29 — Task 8 evidence package and handoff prepared

- 按用户要求暂停 Task 8 继续开发，先整理 `docs/proposals/2026-08-29-project-development-deployment-evidence-pack.md`：包含分支/时间线 Git 记录、网站四层上线口径、当前 release/rollback/TLS/container 证据，以及 suggested / confirmed 的数据库字段、生产聚合与完整展示 API 样例；样例为自编演示数据，不是生产用户记录。
- ECS 只读复核：public/loopback `/__release` 均为 `5e5ae36…`，rollback `6cabe422…`，生产服务健康；`agent_tasks.result` 为 JSONB，`IngestionTaskState` 含 `needs_review`/`confirmed`。聚合为 14 条待确认建议、7 条 confirmed、21 条总计，无业务正文或用户信息输出。
- Task 8 本地已形成 Claim/Evidence CRUD、可信 SourceMap ref、发布阻断与快照等实现及测试；该时点仍有复审阻断项，现状以上一节为准。

## 2026-08-29 — Task 7 identity routing deployed and accepted

- 注册确认现要求用户选择研究身份（默认中性 reader），与 User、默认 Workspace、身份 profile 和审计在同一数据库事务内创建；产品不暴露模式切换。
- 新增认证后的身份/兴趣读取、版本化更新和 accept/reject 纠正接口。Agent API 只接受当前目标/Claim，服务端从本人 profile、当前 RO/Claim 构建并持久化确定性 `InterestContext`；拒绝客户端伪造上下文、敏感字段与站外历史。
- Settings 已接入同一身份表单及兴趣纠正；Worker 把受控上下文注入 Hermes，并把 rejected signals 当作明确排除项。Migration 30 为旧用户补 neutral reader，新增 signals 与 AgentTask context；search 数据库保持独立 2/2。
- Exact CI `33246701963` / job `99085303687` 全绿。ECS 完成 parser acceptance、migration 30、BGE CPU runtime、内外健康、active/rollback retention 与 immutable release；Taskmaster Task 7 已置 done。
- 真实生产旅程从公网完成注册、身份读取、两次 MiniMax `workspace.guide`、信号 accept、第二次快照与登出。两次任务均一次成功；持久化 context 从 profileVersion 1/空 history 变为 version 2/`accepted_history`，随后精确清理用户、challenge、task、session、usage 与用户审计至 0。
- Vision 仍关闭，留到后续管理员代表性生产任务调用；不为追求测试数量提前付费。CPU parser 16-case 仍为 14 succeeded / 2 intentional needs_review / 0 failed / 0 false-ready，暂不安装 Docling。

## 2026-08-29 — Final parser deployment and review closed

- Exact CI run `33240457443` / job `99068791412` success（11m10s）。ECS schema 3 / `hermes-parser-14-2-v1` 为 14 succeeded / 2 intentional needs review / 0 failed / 0 false-ready；gateway structured fake/external/error 为 14/0/0。
- 26 个 locator 全复现，含 3 个正式 `table-cell`；最终 source review 为 `READY`，0 Critical / 0 Important / 0 Minor。
- 接受镜像：Worker `sha256:11f36807956003cf47ca18ad1f4a85a3830af4c24b81b466d566da4b10951a02`；Parser `sha256:4e4819ecd4b45ce473fe5076f09e46410f1f16b601a65b7bb461f046e75c70d8`。Parser 仍为 CPU-only、`network=none`、无 Secret、非 root、只读、512 MiB/64 PID。
- `.release-id`、public/loopback `/__release`、运行镜像、core/search `29/29`/`2/2`、BGE、startup self-test、7 组备份、failure/journal markers 均全绿；部署本身净增 `817,916 KiB`，未清理服务器对象。

## 2026-08-29 — Exact cleanup and retention prevention

- 用户批准的 ECS 精确清理在生产 FD9 锁内完成：移除 40 个 inactive release roots、3 个 exact failed eval/acceptance paths、旧 workspace backup、已审计 package/browser caches、16 个旧 Worker/Parser tags、3 个 dangling IDs 与 build cache。保留 active/rollback、有效证据、7 组备份、production/BGE/monitor volumes、logs、DNF 与项目 tool cache。
- 根盘 used 从 `78,488,031,232` 降至 `48,109,350,912` bytes，释放 `30,378,680,320` bytes；52% → 32%，available `103,363,416,064` bytes。清理后 release roots 恰为 active `6cabe…` + rollback `28a…`，core/search、Parser、BGE、容器、公网/loopback、备份均复验全绿。
- `/opt/openscience/.rollback-id` 已在 FD9 锁内按 root `0600` 原子 bootstrap 为 `28a3d5c…`。自动 retention 候选已实现：pending v2 冻结清单、tombstone 崩溃续跑、active/rollback 多层保护、全部容器/mount/image/capability 门禁、post-unlink 恢复；禁止 broad prune，自动范围仅旧 release/capability/exact SHA tags。
- Fresh release-contract `98` tests：91 pass / 7 platform skips / 0 fail；安全复审 0 blocker。Exact Ubuntu CI `33244792397` / job `99080299130` 已 success（含 Linux/FD9 门禁）；代码尚未部署，下一次 immutable release 才会启用自动 retention。
- 下一产品任务是 Task 7 身份/兴趣静默路由；Vision 只在后续真实生产任务中以管理员 canary 验证，不以脱离产品的循环测试替代进度。
