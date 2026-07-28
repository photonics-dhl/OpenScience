---
name: repo-map
description: "Use when entering the repo for the first time, running a read-only codebase audit (Phase 0), or needing a directory/dependency/service/data map. Do NOT use for editing code or refactoring — this skill is strictly read-only."
---

# Repo Map — 只读扫描与代码库地图

建立目录、依赖、服务、数据库、环境变量、部署和测试的地图，产出可引用的架构事实。所有结论必须引用具体文件路径或运行证据（Spec §25）。

## 何时使用 / 何时不使用

- **使用**：首次进入仓库；Phase 0 只读审计；需要回答"某个模块/依赖/服务在哪里"；查找与 Hermes、AI Workshop、认证、上传、社区、WebSocket、模型路由有关的现有模块（Spec §25）。
- **不使用**：任何修改代码、重构、搬动文件的场景。审计期间不修改业务代码（Spec §25 第 5 条）。

## 检查清单

1. **查找顺序固定**：先查 `project_index.md` 索引 → 再 Glob 按文件名 → 最后 Grep 按内容（AGENTS.md 文档操作规则）。
2. **只读**：扫描过程不修改、不移动、不删除任何文件；业务代码保持原样（Spec §25）。
3. **禁大范围递归读取**：不得对 `node_modules`、构建产物、`.git` 做全量递归读取；大范围扫描用带锚点的 Glob/Grep 限定子路径（Spec §20.2 codebase-explorer 职责：只读扫描）。
4. **禁碰密钥**：不读取、不打印 `.env` 内容；只记录"存在哪些环境变量键"，不记录值（AGENTS.md 安全红线；Spec §17 密钥不进入仓库/上下文）。
5. **分类输出**：找到的模块按"保留 / 局部重构 / 替换 / 待确认"分类（Spec §25 第 3 条）。
6. **风险标记**：标记安全风险、重复实现、失效功能和数据迁移风险（Spec §25 第 4 条）。
7. **证据要求**：每条结论必须附具体文件路径或命令运行证据，禁止凭猜测描述结构（Spec §25 第 7 条）。
8. **产出物**：审计完成输出 `docs/CODEBASE_AUDIT.md` 和 `docs/adr/0001-target-architecture.md` 草案；审计经用户确认后才进入 Phase 1A（Spec §25）。

## 产出格式建议

- 目录地图：树状结构 + 每个顶层目录一句职责说明；
- 依赖地图：包管理清单文件路径 + 关键依赖用途；
- 服务地图：进程/端口/数据存储的对应关系；
- 数据地图：数据库、对象存储、缓存各存什么。
