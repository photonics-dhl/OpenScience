# OpenScience 进度（CURRENT window）

> 最新同步：2026-09-05 +08。历史由 Git 保存；旧计划和旧 release 不作为默认输入。

## Current version tuple

- Docs maintenance worktree / branch / observed parent HEAD: `E:/Miscellaneous/XGS/.worktrees/readable-hermes-guidance` / `codex/product-workflow-design` / `c0a162d`；后续文档 HEAD 以 Git 实时值为准，且不改变下列 production application release。
- Production application release / rollback: `b32d81c3474a0ba3c7cead5d4cacbc4a0e8fc4f7` / `0aaf52fed29e79bb19b15517ba9ef50545510f72`；core/search `36/36` / `2/2`。
- Taskmaster `hermes-research-intelligence` 为 12/12。Tasks 10–12 已通过真实 ECS 验收；下一主题已确认为工作区—Hermes—RO 与多模态产品交付。

## 2026-09-05 — Integrated product scope confirmed

- 用户确认优先完整功能、展示和交互；复用现有能力，成熟方案优先，分段交用户验收。论文生成图片/视频；语音用于 Hermes 修改 RO，不做上传音视频理解。
- 同事分支确认 frontend/nanqing，已授权选择性整合部署；每日 10:00 巡检。先查已移植成果，避免重复合并。
- 新 design 与 delivery plan 已登记；首批入口代码与同事 18-file Web 变更已整合；RO 会话/任务范围经独立复审修正。完整五段未完成，production 未改；全仓 test/typecheck/lint、Web 479+5、production browser 87/87 通过；下一步全仓 build、main 集成和发布验收。

## 2026-09-05 — Hermes Research Intelligence 12/12 production closeout

- PR #72–#74 已合并并以 canonical transaction 发布。最终 release 注册精确 BGE-M3 model identity；Parser、BGE、ScanSci、API、Web、Worker、迁移、内部/公网健康、retention 与 rollback 门禁全部通过。
- Task 10：官方 `scansci-pdf==1.13.1` MCP 版本握手通过；产品 API 真实获取 arXiv PDF 24,671,920 bytes（SHA-256 `d57dc94c…f484a`），72h retention、600s one-use link 与 replay 404 通过，Dashboard/Drawer/RO Hermes/RO Files 四入口各 1 次。持久 ZJU WebVPN session 另下载明确 subscription-only 的 Nature PDF 1,873,303 bytes（SHA-256 `c4b9b02e…be8e`），证明机构通道不只支持 OA。
- ScienceDirect 不是 ScanSci 总体阻断：浙大官方将其校外访问导向 CARSI/身份认证，Elsevier Remote Access 需要机构邮箱关联的 Elsevier 账号，API 全文还需 API key + entitlement；当前未满足这些官方条件，因此仅保留为外部增强项，不安装 FlareSolverr 或第二 Chromium。
- Task 11：生产专用 RO `OSR-2026-000019` 的 3 个 verified core Claims 生成并重放确定性 SVG/HTML；hash 分别为 `8d5f8f23…c640`、`b20f83cc…1198`，HTML 2090 bytes、无 script/网络，公开 200，标签强制 `presentation_not_evidence`。MiniMax image/video 继续管理员限定且默认关闭。
- Task 12：在 production release 上以真实 2,215,244-byte PDF（SHA-256 `bdfaa68d…697`）完成 fresh upload → parser/source map → review/confirm → commit → 3 core Claims → license → publication review → approve → R3 publish → anonymous public 200 全链；公开对象 `OSR-2026-000021`，发布内容 SHA-256 `625f5308…2cba`。自动 core 与 canonical source map 均产生；Claims 在缺少独立 locator 时诚实保持 `missing`。此前 24.7 MB 上传已得到 source map 但 SDF proposal unavailable，停在 `needs_review` 后归档，未误报失败或发布。
- ECS content-free 总报告 `/opt/openscience-acceptance/hermes-full-release/b32d81c…/report.json` 已加入 fresh upload/publication hashes，并以 SHA-256 `1ca3b0e1…08f2` 重放通过：Parser 14/2/0/0、locator 26/26、Claim/Evidence/bbox precision 100%、BGE P95 240 ms、TTL/signed-link 100%。
- 服务器二次维护：14.83 GB BuildKit 来自近期 Node、Parser、ScanSci/Chromium 与 BGE 多目标不可变构建的中间层；先排除 active/rollback 与容器引用，再删除 4 个精确无标签镜像，并按 last-used 清理超过 24h/12h 的未共享缓存，同时保留至少 8GB/6GB 和最近 5h 的现行 Chromium 缓存。未执行 system/image/volume broad prune。
- 清理后 BuildKit `14.83 → 6.344 GB`（583 → 260 records），images `16.07 → 13.49 GB`（24 → 20，dangling 0），根盘 `54 → 44 GB`，可用空间 `88 → 98 GB`。剩余 cache 主要为 BGE `4.59 GB` 与现行 Chromium `1.69 GB` 构建闭包；Docker 报告的 3.905 GB image reclaimable 含需保留的 rollback/base/shared images，不作为冗余删除。
- 最终巡检：13 个容器运行；8/8 active/rollback 应用镜像存在，core/search `36/36` / `2/2`，API/Worker/Parser/ScanSci/BGE 与数据服务 healthy，Nginx/Docker/Squid/cloudflared active；公网/loopback 200，egress 204 经 `FIRSTUP_PARENT/127.0.0.1`；内存 24 GiB available，exited/dangling image/dangling volume/failed marker/deploy journal 均为 0；7 组备份中最新 core/search checksum 通过。

## Next action

- 不恢复旧 ScanSci/Task 10 next action。执行 integrated product Task 1 旅程审计；新 session 从 CURRENT handoff、需求基线相关章节与本文件读取，生产基线固定为 `b32d81c…`。
- 需要补强 ScienceDirect 时，只走 Elsevier 官方 Remote Access/CARSI 或取得 API key + institution entitlement；不得以 Cloudflare 绕过工具替代授权。
