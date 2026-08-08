# Handoff — 2026-08-08 Product Web Tooling

- **Current goal:** 在执行产品级网页计划前完成 Codex MCP 加载、双 Figma OAuth 和长期账号设计稿迁移准备。
- **Done:**
  - 产品设计 spec：`docs/specs/2026-08-08-openscience-product-web-design.md`。
  - 实施计划：`docs/plans/2026-08-08-openscience-product-web-plan.md`，用户选择 subagent-driven，但要求前置工具齐全后再执行。
  - 项目 `.mcp.json` 与 Codex `C:/Users/Mac/.codex/config.toml` 均配置 10 个 MCP：semantic-scholar、github、mermaid、memory、context7、tavily-search、figma-temp、figma-primary、shadcn、task-master-ai。
  - 当前会话实际加载 7/10 个 server：context7、github、memory、semantic-scholar、shadcn、task-master-ai、tavily-search；Memory 旧 JSONL schema 已无删除修复，并写入两条 `XGS-` 产品设计索引。
  - Mermaid 已通过独立 MCP 握手列出 `generate_mermaid_diagram`，npm 缓存已预热，等待下次 Codex 重载。
  - Figma 已按官方 Codex 接法改为两个原生远程 URL server（`figma-temp`、`figma-primary`）；`mcp-remote` 在动态客户端注册阶段持续 403，已停用。账号密码仅存本地 `.env`，不得读取、打印或写入 Git。
  - 2026-08-08 已通过官方 Codex CLI 分别完成两个 server 的浏览器 OAuth；`codex mcp list` 均显示 `enabled / OAuth`。Mermaid 已在重启后的当前会话正常暴露工具。
  - 账号迁移决策：`docs/decisions/ADR-004-figma-account-ownership-and-migration.md`。
- **Constraints:** 不打印 `.env`；Figma 密码不用于 MCP 自动登录；OAuth 必须浏览器交互；MCP 总数保持 ≤10；任务实现暂未启动。
- **Open risks:** 当前 App 会话在 OAuth 完成前启动，Figma 工具目录尚未刷新；两个浏览器授权是否确实使用了不同 Figma 账号仍需用专属文件实测；Playwright 尚未作为项目依赖锁定。
- **Next action:** 再重启 Codex → 检查两个 Figma 工具已出现 → 用账号专属测试文件验证不串号；若 token 或账号被复用则切换为两个独立 Codex profile → 再执行计划 Task 1。
- **Read first:** `AGENTS.md` → `docs/OpenScience_Kimi_Development_Spec.md` → `docs/progress.md` → `project_index.md` → product web spec/plan → ADR-004 → 本 handoff。
