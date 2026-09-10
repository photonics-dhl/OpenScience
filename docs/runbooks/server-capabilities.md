# 服务器能力与复用清单

2026-09-11 实时盘点。先查本页，再查相关条目的入口；能力或服务变动后同一任务内更新。文件存在、服务运行、产品调用成功是不同状态。本页记录部署位置与复用方式；Hermes语义能力/供应商政策见 [能力台账](hermes-capability-registry.md)，实时产品任务见 CURRENT handoff。

## 使用规则
- 所有服务器相关任务先读本页相关条目。新增下载/安装前，依次查已有服务、镜像、共享缓存；优先原入口调用、复用镜像层或只读运行文件。
- 仅对缺失或与当前任务冲突的部分定向取证；安装前说明缺什么、为什么不能复用。不得仅因宿主 PATH 找不到就认定服务器未安装。
- 不复用生产登录态、Secret或可写数据卷，不改变已有服务。新增/升级/停用后原地更新本页和能力台账；不新增自动测试门禁。
- 不记录密码、key、Cookie、订阅文件内容。旧版本镜像存在不等于可删除。

## 已有位置与边界

| 能力 | 已有位置 / 入口 | 状态与复用方式 |
|---|---|---|
| 生产应用 | `/opt/openscience`；`openscience-prod-{web,api,agent-worker}-1` | 2026-09-11 release `36e6a8c48ad4a67664ef3cd3b0fbeb36e6480a93`，rollback `3485e329325a97f64368ef34cfda51f42c1625c6`；部署所需构建、迁移与全部容器startup health完成。不要混用本地候选与线上版本 |
| 主机资源 | ECS 16 CPU、30 GiB RAM、无 NVIDIA GPU | 盘点时约22 GiB可用；CPU解析器必须有界并发。Marker/MinerU等GPU高质量模式不能按GPU吞吐数据推断本机效果 |
| 完整图形 Chrome | 宿主 `/opt/openscience-tool-cache/playwright/chromium-1234/chrome-linux64/chrome`；ScanSci镜像内 `/opt/scansci-browsers/chromium-1234/chrome-linux64/chrome` | 已静态确认完整二进制。可复用现有镜像与配套资源；不是只存在 headless shell |
| 无头 Chromium | 宿主 `/root/.cache/ms-playwright/chromium_headless_shell-1234/` 与共享缓存同名目录；ScanSci镜像 `/opt/scansci-browsers/chromium_headless_shell-1234/` | 现成截图/渲染资源；不能用“仅此目录存在”的旧记录推断没有完整浏览器 |
| 浏览器运行依赖 / Xvfb | `openscience-scansci-mcp:7f8e47d931b751cc28c1000325128c2ca86566cb`；镜像 `/usr/bin/Xvfb` | 已有图形库与Xvfb；独立浏览器可派生镜像，不启动或修改生产ScanSci服务、不挂载其登录卷 |
| 网页远程桌面、生图与科学审阅 provider | `infra/chatgpt-browser/`；服务器 `/opt/openscience-chatgpt-browser` | 浏览器、桥接、broker timers与`chatgpt-web` provider运行，bundle `4b4e365c…`。真实生图task `eb48809b…`已回传PNG；Deep-sub-cycle以science-v4完成一次6 Pro全文复核并形成六字段提案。图片窗口660秒，科学审阅1800秒；科学broker持锁期间15秒heartbeat，request按候选/证据/协议版本幂等；入口见[浏览器手册](chatgpt-browser.md) |
| Node / Python | 宿主 `/usr/bin/node`、`/usr/bin/python3`；现有 `node:22-bookworm`、`python:3.12-slim` 镜像 | 已有；必要时复用镜像中的Node。不要默认全局安装 |
| 视频 / 字体 / FFmpeg | `openscience-media-demo:b361f4f7781b760583b3a312829877c4d6310e8a` 等已有media镜像；源码 `apps/media-demo/Dockerfile` | 镜像包含FFmpeg、CJK字体与无头浏览器；demo镜像可复用运行依赖，不代表Hermes完整视频产品链路通过 |
| 语音模型 | `/opt/openscience-models/qwen3-tts-customvoice-0c0e305`；`openscience/tts-audition:qwen0.1.1` | 目录与镜像存在，本轮未调用；不要重复下载模型，也不推断生产已接入 |
| PDF解析 / OCR | `openscience-prod-document-parser-1`；同release parser镜像 | 运行且healthy；当前生产依赖仅`pdf-parse 2.4.5`、Tesseract eng+chi_sim、mammoth、yauzl。Docling/GROBID/PaddleOCR仍未进入生产，数学公式与复杂版面不能声称已覆盖 |
| BGE-M3 | `openscience-prod-embedding-worker-1`；模型卷 `bge-m3-5617a9f61b028005a4858fdac845db406aefb181-08cc5a668e89` | 容器运行；既有模型卷复用。BGE生成向量，实际存储由现有检索/数据库链路负责 |
| ScanSci | `openscience-prod-scansci-mcp-1`；项目 `apps/scansci-mcp` | 容器运行；复用MCP取文献，不另装一份；认证状态不读取或打印 |
| Hermes / MiniMax | 生产agent-worker及AI Gateway；另有 `/opt/hermes-agent` 源码目录 | 源码目录存在不等于独立服务已启用；经现有Worker/Gateway调用，限额以实际供应商响应为准 |
| Codex订阅生图 | `/opt/openscience-codex`；独立runner bundle `1ad54c72` | 已有runner/预设skill；最新真实任务报usage limit，无新图。不得重新安装或重新登录当作额度恢复 |
| DB / 缓存 / 对象存储 / 文件扫描 | `openscience-prod-{postgres,redis,object-storage,malware-scanner}-1` | 本次列表显示运行；复用内部服务，不暴露公网，不读取环境变量凭据 |
| 非生产容器 | `openscience-dev-{postgres,redis}-1`；`xgs-hermes-migration-a72b5e1c` | 仍在运行但不属于生产论文链路；清理前必须确认无开发会话、迁移、回滚或数据引用，不因名称直接删除 |
| 出网与访问 | 宿主Squid `127.0.0.1:7891`；项目SSH wrapper；Cloudflare Tunnel | 既有出网仍依赖本机上游（CURRENT研究记录）；远程浏览器界面仅SSH localhost6081。服务器驻留不等于出口已独立 |

## 本次取证与教训
- 读取Docker容器/镜像名称、定向文件路径、已安装包名及项目Dockerfile；没有运行测试、模型任务或读取Secret。
- 漏查 `/opt/openscience-tool-cache/playwright` 与ScanSci镜像，导致重复下载Chromium。已中止重复构建，改用已有完整浏览器与依赖。不要重复该路径判断错误。
- 本清单不是自动扫描脚本；只在相关能力发生变化时更新，避免每轮全盘扫描与重复消耗。

- 2026-09-10：用户接受现有本机出口；直接Chat会话接口与服务器网页执行分别判断，CUA失败不能推断Chat不可用。浏览器pids上限512；当前web图已入产品草稿画廊，科学证据核对完成，等待用户批准后才可发布。
