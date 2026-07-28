# ADR-001 目标架构：从 Scholars Tea 选择性抽取，按 Baseline 重建 OpenScience 平台底座

- 状态：Accepted（2026-07-28 用户确认）
- 日期：2026-07-28
- 决策者：用户 + Kimi Code
- 关联：`docs/CODEBASE_AUDIT.md`、`docs/OpenScience_Kimi_Development_Spec.md`、`docs/decisions/ADR-002-agent-tooling-portability.md`

## Context

Phase 0 只读审计完成。Scholars Tea 具备真实运行痕迹与可复用模块，但也存在密钥/运行态文件入 git、上传与 groups 接口无鉴权、Prisma 空 baseline、Prisma 与 socket 裸 SQL 双轨、Hermes 调用重复、部署脚本蔓延等问题。OpenScience Baseline v1.0 要求先审计再架构决策，禁止在没有迁移计划时重写全部系统。

同时，用户已确认 AI 路由主模型为 MiniMax-M3；回退/兜底策略不得写死，必须由 AI Gateway 配置管理。

## Decision

1. **总体策略：选择性抽取，不整体继承。** Scholars Tea 作为模块供应库与风险样本；OpenScience 按 Baseline §14 的目标 Monorepo 重建平台底座。

2. **目标运行架构。** 首版采用单阿里云 ECS 的隔离拓扑：Nginx/Caddy → Web(Next.js) / API(Node.js/Fastify) / Agent Worker；PostgreSQL + Redis + S3 兼容对象存储；Sandbox Controller 与临时 Python Sandbox 独立网络。数据库不进公网，Sandbox 不加入 data_net。

3. **代码结构。** 采用 `apps/` + `packages/` + `infra/`：
   - `apps/web`：Next.js 工作台、公开 RO 页、协作区；
   - `apps/api`：模块化 REST/JSON API，长任务走任务 ID + SSE/WebSocket；
   - `apps/agent-worker`：Hermes 异步任务；
   - `apps/science-worker` / `apps/sandbox-controller`：Python 检查与沙箱调度；
   - `packages/domain|database|auth|sdf-schema|versioning|storage|ai-gateway|search|ui|config|observability`。

4. **可抽取模块。** 从 Scholars Tea 迁移/借鉴：统一 API 响应与错误码、认证验证码流（防枚举/限流/冷却）、服务层 route→service 边界、`tool-call-guard`、RAG/引用校验/外部论文检索经验、Prisma 社区/学术资产建模经验。

5. **必须重建模块。** 上传（Storage Adapter + 分片/校验/MIME/病毒扫描/配额）、AI Gateway（Provider SDK 收口，MiniMax-M3 主模型，回退配置化）、发布与版本（不可变公开版本 + Blob/Artifact/Manifest）、迁移体系（基线快照 + 全部 migrate）、协作模型（Branch/Fork/PR/Review/Merge）、Hermes 审批（R0-R4）。

6. **数据迁移策略。** 不从 Scholars Tea 直接在线搬库进入 MVP。第一阶段只建立映射文档与只读导出脚本：User/Group/Publication/Citation/Comment → Workspace/RO/Contribution/Citation/Comment；普通帖子、Top Questions、Tea Party 标记 Phase 2。任何历史数据导入必须在 OpenScience schema 稳定后，经脱敏快照与回放验证。

7. **安全门禁。** 在复用 Scholars Tea 任何 Hermes/部署配置前，必须完成：轮换已入 git 的凭据；将 `.env.postgres`、Hermes 配置/state/backup 移出版本控制；评估 git 历史清理；修补 groups/upload 鉴权缺口或明确不复用对应代码。

8. **AI 路由。** 所有模型调用仅经 `packages/ai-gateway`；主模型 MiniMax-M3；回退策略、模型 ID、价格与结构化输出参数放入运行配置/后续 ADR，不在业务代码写死；Gateway 记录模型、版本、token、费用、延迟、错误与回退原因。

9. **测试与验收门禁。** Phase 1A 起 CI 至少包含 lint、typecheck、unit、prisma validate/migrate check、build；部署前必须有 `prisma migrate deploy` 或明确补偿步骤；E2E 不得直连生产地址。

## Consequences

正面影响：

- 避免把 Scholars Tea 的密钥泄露、双 DB 栈、空迁移和部署蔓延带入 OpenScience。
- 保留认证、服务层、AI 安全闸等高价值资产，降低 MVP 开发量。
- 与 Baseline 的 RO/SDF/版本/协作/Hermes 目标保持一致。

成本与约束：

- 需要重写上传、AI Gateway、版本/发布与协作底座，短期工作量高于直接改造 Scholars Tea。
- 历史数据迁移被延后到 schema 稳定之后，MVP 邀请测试不承诺导入旧社区数据。
- Scholars Tea 的密钥轮换与 git 清理是前置安全任务，可能影响其现有部署。

## Follow-ups

- 用户确认本 ADR 后，把 task-master 任务 1 标记 done，并进入 Phase 1A 子任务展开。
- Phase 1A 首批工程任务：root pnpm workspace、Auth/Workspace/RBAC、Prisma 基线迁移、Storage Adapter、统一错误/审计、AI Credit 骨架、CI/CD。
- Phase 1A 工具门禁按 ADR-002 落地：`docs:lint`、`audit:*`、`docs:sync-check`。
- 另建安全任务：Scholars Tea 凭据轮换与 git 跟踪清理（需用户批准后执行）。

## Alternatives Considered

- **直接在 Scholars Tea 上改造成 OpenScience**：拒绝。会继承密钥泄露、空迁移、双 DB 栈、上传无鉴权、Hermes 单点和 Phase 2 社区功能，违背 Baseline 的 MVP 边界。
- **完全重写且不参考 Scholars Tea**：拒绝。会浪费认证、服务层、AI 安全闸和领域建模经验。
- **保留 Python Hermes Gateway 作为 MVP 主路径**：暂缓/拒绝。它与 OpenScience 的统一 AI Gateway、权限审批、可观测性和 MiniMax-M3 主模型基线不一致；可作为参考实现保留在审计材料中。
