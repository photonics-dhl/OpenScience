# Hermes Research Intelligence CURRENT Handoff

> **CURRENT active-memory，2026-08-29。** 产品主线是 Research Intelligence；Landing/Hermes 视觉冻结，旧候选只从 Git history 查阅。

## Goal and state

- 目标：以 3–7 个 Claim 为公开 RO 中心，提供可定位 Evidence、条件/限制、身份静默路由、CPU 文档解析、混合检索和可版本化富媒体。
- Taskmaster `hermes-research-intelligence` Tasks 1–6 已生产部署，保持 6/12；Task 4 最终 profile 为 14 succeeded / 2 intentional needs_review / 0 failed / 0 false-ready。
- 最终 source review `READY`，0 Critical / 0 Important / 0 Minor；Task 7 next，Task 10 dependency-ready。

## Version tuple

- Worktree: `E:/Miscellaneous/XGS/.worktrees/readable-hermes-guidance`
- Branch / application source: `codex/hermes-wanko-live2d` / `6cabe422a8459dfa358786c9f5aae84558949f6b`
- Deployed immutable application/release: `6cabe422a8459dfa358786c9f5aae84558949f6b`
- Rollback: `28a3d5ca681b7744fae521dfa9154100a24e8845`; migration: none
- 后续 docs-only closeout HEAD 不改变 application source/release；docs HEAD、main 与 ECS release 不得混写。

## Delivered and verified on ECS

- Exact CI run `33240457443` / job `99068791412` success（11m10s）；Worker `sha256:11f36807956003cf47ca18ad1f4a85a3830af4c24b81b466d566da4b10951a02`，Parser `sha256:4e4819ecd4b45ce473fe5076f09e46410f1f16b601a65b7bb461f046e75c70d8`。
- Schema 3 `hermes-parser-14-2-v1` 为 14/2/0/0；gateway structured fake/external/error 14/0/0；26 locators 与 3 个 `table-cell` 全部复现。
- Parser 保持 `network=none`、无 Secret、只读、非 root、512 MiB/64 PID；MiniMax Vision disabled，未晋升 GROBID、PaddleOCR、Docling 或 LiteParse。
- `.release-id`、loopback/public `/__release`、运行镜像、production startup、core/search `29/29`/`2/2`、BGE、7 组备份与 failure/journal markers 全绿；本次无迁移。
- Exact ECS cleanup 后根盘 used/available `48,109,350,912` / `103,363,416,064` bytes（32%），释放 `30,378,680,320` bytes；release roots 恰为 active+rollback，生产健康复验全绿。

## Constraints and hygiene state

- 用户批准的精确清理已移除 40 个 inactive releases、失败证据 exact paths、旧 workspace backup、已审计 caches/old tags/dangling IDs/build cache；保留有效 evidence、7 backups、production/BGE/monitor volumes 与 logs。
- `.rollback-id` 已在 FD9 锁内原子 bootstrap 为 `28a3d5c…`。自动 retention 候选已通过 release-contract 与最终安全复审：只删旧 release/capability/exact SHA image tags，pending v2+tombstone 可恢复，禁止 broad prune/wildcard。
- 自动 retention 代码尚未部署；须先通过 Ubuntu CI 的 Linux/FD9 门禁，并随下一次 immutable ECS release 验收。Windows 只用显式 Git for Windows Bash + canonical scripts。

## Next action

1. 完成 retention 候选 commit/push/Ubuntu CI 后，从 Task 7 身份/兴趣静默路由按 TDD 实施；Task 10 仍 dependency-ready。
2. Vision 留到后续真实生产任务做管理员 canary；不新增 Docling，除非真实用户文档暴露现有 14/2 链的明确版式缺口。

## Read first

1. `AGENTS.md`
2. 本 handoff
3. `docs/specs/2026-08-26-hermes-research-intelligence-platform-design.md`
4. `docs/progress.md`
5. `docs/runbooks/deployment.md` §5.41

`project_index.md` 只用 `rg` 定向查 CURRENT；不要从较旧 `main` 推断服务器现状。
