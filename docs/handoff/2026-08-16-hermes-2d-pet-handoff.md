# Handoff — 2026-08-17 Hermes Workspace Companion

## Current truth

- 用户已确认下一阶段 **Hermes Workspace Companion** 并授权计划完成后直接实施、只验最终视觉。当前 mesh/contextual guide 是可复用工程基线，不是待验收的最终动作产品。
- 当前唯一设计入口是 `docs/specs/2026-08-17-hermes-workspace-companion-motion-design.md`，唯一执行入口是 `docs/plans/2026-08-17-hermes-workspace-companion-motion-plan.md`。2026-08-16 mesh/contextual spec 已被取代；整图 PNG/CSS-signal renderer 仍为 `VISUAL NO-GO`。
- 形象为暖纸书页质感的少年星图龙：紧凑 S 形轮廓、深墨证据脊、六个 SDF 证据节点、额外头顶 Hermes 核心与朱砂引用尾。它不是通用机器人、摄像头、Live2D/Wanko 或 3D 模型。
- 新范围覆盖 Personal Workspace 的 Dashboard → RO 创建 → 导入/六字段 SDF → Hermes diff → Commit 主链；2026-08-17 已在 ECS 以真实 arXiv PDF 与 MiniMax-M3 贯通，并部署 release `aa1c8af` 的真实页面 motion/guide 修复，未改数据库 schema。正式任务继续复用 credit/queue/audit/approval、提交限流和服务端上下文授权。
- 2026-08-17 核心候选与真实论文/引导链已部署 ECS。用户已再次明确“方案早已确定，现在是实现阶段”；任何后续 session 都不得重开形象、Live2D/3D 或技术路线选择。不要再从下文旧 43.8 秒 grammar 或历史 2.5D 证据推断当前行为；当前调度事实源是 `action-catalog.ts` + `behavior-director.ts` + `motion-mixer.ts` + `pet-motion.ts` 的 action-specific trajectories。
- 用户浏览器所在 Windows 当前关闭系统动画，Codex Chromium 因此命中 reduced-motion；旧录屏强制 `no-preference`，不能代表用户页面。当前候选已在真实页面提供“开启 Hermes 动效”，选择会持久化并跨 Dashboard/创建/编辑路由恢复 mesh、整体动作与 pointer input；URL `?hermes-motion=full|reduced` 仍可作显式覆盖并同步保存。禁止再把自动化 media override 视频当作用户环境证据。

## Workspace Companion candidate

- `HermesWorkspaceStage` 是 Dashboard/RO 路由唯一 renderer owner；拖动停靠会按 Workspace/设备写入本地偏好，路由切换与重载保留 stage。用户自定义停靠优先于自动字段引导：先原位显示 edge-stop 提示，只有用户点击“带我过去”才逐个执行 `planHermesTravel().points`，不是从起点直插终点。
- 27 个 action 采用审批 > 拖动 > 引导 > task > 写作 > pointer > idle 的确定优先级；微动作 seeded shuffle-cycle 在新周期前覆盖完整 10-action deck。三轮用户感知拒绝后，每个 action 不再折叠到共享 pose，并采用可读保持曲线；balanced cadence 为 `2.4–4.2s`，signature 为 `14–22s`，基础头/页冠/躯干/尾巴为独立节律。`patrol` 已收敛为完整的 `4.2s`，自主动作在时长结束前不会被下一 idle 截断。
- 角色另有唯一 whole-character presentation layer：巡游整体游出至少 `30px` 并回到 `6px` 内，至少 6 种自主动作整体轮廓位移达到 `8px`，pointer 迎接位移达到 `8px`；只移动角色，不移动提示/按钮/编辑器/用户 dock，reduced/approval 完全关闭。最新完整 release 用时 `151.8s`、exit `0`；用户视觉仍是唯一未通过门禁。
- RO 创建和编辑页注册语义锚点并拥有真实 Assistant Drawer：标题填写后推进到 source-import，SDF 选择推进到当前字段；点击角色可直接唤起 Hermes。bubble 只显示当前锚点声明的功能，创建页为 Explain，编辑字段为 Explain/Draft/Check；Explain 提供逐字段内容提示，Draft 复用 `sdf.extract`，建议在显式 Apply 前不改 SDF。
- 聚合命令为 `npx pnpm@9.15.0 --filter @openscience/web test:hermes-companion-release`，覆盖 articulation/affine mutation、真实 renderer draw/performance、用户触发后的逐 RAF 航行几何、Diff 写入边界和 90 秒 WebM。最新运行用时 `146s`、exit `0`；first-ready `916ms`，idle/pointer `451/505` 次 draw，p95 `18.1/18ms`。产品 Dashboard canvas 已由 `181px` 提升为 `213px`；基础呼吸 `5,531`、pointer `58,558` 个变化像素。
- 最新修复门禁：本地与公网 production-browser Dashboard/创建/编辑/真实 reduced preference 均 `6/6`；Web `295/295`、typecheck、lint、17-page build；Hermes 聚合 release `145.6s` exit 0（idle `5,215`、pointer `58,228` changed pixels）。ECS release `aa1c8af` / rollback `c9df24d`，备份 `376K / 7/7`，远端 source hash 匹配，服务与公网硬检查 GREEN。尚未完成 Drawer 内 Quiet/Balanced/Active 与 sound/particle/proactive 设置 UI；两信号主动提示与逐字段 cooldown 的完整浏览器矩阵。
- 用户明确禁止本机 Docker。本机不再是服务验收入口；当前运行事实只认 ECS 公网 `https://OpenScience.428312321.xyz`。本机仅编辑和作为浏览器客户端，3000 与任何本机容器均禁止触碰。

## 2026-08-17 ECS real-workflow checkpoint

- Canonical sample: arXiv `2009.06045v1`, 24,671,920-byte real PDF, SHA-256 `d57dc94c05ca99ccb33f8186e9317353c663a638cde1c0c8a90c7c2d029f484a`. Latest production RO `7e3665f3-ac08-438f-9ccc-f35e99c6b677` / task `e72d221e-d56e-4963-99b2-609dabc0252e` completed upload, ClamAV, isolated parse, MiniMax extraction, evidence review, explicit disclosure, confirm and version commit without route interception.
- Current extraction truth: method/results/limitations contain original-manuscript quote + character locator; problem/insight/reproducibility remain `needsMoreInformation`. The reviewed values include `5 fJ`, `50 pJ` and `1 PHz`. Never claim all six fields were supported; the earlier RO `521bc4e0-aa64-462a-be07-5e381cfed7af` remains prior evidence, not the current canonical run.
- Real defects fixed in this wave: non-ZIP `../` false positive, 20MB parser ceiling, PDF whitespace/hyphen quote mismatch, and an underspecified `workspace.guide` prompt. Guide now receives only membership-scoped SDF core and exact allowed target IDs; guard and server target validation remain strict.
- Latest real Dashboard guide task succeeded in 13.7 seconds, identified missing reproducibility, quantitative review points, duplicate drafts and empty shells, and returned only three authorized RO/task links; the primary link targeted the canonical RO exactly.
- Production parser truth: self-contained sidecar is healthy with `network=none`, `user=node`, read-only rootfs, 512MiB, 64 PID, `cap_drop=ALL`, only the bounded parser-jobs mount, and no production Secret env keys. Build-time apt/npm alone uses ECS Squid through host networking; this does not change runtime isolation.
- Task 9 has real extraction/provider evidence but its independent persisted-audit assertion remains open. Task 10 has only a bulk review/confirm/version/commit production smoke; per-field accept/edit/reject with source display and the full independent six-field rubric remain open. Task 11 remains open until one uninterrupted production run proves distinct real-pixel motion for every durable workflow state plus reduced-motion/resource cleanup. Do not regress these boundaries into a generic “Hermes complete” claim.

## Implementation

- `HermesVisualAdapter` 现在是真实按钮入口：idle 三段 observation/evidence/citation 品牌动作、真实状态提示、pointer/focus attentive、drawer open/working/still presence；approval 静止优先级最高，reduced-motion 静态保留提示和操作。
- `HermesAssistantDrawer` 桌面右侧、390px 全屏；具备完整焦点陷阱/关闭还原、目标输入、任务进度、needs-more-information、结果导航、双层幂等、同步提交锁、同 task polling 恢复和刷新恢复。
- `workspace.guide` 仅返回 read-only guidance 与 `open-task/open-ro/start-import`。Worker 根据 AgentTask session user 从数据库重建 ingestion/RO 上下文，验证当前 workspace membership，并拒绝越权/幻觉 target；客户端 payload 不作为授权事实源。
- `/agent/tasks` 已加入 `20 requests / 60s` Redis 限流；CSRF、AgentSession 归属、AI Credit、审计与 R0–R4 沿用现有实现。
- `HermesRiggedPortrait` 是唯一角色呈现 owner：一张 28×28 OGL mesh 使用现有 idle/blink/working PNG 作为纹理，对真实角色像素施加头部、页冠、躯干、引用尾和眼区权重。旧 `HermesPetPortrait.tsx` 及全部 `.hermes-pet-*` / `.hermes-idle-signal` CSS 已从运行时代码删除。
- 待机约 43.8 秒长语法改变动作顺序与休止长度，组织 observe、blink、page-flick、citation-swish、evidence-check 与呼吸；首个可读动作在 1.2–1.8 秒开始。pointer/focus/drawer-open 时头眼先行、躯干跟随、尾部反向滞后；approval 与 reduced-motion 不启动 WebGL，静态纹理和全部 guide 操作保留。
- 提示条已移到角色上方的独立布局，不再遮挡头、躯干或尾部。Canvas 不接管 pointer；原有可访问按钮继续负责 focus/click/guide drawer。
- 旧文档门禁仍要求 2026-08-16 mesh 为 CURRENT，这已成为 Task 1 的预期 RED；任何 session 必须先读 2026-08-17 spec/plan，不得被旧门禁或历史 GREEN 误导。

## Evidence

- Motion model TDD 先在旧共享姿势与旧基础幅度上精确 RED：observe-left 方向错误、stretch torso scale 仅 `1.016`、citation tail 仅 `6.2°`、pointer approach 仅 `6.4px`，随后 breathing scale `0.022 < 0.032` 再次 RED。action-specific trajectories 与基础生命感修复后 focused Hermes motion/director/mixer `26/26`、全 Web `41 files / 289 tests` 与 Web typecheck GREEN。
- 最新 production-renderer 像素门禁 GREEN：固定自主时钟 control `0` changed px；pointer 后 head / torso / tail 光学位移 `(2,6)` / `(2,0)` / `(-1,-8)`；受控 whole-affine shader 突变三域均为 `(7,3)` 并被拒绝。内部裂缝率最高 `3.37%`，轮廓前后都只有一个连通分量。18 秒 1440×900 WebM 与证据截图在忽略目录 `apps/web/test/visual/out/hermes-articulated/`。
- Hermes production E2E 当前 `12/12` GREEN。真实 RED→GREEN 覆盖 live approval、运行中 WebGL context loss、WebGL2 不可用、延迟解码离屏、pending-init SPA unmount、focus/open 真实关节输入；上下文净持有恢复为 `0`，新 canvas 可重新 ready。既有六态、guide/recovery、390px、reduced、fallback 与提示不遮挡均保留。
- WebGL2 preflight 已前移到 OGL/纹理加载之前；无 WebGL2 时不再请求 blink/working，fallback SVG 也没有独立 CSS 动画。冷 production Dashboard 实测客户端 JS `186,659B`、三纹理 `1,472,269B`、全资源 transfer `2,164,595B`，first-ready `809ms`。Headless Chrome SwiftShader 待机/pointer 7.5 秒分别 `451/504` 次真实 Hermes WebGL draw，median `16.9/16.8ms`、p95 `18ms`、drop `0`、renderer RAF CPU p95 `0.2ms`；该证据只代表软件渲染测试环境。
- `workspace.guide` 使用 API/Worker 共享严格 parser；任务、AI Credit 预留和审计在 Serializable 事务内完成后才入 Redis，`P2034` 最多重试三次。Worker 只协调 guide 的未派发 DB outbox，并在单消费者启动时恢复 processing 残留；ingestion 的 `dispatch:false` 两阶段关联不被提前消费。模型调用写持久脱敏审计，审计故障只记 error、不会重放已计费 provider；刷新只查询 guide kind。
- 文档防回退 helper `3/3` 与 `DOCS_SYNC_OK` 已有 GREEN；production 默认 visual harness 为 `404`，显式本地/CI 开关才可访问。最新 Web `258/258`、Worker `32/32`、API `65/65`、Domain `334/334`、AI Gateway `12/12`、17-page production build、E2E `12/12`、真实 articulation/affine mutation、standalone Hermes release gate GREEN。架构、视觉证据与安全复审均为 `APPROVE`（无 Critical/Important）；不得引用旧 CSS-signal GREEN 作为当前证据。
- canonical root lint（含 workspace/docs sync）、markdownlint `203 files / 0 issues`、独立 docs sync 与 diff check 均 GREEN。
- 最新本地 production preview：`http://127.0.0.1:3194/dashboard`（mock API `3188`）。无路由注入 smoke 显示 `科研工作台`、mesh `ready`、console errors `[]`；只用于本机视觉验收，未部署 ECS。

## Next action

1. 产品负责人使用真实账号复验无 query 的持久 full-motion、创建 title→source-import、编辑字段航行与角色点击唤起 Drawer；若视觉接受，再继续 Task 9/10/11 未完成证据与高级偏好/主动提示矩阵。
2. 高级偏好设置 UI 与两信号主动提示/cooldown 仍是显式未完成项；历史 progress 不得覆盖本 handoff，旧程序化 3D、整图 PNG/CSS-signal renderer 与 43.8 秒稀疏旧语法不得恢复为任务入口。本机 Docker 继续禁止，生产事实只认 ECS。
