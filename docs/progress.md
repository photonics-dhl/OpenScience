# OpenScience 进度（CURRENT window）

> 最新同步：2026-08-29。历史由 Git 保存；旧计划和 archive 不作为默认输入。

## Current version tuple

- Worktree branch / HEAD: `codex/hermes-wanko-live2d` / `2add415853570c4cd3cacbca13dfeb0f1e3825d4`；当前保留尚未提交的 Task 8 工作树改动。
- Production application source / immutable release: `5e5ae36a08ae314d0c35ee2b976e306aec73d219`；docs HEAD、本地 main 与生产身份不得混写。
- Production immutable release: `5e5ae36a08ae314d0c35ee2b976e306aec73d219`；rollback `6cabe422a8459dfa358786c9f5aae84558949f6b`；core/search migrations `30/30` / `2/2`。
- Taskmaster `hermes-research-intelligence` 为 7/12：Tasks 1–7 done；Task 8 为 `in-progress`、未提交/未部署，Task 10 仍 dependency-ready。

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
