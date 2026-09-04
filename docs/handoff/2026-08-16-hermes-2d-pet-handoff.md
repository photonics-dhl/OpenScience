# Hermes Research Intelligence CURRENT Handoff

> **CURRENT active-memory，2026-09-04 +08。** 生产为 `e23a94f…` / rollback `4bba4e5…`；未发布候选 `7593e82…` 已能精确选中 Elsevier 的“浙江大学图书馆” CARSI 条目，但账号只提交一次后 CAS 未建立认证会话，订阅 DOI 仍返回 `CAS login required`。Taskmaster 为 9/12，Task 10 仍在进行；功能验收前不再发布候选。

## Goal and state

- 产品目标：以 3–7 个 Claim 为公开 RO 中心，提供可定位 Evidence、条件/限制、身份静默路由、CPU 文档解析、混合检索和可版本化富媒体。
- Taskmaster `hermes-research-intelligence` 为 9/12；ScanSci upstream plan 的替换、部署、Cookie 持久化与普通下载验收已完成，Task 10 的 publisher-provenance 机构旅程尚未完成。
- 当前唯一任务是先取得有效浙大 CAS 会话，直接用无 OA fallback 的 DOI `10.1016/j.physleta.2025.130846` 下载 publisher PDF；成功后才发布候选并完成四入口与 72h/600s 生命周期。

## Version tuple

- Worktree: `E:/Miscellaneous/XGS/.worktrees/readable-hermes-guidance`
- Local state: detached `HEAD 7593e82e8a309ffcaaa8092b5628c53a0fec444a`（PR #70 已合并，仅是未发布候选）。
- Production application source / immutable release: `e23a94f6622bb65e33ddbfe290970a9e6366567a`
- Rollback: `4bba4e5f634d51febe8e0aa08b306b3aadd7305e`
- Core/search migrations: `36/36` / `2/2`。生产仅运行官方 `scansci-pdf==1.13.1` 的单一 MCP；Chromium 安装层和 BGE 模型/依赖层继续复用缓存。

## Production truth

- 2026-09-04 canonical deployment：Public `/__release` 与 active marker 均为 `e23a94f…`，rollback `4bba4e5…`；API/Web/Worker/Parser/official MCP/BGE healthy，core/search `36/36` / `2/2`。PR #70 候选 `7593e82…` 未进入 active release。
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
- PR #66–#70 仅对锁定的上游 1.13.1 做 exact-preimage 兼容修复：浏览器回收、导入 session 恢复、取消传播、浙大双语/图书馆标签精确匹配；公开 17-tool MCP 接口和官方运行方式未变。
- 未发布候选 `7593e82…` 目标验收证明 `selected=2` / `exact_not_found=0`；账号标准输入只提交一次，后续官方下载仍 `CAS login required=2`、`pdf_captured=0`。候选未发布，临时服务已恢复生产镜像，ScanSci 为 8 PID / 0 Chromium 子进程。

## Open risks and constraints

- 当前 DOI 最终由 `SemanticScholar` fallback 命中，因此证明了 ScanSci 可用、下载正确和重建后 session 文件可恢复，但不证明 publisher subscription entitlement；必须用无 OA/聚合全文回退的 DOI 补 institution/publisher provenance。
- 当前阻塞不是机构订阅不存在，而是没有有效的 ZJU CAS 认证会话。已有账号提交未完成认证；不自动重试，不绕过验证码/二次认证。
- 四入口尚未在生产完成统一旅程：Personal Space、Hermes、RO Hermes、RO Files/Evidence。
- Task 10 在机构下载、MCP recreate/repeat、一次性下载和 72h/600s 生命周期全部通过前保持 `in-progress`，不得把 Taskmaster 改为 10/12。
- 不恢复 noVNC/auth sidecar，不保存账号密码，不读取或打印 `.env`、Cookie、MCP 原始响应或生产文档正文。
- 生产操作只走 canonical wrapper；Windows 必须由 PowerShell 显式调用 Git for Windows Bash。不得使用本机 Docker 或 broad prune，必须保留 active/rollback、数据卷、对象存储、BGE、监控与备份。

## Next action

1. 用可成功完成 CAS 的浙大账号/二次认证建立会话；不重复安装 Chromium/BGE，不建新下载器。
2. 先在未发布候选 `7593e82…` 上直接下载 DOI `10.1016/j.physleta.2025.130846`，要求 publisher/CARSI source、`%PDF-`、bytes 与 SHA-256；成功前不跑额外全仓/视觉门禁，不发布。
3. 下载成功后才发布，完成 recreate/repeat、四入口和 72h/600s 旅程，最后将 Task 10 置为 done。

## Read first

1. `AGENTS.md`
2. 本 handoff
3. `docs/specs/2026-09-02-scansci-upstream-mcp-design.md`
4. `docs/plans/2026-09-02-scansci-upstream-mcp-plan.md`
5. `docs/plans/2026-08-30-hermes-external-retrieval-lifecycle-plan.md`
6. `docs/specs/2026-08-26-hermes-research-intelligence-platform-design.md` 与 `docs/progress.md`

`project_index.md` 只定向检索 CURRENT；历史计划、旧 release 段落、根目录旧 `main` 和其他 worktree 均不是当前实施入口。
