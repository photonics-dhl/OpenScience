# Hermes Research Intelligence CURRENT Handoff

> **CURRENT active-memory，2026-08-29。** 产品主线是 Research Intelligence；Landing/Hermes 视觉冻结，旧候选只从 Git history 查阅。

## Goal and state

- 目标：以 3–7 个 Claim 为公开 RO 中心，提供可定位 Evidence、条件/限制、身份静默路由、CPU 文档解析、混合检索和可版本化富媒体。
- Taskmaster `hermes-research-intelligence` Tasks 1–7 已生产部署，当前 7/12；Task 4 最终 profile 为 14 succeeded / 2 intentional needs_review / 0 failed / 0 false-ready。
- Task 7 身份/兴趣静默路由已通过 exact CI、ECS migration 30、immutable deploy 与真实 MiniMax 产品旅程；Task 8 next，Task 10 也 dependency-ready。

## Version tuple

- Worktree: `E:/Miscellaneous/XGS/.worktrees/readable-hermes-guidance`
- Branch / application source: `codex/hermes-wanko-live2d` / `5e5ae36a08ae314d0c35ee2b976e306aec73d219`
- Deployed immutable application/release: `5e5ae36a08ae314d0c35ee2b976e306aec73d219`
- Rollback: `6cabe422a8459dfa358786c9f5aae84558949f6b`; core/search migrations `30/30` / `2/2`
- 后续 docs-only closeout HEAD 不改变 application source/release；docs HEAD、main 与 ECS release 不得混写。
- 当前 worktree 在 application source 上仅含 Taskmaster/docs closeout；上述 tuple 以 ECS 生产实测为准。

## Delivered and verified on ECS

- Exact CI run `33246701963` / job `99085303687` success（12m12s）；release `5e5ae36…` 的 parser acceptance、BGE CPU canary 与生产启动均通过。
- Schema 3 `hermes-parser-14-2-v1` 为 14/2/0/0；gateway structured fake/external/error 14/0/0；26 locators 与 3 个 `table-cell` 全部复现。
- Parser 保持 `network=none`、无 Secret、只读、非 root、512 MiB/64 PID；MiniMax Vision disabled，未晋升 GROBID、PaddleOCR、Docling 或 LiteParse。
- `.release-id`、loopback/public `/__release`、运行镜像、production startup、core/search `30/30`/`2/2`、BGE、7 组备份与 failure/journal markers 全绿。
- Exact ECS cleanup 先释放 `30,378,680,320` bytes；部署后根盘约 58 GiB used / 84 GiB available（41%）。release roots 恰为 active `5e5ae36…` + rollback `6cabe422…`；新增占用主要是两个受保护 BGE release image（各约 6.27 GB），不是可 prune 垃圾。

## Constraints and hygiene state

- 用户批准的精确清理已移除 40 个 inactive releases、失败证据 exact paths、旧 workspace backup、已审计 caches/old tags/dangling IDs/build cache；保留有效 evidence、7 backups、production/BGE/monitor volumes 与 logs。
- `.rollback-id` 已由部署事务发布为 `6cabe422…`；自动 retention 已真实执行并只保留 active+rollback roots/tags。pending/journal/failure markers 均不存在，禁止 broad prune/wildcard。
- 卫生纪律：每次 release 在同一 FD9 事务完成 retention；测试临时 root 在证据复制后精确删除；Docker reclaimable 不等于垃圾，任何清理都先排除 active/rollback image、13 个在用 volume、证据和 7 组备份。Windows 只用显式 Git for Windows Bash。

## Task 7 production acceptance

- 注册确认要求公开的研究身份输入；新注册、旧 invited、neutral backfill、Personal Workspace 与审计保持事务一致，产品无模式切换。
- 身份/兴趣 API 使用 session、CSRF、CAS 与事务内审计；Settings 支持纠正信号及 409 自动重载。AgentTask 由服务端保存确定性 InterestContext，拒绝敏感/站外字段、伪造 Claim 和跨 RO。
- 所有新 AgentTask 自动快照；旧 NULL context 幂等兼容受限于可证明相同 intent。真实公网旅程两次 MiniMax 调用均首试成功；context 从 profileVersion 1 变为 2 并出现 `accepted_history`，无可见模式开关。
- 一次性验收账号及 challenge/task/session/usage/用户审计已精确清理为 0。Vision 仍 disabled；Docling 保持 pilot，不污染生产目录。

## Next action

1. 执行 Taskmaster Task 8：在现有 RO/version/approval 边界上补 Claim/Evidence 操作、locator 复验、发布阻断与审计；不得重建已有 API。
2. Task 10 仍 dependency-ready，但外部检索先等 Task 8 的 Evidence/rights 落库边界稳定；数据库继续与产品代码解耦。
3. Vision 留到后续真实管理员代表性生产任务做 canary；仅在真实文档证明 14/2 链有版式缺口时重开 Docling exact-ECS gate。

## Read first

1. `AGENTS.md`
2. 本 handoff
3. `docs/specs/2026-08-26-hermes-research-intelligence-platform-design.md`
4. `docs/progress.md`
5. `docs/runbooks/deployment.md` §5.41

`project_index.md` 只用 `rg` 定向查 CURRENT；不要从较旧 `main` 推断服务器现状。
