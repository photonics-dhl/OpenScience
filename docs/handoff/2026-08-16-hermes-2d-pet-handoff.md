# Hermes Research Intelligence CURRENT Handoff

> **CURRENT active-memory，2026-08-29。** 产品主线是 Research Intelligence；Landing/Hermes 视觉冻结，旧候选只从 Git history 查阅。

## Goal and state

- 目标：以 3–7 个 Claim 为公开 RO 中心，提供可定位 Evidence、条件/限制、身份静默路由、CPU 文档解析、混合检索和可版本化富媒体。
- Taskmaster `hermes-research-intelligence` Tasks 1–6 已生产部署，保持 6/12；Task 4 最终 profile 为 14 succeeded / 2 intentional needs_review / 0 failed / 0 false-ready。
- Task 7 身份/兴趣静默路由候选已完成本地实现与安全复审，0 Critical / 0 Important blocker；尚未提交/部署，Taskmaster 保持 6/12，Task 10 dependency-ready。

## Version tuple

- Worktree: `E:/Miscellaneous/XGS/.worktrees/readable-hermes-guidance`
- Branch / application source: `codex/hermes-wanko-live2d` / `6cabe422a8459dfa358786c9f5aae84558949f6b`
- Deployed immutable application/release: `6cabe422a8459dfa358786c9f5aae84558949f6b`
- Rollback: `28a3d5ca681b7744fae521dfa9154100a24e8845`; migration: none
- 后续 docs-only closeout HEAD 不改变 application source/release；docs HEAD、main 与 ECS release 不得混写。
- 当前 worktree 含待提交的 Task 7 candidate；上述 tuple 在 immutable 部署成功前仍以 ECS 生产事实为准。

## Delivered and verified on ECS

- Exact CI run `33240457443` / job `99068791412` success（11m10s）；Worker `sha256:11f36807956003cf47ca18ad1f4a85a3830af4c24b81b466d566da4b10951a02`，Parser `sha256:4e4819ecd4b45ce473fe5076f09e46410f1f16b601a65b7bb461f046e75c70d8`。
- Schema 3 `hermes-parser-14-2-v1` 为 14/2/0/0；gateway structured fake/external/error 14/0/0；26 locators 与 3 个 `table-cell` 全部复现。
- Parser 保持 `network=none`、无 Secret、只读、非 root、512 MiB/64 PID；MiniMax Vision disabled，未晋升 GROBID、PaddleOCR、Docling 或 LiteParse。
- `.release-id`、loopback/public `/__release`、运行镜像、production startup、core/search `29/29`/`2/2`、BGE、7 组备份与 failure/journal markers 全绿；本次无迁移。
- Exact ECS cleanup 后根盘 used/available `48,109,350,912` / `103,363,416,064` bytes（32%），释放 `30,378,680,320` bytes；release roots 恰为 active+rollback，生产健康复验全绿。

## Constraints and hygiene state

- 用户批准的精确清理已移除 40 个 inactive releases、失败证据 exact paths、旧 workspace backup、已审计 caches/old tags/dangling IDs/build cache；保留有效 evidence、7 backups、production/BGE/monitor volumes 与 logs。
- `.rollback-id` 已在 FD9 锁内原子 bootstrap 为 `28a3d5c…`。自动 retention 候选已通过 release-contract 与最终安全复审：只删旧 release/capability/exact SHA image tags，pending v2+tombstone 可恢复，禁止 broad prune/wildcard。
- 自动 retention 已在候选 `7024fed6` 通过 exact Ubuntu CI `33244792397` / job `99080299130`；尚未部署，须随下一次 immutable ECS release 验收。Windows 只用显式 Git for Windows Bash + canonical scripts。

## Task 7 candidate

- 注册确认要求公开的研究身份输入；新注册、旧 invited、neutral backfill、Personal Workspace 与审计保持事务一致，产品无模式切换。
- 身份/兴趣 API 使用 session、CSRF、CAS 与事务内审计；Settings 支持纠正信号及 409 自动重载。AgentTask 由服务端保存确定性 InterestContext，拒绝敏感/站外字段、伪造 Claim 和跨 RO。
- 所有新 AgentTask 自动快照；旧 NULL context 幂等兼容受限于可证明相同 intent。全仓 build/typecheck/lint/test 和 migration contract 绿，最终安全复审无 blocker。

## Next action

1. 提交/push Task 7 candidate，等待 exact CI；随后以当前 production `6cabe…` 为 rollback ref 执行 immutable ECS migration 30 + deploy，并验收 retention 收口。
2. 在生产完成注册/身份读取与纠正/Hermes 任务快照真实旅程后才标 Task 7 done；Task 10 仍 dependency-ready。
3. Vision 留到后续真实生产任务做管理员 canary；不新增 Docling，除非真实用户文档暴露现有 14/2 链的明确版式缺口。

## Read first

1. `AGENTS.md`
2. 本 handoff
3. `docs/specs/2026-08-26-hermes-research-intelligence-platform-design.md`
4. `docs/progress.md`
5. `docs/runbooks/deployment.md` §5.41

`project_index.md` 只用 `rg` 定向查 CURRENT；不要从较旧 `main` 推断服务器现状。
