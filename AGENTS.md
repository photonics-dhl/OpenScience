# OpenScience (XGS) 项目

## Overview
OpenScience：AI 时代科研基础设施平台（Research Object / SDF / 预印本 + 社区评价）。工作目录 `E:/Miscellaneous/XGS`。
平台基线：**MVP（Phase 0/1A/1B/1C/1D/1E）已完成（2026-08-06）**。当前产品任务、候选版本与生产 release 不写死在本段；必须从 Git 版本元数据和 `project_index.md` 标记的 CURRENT handoff 取得，禁止恢复旧 MVP next action。

## 产品落地优先：强约束（用户明确要求，2026-09-08）
- 2026-09-09：先完成2–3篇真实论文的上传、Hermes全文凝练与用户确认、图片生成审核、发布和公开RO展示；用户确认流程及产物质量前，不运行批量冷启动或扩充演示数量。清理已识别旧演示/测试数据优先可恢复归档，保护真实论文与已公开版本/标识。
- Chat能力按接口分别判断：用户已确认直接Chat会话接口可读取普通Chat；浏览器控制桥的fetch失败不等于Chat不可用。优先使用可用的直接会话接口处理规划/讨论，写入结果另行确认；服务器网页生图由服务器执行器负责，不依赖本机浏览器控制桥。
- Hermes必须先综合全文理解研究逻辑，再按六个展示维度凝练并核对来源。方法可隐含于推导、结果、图注或附录；不得按同名章节/统一模板判断缺失。来源格式或预算失败是系统待核对状态，不是论文未报告；未核对草稿与正式内容分开。
- 本次任务最新指令：不允许再测试；不得主动触发测试、预检或演练，包括 CI 测试。直接实现与部署，保留必要构建、服务启动和回滚机制。

- 第一优先级是把用户需要的服务器产品功能实现并部署，不得用预检、测试、评审工具建设或重复分析替代交付。
- 默认不做预检、不新增或运行测试、不执行全套回归；仅在非常必要时执行最小范围检查。必要性必须对应当前改动的具体重大风险（例如数据损坏、权限越界、不可逆迁移），或正在阻塞功能的已知故障；不能只因 Skill、旧计划或固定清单要求而运行。
- 执行例外检查前简短说明具体风险、检查如何消除该风险及最小范围；已有授权内直接执行，不重复索要批准。部署必需的编译、构建与启动属于交付步骤，按需执行，不扩展为测试项目。
- 本机只编辑、静态阅读和传输文件；任何必要的运行检查均在服务器进行。复用已有有效证据，不反复重跑模型提取或整条流程。
- 优先串联服务器已有 PDF 解析/OCR、BGE 检索、MiniMax 理解生成与图片/视频能力，由 Hermes 在服务器续跑。不得用 Codex 手工生成内容冒充服务器自动能力，也不得为了通过流程放行已知错误。
- 如实区分已实现、已部署、已观察到可用与尚未确认；不因省略测试声称质量已获验证。此规则优先于本项目 Skills、旧计划及文档中的默认测试/预检要求。

## Monorepo Layout & Commands（P1A-1 起）
- 根目录已是 pnpm workspace；pnpm 不全局安装，统一用 `npx pnpm@9.15.0 <cmd>`。
- `apps/`：`api` 提供账号、工作区、RO/SDF/版本、协作、Hermes、发布和沙箱端点；`web` 提供 SDF 编辑、公开 RO、协作、可视化和国际化界面；`agent-worker` 处理提取/审核队列；`science-worker` 负责隔离执行和产物收集。以源码和 `project_index.md` 为完整能力清单。
- `packages/`：共享数据库、存储、认证、领域模型、配置、可观测性、SDF schema、diff、版本、身份、AI 网关与搜索能力；搜索使用独立 `SEARCH_DATABASE_URL`。
- `infra/`：包含 dev/monitor/prod compose、Nginx、部署/备份、沙箱和 Prisma 迁移 1–40（均有 rollback.sql）；生产数据网与应用网隔离，文档解析 sidecar 无网络、非 root、只读并限制 512 MiB。迁移细节以账本和 ADR 为准。
- 常用命令：`npx pnpm@9.15.0 install`、`npx pnpm@9.15.0 build`、`npx pnpm@9.15.0 typecheck`、`npx pnpm@9.15.0 lint`（ESLint 9 全仓检查 + `scripts/verify-workspace.mjs` 结构校验）。
- API：`npx pnpm@9.15.0 api`（Fastify 起 127.0.0.1:3001）；邀请码 CLI：`node scripts/invite.mjs create|list|revoke`（或 `npx pnpm@9.15.0 invite ...`）；配额 seed CLI：`node scripts/seed-quota.mjs --dry-run|--confirm`（P1A-7 占位值幂等 upsert，数值集中 `packages/domain/src/usage/seed-data.ts`）。
- 卫生审计：`npx pnpm@9.15.0 audit:knip`（未用文件/导出/依赖）、`audit:dep`（dependency-cruiser：循环依赖/跨包深引用/orphan 告警）、`audit:dup`（jscpd 重复代码）、`audit:deps`（syncpack 版本一致性）、`docs:lint`（markdownlint 文档门禁）、`audit:docs-sync`（`scripts/docs/check-docs-sync.mjs`：索引路径存在性 + 文档反向登记 + AGENTS 迁移数一致性，已挂入 lint 与 CI）。
- 开发栈：`npx pnpm@9.15.0 stack:up|stack:down|stack:ps|stack:logs`（postgres/redis/minio，仅 127.0.0.1）；测试：`npx pnpm@9.15.0 test`（单测）、`npx pnpm@9.15.0 test:integration`（起栈+集成测试）。
- Optical Lab 隔离浏览器门禁：`npx pnpm@9.15.0 --filter @openscience/web shots:optical-lab`（精确路由 `/_visual/optical-lab`；截图与 metrics 输出到已忽略的 `apps/web/test/visual/out/optical-lab/`；不替换生产 Landing）。
- 数据库迁移：`node packages/database/dist/migrate-cli.js deploy|status|reset-dev`（reset-dev 生产禁用；迁移归 `infra/migrations/`，每个迁移附 rollback.sql）。
- 构建产物忽略：`dist/`、`.next/`、`*.tsbuildinfo`。

## 云服务器（2026-07-31 上线）
- 阿里云 ECS（Alibaba Cloud Linux 4），代码在 `/opt/openscience`；Node 22 + docker compose 插件 + nginx + acme.sh（cronie 续期）。
- 所有服务器相关任务先读 `docs/runbooks/server-capabilities.md` 相关条目；安装/下载前查现有服务、镜像和共享缓存，只补缺失部分并说明无法复用的原因。能力变化后同步清单与Hermes台账；此规则不触发测试或全盘预检。
- 远程操作只走 `infra/scripts/ssh-run.sh` / `checkup.sh`（项目专用密钥 `~/.ssh/id_ed25519_xgs`，服务器仅 publickey）。Windows 必须由 PowerShell 显式调用 `C:\Program Files\Git\bin\bash.exe`；禁止裸 `bash`、系统 `bash.exe` 或 WSL。日志出现 `wsl: Failed to translate` 说明选错 shell，不得误报 SSH key 失效。
- DNS/公网入口：`OpenScience.428312321.xyz` 已切到 ECS 常驻 Cloudflare Tunnel（proxied CNAME，回源 ECS Nginx）；`portainer.428312321.xyz` 仍为 DNS-only → ECS 公网 IP。面板 `https://portainer.428312321.xyz`。
- 安全组放行 22/80/443；dev 栈端口仅 127.0.0.1；云上写操作前需用户确认。
- 监控面板（2026-08-01）：统一入口导航 `https://portainer.428312321.xyz/nav/` → `/traffic/`（vnStat 流量账单）与 `/monitor/`（Netdata 实时）；basic_auth 账号 admin，凭据云上 `/etc/nginx/.htpasswd-monitor`（不入库）；runbook 见 `docs/runbooks/monitoring.md`。
- **入站与出网分离**：公网访客经 Cloudflare Edge → ECS 常驻 `cloudflared` → loopback Nginx，cloudflared 不依赖个人电脑；dockerd 与 `with-proxy <cmd>` 指向服务器 Squid `127.0.0.1:7891`。ScanSci 仅可由 `internal: true` 的固定 retrieval 子网 `172.24.0.0/24` 经其固定宿主 gateway `172.24.0.1:7891` 使用同一 Squid，且只允许 CONNECT 443 与非私网目标；不得开放 wildcard listener。ScanSci 仅让经验证的最小域名清单使用 parent `127.0.0.1:7890`（首批仅 `.arxiv.org`），其他目标由 Squid 同一次解析后 DIRECT，避免 parent 二次解析；宿主机出网仍优先 parent、失败时回落阿里云直连。SSH 隧道由 Windows 计划任务 `OpenScience-ProxyTunnel` 常驻；入站运行手册见 `docs/runbooks/cloudflare-tunnel.md`，出网探测用云上 `/usr/local/bin/check-egress-path`。
- **服务器已卸载 Tailscale 且勿再装**（2026-08-01 实测）：tailscaled 劫持 `100.64.0.0/10` 路由，撞阿里云 VPC 内部 DNS（100.100.2.x）致全机 DNS 瘫痪。
- 集成测试在云上执行：`cd /opt/openscience && npx pnpm@9.15.0 test:integration`（每次跑前必须**全量** `npx pnpm@9.15.0 build`——跨包 import 解析到目标包 dist，只 build database 会因 dist 过期致 500；2026-08-01 实证）。**集成测试限流桶隔离**：Redis server 端 key 空间全局共享，须 trustProxy:true + 用例唯一 X-Forwarded-For 独立桶（P1A-8 实证）。
- API 反代 `infra/nginx/openscience.conf`（已部署云上 2026-08-03）：OpenScience.428312321.xyz → 127.0.0.1:3001，/admin 前缀 nginx basic_auth（凭据 `/etc/nginx/.htpasswd-admin` 云上生成不入库）；证书 DNS-01 签发（HTTP-01 被阿里云 403 拦，用 Cloudflare API）；部署见 docs/runbooks/deployment.md。
- 生产栈 `docker-compose.prod.yml`（P1A-9 + ADR-007）：postgres/redis/object-storage 无端口映射（仅 data_net），SeaweedFS S3 数据落 `seaweed-data` 命名卷，api 暴露 127.0.0.1:3001；env 走 `/opt/openscience/.env.prod`（云上生成不入库）。**invite/migrate/seed 需在 ECS 容器内通过 canonical deploy/runbook 执行**，继承受控 env，禁止把 `DATABASE_URL` 或 `SEARCH_DATABASE_URL` 展开到 CLI 参数或日志；core 与 search 分别迁移和核验。
- CI：`.github/workflows/ci.yml`（GitHub Actions，build/typecheck/lint/test，push+PR main）。每日备份 cron `0 3 * * * /usr/local/bin/backup.sh --confirm --db`（pg_dump 保留 7 轮）。

## 第一优先级：需求基线
- **`docs/OpenScience_Kimi_Development_Spec.md` 是当前单一需求基线（Baseline v1.0, source of truth）**。任何实现工作必须先读它，不得根据零散聊天、旧方案（如已废弃的方案0723）或文件名猜测需求。
- 该文件路径是分类规范的**登记例外**（见下），不得移动或改名，其他 session 在引用它。

## 文档分类规范
| 类型 | 目录 | 命名 |
|---|---|---|
| 方案/脑暴稿 | `docs/proposals/` | `YYYY-MM-DD-<主题>.md` |
| 产品设计 spec | `docs/specs/` | `YYYY-MM-DD-<主题>-design.md` |
| 实施计划 | `docs/plans/` | `YYYY-MM-DD-<主题>-plan.md` |
| 决策记录 | `docs/decisions/` | `ADR-NNN-<主题>.md`（NNN 递增） |
| 进度日志 | `docs/progress.md` | 单文件，新条目置顶 |
| 交接 handoff | `docs/handoff/` | `YYYY-MM-DD-<主题>-handoff.md`（阶段边界/换 agent/换电脑时写） |
| 安全文档 | `docs/security/` | `<主题>.md`（威胁模型/检查清单/声明，P1E-8 起） |

登记例外：`docs/OpenScience_Kimi_Development_Spec.md`（需求基线，原地保留）。

## 文档操作规则
- **创建前**：先查 `project_index.md`，确认无同功能文件
- **创建后**：按类型入目录、按规范命名、登记 `project_index.md`
- **查找**：先索引 → Glob 按文件名 → Grep 按内容
- **防重复**：同一主题一份活文档，迭代原地更新；冻结存档才带版本后缀；被取代文档头部标 `DEPRECATED → 见 <新路径>` 并在索引注明，不删除
- **外部原件**（docx/zip 等）原地保留只读，工作副本用 Markdown
- **多 session 协作**：其他工具（如 Cursor）在本目录产出的文件，先登记索引再使用；移动/改名需用户批准
- **服务器文档**：规范预留，服务器上线后补入（见 docs/specs/2026-07-24-doc-architecture-design.md 第 3 节）
- **文档同步纪律**：见 `.agents/skills/docs-sync/SKILL.md`；创建/修改文件、任务状态变化、换 agent/session 前必须按它同步索引/进度/AGENTS/handoff

## Memory Rules
- 任务开始先运行 worktree/branch/status 检查；用 `rg -n "CURRENT|<topic>" project_index.md docs/handoff docs/specs docs/plans` 定位唯一 CURRENT handoff，先读 handoff，再读需求基线相关章节和短版 `docs/progress.md`。`project_index.md` 只定向检索，禁止默认加载全文或 archive。
- 判断状态时记录 `branch / HEAD / release / rollback`；本地候选、远端分支、本地 `main` 与 ECS 版本不得混写。
- 涉及已部署表面或以生产为基线的新任务，启动时先 `git fetch origin`，再走 `infra/scripts/checkup.sh` 与只读 `.release-id`/`/__release`/容器健康核验；以实测结果刷新 CURRENT handoff，文档日期或旧 release 段落不得覆盖服务器事实。
- 重大决策写 Memory MCP（实体前缀 `XGS-`）

## Tooling Portability Rules
- 工具能力默认项目内安装/项目级配置；能 `npx`/`pnpm exec`/`uvx` 一次性运行就不全局安装
- Node 工具放 root `devDependencies` 并提交 lockfile；Python 工具优先 `uvx` 或项目 `.venv`
- 密钥只来自本机 `.env` 或服务器 Secret；仓库只提交 `.env.example`/模板，不提交真实 key
- 新增/移除工具能力必须登记 `project_index.md`；影响流程时更新 AGENTS 或 ADR（见 `docs/decisions/ADR-002-agent-tooling-portability.md`）

## Deployment Acceptance Rule

- 有部署目标的功能优先在服务器完成最终部署与验收；本地仅用于编辑与静态取证，不执行本地测试、构建或预检。
- 服务器是生产功能的最终应用场景；按部署实际需要执行构建、适用迁移及启动；优先观察实际产品结果，不默认逐项执行独立验收清单。

## Index Maintenance Rules
- 创建/修改/移动文件后更新 `project_index.md`

## Safety Red Line
- 不删除任何文件，除非用户明确批准
- 不读取/打印 `.env` 内容
- 用户明确要求（2026-09-08）：本机仅编辑与静态取证，不在本机运行测试、构建、Docker或迁移验证；非常必要的运行检查仅在服务器执行，遵循上方产品落地优先规则；不得恢复默认“预检通过后才部署”的流程。
