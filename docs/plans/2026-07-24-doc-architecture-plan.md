# XGS 文档架构落地实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 `docs/specs/2026-07-24-doc-architecture-design.md` 落地 XGS 工作区文档架构，并初始化 git 仓库。

**Architecture:** 纯文档/配置落地，无代码。三类产物：目录与转换文档、规则文件（AGENTS.md / project_index.md / progress.md）、持久化（Memory MCP + git 初始提交）。

**Tech Stack:** Markdown、Python（docx 解包转换，仅标准库 zipfile/re）、git、Memory MCP。

## Global Constraints

- 工作目录：`E:/Miscellaneous/XGS`（Windows + Git Bash，Unix 语法）
- spec 权威来源：`docs/specs/2026-07-24-doc-architecture-design.md`
- 命名规范：方案稿 `YYYY-MM-DD-<主题>.md`；spec `YYYY-MM-DD-<主题>-design.md`；决策 `ADR-NNN-<主题>.md`
- docx 原件（`方案0723.docx`）原地保留，只读不动
- 不读 `.env` 内容；仅提取变量名，值通过 shell 变量引用，不打印
- git 操作已获用户明确授权（init + remote + 初始提交）
- 禁止删除任何现有文件

---

### Task 1: 目录结构与 docx 转换

**Files:**
- Create: `docs/proposals/`、`docs/decisions/`、`src/`（目录）
- Create: `docs/proposals/2026-07-23-platform-proposal.md`

**Interfaces:**
- Produces: `docs/proposals/2026-07-23-platform-proposal.md`（Task 2 的索引登记对象）

- [ ] **Step 1: 建目录**

```bash
cd "E:/Miscellaneous/XGS" && mkdir -p docs/proposals docs/decisions src
```

- [ ] **Step 2: docx 转 Markdown**

`方案0723.docx` 是脑暴稿，无复杂表格，用标准库解包提取段落文本即可：

```bash
cd "E:/Miscellaneous/XGS" && python -c "
import zipfile, re, sys
sys.stdout.reconfigure(encoding='utf-8')
with zipfile.ZipFile('方案0723.docx') as z:
    xml = z.read('word/document.xml').decode('utf-8')
text = re.sub(r'<w:p [^>]*>|<w:p>', '\n', xml)
text = re.sub(r'<[^>]+>', '', text)
header = '# XGS 平台方案脑暴稿（2026-07-23）\n\n> 来源：方案0723.docx（原件保留于项目根目录，只读）\n\n---\n\n'
open('docs/proposals/2026-07-23-platform-proposal.md', 'w', encoding='utf-8').write(header + text.strip() + '\n')
print('OK')
"
```

- [ ] **Step 3: 验证转换结果**

Run: `Read docs/proposals/2026-07-23-platform-proposal.md`（读前 50 行与后 20 行）
Expected: UTF-8 中文正常显示，含"项目定位""SDF""Research Object"等关键段落，无乱码

- [ ] **Step 4: Commit**

```bash
cd "E:/Miscellaneous/XGS" && git add docs/proposals/ && git commit -m "docs: 方案0723.docx 转 markdown 归档至 docs/proposals"
```

（若 Task 3 的 git init 尚未执行，本步推迟到 Task 3 一并提交。）

---

### Task 2: 规则三件套（AGENTS.md / project_index.md / progress.md）

**Files:**
- Create: `AGENTS.md`
- Create: `project_index.md`
- Create: `docs/progress.md`
- Create: `docs/plans/`（实施计划目录，本计划移入）

**Interfaces:**
- Consumes: Task 1 产出的 `docs/proposals/2026-07-23-platform-proposal.md`
- Produces: 全项目规则入口，后续所有 session 遵守

- [ ] **Step 1: 写 `AGENTS.md`**

```markdown
# XGS 项目

## Overview
AI 时代科研基础设施平台（Research Object / SDF / 预印本 + 社区评价）。当前处于方案脑暴与架构设计阶段。

## 文档分类规范
| 类型 | 目录 | 命名 |
|---|---|---|
| 方案/脑暴稿 | `docs/proposals/` | `YYYY-MM-DD-<主题>.md` |
| 产品设计 spec | `docs/specs/` | `YYYY-MM-DD-<主题>-design.md` |
| 实施计划 | `docs/plans/` | `YYYY-MM-DD-<主题>-plan.md` |
| 决策记录 | `docs/decisions/` | `ADR-NNN-<主题>.md`（NNN 递增） |
| 进度日志 | `docs/progress.md` | 单文件，新条目置顶 |

## 文档操作规则
- **创建前**：先查 `project_index.md`，确认无同功能文件
- **创建后**：按类型入目录、按规范命名、登记 `project_index.md`
- **查找**：先索引 → Glob 按文件名 → Grep 按内容
- **防重复**：同一主题一份活文档，迭代原地更新；冻结存档才带版本后缀；被取代文档头部标 `DEPRECATED → 见 <新路径>` 并在索引注明，不删除
- **外部原件**（docx 等）原地保留只读，工作副本转 Markdown
- **服务器文档**：规范预留，服务器上线后补入（见 spec 第 3 节）

## Memory Rules
- 任务开始前必读 `docs/progress.md` 和 `project_index.md`
- 重大决策写 Memory MCP（实体前缀 `XGS-`）

## Index Maintenance Rules
- 创建/修改/移动文件后更新 `project_index.md`

## Safety Red Line
- 不删除任何文件，除非用户明确批准
- 不读取/打印 `.env` 内容
```

- [ ] **Step 2: 写 `project_index.md`**

```markdown
# XGS 项目文件索引

> 维护规则：创建/修改/移动文件后必须更新本索引。创建新文件前先查本表防重复。

## 根目录
| 路径 | 用途 | 状态 |
|---|---|---|
| `AGENTS.md` | 项目规则总入口（分类规范/Memory/索引/安全红线） | 活文档 |
| `project_index.md` | 本索引 | 活文档 |
| `方案0723.docx` | 平台方案脑暴原始 docx | 只读原件 |
| `.mcp.json` | 项目级 MCP 配置 | 活文档 |
| `.env` | 密钥（GitHub token 等） | 只读，禁打印 |

## docs/
| 路径 | 用途 | 状态 |
|---|---|---|
| `docs/proposals/2026-07-23-platform-proposal.md` | 平台方案脑暴稿（docx 转换版） | 活文档 |
| `docs/specs/2026-07-24-doc-architecture-design.md` | 文档架构设计 spec（已批准） | 活文档 |
| `docs/plans/2026-07-24-doc-architecture-plan.md` | 文档架构落地实施计划 | 活文档 |
| `docs/progress.md` | 进度日志，新条目置顶 | 活文档 |
```

- [ ] **Step 3: 写 `docs/progress.md`**

```markdown
# XGS 进度日志

## 2026-07-24 — 文档架构落地

### ✅ Completed
| 任务 | 详情 |
|---|---|
| 文档架构设计 | spec 获用户批准：docs/specs/2026-07-24-doc-architecture-design.md |
| 方案0723.docx 转换 | 归档为 docs/proposals/2026-07-23-platform-proposal.md |
| 规则三件套 | AGENTS.md / project_index.md / progress.md 建立 |
| git 初始化 | 关联 GitHub 远端，初始提交 |

### ⏳ Next Steps
- [ ] task-master MiniMax-M2.7 全链路实测（memory 中遗留待办）
- [ ] 平台产品文件架构（SDF/Research Object 存储）单独 brainstorm → spec
- [ ] 服务器文档规范待服务器上线后补入 AGENTS.md

### Key Decisions
- 文档管理采用分层落地：工作区先行，服务器预留，产品架构占位
- 规则载体三重保障：AGENTS.md（强制）+ Memory MCP（跨会话）+ project_index.md（活索引）

---
```

- [ ] **Step 4: 移动本计划到 `docs/plans/`**

```bash
cd "E:/Miscellaneous/XGS" && mkdir -p docs/plans && mv docs/superpowers/plans/2026-07-24-doc-architecture-plan.md docs/plans/ && rmdir -p docs/superpowers/plans 2>/dev/null; true
```

- [ ] **Step 5: 验证**

Run: `Read AGENTS.md`、`Read project_index.md`；`Glob docs/**/*.md`
Expected: 三文件内容与 Step 1-3 一致；Glob 结果与索引表完全对应，无遗漏无多余

- [ ] **Step 6: Commit**

```bash
cd "E:/Miscellaneous/XGS" && git add AGENTS.md project_index.md docs/ && git commit -m "docs: 建立文档分类规范与索引（AGENTS.md/project_index/progress）"
```

（同上，git init 未执行则推迟到 Task 3。）

---

### Task 3: Memory MCP 持久化 + git 初始化

**Files:**
- Create: `.gitignore`
- Modify: Memory MCP 知识图谱（新增实体）

**Interfaces:**
- Consumes: Task 1/2 全部产物
- Produces: 跨会话记忆实体 `XGS-Doc-Architecture`；git 仓库与远端关联

- [ ] **Step 1: 写 `.gitignore`**

```
.env
__pycache__/
*.pyc
.taskmaster/
```

- [ ] **Step 2: Memory MCP 登记**

调用 `mcp__memory__create_entities`：

```
name: XGS-Doc-Architecture
entityType: convention
observations:
- 2026-07-24 文档架构落地：docs/{proposals,specs,plans,decisions}/ + docs/progress.md，命名 YYYY-MM-DD-<主题>.md / ADR-NNN
- 规则载体三重保障：AGENTS.md（每会话注入）、project_index.md（活索引，文件操作前必读）、Memory MCP
- 防重复纪律：同主题一份活文档原地迭代；取代旧文档标 DEPRECATED 不删除；docx 原件只读转 md 工作副本
- 服务器文档规范预留；平台 SDF/Research Object 存储架构待单独 brainstorm
```

- [ ] **Step 3: git init 并探测远端变量名**

只列变量名，不显示值：

```bash
cd "E:/Miscellaneous/XGS" && git init && grep -oE '^[A-Za-z_][A-Za-z0-9_]*' .env
```

Expected: 输出含 git 初始化提示；变量名列表中出现 GitHub 仓库地址相关变量（如 `GITHUB_REPO`/`GITHUB_REPO_URL`）与 `GITHUB_TOKEN`

- [ ] **Step 4: 关联远端（不打印 token）**

用 Step 3 发现的实际变量名替换 `<REPO_VAR>`；token 经 URL 注入仅为本次推送，随后立即还原为干净 URL：

```bash
cd "E:/Miscellaneous/XGS" && set -a && source .env && set +a && \
git remote add origin "${<REPO_VAR>}" && \
git -c http.extraHeader="Authorization: Bearer ${GITHUB_TOKEN}" push -u origin main 2>&1 | sed "s/${GITHUB_TOKEN}/***/g" || true
```

若默认分支为 master：`git branch -M main` 后再 push。若 push 因凭证方式失败，退回用 GitHub MCP（`mcp__github__create_repository`/`push_files`，token 已在 MCP env 中）验证仓库连通性，并向用户说明情况。

- [ ] **Step 5: 提交全部产物并推送**

```bash
cd "E:/Miscellaneous/XGS" && git add -A && git commit -m "chore: 项目初始化——文档架构、规则三件套、方案归档" && git push
```

- [ ] **Step 6: 验证**

Run: `git log --oneline`、`git remote -v`（确认 URL 不含 token）、`mcp__memory__open_nodes` 查 `XGS-Doc-Architecture`
Expected: 至少 1 个提交；remote 为干净 URL；memory 实体存在且含 4 条 observations

---

## Self-Review 记录

- **Spec 覆盖**：spec 第 5 节 6 个落地步骤 → Task 1（步骤 1-2）、Task 2（步骤 3-5）、Task 3（步骤 6）全覆盖 ✓
- **占位符扫描**：无 TBD/TODO；Step 4 的 `<REPO_VAR>` 是运行时探测值，已在 Step 3 给出探测方法 ✓
- **一致性**：索引表路径与 Global Constraints 命名规范一致；`docs/plans/` 为 spec 外新增目录，已在 Task 2 Step 4 显式建立并登记索引 ✓
