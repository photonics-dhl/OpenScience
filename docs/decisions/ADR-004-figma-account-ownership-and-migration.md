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

## Current Canonical Source

- canonical 设计文件：`OpenScience Web Design System (Copy)`
- 文件地址：<https://www.figma.com/design/gjhowMG7cG4clKwvhvF08E>
- 长期账号验证：`figma-primary` 重新鉴权后对应长期账号；目标 Team 席位为 Full。MCP 不暴露文件 owner 字段，因此所有权依据是用户在长期账号下完成复制；可编辑性由长期账号净零写探针独立验证。
- 迁移 parity（2026-08-08）：副本与过渡源逐项一致——6 pages、4 variable collections / 85 variables、9 text styles、2 effect styles、12 component sets / 96 variants；关键 master nodes `60:2`、`60:7`、`60:8` 的名称与尺寸一致；字体集合均为 Noto Sans SC / Noto Serif SC / Roboto Mono，均无 image fill；prototype 均为 0 reactions / 0 flow starts。
- 写权限探针：在 `00 Cover` 创建 1×1 临时 frame 后立即删除，前后 child count 均为 0，证明长期账号具备写权限且画布净零变化。
- Code Connect 边界：官方 `get_code_connect_map` 在源/副本上均拒绝请求，要求 Organization/Enterprise 的 Dev 或 Full seat；长期账号虽为 Full，但当前 tier 是 student。因而不能证明映射为空或迁移一致；该缺口单独阻塞 Step 11，不阻塞 Step 9 画布设计。
- 状态：该文件自本 checkpoint 起作为唯一 canonical 设计事实源；Step 9 可在此文件继续。旧源与空 migration probe 均不得用于新增设计或 Code Connect。

## Retained Migration Sources

- 过渡设计文件：`OpenScience Web Design System`
- 文件地址：<https://www.figma.com/design/rWS3seZaDMdlnSljqktMDp>
- 当前所有权：临时账号 Team；仅保留为只读迁移来源，直至两轮代码同步验证完成。
- 写权限探针：长期账号已成功创建空目标文件 `OpenScience Web Design System — Canonical`（file key `PBUlumyHBVXfMHgdopH0aB`）。该文件目前只是迁移探针，不含设计内容，不得在 parity 验收前登记为 canonical。
- MCP 边界：官方 remote MCP 支持原生画布写入，但不提供 share、duplicate、move 或 ownership-transfer 工具，并限制单次输出 20KB；不得用截图、SVG 扁平化或分块重绘冒充保留 variables/components/prototype 的迁移。
- 状态：Task 1 Step 8 已完成并获用户确认（12 component sets / 96 variants）；迁移门已通过，旧源和空探针均不是 canonical。

## Verification Gate

- 两个 MCP server 均能独立完成 `tools/list`；分别切换浏览器 Figma 会话后，访问仅对对应账号可见的测试文件，以确认没有串号或 token 复用。
- 长期账号能在目标 Team 中编辑、分享和恢复 canonical 文件。
- 六个关键屏幕、variables、components、prototype 和 Code Connect 在迁移前后数量与命名一致。
- 代码生成只引用目标文件 key，不再依赖临时账号链接。
- 仓库和 Git 历史中不存在账号密码或 OAuth token。

## 2026-08-08 Migration Checkpoint

1. 双 OAuth 身份仍隔离：`figma-temp` 对应临时账号，`figma-primary` 对应长期账号。
2. 长期账号升级已生效：`figma-primary whoami` 回报目标 Team 为 Full；用户已在 Figma UI 手动复制最新设计，产生新 file key `gjhowMG7cG4clKwvhvF08E`。
3. 可检查的源/副本 parity 已通过：页面、variables、styles、component sets/variants、关键 master node 名称与尺寸全部一致；prototype 均为 0 reactions / 0 flow starts。Code Connect 因当前 plan tier 被官方接口拒绝，保持未验证。
4. 长期账号净零写探针通过；新副本正式成为 canonical，Step 9 迁移门解除。
5. 空目标探针不删除、不作为 canonical；旧源只读保留，直至后续两轮代码同步验证完成。

## Consequences

- 需要分别完成两次浏览器 OAuth；账号密码写入 `.env` 不等同于认证完成。
- 过渡期会保留两个 Figma MCP server，占用一个额外 MCP 名额，因此移除低价值的 `fetch` server，维持总数 10。
- 迁移完成后可以禁用或移除 `figma-temp`，恢复一个 MCP 名额。
- 当前 student tier 的 Full seat 足以继续画布设计，但不满足官方 Code Connect API 的 Organization/Enterprise 门槛；Step 11 前需升级到满足条件的 plan/seat，或经 ADR 明确选择不使用 Code Connect 的替代交付。
