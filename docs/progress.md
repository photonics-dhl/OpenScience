# OpenScience 进度（CURRENT window）

> 最新同步：2026-08-26 00:42 +08。历史由 Git 保存；旧计划和 archive 不作为默认输入。

## Current version tuple

- Branch / application / immutable release: `codex/hermes-wanko-live2d` / `9aef5c4d54d10b27a59389fa6865d179feb1891a` / `8395b4d5cc11cb444aac3b638cff4ccc993ef9f2`。
- Current rollback 为前一健康 release `bf54eaa2cd499f68eee8ce311a1ed178027a5348`；post-deploy docs HEAD 不与应用身份混写。
- Local main / origin main: `c60ffdd16b85ea8f0d8b047493fa03a4c0230c05` / `7eb2f5bc4718ee445b79bd089acb64acb3691e62`；两者都早于当前工作分支，远端 Hermes feature 不存在。
- ECS release / rollback: `8395b4d5cc11cb444aac3b638cff4ccc993ef9f2` / `bf54eaa2cd499f68eee8ce311a1ed178027a5348`。

## 2026-08-26 — Detached Hermes menu correction deployed

- 用户截图对应的不是整页缩放，而是已持久化拖动位置的 `detached` Hermes；旧稳定器只处理 `anchored`，因此右侧裁剪中菜单可越过顶部并与角色形成大段断裂空白。Application `9aef5c4` 让 portalled sheet、真实帽顶与 travel hull 在 detached 状态进入同一几何计算，关闭后恢复原位置、滚动和焦点。
- 正常空间保持完整 12 项纸页位于帽顶上方 `24–48px`；临时下移同时受 visual viewport 和 protected surfaces 限制。若上下空间物理冲突，只在该状态使用不碰内容的侧向纸页；侧向也不可用时改用较矮的上方宽幅 folio，不缩放角色、不压研究控件。
- 旧生产构建在精确 custom-dock 回归中以 `menu.top=-31.7px` RED；protected 紧邻场景也先 RED。最终关键路径 repeat `10/10`、constrained repeat `5/5`、product release `67/67`、Web `411+5`、全仓 test/typecheck/lint、19-page build 与 `git diff --check` GREEN；独立复审 Ready，只有“侧向 fallback 未被单独强制命中”的非阻断覆盖缺口。
- Immutable release `8395b4d` 已以 `bf54eaa` 为 rollback、`--skip-migrate` 发布。backup `432K files=7/7`、服务器 full build、27/27 migrations、目标容器与 Parser `network=none/read-only/non-root/512MiB/64PID`、Cloudflare/loopback、Dashboard/model/moc/motion、精确 release/failure/rollback markers 全部通过；公网 no-write Hermes `10/10`。未 migration、seed 或写研究数据；用户视觉接受仍 pending。

## 2026-08-25 — Hermes short-viewport collision correction deployed

- 用户生产截图再次证明 1612×729 CSS viewport（约 DPR 1.875）下工具页顶部会被裁切。根因是角色页边位移、Radix portal 校正和上游页面重排分属不同的一次性测量，能短暂或持续失配。
- Application `5323ba8` 将菜单、可见帽顶、角色底部、visual viewport 与 protected regions 合并为同一稳定器；同步校正首帧并以双 rAF 吸收 portal settling，监听菜单/页边尺寸、上游 geometry version、visualViewport 与 compact 分组变化，关闭/卸载恢复原 translate、scroll 和 focus。
- 新回归精确覆盖 `1612×729 / DPR 1.875`、菜单打开后的上游受保护 header 重排、上下边界、横向页边、无 protected overlap、`24–48px` crown gap、角色底部、Shift+F10/Menu 首项 focus 与 Escape 回归。旧实现 RED；修复后关键路径连续 `10/10`、Hermes `9/9`、Web `411+5`、product release `66/66`、work-assistant 三视口和 19-page build GREEN；独立复审 Ready，无 Important/Minor。
- Immutable release `bf54eaa` 已以 `6b804f7` 为 rollback、`--skip-migrate` 发布。backup `432K files=7/7`、server full 19-workspace/19-page build、27/27 migrations current、目标容器与 Parser isolation、Cloudflare/loopback、真实 Hermes assets、精确 release/failure/rollback markers 均通过；公网 no-write Hermes `9/9`，包含用户问题尺寸。无 API/schema/migration/seed/研究数据写入。

## 2026-08-25 — Hermes viewport-safe lively interaction deployed

- 用户生产截图证明右键工具页越过浏览器顶边，动作反馈又退化为固定气泡；根因是 Radix collision 后仍叠加固定 CSS 位移，以及每动作只有一句且语言先于角色 performance。
- Application `8d1409e` 改为测量真实 portal 后约束 viewport/protected regions；desktop 只移动页边，mobile counter-scroll，关闭/卸载恢复原始 scroll。12 动作均有真实 Wanko performance，每动作每语言三句且不连续重复，动作先行 `320/520ms` 后再说话。
- 输入、搜索、drawer/modal 和 approval 会取消待显示短句；已处于中断状态的动作不创建 timer。quiet editor 无中断时仍允许用户显式反馈，reduced-motion 保留文案与目的地。
- Fresh evidence：Web `411/411` + 5 Node、product release `65/65`、focused Live2D/work-assistant gates、全仓 typecheck/lint/test/build、`git diff --check` 与独立复审 GREEN。release `6b804f7` 已以 `cbf5737` 为 rollback、`--skip-migrate` 发布；backup `432K files=7/7`、server 19-page build、27/27 migrations current、容器/入口/资源/markers 全绿，公网 no-write `6/6`。当前视口/actor 截图确认角色与口部 speech 同屏；full-page WebGL 空帧只属 stitched capture 限制。

## 2026-08-25 — Hermes carried tool sheet deployed

- §13.3–13.5 的历史试错已收敛为一张暖纸 carried tool sheet、单闭合 SVG 口部气泡、可见帽顶 `24–48px` 间距和真实 `360/200px` 角色；悬空页注、宽尾、内部标签遮挡、移动 control overlap 与 research 分组漂移均已废止。
- 12 项 action/motion/zh/en 映射、右键/Shift+F10/Menu/长按、普通点击 drawer、focus、reduced-motion 与 mouth-relative bottom anchor 均有合同；历史 `62/62` 只能证明功能，视觉接受仍以 §13.5 原尺寸人工审图为门。
- `8ed2f3c`、`cbf5737` 等历史发布的 build、27 migrations、容器、入口和 no-write 证据由 Git 与 deployment runbook 保存；本 CURRENT window 不再重复完整部署日志。

## 2026-08-25 — Hermes orbit actions deployed

- `e4a19d4` 已实现同一口部气泡的 Dashboard 两拍短句、真实 `360px` Wanko 周围 8 个陪伴动作 + 4 个研究入口、移动/compact `200px` 分组菜单，以及 original/compact/quiet 小型控制；普通点击 drawer、右键、Shift+F10、Menu 键和长按保持。
- 研究动作接入真实 RO surfaces：证据复核 `/hermes`、来源 `/files`、版本 `/versions`；选择后先给 900ms 角色/短句反馈再导航，离页清理 timer。搜索/文本输入、modal、quiet、审批均停止自动问候，显式交互仍可用。
- 独立审查最初发现错误研究路由、反馈截断、搜索未抑制和 desktop compact 菜单问题；全部修复后复审 Ready。Fresh evidence：Web `406/406` + 5 Node、Hermes runtime/guide `19/19` + product interaction `5/5`、全仓 typecheck/lint/docs-sync/test/build、`git diff --check` GREEN；WebGL first-ready `889ms`，idle/pointer 零掉帧。
- Immutable release `7165e9b` 已以 `3010903` 为 rollback、`--skip-migrate` 发布。pre/post checkup、backup `432K files=7/7`、服务器 19-page build、27 migrations current、目标 runtime/Parser isolation、route/assets、精确 release/failure/rollback markers 均通过；公网无写入 Hermes 五场景 `5/5`。首次调用因隔离 worktree 未指定主仓库配置根而在上传前 fail-closed，补充 `XGS_CONFIG_ROOT=E:/Miscellaneous/XGS` 后完成；未 migration、seed 或写研究数据。

## 2026-08-25 — Hermes orbit design approved; patent introduction drafted

- 用户批准基于 Scholar's Tea 行为语法重建的动态方向：Dashboard 同一口部气泡顺序出现两句短话；桌面 12 项清晰 action points 从真实 `360px` Hermes 周围展开；选择后菜单关闭、角色动作与短句组成一个反馈节拍；移动 `200px` 长按与安静编辑状态保留完整入口。
- 唯一 CURRENT Hermes spec 已新增 §13.2，明确 8 个陪伴动作、4 个研究动作、右键/Shift+F10/Menu/长按、普通点击 drawer、44px 目标、字体、reduced-motion 和不遮挡合同；该设计阶段已被上方 `e4a19d4` 实现条目取代。
- 新增 `docs/proposals/2026-08-25-openscience-patent-product-introduction.{md,docx}`：按当前需求基线、产品叙事、已实现架构和边界编写，分开陈述现状与规划，并列出供代理人检索拆分的技术点；不冒充权利要求或可专利性结论。

## 2026-08-25 — Hermes mouth-anchored speech deployed

- 用户批准实现并部署 §13.1。显式 companion feedback 现为无 speaker/tone/toolbar 的单句暖纸椭圆，三角纸尾以真实 `360/200px` Wanko 口部锚点为目标；桌面、移动端和方向翻转均有几何门禁，移动端菜单宽度为 224px。
- Radix 右键、`Shift+F10`、Menu 键、长按与普通点击 drawer 保持；菜单使用连续 ruled ledger，应用内与系统 reduced-motion 均关闭无必要入场动画。修复了 pointer-up 异步读取失效 React `currentTarget` 的真实竞态。
- Fresh local evidence：Web `403/403` + 5 Node contracts、targeted `14/14`、work-assistant 三视口、Hermes aggregate（19 个现行 runtime/guide + 3 个菜单）、product release `60/60`、全仓 typecheck/lint/docs-sync/test/build、`git diff --check` GREEN；WebGL first-ready `857ms`，idle/pointer 均零掉帧。
- 两轮独立复审无部署阻断。原 40 条旧 Hermes E2E 中 21 条要求已被批准锚定契约取代的 cross-field travel/dark prompt/旧 dock 语义，不再作为 CURRENT gate；剩余 19 条 runtime/guide 回归继续进入 Hermes 聚合门禁，旧文件保留为 historical evidence。
- Immutable release `3010903` 已以 `33418fd` 为 rollback、`--skip-migrate` 部署。pre/post checkup、fresh backup `432K files=7/7`、服务器 19-page full build、27 migrations current、API/Worker/Parser healthy、Web running、runtime dependencies、Parser isolation、真实 route/Live2D assets、精确 `/__release`、absent failure marker 与 rollback tree 均通过；公网无写入 Hermes desktop/keyboard、mobile long-press、editor feedback `3/3`，原尺寸截图确认气泡留在研究页边且不覆盖正文。未 migration、seed 或写研究数据。

## 2026-08-24 — Research Folio whole-product candidate

- 用户明确批准从评审 route 扩展到全部真实非 Landing 页面并部署；唯一 CURRENT 非 Landing 视觉规范为 `docs/specs/2026-08-24-research-folio-product-system-design.md`，Landing 保持不变。
- 真实用户路径已统一为 `identity → active research → create/import → structure/evidence → human decision → version → publish → public verification`。登录/注册表单优先，Dashboard 活跃研究优先，创建 RO 显式两阶段，RO 工作区、公阅、探索、设置和管理端共用暖纸 Research Folio；graphite 只保留给代码/diff/原始证据。
- Hermes 默认进入页面预留研究页边：desktop `360px`、compact/mobile `200px`，锚定态不再 fixed 或跨字段移动；右键、`Shift+F10`、Menu 键、移动长按打开一张连续纸墨菜单，普通点击仍开 assistant drawer。反馈是角色旁短行，不覆盖表单或正文。
- 首次 immutable release `2abfe42` 已经 ECS checkup/backup、server full build、27 migrations current、healthy containers、精确 release/rollback/failure-marker、真实 route/assets 与公网 no-write `57/57` 验收；Landing 未改，未 migration/seed/data write。
- 发布后原尺寸截图复核发现旧自动 nudge 仍会压住 Hermes 状态与动效控制。hotfix `56f6cf4` 关闭锚定产品页的未请求 speech/nudge，保留右键菜单、点击 drawer、显式字段 guide 与动作反馈；修复后截图无覆盖，production release matrix 再次 `60/60`，Web 58 files / 402 tests + 5 Node contracts、typecheck、19-page build GREEN。
- exact release `33418fd` 已以 `2abfe42` 为 rollback、`--skip-migrate` 发布；fresh backup `432K files=7/7`、server full build、27 migrations current、release/failure/rollback marker、healthy runtime、真实 route/Live2D assets 与公网 focused `4/4` 均通过。无 migration、seed 或研究数据写入。

## 2026-08-24 — Research Session Folio deployed for visual review

- 用户确认继续优化并授权部署；范围仍是匿名、`noindex`、零 API/数据库写入的 `/_visual/research-workbench`，没有修改认证产品页或 Landing。
- application `bba5f14` 将首屏改为 active study → open decision → evidence → version 的真实研究会话；Hermes 进入研究页边并与决策共享锚点，菜单只在右键、`Shift+F10`、Menu 键或移动长按后出现，普通点击保持 assistant dialog。
- 阅读字体修复为实际加载的 Source Serif 4 / Noto Serif SC；Latin `18px / 1.68`，CJK `18px / 1.82`，UI 恢复项目 Bricolage。菜单是一张低圆角纸面，不使用默认 shadcn 视觉、渐变、玻璃或独立项目卡片。
- 主 CTA 现进入 evidence review；中文 Portal 菜单无拉丁字距；移动长按后的 synthetic click 被抑制。独立只读审查确认无 API、存储、数据写和范围漂移，全部 P2/P3 已回归覆盖。
- Fresh local evidence：route E2E `7/7`、Web `395/395` + 5 Node contracts、typecheck、19-page production build、root lint、docs-sync、docs lint 与 `git diff --check` GREEN；ignored 原尺寸桌面/中文/反馈/editor/mobile 截图已复核。
- ECS checkup 与 DB backup `432K files=7/7` 通过。首个 `68d8be7` 发布后的即时公网 E2E 为 `5/7`，暴露 CTA 与右键在 hydration 前操作的验收时序；CTA hotfix 使用真实 `href` 渐进增强，右键合同等待 Hermes ready。
- hotfix `bba5f14` 经第二次 exact dry-run 与 `--skip-migrate` 部署；服务器 19-page build、27 migrations current、目标容器 healthy、route 200、精确 `/__release`、absent failure marker 和 rollback `68d8be7` 均通过。稳定公网 no-write E2E `7/7`。

## 2026-08-24 — UI taste toolchain correction

- 首轮模板化视觉已否决；`ui-ux-pro-max`、`baseline-ui` 与 worktree-scoped `shadcn@4.19.0` 可用。工具只提供约束/原语证据，最终方向受 CURRENT spec §13.5 的 reject/accept 与原尺寸人工审图门约束。

## 2026-08-24 — Hermes movable work assistant deployed

- v09 形象和 runtime bundle 不再改动。产品尺寸为 desktop `360px`、compact/mobile `200px`；默认右栏 anchor，拖动后成为 viewport-clamped companion，位置按 desktop/mobile 持久化。
- 紧凑 ink-edge bubble、字段引导、protected-region travel、主流程避让和 32-action semantic director 已完成；自主短句与动作是固定 4 秒 atomic beat，交互和优先任务可即时打断。
- release 前 fresh evidence：Web `390/390` + 5 Node contracts、typecheck、18-page build、Live2D/work-assistant gates、canonical product E2E `40/40`；独立最终 review 无 Critical/Important/Minor。
- 生产以 `--skip-migrate` 部署；未 migration、未 seed。公网三视口 Dashboard click/drag/reload/resize/bubble/Create gate 通过且使用无写入 API 拦截；没有生产 session token，因此未声称真实账号/数据库纵向 gate。

## Constraints and next action

- production `bf54eaa` 已完成 immutable ECS 与公网无写入 `9/9` 验收；下一步由用户在真实 Dashboard/mobile/editor 复核菜单可见性、动作生动程度、话语变化和整体节奏。
- 用户随后在 Dashboard、移动端和 quiet editor 验收轮廓连续、嘴部连接、菜单密度/间距与动作反馈；明确接受前不得称视觉通过。
- Landing 不变；分支未集成，后续单独决定 merge / PR / 保留。

## Read first

1. `AGENTS.md`
2. `docs/handoff/2026-08-16-hermes-2d-pet-handoff.md`
3. 当前任务唯一 CURRENT spec（Hermes 为 `docs/specs/2026-08-19-hermes-wanko-live2d-design.md`）
4. 本文件
5. `docs/OpenScience_Kimi_Development_Spec.md` 相关章节
