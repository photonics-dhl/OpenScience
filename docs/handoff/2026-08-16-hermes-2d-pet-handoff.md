# Hermes Research Intelligence CURRENT Handoff

> **CURRENT active-memory，2026-09-05 +08。** Hermes Research Intelligence Tasks 1–12 已全部完成。生产 application release 为 `b32d81c…`，rollback 为 `0aaf52f…`；文档收尾位于后续 docs-only HEAD，不改变生产应用版本。

## Goal and state

- 产品目标：以 3–7 个 Claim 为公开 RO 中心，提供可定位 Evidence、条件/限制、身份静默路由、CPU 文档解析、混合检索、受控外部全文与可版本化展示资产。
- Taskmaster `hermes-research-intelligence`：12/12 done。没有遗留的 Task 10–12 实施动作；下一主题已确认：工作区—Hermes—RO 完整流程、论文图像/视频及 Hermes 语音修改；成熟方案和现有能力优先，按段验收。
- ScienceDirect 仅是官方授权条件尚未满足的单站增强项，不是 ScanSci 或机构访问总体失败；不要恢复 Cloudflare 绕过、noVNC、aTrust 容器或第二 Chromium。

## Version tuple

- Worktree: `E:/Miscellaneous/XGS/.worktrees/readable-hermes-guidance`
- Docs maintenance branch / observed parent HEAD: `codex/product-workflow-design` / `c0a162d`；后续 docs-only HEAD 以 Git 实时值为准，不得替代或冒充下列 production application source。
- Production application source / immutable release: `b32d81c3474a0ba3c7cead5d4cacbc4a0e8fc4f7`
- Rollback: `0aaf52fed29e79bb19b15517ba9ef50545510f72`
- Core/search migrations: `36/36` / `2/2`。

## Production truth

- Canonical release、active marker 和公网 `/__release` 均为 `b32d81c…`；13 个容器运行，无 exited container、failed marker 或 deploy journal。API/Worker/Parser/official ScanSci/BGE 和数据服务 healthy；Nginx/Docker/Squid/cloudflared active。
- 生产只运行官方 `scansci-pdf==1.13.1` 单 MCP；Chromium 只存在于该 release 镜像并复用 BuildKit layer，BGE active/rollback tags 共享同一 image/model volume。ScanSci Cookie 保存在命名数据卷、mode `0600`；不要读取或输出其内容。
- Task 10 真实证据：OA PDF SHA `d57dc94c…f484a`，72h/600s/one-use 与四入口通过；ZJU WebVPN subscription-only Nature PDF SHA `c4b9b02e…be8e`。ScienceDirect 后续只走官方 CARSI/Remote Access 或 Elsevier API key + entitlement。
- Task 11 真实证据：`OSR-2026-000019`，3 个 verified Claims；SVG/HTML replay hash `8d5f8f23…c640` / `b20f83cc…1198`；无 script/网络且始终标记 `presentation_not_evidence`。
- Task 12 已在当前 release 以真实 2,215,244-byte PDF（SHA `bdfaa68d…697`）完成 fresh upload → parser/source map → review/confirm → commit → 3 core Claims → license → publication review → approve → R3 publish → anonymous public 200；`OSR-2026-000021` 已公开，内容 SHA `625f5308…2cba`，自动 core 与 canonical source map 均存在。Claims 无独立 locator 时保持 `missing`。此前 24.7 MB 上传已生成 source map，但 SDF proposal unavailable，停在 `needs_review` 后归档。汇总报告 SHA `1ca3b0e1…08f2`，Parser 14/2/0/0、locator 26/26、Claim/Evidence/bbox/TTL/signed-link 100%、search P95 240 ms。
- 精确二次维护已删除 4 个无容器引用且不属于 active/rollback 的 untagged images，并按 24h/12h last-used 阈值清理旧 BuildKit 记录；BuildKit `14.83 → 6.344 GB`，images `16.07 → 13.49 GB`，根盘 `54 → 44 GB`，可用空间 `88 → 98 GB`。未 broad prune；产品卷、ScanSci session、唯一 Chromium、BGE model、监控、7 组备份及 active/rollback 全部保留。
- 最终资源与健康：13 containers，8/8 active/rollback 应用镜像，core/search `36/36` / `2/2`；内存 24 GiB available；公网/loopback 200，egress 204；exited/dangling image/dangling volume/failed marker/deploy journal 均为 0；最新 core/search backup checksum 通过。

## Constraints and open risks

- 不安装 FlareSolverr、第二套 Chromium、另一份 BGE、宿主 Python/Node 全局包；不 broad prune，不删除 active/rollback 或持久数据。
- MiniMax image/video 仍为管理员限定、默认关闭的可选能力；Tavily 额度耗尽会显式降级，不阻断已验收主链。
- ScienceDirect Remote Access 的 Elsevier 账号/机构邮箱激活、180 天续期以及 API entitlement 均属于外部账号条件；获得条件前不宣称该站订阅 PDF 可用。

## Next action and read first

1. 按 `docs/plans/2026-09-05-integrated-research-product-plan.md` 完成 Task 1 真实页面断点与同事成果审计；新 design 记录已批准范围，效果未验收。不要继续旧 Task 10–12。
2. 新任务先读 `AGENTS.md`、本 handoff、`docs/progress.md`，再按 `project_index.md` 定向读取需求基线相关章节。
3. 涉及生产时重新核对 active/public/rollback；文档 HEAD 不得冒充 application release。

- 同事分支 frontend/nanqing 已确认，每日 10:00 巡检，用户授权选择性合并优质前端成果并部署。
- 本轮只更新设计/交付计划和交接；无代码、依赖安装、迁移或新部署。
