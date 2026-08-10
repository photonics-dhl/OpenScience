# ADR-004: Figma 账号所有权、双 OAuth 与设计稿迁移

**状态：** Accepted  
**日期：** 2026-08-08
**修订：** 2026-08-10（长期账号 canonical 验收完成）

## Context

OpenScience 的 Figma 第一阶段需要先使用临时 Professional 账号，同时长期设计资产必须迁移到项目长期账号。若设计文件、variables、components、prototype 和 Code Connect 只存在于临时账号的 Drafts，后续账号切换会产生所有权、链接和开发交付风险。

Codex、Kimi/Cursor 等客户端还使用不同 MCP 配置源。项目 `.mcp.json` 不会自动进入 Codex Desktop；Codex 实际读取 `C:/Users/Mac/.codex/config.toml`。两个 Figma OAuth 会话若共用同一 remote URL 和缓存键，也可能互相覆盖。

## Decision

1. **长期账号是唯一设计资产所有者。** 环境变量 `FIGMA_PRIMARY_ACCOUNT_EMAIL` 指向长期账号；临时账号只用于当前 Professional 能力和过渡编辑。
2. **账号密码只存本机 `.env`。** 不进入 Git、ADR、日志、截图、MCP 参数或 Code Connect 配置。Figma MCP 使用浏览器 OAuth，不能读取账号密码变量。
3. **使用 Codex 原生远程 MCP OAuth。** MCP server 名称使用 `figma-temp` 与 `figma-primary`，两者都直接配置 `url = "https://mcp.figma.com/mcp"`，并按 server 名分别发起浏览器认证。不得使用 `mcp-remote` 代替 Codex 原生客户端，也不得通过自定义请求 header 隔离：两种代理尝试都在 Figma 动态客户端注册阶段返回 403。双账号是否真正按 server 名隔离必须通过重启后的身份检查确认；若 Codex 复用同一 endpoint 的 token，则改用两个独立 Codex profile，而不是伪造协议 header。
4. **Canonical 文件最终位于长期账号拥有的 Team/Project。** 临时账号创建的文件从第一天就邀请长期账号为可编辑成员；长期账号具备目标 Team/Project 后，将文件移动或复制到该空间，以目标空间中的文件作为唯一事实源。
5. **迁移不依赖单一平台动作。** 每个重要里程碑同时保留 `.fig` 导出备份、关键屏幕 PDF/PNG、变量表和组件/Code Connect 映射清单。若账号间不能直接转移所有权，使用“目标账号复制到目标 Team + 对照验收”路线。

## Migration Procedure

1. 临时账号创建 `OpenScience Web Design System`，立即邀请长期账号并授予 Editor。
2. 在长期账号下建立目标 Team/Project；不要在个人 Drafts 中建立长期 canonical 链接。
3. 将源文件移动到目标 Team；若产品权限不允许，长期账号在目标 Team 中 duplicate/import `.fig`。
4. 对照验证 pages、variables、component variants、prototype links、comments、Dev Mode annotations 和 Code Connect mappings。
5. 更新项目登记的 canonical Figma file key/link，并保留原文件为只读迁移来源，直至两轮代码同步验证完成。
6. 将临时账号降为 Viewer 或移除；撤销 `figma-temp` OAuth，删除本地临时账号密码变量并轮换曾暴露的临时密码。

## Current Canonical Source

- Canonical 文件：`OpenScience Web Design System (Copy)`
- 文件地址：<https://www.figma.com/design/gjhowMG7cG4clKwvhvF08E>
- 当前所有权：长期项目账号，已通过 `figma-primary` OAuth 身份、Full seat 和实际写入能力验收。
- 状态：2026-08-10 已建立独立的 `V3 / *` variables、styles、foundations、真实组件集与八表面结构矩阵；节点映射见 `docs/design/optical-editorial-figma-map.md`。
- 原过渡文件 `rWS3seZaDMdlnSljqktMDp` 仅保留为历史迁移来源，不得再作为代码或设计同步目标。

## Verification Gate

- [x] 两个 MCP server 均能独立加载；`figma-primary` 已在长期账号会话中完成身份与文件访问核验。
- [x] 长期账号能编辑 canonical 文件；V3 foundations、components 和 screens 均由该会话写入并回读。
- [x] Canonical 内含 44 个 Web-scoped variables、9 个 text styles、3 个 effect styles、4 个真实组件集和 8 个产品表面；详细 ID 与限制有仓库映射。
- [x] 项目登记只将目标文件 key 作为 canonical；旧文件降级为历史迁移来源。
- [x] 文档与差异不记录账号、密码、OAuth token 或 session material。
- [ ] `.fig` 离线导出与关键屏幕 PDF/PNG 归档仍作为发布前韧性任务，不阻塞浏览器实现与 Task 14 门禁。

## Consequences

- 需要分别完成两次浏览器 OAuth；账号密码写入 `.env` 不等同于认证完成。
- 过渡期会保留两个 Figma MCP server，占用一个额外 MCP 名额，因此移除低价值的 `fetch` server，维持总数 10。
- 迁移完成后可以禁用或移除 `figma-temp`，恢复一个 MCP 名额。
