# OpenScience (XGS) 项目文件索引

> 维护规则：创建/修改/移动文件后必须更新本索引。创建新文件前先查本表防重复。

## 根目录
| 路径 | 用途 | 状态 |
|---|---|---|
| `AGENTS.md` | 项目规则总入口（基线指引/分类规范/Memory/工具可迁移性/索引/安全红线） | 活文档 |
| `project_index.md` | 本索引 | 活文档 |
| `.mcp.json` | 项目级 MCP 配置 | 活文档 |
| `.env` / `.env.example` | 密钥 / 密钥模板 | 只读，禁打印 |
| `.gitignore` | git 忽略规则（含 .env） | 活文档 |
| `minimax_proxy.py` | MiniMax API 本地代理（上个 session 产物） | 活文档 |
| `package.json` / `pnpm-workspace.yaml` / `pnpm-lock.yaml` | pnpm workspace 根配置与锁文件（P1A-1） | 活文档 |
| `tsconfig.base.json` / `eslint.config.cjs` / `.npmrc` | 共享 TypeScript/ESLint/pnpm 基线（P1A-1） | 活文档 |
| `scripts/verify-workspace.mjs` | Monorepo 结构校验脚本（当前 lint 入口） | 活文档 |
| `apps/` | `web`/`api` 可启动空壳 + `agent-worker`/`science-worker`/`sandbox-controller` 空壳 | 骨架 |
| `packages/` | 11 个领域包；database/storage 已实现 P1A-2（Prisma/Redis 客户端、迁移 runner、StorageAdapter + MinIO），其余占位 | 骨架 |
| `.cursor/` | Cursor 编辑器配置 | 工具自管 |
| `.taskmaster/` | task-master 任务状态 | 工具自管 |
| `.memory/memory.jsonl` | Memory MCP 知识图谱存储（MEMORY_FILE_PATH 指定） | 工具自管，随 git 备份 |
| `src/` | 未来代码 | 空 |

## docs/
| 路径 | 用途 | 状态 |
|---|---|---|
| `docs/OpenScience_Kimi_Development_Spec.md` | **需求基线 Baseline v1.0（source of truth）** | 活文档，登记例外，禁移动/改名 |
| `docs/OpenScience_Kimi_Development_Spec.docx` | 基线的 docx 原件 | 只读原件 |
| `docs/OpenScience_Kimi_Starter_Pack.zip` | 开发启动包 | 只读原件 |
| `docs/specs/2026-07-24-doc-architecture-design.md` | 文档架构设计 spec（已批准） | 活文档 |
| `docs/specs/2026-07-24-mvp-task-breakdown-design.md` | MVP 任务拆解与工具配置设计（待用户审阅） | 活文档 |
| `docs/specs/2026-07-28-p1a-2-data-foundation-design.md` | P1A-2 数据基础设计（PostgreSQL/Redis/Storage Adapter，已批准，代码已实现，集成测试待阿里云执行） | 活文档 |
| `docs/plans/2026-07-24-doc-architecture-plan.md` | 文档架构落地实施计划 | 活文档 |
| `docs/plans/2026-07-24-mvp-task-breakdown-plan.md` | MVP 任务拆解与工具配置实施计划（已批准，执行中） | 活文档 |
| `docs/plans/2026-07-28-p1a-1-monorepo-skeleton-plan.md` | P1A-1 Monorepo 全量占位骨架实施计划（方案 A，已确认） | 活文档 |
| `docs/plans/2026-07-28-p1a-2-data-foundation-plan.md` | P1A-2 数据基础实施计划（PostgreSQL/Redis/Storage Adapter） | 活文档 |
| `docs/progress.md` | 进度日志，新条目置顶 | 活文档 |
| `docs/handoff/` | 交接文档目录（阶段边界/换 agent/换电脑，必须入库） | 活文档 |
| `docs/handoff/2026-07-28-before-p1a-2-handoff.md` | P1A-2 前交接：Phase 0 Accepted、P1A-1 done、下一任务 P1A-2 | 活文档 |
| `docs/handoff/2026-07-28-p1a-2-local-done-cloud-pending-handoff.md` | P1A-2 本地完成交接：代码+本地门禁 done，集成测试待阿里云，下一任务 P1A-3 design gate | 活文档 |
| `docs/CODEBASE_AUDIT.md` | Phase 0 Scholars Tea 只读审计报告（地图/模块分类/风险登记/迁移含义） | 活文档 |
| `docs/proposals/` | 方案/脑暴稿 | 空（旧方案0723已废弃不归档） |
| `docs/decisions/` | 决策记录 ADR | ADR-001 已接受；ADR-002 已建 |
| `docs/decisions/ADR-001-target-architecture.md` | 目标架构决策：选择性抽取 Scholars Tea，按 Baseline 重建平台底座 | 活文档（已接受） |
| `docs/decisions/ADR-002-agent-tooling-portability.md` | Agent 工具能力与可迁移性决策（项目内安装/密钥不入库/分阶段工具候选） | 活文档 |
| `docs/runbooks/deployment.md` | 部署 runbook（四节骨架，Phase 1A 填充） | 骨架 |
| `docs/runbooks/backup-restore.md` | 备份与恢复 runbook（四节骨架，Phase 1A 填充） | 骨架 |
| `docs/runbooks/incident.md` | 故障响应 runbook（四节骨架，Phase 1A 填充） | 骨架 |

## infra/
| 路径 | 用途 | 状态 |
|---|---|---|
| `infra/README.md` | infra 目录说明（脚本清单/安全约束/迁移路径） | 活文档 |
| `infra/scripts/ssh-run.sh` | 远程命令唯一入口（BatchMode 密钥认证、危险命令黑名单需 --confirm） | 可用 |
| `infra/scripts/checkup.sh` | 只读巡检（磁盘/内存/负载/Docker/服务/TLS 证书） | 可用 |
| `infra/scripts/backup.sh` | 数据库/对象存储备份 | 骨架，Phase 1A 填充 |
| `infra/scripts/deploy.sh` | 部署脚本 | 骨架，Phase 1A 填充 |
| `infra/compose/` | `docker-compose.dev.yml` 开发栈（postgres:16/redis:7/minio + minio-init，端口仅 127.0.0.1，P1A-2） | 已就位（本机未起栈） |
| `infra/nginx/` | 反向代理配置占位（P1A-1） | 骨架 |
| `infra/sandbox/` | 沙箱配置占位（P1A-1） | 骨架 |
| `infra/migrations/` | Prisma 迁移（`20260728000000_baseline_app_meta` + rollback.sql） | 已实现，云上 deploy 待执行 |
| `infra/schema.prisma` | Prisma schema（`app_meta` 基线模型，P1A-2） | 已实现 |

## .agents/skills/（项目级 Skills，Spec §20.3）
| 路径 | 用途 | 状态 |
|---|---|---|
| `.agents/skills/repo-map/SKILL.md` | 只读扫描与代码库地图（目录/依赖/服务/数据） | 活文档 |
| `.agents/skills/architecture-guard/SKILL.md` | 架构边界守卫（Monorepo 边界、AI Gateway 收口） | 活文档 |
| `.agents/skills/api-contract/SKILL.md` | API 合同规范（REST/JSON、幂等键、乐观锁、合同测试） | 活文档 |
| `.agents/skills/database-migration/SKILL.md` | 数据库迁移规范（可回滚、生产禁自动破坏性迁移） | 活文档 |
| `.agents/skills/frontend-design/SKILL.md` | 前端视觉与交互规范（三套视觉系统、响应式、WCAG、i18n） | 活文档 |
| `.agents/skills/infra-runbook/SKILL.md` | 基础设施与运维 runbook 规范（单 ECS 拓扑、备份、部署） | 活文档 |
| `.agents/skills/security-review/SKILL.md` | 安全审查清单（密钥、越权、上传、沙箱、日志脱敏） | 活文档 |
| `.agents/skills/test-gate/SKILL.md` | 测试门禁（最小相关测试→阶段验收、禁隐藏失败） | 活文档 |
| `.agents/skills/docs-sync/SKILL.md` | 文档同步纪律（progress/project_index/AGENTS/handoff 事实源对齐） | 活文档 |

## 已废弃
| 路径 | 说明 |
|---|---|
| `方案0723.docx` | 早期脑暴稿，2026-07-24 被 Baseline v1.0 取代，用户确认放弃，不归档 |
