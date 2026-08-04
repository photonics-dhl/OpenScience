# OpenScience (XGS) 项目文件索引

> 维护规则：创建/修改/移动文件后必须更新本索引。创建新文件前先查本表防重复。

## 根目录
| 路径 | 用途 | 状态 |
|---|---|---|
| `AGENTS.md` | 项目规则总入口（基线指引/分类规范/Memory/工具可迁移性/索引/安全红线） | 活文档 |
| `project_index.md` | 本索引 | 活文档 |
| `.mcp.json` | 项目级 MCP 配置（kimi-code/Cursor；含明文 MiniMax key） | 活文档，**本机持有，已移出 git 跟踪**（2026-07-31） |
| `.vscode/mcp.json` | VS Code MCP 配置（task-master-ai 直连 node_modules 本地入口） | 活文档，**本机持有，不入库**（含 key） |
| `.env` / `.env.example` | 密钥 / 密钥模板 | 只读，禁打印 |
| `.gitignore` | git 忽略规则（含 .env） | 活文档 |
| `minimax_proxy.py` | MiniMax API 本地代理（上个 session 产物） | 活文档 |
| `package.json` / `pnpm-workspace.yaml` / `pnpm-lock.yaml` | pnpm workspace 根配置与锁文件（P1A-1）；`task-master-ai` 已入 root devDependencies（2026-07-31，VS Code MCP 直连用） | 活文档 |
| `tsconfig.base.json` / `eslint.config.cjs` / `.npmrc` | 共享 TypeScript/ESLint/pnpm 基线（P1A-1）；eslint.config.cjs 已升级为 ESLint 9 flat config（2026-07-28） | 活文档 |
| `knip.json` / `.dependency-cruiser.cjs` / `.markdownlint-cli2.jsonc` | 卫生工具配置：knip（未用代码）、dependency-cruiser（依赖边界）、markdownlint（文档门禁）（2026-07-28 落地） | 活文档 |
| `scripts/verify-workspace.mjs` | Monorepo 结构校验脚本（lint 的第二段，`verify:workspace` 入口） | 活文档 |
| `scripts/invite.mjs` | 邀请码管理 CLI（create/list/revoke，P1A-3） | 活文档 |
| `scripts/seed-quota.mjs` | 配额占位值幂等 upsert CLI（--dry-run/--confirm，P1A-7，数值集中 `packages/domain/src/usage/seed-data.ts`） | 活文档 |
| `scripts/cloud-sync.mjs` | 云上同步（tar-over-ssh，排除 .env/.git/node_modules/dist，P1A-7 固化） | 活文档 |
| `apps/` | `web` 已实现三栏 SDF 编辑器（P1B-8）+ 移动端抽屉/分步 + WCAG AA（P1B-9）（lib/api + editor-state + suggestions + components/editor 七组件 + app/research-objects/[id]/edit + i18n 中英）；`api` 已含 Fastify `/auth`（P1A-3）+ `/workspaces`（P1A-4）+ RBAC preHandler 授权守卫（P1A-5）+ `/admin/audit-logs`（P1A-6）+ `/usage` 与 `/admin/quota-policies`、`/admin/credits`、`/admin/usage`（P1A-7）+ 安全基线 `src/security/`（P1A-8）+ **`/research-objects` + `/sdf`（P1B-2）** + **`/artifacts`（P1B-3）** + **`/commits` + `/versions` + comparison（P1B-4/5）** + **`/research/:publicId` 公开 URL（P1B-6）** + **`/visibility` + `/visibility-grants`（P1B-7）** + **`/versions/:id/export`（P1B-10 zip）** + **`/research-objects/:id/branches`（P1C-2，4 端点）** + **`/research-objects/:id/issues`（P1C-3，5 端点）** + **`/research-objects/:id/licenses`（P1C-4，4 端点）+ `/licenses/catalog`** + **`/research-objects/:id/forks`（P1C-5，2 端点）** + **`/research-objects/:id/pull-requests`（P1C-6，3 端点）** + **`/research-objects/:id/authors` + `/contributions`（P1C-7，5 端点）**；`agent-worker`/`science-worker`/`sandbox-controller` 空壳 | 骨架 |
| `packages/` | 11 个领域包 + **diff 包（P1B-5）+ identity 包（P1B-6）**；database/storage 已实现 P1A-2；storage 已加 P1B-3 `blob.ts`；versioning 已实现 P1B-4；identity 已实现 P1B-6；database 已加 P1A-8 `rate-limit.ts`；auth 已实现 P1A-3 + P1A-9；domain 已实现 P1A-4/5/7 + P1B-2/3/4/5/6/7/10（research-object/artifact/commit/diff/identity/visibility/export）+ **P1C-1（collab 枚举）+ P1C-2（branch 模块）+ P1C-3（issue 模块）+ P1C-4（license 模块）+ P1C-5（fork 模块）+ P1C-6（pr 模块）+ P1C-7（authorship 模块）**；config 已加 P1B-3 storage + P1B-6 publicIdPrefix；sdf-schema 已实现 P1B-1；其余占位；云上集成 79/79 全绿（2026-08-04） | 已实现 |
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
| `docs/specs/2026-07-28-p1a-3-invitation-auth-design.md` | P1A-3 邀请码注册与邮箱验证 Auth 设计（已批准，本地已实现，集成测试待阿里云） | 活文档 |
| `docs/specs/2026-07-29-p1a-4-workspace-design.md` | P1A-4 Workspace 模型与成员管理设计（已批准，代码已实现，云上集成测试已全绿 2026-07-31） | 活文档 |
| `docs/specs/2026-08-01-p1a-5-rbac-design.md` | P1A-5 RBAC 权限矩阵设计（已批准，代码已实现，云上集成测试 11/11 全绿 2026-08-01） | 活文档 |
| `docs/specs/2026-08-01-p1a-6-audit-observability-design.md` | P1A-6 统一错误/日志/配置/审计底座设计（已批准，代码已实现，云上集成 15/15 全绿 2026-08-01） | 活文档 |
| `docs/specs/2026-08-03-p1a-7-quota-credits-design.md` | P1A-7 配额策略与 AI Credit 账务骨架设计（design gate 已确认，代码已实现，云上集成 17/17 全绿 2026-08-03） | 活文档 |
| `docs/specs/2026-08-03-p1a-8-security-baseline-design.md` | P1A-8 安全基线设计（design gate 逐节已确认，代码已实现，云上集成 21/21 全绿 2026-08-03） | 活文档 |
| `docs/specs/2026-08-03-p1a-9-cicd-deploy-backup-design.md` | P1A-9 CI/CD 与 ECS 部署及备份设计（design gate 已确认：GitHub Actions/仅 PG dump/临时库演练 + QQ SMTP 偏离，生产已上线 2026-08-03） | 活文档 |
| `docs/specs/2026-08-03-p1b-1-sdf-schema-design.md` | P1B-1 SDF 六字段 core + manifest JSON Schema 设计（design gate 已确认：手写 JSON Schema + ajv，additionalProperties 宽容债务，代码已实现 2026-08-03） | 活文档 |
| `docs/specs/2026-08-03-p1b-2-ro-sdf-model-design.md` | P1B-2 RO/SDF 数据模型设计（design gate 已确认：三实体 + 迁移 7 + API 骨架，代码已实现 2026-08-03） | 活文档 |
| `docs/specs/2026-08-04-p1b-3-blob-artifact-upload-design.md` | P1B-3 Blob 内容寻址存储与上传管线设计（design gate 已确认：五决策，代码已实现 2026-08-04） | 活文档 |
| `docs/plans/2026-07-24-doc-architecture-plan.md` | 文档架构落地实施计划 | 活文档 |
| `docs/plans/2026-07-24-mvp-task-breakdown-plan.md` | MVP 任务拆解与工具配置实施计划（已批准，执行中） | 活文档 |
| `docs/plans/2026-07-28-p1a-1-monorepo-skeleton-plan.md` | P1A-1 Monorepo 全量占位骨架实施计划（方案 A，已确认） | 活文档 |
| `docs/plans/2026-07-28-p1a-2-data-foundation-plan.md` | P1A-2 数据基础实施计划（PostgreSQL/Redis/Storage Adapter） | 活文档 |
| `docs/plans/2026-07-28-p1a-3-invitation-auth-plan.md` | P1A-3 邀请码注册与邮箱验证 Auth 实施计划（本地执行完毕，云上集成测试待执行） | 活文档 |
| `docs/plans/2026-07-29-p1a-4-workspace-plan.md` | P1A-4 Workspace 模型与成员管理实施计划（本地执行完毕，云上集成测试已全绿 2026-07-31） | 活文档 |
| `docs/plans/2026-08-01-p1a-5-rbac-plan.md` | P1A-5 RBAC 权限矩阵实施计划（已执行完毕，云上 11/11 全绿，task-master 2.5 done 2026-08-01） | 活文档 |
| `docs/plans/2026-08-01-p1a-6-audit-observability-plan.md` | P1A-6 统一错误/日志/配置/审计底座实施计划（已执行完毕，云上 15/15 全绿，task-master 2.6 done 2026-08-01） | 活文档 |
| `docs/plans/2026-08-03-p1a-7-quota-credits-plan.md` | P1A-7 配额策略与 AI Credit 账务骨架实施计划（已执行完毕，云上 17/17 全绿，task-master 2.7 done 2026-08-03） | 活文档 |
| `docs/plans/2026-08-03-p1a-8-security-baseline-plan.md` | P1A-8 安全基线实施计划（已执行完毕，云上 21/21 全绿，task-master 2.8 done 2026-08-03） | 活文档 |
| `docs/plans/2026-08-03-p1a-9-cicd-deploy-backup-plan.md` | P1A-9 CI/CD 与 ECS 部署实施计划（已执行完毕，生产已上线，task-master 2.9 done 2026-08-03） | 活文档 |
| `docs/plans/2026-08-03-p1b-1-sdf-schema-plan.md` | P1B-1 SDF Schema 实施计划（已执行完毕，task-master 3.1 done 2026-08-03） | 活文档 |
| `docs/plans/2026-08-03-p1b-2-ro-sdf-model-plan.md` | P1B-2 RO/SDF 数据模型实施计划（已执行完毕，云上 26/26，task-master 3.2 done 2026-08-03） | 活文档 |
| `docs/plans/2026-08-04-p1b-3-blob-artifact-upload-plan.md` | P1B-3 Blob 内容寻址存储与上传管线实施计划（已执行完毕，云上 35/35，task-master 3.3 done 2026-08-04） | 活文档 |
| `docs/specs/2026-08-04-p1b-4-version-engine-design.md` | P1B-4 Commit/Manifest 版本引擎设计（design gate 已确认：五决策，代码已实现 2026-08-04） | 活文档 |
| `docs/plans/2026-08-04-p1b-4-version-engine-plan.md` | P1B-4 Commit/Manifest 版本引擎实施计划（已执行完毕，云上 41/41，task-master 3.4 done 2026-08-04） | 活文档 |
| `docs/specs/2026-08-04-p1b-5-diff-service-design.md` | P1B-5 多类型确定性 Diff 服务设计（design gate 已确认：五决策，代码已实现 2026-08-04） | 活文档 |
| `docs/plans/2026-08-04-p1b-5-diff-service-plan.md` | P1B-5 多类型确定性 Diff 服务实施计划（已执行完毕，云上 45/45，task-master 3.5 done 2026-08-04） | 活文档 |
| `docs/specs/2026-08-04-p1b-6-identity-service-design.md` | P1B-6 标识层与时间戳服务设计（design gate 已确认：五决策，代码已实现 2026-08-04） | 活文档 |
| `docs/plans/2026-08-04-p1b-6-identity-service-plan.md` | P1B-6 标识层与时间戳服务实施计划（已执行完毕，云上 50/50，task-master 3.6 done 2026-08-04） | 活文档 |
| `docs/specs/2026-08-04-p1b-7-visibility-permissions-design.md` | P1B-7 RO 可见性模型与 API 权限强制设计（design gate 已确认：五决策，代码已实现 2026-08-04） | 活文档 |
| `docs/plans/2026-08-04-p1b-7-visibility-permissions-plan.md` | P1B-7 RO 可见性模型与 API 权限强制实施计划（已执行完毕，云上 55/55，task-master 3.7 done 2026-08-04） | 活文档 |
| `docs/specs/2026-08-04-p1b-8-sdf-editor-design.md` | P1B-8 三栏 SDF 编辑器桌面端设计（design gate 已确认：五决策，代码已实现 2026-08-04） | 活文档 |
| `docs/plans/2026-08-04-p1b-8-sdf-editor-plan.md` | P1B-8 三栏 SDF 编辑器桌面端实施计划（已执行完毕，next build 通过，task-master 3.8 done 2026-08-04） | 活文档 |
| `docs/specs/2026-08-04-p1b-9-mobile-a11y-design.md` | P1B-9 移动端分步/抽屉编辑器与可访问性设计（design gate 已确认：五决策，代码已实现 2026-08-04） | 活文档 |
| `docs/plans/2026-08-04-p1b-9-mobile-a11y-plan.md` | P1B-9 移动端分步/抽屉编辑器与可访问性实施计划（已执行完毕，next build 通过，task-master 3.9 done 2026-08-04） | 活文档 |
| `docs/specs/2026-08-04-p1b-10-sdf-export-design.md` | P1B-10 SDF 标准导出包生成与校验设计（design gate 已确认：五决策，代码已实现 2026-08-04） | 活文档 |
| `docs/plans/2026-08-04-p1b-10-sdf-export-plan.md` | P1B-10 SDF 标准导出包生成与校验实施计划（已执行完毕，云上 58/58，task-master 3.10 done 2026-08-04） | 活文档 |
| `docs/specs/2026-08-04-p1c-1-collab-model-design.md` | P1C-1 协作域数据模型与迁移设计（design gate 已确认：五决策，代码已实现 2026-08-04） | 活文档 |
| `docs/plans/2026-08-04-p1c-1-collab-model-plan.md` | P1C-1 协作域数据模型与迁移实施计划（已执行完毕，云上 62/62，task-master 4.1 done 2026-08-04） | 活文档 |
| `docs/specs/2026-08-04-p1c-2-branch-management-design.md` | P1C-2 Branch 管理与可见性继承设计（design gate 已确认：五决策，代码已实现 2026-08-04） | 活文档 |
| `docs/plans/2026-08-04-p1c-2-branch-management-plan.md` | P1C-2 Branch 管理与可见性继承实施计划（已执行完毕，云上 63/63，task-master 4.2 done 2026-08-04） | 活文档 |
| `docs/specs/2026-08-04-p1c-3-issue-comment-design.md` | P1C-3 Issue 与评论基础交互设计（design gate 已确认：五决策，代码已实现 2026-08-04） | 活文档 |
| `docs/plans/2026-08-04-p1c-3-issue-comment-plan.md` | P1C-3 Issue 与评论基础交互实施计划（已执行完毕，云上 67/67，task-master 4.3 done 2026-08-04） | 活文档 |
| `docs/specs/2026-08-04-p1c-4-license-design.md` | P1C-4 三类许可选择与继承规则设计（design gate 已确认：五决策，代码已实现 2026-08-04） | 活文档 |
| `docs/plans/2026-08-04-p1c-4-license-plan.md` | P1C-4 三类许可选择与继承规则实施计划（已执行完毕，云上 71/71，task-master 4.4 done 2026-08-04） | 活文档 |
| `docs/specs/2026-08-04-p1c-5-fork-design.md` | P1C-5 Fork 与来源关系及许可继承校验设计（design gate 已确认：五决策，代码已实现 2026-08-04） | 活文档 |
| `docs/plans/2026-08-04-p1c-5-fork-plan.md` | P1C-5 Fork 与来源关系及许可继承校验实施计划（已执行完毕，云上 74/74，task-master 4.5 done 2026-08-04） | 活文档 |
| `docs/specs/2026-08-04-p1c-6-pr-design.md` | P1C-6 Pull Request 声明与提交流程设计（design gate 已确认：五决策，代码已实现 2026-08-04） | 活文档 |
| `docs/plans/2026-08-04-p1c-6-pr-plan.md` | P1C-6 Pull Request 声明与提交流程实施计划（已执行完毕，云上 77/77，task-master 4.6 done 2026-08-04） | 活文档 |
| `docs/specs/2026-08-04-p1c-7-authors-design.md` | P1C-7 作者组与 CRediT 贡献记录设计（design gate 已确认：五决策，代码已实现 2026-08-04） | 活文档 |
| `docs/plans/2026-08-04-p1c-7-authors-plan.md` | P1C-7 作者组与 CRediT 贡献记录实施计划（已执行完毕，云上 79/79，task-master 4.7 done 2026-08-04） | 活文档 |
| `docs/progress.md` | 进度日志，新条目置顶 | 活文档 |
| `docs/handoff/` | 交接文档目录（阶段边界/换 agent/换电脑，必须入库） | 活文档 |
| `docs/handoff/2026-07-28-before-p1a-2-handoff.md` | P1A-2 前交接：Phase 0 Accepted、P1A-1 done、下一任务 P1A-2 | 活文档 |
| `docs/handoff/2026-07-28-p1a-2-local-done-cloud-pending-handoff.md` | P1A-2 本地完成交接：代码+本地门禁 done，集成测试待阿里云，下一任务 P1A-3 design gate | 活文档 |
| `docs/handoff/2026-07-28-p1a-3-local-done-handoff.md` | P1A-3 本地完成交接：auth/api/CLI done 待提交，集成测试待阿里云，下一任务 P1A-4 design gate | 活文档 |
| `docs/handoff/2026-07-31-p1a-2-3-4-cloud-done-handoff.md` | P1A-2/3/4 云上收口交接：集成测试 9/9 全绿、云环境/DNS/Portainer 就绪，下一任务 P1A-5 RBAC design gate | 活文档 |
| `docs/handoff/2026-08-01-p1a-5-cloud-done-handoff.md` | P1A-5 RBAC 云上收口交接：集成测试 11/11 全绿、2.5 done，下一任务 P1A-6 审计日志 design gate | 活文档（主交接） |
| `docs/handoff/2026-08-01-ops-monitoring-proxy-handoff.md` | 运维底座补充交接：SSH 隧道定案+常驻化、监控面板（/nav/ /traffic/ /monitor/）、Tailscale 卸载禁令 | 活文档 |
| `docs/handoff/2026-08-01-p1a-6-audit-observability-done-handoff.md` | P1A-6 统一错误/日志/配置/审计底座收口交接：云上集成 15/15 全绿、2.6 done，下一任务 P1A-7 design gate | 活文档 |
| `docs/handoff/2026-08-03-p1a-7-quota-credits-done-handoff.md` | P1A-7 配额/AI Credit 账务骨架收口交接：云上集成 17/17 全绿、seed 8/8、2.7 done，下一任务 P1A-8 安全基线 design gate | 活文档 |
| `docs/handoff/2026-08-03-p1a-8-security-baseline-done-handoff.md` | P1A-8 安全基线收口交接：云上集成 21/21 全绿、2.8 done，下一任务 P1A-9 CI/CD design gate | 活文档 |
| `docs/handoff/2026-08-03-p1a-9-cicd-deploy-done-handoff.md` | P1A-9 CI/CD 部署收口交接：生产栈上线、备份/恢复演练、2.9 done，Phase 1A 完成 | 活文档 |
| `docs/handoff/2026-08-03-p1b-1-sdf-schema-done-handoff.md` | P1B-1 SDF Schema 包收口交接：core/manifest JSON Schema + ajv，3.1 done，下一任务 P1B-2 数据模型 | 活文档 |
| `docs/handoff/2026-08-03-p1b-2-ro-sdf-model-done-handoff.md` | P1B-2 RO/SDF 数据模型收口交接：迁移 7 + API 骨架，云上 26/26，3.2 done，下一任务 P1B-3 Blob 上传 | 活文档 |
| `docs/handoff/2026-08-04-p1b-3-blob-artifact-done-handoff.md` | P1B-3 Blob 内容寻址存储收口交接：迁移 8 + /artifacts API，云上 35/35，3.3 done，下一任务 P1B-4 版本引擎 | 活文档 |
| `docs/handoff/2026-08-04-p1b-4-version-engine-done-handoff.md` | P1B-4 Commit/Manifest 版本引擎收口交接：迁移 9 + /commits /versions API，云上 41/41，3.4 done，下一任务 P1B-5 Diff 服务 | 活文档 |
| `docs/handoff/2026-08-04-p1b-5-diff-service-done-handoff.md` | P1B-5 多类型确定性 Diff 服务收口交接：packages/diff 九类 + comparison API，云上 45/45，3.5 done，下一任务 P1B-6 标识层 | 活文档 |
| `docs/handoff/2026-08-04-p1b-6-identity-service-done-handoff.md` | P1B-6 标识层与时间戳服务收口交接：packages/identity + 迁移 10 + /research URL，云上 50/50，3.6 done，下一任务 P1B-7 可见性 | 活文档 |
| `docs/handoff/2026-08-04-p1b-7-visibility-done-handoff.md` | P1B-7 RO 可见性模型收口交接：迁移 11 + 三态矩阵 + 扩大审批记录，云上 55/55，3.7 done，下一任务 P1B-8 编辑器 | 活文档 |
| `docs/handoff/2026-08-04-p1b-8-sdf-editor-done-handoff.md` | P1B-8 三栏 SDF 编辑器收口交接：apps/web 三栏 + 建议确认 + 版本导航，next build 通过，3.8 done，下一任务 P1B-9 移动端 | 活文档 |
| `docs/handoff/2026-08-04-p1b-9-mobile-a11y-done-handoff.md` | P1B-9 移动端分步/抽屉编辑器与可访问性收口交接：Drawer + 虚拟化 + WCAG AA，next build 通过，3.9 done，下一任务 P1B-10 导出包 | 活文档 |
| `docs/handoff/2026-08-04-p1b-10-sdf-export-done-handoff.md` | P1B-10 SDF 标准导出包收口交接：export API + 脱库校验，云上 58/58，3.10 done，下一任务 P1C-1 协作模型 | 活文档 |
| `docs/handoff/2026-08-04-p1c-1-collab-model-done-handoff.md` | P1C-1 协作域数据模型收口交接：迁移 12 + 11 实体，云上 62/62，4.1 done，下一任务 P1C-2 Branch 管理 | 活文档 |
| `docs/handoff/2026-08-04-p1c-2-branch-done-handoff.md` | P1C-2 Branch 管理收口交接：迁移 13 + /branches API，云上 63/63，4.2 done，下一任务 P1C-3 Issue/评论 | 活文档 |
| `docs/handoff/2026-08-04-p1c-3-issue-comment-done-handoff.md` | P1C-3 Issue 与评论收口交接：/issues API + 限流，云上 67/67，4.3 done，下一任务 P1C-4 许可选择 | 活文档 |
| `docs/handoff/2026-08-04-p1c-4-license-done-handoff.md` | P1C-4 三类许可收口交接：/licenses API + 继承校验，云上 71/71，4.4 done，下一任务 P1C-5 Fork | 活文档 |
| `docs/handoff/2026-08-04-p1c-5-fork-done-handoff.md` | P1C-5 Fork 收口交接：/forks API + Blob 共享，云上 74/74，4.5 done，下一任务 P1C-6 Pull Request | 活文档 |
| `docs/handoff/2026-08-04-p1c-6-pr-done-handoff.md` | P1C-6 Pull Request 收口交接：/pull-requests API + 迁移 14，云上 77/77，4.6 done，下一任务 P1C-7 作者/CRediT | 活文档 |
| `docs/handoff/2026-08-04-p1c-7-authors-done-handoff.md` | P1C-7 作者组与 CRediT 收口交接：/authors API，云上 79/79，4.7 done，下一任务 P1C-8 Review/Merge | 活文档（当前最新） |
| `docs/CODEBASE_AUDIT.md` | Phase 0 Scholars Tea 只读审计报告（地图/模块分类/风险登记/迁移含义） | 活文档 |
| `docs/proposals/` | 方案/脑暴稿 | 空（旧方案0723已废弃不归档） |
| `docs/decisions/` | 决策记录 ADR | ADR-001 已接受；ADR-002 已建 |
| `docs/decisions/ADR-001-target-architecture.md` | 目标架构决策：选择性抽取 Scholars Tea，按 Baseline 重建平台底座 | 活文档（已接受） |
| `docs/decisions/ADR-002-agent-tooling-portability.md` | Agent 工具能力与可迁移性决策（项目内安装/密钥不入库/分阶段工具候选） | 活文档 |
| `docs/decisions/ADR-003-admin-strong-auth.md` | 管理后台强认证决策：nginx basic_auth 双层 + TOTP 列上线路障（P1A-8） | 活文档 |
| `docs/runbooks/deployment.md` | 部署 runbook（已填充：cloud-sync/迁移/seed/nginx/验证；deploy.sh 自动化 + DNS-01 证书已实证 2026-08-03） | 已填充 |
| `docs/runbooks/backup-restore.md` | 备份与恢复 runbook（四节骨架，Phase 1A 填充） | 骨架 |
| `docs/runbooks/incident.md` | 故障响应 runbook（四节骨架，Phase 1A 填充） | 骨架 |
| `docs/runbooks/monitoring.md` | 监控面板 runbook（Netdata + vnStat，同域 /monitor/ /traffic/ 路径，2026-08-01） | 已上线 |

## infra/
| 路径 | 用途 | 状态 |
|---|---|---|
| `infra/README.md` | infra 目录说明（脚本清单/安全约束/迁移路径） | 活文档 |
| `infra/scripts/ssh-run.sh` | 远程命令唯一入口（BatchMode 密钥认证、危险命令黑名单需 --confirm） | 可用 |
| `infra/scripts/checkup.sh` | 只读巡检（磁盘/内存/负载/Docker/服务/TLS 证书） | 可用 |
| `infra/scripts/backup.sh` | 数据库/对象存储备份 | 骨架，Phase 1A 填充 |
| `infra/scripts/traffic-report.sh` | vnStat JSON → 流量账单静态页渲染（cron 每 5min，2026-08-01） | 已部署云上 |
| `infra/scripts/with-proxy.sh` | 代理兜底包装：隧道可用走 v2ray、失效回落直连（云上 `/usr/local/bin/with-proxy`，2026-08-01） | 已部署云上 |
| `infra/scripts/proxy-tunnel.sh` / `proxy-tunnel.vbs` | 本机侧 SSH 反向隧道常驻（Windows 计划任务 `OpenScience-ProxyTunnel` 登录自启 + 断线重连，2026-08-01） | 已启用 |
| `infra/scripts/deploy.sh` | 部署脚本 | 骨架，Phase 1A 填充 |
| `infra/compose/` | `docker-compose.dev.yml` 开发栈（postgres:16/redis:7/minio + minio-init，端口仅 127.0.0.1，P1A-2）；`docker-compose.monitor.yml` 监控栈（netdata + vnstat，2026-08-01）；`docker-compose.prod.yml` 生产栈（data_net/app_net 分段，数据服务不绑公网，api node:22，P1A-9） | dev 本机未起栈；监控栈已部署云上；生产栈已部署云上（2026-08-03） |
| `infra/nginx/` | 反代配置：`portainer.conf`（portainer.428312321.xyz → 127.0.0.1:9443，LE 证书 + WebSocket，2026-07-31；2026-08-01 追加 /nav/ 导航页、/monitor/→Netdata、/traffic/→vnStat 账单页，basic_auth）+ `openscience.conf`（OpenScience.428312321.xyz → 127.0.0.1:3001，P1A-8：/admin basic_auth + XFF 透传） | 均已部署云上并启用（openscience.conf 2026-08-03） |
| `infra/www/` | `nav/index.html` 服务器面板导航静态页（/var/www/nav，2026-08-01） | 已部署云上 |
| `infra/sandbox/` | 沙箱配置占位（P1A-1） | 骨架 |
| `infra/migrations/` | Prisma 迁移（`20260728000000_baseline_app_meta` + `20260728010000_auth_baseline`（P1A-3 四表）+ `20260729010000_workspace_baseline`（P1A-4 三表）+ `20260801010000_user_platform_role`（P1A-5）+ `20260801143000_audit_log`（P1A-6）+ `20260803000000_quota_usage`（P1A-7）+ `20260803150000_research_object`（P1B-2）+ `20260804000000_blob_artifact`（P1B-3）+ `20260804010000_version_engine`（P1B-4）+ `20260804020000_identity`（P1B-6）+ `20260804030000_visibility`（P1B-7）+ `20260804040000_collab`（P1C-1，11 实体 + 3 枚举）+ `20260804050000_branch_head`（P1C-2，head_commit_id 锚点）+ `20260804060000_pr_idempotency`（P1C-6，idempotency_key），各附 rollback.sql） | 已实现，云上已 deploy（迁移 1–14，2026-08-04） |
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
