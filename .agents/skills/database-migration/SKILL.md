---
name: database-migration
description: "Use when writing, reviewing, or applying any database schema migration or deciding what belongs in the database vs object storage. Do NOT use for read-only queries or seed data scripts."
---

# Database Migration — 数据库迁移规范

迁移必须可部署、可回滚，且数据库职责边界清晰（只存元数据）。

## 何时使用 / 何时不使用

- **使用**：新增/修改表结构；写迁移脚本；评审迁移 PR；决定新数据存数据库还是对象存储。
- **不使用**：纯查询、只读报表、与 schema 无关的应用代码。

## 检查清单

1. **向前可部署**：迁移必须与旧版应用代码兼容（先加后删：先 expand 后 contract），部署中途新旧代码共存不炸（Spec §15 末段）。
2. **可回滚或有补偿步骤**：每个迁移必须有明确回滚脚本，或写明不可逆时的补偿步骤（Spec §15："数据库迁移必须向前可部署、可回滚或有明确补偿步骤"）。
3. **生产禁自动破坏性迁移**：删列、改类型、删表等破坏性迁移禁止在生产自动执行；必须人工确认 + 备份验证后运行（Spec §15："生产环境禁止自动执行破坏性迁移"；权限分级见 §20.5：数据库迁移属"询问"级）。
4. **数据库只存元数据**：大型二进制（PDF、图片、Artifact 内容）不得入数据库；数据库只保存元数据和对象键，二进制走 Storage Adapter（Spec §13.1）。
5. **实体覆盖**：新实体设计对照 Spec §15 核心实体清单（User、Workspace、ResearchObject、SDFDocument、Branch、Commit、Version、Publication、Issue、PullRequest、Review、AgentSession、SandboxJob、UsageLedger、AuditLog 等），不得私自发明与既有实体重复的表。
6. **迁移文件归位**：迁移脚本放 `infra/migrations/`（Spec §14.1 Monorepo 结构）。
7. **迁移检查不得跳过**：验收前必须实际运行迁移与回滚验证，禁止"跳过迁移检查"（Spec §20.1-7）。

## 评审迁移 PR 时必问

- 回滚脚本跑过吗？输出是什么？
- 破坏性变更的补偿步骤写在哪？
- 新列是否可空/有默认值，旧代码会不会写入失败？
- 大二进制有没有被存进数据库？（应为对象键 + Storage Adapter，§13.1）
