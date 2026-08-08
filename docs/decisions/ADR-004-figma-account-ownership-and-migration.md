# ADR-004: Figma 账号所有权、双 OAuth 与设计稿迁移

**状态：** Accepted  
**日期：** 2026-08-08

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

## Current Transitional Source

- 过渡设计文件：`OpenScience Web Design System`
- 文件地址：<https://www.figma.com/design/rWS3seZaDMdlnSljqktMDp>
- 当前所有权：临时账号 Team；长期账号升级后，`figma-primary` 已能在目标 Team 创建文件，但官方 `whoami` 仍回报 View，且读取过渡文件明确返回“没有 edit access”。
- 写权限探针：长期账号已成功创建空目标文件 `OpenScience Web Design System — Canonical`（file key `PBUlumyHBVXfMHgdopH0aB`）。该文件目前只是迁移探针，不含设计内容，不得在 parity 验收前登记为 canonical。
- MCP 边界：官方 remote MCP 支持原生画布写入，但不提供 share、duplicate、move 或 ownership-transfer 工具，并限制单次输出 20KB；不得用截图、SVG 扁平化或分块重绘冒充保留 variables/components/prototype 的迁移。
- 状态：Task 1 Step 8 已完成并获用户确认（12 component sets / 96 variants）；Step 9 在迁移前暂停。过渡地址仍是唯一设计事实源，直到长期账号获得 Editor、在目标 Team 完成 duplicate/move 并通过全量对照。

## Verification Gate

- 两个 MCP server 均能独立完成 `tools/list`；分别切换浏览器 Figma 会话后，访问仅对对应账号可见的测试文件，以确认没有串号或 token 复用。
- 长期账号能在目标 Team 中编辑、分享和恢复 canonical 文件。
- 六个关键屏幕、variables、components、prototype 和 Code Connect 在迁移前后数量与命名一致。
- 代码生成只引用目标文件 key，不再依赖临时账号链接。
- 仓库和 Git 历史中不存在账号密码或 OAuth token。

## 2026-08-08 Migration Checkpoint

1. 双 OAuth 身份仍隔离：`figma-temp` 对应临时账号，`figma-primary` 对应长期账号。
2. 长期账号创建空 Design 文件成功，说明目标 Team 写入路径可用；`whoami` 的 View 回报可能尚未反映实际升级，但不能代替源文件 edit 检查。
3. 长期账号访问过渡源时被明确拒绝 edit；迁移当前唯一外部前置是源所有者在 Figma UI 将长期账号设为 Editor。
4. 获得 Editor 后优先使用 Figma UI 的 Move/Duplicate 保留完整文件语义；完成后对照 6 pages、4 variable collections、85 variables、9 text styles、2 effect styles、12 component sets、96 variants、关键 master nodes 和 prototype links。
5. 空目标探针不删除、不作为 canonical；若 UI duplicate 产生新 file key，以通过 parity 的新文件为准，并更新本 ADR、project index、handoff 和 Code Connect。

## Consequences

- 需要分别完成两次浏览器 OAuth；账号密码写入 `.env` 不等同于认证完成。
- 过渡期会保留两个 Figma MCP server，占用一个额外 MCP 名额，因此移除低价值的 `fetch` server，维持总数 10。
- 迁移完成后可以禁用或移除 `figma-temp`，恢复一个 MCP 名额。
