# OpenScience 进度（CURRENT window）

> 最新同步：2026-08-29。历史由 Git 保存；旧计划和 archive 不作为默认输入。

## Current version tuple

- Branch / application source: `codex/hermes-wanko-live2d` / `6cabe422a8459dfa358786c9f5aae84558949f6b`。
- Production immutable release: `6cabe422a8459dfa358786c9f5aae84558949f6b`；rollback `28a3d5ca681b7744fae521dfa9154100a24e8845`；无迁移。
- Taskmaster `hermes-research-intelligence` 保持 6/12：Tasks 1–6 done；Task 7 next，Task 10 dependency-ready。后续 docs-only closeout HEAD 只同步事实，不改变 application source/release。

## 2026-08-29 — Final parser deployment and review closed

- Exact CI run `33240457443` / job `99068791412` success（11m10s）。ECS schema 3 / `hermes-parser-14-2-v1` 为 14 succeeded / 2 intentional needs review / 0 failed / 0 false-ready；gateway structured fake/external/error 为 14/0/0。
- 26 个 locator 全复现，含 3 个正式 `table-cell`；最终 source review 为 `READY`，0 Critical / 0 Important / 0 Minor。
- 接受镜像：Worker `sha256:11f36807956003cf47ca18ad1f4a85a3830af4c24b81b466d566da4b10951a02`；Parser `sha256:4e4819ecd4b45ce473fe5076f09e46410f1f16b601a65b7bb461f046e75c70d8`。Parser 仍为 CPU-only、`network=none`、无 Secret、非 root、只读、512 MiB/64 PID。
- `.release-id`、public/loopback `/__release`、运行镜像、core/search `29/29`/`2/2`、BGE、startup self-test、7 组备份、failure/journal markers 均全绿；部署本身净增 `817,916 KiB`，未清理服务器对象。

## Fresh post-deploy disk audit and next action

- 根盘用/可用为 `78,492,704,768` / `72,980,062,208` bytes（52%）。跨根有序物理值：release `23,119,495,168`；eval incremental `12,947,587,072`；acceptance `815,104`；pnpm incremental `3,593,535,488`；旧 Aug 09 workspace backup incremental `522,768,384`。硬链接与 Docker shared layer 不得重复相加。
- `KEEP`：active `6cabe…`、rollback `28a…`、生产/BGE/监控卷、7 组备份与日志。`DELETE_CANDIDATE`（仍需精确批准）：build cache、dangling/失败 `63eb…`/`9e9…` tags、退出的 `c581…` tags、pnpm/npm/dnf/root caches、旧 Aug 09 workspace backup 非重复部分、可重下载 Playwright cache。其他 40 releases、历史 eval families、旧 accepted image tags 与 dev stack 为 `INVESTIGATE`。
- 立即候选的保守非重复估计约 `9.50 GB`；不包含 other releases `19,501,924,352` bytes 或 eval incremental `12,947,587,072` bytes，也不把 Docker 总 reclaimable/共享层再次相加。
- 本轮禁止且未执行任何删除；清理前必须取得用户对精确路径、tag/ID、cache scope 的明示白名单。下一产品任务是 Task 7 身份/兴趣静默路由。
