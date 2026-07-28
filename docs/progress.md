# OpenScience (XGS) 进度日志

## 2026-07-28 — P1A-2 终审通过（fix wave 完成），本地阶段收尾

### ✅ Completed
| 任务 | 详情 |
|---|---|
| 终审 | 全范围 final review（final-review-package.md）：无 Critical；1 Important（redis 无 error listener，plan 原文固有→用户裁决：修代码+同步 plan/design）+ 4 Minor fix-now；其余 parked |
| fix wave | 单次修复：`packages/database/src/redis.ts` 默认空 error listener（plan Task 2 Step 8 与 design §4 已同步修订）；`migrate-cli.ts` spawn 失败打印诊断；AGENTS.md infra/ 行与 `stack:logs` 补登；`.env.example` 补尾换行。验证：`@openscience/database` build/typecheck exit 0、单测 4/4、生产守卫演示仍 Refused |
| re-review | scoped re-review：5 项发现全部 ADDRESSED，无新破坏 |

### Key Decisions / 坑
- redis 语义变化：redis 不可用时不再打挂宿主进程，改为静默重试；消费方可自加 `client.on('error', ...)`（JSDoc 与 design 已注明）
- parked（后续处理）：生产缺 `DATABASE_URL` 静默回落 dev URL（建议 P1A-3 随 auth env 校验）；`S3_PORT` NaN 无校验；root `package.json` `workspaces` 字段冗余（P1A-1 遗产）；minio-init until 环无上限（既定设计）
- SDD ledger 保留在 `.superpowers/sdd/2026-07-28-p1a-2-data-foundation-plan/`，云上续跑 Task 4/5 时复用

### ⏳ Next Steps
- [ ] 阿里云就绪后：云上 `npx pnpm@9.15.0 test:integration`（Task 4/5），通过后置 task-master 2.2 done
- [ ] P1A-3：邀请码注册与邮箱验证 Auth（task-master 2.3，先 design gate，本地可做）

---

## 2026-07-28 — P1A-2 代码实现完成，集成测试留待阿里云

### ✅ Completed
| 任务 | 详情 |
|---|---|
| dev 栈 | `infra/compose/docker-compose.dev.yml`（postgres:16/redis:7/minio 固定 tag + minio-init 建 bucket）与 `stack:up|down|ps` 脚本已就位，端口仅 127.0.0.1；按用户指示本机未起栈 |
| packages/database | Prisma 5.22 + 基线迁移 `app_meta`（含 rollback.sql 补偿）；`createPrismaClient`/`createRedisClient`；迁移 runner 生产守卫 |
| packages/storage | StorageAdapter 接口 + MinIO 实现（put/get/head/delete + sha256 校验）；OSS 驱动预留抛 NotImplemented |
| 测试证据 | 静态门禁全绿：`npx pnpm@9.15.0 build`/`typecheck` exit 0，`verify:workspace` = `WORKSPACE_STRUCTURE_OK`；单测 14/14 过（database 4 + storage 10，vitest run 全 passed）；生产守卫演示 `NODE_ENV=production node packages/database/dist/migrate-cli.js reset-dev` exit 1，输出 `Refused: migrate command "reset-dev" is destructive and forbidden when NODE_ENV=production` |
| 集成测试 | 未在本机执行（需 Docker）；task-master 2.2 按 test-gate 纪律保持 pending，未置 done |

### Key Decisions / 坑
- 用户 2026-07-28 指示：本地机不做任何 Docker 相关执行，本地定位为架构设计 + 开发习惯优化；P1A-2 集成测试留待阿里云服务器就绪后在云上执行
- Prisma 仅前向迁移，回滚走每迁移附带的 rollback.sql 补偿路径（database-migration skill 第 2 条）
- 本机 `docker compose` 插件缺失，脚本 `docker compose ... || docker-compose ...` 兜底
- 开发凭据 compose 内联默认值为用户批准的开发态豁免；生产强制 env（2.9）

### ⏳ Next Steps
- [ ] P1A-2 集成测试（迁移 deploy/rollback/redeploy、redis ping、MinIO 全链路）：待阿里云就绪后在云上执行 `npx pnpm@9.15.0 test:integration`，通过后方可将 task-master 2.2 置 done
- [ ] P1A-3：邀请码注册与邮箱验证 Auth（task-master 2.3，先 design gate）

---

## 2026-07-28 — docs-sync 收尾并刷新 P1A-2 handoff

### ✅ Completed
| 任务 | 详情 |
|---|---|
| handoff 刷新 | `docs/handoff/2026-07-28-before-p1a-2-handoff.md` 已按 docs-sync 更新：补入 docs-sync skill 创建、handoff 入库规则、C 盘临时文件清理证据、当前 session skill 列表未刷新但文件可用的说明 |
| 规则确认 | 例行同步（project_index/progress/task-master/AGENTS/Memory）由 agent 主动完成；正式 handoff 在阶段边界/长 session/换 agent/换电脑/用户要求时写入 `docs/handoff/` |

### ⏳ Next Steps
- [ ] P1A-2：PostgreSQL + Redis + Storage Adapter（先 design gate）

---

## 2026-07-28 — handoff 入库到 docs/handoff

### ✅ Completed
| 任务 | 详情 |
|---|---|
| handoff 迁移 | P1A-2 前 handoff 已从 C 盘临时路径迁到项目内 `docs/handoff/2026-07-28-before-p1a-2-handoff.md`；临时文件已删除，后续 handoff 一律入库 |
| 规则更新 | `AGENTS.md` 文档分类新增 `docs/handoff/`；`.agents/skills/docs-sync/SKILL.md` 明确：例行同步 agent 主动做，正式 handoff 在阶段边界/换 agent/换电脑/用户要求时主动写，且必须存项目内 |

### ⏳ Next Steps
- [ ] P1A-2：PostgreSQL + Redis + Storage Adapter（先 design gate）

---

## 2026-07-28 — docs-sync skill + P1A-2 前 handoff

### ✅ Completed
| 任务 | 详情 |
|---|---|
| docs-sync skill | 新建 `.agents/skills/docs-sync/SKILL.md`：事实源顺序、必须同步时机、handoff 最小模板、不做的事（不手写 CLAUDE.md/不入密钥/不造第二份活文档）、自动化边界与 Red Flags；已登记 `AGENTS.md` 与 `project_index.md` |
| handoff | 已生成 P1A-2 前短 handoff：`C:/Users/Mac/AppData/Local/Temp/handoff-eM8h9E.md`；内容只指向事实源（AGENTS/Spec/ADR/audit/progress/index/task-master/Memory），不复制大段历史 |

### Key Decisions
- 文档管理采用“半自动”：agent 按 docs-sync 清单同步；`scripts/docs/check-docs-sync.mjs` 与 CI gate 后续再补，不用脚本替代人工判断
- `AGENTS.md` 仍是 canonical；`CLAUDE.md`/Cursor 规则不手写，确需多工具规则时再用 rulesync 并先写 ADR

### ⏳ Next Steps
- [ ] P1A-2：PostgreSQL + Redis + Storage Adapter（先 design gate，再实施 `infra/compose`、`packages/database`、`packages/storage`）

---

## 2026-07-28 — P1A-1 Monorepo 骨架落地并验证通过

### ✅ Completed
| 任务 | 详情 |
|---|---|
| 执行方式 | 方案 A 全量占位骨架；`.worktrees/p1a-1` 隔离执行，subagent-driven：5 个 task 均有 implementer + reviewer，终审 clean |
| 骨架内容 | root `package.json`/`pnpm-workspace.yaml`/`pnpm-lock.yaml`/`tsconfig.base.json`/`eslint.config.cjs`/`.npmrc`；`scripts/verify-workspace.mjs`；`apps/{web,api,agent-worker,science-worker,sandbox-controller}`；`packages/` 11 个占位包；`infra/{compose,nginx,sandbox,scripts,migrations}` 占位 |
| 验证证据 | worktree 内 `node scripts/verify-workspace.mjs` = `WORKSPACE_STRUCTURE_OK`；`npx pnpm@9.15.0 install/build/typecheck/lint` 全过；API 冒烟 `API_IMPORT_OK`；复制净骨架回主目录后再次 `WORKSPACE_STRUCTURE_OK` |
| 收尾 | 净骨架已复制到主目录（排除 node_modules/dist/.next/tsbuildinfo/src 编译残留）；`.gitignore` 已补 `dist/`、`.next/`、`*.tsbuildinfo`；task-master `2.1` 置 done（JSON 修复路径，`JSON_OK`） |

### Key Decisions / 坑
- 实施中必要最小修复：`tsconfig.base.json` 的 rootDir/outDir 改用 TS 5.5 `${configDir}`；web 增加 Next 必需 `app/layout.tsx` 与 `rootDir: "."`；终审确认非 scope creep
- 按约束全程未 `git add/commit/push`；worktree 分支只有 untracked 骨架，因此采用“复制净骨架到主目录”收尾
- worktree 内曾产生 `src/*.{js,d.ts,js.map}` 编译残留；未复制到主目录。首次提交前仍需检查并清理/忽略类似残留（终审 Important 项）

### ⏳ Next Steps
- [ ] P1A-2：PostgreSQL + Redis + Storage Adapter（`infra/compose`、`packages/database`、`packages/storage`、迁移 runner）
- [ ] 首次 git 提交前：确认无 `src/*.{js,d.ts,js.map}` 编译残留、无 node_modules/dist/.next 入库

---

## 2026-07-28 — task-master tasks.json 子任务数据修复

### ✅ Completed
| 任务 | 详情 |
|---|---|
| 备份 | 修复前创建 `.taskmaster/tasks/tasks.json.bak-20260728-parentid` 与 `.taskmaster/tasks/tasks.json.bak-20260728-subtask-ids` |
| parentId 修复 | 55 个子任务 `parentId: "undefined"` 已按父任务补齐，`JSON_OK` |
| 子任务 id 规范化 | 数值型子任务 id 统一转为字符串；发现并修复 `3.10/4.10` 被 JSON 数值吞零成 `3.1/4.1` 导致的重复 id；重复检查 `DUPLICATES []` |
| Phase 0 子任务状态 | 1.1–1.6、1.8、1.9 = done；1.7 = deferred（只读审计未运行测试/基准，避免 E2E 打生产）；任务 1 保持 done |

### Key Decisions / 坑
- task-master MCP `set_task_status` 对父任务可用，但对子任务持续报 `Failed to update task status`（修复 parentId/id 后仍复现）；本次按用户批准直接修 `tasks.json`，未动业务代码
- 后续用 task-master 扩子任务前，建议仍先跑一次小范围状态更新验证；若 MCP 子任务写入仍失败，继续以 JSON 校验 + 备份方式处理

### ⏳ Next Steps
- [ ] Phase 1A 首批：P1A-1 Monorepo 骨架 → P1A-2 PostgreSQL/Redis/Storage Adapter → P1A-3 邀请码注册/邮箱验证

---

## 2026-07-28 — Phase 0 门禁通过，ADR-001 Accepted

### ✅ Completed
| 任务 | 详情 |
|---|---|
| 用户确认 | 用户接受 `docs/CODEBASE_AUDIT.md` 与 `docs/decisions/ADR-001-target-architecture.md` |
| ADR-001 | 状态已从 Draft 改为 Accepted（2026-07-28 用户确认）；`project_index.md` 同步更新 |
| task-master | Phase 0 任务 1 已由 review 转 done；Phase 0 正式完成，允许进入 Phase 1A |

### Key Decisions
- 目标架构确定为：选择性抽取 Scholars Tea 高价值模块，按 Baseline v1.0 重建 OpenScience Monorepo 平台底座
- Phase 1A 输入边界固定：只做平台底座，不含 SDF/编辑器（1B）、协作（1C）、Hermes/发布（1D）、可视化沙箱（1E）和 §19 Phase 2 功能

### ⏳ Next Steps
- [ ] Phase 1A 首批：P1A-1 Monorepo 骨架 → P1A-2 PostgreSQL/Redis/Storage Adapter → P1A-3 邀请码注册/邮箱验证
- [ ] 另立安全任务（需用户批准执行）：Scholars Tea 凭据轮换与 git 跟踪清理

---

## 2026-07-28 — Phase 0 Scholars Tea 只读审计完成（待确认）

### ✅ Completed
| 任务 | 详情 |
|---|---|
| 审计执行 | 目标 `Z:/data/home/zju321/321/DHL/scholars_tea`（HEAD `74eb3f7`，工作区有大量未提交修改）；5 个并行只读子审计 + 高风险结论人工复核；未修改目标仓库、未读取 `.env`/`.env.postgres` 值、未启动服务/测试 |
| 产出 | `docs/CODEBASE_AUDIT.md`（目录/依赖/服务/数据地图，Hermes/AI/认证/上传/社区/WebSocket/模型路由定位，保留/局部重构/替换/待确认分类，风险登记册） |
| ADR-001 草案 | `docs/decisions/ADR-001-target-architecture.md`：选择性抽取 Scholars Tea，按 Baseline 重建 OpenScience 平台底座；AI Gateway 主模型 MiniMax-M3，回退配置化不写死 |
| task-master | 任务 1 已置 `review`，等待用户确认审计与 ADR-001 后进入 Phase 1A |

### Key Decisions / 风险
- Scholars Tea 可复用的是模块与经验，不是当前架构：认证/验证码流、service 层、统一 API 响应、`tool-call-guard`、RAG/引用校验/外部检索可抽取；上传、模型路由、socket 双写、迁移体系、部署脚本群必须重建
- 高危已核实：`.env.postgres`、`hermes-home/config.yaml`、`hermes/config.yaml`、`gateway_state.json`、`hermes-home/backup/*.bak` 被 git 跟踪；groups/upload 无鉴权；Prisma 空 baseline；SMS stub；E2E 直连生产地址
- pem 本地文件存在但本次 `git ls-files '*.pem'` 未确认跟踪；任何删除/清理都必须经用户批准

### ⏳ Next Steps
- [ ] 用户确认 `CODEBASE_AUDIT.md` 与 ADR-001；确认后 ADR-001 转 Accepted、任务 1 转 done
- [ ] 另立安全任务：Scholars Tea 凭据轮换与 git 跟踪清理（需用户批准后才执行）
- [ ] Phase 1A：展开 pnpm workspace/Auth/Workspace/RBAC/Prisma 基线迁移/Storage Adapter/CI 子任务

---

## 2026-07-28 — MiniMax-M3 基线修正 + ADR-002 工具可迁移性

### ✅ Completed
| 任务 | 详情 |
|---|---|
| MiniMax-M3 同步 | 用户确认首版主模型一直是 MiniMax-M3；已同步 baseline §2.4/§9.3/§24、MVP task design、architecture-guard skill、task-master tasks/drafts；回退策略不写死，交由 AI Gateway 配置/ADR |
| ADR-002 | 新建 `docs/decisions/ADR-002-agent-tooling-portability.md`：项目内安装、`npx`/`uvx` 优先、密钥不入库、生成物入库、不引入重叠任务事实源；代码审计/重构与文档自动维护工具分阶段候选 |
| AGENTS 规则 | 新增 Tooling Portability Rules，指向 ADR-002 |

### Key Decisions / 坑
- 回退/兜底模型未确认，任何文档/skill/task 不得写死；当前只确定主模型 MiniMax-M3
- 现阶段不安装新工具：`src/` 为空且无 root `package.json`；Phase 1A 初始化 pnpm workspace 时再把 markdownlint/dependency-cruiser/knip/jscpd/ast-grep/syncpack 纳入 devDependencies/scripts

### ⏳ Next Steps
- [ ] Phase 0：确认 Scholars Tea / AI Research Workshop 现有代码位置后执行只读审计（task-master 任务 1）
- [ ] Phase 1A：root `package.json`/pnpm workspace 建立后落地 `docs:lint`、`audit:*`、`docs:sync-check` scripts

---

## 2026-07-24 — T2 infra 脚本 + runbook 框架落地

### ✅ Completed
| 任务 | 详情 |
|---|---|
| infra 脚本框架 | 新建 `infra/scripts/{ssh-run,checkup,backup,deploy}.sh` + `infra/README.md` + `docs/runbooks/` 3 个四节骨架；已登记 project_index.md |
| T2 验证 | `bash -n infra/scripts/*.sh` 全过（SYNTAX_OK）；`backup.sh` 输出 NOT IMPLEMENTED 且 exit=64（符合预期）；`checkup.sh` 因本机 SSH 密钥未配置按设计报"请配置 SSH 密钥，本脚本不处理密码"（exit=255，属预期结果之一） |
| ssh-run.sh 修复 | 删除主机名后多余的 `--`（OpenSSH 会把它拼进远端命令导致远端 shell 报 invalid option） |

### Key Decisions / 坑
- .env 为 UTF-8，服务器键名为中文键 `公网ip`/`用户名`/`SSH端口`；脚本英文键（SERVER_*/SSH_*）优先 + 中文键兜底，刻意不读 `密码`/`Password`（BatchMode 仅密钥）
- 危险命令黑名单做单词边界匹配：`rm`/`systemctl stop` 无 --confirm 拦截（exit=65），`systemctl status`、`echo dormroom` 不误伤

### ⏳ Next Steps
- [ ] SSH 密钥配通后重跑 `checkup.sh`，把完整巡检输出记入本日志
- [ ] backup.sh / deploy.sh 及 3 个 runbook 内容待 Phase 1A（P1A-*）填充

---

## 2026-07-24 — task-master MiniMax parse-prd 实测通过

### ✅ Completed
| 任务 | 详情 |
|---|---|
| minimax_proxy 验证 | 代理 8471 端口链路正常：MiniMax-M2.7 响应正常，reasoning_split 生效（thinking 进 reasoning_content） |
| parse-prd 实测（CLI） | `task-master parse-prd .taskmaster/docs/prd.txt -o tasks-minimax-test.json -f` 成功生成 10 个任务（含依赖/优先级，结构合理）；Tokens 9969（in 2484 / out 7485） |
| .mcp.json key 修复 | OPENAI_COMPATIBLE_API_KEY 原为占位符 `${MINIMAX_API_KEY}`，进程环境无此变量 → MCP server 拿到空 key 报 401；已改为字面值（脚本写入未打印），**下次重启 session 后 MCP 路径生效** |

### Key Decisions / 坑
- `npx task-master-ai` 是 MCP server 不是 CLI；CLI 的 bin 名是 `task-master`（`npx --package=task-master-ai task-master ...`）
- parse-prd `-o` 输出文件必须预先存在（可先写空壳 `{"master":{"tasks":[]}}`）
- kimi-code 的 .mcp.json env 不做 .env 占位符解析（至少对未注入进程环境的变量如此），key 需写字面值

### ⏳ Next Steps
- [ ] 下次重启后验证 MCP 路径 parse-prd/expand（.mcp.json 字面值 key 生效）
- [ ] tasks-minimax-test.json 为测试产物，确认后由用户决定是否采用/清理

---

## 2026-07-24 — Memory 存储迁移 + git 推送打通

### ✅ Completed
| 任务 | 详情 |
|---|---|
| git push 打通 | 全权限 token（.env GITHUB_TOKEN_FULL_PERMISSION）推送 main 成功；原 GITHUB_TOKEN 确认为只读 |
| Memory 存储迁移 | .mcp.json 增加 MEMORY_FILE_PATH=.memory/memory.jsonl；重启 session 生效 |
| Memory 实体过滤 | 按用户要求只保留 3 个 XGS 实体（XGS项目环境配置 / task-master MiniMax 迁移 / XGS-Doc-Architecture）；其他项目 5 个实体留在原 npx 缓存存储，未动 |

### ⏳ Next Steps
- [ ] 重启 session 后验证 memory 从新路径加载（read_graph 应有 3 个 XGS 实体）

### Key Decisions
- server-memory 默认存储在包目录 dist/memory.jsonl（JSONL 格式）；迁移后随 git 备份
- git 推送方式：x-access-token + Basic extraHeader，token 按需从 .env grep 提取

---

## 2026-07-24 — 文档架构落地

### ✅ Completed
| 任务 | 详情 |
|---|---|
| 文档架构设计 | spec 获用户批准：docs/specs/2026-07-24-doc-architecture-design.md |
| 规则三件套 | AGENTS.md / project_index.md / progress.md 建立 |
| 并行产物登记 | Cursor session 产出的 Baseline v1.0（docs/OpenScience_Kimi_Development_Spec.md）登记为 source of truth，路径例外原地保留 |
| 旧方案处置 | 方案0723.docx 已被 Baseline v1.0 取代，用户确认放弃，不归档 |
| git 初始化 | 关联 GitHub 远端，初始提交 |

### ⏳ Next Steps
- [ ] 按 Baseline v1.0 审计现有代码（Scholars Tea / AI Research Workshop 可复用模块）
- [ ] task-master MiniMax-M2.7 全链路实测（memory 遗留待办）
- [ ] 平台产品文件架构（SDF/RO 存储）细节在 Baseline 框架内细化
- [ ] 服务器文档规范待服务器上线后补入 AGENTS.md

### Key Decisions
- 文档管理分层落地：工作区先行，服务器预留，产品架构随 Baseline 细化
- 规则载体三重保障：AGENTS.md（强制）+ Memory MCP（跨会话）+ project_index.md（活索引）
- `docs/OpenScience_Kimi_Development_Spec.md` 为需求基线，路径例外不移动（多 session 引用）
- 放弃旧方案0723，避免新旧需求互相干扰

---
