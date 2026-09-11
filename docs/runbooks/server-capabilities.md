# 服务器能力与复用清单

- CURRENT 2026-09-11：应用 release 1cdd4602 / rollback 17ebc7f7，browser provider f4832487；本轮移除旧工作台流程表单，自动保存与Hermes对话制作/审核/公开回调已部署，未安装新服务；已部署批准的工作台/公开阅读风格与Hermes真实对话路由，首屏发送框适配。无新服务/模型。104条Evidence已确认，但v6仍无合格图片/未发布，8fc方案科学问题未放行；完整状态见CURRENT handoff。下方历史任务不覆盖本段。

- 本轮更新：服务器已实际登录用户指定的第二Chat账号（Pro），账户设置匹配；noVNC已恢复显示与操作，无需再次登录。不记录个人邮箱/凭据，不实现自动账号轮换。
- Chat6Pro已接收三张用户截图并完整回复：6aa3a4a4-f7a0-83ea-a0be-fc2f7eba4581。历史许可证400修复已经部署；当前正式工作台/公开阅读版本见本页CURRENT，不恢复旧候选结论。
- 画面恢复日志 jobs/x11vnc-login-recovery.log：曾无RFB greeting、后有端口占用；目前真实画面与交互正常，未证明XDamage或浏览器根因。无新安装。

2026-09-11 实时盘点。先查本页，再查相关条目的入口；能力或服务变动后同一任务内更新。文件存在、服务运行、产品调用成功是不同状态。本页记录部署位置与复用方式；Hermes语义能力/供应商政策见 [能力台账](hermes-capability-registry.md)，实时产品任务见 CURRENT handoff。

## 历史产品回传（早于当前 release，保留复用依据）
- 最新产品任务fd719902已在原服务器会话成功生图100%并入库，旧3814f844限额不能代表新任务不可用；图片科学问题见CURRENT handoff。用户指定新Chat账号后已正常退出旧账号；随后已完成登录（见本页最新更新）。
- Google OAuth bridge补丁：仅在/opt/openscience-chatgpt-browser/scripts/host.mjs加入accounts.google.com与www.gstatic.com两个精确443域（日志与认证页脚本证明必需），Sol High复核通过；bridge重启active，浏览器/应用未重启。备份host.mjs.before-google-oauth-20260911。无Google通配符扩展、无新安装。
- production `f909c3a48a3c75e952735d8c71aeead393a404dc` / application rollback `8c2832f01136fd47a62fe6f4a4e5e07c2a994c63`；browser provider `f48324870f25b50c3a21eaad898beea87fb0aa1d` / provider rollback `48d9fa65db134575f53cf2a30724aa47a14eeea4`。
- 服务器必要构建/启动完成；连续工作台可打开，Hermes实际单字段共编、撤销、用户修订并确认v2已成功。无新增服务/安装；仍复用MiniMax/Gateway。
- 已部署默认分支提交后草稿同步、未改内容选择性保留审核和制作/发布两栏布局。v3实际保存刷新一致、5条已有材料可选。v2一次性状态恢复已审计：5 Claim/50 Evidence，原pending和改动problem保留，冻结记录未改。
- 旧v1两图8b0ca4c9与36a4已被标approved，但科学/视觉问题未消失，尚未发布；旧六图run仍failed。当前只要求一张合格核心图，不继续凑六场景。
- CDP与已授权服务器浏览器可用。截图先bringToFront；后台截图超时不代表网络或Chat不可用。Chat6Pro规划已收到，追加复核明确限流，未重试/换账号。
- 真实v3图片任务3814f844提交网页会话6aa3963b后明确rate limit；无新图，未发布。无新服务/安装。f909c3a4新增小屏两行header与三步导航，方案确认入口自动展开，服务器实际页面已观察。
- 高级paper-analysis/document-parser及BGE/ScanSci继续使用；无新OCR，视频暂停。用户已授权代为科学审核发布，不能放行已知错误。

## 使用规则
- 所有服务器相关任务先读本页相关条目。新增下载/安装前，依次查已有服务、镜像、共享缓存；优先原入口调用、复用镜像层或只读运行文件。
- 仅对缺失或与当前任务冲突的部分定向取证；安装前说明缺什么、为什么不能复用。不得仅因宿主 PATH 找不到就认定服务器未安装。
- 不复用生产登录态、Secret或可写数据卷，不改变已有服务。新增/升级/停用后原地更新本页和能力台账；不新增自动测试门禁。
- 不记录密码、key、Cookie、订阅文件内容。旧版本镜像存在不等于可删除。

## 已有位置与边界

| 能力 | 已有位置 / 入口 | 状态与复用方式 |
|---|---|---|
| 生产应用 | `/opt/openscience`；`openscience-prod-{web,api,agent-worker}-1` | production `329ad2e8…` / rollback `25917596…`；已部署能力与尚未通过的科学/体验问题见CURRENT handoff |
| 主机资源 | ECS 16 CPU、30 GiB RAM、无 NVIDIA GPU | 盘点时约22 GiB可用；CPU解析器必须有界并发。Marker/MinerU等GPU高质量模式不能按GPU吞吐数据推断本机效果 |
| 完整图形 Chrome | 宿主 `/opt/openscience-tool-cache/playwright/chromium-1234/chrome-linux64/chrome`；ScanSci镜像内 `/opt/scansci-browsers/chromium-1234/chrome-linux64/chrome` | 已静态确认完整二进制。可复用现有镜像与配套资源；不是只存在 headless shell |
| 无头 Chromium | 宿主 `/root/.cache/ms-playwright/chromium_headless_shell-1234/` 与共享缓存同名目录；ScanSci镜像 `/opt/scansci-browsers/chromium_headless_shell-1234/` | 现成截图/渲染资源；不能用“仅此目录存在”的旧记录推断没有完整浏览器 |
| 浏览器运行依赖 / Xvfb | `openscience-scansci-mcp:7f8e47d931b751cc28c1000325128c2ca86566cb`；镜像 `/usr/bin/Xvfb` | 已有图形库与Xvfb；独立浏览器可派生镜像，不启动或修改生产ScanSci服务、不挂载其登录卷 |
| 网页远程桌面、生图与科学审阅 provider | `infra/chatgpt-browser/`；`/opt/openscience-chatgpt-browser` | bundle `f4832487…`；原生Create image与6Pro科学审阅分开，新8b0ca4c9…已自动回传，合计2/6；旧7d8…明确USAGE_LIMIT。复用原浏览器/登录、独立图片及科学审阅锁；入口见[浏览器手册](chatgpt-browser.md) |
| Node / Python | 宿主 `/usr/bin/node`、`/usr/bin/python3`；现有 `node:22-bookworm`、`python:3.12-slim` 镜像 | 已有；必要时复用镜像中的Node。不要默认全局安装 |
| 视频 / 字体 / FFmpeg | `openscience-media-demo:b361f4f7781b760583b3a312829877c4d6310e8a` 等已有media镜像；源码 `apps/media-demo/Dockerfile` | 镜像包含FFmpeg、CJK字体与无头浏览器；demo镜像可复用运行依赖，不代表Hermes完整视频产品链路通过 |
| 语音模型 | `/opt/openscience-models/qwen3-tts-customvoice-0c0e305`；`openscience/tts-audition:qwen0.1.1` | 目录与镜像存在，本轮未调用；不要重复下载模型，也不推断生产已接入 |
| PDF解析 / OCR | `openscience-prod-document-parser-1`、`openscience-prod-paper-analysis-1`，已有解析镜像与模型 | 两服务运行且healthy；本次复用真实PDF高级解析及六维凝练成果，没有重跑OCR。具体引擎以任务来源记录和能力台账为准，不再以历史Tesseract-only列表否认已上线能力 |
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

- 2026-09-10历史记录：用户接受现有本机出口；直接Chat会话接口与服务器网页执行分别判断，CUA失败不能推断Chat不可用。浏览器pids上限512。2026-09-11已授权代为审核发布；具体图片仍须核对，旧36a4存在指令外露、新8b的几何表达待确认，均未公开。
