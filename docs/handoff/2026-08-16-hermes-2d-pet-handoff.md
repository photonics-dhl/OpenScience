# Handoff — Hermes Wanko Live2D Companion

> **CURRENT active-memory，2026-08-24 15:21 +08。** 旧灯体、帽子、流苏、Cubism GUI 试验和被否决候选只从 Git history 查阅，不再作为实施入口。

## Goal

- 已交付的 v09 Hermes 是可移动工作助手，不是主页面内容：Dashboard 默认右栏停靠，整角色拖动后脱离；桌面/紧凑移动端精确为 `360/200px`。
- 保持 RO 创建流程为主任务；气泡、字段引导和 32 动作只提供短暂、可打断、不遮挡的辅助反馈。
- 当前交付目标是公开 `/_visual/research-workbench` 视觉验收入口：先让用户在真实服务器判断暖纸工作台与情境菜单，不提前覆盖认证产品页面。

## Version tuple

- Working branch / deployed application HEAD: `codex/hermes-wanko-live2d` / `bba5f144fd082bc05fdbfb4d5d98dd7d094fe8cf`；其后的变更只记录部署证据。
- Deployable application source: `bba5f144fd082bc05fdbfb4d5d98dd7d094fe8cf`。
- Local main / origin main: `c60ffdd16b85ea8f0d8b047493fa03a4c0230c05` / `7eb2f5bc4718ee445b79bd089acb64acb3691e62`；`origin/main` 是 local main 的祖先，二者都早于当前工作分支。
- Remote feature: `origin/codex/hermes-wanko-live2d` 不存在；旧 `origin/codex/readable-hermes-guidance@c88c780` 不是本次候选。
- ECS release / rollback: `bba5f144fd082bc05fdbfb4d5d98dd7d094fe8cf` / `68d8be7248aef2f52b32f76624e9928f4242c45c`。

## Done

- v09 母版、帽子/流苏/灯/烟雾、两张 zero-alpha RGB-clean texture 和 12 motions 均保持不变；公网 runtime 与 immutable release tree 的五个关键 SHA 已一致。
- Task 21 已完成并部署：`360/200px`、drag-detach、viewport clamp、断点恢复、位置持久化、角色/气泡独立测量、protected-region/guide 避让与固定 4 秒 atomic autonomous beat。
- release 前门禁：Web `390/390`、5 个 Node contracts、typecheck、18 页 production build、Live2D/work-assistant gates、canonical product E2E `40/40`；两轮独立 Sol High review 无 Critical/Important/Minor。
- 2026-08-24 09:22 +08 只读复核：公网与 loopback HTTPS 200；API/Worker/Parser/data services healthy；27 migrations current；Parser `node/read-only/network=none/512MiB/64PID`；`.release-failed` absent；公网和本机 `.release-id` 均为 `5f4e73c`；rollback tree 存在。
- Windows 远程操作须显式调用 `C:\Program Files\Git\bin\bash.exe`；系统 `bash.exe` 会进入 WSL，无法安全加载 Windows 侧项目密钥。完整诊断与命令见 deployment runbook §1.1。
- 用户已确认 Hermes 互动采用桌面右键/键盘菜单键、移动端长按、文本气泡、场景自适应与“陪伴动作 + 真实工作入口”的混合菜单；首轮造型被否决后，已批准暖纸/矿物纸工作台方向并授权实现部署。
- UI taste 工具链已审计并启用：全局 Skills `ui-ux-pro-max@bc826e2`、`baseline-ui@bdbcc56`，以及固定 `shadcn@4.19.0`、cwd 指向本 worktree `apps/web` 的 shadcn MCP；初始化握手通过。21st.dev 因需要外部 API Key 未安装。
- `/_visual/research-workbench` 已实现六个可深链场景、真实 `360/200px` v09 Hermes、右键/键盘/长按菜单、普通点击无写入 assistant dialog、locale-aware `18px` 暖纸阅读与 evidence-only graphite rail。WebGL2 失败会退回同尺寸真实 Wanko 静态帧；菜单有可访问名且不会吞掉输入区的 Shift+F10。
- 首次部署 `02d3dd9` 的公网 route E2E `4/5` 暴露异步 `router.replace` 与本地 reducer 竞态；同步 History query hotfix `b73a9dd` 已二次无迁移部署。最终公网完整 E2E `5/5`，键盘场景额外并发 `3/3`；route 200、精确 release、absent failure marker、healthy containers 与 rollback tree 均已验证。
- 用户已确认 Research Session Folio 迭代；release `bba5f14` 将 active study、open decision、evidence 与 next version 提到首屏，并把 Hermes 收入共享研究页边。菜单由真实右键/键盘/长按触发，不再加载即打断。
- Fresh candidate evidence：route E2E `7/7`、Web `395/395` + 5 Node、typecheck、19-page build、root lint/docs gates GREEN。独立审查发现的主 CTA 空行为、中文 Portal 字距和 UI 字体偏移均已修复；无 API、存储、数据写或认证页改动。
- ECS checkup 与 DB backup `432K files=7/7` 通过。即时公网验收发现 hydration 前核心 CTA 可吞点击，hotfix `bba5f14` 将它改为真实 `href` 渐进增强链接；右键合同在 Hermes ready 后执行。
- 最终 `bba5f14` 以 `--skip-migrate` 发布：服务器 19-page build、27 migrations current、目标容器 healthy、route 200、精确 release、absent failure marker、rollback `68d8be7` 和公网 no-write E2E `7/7` 全部通过。
- 最新数据库备份返回 `432K files=7/7`。未读取备份内容。

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

1. 用户直接浏览公网入口，反馈轮廓、纸墨质感、可爱程度、菜单密度、字体阅读和动作反馈。
2. 未明确接受前继续只迭代视觉评审 route；接受后才整理正式页迁移范围与实施计划。

## Read first

1. `AGENTS.md`
2. 本 handoff
3. `docs/specs/2026-08-19-hermes-wanko-live2d-design.md`
4. `docs/progress.md`
5. `docs/OpenScience_Kimi_Development_Spec.md` 的当前任务相关章节

`project_index.md` 只用 `rg` 定向查 CURRENT；Task 21 计划和旧 handoff/spec 只作 HISTORICAL evidence。
