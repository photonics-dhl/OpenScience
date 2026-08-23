# OpenScience (XGS) Current Progress

> 本文件只保留 CURRENT window；完整历史由 Git history 保存，不作为新 session 默认输入。

## 2026-08-24 — Hermes production-ratio local release candidate

- Task 21 本地候选 `2b9cef1` 已实现精确 `360/200px`、右栏默认 anchor、整角色 drag-detach/viewport clamp/desktop-mobile 持久化、真实 protected-region 避让、guide travel/restore 与紧凑 optical-editorial 气泡；v09 模型、美术、帽子/流苏/灯/烟雾及 runtime assets 字节未改。
- 伴随动作与气泡不会抢占 RO：32 动作留在 developer tray，移动端保留三个 44px guide actions；自主短句使用固定 4 秒 atomic beat，普通自主动作在该窗口保持同 owner，hover/drag/guide/task/approval/writing/reduced 等优先状态立即打断。该修复关闭了 390px 下气泡在样式读取/真实 dismiss 前撤下的可重复竞态。
- fresh controller gates：Web `390/390` + 5 Node contracts、typecheck、18 页 production build、Live2D、work-assistant 与 canonical product E2E `40/40` GREEN；Live2D first-ready `906ms`，idle/pointer `0` drops。独立 Sol High 最终审查无 Critical/Important/Minor。
- 本地截图/metrics 位于 ignored `apps/web/test/visual/out/hermes-work-assistant/`；本地 3198 已停止、worktree tracked clean。尚未部署，ECS 保持 `c97926a`；下一步是以它为 rollback 的 `--skip-migrate` dry-run/deploy 与 authenticated 公网三视口验收。

## 2026-08-23 — Hermes production-ratio enhancement design approved

- 用户以 ECS `/dashboard` 当前 release `c97926a` 为唯一比例基线，批准 ordinary `288→360px`、compact/mobile `160→200px` 的精确 `1.25x` 调整；不修改 v09 模型、美术、帽子、流苏、灯或烟雾。
- 线上右栏 anchor 仍是默认 home；整角色拖动后脱离为 viewport-clamped floating companion，desktop/mobile 分别持久化。click 打开现有 drawer，drag 不得误触 click；气泡按象限翻转并与角色分别测量，不得遮挡 Dashboard 主操作、Hermes task rail、导航或 drawer。
- 气泡维持克制 optical-editorial annotation，移动端仅一句短提示；动作与语言共用 semantic beat，输入/审批/modal/drawer/hidden/reduced-motion 时降噪。最终验收必须覆盖本地与公网 authenticated Dashboard 的 `1440×900`、`1920×1080`、`390×844`，不能以动作数量或代码存在代替审美与使用效果。
- CURRENT 实施计划已追加 Task 21：按 size contract → pure placement → Dashboard integration → first-person visual gate → Sol High release review/ECS acceptance 的 TDD 顺序执行；现有代码仍为 `c123a5a`，计划完成不代表实现完成。

## 2026-08-23 — Hermes movable work-assistant correction

- 用户否决“动作画廊占据主页面”的产品层级，同时明确伴随化不等于缩小角色。本地候选 `c123a5a` 保留 Scholar's Tea 的可移动行为边界并恢复完整视觉比例：桌面 `336px`、移动 `176px`；全角色可拖、实时 viewport clamp、位置持久化，窗口缩放后仍可恢复。
- RO 创建是唯一主任务。`/_visual/hermes-live2d` 首屏改成真实创建表单，32 动作/图层/海报控制全部折叠进诊断 tray；产品气泡改为紧凑 ink-edge note，按象限翻转。用户开始拖动即关闭过时引导；移动端不把气泡扩成浮动工具栏，正常 renderer 也不常驻动效设置胶囊。
- fresh Web `360/360`（355 Vitest + 5 Node）、typecheck、18 页 production build、Live2D motion gate 与真实 RO-create Playwright gate GREEN；后者覆盖创建提交、1440/390 大尺寸拖动、边缘夹紧、刷新恢复、resize recovery、气泡让路与主操作不遮挡。ignored 视觉证据：`apps/web/test/visual/out/hermes-work-assistant/ro-create-{desktop,mobile}-large.png`。未部署，ECS 保持 `c97926a` / rollback `06072c1`。

## 2026-08-23 — Wanko v09 Cubism runtime export

- 用户确认形象设计完成；v09 是唯一母版：`C:/Users/Mac/AppData/Local/OpenScience/Live2D/wanko-genie-v1/wanko_genie_v09.cmo3`，SHA-256 `BA111D4E...1121ADD`，原件未改。
- 为绕过 v09 的旧纹理源关联异常，只在非覆盖副本 `wanko_genie_v09_exportprep.cmo3` 应用 Cubism 2.1 atlas 兼容转换，并把最终帽子、六层烟雾和神灯可见 ArtMesh 放入独立 `2048×2048` atlas；辅助图未进入纹理。
- SDK 4.0 runtime 已导出到 `runtime-v09-export-20260823/`：`.moc3`、`.model3.json`、`.physics3.json`、`.cdi3.json` 与 `1024/2048` 两张 RGBA texture 引用闭合。导出后按 alpha 确定性清理两张 texture，`alpha=0 && RGB!=0` 均为 `0`；可见像素与 alpha 不变，bundle verifier GREEN。
- v09 runtime 已以稳定文件名进入 `apps/web/public/hermes/live2d/wanko/`：新 `.moc3`、display-info、两张 texture 与原 12 个 motion 引用闭合，motion 参数全部兼容。Deep review 定位蓝金碎片来自被否决的 Pixi procedural navigator，而非 v09 纹理；active renderer 已删除全部 `Graphics` 叠画，只保留单一 Cubism model/canvas，fresh 真实截图干净。
- 用户明确授权永久删除；C 盘同目录 42 个旧顶层迭代已逐项删除并复核 `Remaining 0`，不可恢复。保留 v09 母版/exportprep/runtime/motions、最终 hat/smoke、批准灯源和最终证据；仓库 v09 是当前唯一部署候选。
- 用户进一步批准删除仓库旧资产：已移除未跟踪 carrier/poster/exporter 实验，以及已跟踪三张旧 pet PNG、旧 OGL renderer、carrier decoder、对应合同与 dead CSS；当前 `public/hermes` 只保留 v09 Live2D bundle、notice 与目录说明。
- 发布审查另修复 Cubism Core 首次失败后 retry 永久等待、系统 reduced-motion 未生效、首屏双初始化、主动释放 context 被误报为 context loss 和旧产品 E2E 漂移；runtime error 已移出旧 renderer 循环依赖。实现候选 `d194a5d7149d25b481f52370c540665c8a51ce4d` 已提交；后续复核把 Field Guide 纳入 aggregate gate，恢复 ADR-010 要求的 original inline SVG/CSS failure fallback，并将 Live2D runtime 标为 Git `-text` 以保证 Windows/Linux checkout 字节哈希一致。fresh Web 360/360、typecheck/build 与 Dashboard + Field Guide 22/22 production E2E GREEN。
- 用户已明确接受 Live2D/Wankoromochi 条款并指示当前服务器使用按开发阶段部署，不等待 publication-plan 分类；ADR-010/NOTICE 已记录该 operator exception，同时明确不冒充已验证法律主体或正式 publication licence。当前获准执行 ECS 开发部署。
- ECS 开发部署完成：DB backup `432K`、7/7；release `c97926ab4188d5d5fc7a6e58e0333d20a600c692`，rollback `06072c1fd3eb30148daec8d4c4a8572fa3bdacc8`。服务器全量 build GREEN，27 migrations current，服务运行/healthy，Parser 保持 `network=none`、只读、`node`、512 MiB/64 PID；公网 `/__release` 与 Core/model/两张 texture 哈希精确匹配，旧 pet/carrier URL 404。公网 21 个适用 product E2E GREEN；唯一未运行通过的用例依赖生产按设计关闭的 `/_visual` harness（404），不属于产品页面回归。

## 2026-08-22 — Wanko smoke-bowl replacement design approved

- 历史 v01–v06 的构图、遮挡、GUI 自动化与恢复流水已由后续 v09 母版/runtime 取代，完整证据保留在 Git history 与外部审计目录；不得恢复旧茶壶、水平腰环或把失败检查点冒充当前资产。
- 用户通过的稳定结构是 model-owned rear smoke/core → canonical body → front veil/rim → paws，隐藏原碗像素但保留共享骨架；不使用 DOM/runtime 拼贴。最终 v09 六层烟雾、PSD/contact/manifest 与受保护母版位置见上一节 CURRENT runtime 记录。
- 历史事故 v02 及其字节一致恢复副本继续只读保留；任何新的有状态 Cubism 保存/恢复仍须使用单一递增 derivative 与 Sol High 守卫。当前 Task 21 不修改这些文件。

## 2026-08-19 — Hermes Wanko Live2D local release candidate (visual superseded)

- **用户确认**：Wanko 作为第一阶段可上线验证角色，不作为永久独占品牌资产；主体直接站在 Workspace 中，不使用旧白底、橙色碗、聚光灯、平台或星空装饰。唯一常驻品牌线索是由前爪引出的朱红 citation thread、接触阴影和两根纸纤维。
- **实现**：Workspace 功能 owner 不变；单 canvas / model / RAF 的 Wanko Live2D 保留 27 动作。renderer 每帧压低 `BACKGROUND/BOWL/EFFECT` 三个旧部件，角色按无碗身体重新放大/上移；三层低对比纸面光域融入工作区。移动 motion control 位于角色卡上方，不再遮挡身体；approval 与显式 reduced 完全静止。
- **真实像素证据**：26 个受控动作全部唯一，最小前景 80,084 px、底边角色像素 0、旧暖色污染 45 px；90 秒 production Dashboard 为 28 段/13 种真实动作，最大间隔 4.415 秒，巡游回 dock 与 pointer 内部关节响应通过。最终视频为 ignored `apps/web/test/visual/out/hermes-companion/page@6a607549e10501ccc433a4e04a02a5ab.webm`。
- **当前增量门禁**：全 Web `347/347`、production browser `19/19`、Web typecheck、18 页 production build、Wanko native 与 90 秒 companion gate GREEN。dev HMR 连续导航曾产生损坏 chunk；干净 production runtime 同矩阵全绿。产品 release / aggregate / docs 门禁留在用户视觉验收后的 Task 7 Step 9，未冒充完成。
- **版本与清理**：分支 `codex/hermes-wanko-live2d@c88c780` 尚未提交；被否决 v5 sprite 保留于命名 Git stash。星空龙只保留最新 `HermesConstellationDragon.blend`（SHA-256 `9CF4694D…DDFA5`）；`.blend1`、渲染/contact sheet、manifest、旧生成/检查脚本和合同测试已清理，二进制进入回收站。
- **待验收/许可**：该 preview 只保留 runtime foundation 证据，不再是最终视觉 gate。公网发布前仍必须登记 Wanko Sample/Free Material 条款接受与 Live2D AI/chatbot SDK publication 判定。生产保持 `06072c1`，rollback `8ecf96c`。

## 2026-08-19 — Readable Workspace / Hermes blank-RO production release

- **已交付**：B「平衡学者工作台」、浏览器无关可读控件、Hermes 字段引导与 evidence-bounded diff 已部署 ECS。用户可从空白私有 RO 开始，逐字段接受、编辑后接受、拒绝或保留 unresolved，再保存、刷新和提交 immutable version。
- **生产版本**：应用 release `06072c1fd3eb30148daec8d4c4a8572fa3bdacc8`，rollback `8ecf96c193e0010329cdf3330819063d1ad7958d`；27/27 migrations current，公网 `/` 与 `/__release` 为 200/精确 SHA，release-failed 不存在，服务健康。
- **真实验收**：公网、真实管理员、真实 MiniMax、零网络拦截。保留私有证据 RO `ad35cac3-cbd9-4a2a-9a00-9762fcc15e91`；1 task，Hermes `idle/travel/working/review`，5 个有原文 locator 的建议，`results` 明确缺失，unsupported claim 0；edit-accept / accept / reject / save / reload / commit 全链通过，version 2。
- **现场修复**：首次真实 gate 在 `PUT /sdf` 返回 400，定位为草稿误用六字段非空发布校验。TDD 新增 draft-core 合同：六字段结构/schemaVersion 必须完整，但 draft 可保留明确 unresolved 的空字段；非 draft 继续使用原非空校验。修复 commit `06072c1`。
- **工程证据**：SDF `16/16`、Domain `343/343`、API `66/66`、全仓 typecheck/build/lint/docs-sync GREEN；17 页 production build。最新 DB backup 433,513 bytes、7 轮。ignored 证据位于 `apps/web/test/visual/out/hermes-blank-ro/`。
- **状态**：blank-RO 功能链保持已部署；本轮只替换 Hermes 视觉/动作运行时并复用该真实流程验收。

## Stable boundaries

- Hermes 是常驻 Workspace 引导员和 Agent 入口；审批态与用户主动 reduced 必须静止，建议只有显式 Apply 才可写入。
- 草稿可保存 evidence-missing 空字段；非草稿完整性、权限、AI Credit、幂等、乐观锁、审计与 commit/version 边界不变。
- 文档只保留 bounded CURRENT window：progress ≤120 行、handoff ≤80 行；旧证据只从 Git history 或显式 archive 查阅。
- 旧 3D、整图 PNG/CSS-signal、OGL mesh、sprite 与未授权 Live2D 候选均为历史；唯一 Live2D 实施例外是 2026-08-19 Wanko CURRENT spec。

## Version tuple

- Branch / technical release candidate: `codex/hermes-wanko-live2d` / `2b9cef1a010c6118bf28ba19be5cf281764c3832`（本次 docs sync/release commit 位于其后）
- Remote candidate: `origin/codex/readable-hermes-guidance@c88c78003957204e6218b8bd2c9c3842a6fbb315`（未包含本次本地候选）
- Local main: `c60ffdd16b85ea8f0d8b047493fa03a4c0230c05`
- ECS release / rollback: `c97926ab4188d5d5fc7a6e58e0333d20a600c692` / `06072c1fd3eb30148daec8d4c4a8572fa3bdacc8`
- Current branch PR: none

## Read first

1. `AGENTS.md`
2. `docs/handoff/2026-08-16-hermes-2d-pet-handoff.md`
3. `docs/specs/2026-08-19-hermes-wanko-live2d-design.md`（approved CURRENT design）
4. `docs/plans/2026-08-19-hermes-wanko-live2d-plan.md`（Task 21 deployment/acceptance CURRENT execution）
5. `docs/specs/2026-08-18-readable-workspace-hermes-guidance-design.md`（已实施功能 foundation）
6. `docs/OpenScience_Kimi_Development_Spec.md`（只读 UI / Hermes / 权限相关段落）
7. 本文件
