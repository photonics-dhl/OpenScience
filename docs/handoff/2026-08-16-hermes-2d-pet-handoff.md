# Hermes Research Intelligence CURRENT Handoff

> **CURRENT active-memory，2026-09-03 09:17 +08。** ScanSci 官方 MCP 替换、生产部署和旧运行链路清理已完成。Taskmaster 为 9/12；Task 10 仍在进行，机构订阅 PDF 与四入口正向验收未完成，Task 11 继续阻断。

## Goal and state

- 产品目标：以 3–7 个 Claim 为公开 RO 中心，提供可定位 Evidence、条件/限制、身份静默路由、CPU 文档解析、混合检索和可版本化富媒体。
- Taskmaster `hermes-research-intelligence` 为 9/12；ScanSci upstream plan 的替换、部署与清理已完成，Task 10 的机构正向旅程未完成。
- 当前唯一任务是通过官方 `cookie_import` 将一次浙江大学或出版社认证持久化到 `scansci-data`，再验证 subscription-only PDF、四入口与 72h/600s 生命周期。

## Version tuple

- Worktree: `E:/Miscellaneous/XGS/.worktrees/readable-hermes-guidance`
- Branch / HEAD: `codex/scansci-upstream-mcp` / `f6f0c0e8cbc99a5c644095462a205b31b6f4a635`，与 `origin/main`、`origin/codex/scansci-upstream-mcp` 一致。
- Production application source / immutable release: `80db41e7ee0a1c8158d3f335dc1b2fbf6f2bb2bf`
- Rollback: `761b93d4bbce77e70d676be78de0bba128974fe6`
- HEAD 在生产 release 之后只有 CURRENT 文档同步，没有未部署产品代码。Core/search migrations 为 `34/34` / `2/2`；本地旧 `main@b9616cb` 与其他 worktree 不得用于推断当前状态。

## Production truth

- 2026-09-03 09:17 +08 只读复核：Public `/__release` 与 active marker 均返回 `80db41e…`；API/Web/Worker/Parser/official MCP/BGE healthy，journal/failed absent；core/search migrations `34/34` / `2/2` current。
- 服务器只保留 active/rollback 两个 release/report、`retrieval_net`、`scansci-data`、`scansci-papers` 与产品数据。旧网络/卷/image/systemd/drop-in/iptables/Squid browser 规则/Secret/eval/dangling image 均为 0；38 个旧 acceptance、5 个 eval 和匿名失败容器已清，根盘 50G/148G、可用 92G，build cache 0。
- TLS certificate subject 为 `openscience.428312321.xyz`，有效期自 2026-08-03 20:10:34 +08:00；ECS、域名反代、Landing、Cloudflare Tunnel 的上线日期必须按证据包分开表述。
- `agent_tasks.result` 为 JSONB，`IngestionTaskState` 含 `needs_review` 与 `confirmed`。生产聚合为 14 条待确认建议、7 条 confirmed、21 条总计；未输出业务正文或用户信息。
- 数据库不存在字面 `suggested` 枚举：产品语义映射为 `result != null + state=needs_review`，确认后 `state=confirmed`。

## Done

- Taskmaster Tasks 1–9 已完成：Research Intelligence 基线、核心模型、SourceMap、CPU Parser、AI Gateway、BGE-M3 混合检索、身份路由、Claim/Evidence API 和 Claim-first 公共页均已生产验收。
- Task 10 的 provider-neutral rights、provenance、72h 私有缓存、10 分钟一次性下载、GC、Semantic Scholar 与官方 ScanSci OA 路径已接通；机构路径仍待正向验收。
- PR #50 / CI `33653209566` 将官方 MCP 最终发布为 `80db41e…`。旧私有 ScanSci 与浏览器认证链路已退出 active/rollback，服务器冗余已按白名单清理。
- 官方认证入口为 active release 的 `infra/scripts/import-scansci-cookies.sh`，导入状态只持久化在 `scansci-data`。

## Open risks and constraints

- 官方 Cookie 尚未导入，subscription-only PDF 尚无正向证据；Semantic Scholar 免费副本和 OA PDF 不能替代机构订阅验收。
- 四入口尚未在生产完成统一旅程：Personal Space、Hermes、RO Hermes、RO Files/Evidence。
- Task 10 在机构下载、MCP recreate/repeat、一次性下载和 72h/600s 生命周期全部通过前保持 `in-progress`，不得把 Taskmaster 改为 10/12。
- 不恢复 noVNC/auth sidecar，不保存账号密码，不读取或打印 `.env`、Cookie、MCP 原始响应或生产文档正文。
- 生产操作只走 canonical wrapper；Windows 必须由 PowerShell 显式调用 Git for Windows Bash。不得使用本机 Docker 或 broad prune，必须保留 active/rollback、数据卷、对象存储、BGE、监控与备份。

## Next action

1. 管理员在普通浏览器完成浙江大学或出版社认证，导出 Netscape Cookie，并用 active release helper 执行一次官方 `cookie_import`。
2. 选择 subscription-only DOI，验证官方 MCP 下载以及 MCP recreate/repeat 后的会话复用。
3. 完成四入口、10 分钟一次性下载和 72 小时缓存/GC 的生产正向旅程。
4. 全部通过后将 Taskmaster Task 10 置为 done，进度改为 10/12，再启动 Task 11 确定性富媒体资产。

## Read first

1. `AGENTS.md`
2. 本 handoff
3. `docs/specs/2026-09-02-scansci-upstream-mcp-design.md`
4. `docs/plans/2026-09-02-scansci-upstream-mcp-plan.md`
5. `docs/plans/2026-08-30-hermes-external-retrieval-lifecycle-plan.md`
6. `docs/specs/2026-08-26-hermes-research-intelligence-platform-design.md` 与 `docs/progress.md`

`project_index.md` 只定向检索 CURRENT；历史计划、旧 release 段落、根目录旧 `main` 和其他 worktree 均不是当前实施入口。
