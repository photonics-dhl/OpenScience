# XGS 文档架构设计（分层落地方案）

- 日期：2026-07-24
- 状态：已获用户批准（brainstorming 流程）
- 范围：工作区文档 + 未来服务器文档 + 平台产品文件架构（占位）

## 1. 背景与目标

XGS 项目（AI 时代科研基础设施平台，见 `方案0723.docx`）目前处于方案脑暴阶段，文档将快速增长。本设计建立文档管理体系，使 AI agent 能够：

- 知道如何**创建**（放哪、叫什么名）
- 知道如何**分类**（按用途分目录）
- 知道如何**排序**（日期前缀 + 活索引）
- 知道如何**查找**（索引 → Glob → Grep）
- **避免**类似功能的重复文件互相干扰

## 2. 工作区文档架构（本次落地）

### 2.1 目录结构

```
E:/Miscellaneous/XGS/
├── AGENTS.md              # 项目规则总入口（含本分类规范，每会话自动注入）
├── project_index.md       # 活索引：路径 → 用途 → 状态（增删改文件必更新）
├── docs/
│   ├── proposals/         # 方案/脑暴稿：YYYY-MM-DD-<主题>.md
│   ├── specs/             # 产品设计 spec：YYYY-MM-DD-<主题>-design.md
│   ├── decisions/         # 决策记录：ADR-NNN-<主题>.md
│   └── progress.md        # 进度日志，新条目置顶
├── src/                   # 未来代码
├── .taskmaster/           # task-master 自管，不手动改
└── .agents/skills/        # 项目级 skills
```

### 2.2 操作规则

**创建**：先查 `project_index.md` 确认无同功能文件 → 按类型进对应目录 → 登记索引。

**命名**：
- 方案稿：`YYYY-MM-DD-<主题>.md`（如 `2026-07-23-platform-proposal.md`）
- Spec：`YYYY-MM-DD-<主题>-design.md`
- 决策：`ADR-NNN-<主题>.md`（NNN 从 001 递增）

**排序**：日期前缀保证文件系统层面按时间自然排序；`project_index.md` 提供语义排序（按目录分节列出）。

**查找**：先查索引 → Glob 按文件名模式 → Grep 按内容。

**防重复**：
1. 同一主题只有一份活文档，迭代原地更新；
2. 只有冻结存档才允许带版本后缀（如 `-v1`、`-final`）；
3. 被取代的旧文档在文档头部标注 `DEPRECATED → 见 <新文档路径>`，并在索引中注明去向，不直接删除（删除需用户批准）；
4. docx 等外部原始文件保留为只读原件（原地不动，如根目录的 `方案0723.docx`），工作副本转为 Markdown 存入对应分类目录。

### 2.3 规则载体（三重保障）

| 载体 | 作用 | 强制力 |
|---|---|---|
| `AGENTS.md` | 规则总入口，每会话自动注入 | 最强 |
| Memory MCP 知识图谱 | 跨会话持久决策记录 | 需主动检索 |
| `project_index.md` | 活索引，防重复的事实依据 | 每文件操作前必读 |

## 3. 服务器文档规范（预留）

服务器（含未来量产服务器）上线后，沿用同一套目录语义映射（如 `/srv/xgs/docs/`）。
具体路径与同步方式届时补入 AGENTS.md 本节。当前无 XGS 专属服务器，不占位实现。

## 4. 平台产品文件架构（占位 spec）

SDF/Research Object 的存储结构、生命周期 ID、版本历史（对应方案0723 中的
`manuscript/ experiment/ code/ figures/ discussions/ history/` 树）属**产品设计**，
不在本次落地范围。待方案0723 需求稳定后，单独走 brainstorm → spec 流程，
产物存放于 `docs/specs/`。

## 5. 落地步骤（实现层）

1. 创建 2.1 节目录结构；
2. 将 `方案0723.docx` 转为 `docs/proposals/2026-07-23-platform-proposal.md`（docx 原件保留）；
3. 编写 `AGENTS.md`（含分类规范、进度更新规则、索引维护规则、安全红线）；
4. 编写 `project_index.md`（登记现有全部文件）；
5. 建立 `docs/progress.md` 并写入首条进度；
6. 将分类决策写入 Memory MCP。
