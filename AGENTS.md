# OpenScience (XGS) 项目

## Overview
OpenScience：AI 时代科研基础设施平台（Research Object / SDF / 预印本 + 社区评价）。工作目录 `E:/Miscellaneous/XGS`。

## Monorepo Layout & Commands（P1A-1 起）
- 根目录已是 pnpm workspace；pnpm 不全局安装，统一用 `npx pnpm@9.15.0 <cmd>`。
- `apps/`：`api` 已含 Fastify `/auth`（P1A-3）+ `/workspaces`（P1A-4）+ RBAC preHandler 授权守卫（P1A-5）+ `/admin/audit-logs`（P1A-6，platform_admin 守卫）+ `/usage` 与 `/admin/quota-policies`、`/admin/credits`、`/admin/usage`（P1A-7，配额/AI Credit 账务）+ 安全基线 `src/security/`（P1A-8：限流 RATE_LIMIT_ROUTES 挂接点 + CSRF/CORS/helmet + /csrf-token + trustProxy）实现；`web` 可启动空壳；`agent-worker`/`science-worker`/`sandbox-controller` 空壳。
- `packages/`：`domain,database,auth,sdf-schema,versioning,storage,ai-gateway,search,ui,config,observability` 11 个包；database/storage（P1A-2）+ database rate-limit.ts（P1A-8 限流）+ auth（P1A-3 + P1A-9 QQ SMTP）+ domain（P1A-4 workspace 领域模块 + P1A-5 动作×角色权限矩阵 + P1A-7 usage 模块：policies/ledger/grants/limits/snapshot/seed-data）+ config/observability（P1A-6 + P1A-8）+ **sdf-schema（P1B-1：core/manifest JSON Schema + ajv 校验，additionalProperties 宽容债务 0.2.0 收紧）** 已实现，其余占位。
- `infra/`：`compose` 已含 `docker-compose.dev.yml` 开发栈、`docker-compose.monitor.yml` 监控栈、`docker-compose.prod.yml` 生产栈（P1A-9，data_net/app_net 分段，已部署云上）；`migrations` 已含迁移 1–6（含 rollback.sql；5 = audit_log，6 = quota_policies + usage_ledger）；`nginx` 已含 `portainer.conf`（已部署云上）+ `openscience.conf`（已部署云上，/admin basic_auth）；`scripts/deploy.sh` + `backup.sh`（P1A-9 填充）；`sandbox/scripts` 仍为占位/既有运维脚本。
- 常用命令：`npx pnpm@9.15.0 install`、`npx pnpm@9.15.0 build`、`npx pnpm@9.15.0 typecheck`、`npx pnpm@9.15.0 lint`（ESLint 9 全仓检查 + `scripts/verify-workspace.mjs` 结构校验）。
- API：`npx pnpm@9.15.0 api`（Fastify 起 127.0.0.1:3001）；邀请码 CLI：`node scripts/invite.mjs create|list|revoke`（或 `npx pnpm@9.15.0 invite ...`）；配额 seed CLI：`node scripts/seed-quota.mjs --dry-run|--confirm`（P1A-7 占位值幂等 upsert，数值集中 `packages/domain/src/usage/seed-data.ts`）。
- 卫生审计：`npx pnpm@9.15.0 audit:knip`（未用文件/导出/依赖）、`audit:dep`（dependency-cruiser：循环依赖/跨包深引用/orphan 告警）、`audit:dup`（jscpd 重复代码）、`audit:deps`（syncpack 版本一致性）、`docs:lint`（markdownlint 文档门禁）。
- 开发栈：`npx pnpm@9.15.0 stack:up|stack:down|stack:ps|stack:logs`（postgres/redis/minio，仅 127.0.0.1）；测试：`npx pnpm@9.15.0 test`（单测）、`npx pnpm@9.15.0 test:integration`（起栈+集成测试）。
- 数据库迁移：`node packages/database/dist/migrate-cli.js deploy|status|reset-dev`（reset-dev 生产禁用；迁移归 `infra/migrations/`，每个迁移附 rollback.sql）。
- 构建产物忽略：`dist/`、`.next/`、`*.tsbuildinfo`。

## 云服务器（2026-07-31 上线）
- 阿里云 ECS（Alibaba Cloud Linux 4），代码在 `/opt/openscience`；Node 22 + docker compose 插件 + nginx + acme.sh（cronie 续期）。
- 远程操作只走 `infra/scripts/ssh-run.sh` / `checkup.sh`（项目专用密钥 `~/.ssh/id_ed25519_xgs`，服务器仅 publickey）。
- DNS（Cloudflare，均 DNS-only）：`OpenScience.428312321.xyz`、`portainer.428312321.xyz` → 公网 IP；面板 `https://portainer.428312321.xyz`。
- 安全组放行 22/80/443；dev 栈端口仅 127.0.0.1；云上写操作前需用户确认。
- 监控面板（2026-08-01）：统一入口导航 `https://portainer.428312321.xyz/nav/` → `/traffic/`（vnStat 流量账单）与 `/monitor/`（Netdata 实时）；basic_auth 账号 admin，凭据云上 `/etc/nginx/.htpasswd-monitor`（不入库）；runbook 见 `docs/runbooks/monitoring.md`。
- **拉镜像必须走隧道**：daemon.json 镜像源全失效 + Docker Hub 被墙；dockerd 代理 drop-in 指向 `127.0.0.1:7890`（本机 v2ray 的 SSH 反向隧道），隧道断开则 pull 失败。其他命令用 `with-proxy <cmd>`（云上 `/usr/local/bin/`，隧道失效自动回落直连，源文件 `infra/scripts/with-proxy.sh`）。隧道由本机 Windows 计划任务 `OpenScience-ProxyTunnel` 常驻（登录自启 + 断线 5s 重连，源文件 `infra/scripts/proxy-tunnel.{sh,vbs}`，日志 `%USERPROFILE%\proxy-tunnel.log`）。
- **服务器已卸载 Tailscale 且勿再装**（2026-08-01 实测）：tailscaled 劫持 `100.64.0.0/10` 路由，撞阿里云 VPC 内部 DNS（100.100.2.x）致全机 DNS 瘫痪。
- 集成测试在云上执行：`cd /opt/openscience && npx pnpm@9.15.0 test:integration`（每次跑前必须**全量** `npx pnpm@9.15.0 build`——跨包 import 解析到目标包 dist，只 build database 会因 dist 过期致 500；2026-08-01 实证）。**集成测试限流桶隔离**：Redis server 端 key 空间全局共享，须 trustProxy:true + 用例唯一 X-Forwarded-For 独立桶（P1A-8 实证）。
- API 反代 `infra/nginx/openscience.conf`（已部署云上 2026-08-03）：OpenScience.428312321.xyz → 127.0.0.1:3001，/admin 前缀 nginx basic_auth（凭据 `/etc/nginx/.htpasswd-admin` 云上生成不入库）；证书 DNS-01 签发（HTTP-01 被阿里云 403 拦，用 Cloudflare API）；部署见 docs/runbooks/deployment.md。
- 生产栈 `docker-compose.prod.yml`（P1A-9）：postgres/redis 无端口映射（仅 data_net），api 暴露 127.0.0.1:3001；env 走 `/opt/openscience/.env.prod`（云上生成不入库）。**invite/migrate/seed 需容器内跑**（生产 postgres 无端口映射，宿主机解析不到 `postgres:5432`）：`docker compose --env-file /opt/openscience/.env.prod -f /opt/openscience/infra/compose/docker-compose.prod.yml exec -T -e DATABASE_URL=$(grep '^DATABASE_URL=' /opt/openscience/.env.prod | cut -d= -f2-) -w /opt/openscience api node /opt/openscience/scripts/<script>`。
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
- 任务开始前必读 `docs/OpenScience_Kimi_Development_Spec.md`、`docs/progress.md` 和 `project_index.md`
- 重大决策写 Memory MCP（实体前缀 `XGS-`）

## Tooling Portability Rules
- 工具能力默认项目内安装/项目级配置；能 `npx`/`pnpm exec`/`uvx` 一次性运行就不全局安装
- Node 工具放 root `devDependencies` 并提交 lockfile；Python 工具优先 `uvx` 或项目 `.venv`
- 密钥只来自本机 `.env` 或服务器 Secret；仓库只提交 `.env.example`/模板，不提交真实 key
- 新增/移除工具能力必须登记 `project_index.md`；影响流程时更新 AGENTS 或 ADR（见 `docs/decisions/ADR-002-agent-tooling-portability.md`）

## Index Maintenance Rules
- 创建/修改/移动文件后更新 `project_index.md`

## Safety Red Line
- 不删除任何文件，除非用户明确批准
- 不读取/打印 `.env` 内容
