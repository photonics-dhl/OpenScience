# OpenScience 进度（CURRENT window）

> 最新同步：2026-08-24 15:21 +08。完整历史由 Git history 保存；DEPRECATED、NO-GO、旧计划和 archive 不作为新 session 默认输入。

## Current version tuple

- Branch / deployed application HEAD: `codex/hermes-wanko-live2d` / `bba5f144fd082bc05fdbfb4d5d98dd7d094fe8cf`；后续 deployment-evidence docs-only HEAD 不是另一份应用 release。
- Deployable application source: `bba5f144fd082bc05fdbfb4d5d98dd7d094fe8cf`。
- Local main / origin main: `c60ffdd16b85ea8f0d8b047493fa03a4c0230c05` / `7eb2f5bc4718ee445b79bd089acb64acb3691e62`；两者都早于当前工作分支，远端 Hermes feature 不存在。
- ECS release / rollback: `bba5f144fd082bc05fdbfb4d5d98dd7d094fe8cf` / `68d8be7248aef2f52b32f76624e9928f4242c45c`。

## 2026-08-24 — Research Session Folio deployed for visual review

- 用户确认继续优化并授权部署；范围仍是匿名、`noindex`、零 API/数据库写入的 `/_visual/research-workbench`，没有修改认证产品页或 Landing。
- application `bba5f14` 将首屏改为 active study → open decision → evidence → version 的真实研究会话；Hermes 进入研究页边并与决策共享锚点，菜单只在右键、`Shift+F10`、Menu 键或移动长按后出现，普通点击保持 assistant dialog。
- 阅读字体修复为实际加载的 Source Serif 4 / Noto Serif SC；Latin `18px / 1.68`，CJK `18px / 1.82`，UI 恢复项目 Bricolage。菜单是一张低圆角纸面，不使用默认 shadcn 视觉、渐变、玻璃或独立项目卡片。
- 主 CTA 现进入 evidence review；中文 Portal 菜单无拉丁字距；移动长按后的 synthetic click 被抑制。独立只读审查确认无 API、存储、数据写和范围漂移，全部 P2/P3 已回归覆盖。
- Fresh local evidence：route E2E `7/7`、Web `395/395` + 5 Node contracts、typecheck、19-page production build、root lint、docs-sync、docs lint 与 `git diff --check` GREEN；ignored 原尺寸桌面/中文/反馈/editor/mobile 截图已复核。
- ECS checkup 与 DB backup `432K files=7/7` 通过。首个 `68d8be7` 发布后的即时公网 E2E 为 `5/7`，暴露 CTA 与右键在 hydration 前操作的验收时序；CTA hotfix 使用真实 `href` 渐进增强，右键合同等待 Hermes ready。
- hotfix `bba5f14` 经第二次 exact dry-run 与 `--skip-migrate` 部署；服务器 19-page build、27 migrations current、目标容器 healthy、route 200、精确 `/__release`、absent failure marker 和 rollback `68d8be7` 均通过。稳定公网 no-write E2E `7/7`。

## 2026-08-24 — UI taste toolchain correction

- 用户否决首轮 Hermes 互动菜单视觉：结构可用，但模板化、AI 感生硬；方向 B（情境墨水菜单）只保留交互意图，不保留被否决造型；该阶段仍处 design gate，未改产品代码。
- 经 GitHub 活跃度、许可、内容与脚本审计后，本机 Codex 安装 `ui-ux-pro-max@bc826e2` 与 `baseline-ui@bdbcc56`；安装树与审计副本规范化内容逐文件一致，检索脚本可运行，安装包运行时适用测试 `130/130`。前者提供本地风格/字体/色彩/交互资料，后者专门抑制渐变、光晕、无意义动画等 AI UI slop；两个依赖仓库根维护脚本的上游测试不属于 Skill 安装包运行边界，未伪装成通过。
- 既有 `shadcn` MCP 从 disabled 改为 enabled，固定 `shadcn@4.19.0` 并锁定本 worktree `apps/web`；MCP `initialize` 握手成功（protocol `2025-06-18`，server `1.0.0`）。21st.dev 因需要外部 API Key 未安装。

## 2026-08-24 — Hermes movable work assistant deployed

- v09 形象和 runtime bundle 不再改动。产品尺寸为 desktop `360px`、compact/mobile `200px`；默认右栏 anchor，拖动后成为 viewport-clamped companion，位置按 desktop/mobile 持久化。
- 紧凑 ink-edge bubble、字段引导、protected-region travel、主流程避让和 32-action semantic director 已完成；自主短句与动作是固定 4 秒 atomic beat，交互和优先任务可即时打断。
- release 前 fresh evidence：Web `390/390` + 5 Node contracts、typecheck、18-page build、Live2D/work-assistant gates、canonical product E2E `40/40`；独立最终 review 无 Critical/Important/Minor。
- 生产以 `--skip-migrate` 部署；未 migration、未 seed。公网三视口 Dashboard click/drag/reload/resize/bubble/Create gate 通过且使用无写入 API 拦截；没有生产 session token，因此未声称真实账号/数据库纵向 gate。

## 2026-08-24 — Fresh local/server cognition audit

- Git：`origin/main` 是 local main 的祖先；当前 Hermes 分支在 local main 之后且未推送。主工作区的未跟踪 `docs/live_2D/` 与 `docs/user_ideas/8.10/` 用户资产保持原样。
- ECS：`.release-id` 与公网 `/__release` 精确为 `5f4e73c...`，`.release-failed` absent，rollback tree `c97926a...` present；公网 Cloudflare 与 loopback HTTPS 均 200。
- Runtime：API、Agent Worker、Document Parser、Postgres、Redis、SeaweedFS、Malware Scanner 全部 running/healthy；Web running。Parser 保持 `node/read-only/network=none/536870912 bytes/64 PID`。
- Database：27 migrations found，schema up to date；2026-08-24 03:00 +08 最新 DB dump 为 441,411 bytes，当前保留 7 个。未读取备份或 `.env` 内容。
- Windows SSH：09:22 +08 用 `C:\Program Files\Git\bin\bash.exe` 直接调用 `checkup.sh` 复验通过。系统 `bash.exe` 会进入 WSL `/root`，无法加载 Windows 侧 `id_ed25519_xgs`；canonical 调用已提升到 deployment runbook §1.1。

## Constraints and next action

- 当前 ECS application release / rollback 是 `bba5f14` / `68d8be7`；其后的 docs-only HEAD 不得写成另一份应用 release。
- Task 21 计划已经完成并降级为 HISTORICAL evidence；唯一 CURRENT Hermes design 仍是 `docs/specs/2026-08-19-hermes-wanko-live2d-design.md`。
- 当前生产验收入口已发布；下一步只收集用户对轮廓、纸墨质感、可爱程度、菜单密度、字体阅读和动作反馈的具体意见。
- 用户浏览公网评审入口并确认具体视觉后，才把同一系统迁移到 Dashboard、编辑、审阅、Explore 与公开阅读正式页；Landing 不在此次改造范围。
- 可选剩余证据：取得现有安全测试会话后，补一次不创建新数据的 authenticated Dashboard smoke。

## Read first

1. `AGENTS.md`
2. `docs/handoff/2026-08-16-hermes-2d-pet-handoff.md`
3. 当前任务唯一 CURRENT spec（Hermes 为 `docs/specs/2026-08-19-hermes-wanko-live2d-design.md`）
4. 本文件
5. `docs/OpenScience_Kimi_Development_Spec.md` 相关章节
