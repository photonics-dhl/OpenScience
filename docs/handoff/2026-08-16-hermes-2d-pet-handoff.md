# Hermes Research Intelligence CURRENT Handoff

> **CURRENT active-memory，2026-09-03 16:30 +08。** PR #58 / CI `33730045672` 已把持久化参数修复合并并部署为 `f9dbd59…`。浙江大学 CARSI/publisher Cookie 已由正式 helper 导入，持久文件和重建恢复通过；固定 DOI 已下载为有效 PDF，并在重复调用中得到相同哈希。该 PDF 实际来源为 Semantic Scholar fallback，尚不能作为 subscription-only publisher provenance 证据。Taskmaster 为 9/12，Task 10 仍在进行。

## Goal and state

- 产品目标：以 3–7 个 Claim 为公开 RO 中心，提供可定位 Evidence、条件/限制、身份静默路由、CPU 文档解析、混合检索和可版本化富媒体。
- Taskmaster `hermes-research-intelligence` 为 9/12；ScanSci upstream plan 的替换、部署、Cookie 持久化与普通下载验收已完成，Task 10 的 publisher-provenance 机构旅程尚未完成。
- 当前唯一任务是选择无法由 OA/聚合源回退的 subscription-only DOI，取得明确 institutional/publisher provenance，再完成四入口与 72h/600s 生命周期。

## Version tuple

- Worktree: `E:/Miscellaneous/XGS/.worktrees/readable-hermes-guidance`
- Branch / deployed application source: `codex/scansci-upstream-mcp` / `f9dbd59dc05288814f6a0bfa04c37a602faefa0d`；分支 HEAD 可仅因本次 CURRENT 文档同步继续前移。
- Production application source / immutable release: `f9dbd59dc05288814f6a0bfa04c37a602faefa0d`
- Rollback: `2313038bef4fabce5cdc90517d25cb177ab1e8dd`
- 生产已包含 PR #55–#58 的 networkless bootstrap、browser proxy、原子 `0600` session 持久化/恢复与 `sys.argv[2]` 参数修复。Core/search migrations 为 `36/36` / `2/2`。

## Production truth

- 2026-09-03 16:24 +08 canonical deployment：Public `/__release` 与 active marker 均返回 `f9dbd59…`；rollback 为 `2313038…`；API/Web/Worker/Parser/official MCP/BGE healthy，exact parser acceptance、public CAS、retention 与 journal-clear 通过；core/search migrations `36/36` / `2/2` current。
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
- PR #55–#58 的 exact CI 均通过（`33720511565`、`33723494880`、`33726541805`、`33730045672`）；最终 release `f9dbd59…` 已完成 canonical deployment。
- 正式 helper 返回 `SCANSCI_COOKIE_IMPORT_OK`；持久 session 为 UID 10001、mode `0600`、单链接、非空，host/container staging、`.next` 和 cleanup marker 均 absent。本机认证临时目录已精确清理。
- 导入后只重建 `scansci-mcp`，runtime verifier 与持久 session 复核通过。DOI `10.1016/j.physleta.2023.129241` 下载为 `%PDF-` 文件，1,382,940 bytes，SHA-256 `fe441330f962ab8c178071ea8b864cbfc1baf953b27ade5d4cf5c80a2ba70aa1`；重复调用返回相同受控文件与哈希。

## Open risks and constraints

- 当前 DOI 最终由 `SemanticScholar` fallback 命中，因此证明了 ScanSci 可用、下载正确和重建后 session 文件可恢复，但不证明 publisher subscription entitlement；必须用无 OA/聚合全文回退的 DOI 补 institution/publisher provenance。
- Chromium 首次浏览器路径后容器约 402/512 PIDs（21 个 chrome 进程、320 threads），当前 healthy 且缓存重复下载成功；若后续非缓存 DOI 再现 `pthread_create`，应把浏览器生命周期/PID 预算作为独立修复，而不是重复导入 Cookie。
- 四入口尚未在生产完成统一旅程：Personal Space、Hermes、RO Hermes、RO Files/Evidence。
- Task 10 在机构下载、MCP recreate/repeat、一次性下载和 72h/600s 生命周期全部通过前保持 `in-progress`，不得把 Taskmaster 改为 10/12。
- 不恢复 noVNC/auth sidecar，不保存账号密码，不读取或打印 `.env`、Cookie、MCP 原始响应或生产文档正文。
- 生产操作只走 canonical wrapper；Windows 必须由 PowerShell 显式调用 Git for Windows Bash。不得使用本机 Docker 或 broad prune，必须保留 active/rollback、数据卷、对象存储、BGE、监控与备份。

## Next action

1. 选择无法由 Semantic Scholar/OA 回退的 subscription-only DOI，以现有持久会话验证明确的 institutional/publisher source；若启动失败先处理已记录的 Chromium PID 预算。
2. 完成 Personal Space、Hermes、RO Hermes、RO Files/Evidence 四入口、10 分钟一次性下载和 72 小时缓存/GC 的生产正向旅程。
3. 全部通过后才将 Taskmaster Task 10 置为 done，进度改为 10/12。

## Read first

1. `AGENTS.md`
2. 本 handoff
3. `docs/specs/2026-09-02-scansci-upstream-mcp-design.md`
4. `docs/plans/2026-09-02-scansci-upstream-mcp-plan.md`
5. `docs/plans/2026-08-30-hermes-external-retrieval-lifecycle-plan.md`
6. `docs/specs/2026-08-26-hermes-research-intelligence-platform-design.md` 与 `docs/progress.md`

`project_index.md` 只定向检索 CURRENT；历史计划、旧 release 段落、根目录旧 `main` 和其他 worktree 均不是当前实施入口。
