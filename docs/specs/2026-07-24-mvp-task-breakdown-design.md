# MVP 任务拆解与工具配置设计

> 日期：2026-07-24
> 状态：待用户审阅
> 依据：`docs/OpenScience_Kimi_Development_Spec.md`（Baseline v1.0，下称 Spec）
> 范围决策：任务覆盖 Phase 0–1E（MVP 全程）；Phase 2 只列占位不进任务库
> 载体决策：task-master tasks.json（执行状态库）+ docs/plans 人读计划，同源生成
> 服务器决策：脚本化 + 只读 SSH，符合 Spec §20.4 安全建议

## 1. 目标

1. 以 Spec 为唯一依据，重新生成 Phase 0–1E 的详细执行任务，替换现有 `.taskmaster/tasks/tasks.json`（旧版为 parse-prd 自动生成的 10 个粗任务）。
2. 任务满足：MUST 条款可追溯、验收 16 步（Spec §21.2）全覆盖、依赖无环、粒度可执行（子任务 1–3 天级）。
3. 为任务执行配齐工具：项目级 Skills、MCP 评估结论、服务器脚本与 runbook 框架。
4. 全程多子 agent 并行起草 + 审查 agent 迭代，直到审查 checklist 全绿。

## 2. 任务拆解结构（方案 A：里程碑主线 + 验收追溯）

### 2.1 层级

- 顶层任务 6 个：Phase 0、1A、1B、1C、1D、1E（对应 Spec §22）。
- 每个顶层任务展开 6–10 个子任务，全库预计 40–60 个子任务。
- 依赖关系：Phase 0 是全部门禁（Spec §22：审计完成并确认后才进 1A）；1A → 1B → 1C → 1D → 1E 主干串行；允许并行的子任务在依赖图中显式表达（如 1B 的编辑器 UI 与 Blob 存储可并行）。

### 2.2 每个任务的必填字段

| 字段 | 要求 |
|---|---|
| title | 动宾结构，≤ 60 字 |
| description | 做什么、为什么（引用 Spec 章节号，如 `Spec §7.2`） |
| details | 实现要点、涉及模块/文件、约束（MUST/SHOULD 原文映射） |
| testStrategy | 验证证据：最小测试 + 阶段验收点（对应 §21 测试层） |
| acceptanceRef | 若服务于 §21.2 验收 16 步中的某步，标注步骤号（1–16）；底座类任务标 `-` |
| dependencies | 仅允许指向已定义任务，禁止循环 |
| priority | high = 阻断 MVP 验收；medium = MVP 内重要但可短延期；low = 可裁剪 |

### 2.3 Phase 大纲（起草 agent 的输入边界）

- **Phase 0 现有系统审计**：定位 Scholars Tea / AI Research Workshop 现有代码仓（当前不在本目录，首个子任务）；只读审计（目录/依赖/服务/数据库/部署地图）；可复用/重构/淘汰清单；安全与迁移风险；基准测试；产出 `docs/CODEBASE_AUDIT.md` 与 `docs/adr/0001-target-architecture.md` 草案（Spec §25）。
- **Phase 1A 平台底座**：Monorepo 与模块边界；Auth + 邀请码 + 邮箱验证；Workspace + RBAC（API 层强制，非前端隐藏）；PostgreSQL + Redis + Storage Adapter；统一错误/日志/配置/审计；AI Credit 账务骨架；CI/CD 与阿里云 ECS 部署脚本。
- **Phase 1B SDF 与版本**：六字段 Schema（JSON Schema + 语义化版本）；三栏编辑器（移动端分步/抽屉）；Artifact/Blob 内容寻址存储；Commit/Manifest/增量版本；多类型 Diff（§7.3）；unique ID 与稳定 URL；私有/邀请/公开可见性。
- **Phase 1C 协作**：Branch/Commit/Fork/PR/Review/Merge 数据模型与基础交互；作者组与 CRediT 贡献记录；三类许可选择与继承校验；通知。
- **Phase 1D Hermes 与发布**：AI Gateway（MiniMax-M3 主模型 / 回退策略由 Gateway 配置管理、统一日志、Schema 校验重试）；SDF Extractor（建议/差异形式，不直接写正文）；AI 发布审核（硬阻断 vs 警告分离）；申诉与 Moderator 队列；R0–R4 分级审批（批量 diff、作用域授权、撤销）；发布流程与公开页（含免责声明、审核摘要）。
- **Phase 1E 轻量科学可视化**：Visualization Planner；Python AST 策略检查；Sandbox Controller + 隔离 Docker 网络（§10.3 全部限制）；临时图片与 IndexedDB 保存；自然语言修改脚本（每次重新检查 + 新容器）；威胁模型文档与沙箱逃逸基线测试。

### 2.4 Phase 2 占位

任务库中不建 Phase 2 任务；在 docs/plans 计划文档末尾列 Spec §19 清单作为"已记录、未立项"，防止遗忘也防止提前侵入。

## 3. 落地载体

### 3.1 task-master tasks.json

- 由最终定稿的任务内容**直接构建 JSON**（不走 parse-prd 再生成：内容已结构化，手工构建更精确可控）。
- Schema 对齐 task-master 现有格式（`master` tag → `tasks[]`，含 id/title/description/details/testStrategy/dependencies/priority/status/subtasks）。
- `acceptanceRef` 为非标准字段：若 task-master 解析时剥离未知字段，则以 `验收: 步骤N` 形式并入 `details` 文本，保证信息不丢。
- 写入前确认旧 `tasks.json` 已被 git 跟踪（可恢复）；若未跟踪则先提交一次再覆盖。
- 写入后用 `task-master list`（CLI）和 MCP `get_tasks` 双向验证可解析、依赖无环、`next` 正确返回 Phase 0 首个子任务。

### 3.2 docs/plans 人读计划

- 路径：`docs/plans/2026-07-24-mvp-implementation-plan.md`。
- 内容：Phase 总览、任务树、依赖图（mermaid）、验收 16 步 → 任务映射表、风险与门禁。
- 与 tasks.json 同源（从同一份定稿 JSON 渲染），避免两份手工维护漂移。

## 4. 工具配置

### 4.1 项目级 Skills（落地到 `.agents/skills/<name>/SKILL.md`）

按 Spec §20.3 推荐，创建 8 个，均为流程规范型 skill（不重复 Kimi 内置能力）：

| Skill | 职责 | 关键规则来源 |
|---|---|---|
| repo-map | 只读扫描仓库，产出目录/依赖/服务/数据地图；规范快速文件查找（先索引 → Glob → Grep） | §20.2、§25 |
| architecture-guard | 修改前核对 Monorepo 模块边界与禁止事项（如 Provider SDK 不散落业务代码） | §9.3、§14.1 |
| api-contract | REST 模块规范、前后端 Schema 合同、幂等键与乐观锁 | §16 |
| database-migration | 迁移向前可部署、可回滚或有补偿；生产禁自动破坏性迁移 | §15 |
| frontend-design | Next.js、响应式（桌面/移动功能一致）、可访问性（WCAG AA）、三套视觉系统区分 | §2.5、§18 |
| infra-runbook | 部署/备份/巡检/恢复演练 runbook 规范（阿里云 ECS 上下文） | §14.2、§17 |
| security-review | 越权、密钥、上传、沙箱、依赖风险审查清单 | §17、§10.3 |
| test-gate | 最小相关测试 → 阶段验收测试的证据要求；禁止声称未验证功能完成 | §20.1、§21 |

注意：用户级已有 `design` skill（通用 UI 设计），项目级 `frontend-design` 更贴 Spec 术语，二者不冲突（项目级优先）。

### 4.2 MCP 评估结论

- **维持现状**：github（最小权限）、context7、playwright（仅测试环境）、memory、fetch、tavily、task-master、paper-search/semantic-scholar（文献场景）、mermaid。
- **不新增**：数据库 MCP（staging 未建，Spec §20.4 要求只读脱敏库，暂缓）；阿里云/SSH MCP（Spec §20.4 明确首版不给通用写权限，走脚本化）；文件系统 MCP（Kimi 内置已够，§20.4 明确不要重复安装）。
- **已修复待验证**：task-master MCP 的 OPENAI_COMPATIBLE_API_KEY 字面值 key，下次重启 session 后验证 MCP 路径。

### 4.3 服务器管理（脚本化 + 只读 SSH）

在当前管理仓建立框架（产品 Monorepo 建成后迁移至其 `infra/`，README 注明）：

```text
infra/
├── README.md              # 用途、迁移路径、安全约束（凭据只从 .env 读，禁打印）
└── scripts/
    ├── ssh-run.sh         # SSH 执行包装：从 .env 读 SERVER_HOST/USER，拒收交互式密码
    ├── checkup.sh         # 只读巡检：磁盘/内存/Docker/服务状态/证书有效期
    ├── backup.sh          # 数据库+对象存储备份（Phase 1A 填充，先占位骨架）
    └── deploy.sh          # 部署入口（Phase 1A 填充，先占位骨架）
docs/runbooks/
├── deployment.md          # 部署 runbook 骨架
├── backup-restore.md      # 备份与恢复演练 runbook 骨架（§17 要求定期演练）
└── incident.md            # 故障响应 runbook 骨架
```

- 所有脚本：只读默认、写操作需 `--confirm` 标志；凭据一律从 `.env` 读取（SERVER_* 键），脚本与输出均不得打印密钥。
- Windows 本地用 Git Bash 执行；服务器侧命令兼容 Alibaba Cloud Linux。

### 4.4 权限与工作习惯约束（写进相关 skill）

- 快速查找：先 project_index → Glob 文件名 → Grep 内容；禁止大范围递归 cat。
- 避免重复造轮子：新功能前先 repo-map / Grep 查现有实现；优先复用现有依赖，新增依赖需在设计中说明。
- 危险操作分级对齐 Spec §20.5：读允许；测试命令白名单；push/迁移/部署询问；删除/生产库/Secret 拒绝或强确认。

## 5. 审查与迭代机制

### 5.1 起草（并行，6 个 coder 子 agent）

每 Phase 一个子 agent。输入：本设计文档 + Spec 原文相关章节 + 任务模板（§2.2）+ 质量 bar。输出：该 Phase 的 tasks JSON fragment（含子任务）。

### 5.2 审查（并行，2 个审查子 agent，审全量合并稿）

- **覆盖度审查** checklist：
  1. Spec §22 六个里程碑全部落为顶层任务；
  2. §2 已确认产品决策、§17 安全 MUST、§21 测试要求逐条有任务映射或显式记录为"暂缓+原因"；
  3. §21.2 验收 16 步每步至少一个任务引用；
  4. 无 Phase 2 功能侵入（§19 清单为禁区）。
- **质量审查** checklist：
  1. 依赖无环、无悬空引用、Phase 0 为唯一无依赖起点；
  2. 子任务粒度 1–3 天，title 动宾结构；
  3. 每个任务有 testStrategy 与 acceptanceRef；
  4. YAGNI：无 Spec 之外的臆造需求；
  5. 优先级标注合理（阻断验收 = high）。

### 5.3 迭代与仲裁

- 审查意见汇总后交回对应起草 agent 修订（resume 原 agent，保留上下文）；最多 3 轮。
- 争议项由主 agent 对照 Spec 原文仲裁；Spec 未覆盖的（§24 待确认清单）不允许猜，记录为待确认项。

## 6. 执行编排

1. 本设计文档 → 用户审阅（当前步骤）。
2. writing-plans 生成实施计划 `docs/plans/2026-07-24-mvp-task-breakdown-plan.md`。
3. 执行：
   a. 创建 8 个 skills + infra 脚本/runbook 框架（主 agent 直接做，机械性工作）；
   b. AgentSwarm 并行起草 6 个 Phase 任务；
   c. 合并 → 2 个审查 agent 并行审查 → 迭代至 checklist 全绿；
   d. 生成 tasks.json + 渲染 docs/plans 人读计划 → 双通道验证（CLI list + MCP get_tasks/next）；
   e. 更新 project_index.md、docs/progress.md、Memory（XGS- 前缀实体）。
4. 验收：本设计 §2/§3/§4/§5 各节的可验证项全部通过。

## 7. 风险与对策

| 风险 | 对策 |
|---|---|
| 子 agent 脱离 Spec 臆造需求 | 输入强制附 Spec 章节原文；审查 checklist 含 YAGNI 项 |
| 任务粒度过粗退化为旧版 | 审查 checklist 含粒度项（1–3 天）；过粗打回展开 |
| tasks.json 手写 schema 不兼容 | 以现有 tasks.json 为 schema 样板；CLI+MCP 双验证 |
| 现有代码仓找不到 | Phase 0 首任务即定位；找不到则阻塞并报告用户，不虚构审计结论 |
| 工具配置过度建设 | §4.2 明确"不新增"清单；8 个 skill 均为薄流程文档，不写代码 |
