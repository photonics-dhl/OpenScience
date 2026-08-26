# Handoff — Hermes Wanko Live2D Companion

> **CURRENT active-memory，2026-08-26 11:33 +08。** Hermes 形象阶段按用户决定收口；旧灯体、帽子、流苏、Cubism GUI 试验和被否决候选只从 Git history 查阅，不再作为实施入口。

## Goal

- 已交付的 v09 Hermes 是可移动工作助手，不是主页面内容：Dashboard 默认右栏停靠，整角色拖动后脱离；桌面/紧凑移动端精确为 `360/200px`。
- 保持 RO 创建流程为主任务；气泡、字段引导和 32 动作只提供短暂、可打断、不遮挡的辅助反馈。
- application `9aef5c4` 已修复 detached 右侧停靠的顶部裁切、断裂空白及 protected collision，并随 immutable release `8395b4d` 上线；Hermes 形象阶段已收口，后续产品任务不得顺带修改。

## Version tuple

- Working branch / deployed application: `codex/hermes-wanko-live2d` / `47c8aa9e6b78c3ec26e4d0320097e1c5260d794a`。
- Current immutable deployed release: `73677d57ef9afd55fb75fd027cb4c514a7b7f544`；后续 docs-only HEAD 不改变该产品身份。
- Local main / origin main: `c60ffdd16b85ea8f0d8b047493fa03a4c0230c05` / `7eb2f5bc4718ee445b79bd089acb64acb3691e62`，都早于当前分支；remote feature 不存在，旧 `origin/codex/readable-hermes-guidance@c88c780` 不是本次候选。
- ECS release / rollback: `73677d57ef9afd55fb75fd027cb4c514a7b7f544` / `263c78372a1a6114016bba9ca3d8dbfce94ee0ce`。

## Done

- Task 24 application/release/rollback `47c8aa9` / `73677d5` / `263c783` 已恢复既有 OGL 水流：移除 descendants 隐藏 cursor 合同，以 concave 速度映射恢复慢速 wake，ambient 10s→7s；未改 Landing 构图、字体、shader、Hermes 或导航。Local canonical Landing `6/6`、focused `23/23`、Web `421+5`、全仓 test/build、Web typecheck/lint/docs 与原尺寸截图 GREEN；pre/post checkup、backup `436K files=7/7`、服务器 build、27 migrations、容器/Parser isolation、markers 与公网 Landing `6/6` GREEN。Broader Optical Lab 的既有 `evolves` `.899336 < .9` 在 10s/7s 相同且未放宽。无 migration/seed/data write。
- §13.8 application `9aef5c4` 将 detached custom dock 纳入 portal/crown/travel-hull 稳定器；默认纸页保持帽顶上方 `24–48px`，下移避开 viewport/protected surfaces，空间冲突才退到安全侧页或较矮上方 folio。旧 production 在 custom-dock 下 `menu.top=-31.7px` RED；最终关键 repeat `10/10`、constrained `5/5`、release `67/67`、Web `411+5`、root test/typecheck/lint、19-page build GREEN，独立复审 Ready。Release `8395b4d` / rollback `bf54eaa` 的 server build、27 migrations、容器/Parser/入口/assets/markers 与公网 Hermes `10/10` 均通过。
- §13.7 application `5323ba8` 用一个可重复稳定器联合约束 portal、可见帽顶、actor bottom、visual viewport 与 protected geometry；首帧同步 + 双 rAF、上游重排、compact 切组、关闭/卸载恢复和键盘 focus 均有回归。旧实现在精确 `1612×729 / DPR 1.875` 与上游 header reflow 下 RED；关键 `10/10`、Hermes `9/9`、Web `411+5`、release `66/66`、work-assistant 与 root gates GREEN，独立复审 Ready。Release `bf54eaa` / rollback `6b804f7` 的 server build、27 migrations、容器/Parser/入口/assets/markers 与公网 Hermes `9/9` 均通过。
- §13.6 application `8d1409e` 使用真实 portal/protected-region 测量保持 viewport 与 `24–48px` crown gap，mobile 开合不跳；12 动作各有真实 Wanko performance 与中英各三句不连重复，动作先于 speech，input/search/modal/drawer/approval 可中断。Release `6b804f7` / rollback `cbf5737`；Web `411+5`、release `65/65`、public `6/6`、focused/root gates 与独立复审 GREEN。
- §13.4 local application candidate `9a7263e` 以单闭合 SVG contour 和 slender mouth tail 替换 CSS 拼接气泡；主体保持在可见帽顶上方，反馈时 Hermes 标签/控件退场，截图等待真实 renderer ready。工具页保持可见帽顶 `24–48px` 邻接且排除阅读栏；已修复 mobile control 遮挡和短 research 分组 `32→118px` 漂移。永久门见 §13.5。
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
- 用户随后明确否决只优化评审 route，批准真实非 Landing 页面系统化实施与部署。候选已统一 identity、Dashboard、创建 RO、全部 RO 工作表面、Explore、公阅、Settings 与 Admin；Landing 未改。Hermes 锚定态进入预留研究页边，实际 Radix context menu 支持右键/键盘/长按，反馈不再悬浮压住内容。
- Fresh candidate evidence：真实 production product release matrix `60/60`（18 个真实表面、三视口、Landing reduced-motion、三条 Hermes 交互）；Web 58 files / 402 tests + 5 Node contracts、typecheck、19-page production build GREEN。优化构建发现的移动菜单 7px overlap 与 feedback remount 丢失均已修复，最终架构/Hermes 复审无剩余实质问题。旧自动旅行 E2E 与新“锚定不跨字段”合同冲突，33 条历史断言尚待重写，不能冒充通过。
- 首次 whole-product release `2abfe42` 已部署：checkup、`432K files=7/7` backup、server full build、27 migrations current、healthy target containers、route/runtime asset 200、精确 release、absent failure marker、rollback `bba5f14` 与公网 no-write `57/57` 通过；未 migration/seed/data write。
- 发布后原尺寸截图而非自动断言发现旧首次 nudge 仍在 Dashboard 压住 Hermes 标签/动效控制。hotfix `56f6cf4` 同时禁止锚定态未请求的 performance speech 与 adapter nudge，保留显式 guide、菜单、drawer 与菜单动作反馈；修复截图无覆盖，focused Hermes `3/3`、完整 release matrix `60/60`、Web `402/402` + 5 Node、typecheck/build GREEN。
- exact release `33418fd` 已以 `2abfe42` 为 rollback、`--skip-migrate` 发布。pre/post checkup、fresh `432K files=7/7` backup、server full build、27 migrations current、healthy target runtime、精确 release/absent failure/rollback markers、真实 route/Live2D assets 与公网 Dashboard + Hermes `4/4` 均通过；未 migration/seed/data write。
- 2026-08-25 mouth-anchored speech candidate `eb55820` 已完成：显式 feedback 为一条暖纸椭圆短句，纸尾按 desktop/mobile 口部锚点校准；连续 ledger 菜单、224px 移动菜单、方向翻转、应用内 reduced-motion 与 pointer-up 竞态均有回归覆盖。Fresh evidence 为 Web `403+5`、targeted `14/14`、work-assistant 三视口、Hermes aggregate `19+3`、product release `60/60`、全仓 typecheck/lint/test/build GREEN；两轮独立复审无部署阻断。旧 40 条 E2E 中 21 条 travel/dark prompt/旧 dock 断言已被批准锚定契约取代，19 条仍适用的 runtime/guide 场景继续进 CURRENT gate。
- Immutable release `3010903` 已以 `33418fd` 为 rollback、`--skip-migrate` 发布。pre/post checkup、backup `432K files=7/7`、服务器 19-page build、27 migrations current、目标 runtime/Parser isolation、route/assets、精确 release/failure/rollback markers 均通过；公网无写入 Hermes 三场景 `3/3`，原尺寸 editor 截图确认口部气泡留在研究页边且不遮正文。未 migration、seed 或写研究数据。
- 用户已批准新的 Scholar's Tea 行为语法转译稿；CURRENT Wanko spec §13.2 定义同一口部气泡的两段短话、8 个陪伴动作 + 4 个研究动作的 orbit menu、选择后的原子反馈、移动长按和 quiet editor；实现与 ECS 发布均已完成。
- Orbit candidate `e4a19d4` 已进入产品：Dashboard 两拍短句会被输入/modal/quiet/审批打断；桌面 12 个 action points 围绕真实 360px Wanko，mobile/compact/quiet 使用 200px 分组菜单；研究动作接到真实 `/hermes`、`/files`、`/versions`，先反馈 900ms 再导航且离页清理 timer；尺寸控制支持焦点回归、方向键与 Escape。
- Fresh evidence：Web `406+5`、Hermes aggregate `19+5`、全仓 typecheck/lint/docs-sync/test/build 与独立修复后复审 Ready；release `7165e9b` 的服务器 full build、27 migrations、容器/Parser isolation、public routes/assets/release identity 与公网 no-write Hermes `5/5` 均通过。未 migration/seed/data write。
- 专利技术交底用途的完整产品介绍已形成 `docs/proposals/2026-08-25-openscience-patent-product-introduction.{md,docx}`，现状、规划与候选技术点分开表述。
- 用户批准 §13.3 carried tool sheet 与动作语言锁。Application `1b3bada` 用一张 warm-paper folio 取代 orbit：desktop/mobile 工具页与精确 `360/200px` Hermes 保持至少 `32px` 空带，移动开合不产生角色跳动或关闭态大空洞，口部气泡按 bottom anchor 维持长短句连续性；12 项 action/motion/zh/en 映射有独立表驱动契约。
- Immutable release `8ed2f3c` 已以 `7165e9b` 为 rollback、`--skip-migrate` 发布。首次尝试因未使用 ECS 出网代理在切换前 timeout；同一 release 增加两条 `with-proxy` 构建契约后，backup、服务器全量 build、27 migrations current、容器/公网/release identity/markers 与公网 Hermes `5/5` 通过。公网全矩阵另有 `/admin` 三视口被预期 Basic Auth 401 拦截；未 migration、seed 或研究数据写入。

## Constraints

- 不读取/记录 `.env`、Secret 或真实用户内容；不删除用户资产、受保护 v09 母版或私有验收 RO。
- 用户已明确授权本次真实非 Landing 产品页整体替换与生产部署；授权不扩展到 Landing、migration、seed 或真实研究数据写入。
- 只有用户显式接受的证据文本可进入 SDF；Hermes 必须如实披露 missing evidence。
- 不恢复旧 `336/176`、动作画廊、大卡片气泡、旧 pet/carrier runtime 或被否决美术路径。

## Open risk

- 发布矩阵使用 no-write fixtures 验证真实页面编译、布局和交互；没有安全测试 session，因此不能冒充真实账号/数据库纵向验收。
- 新工具只能提供约束、检索和真实组件证据，不能替代用户审美验收；不得把资料库首次命中或 registry block 直接当成产品视觉方向。
- 工作分支尚未与 `main` 做集成决策。开始新任务前必须明确 merge / PR / 保留分支之一，禁止直接从较旧 local main 猜测现状。

## Next action

1. 用户已确认 Task 24 书面 spec；唯一 water-flow plan 已追加 Task 4，按 TDD 恢复既有 OGL 水流与系统 cursor。
2. 先证明 cursor、慢速轨迹和连通 motion RED，再做最小参数恢复；Hermes、导航与非 Landing 页面保持冻结。

## Read first

1. `AGENTS.md`
2. 本 handoff
3. `docs/specs/2026-08-24-research-folio-product-system-design.md`（非 Landing UI）与 `docs/specs/2026-08-19-hermes-wanko-live2d-design.md`（renderer/Hermes）
4. `docs/progress.md`
5. `docs/OpenScience_Kimi_Development_Spec.md` 的当前任务相关章节

`project_index.md` 只用 `rg` 定向查 CURRENT；Task 21 计划和旧 handoff/spec 只作 HISTORICAL evidence。
