# OpenScience 进度（CURRENT window）

> 最新同步：2026-08-29。历史由 Git 保存；旧计划和 archive 不作为默认输入。

## Current version tuple

- Branch / implementation HEAD: `codex/hermes-wanko-live2d` / `28a3d5ca681b7744fae521dfa9154100a24e8845`。
- Production application/release: `28a3d5ca681b7744fae521dfa9154100a24e8845`。
- Rollback: `c5817121bddbd065c5ecb38811da8e707e6e5d17`。
- Taskmaster `hermes-research-intelligence` 为 6/12：Tasks 1–6 done；Tasks 7 和 10 dependency-ready。Docs-only closeout HEAD 不改变 application source/release。

## 2026-08-29 — Parser acceptance debt closed in production

- Exact CI run `33235948918` 全绿。ECS formal report 是 schema 3 / `hermes-parser-14-2-v1`：16 cases，14 succeeded / 2 intentional needs review / 0 failed / 0 false-ready，structured fake 14 / external 0。
- Notebook/Python/CSV/XLSX 四个 bounded subset 已自动化；损坏 PDF 与空白 PNG 保持 `unreadable-or-corrupt-document` / `no-meaningful-content` 的安全拦截。成功用例 locator 全部复现，含三个正式 `table-cell` locator。
- 接受镜像：Worker `sha256:35191f652dfd873fd9f817d567a329a061e2c99eb55049b9898c2ffc2a5ec5aa`；Parser `sha256:aed451e95337219376499fa1ffe9ff5d7854c75f1c96df8d3ca6c5ef5b577dbe`。Parser 仍为 CPU-only、`network=none`、无 Secret、非 root、只读、512 MiB/64 PID。
- Immutable transaction 以 `c581712…` 为 rollback 切换至 `28a3d5c…`；`.release-id`、public/loopback `/__release`、运行镜像、core/search `29/29`/`2/2`、BGE、startup self-test、无 failure/journal marker 均通过。

## Fresh disk audit and next action

- 根盘总/用/可用为 `158,132,850,688` / `77,656,059,904` / `73,816,707,072` bytes。Release 根为 `22,499,897,344` physical / `19,399,624,994` apparent bytes，41 个目录；硬链接值不得相加。
- `KEEP`：active/rollback、`28a…` formal evidence、生产/BGE 卷、监控卷、7 组备份。`DELETE_CANDIDATE`：失败 `63eb…`/`9e9…` release/eval/acceptance/image tags、3 个 dangling image、Docker build cache、root pnpm/npm 与 dnf 可再生缓存。其他 37 个 release、eval 根、dev stack 与 `/root/.cache` 为 `INVESTIGATE`。
- 本轮未删除任何服务器对象。任何清理必须先获得用户对精确路径/image/cache 白名单的明示批准，禁止 broad prune/wildcard。
- 下一产品任务按依赖顺序为 Task 7 身份/兴趣静默路由；Task 10 外部检索/临时文档生命周期也已 dependency-ready。Docker、迁移、镜像与最终运行验收仍只在 ECS。
