# OpenScience (XGS) 进度日志

## 2026-07-24 — Memory 存储迁移 + git 推送打通

### ✅ Completed
| 任务 | 详情 |
|---|---|
| git push 打通 | 全权限 token（.env GITHUB_TOKEN_FULL_PERMISSION）推送 main 成功；原 GITHUB_TOKEN 确认为只读 |
| Memory 存储迁移 | .mcp.json 增加 MEMORY_FILE_PATH=.memory/memory.jsonl；8 个实体从 npx 缓存迁移完成，重启 session 生效 |

### ⏳ Next Steps
- [ ] 重启 session 后验证 memory 从新路径加载（read_graph 应有 8 实体）

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
