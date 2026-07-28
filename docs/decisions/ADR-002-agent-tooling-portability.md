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
- 必须长期使用的 Node 工具，放入 root `package.json` 的 `devDependencies`，通过 npm scripts 调用，并提交 lockfile。
- Python 工具优先 `uvx` 或项目 `.venv`；不使用用户级 `uv tool install` 作为项目依赖入口。
- MCP 工具优先项目级 `.mcp.json`；密钥只允许来自本机 `.env` 或服务器 Secret，仓库只提交 `.env.example` / 配置模板。
- 工具生成物、规则、任务、记忆、文档默认入库；无法入库的本地状态必须写入 `.gitignore` 并在 `infra/README.md` 或 runbook 说明。
- 新增/移除工具能力必须更新 `project_index.md`；影响开发流程的必须更新 `AGENTS.md` 或新增 ADR。

### 3. 不引入重叠任务/规格事实源

现阶段不引入 Backlog.md、Beads、OpenSpec、Spec Kit、BMAD 作为项目主流程；它们与现有 `docs/specs|plans|decisions + task-master + progress + Memory` 重叠。若未来引入，必须先写 ADR 说明替代关系和迁移路径。

### 4. 代码审计/重构工具候选

按阶段引入，不在 `src/` 为空时提前安装：

- 语义级 agent 工具：Serena（符号级检索/编辑/重构；有真实代码后评估项目内配置）。
- 结构搜索/重写：ast-grep（TS/JS AST pattern、YAML 规则、JSON/SARIF 输出）。
- 安全/规则扫描：Semgrep CE（本地规则扫描，规则入库；优先 `uvx`/CI，可选 MCP）。
- 架构边界：dependency-cruiser（循环依赖、跨层依赖、依赖图；配合 architecture-guard）。
- 死代码/依赖 hygiene：Knip（unused files/exports/dependencies；先 baseline，再进 CI）。
- 重复代码：jscpd v5（重复块检测；优先 AI reporter/低 token 输出）。
- Monorepo 依赖一致性：syncpack（`packages/` 出现后）。
- 暂缓：OpenRewrite（TS recipes 运行可能依赖 Moderne）、Sourcegraph/CodeScene（后期可选平台/MCP，不作 MVP 基础）。

### 5. 文档自动维护工具候选

- Markdown 门禁：markdownlint-cli2（devDependency）。
- 链接检查：lychee（优先 CI/Docker/pre-commit，不要求本地全局安装）。
- 文风检查：Vale（可选；英文规则先行，中文规则后补）。
- TS API 文档：TypeDoc + typedoc-plugin-markdown，输出到 `docs/api/`。
- API 合同文档：Fastify route schema 生成 OpenAPI（如 `@fastify/swagger`），禁止手写 API 文档与实现漂移。
- Monorepo 版本与 changelog：Changesets（`packages/` 出现后）。
- 依赖更新：Renovate 或 Dependabot（仓库配置文件驱动，不本地全局安装）。
- 项目自定义漂移检查：Phase 1A 增加 `scripts/docs/check-docs-sync.mjs`，校验 `project_index.md` 路径存在、文档命名规范、ADR/progress/task 状态一致性。

### 6. AI Gateway 模型事实

- 主模型：MiniMax-M3。
- 回退/兜底策略：由 `packages/ai-gateway` 的运行配置管理；任何文档、skill、task 不得把未确认的回退模型写死。
- Provider SDK 只允许存在于 `packages/ai-gateway`；业务代码不得散落 Provider SDK 或密钥调用。

## Consequences

正面影响：

- 迁移电脑时，只要 clone 仓库、配置本机 `.env`、安装项目依赖，即可恢复大部分 agent 工作上下文。
- 降低多 agent 之间的认知漂移和重复实现。
- 把“记得更新文档”部分转化为可运行检查。

成本与约束：

- Phase 1A 需要先建立 root `package.json`/pnpm workspace，才能把 Node 工具纳入 devDependencies。
- 部分工具（Serena、Semgrep MCP、CodeScene、Sourcegraph）需要后续单独评估安全边界与密钥/Token。
- 文档自动维护不能替代人工判断；`docs/progress.md`、ADR 和重大 Memory 仍需人工/agent 主动写。

## Follow-ups

- Phase 0：继续只读审计，不安装上述工具。
- Phase 1A：初始化 pnpm workspace 时新增工具 scripts：`docs:lint`、`audit:deps`、`audit:dead`、`audit:dup`、`audit:ast`、`docs:sync-check`。
- Phase 1B/1C：评估 TypeDoc、OpenAPI、Changesets、Renovate。
- Phase 1D/1E：评估 Serena MCP、Semgrep MCP、CodeScene/Sourcegraph 是否进入项目级 `.mcp.json`。

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
