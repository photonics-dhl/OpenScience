# OpenScience 进度（CURRENT window）

> 最新同步：2026-08-24 13:02 +08。完整历史由 Git history 保存；DEPRECATED、NO-GO、旧计划和 archive 不作为新 session 默认输入。

## Current version tuple

- Branch / deployed HEAD: `codex/hermes-wanko-live2d` / `02d3dd9c495fda18025d9f1698cf41a247094052`；其后的 keyboard-navigation hotfix 仍是未提交工作树。
- Deployable application source: `02d3dd9c495fda18025d9f1698cf41a247094052`。
- Local main / origin main: `c60ffdd16b85ea8f0d8b047493fa03a4c0230c05` / `7eb2f5bc4718ee445b79bd089acb64acb3691e62`；两者都早于当前工作分支，远端 Hermes feature 不存在。
- ECS release / rollback: `02d3dd9c495fda18025d9f1698cf41a247094052` / `5f4e73c10dace9f2d18f8788ead238863cd33312`。

## 2026-08-24 — Hermes warm-paper workbench candidate ready

- 用户已解除 design gate 并明确授权实现与生产部署。为让视觉可以直接验收，首个 slice 是匿名、`noindex`、零 API/数据库写入的 `/_visual/research-workbench`，不先覆盖认证产品页。
- 唯一 CURRENT Hermes spec 新增 §12，固定 daylight warm-paper/mineral-paper 工作台；深石墨只用于证据 rail，长文 `19px / 1.72`，UI/正文/数据字体角色分离。baseline-ui 禁止项与 ui-ux-pro-max 无障碍、触控、性能检查表已落实；shadcn/Radix 只提供 context-menu 行为原语，不套默认视觉。
- 评审 route 展示 Dashboard 默认菜单与 focus、陪伴短句反馈、quiet editor、evidence review、explore、long reading、mobile long press；使用真实 v09 Hermes 与精确 `360/200px`。桌面右键、`Shift+F10`、Menu 键、移动长按和普通点击助手 dialog 均有浏览器合同。
- Fresh local evidence：状态 RED→GREEN `5/5`，mutation 可杀死；Web `395/395` + 5 Node contracts、route E2E `5/5`、typecheck、19-page production build 与 root lint/docs-sync GREEN。六张 ignored WebGL 截图已按 original detail 复核并修正角色遮挡、移动裁切、过早画布与焦点轮廓。
- 独立架构审查的四项发现均已收敛：菜单键监听只挂在 Hermes trigger，不吞掉输入区原生行为；菜单有双语可访问名；WebGL2 失败显示同尺寸真实 Wanko 静态帧；实施计划准确记录 route-local 字体边界。失败路径与焦点边界已加入浏览器合同。
- 首次 ECS 发布 `02d3dd9` 已完成，backup `432K / 7/7`、服务器 build、容器 health、route HTTP 200、精确 `/__release`、absent `.release-failed` 与 rollback tree 均通过。公网浏览器验收为 `4/5`：快速 Editor→Review→Editor 后 Shift+F10 暴露同一路由异步 query 导航竞态；其余四项通过。根因已由同步 URL 的 RED 测试锁定，hotfix 使用 History API 原子更新本地 scene 与 query，待精确提交和二次部署。

## 2026-08-24 — UI taste toolchain correction

- 用户否决首轮 Hermes 互动菜单视觉：结构可用，但模板化、AI 感生硬；方向 B（情境墨水菜单）只保留交互意图，不保留被否决造型，当前仍处 design gate，未改产品代码。
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

- 在候选 commit 与 ECS 切换完成前，ECS 仍是 release `5f4e73c` / rollback `c97926a`；不得把未提交工作树或 docs-only HEAD 写成应用 release。
- Task 21 计划已经完成并降级为 HISTORICAL evidence；唯一 CURRENT Hermes design 仍是 `docs/specs/2026-08-19-hermes-wanko-live2d-design.md`。
- 当前已获一次性生产部署授权：完成 root lint/docs gates 与 diff review 后创建 clean candidate commit，以 `--skip-migrate`、显式 rollback `5f4e73c` 部署；公网 route、`/__release`、容器与 rollback 验证后才更新 release tuple。
- 用户浏览公网评审入口并确认具体视觉后，才把同一系统迁移到 Dashboard、编辑、审阅、Explore 与公开阅读正式页；Landing 不在此次改造范围。
- 可选剩余证据：取得现有安全测试会话后，补一次不创建新数据的 authenticated Dashboard smoke。

## Read first

1. `AGENTS.md`
2. `docs/handoff/2026-08-16-hermes-2d-pet-handoff.md`
3. 当前任务唯一 CURRENT spec（Hermes 为 `docs/specs/2026-08-19-hermes-wanko-live2d-design.md`）
4. 本文件
5. `docs/OpenScience_Kimi_Development_Spec.md` 相关章节
