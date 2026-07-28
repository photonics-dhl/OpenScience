---
name: architecture-guard
description: "Use before modifying code that touches module boundaries, AI/Provider SDK calls, or the monorepo layout. Do NOT use for pure content/documentation edits that don't change code structure."
---

# Architecture Guard — 架构边界守卫

改代码前核对模块边界与系统架构约束，防止边界腐蚀。架构事实来源：Spec §14（系统架构）、§9.3（AI 路由）。

## 何时使用 / 何时不使用

- **使用**：新增/移动模块；新增对外部服务（AI 模型、存储、队列）的调用；改变 apps/ 与 packages/ 之间依赖方向；写任何调用模型 Provider 的代码。
- **不使用**：纯文档、文案、样式微调等不触碰模块边界的修改。

## 检查清单

### Monorepo 边界（Spec §14.1）

1. **应用归位**：可运行服务放 `apps/`（web、api、agent-worker、science-worker、sandbox-controller）；可复用领域逻辑放 `packages/`（domain、database、auth、sdf-schema、versioning、storage、ai-gateway、search、ui、config、observability）；基础设施放 `infra/`（compose、nginx、sandbox、scripts、migrations）。
2. **依赖方向**：`apps/` 可依赖 `packages/`，`packages/` 之间按领域分层依赖；禁止 app 之间互相 import 内部实现。
3. **不为目录示例搬动稳定代码**：Spec §14.1 的目录树是参考示例，"具体目录必须在现有代码审计后调整；禁止为了匹配此示例而无理由搬动稳定代码"（Spec §14.1 末段）。调整目录结构前必须先有代码审计结论（配合 repo-map skill）。

### AI 调用边界（Spec §9.3）

4. **统一 AI Gateway**：所有模型调用必须经统一 AI Gateway（packages/ai-gateway）；主模型为 MiniMax-M3，回退/兜底策略在 Gateway 内配置实现，不在业务代码写死。
5. **Provider SDK 不得散落业务代码**：业务代码中不得直接 import 模型 Provider SDK 或直接持有 Provider API Key 调用；发现散落的 SDK 调用必须标记并收口到 Gateway（Spec §9.3）。
6. **长任务异步**：AI 长任务必须异步执行（任务 ID + 进度通道），不得用同步 HTTP 请求硬等（Spec §9.3；API 形态见 §16）。
7. **输出校验**：模型 JSON 输出必须经 Schema 校验，失败时有限重试（Spec §9.3）。

### 通用约束

8. **重大架构决定写 ADR**：每个重大架构决定写入 `docs/adr/`（Spec §20.1-8；本项目 ADR 放 `docs/decisions/`，命名 `ADR-NNN-<主题>.md`，见 AGENTS.md 分类规范）。
9. **修改前列风险**：修改前列出受影响文件和风险（Spec §20.1-5）。
