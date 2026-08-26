# OpenScience (XGS) 项目

## Overview
OpenScience：AI 时代科研基础设施平台（Research Object / SDF / 预印本 + 社区评价）。工作目录 `E:/Miscellaneous/XGS`。
平台基线：**MVP（Phase 0/1A/1B/1C/1D/1E）已完成（2026-08-06）**。当前产品任务、候选版本与生产 release 不写死在本段；必须从 Git 版本元数据和 `project_index.md` 标记的 CURRENT handoff 取得，禁止恢复旧 MVP next action。

## Monorepo Layout & Commands（P1A-1 起）
- 根目录已是 pnpm workspace；pnpm 不全局安装，统一用 `npx pnpm@9.15.0 <cmd>`。
- `apps/`：`api` 已含 50+ Fastify 端点——平台底座（`/auth` P1A-3、`/workspaces` P1A-4、RBAC 守卫 P1A-5、`/admin/audit-logs` P1A-6、配额/账务 P1A-7、安全基线 `src/security/` P1A-8）+ RO/SDF/版本（`/research-objects`、`/sdf`、`/artifacts`、`/commits`、`/versions`、comparison、导出 zip，P1B）+ 协作（branches/issues/licenses/forks/pull-requests/authors/reviews/notifications，P1C）+ Hermes 与发布（agent-approvals、审核、申诉、publications、公开页，P1D）+ `/sandbox-jobs`（P1E-5）；`web` 已实现三栏 SDF 编辑器（P1B-8）+ 移动端抽屉/WCAG AA（P1B-9）+ 协作单页（P1C-10）+ 公开 RO 页（P1D-9）+ 沙箱可视化组件（P1E-6/7）+ **next-intl 已接通**（无 locale 路由：`i18n/request.ts` cookie NEXT_LOCALE→Accept-Language→zh，`NextIntlClientProvider` 在 layout，语言切换 `components/LocaleSwitcher.tsx`；公开页文案走 `messages/* public` 命名空间；`public/` 含 favicon/logo/og-image SVG 占位 + `hermes/` Live2D 待迁移说明）；`agent-worker` 队列消费者 + sdf.extract + review.analyze（P1D）；`science-worker` 沙箱执行完整实现（dockerode 编排 + AST 策略检查 + 16 项安全基线测试 + **pending 轮询执行链** `src/index.ts` pollOnce/main + `/output` 产物收集落库 `artifact-collector.ts`，P1E）；`sandbox-controller` 仍为空壳（功能落在 science-worker）。
- `packages/`：13 个包。已实现：`database`/`storage`（P1A-2，含 rate-limit P1A-8、迁移 CLI）、`auth`（P1A-3 + P1A-9 QQ SMTP）、`domain`（workspace P1A-4、权限矩阵 P1A-5、usage P1A-7、research-object P1B-2、协作/审批/发布域 P1C/P1D、sandbox P1E、Research Intelligence Claim/Evidence 合同）、`config`/`observability`（P1A-6/8）、`sdf-schema`（P1B-1，additionalProperties 宽容债务 0.2.0 收紧）、`diff`（P1B-5 九类确定性 diff）、`versioning`（P1B-4 manifest/patch）、`identity`（P1B-6 public-id/uuid7）、`ai-gateway`（P1D-1 统一路由 + 调用日志）、`search`（独立 Prisma client/config/migration boundary，使用 `SEARCH_DATABASE_URL`）；仍占位：`ui`。
- `infra/`：`compose` 已含 dev/monitor/prod 三套栈；生产栈按 data_net/app_net 分段，2026-08-09 增加仅 data_net 可达的 SeaweedFS 4.41 S3 对象存储（ADR-007），2026-08-17 增加无网络/无 Secret/非 root/只读且 512 MiB 封顶的 `document-parser` sidecar（ADR-006；仅经 `parser-jobs` 卷与 agent-worker 交换 PDF/DOCX/OCR 任务）；`migrations` 已含迁移 1–28（Prisma 格式，均含 rollback.sql；26 = Editorial Collection/Selection，27 = AgentTask 单次安全重试计数，28 = Research Intelligence 核心元数据）；`infra/search/` 另有独立 Prisma schema 与迁移账本，使用 `SEARCH_DATABASE_URL`；沙箱表原始 SQL 留存于 `packages/database/migrations/`（13/14，已标 DEPRECATED，勿再手工执行）；`nginx` 已含 `portainer.conf` + `openscience.conf`（均部署云上，/admin basic_auth）；`scripts/deploy.sh` + `backup.sh`（P1A-9）；`sandbox/` 已含沙箱基础镜像 Dockerfile + 构建/测试脚本 + README（P1E-3，Python 3.11-slim + 科学计算库 + 非 root）。
- 常用命令：`npx pnpm@9.15.0 install`、`npx pnpm@9.15.0 build`、`npx pnpm@9.15.0 typecheck`、`npx pnpm@9.15.0 lint`（ESLint 9 全仓检查 + `scripts/verify-workspace.mjs` 结构校验）。
- API：`npx pnpm@9.15.0 api`（Fastify 起 127.0.0.1:3001）；邀请码 CLI：`node scripts/invite.mjs create|list|revoke`（或 `npx pnpm@9.15.0 invite ...`）；配额 seed CLI：`node scripts/seed-quota.mjs --dry-run|--confirm`（P1A-7 占位值幂等 upsert，数值集中 `packages/domain/src/usage/seed-data.ts`）。
- 卫生审计：`npx pnpm@9.15.0 audit:knip`（未用文件/导出/依赖）、`audit:dep`（dependency-cruiser：循环依赖/跨包深引用/orphan 告警）、`audit:dup`（jscpd 重复代码）、`audit:deps`（syncpack 版本一致性）、`docs:lint`（markdownlint 文档门禁）、`audit:docs-sync`（`scripts/docs/check-docs-sync.mjs`：索引路径存在性 + 文档反向登记 + AGENTS 迁移数一致性，已挂入 lint 与 CI）。
- 开发栈：`npx pnpm@9.15.0 stack:up|stack:down|stack:ps|stack:logs`（postgres/redis/minio，仅 127.0.0.1）；测试：`npx pnpm@9.15.0 test`（单测）、`npx pnpm@9.15.0 test:integration`（起栈+集成测试）。
- Optical Lab 隔离浏览器门禁：`npx pnpm@9.15.0 --filter @openscience/web shots:optical-lab`（精确路由 `/_visual/optical-lab`；截图与 metrics 输出到已忽略的 `apps/web/test/visual/out/optical-lab/`；不替换生产 Landing）。
- 数据库迁移：`node packages/database/dist/migrate-cli.js deploy|status|reset-dev`（reset-dev 生产禁用；迁移归 `infra/migrations/`，每个迁移附 rollback.sql）。
- 构建产物忽略：`dist/`、`.next/`、`*.tsbuildinfo`。

## 云服务器（2026-07-31 上线）
- 阿里云 ECS（Alibaba Cloud Linux 4），代码在 `/opt/openscience`；Node 22 + docker compose 插件 + nginx + acme.sh（cronie 续期）。
- 远程操作只走 `infra/scripts/ssh-run.sh` / `checkup.sh`（项目专用密钥 `~/.ssh/id_ed25519_xgs`，服务器仅 publickey）。Windows 必须由 PowerShell 显式调用 `C:\Program Files\Git\bin\bash.exe`；禁止裸 `bash`、系统 `bash.exe` 或 WSL。日志出现 `wsl: Failed to translate` 说明选错 shell，不得误报 SSH key 失效。
- DNS/公网入口：`OpenScience.428312321.xyz` 已切到 ECS 常驻 Cloudflare Tunnel（proxied CNAME，回源 ECS Nginx）；`portainer.428312321.xyz` 仍为 DNS-only → ECS 公网 IP。面板 `https://portainer.428312321.xyz`。
- 安全组放行 22/80/443；dev 栈端口仅 127.0.0.1；云上写操作前需用户确认。
- 监控面板（2026-08-01）：统一入口导航 `https://portainer.428312321.xyz/nav/` → `/traffic/`（vnStat 流量账单）与 `/monitor/`（Netdata 实时）；basic_auth 账号 admin，凭据云上 `/etc/nginx/.htpasswd-monitor`（不入库）；runbook 见 `docs/runbooks/monitoring.md`。
- **入站与出网分离**：公网访客经 Cloudflare Edge → ECS 常驻 `cloudflared` → loopback Nginx，cloudflared 不依赖个人电脑；dockerd 与 `with-proxy <cmd>` 则指向服务器 Squid `127.0.0.1:7891`，Squid优先 parent `127.0.0.1:7890`（本机 v2ray 的 SSH 反向隧道），失败时回落阿里云直连。SSH 隧道由 Windows 计划任务 `OpenScience-ProxyTunnel` 常驻；入站运行手册见 `docs/runbooks/cloudflare-tunnel.md`，出网探测用云上 `/usr/local/bin/check-egress-path`。
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

- 有部署目标的功能优先在服务器完成最终部署与验收；本地用于代码编写、单元/构建门禁和安全预检，不能以本地通过替代服务器运行证据。
- 服务器是生产功能的最终应用场景；交付证据至少包含服务器 build、迁移状态、目标容器状态、运行时依赖加载和公网/内网健康检查。

## Index Maintenance Rules
- 创建/修改/移动文件后更新 `project_index.md`

## Safety Red Line
- 不删除任何文件，除非用户明确批准
- 不读取/打印 `.env` 内容
