# OpenScience 进度（CURRENT window）

> 最新同步：2026-09-05 +08。历史由 Git 保存；旧计划和旧 release 不作为默认输入。

## Current version tuple

- Local docs branch / HEAD: `codex/hermes-final-handoff` / 基于应用 merge `b32d81c3474a0ba3c7cead5d4cacbc4a0e8fc4f7`，文档收尾提交待生成。
- Production application release / rollback: `b32d81c3474a0ba3c7cead5d4cacbc4a0e8fc4f7` / `0aaf52fed29e79bb19b15517ba9ef50545510f72`；core/search `36/36` / `2/2`。
- Taskmaster `hermes-research-intelligence` 为 12/12。Tasks 10–12 已通过真实 ECS 验收；下一任务尚未选择。

## 2026-09-05 — Hermes Research Intelligence 12/12 production closeout

- PR #72–#74 已合并并以 canonical transaction 发布。最终 release 注册精确 BGE-M3 model identity；Parser、BGE、ScanSci、API、Web、Worker、迁移、内部/公网健康、retention 与 rollback 门禁全部通过。
- Task 10：官方 `scansci-pdf==1.13.1` MCP 版本握手通过；产品 API 真实获取 arXiv PDF 24,671,920 bytes（SHA-256 `d57dc94c…f484a`），72h retention、600s one-use link 与 replay 404 通过，Dashboard/Drawer/RO Hermes/RO Files 四入口各 1 次。持久 ZJU WebVPN session 另下载明确 subscription-only 的 Nature PDF 1,873,303 bytes（SHA-256 `c4b9b02e…be8e`），证明机构通道不只支持 OA。
- ScienceDirect 不是 ScanSci 总体阻断：浙大官方将其校外访问导向 CARSI/身份认证，Elsevier Remote Access 需要机构邮箱关联的 Elsevier 账号，API 全文还需 API key + entitlement；当前未满足这些官方条件，因此仅保留为外部增强项，不安装 FlareSolverr 或第二 Chromium。
- Task 11：生产专用 RO `OSR-2026-000019` 的 3 个 verified core Claims 生成并重放确定性 SVG/HTML；hash 分别为 `8d5f8f23…c640`、`b20f83cc…1198`，HTML 2090 bytes、无 script/网络，公开 200，标签强制 `presentation_not_evidence`。MiniMax image/video 继续管理员限定且默认关闭。
- Task 12：在 production release 上以真实 2,215,244-byte PDF（SHA-256 `bdfaa68d…697`）完成 fresh upload → parser/source map → review/confirm → commit → 3 core Claims → license → publication review → approve → R3 publish → anonymous public 200 全链；公开对象 `OSR-2026-000021`，发布内容 SHA-256 `625f5308…2cba`。自动 core 与 canonical source map 均产生；Claims 在缺少独立 locator 时诚实保持 `missing`。此前 24.7 MB 上传已得到 source map 但 SDF proposal unavailable，停在 `needs_review` 后归档，未误报失败或发布。
- ECS content-free 总报告 `/opt/openscience-acceptance/hermes-full-release/b32d81c…/report.json` 已加入 fresh upload/publication hashes，并以 SHA-256 `1ca3b0e1…08f2` 重放通过：Parser 14/2/0/0、locator 26/26、Claim/Evidence/bbox precision 100%、BGE P95 240 ms、TTL/signed-link 100%。
- 服务器收尾：移除 2 个退出容器、aTrust 镜像、19 个不再引用的临时卷和 20 个旧 Parser acceptance 目录；仅保留 active/rollback release 与 Parser 报告。未执行 system/volume prune；保留产品数据、ScanSci session、唯一 Chromium、BGE model、监控、备份以及 14.83 GB 可复用 BuildKit 缓存。
- 最终巡检：13 个容器运行；API/Worker/Parser/ScanSci/BGE 与数据服务 healthy，Nginx/Docker/Squid/cloudflared active；公网/loopback 200，egress 204 经 `FIRSTUP_PARENT/127.0.0.1`；根盘 54G/148G（39%），88G available，内存 24 GiB available，无 failed/journal marker。

## Next action

- 不恢复旧 ScanSci/Task 10 next action。先由用户选择新的产品任务；新 session 从 CURRENT handoff、需求基线相关章节与本文件读取，生产基线固定为 `b32d81c…`。
- 需要补强 ScienceDirect 时，只走 Elsevier 官方 Remote Access/CARSI 或取得 API key + institution entitlement；不得以 Cloudflare 绕过工具替代授权。
