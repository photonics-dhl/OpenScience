# Handoff — Hermes Wanko Live2D Companion

> **CURRENT active-memory，2026-08-24 13:02 +08。** 旧灯体、帽子、流苏、Cubism GUI 试验和被否决候选只从 Git history 查阅，不再作为实施入口。

## Goal

- 已交付的 v09 Hermes 是可移动工作助手，不是主页面内容：Dashboard 默认右栏停靠，整角色拖动后脱离；桌面/紧凑移动端精确为 `360/200px`。
- 保持 RO 创建流程为主任务；气泡、字段引导和 32 动作只提供短暂、可打断、不遮挡的辅助反馈。
- 当前交付目标是公开 `/_visual/research-workbench` 视觉验收入口：先让用户在真实服务器判断暖纸工作台与情境菜单，不提前覆盖认证产品页面。

## Version tuple

- Working branch / deployed HEAD: `codex/hermes-wanko-live2d` / `02d3dd9c495fda18025d9f1698cf41a247094052`；keyboard-navigation hotfix 仍位于其后的未提交工作树。
- Deployable application source: `02d3dd9c495fda18025d9f1698cf41a247094052`。
- Local main / origin main: `c60ffdd16b85ea8f0d8b047493fa03a4c0230c05` / `7eb2f5bc4718ee445b79bd089acb64acb3691e62`；`origin/main` 是 local main 的祖先，二者都早于当前工作分支。
- Remote feature: `origin/codex/hermes-wanko-live2d` 不存在；旧 `origin/codex/readable-hermes-guidance@c88c780` 不是本次候选。
- ECS release / rollback: `02d3dd9c495fda18025d9f1698cf41a247094052` / `5f4e73c10dace9f2d18f8788ead238863cd33312`。

## Done

- v09 母版、帽子/流苏/灯/烟雾、两张 zero-alpha RGB-clean texture 和 12 motions 均保持不变；公网 runtime 与 immutable release tree 的五个关键 SHA 已一致。
- Task 21 已完成并部署：`360/200px`、drag-detach、viewport clamp、断点恢复、位置持久化、角色/气泡独立测量、protected-region/guide 避让与固定 4 秒 atomic autonomous beat。
- release 前门禁：Web `390/390`、5 个 Node contracts、typecheck、18 页 production build、Live2D/work-assistant gates、canonical product E2E `40/40`；两轮独立 Sol High review 无 Critical/Important/Minor。
- 2026-08-24 09:22 +08 只读复核：公网与 loopback HTTPS 200；API/Worker/Parser/data services healthy；27 migrations current；Parser `node/read-only/network=none/512MiB/64PID`；`.release-failed` absent；公网和本机 `.release-id` 均为 `5f4e73c`；rollback tree 存在。
- Windows 远程操作须显式调用 `C:\Program Files\Git\bin\bash.exe`；系统 `bash.exe` 会进入 WSL，无法安全加载 Windows 侧项目密钥。完整诊断与命令见 deployment runbook §1.1。
- 用户已确认 Hermes 互动采用桌面右键/键盘菜单键、移动端长按、文本气泡、场景自适应与“陪伴动作 + 真实工作入口”的混合菜单；首轮造型被否决后，已批准暖纸/矿物纸工作台方向并授权实现部署。
- UI taste 工具链已审计并启用：全局 Skills `ui-ux-pro-max@bc826e2`、`baseline-ui@bdbcc56`，以及固定 `shadcn@4.19.0`、cwd 指向本 worktree `apps/web` 的 shadcn MCP；初始化握手通过。21st.dev 因需要外部 API Key 未安装。
- `/_visual/research-workbench` 候选已经本地实现：六个可深链场景、真实 `360/200px` v09 Hermes、右键/键盘/长按菜单、普通点击无写入 assistant dialog、暖纸 `19px/1.72` 阅读与 evidence-only graphite rail。WebGL2 失败会退回同尺寸真实 Wanko 静态帧；菜单有可访问名且不会吞掉输入区的 Shift+F10。状态测试 `5/5`、Web `395/395` + 5 Node、route E2E `5/5`、typecheck、root lint/docs-sync 与 19-page build GREEN。
- 首次部署 `02d3dd9` 的服务器门禁与 HTTP/release/rollback 验证通过，但公网 route E2E 仅 `4/5`：快速场景切换时异步 `router.replace` 与本地 reducer 竞态。同步 History query hotfix 已在本地由先红后绿测试证明，尚未二次部署；不得把首次 `4/5` 冒充最终验收。
- 最新数据库备份 `/var/backups/openscience/db-2026-08-24.sql` 为 441,411 bytes；当前保留 7 个 DB dump。未读取备份内容。

## Constraints

- 不读取/记录 `.env`、Secret 或真实用户内容；不删除用户资产、受保护 v09 母版或私有验收 RO。
- 用户已对本次视觉评审 route 的生产部署明确确认；授权不扩展到 migration、seed、真实数据写入或正式产品页整体替换。
- 只有用户显式接受的证据文本可进入 SDF；Hermes 必须如实披露 missing evidence。
- 不恢复旧 `336/176`、动作画廊、大卡片气泡、旧 pet/carrier runtime 或被否决美术路径。

## Open risk

- 评审 route 是匿名 fixture，不读取账号或研究数据；它验证真实运行时、布局和交互，不替代认证产品纵向流程。
- 新工具只能提供约束、检索和真实组件证据，不能替代用户审美验收；不得把资料库首次命中或 registry block 直接当成产品视觉方向。
- 工作分支尚未与 `main` 做集成决策。开始新任务前必须明确 merge / PR / 保留分支之一，禁止直接从较旧 local main 猜测现状。

## Next action

1. 完成 root lint/docs-sync/diff review，创建 clean candidate commit；在切换前保持 ECS `5f4e73c` / rollback `c97926a`。
2. Git Bash 运行 checkup、DB backup、dry-run 与 `--confirm --skip-migrate` 部署；验证公网 route、精确 `__release`、容器健康和 rollback tree。
3. 用户直接浏览公网入口后只收集轮廓、纸墨质感、可爱程度、菜单密度和动作反馈；明确接受后才迁移正式产品页。

## Read first

1. `AGENTS.md`
2. 本 handoff
3. `docs/specs/2026-08-19-hermes-wanko-live2d-design.md`
4. `docs/progress.md`
5. `docs/OpenScience_Kimi_Development_Spec.md` 的当前任务相关章节

`project_index.md` 只用 `rg` 定向查 CURRENT；Task 21 计划和旧 handoff/spec 只作 HISTORICAL evidence。
