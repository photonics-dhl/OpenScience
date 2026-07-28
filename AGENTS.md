# OpenScience (XGS) 项目

## Overview
OpenScience：AI 时代科研基础设施平台（Research Object / SDF / 预印本 + 社区评价）。工作目录 `E:/Miscellaneous/XGS`。

## Monorepo Layout & Commands（P1A-1 起）
- 根目录已是 pnpm workspace；pnpm 不全局安装，统一用 `npx pnpm@9.15.0 <cmd>`。
- `apps/`：`web`/`api` 为可启动空壳；`agent-worker`/`science-worker`/`sandbox-controller` 为空壳入口。
- `packages/`：`domain,database,auth,sdf-schema,versioning,storage,ai-gateway,search,ui,config,observability` 11 个包；database/storage 已含 P1A-2 实现，其余占位。
- `infra/`：`compose` 已含 `docker-compose.dev.yml` 开发栈、`migrations` 已含基线迁移（含 rollback.sql）；`nginx/sandbox/scripts` 仍为占位/既有运维脚本。
- 常用命令：`npx pnpm@9.15.0 install`、`npx pnpm@9.15.0 build`、`npx pnpm@9.15.0 typecheck`、`npx pnpm@9.15.0 lint`（ESLint 9 全仓检查 + `scripts/verify-workspace.mjs` 结构校验）。
- 卫生审计：`npx pnpm@9.15.0 audit:knip`（未用文件/导出/依赖）、`audit:dep`（dependency-cruiser：循环依赖/跨包深引用/orphan 告警）、`audit:dup`（jscpd 重复代码）、`audit:deps`（syncpack 版本一致性）、`docs:lint`（markdownlint 文档门禁）。
- 开发栈：`npx pnpm@9.15.0 stack:up|stack:down|stack:ps|stack:logs`（postgres/redis/minio，仅 127.0.0.1）；测试：`npx pnpm@9.15.0 test`（单测）、`npx pnpm@9.15.0 test:integration`（起栈+集成测试）。
- 数据库迁移：`node packages/database/dist/migrate-cli.js deploy|status|reset-dev`（reset-dev 生产禁用；迁移归 `infra/migrations/`，每个迁移附 rollback.sql）。
- 构建产物忽略：`dist/`、`.next/`、`*.tsbuildinfo`。

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
