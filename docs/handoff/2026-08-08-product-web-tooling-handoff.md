# Handoff — 2026-08-08 Product Web Tooling

- **Current goal:** 在执行产品级网页计划前完成 Codex MCP 加载、双 Figma OAuth 和长期账号设计稿迁移准备。
- **Done:**
  - 产品设计 spec：`docs/specs/2026-08-08-openscience-product-web-design.md`。
  - 实施计划：`docs/plans/2026-08-08-openscience-product-web-plan.md`，用户选择 subagent-driven，但要求前置工具齐全后再执行。
  - 项目 `.mcp.json` 与 Codex `C:/Users/Mac/.codex/config.toml` 均配置 10 个 MCP：semantic-scholar、github、mermaid、memory、context7、tavily-search、figma-temp、figma-primary、shadcn、task-master-ai。
  - 两个 Figma MCP 通过不同 profile header 隔离 OAuth 缓存；账号密码仅存本地 `.env`，不得读取、打印或写入 Git。
  - 账号迁移决策：`docs/decisions/ADR-004-figma-account-ownership-and-migration.md`。
- **Constraints:** 不打印 `.env`；Figma 密码不用于 MCP 自动登录；OAuth 必须浏览器交互；MCP 总数保持 ≤10；任务实现暂未启动。
- **Open risks:** 当前会话启动时 `config.toml` 尚无 MCP，故工具清单仍未刷新；GitHub token 未出现在当前进程环境；Figma 双 OAuth 尚未完成；Playwright 尚未作为项目依赖锁定。
- **Next action:** 重启 Codex → 检查实际 MCP 工具清单 → 分别认证 `figma-temp` 与 `figma-primary` → 验证账号身份不串号 → 再执行计划 Task 1。
- **Read first:** `AGENTS.md` → `docs/OpenScience_Kimi_Development_Spec.md` → `docs/progress.md` → `project_index.md` → product web spec/plan → ADR-004 → 本 handoff。
