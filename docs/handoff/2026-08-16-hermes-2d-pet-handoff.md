# Hermes Research Intelligence CURRENT Handoff

> **CURRENT active-memory，2026-09-05 +08。** 生产仍为 `e23a94f…` / rollback `4bba4e5…`，core/search `36/36` / `2/2`。服务器端浙江大学 WebVPN Cookie 已持久化，并由官方 ScanSci WebVPN 函数下载明确标注 subscription content 的 Nature PDF，证明机构订阅通道真实可用；ScienceDirect 仍因该站 Cloudflare 与浙大官方访问方式/API entitlement 条件未满足而保持外部增强项。Taskmaster 为 9/12，Tasks 10/11 in-progress、Task 12 pending；本地候选已完成 ScanSci proxy/status/镜像去重和 Task 11 确定性 PresentationAsset/API/Worker，实现全仓 test/build/typecheck/lint 通过，尚未发布。

## Goal and state

- 产品目标：以 3–7 个 Claim 为公开 RO 中心，提供可定位 Evidence、条件/限制、身份静默路由、CPU 文档解析、混合检索和可版本化富媒体。
- Taskmaster `hermes-research-intelligence` 为 9/12；Tasks 10/11 in-progress，Task 12 pending。Task 10 以稳定 OA + institution-entitled 来源、四入口和 72h/600s 生命周期作为收口，不再把 ScienceDirect 单站成功设为平台发布硬阻塞。
- 当前任务是发布并在 ECS 验收 ScanSci 最小修复、Task 11 和 Task 12 汇总门禁。ScienceDirect 后续只走官方 CARSI/Remote Access 或 Elsevier API key + entitlement；不安装 FlareSolverr、第二套 Chromium 或其他绕过工具。

## Version tuple

- Worktree: `E:/Miscellaneous/XGS/.worktrees/readable-hermes-guidance`
- Local state: branch `codex/scansci-cas-blocked-handoff` / HEAD `c6667701558f7f8596b461f07288291ba9d3b14e`；`origin/main` / 未发布应用候选为 `7593e82e8a309ffcaaa8092b5628c53a0fec444a`。
- Production application source / immutable release: `e23a94f6622bb65e33ddbfe290970a9e6366567a`
- Rollback: `4bba4e5f634d51febe8e0aa08b306b3aadd7305e`
- Core/search migrations: `36/36` / `2/2`。生产仅运行官方 `scansci-pdf==1.13.1` 的单一 MCP；Chromium 安装层和 BGE 模型/依赖层继续复用缓存。

## Production truth

- 2026-09-04 canonical deployment：Public `/__release` 与 active marker 均为 `e23a94f…`，rollback `4bba4e5…`；API/Web/Worker/Parser/official MCP/BGE healthy，core/search `36/36` / `2/2`。PR #70 候选 `7593e82…` 未进入 active release。
- 正式 `openscience-prod-scansci-mcp-1` 为 `running/healthy`，镜像精确为 `openscience-scansci-mcp:e23a94f…`；runtime verifier 新鲜通过 image/tools/storage/Worker 四项。WebVPN Cookie 位于 `openscience-prod_scansci-data` named volume，mode `0600`、单链接；全新只读挂载该卷的临时候选读到 6 条 Cookie 并完成真实 PDF 下载，证明持久化跨容器成立。aTrust 容器保持 `exited` 且数据卷保留。
- 临时 WebVPN 直连网络、host socat、SSH 转发、aTrust 安装包与两张 display 派生镜像均已精确清除；没有安装 FlareSolverr、第二套 Chromium、BGE 或下载器，也未做 broad prune。
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
- 服务器端 CloakBrowser 已用更正后的凭据登录 `webvpn.zju.edu.cn`，认证状态为 success 并保存 6 条 Cookie；凭据与 Cookie 值均未打印、未写入仓库。上游 `webvpn_test` 固定探测 Nature，因网关 403 返回 `unreachable`，但源码明确该状态不等于 Cookie 过期。
- 对 DOI `10.1016/j.physleta.2025.130846` 的一次 legal-only 验收确认浏览器恢复 6 条 Cookie，曾进入 ScienceDirect 页面，但 PDF 端点持续 HTML/403，最终 `cloudflare_blocked`、PDF 0。aTrust/RVPN 登录也成功，但网关未下发 ScienceDirect 当前 CDN `203.22.241.8/30` 路由；临时精确路由超时后已撤销并停止 aTrust。
- 初始直连诊断绕过生产 Squid 时，Nature/Wiley/Springer/ScienceDirect 均得到浙大网关“访问被拒绝”；这不是 canonical 结果。经生产 Squid 模拟正确实现后，Nature 与 Wiley 页面均为 200，Nature PDF 返回真实 `%PDF-`，Wiley 样本 PDF 为 HTML；ScienceDirect 仍为 403/ScienceDirect 页面。由此确认教程与 ZJU WebVPN 可用，卡点收敛为上游 HTTP proxy 漏接和 ScienceDirect 单站防护。
- 已按 TDD 为 `patch-upstream.py` 增加 exact-preimage 最小修复：`_fetch_via_webvpn()` 与 `session_status()` 接通 HTTP(S)/SOCKS5 proxy，并对所有代理保持目标站 TLS 校验。下载代理与 valid/expired 状态回归均先红后绿；服务器 `--rm` 候选在正式 internal 网络中由官方函数取得 Nature `%PDF-`，同时复现 ScienceDirect 403。补丁未发布，正式容器未替换。
- 完整下载验收使用全新 `--rm` 候选和只读正式 Cookie 卷：`COOKIE_COUNT=6`、`DOWNLOAD_SUCCESS=True`、`PDF_VALID=True`、3,651,992 bytes、SHA-256 `6eae057a9faf4f671c3101e0745ed704460c6d3dec77243dfd3a9f2d2ab68970`、source `WebVPN`；PDF 仅存在于临时容器并随退出清除，不把测试文献留在生产卷。
- 机构订阅正向验收另选 Nature 明确显示“preview of subscription content / access via your institution”的 DOI `10.1038/s41586-025-09320-4`：同样由全新容器读取 6 条 Cookie，返回 1,873,303-byte `%PDF-`，SHA-256 `c4b9b02e25d8d0f0f3a4cb847d54bc50db0f88619ea7b082c046d97c4187be8e`，source `WebVPN`；证明不是仅下载 OA 文献。
- 正式 ScanSci 镜像为 2,503,852,066 bytes；其中后置 `chown -R /opt/scansci-browsers` 单独产生约 685 MB overlay copy-up。精确 Dockerfile ECS 候选为 1,818,508,851 bytes，减少 685,343,215 bytes（约 653.6 MiB / 27.37%）；browser/venv 仅一层 1.69 GB，后置用户层 4.71 KB、无递归 chown。候选以 UID 10001、只读根、512 PID 通过 MCP health，root-owned `0755` Chromium 151 成功启动，identity labels 完整。固定 ScanSci 1.13.1 现有集成只从 Sci-Hub 调用 FlareSolverr，WebVPN/CARSI 没有接入，故当前不安装第二 Chrome；不得表述为 FlareSolverr 服务本身只能访问灰色源。
- noVNC 曾因 x11vnc 继承异常大的文件描述符上限而断连，限定 `ulimit -n 1024` 后 RFB/WebSocket 已技术验证；但它不是生产下载链路，现已全部清除且不再要求用户通过 noVNC 认证。

## Open risks and constraints

- 旧样本 DOI 最终由 `SemanticScholar` fallback 命中；新的 Nature subscription-only 正向样本已补足 institution/WebVPN provenance，因此机构通道不再是 Task 10 阻塞。
- 当前阻塞不是机构订阅不存在、ZJU 账号失败或 WebVPN 全局不可用；WebVPN 已在服务器认证，Nature PDF 已由同一生产链路取得。浙大官方提示部分数据库与 WebVPN 存在兼容问题并建议异常时切换 RVPN；本次 RVPN 又缺少目标 ScienceDirect CDN 路由，因此 Elsevier 仍未交付目标 PDF。
- 四入口尚未在生产完成统一旅程：Personal Space、Hermes、RO Hermes、RO Files/Evidence；这是 Task 10 剩余硬门禁。
- Task 10 在 stable OA、Nature institution-entitled、MCP recreate/repeat、四入口和 72h/600s 生命周期汇总通过前保持 `in-progress`。
- 不再恢复 noVNC 或反复认证；不得保存账号密码，不读取或打印 `.env`、Cookie 值、MCP 原始敏感响应或生产文档正文。不得为同一任务重复安装 Chromium、BGE 或下载器。
- 生产操作只走 canonical wrapper；Windows 必须由 PowerShell 显式调用 Git for Windows Bash。不得使用本机 Docker 或 broad prune，必须保留 active/rollback、数据卷、对象存储、BGE、监控与备份。

## Next action

1. 提交并合并本地候选，等待 exact CI 后走 canonical deployment；不得重复安装 Chromium、BGE、FlareSolverr 或恢复 noVNC。
2. 在候选 release 上完成一条 OA、一条 Nature institution-entitled、四入口与 72h/600s 验收；完成 chart/interactive HTML 生成、重放同哈希、审批与公开读取。
3. 运行 Task 12 exact-release 汇总门禁、服务器健康/冗余白名单审计与文档同步，再将 Tasks 10/11/12 置为 done。ScienceDirect 作为 Elsevier Remote Access/API entitlement 外部增强项单独保留。

## Read first

1. `AGENTS.md`
2. 本 handoff
3. `docs/specs/2026-09-02-scansci-upstream-mcp-design.md`
4. `docs/plans/2026-09-02-scansci-upstream-mcp-plan.md`
5. `docs/plans/2026-08-30-hermes-external-retrieval-lifecycle-plan.md`
6. `docs/specs/2026-08-26-hermes-research-intelligence-platform-design.md` 与 `docs/progress.md`

`project_index.md` 只定向检索 CURRENT；历史计划、旧 release 段落、根目录旧 `main` 和其他 worktree 均不是当前实施入口。
