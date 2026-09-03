# Hermes Research Intelligence CURRENT Handoff

> **CURRENT active-memory，2026-09-03 14:28 +08。** ScanSci Google 启动页兼容修复已随 `63a0641…` 部署，浙江大学 CARSI 与 publisher Cookie 保留。首次订阅 DOI 复测暴露上游 browser_engine 未消费既有 `SCANSCI_PDF_PROXY`；最小代理兼容候选 `e3c5f2d…` 已通过本地门禁，尚未合并/部署。Taskmaster 为 9/12，Task 10 仍在进行。

## Goal and state

- 产品目标：以 3–7 个 Claim 为公开 RO 中心，提供可定位 Evidence、条件/限制、身份静默路由、CPU 文档解析、混合检索和可版本化富媒体。
- Taskmaster `hermes-research-intelligence` 为 9/12；ScanSci upstream plan 的替换、部署与清理已完成，Task 10 的机构正向旅程未完成。
- 当前唯一任务是发布 browser proxy 兼容补丁，再验证 subscription-only PDF、MCP recreate/repeat、四入口与 72h/600s 生命周期。

## Version tuple

- Worktree: `E:/Miscellaneous/XGS/.worktrees/readable-hermes-guidance`
- Branch / application candidate: `codex/scansci-upstream-mcp` / `e3c5f2d4383e65006d5e8681c48ae376ea545bd2`；分支 HEAD 可仅因本次 CURRENT 文档同步继续前移。
- Production application source / immutable release: `63a064197e288b42abb9b44ef1ddbdedf99ed735`
- Rollback: `e72291f341a888df3a58c3e086211ad7c7d55ee3`
- 生产已包含 PR #55 的 networkless `about:blank` 启动页修复。新候选仅让 browser_engine 优先消费生产已声明的 `SCANSCI_PDF_PROXY`，随后保留原 `browser_static_proxy` fallback；ScanSci `1/1`、retrieval `18/18`、rights `6/6`、全仓 build/typecheck/lint 均通过。Core/search migrations 为 `36/36` / `2/2`。

## Production truth

- 2026-09-03 14:23 +08 canonical deployment：Public `/__release` 与 active marker 均返回 `63a0641…`；API/Web/Worker/Parser/official MCP/BGE healthy，parser acceptance 与 journal-clear 通过；core/search migrations `36/36` / `2/2` current。
- 服务器只保留 active/rollback 两个 release/report、`retrieval_net`、`scansci-data`、`scansci-papers` 与产品数据。旧网络/卷/image/systemd/drop-in/iptables/Squid browser 规则/Secret/eval/dangling image 均为 0；38 个旧 acceptance、5 个 eval 和匿名失败容器已清，根盘 50G/148G、可用 92G，build cache 0。
- TLS certificate subject 为 `openscience.428312321.xyz`，有效期自 2026-08-03 20:10:34 +08:00；ECS、域名反代、Landing、Cloudflare Tunnel 的上线日期必须按证据包分开表述。
- `agent_tasks.result` 为 JSONB，`IngestionTaskState` 含 `needs_review` 与 `confirmed`。生产聚合为 14 条待确认建议、7 条 confirmed、21 条总计；未输出业务正文或用户信息。
- 数据库不存在字面 `suggested` 枚举：产品语义映射为 `result != null + state=needs_review`，确认后 `state=confirmed`。

## Done

- Taskmaster Tasks 1–9 已完成：Research Intelligence 基线、核心模型、SourceMap、CPU Parser、AI Gateway、BGE-M3 混合检索、身份路由、Claim/Evidence API 和 Claim-first 公共页均已生产验收。
- Task 10 的 provider-neutral rights、provenance、72h 私有缓存、10 分钟一次性下载、GC、Semantic Scholar 与官方 ScanSci OA 路径已接通；机构路径仍待正向验收。
- PR #50 / CI `33653209566` 将官方 MCP 最终发布为 `80db41e…`。旧私有 ScanSci 与浏览器认证链路已退出 active/rollback，服务器冗余已按白名单清理。
- 官方认证入口为 active release 的 `infra/scripts/import-scansci-cookies.sh`，导入状态只持久化在 `scansci-data`。
- PR #54 / CI `33712614976` 的导入清理与机构权利绑定已包含在生产 `e72291f…`；真实 CARSI 登录成功，active helper 两次导入均返回 `SCANSCI_COOKIE_IMPORT_OK`，主机/容器 staging 清理通过。

## Open risks and constraints

- 官方 Cookie 已导入，但 subscription-only PDF 尚无正向证据；`63a0641…` 已到达 Elsevier browser strategy，当前 `not_found` 根因是上游 browser_engine 未读取现有 `SCANSCI_PDF_PROXY` 而直接导航，隔离网络内返回 `ERR_NAME_NOT_RESOLVED`。
- 四入口尚未在生产完成统一旅程：Personal Space、Hermes、RO Hermes、RO Files/Evidence。
- Task 10 在机构下载、MCP recreate/repeat、一次性下载和 72h/600s 生命周期全部通过前保持 `in-progress`，不得把 Taskmaster 改为 10/12。
- 不恢复 noVNC/auth sidecar，不保存账号密码，不读取或打印 `.env`、Cookie、MCP 原始响应或生产文档正文。
- 生产操作只走 canonical wrapper；Windows 必须由 PowerShell 显式调用 Git for Windows Bash。不得使用本机 Docker 或 broad prune，必须保留 active/rollback、数据卷、对象存储、BGE、监控与备份。

## Next action

1. 将代理兼容候选 `e3c5f2d…` 经 PR/CI 合并，并按 canonical transaction 部署合并后的 immutable SHA。
2. 对 subscription-only DOI 验证官方 MCP 下载以及 MCP recreate/repeat 后的持久会话复用。
3. 完成四入口、10 分钟一次性下载和 72 小时缓存/GC 的生产正向旅程；全部通过后将 Taskmaster Task 10 置为 done，进度改为 10/12。

## Read first

1. `AGENTS.md`
2. 本 handoff
3. `docs/specs/2026-09-02-scansci-upstream-mcp-design.md`
4. `docs/plans/2026-09-02-scansci-upstream-mcp-plan.md`
5. `docs/plans/2026-08-30-hermes-external-retrieval-lifecycle-plan.md`
6. `docs/specs/2026-08-26-hermes-research-intelligence-platform-design.md` 与 `docs/progress.md`

`project_index.md` 只定向检索 CURRENT；历史计划、旧 release 段落、根目录旧 `main` 和其他 worktree 均不是当前实施入口。
