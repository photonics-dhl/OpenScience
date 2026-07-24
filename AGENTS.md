# OpenScience (XGS) 项目

## Overview
OpenScience：AI 时代科研基础设施平台（Research Object / SDF / 预印本 + 社区评价）。工作目录 `E:/Miscellaneous/XGS`。

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

登记例外：`docs/OpenScience_Kimi_Development_Spec.md`（需求基线，原地保留）。

## 文档操作规则
- **创建前**：先查 `project_index.md`，确认无同功能文件
- **创建后**：按类型入目录、按规范命名、登记 `project_index.md`
- **查找**：先索引 → Glob 按文件名 → Grep 按内容
- **防重复**：同一主题一份活文档，迭代原地更新；冻结存档才带版本后缀；被取代文档头部标 `DEPRECATED → 见 <新路径>` 并在索引注明，不删除
- **外部原件**（docx/zip 等）原地保留只读，工作副本用 Markdown
- **多 session 协作**：其他工具（如 Cursor）在本目录产出的文件，先登记索引再使用；移动/改名需用户批准
- **服务器文档**：规范预留，服务器上线后补入（见 docs/specs/2026-07-24-doc-architecture-design.md 第 3 节）

## Memory Rules
- 任务开始前必读 `docs/OpenScience_Kimi_Development_Spec.md`、`docs/progress.md` 和 `project_index.md`
- 重大决策写 Memory MCP（实体前缀 `XGS-`）

## Index Maintenance Rules
- 创建/修改/移动文件后更新 `project_index.md`

## Safety Red Line
- 不删除任何文件，除非用户明确批准
- 不读取/打印 `.env` 内容
