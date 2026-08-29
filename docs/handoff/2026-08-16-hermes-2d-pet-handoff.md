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
- Fresh post-deploy audit：根盘 used/free `78,492,704,768` / `72,980,062,208` bytes；ordered releases `23,119,495,168`；eval incremental `12,947,587,072`；acceptance `815,104`；pnpm incremental `3,593,535,488`；部署净增 `817,916 KiB`。本轮未清理。

## Constraints and hygiene decision

- `KEEP`：active `6cabe…`、rollback `28a…`、production/BGE/monitor volumes、7 backups 与 logs。
- `DELETE_CANDIDATE`（仍需精确批准）：build cache、dangling/失败 `63eb…`/`9e9…` tags、退出的 `c581…` tags、pnpm/npm/dnf/root caches、旧 Aug 09 workspace backup 非重复部分、Playwright cache。
- `INVESTIGATE`：其他 40 releases、历史 eval families、旧 accepted image tags 与 dev stack。立即候选保守非重复估计约 `9.50 GB`；不含 other releases `19,501,924,352` 或 eval incremental `12,947,587,072` bytes。
- 任何删除必须先获得用户对精确路径/tag/ID/cache 白名单的明示批准；禁止 broad prune/wildcard。Windows 只用显式 Git for Windows Bash + canonical scripts。

## Next action

1. 从 Task 7 身份/兴趣静默路由开始；Task 10 仍 dependency-ready。
2. 如要回收磁盘，先对 `docs/runbooks/deployment.md` §5.40 的精确候选形成用户批准白名单；未批准前不删除。

## Read first

1. `AGENTS.md`
2. 本 handoff
3. `docs/specs/2026-08-26-hermes-research-intelligence-platform-design.md`
4. `docs/progress.md`
5. `docs/runbooks/deployment.md` §5.40

`project_index.md` 只用 `rg` 定向查 CURRENT；不要从较旧 `main` 推断服务器现状。
