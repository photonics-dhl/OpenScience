# OpenScience 进度（CURRENT window）

> 最新同步：2026-08-29。历史由 Git 保存；旧计划和 archive 不作为默认输入。

## Current version tuple

- Branch / application source: `codex/hermes-wanko-live2d` / `6cabe422a8459dfa358786c9f5aae84558949f6b`。
- Production immutable release: `6cabe422a8459dfa358786c9f5aae84558949f6b`；rollback `28a3d5ca681b7744fae521dfa9154100a24e8845`；无迁移。
- Taskmaster `hermes-research-intelligence` 保持 6/12：Tasks 1–6 done；Task 7 next，Task 10 dependency-ready。后续 docs-only closeout HEAD 只同步事实，不改变 application source/release。

## 2026-08-29 — Task 7 identity routing candidate in review

- 注册确认现要求用户选择研究身份（默认中性 reader），与 User、默认 Workspace、身份 profile 和审计在同一数据库事务内创建；产品不暴露模式切换。
- 新增认证后的身份/兴趣读取、版本化更新和 accept/reject 纠正接口。Agent API 只接受当前目标/Claim，服务端从本人 profile、当前 RO/Claim 构建并持久化确定性 `InterestContext`；拒绝客户端伪造上下文、敏感字段与站外历史。
- Settings 已接入同一身份表单及兴趣纠正；Worker 把受控上下文注入 Hermes，并把 rejected signals 当作明确排除项。Migration 30 为旧用户补 neutral reader，新增 signals 与 AgentTask context；search 数据库保持独立 2/2。
- 聚焦回归与全仓 build/typecheck/lint/test 已绿：release contract 98（91 pass / 7 Windows skips）、Web 412、Domain 452、Worker 450、API 74；docs-sync 8/8。最终安全复审 0 Critical / 0 Important blocker。当前仍是未部署候选，Taskmaster 保持 6/12；只在 exact CI、ECS migration 30 与真实产品旅程通过后关闭 Task 7。

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
