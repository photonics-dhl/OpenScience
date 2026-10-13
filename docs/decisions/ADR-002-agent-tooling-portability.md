# ADR-002 Agent 工具能力与可迁移性

- 状态：Accepted
- 日期：2026-07-28
- 决策者：用户 + Kimi Code
- 编号说明：ADR-001 预留给 Phase 0 目标架构决策；本 ADR 先固化工具可迁移性规则，避免后续 session/电脑迁移时误装全局工具或引入重叠事实源。

## Context

OpenScience 采用多 agent、多 session 协作，且用户明确要求：后续可能迁移到其他电脑开发，本项目工具能力不要配置为全局，尽量安装/记录在项目内。当前仓库已有可迁移骨干：`AGENTS.md`、`docs/` 分类规范、`project_index.md`、`docs/progress.md`、`.taskmaster/`、`.memory/memory.jsonl`、`.agents/skills/`、项目级 `.mcp.json`。

2026-07-28 工具调研结论：继续复用现有骨干，不新增重型 agent 框架；只补充两类能力：

1. 代码审计/重构工具，尤其适配大型 TS/Monorepo 项目；
2. 文档自动维护工具，降低认知漂移、坏链、API 文档漂移和技术债。

同时，用户已纠正首版 AI 路由主模型为 **MiniMax-M3**；回退/兜底策略不另行写死，必须由 AI Gateway 配置管理。

## Decision

### 1. 统一事实源优先级

2026-09-14修订：此前的线性阅读顺序会把历史阶段当作当前任务。实际状态先由Git工作树/分支、唯一CURRENT handoff和授权范围内的真实release/任务结果定锚；需求按最新用户纠正及基线相关章节。只在有明确关联时读取task-master或历史计划，不默认载入全部记忆。

能力复用采用现有[Hermes能力台账](../runbooks/hermes-capability-registry.md)当前索引：产品目的 → 实现/调用方 → 实际任务效果 → 缺口。2026-09-14用户随后明确要求实际完成底层工具，取代此前“仅借鉴、不安装”的阶段决定：独立 Backstage 标准目录 API、Serena 只读 MCP、Langfuse Gateway 元数据观测及 Vercel Skills CLI 位于 `infra/development-platform/`；模块图复用已有 dependency-cruiser，资源运维复用 Portainer/Netdata。它们不替代需求基线、CURRENT 或任务/资产原始记录，不增加另一套规格/任务库。

Skill市场管理包，源码工具定位实现和调用，运行日志说明已发生的执行；科学与审美效果由产物及审阅说明。按 architecture-guard 的具体问题选择工具，不强制每次全跑。独立服务有独立 lock、版本化安装和私有状态，复用已有基础镜像；不把其依赖塞入业务应用或全局安装。Codex 项目入口用 `.codex/config.toml` 和现有 SSH 私有转发，运行时没有写代码/部署权限。不把开发工具自动暴露给面向科研用户的 Hermes。

以下原阅读清单保留为历史背景，现行操作顺序以以上修订、AGENTS和docs-sync为准。

任何 agent 进入项目后，按以下顺序对齐认识：

1. `AGENTS.md`
2. `docs/OpenScience_Kimi_Development_Spec.md`
3. `project_index.md`
4. `docs/progress.md`
5. 当前任务：`.taskmaster/tasks/tasks.json` / task-master MCP
6. 重大决策：`.memory/memory.jsonl` 与 `docs/decisions/`

禁止用聊天记忆、文件名或旧方案覆盖上述事实源。

### 2. 工具安装与迁移原则

- 能 `npx` / `pnpm exec` / `uvx` 一次性运行的工具，不全局安装。
- 仓库内 Node 分析工具放 root `devDependencies`；独立服务器管理服务放 `infra/development-platform/<tool>/` 的独立 manifest/lock，避免业务依赖耦合。两者都提交锁文件。
- Python 工具优先 `uvx` 或项目 `.venv`；不使用用户级 `uv tool install` 作为项目依赖入口。
- MCP 工具采用对应客户端的项目配置（Codex 为 `.codex/config.toml`，其他客户端沿用 `.mcp.json`）；密钥只来自本机配置或服务器 Secret，仓库不含真实值。
- 工具生成物、规则、任务、记忆、文档默认入库；无法入库的本地状态必须写入 `.gitignore` 并在 `infra/README.md` 或 runbook 说明。
- 新增/移除工具能力必须更新 `project_index.md`；影响开发流程的必须更新 `AGENTS.md` 或新增 ADR。

### 3. 不引入重叠任务/规格事实源

现阶段不引入 Backlog.md、Beads、OpenSpec、Spec Kit、BMAD 作为项目主流程；它们与现有 `docs/specs|plans|decisions + task-master + progress + Memory` 重叠。若未来引入，必须先写 ADR 说明替代关系和迁移路径。

### 4. 已有代码与文档维护能力

以根 package.json / lockfile 和 infra/development-platform 的实际配置为准：

| 问题 | 已有入口 | 边界 |
|---|---|---|
| 死代码/无用依赖 | Knip / audit:knip | 是现有分析能力；发现仍须确认动态调用，不能直接删除 |
| 跨包依赖 | dependency-cruiser / audit:dep；只读 module-graph.sh | 图定位影响范围，不能代表完整动态调用 |
| 重复实现 | jscpd / audit:dup | 字面相似不等于职责相同，先核业务语义 |
| 依赖版本一致性 | syncpack / audit:deps | manifest 一致不等于功能合格 |
| 格式/索引 | markdownlint-cli2、现有 docs-sync 脚本与 Skill | 格式检查不判断内容真伪；audit:docs-sync 含测试 |
| 当前规则/需求/执行 | AGENTS、基线、唯一 CURRENT、能力台账 | 主代理随实际改动同步，不能由日志或旧任务库自动推断 |
| API 描述 | apps/api/src/routes/research-record-schema.ts 与 research-record.ts | 现有公开接口已有 OpenAPI；改端点时同步现有定义，不另手写一套 |

这些工具已经存在，不需因本轮治理再次安装。按当前用户要求不运行测试/预检/全仓扫描，不新增哈希、基线、门禁或 CI；有具体重大风险/阻塞故障才在允许范围定向核对。旧“先 baseline，再进 CI”的候选建议不是当前执行要求。

### 5. 暂未采用的工具

ast-grep、Semgrep、lychee、Vale、TypeDoc、Changesets、CodeScene/Sourcegraph 等保留为过去调研候选；候选不等于已安装或待办。先指出现有工具无法解决的具体缺口及替代范围，再考虑新安装。现阶段无需另一套任务/规格系统。

### 6. AI Gateway 模型事实

- 主模型：MiniMax-M3。
- 回退/兜底策略：由 `packages/ai-gateway` 的运行配置管理；任何文档、skill、task 不得把未确认的回退模型写死。
- Provider SDK 只允许存在于 `packages/ai-gateway`；业务代码不得散落 Provider SDK 或密钥调用。

### 7. 架构工程职责与 Skill 选型（2026-10-13）

用户指定本会话承担本项目的架构搭建、审查与维护。架构工程工作从实际产品目标出发：明确模块、接口、数据与服务边界；审查权限、并发、迁移和应用/原生 Hermes/媒体执行器的兼容及回退；维护既有 ADR、能力台账和运维手册。执行状态仍由总控单写 CURRENT/progress/index，具体安装、生产操作和模型请求沿已有授权范围。

| 工作 | 优先复用的项目 Skill | 交付依据 |
|---|---|---|
| 产品开发与架构搭建 | `repo-map`、`architecture-guard`、`api-contract`、`frontend-design`；有设计分歧时才用 `brainstorming` / `writing-plans` | 当前需求、源码入口与真实调用方；UI 沿已有产品设计 |
| 架构审查与维护 | `requesting-code-review`、`security-review`、`database-migration`、`verification-before-completion`、`docs-sync` | 高风险新增差异独立 High 审查；复用未变实现的有效证据 |
| 服务器运维 | `infra-runbook`；故障时用 `systematic-debugging` | 既有 server-capabilities、deployment、backup-restore、monitoring / incident 手册 |

通过 `find-skills` 流程、skills.sh 公共搜索与上游仓库读取完成候选发现。2026-10-13 用户随后明确授权项目级安装：四项官方 Skill 已原文安装到交付树 `.agents/skills/`，完整来源版本与许可说明见各 `SOURCE.md`；项目 frontend-design/database-migration/infra-runbook 按需引用，供 Codex 开发和审查，未注入产品 Hermes。社区 architecture-patterns 仍为未安装参考。市场安装量和仓库星数只辅助发现，采用须核对版本与项目边界。

| 来源与候选 | 适用缺口 | 本项目采用条件 |
|---|---|---|
| Vercel 官方 [vercel-react-best-practices](https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices) / [原始 Skill](https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/SKILL.md) | React/Next.js 数据请求瀑布、包体和渲染性能 | 当前 manifest 为 React 18.3.1 / Next 14.2.35；React 19、Next 15+ 专属 API 不直接套用，也不因 Skill 升级框架 |
| Supabase 官方 [supabase-postgres-best-practices](https://skills.sh/supabase/agent-skills/supabase-postgres-best-practices) / [原始 Skill](https://github.com/supabase/agent-skills/blob/main/skills/supabase-postgres-best-practices/SKILL.md) | PostgreSQL 查询、索引、连接、锁与 Schema 性能 | 适配项目 PostgreSQL 16 和既有迁移 CLI；按需选通用规则，供应商专属项另核，不更换现有数据库/认证方案 |
| Docker 官方 [docker-build-strategies](https://github.com/docker/skills/blob/main/skills/docker-build-strategies/SKILL.md) / [docker-compose-patterns](https://github.com/docker/skills/blob/main/skills/docker-compose-patterns/SKILL.md) | 镜像构建、Compose 服务依赖、网络与卷配置 | 新官方条目使用量仍较少；手册记录的 legacy builder 不证明支持 BuildKit/buildx，先核具体功能；不得套用排除所有 Markdown 的示例而漏掉 Hermes Skill/科学参考；复用现有隔离网络、SSH 入口与发布/回退脚本 |
| 社区 [wshobson/agents 的 architecture-patterns](https://skills.sh/wshobson/agents/architecture-patterns) / [原始 Skill](https://github.com/wshobson/agents/blob/main/plugins/backend-development/skills/architecture-patterns/SKILL.md) | 领域边界、依赖循环、端口/适配器的局部设计 | Python 示例需转换为实际 TS/现有领域结构；不为匹配模板搬目录、拆微服务或替代项目 `architecture-guard` |

已有 Backstage、Serena、dependency-cruiser、Langfuse 和 Portainer/Netdata 按具体问题复用，入口及运行边界见 [服务器能力清单](../runbooks/server-capabilities.md)。本次只新增上述四项官方开发 Skill，不新增工具平台、门禁、任务库或生产变更。后续架构债务沿 [既有台账](../runbooks/hermes-capability-registry.md#当前技术债与处理) 在相关开发前读取并原地闭合，安装成功不等于产品运行或科学质量合格。

## Consequences

2026-10-13补充：跨项目可复用流程见[架构维护Prompt](../runbooks/architecture-maintenance-prompt.md)。每次只读取涉及模块的原债务行，修复、部署、运行观察和用户验收分别记录；服务器调查与说明图使用同一实测数据，原始临时收据保持私有。技术债继续进入既有能力台账，既有组件先核真实调用方再退役，不加另一套维护平台或自动任务。

正面影响：

- 迁移电脑时，只要 clone 仓库、配置本机 `.env`、安装项目依赖，即可恢复大部分 agent 工作上下文。
- 降低多 agent 之间的认知漂移和重复实现。
- 把“记得更新文档”部分转化为可运行检查。

成本与约束：

- 工具和文档本身需要维护；新依赖会增加升级、权限和状态成本，不能把安装数量当治理完成。
- Serena 等已交付服务的边界见能力台账；未采用工具需要另行评估，不能恢复旧候选列表自动安装。
- 文档自动维护不能替代人工判断；`docs/progress.md`、ADR 和重大 Memory 仍需人工/agent 主动写。

## Follow-ups

- 当前任务及未解决债务只跟随 CURRENT handoff 和能力台账，不恢复 Phase 0/1 安装路线。
- 2026-09-14 用户要求新开发前清理已识别重复、统一文档：修改规则必须落到实际交付分支；旧主目录只保留导航。历史记录保留且标明适用性，不删除原件。
- 每次改动沿“当前需求 → 已有调用 → 本次差异 → 实际结果/未决项”闭合，修改同一份文档，不另建评分/审批体系。

## References

- AGENTS.md 标准：https://agents.md/
- Task Master：https://github.com/eyaltoledano/claude-task-master
- Serena：https://github.com/oraios/serena
- ast-grep：https://github.com/ast-grep/ast-grep
- Semgrep：https://github.com/semgrep/semgrep
- dependency-cruiser：https://github.com/sverweij/dependency-cruiser
- Knip：https://knip.dev/
- jscpd：https://github.com/kucherenko/jscpd
- syncpack：https://github.com/JamieMason/syncpack
- markdownlint-cli2：https://github.com/DavidAnson/markdownlint-cli2
- lychee：https://github.com/lycheeverse/lychee
- Vale：https://github.com/errata-ai/vale
- TypeDoc：https://github.com/TypeStrong/typedoc
- typedoc-plugin-markdown：https://typedoc-plugin-markdown.org/docs
- Changesets：https://github.com/changesets/changesets

## 2026-07-28 落地记录

本节仅是当时的工具与检查记录；Serena等后续安装和今日依赖图/运行事实查能力台账，不据旧“未安装/零命中”安排重复安装或认定当前架构合格。

基线提交 `ce9da28` 后按本 ADR §4/§5 落地最小工具集（均为 root devDependencies，lockfile 入库）：

- ESLint 9 + `@eslint/js` + `typescript-eslint`：`eslint.config.cjs` 升级为真正 flat config（js/ts recommended + 少量带注释的窄域豁免），`lint` = ESLint 全仓检查 + 结构校验，exit 0。
- knip（`audit:knip`）、dependency-cruiser（`audit:dep`，禁循环依赖/跨包相对深引用，orphan 暂 warn）、jscpd（`audit:dup`）、syncpack（`audit:deps`，v15 用 `syncpack lint` 取代已废弃的 `list-mismatches`）、markdownlint-cli2（`docs:lint`，保留结构规则、豁免排版风格规则）。
- 基线结论：0 重复代码块、0 依赖版本不一致、0 依赖错误；knip/depcruise 仅占位包预期噪声。
- Serena / Semgrep MCP / ast-grep / lychee / Vale / TypeDoc / Changesets 等仍按 §4/§5 阶段后期评估，未安装。
