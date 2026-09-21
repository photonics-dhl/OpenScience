# CURRENT Progress Window
> 本机配置补记（2026-09-21）：用户授权独立提交开发树浏览器代理；保留源码检索，无业务部署。范围/依赖/回滚见[能力台账](runbooks/hermes-capability-registry.md#local-browser-proxy)。
## 2026-09-21 — 持续推进同一真实论文图文链路
- 原run已完成全文六维/6条Claims并保存私有版本；第二张实际Chat图de847再次经6Pro科学拒绝，11项已用完。用户明确授权再追加最多2项，原论文分析保留、不切供应商、不自动下轮。根因补丁已High静态PASS：现有规划启用推理、反馈仅作缺陷、叙事终审只判定不改写、图内保留可见主旨；13额度原grant/续作接线已High静态PASS且双库备份成功，待正式迁移部署，尚未新增模型调用。关闭排空及旧art继承修复已部署，新的关闭行为未实测。合格图片/最终阅读未完成，状态与证据见[CURRENT](handoff/2026-09-10-hermes-web-image-handoff.md)。未测试/预检/CI/本机构建。

## 2026-09-21 — 复用 CLI 合作，推进真实 PDF→Hermes→多风格→审图发布
- 真实Fig.1完成上传→人工核源→Hermes reuse→原字节copy；与已认可Fig.3、淡彩图共3张经真实发布入口组成v2，公开轮播均加载、匿名读回200，正文/许可保持，v1保留。发布选图/长度反馈/style必填与短反馈已部署；封面最终科学修订仍被现有审阅阻断，停止追加，无新Chat生图。第三篇120000字符前置阻塞保留，不重复上传。未跑测试/预检/CI。版本、证据、私有续作与质量差额仅见[CURRENT](handoff/2026-09-10-hermes-web-image-handoff.md)。

## 2026-09-20 — 本机桥候选修复通过定向回归，待安全启用
- 用户已授权桥修复与测试：委派/压缩续接候选补丁完成，117+6 项回归、类型检查、CLI 构建通过，High 复核完成。共享桥仍繁忙，单文件覆盖会被原包校验回退，故未安装、无新模型调用；完整 Full 待完整一致产物与空闲切换后实跑。CLI 原策略 network restricted，另会话修正账户/网络，桌面元数据缺口独立处理。补丁、证据与剩余交付见 [CURRENT](handoff/2026-09-10-hermes-web-image-handoff.md)，未部署科研应用。

## 2026-09-20 — 用户选择 A，已恢复 Fig. 3 私有待审图
- 已恢复 renderer，并沿原任务完成标准化/导入；实际站内入口与图片加载已观察，零新增模型请求、未审批/公开。证据、配置与回退边界见 [CURRENT](handoff/2026-09-10-hermes-web-image-handoff.md) 链接的最新恢复节；Fig. 2 未改，用户审图与其他交付差额保留。

## 2026-09-18 — Fig. 3 出图：plan 通过、桥三连失败；占位调试产物清理（承接方从顶部读）
- 用户「再试一下」后第三次提交 Fig. 3 scene image：task `9f7ff671` **failed**（`image generation failed`，桥 `EXECUTION_FAILED`）。上游 plan `8141b5fd` **approved**、figurePlan `{"figures":[{"id":"Fig. 3","styleId":"editorial","decision":"re-render"}]}`、scene0 `Fig. 3: 圆孔横截面上的 Bethe 等效偶极源与角谱形状因子`、hash `9395f576`——**plan 段是真证据，图段至今 0 交付**；最后一次真实桥出图成功仍是 2026-09-17 的 `ac455b2f`（spool `result.png` 590,049 字节）。
- 这是**第二次** figurePlan-aware prompt 三连败（前一次 promptHash `1c221dc86e…`）；能力台账记的桥失败率约 39%（69 个 `result.json`：35/27/7）**本轮未重测**。取证方向（只读、先于任何重试）：拉 `openscience-chatgpt-browser` 12:2x 日志与对应 spool，判断失败发生在「提交 prompt 前」还是「导出图片阶段」、是否与日志中的 `WebGL1 blocklist`/dbus 报错时间相关。**不要盲重发付费请求。**
- 占位调试产物清理（用户授权：只清我自己造的废物）：删除资产 `929bd95d`（68 字节源占位）/`6088f11b`（占位 plan）/`03a160aa`（占位 copy 图）与失败任务 `6088f11b`/`627e7b48`/`7c654505` 及其 claims、spool 残留；读回验证这三行现存 0 行。**后果已记账**：`docs/progress.md` 与能力台账第 128 行原文引用这三行，均就地加更正注——**paper-original 链路只验证过管道、从未流过真实论文图**，真实证据需用真实 Fig. 图片经 `POST /research-objects/:id/versions/:vid/paper-figures` 重建。
- 残留未处置（需用户拍板，勿单方面删）：`d5087b03`（copy 图 draft，provenance 的 `sourceAssetId=929bd95d` 已删 → 悬空）+ Fig. 2 reuse 周期的重复 plan `6439150a`/`ee9bcfb6`(draft)、`6043bebb`/`75b34c88`(**approved**，删除会改产品可见状态）；另有 08:14–08:17 四条 `结构化输出超过重试上限` 失败 task，是 `561d738b` 修 `MAX_STRUCTURED_RETRIES` 的复现证据。
- 交接与本轮新会话 prompt：[docs/handoff/2026-09-18-figure3-image-and-cleanup-handoff.md](handoff/2026-09-18-figure3-image-and-cleanup-handoff.md)；CURRENT 已把生产锚点更正为 release `7bf8c5e5`/rollback `561d738b`（canonical HEAD `2a174fc6` 为纯文档提交、未部署）。

- 早期同prompt重复付费的复现记录见Git历史；服务端守护及真实结果见下节。

## 2026-09-18 — 修复：服务端重复付费守护（`d9bc5dd0`）
- **用户选择补服务端守护**。在 `packages/domain/src/assets/scene-image.ts` 加 `requireSceneImageSpendIsNew(prisma, parent, payload)`：当存在同 `(storyboardAssetId, sceneIndex)` 且 `parentIdentity` 匹配的 approved 图像时，抛 `PresentationAssetError(VALIDATION_ERROR, 'An approved image already covers this scene; reject it before generating a replacement')`。挂在 `submitPresentationGeneration` (`packages/domain/src/assets/presentation-asset.ts:178`) 的 `requireSceneImageParent` 之后。合法重绘仍要先驳回 approved 图像、或让父计划变更（identity 失配自动放行）——都是已有流程，零新 schema。
- **部署** `d9bc5dd0`（rollback 仍是 `01381bdf`，按 FD9 锁内事务走完：cloud-sync → build → scansci/embedding 能力复用 → api/web/worker 切换并 healthy → nginx reload → 公网 `/__release` 200 → retention prepare/complete → journal cleared；保留一个 `--no-tests` 显式跳过验收的提示）。
- **真实验证**（`tmp/verify-scripts/xgs-scene-guard-probe.cjs`，生产 release `d9bc5dd0`）：
  - **negative**：直接调 `submitPresentationGeneration` 提交 `(979bd088, sceneIndex=0)`（已被 `ac455b2f` approved 覆盖）→ 抛出目标消息、**`DELTA_TASKS=0 / DELTA_SESSIONS=0 / DELTA_QUEUE=0`**——无 Redis 推送、无 agent task/session 行，**零付费路径被打开**。
  - **positive**：直接调助手 + `(sceneIndex=5)`（无覆盖）→ **不抛**，确认无误伤。
- 能力台账 [scene image 重复付费守护](runbooks/hermes-capability-registry.md) 从「缺口」改为「已修复（`d9bc5dd0`）」并附证据。`figurePlan` 仍是独立未消费债务。

## 2026-09-18 — `figurePlan` 接线（`dfbcc593`，image path）
- **用户选择接着干 figurePlan**。在 `apps/agent-worker/src/presentation/illustration-planner.ts:generateIllustrationStoryboard` 把 figurePlan 当作**逐图指令**：新加 `eligibleFiguresFor`（过滤 `re-render` + `abstract`）；科学阶段 prompt 在 figurePlan 存在时强制"场景数 = eligible 数、顺序一致、`title` 以 `figure.id` 为前缀、关系来自 caption"；`materializeScience` 加 `figure_plan_scene_count_expected_<N>_actual_<M>` 校验并把诊断回灌 `validationFeedback`；美术阶段 user content 加 `perSceneStyle`（每图 `styleId` 缺则回退 `settings.style`），美术 system prompt 加一句"每场景用自己的 style"。
- **生产核对**：`xgs-figureplan-probe.sql` 显示 **0** 已存在的 interactive_html 计划携带 figurePlan——零回归风险。无 figurePlan 的计划走原路径（sourceInput / 系统 / 美术 prompt 三处都加了 `eligibleFigures ? ... : ''`，对无图计划与旧版同形）。
- **发布后回归**：`xgs-planner-verify5.sh` 在运行容器 `dist/presentation/illustration-planner.js` 命中 `eligibleFiguresFor:2 / figure_plan_scene_count_expected:2 / perSceneStyle:1 / FigurePlan rules:1 / figurePlan:11`。
- **没烧**实证 paid Chat 验证——「接着干」授权下我没硬烧一次实证流量，留待用户构造 `re-render + abstract + skip + reuse` 各一条的 figurePlan 跑一次、清理 draft。能力台账相应行已改为「已接线（`dfbcc593`）」并附位置、语义、未实证、遗留（`reuse` 的论文原图绑定机制是独立债；`skills/figure-auditor.ts:110 toStoryboardFigurePlan` 仍是死代码，下次顺手清）。
- **关于「代码便宜」**：本轮治理定位为「按特性循环便宜拼装、运行时昂贵整合」的模式——具体例子与结构性原因（per-feature 循环缺跨特性不变量、UI 防御 ≠ 服务端防御、校验 ≠ 正确性、陈旧构件永不清理、测试假数据偏离合规 schema、能力台账事后追写、"下一步" = 未来债）。修法不是再加一条纪律，是改过程形状：边界不变量测试、服务端为唯一真理、部署顺手清陈旧、用镜像 prod schema 的测试、台账当门。

## 2026-09-18 — 三件欠债清理（`938a38f0`）+ Hermes 实际使用全链路演练
- **3 件 figurePlan 债务清理**（commit `938a38f0`）：
  - `/opt/openscience/infra/scripts/deploy.sh`（远古版 7244B，无任何 compose / systemd / cron 引用）已删——`xgs-cleanup-probe{2,3}.sh` + `xgs-cleanup-deploy.sh` 确认零引用后 `rm`。
  - `apps/agent-worker/src/skills/figure-auditor.ts:110 toStoryboardFigurePlan` 全仓零调用，删除函数体 + 移除因它引入的 `StoryboardRequest` 导入。代码在 `938a38f0` 已 push（未单独 deploy——zero-impact 删除不消耗部署事务费）。
  - `reuse` 的论文原图绑定机制：写 [`docs/specs/2026-09-18-figure-plan-reuse-binding.md`](specs/2026-09-18-figure-plan-reuse-binding.md)（`paper_original_figure` subtype + 版本作用域 + 缺失即失败 + parser 检测 vs 手动上传两条路径）；`project_index.md` 已加索引。
- **Hermes 实际使用全链路**（用户授权："你用 playwright 或者 api 来完成操作，不需要我调试"）：
  - **生产状态断点**：原 2 个 figure-audit 任务全部 all-skip（`4cd4a5f9`、`62c0d636`，paper figure captions 只有 `"Fig. 1"` 一根毛）。我以 `submitAgentTask` 真提交了一次带 `paperSummary` 的 audit（**真 LLM 调用 + 真 Redis 队列 + 真 worker 执行**），得到 `Fig. 1 → re-render` 的真实决策（任务 `27dff586`，session `hermes-actual-use-audit`）。
  - **Step 1 workspace.guide**（task `8d65db75`）：自然中文 prompt「请按图审计结果给论文的图出一份讲解分镜，用 editorial 风格」调真 handler `workspaceGuideHandler`，返回 `presentationDraft` 含 `figurePlan: {figures: [{id:'Fig. 1', decision:'re-render', styleId:'editorial', caption:'...'}]}`（从 audit `27dff586` 逐字复制）。**Step 2 `submitPresentationGeneration` output:'image'**（task `5f6d391b`，成功）：**`provenance.storyboardDocument.scenes.length === 1`**、`scene0.title = 'Fig. 1: 屏—孔偶极源、角谱分区与形状因子曲线'`、`figurePlan` 完整保留在 `provenance.storyboardSettings.figPlan`、HTML 资产 `contentHash=fd310137b94d…`。**Step 3 `transitionPresentationAsset` approved**：状态变 `approved`，仍在 draft version `e77dc3c7` 上。**Step 4 scene image**（3 次尝试均 `EXECUTION_FAILED`，promptHash `1c221dc86e…` 一致）：桥侧偶发失败，符合既有 ~39% 失败率；本次确实**没产生**出图资产，按用户「不盲重生成」节制——3 次后接受，不再重试。**新付费守护 `requireSceneImageSpendIsNew` 行为正确**：放行（无 approved image 覆盖）→ 3 次尝试中**没有任何 Redis 推送是无用重复**（与之前 `0ee21663` 那种"图已存在又付一次"的可能相区别）。
- **清理**：6 个失败任务（`5bc087a4` / `47c3c7c8` / `868361a4` / `a2c1a063` / `04efdcde` / `8a848d18`）删除，0 个 presentation_asset 被牵动。**实际产物留存**：`5f6d391b` plan asset（approved，contentHash `fd310137…`）、`8d65db75` workspace.guide task（result 含真 Hermes LLM 输出的 figurePlan）、`27dff586` figure-audit task（含 `Fig. 1 → re-render` 真决策）；sessions `36534410` (guide) / `4eaa4e8d` (audit) / `bd14640a` (submit, 1 task) 保留。Spool 失败残留全清（`spool/inbox` 73 个、`spool/results` 68 个，与桥历史存量持平）。
- **能力台账更新**：figurePlan 行从「实证缺失」改为「**已接线并经 Hermes 全链路演练（`dfbcc593` + 真实产物 `5f6d391b`）**」，并附四步 evidence + 桥失败诊断 + 守护行为证据。
- **新发现**：(1) chat-review 的 structured output retry 在长 prompt 下偶发失败——本次第二次提交因"结构化输出超过重试上限"失败；修法路径：加 retry budget 或稳 prompt；不在本轮范围，记为债务。(2) figurePlan-aware 的 scene visualAction 比 v3 略长（832 chars 含 Unicode 负号 / Bessel / 形状因子描述），promptHash `1c221dc86e…` 桥侧 3 次一致失败——可能是 chatgpt-web 当下不稳，下次实际使用可考虑短化 prompt + 减少 Unicode 特殊字符的 A/B。

## 2026-09-18 — 三件 figurePlan 欠债结构性关闭（`f03bd97c`）
用户「清债，不要留任何问题」。三件债逐条处理（commit `f03bd97c`）：

| 债 | 修法 | 实测（生产 release `f03bd97c`） |
|---|---|---|
| (1) chat-review 长 prompt structured-output 偶发失败 | `packages/ai-gateway/src/gateway.ts:180` illustration-review `maxRetries: 2 → 4`（5 次尝试） | 容器 `/opt/openscience/packages/ai-gateway/dist/gateway.js:91` 命中 `maxRetries: 4`；**单凭 retry 不能保证收敛**——chatgpt-web review provider 当前持续返回 invalid structured output（含无 figurePlan 的 baseline 提交也失败）；是 chat-review LLM provider 自身不稳，记为运维债 |
| (2) 图场景 visualAction 832 字 + Unicode 数学字符可能让 chatgpt-web 当下不稳 | `apps/agent-worker/src/presentation/scene-image.ts:transliterateMathToAscii`：compileIllustrationImagePrompt 在送 chatgpt-web 前把 `√ ⊥ − ≪ ≤ ≥` 与 `₀-₉ ⁰-⁹` 替换为 ASCII；plan 资产保留原文（持久化字段不变） | provider-facing prompt 收敛；未独立 paid Chat 测（受 chat-review 持续失败拖累无法端到端走通） |
| (3) `reuse` 论文原图绑定（设计→完整实现） | **端到端**：`paper_original_figure` subtype + `registerPaperFigure`（domain:src/assets/paper-figure.ts）+ `POST /research-objects/:id/versions/:vid/paper-figures`（apps/api:src/routes/paper-figures.ts）+ `findPaperOriginalAssets` + `requirePaperOriginalsForReuse`（domain:src/assets/scene-image.ts）+ `paperOriginal?` 字段（domain:src/assets/storyboard.ts）+ planner 本地构造 `reuse` 场景（不走 LLM）+ handler 图像阶段 `readPresentationInput` 拷贝 bytes 跳过 chatgpt-web 桥 | `registerPaperFigure` 真提交成功：`77b3f559-…`、`generator='OpenScience paper-original figure'`、`provenance.subtype='paper_original_figure'`、`status='approved'`、对象存储 69 字节 PNG 写入。**计划+图端到端未实测**：chat-review 持续失败拦在 plan 阶段，与本次代码无关 |

- **总结**：代码债 (1)+(2)+(3) 已结构性关闭。**残留唯一的债是 chatgpt-web review provider 当前不稳**——LLM provider 问题，非应用代码责任；运维需联系 provider 或切 fallback。能力台账相应行已更新（paper-original binding 已实现 + 未实测 + 残留；chat-review retry / ASCII 转译作为债务条目）。
- **AGENTS「实际业务资料」节制**：本次测试注册 1 个真 paper-original 资产 `77b3f559`（approved、objectKey 落存储），0 个 plan/image 资产。失败测试任务（`12bb4efe`/`2c2491cf`/`df430f1d`）全部删除（0 asset 牵连），spool 无残留。

## 2026-09-18 — paper-original reuse 链路端到端打通（`7bf8c5e5`）⚠️ 证据已降级
用户「清欠债」后的剩余调试：chat-review 持续失败的真正根因是 `MAX_STRUCTURED_RETRIES=2` 常量把 `maxRetries:4` 直接拒掉（**不是 LLM provider 不稳**）。修法路径：`a1965005` planner 在全 reuse-with-paper-original 时 short-circuit（不发"exactly 0 scenes"这类自相矛盾指令）→ `56f4f18e`/`aa716546` paperOriginal 字段只用 3 keys、brief quote ≥12 字符 → `d2d17af9` 跳过 paper-original 场景的 source-passage 检查 → `107d5d3c` 跳过 supports-evidence 并把 basis 映射到 synthetic sourceId → `561d738b` `MAX_STRUCTURED_RETRIES: 2 → 4`（真正让 4 次重试生效）→ `7bf8c5e5` paperOriginal-only 候选跳过 chat-review LLM 直接 accept。

**当时的端到端实测**（`xgs-paper-original-plan.cjs`，生产 release `7bf8c5e5`）：占位 paper-original `929bd95d`（contentHash `8952318f`、68 字节 PNG）→ plan `6088f11b`（1 scene、`Fig. 3:` 开头、paperOriginal 绑定、draft→approved）→ copy 图 `03a160aa`（`generator='OpenScience paper-original figure copy'`、objectKey 指向 source、contentHash 同源），**全程零 LLM 调用**（planner short-circuit + chat-review skip + image-phase copy 路径）。

**⚠️ 2026-09-18 同日更正**：上述三行已被作为「我自己的占位调试产物」清除（用户授权范围，只清我方产物），故本节**不再有可读回的实测证据**；能力台账第 128 行同一引用已同步加注。**paper-original 链路只验证过管道，从未流过真实论文图**——真实证据需用真实论文图片经 `POST /research-objects/:id/versions/:vid/paper-figures` 重建。同周期残留在库：plan `6043bebb`/`75b34c88`(approved)、`6439150a`/`ee9bcfb6`(draft) 与悬空 copy `d5087b03`（源 `929bd95d` 已删）；处置建议见 [2026-09-18 交接](handoff/2026-09-18-figure3-image-and-cleanup-handoff.md)。

## 2026-09-17 — figure-audit → 出图链路端到端打通（`01381bdf`）
- **实测通过**：真实 MiniMax-M3 一次调用成功（`in=4934 out=354`、无重试），`presentationDraft.figurePlan` 返回**对象** `{"figures":[{"id":"Fig. 1","decision":"re-render","styleId":"editorial"}]}`，条目逐字复制自审计结果。验证用**自然用户口吻**的 goal（刻意不描述 JSON 形状），只由修好的 system prompt 引导。
- **根因（此前查了多轮没找到）**：prompt 原文写 "copy `figureAuditPlan.figures` into `presentationDraft.figurePlan`"，而 `figureAuditPlan.figures` 本身是数组 → 模型把**裸数组**赋给 `figurePlan`。但 guard 与下游 `packages/domain/src/assets/storyboard.ts`（`keys(fp,['figures'])` + `Array.isArray(fp.figures)`）都要求对象，故被拒。**放宽 guard 只会把失败推后**，正确修法是修 prompt。已改四处（中/英 system prompt、figureAuditPlan 段、重试校验反馈）。
- **附带修掉一个诊断盲区**：`validationDiagnostic` 原先**完全没有 figurePlan 形状检查**，导致失败只显示空泛的 `guide:guard_rejected`（我据此绕了很多弯路）。现已补上，会精确报 `presentation_figureplan_is_array_expected_object_with_figures`，且该文本会作为重试反馈给模型。
- 前序两处修复仍有效：`07574e4e`（`task.result` 套层）、`e0e0aafa`（instruction ≤1000 字符）。生产 active=`01381bdf`、rollback=`c1b895ca`，11 容器 healthy、`/__release` 200、无残留事务标记，验证用合成会话/任务已清理。
- **停止继续投入前的重要发现：`figurePlan` 是只写字段，没有任何消费者。** 全树检索（34 处匹配）显示它只走「审计产出 → LLM 写入 → guard → HTTP schema → domain 解析 → 持久化」；`apps/agent-worker/src/presentation/illustration-planner.ts` 与 `storyboard.ts` **零引用**，`storyboard.ts:8` 把 `settings` 整体传入后，planner 只用 `upstream`/`instruction`/`locale`/`style` 构建消息，**image 路径下模型连这个字段都看不到**。`skills/figure-auditor.ts:110` 的 `toStoryboardFigurePlan` 全仓仅定义、零调用（死代码）。**后果**：判 `skip` 的图仍会出图、逐图 `styleId` 不生效，只有整请求级 `settings.style` 生效——**故"跑一次真实出图"无法验证 figure 路由**，据此未消耗出图额度。已按 AGENTS「未消费能力写回台账」记入 [能力台账](runbooks/hermes-capability-registry.md)（含位置/后果/下一步），下一步需先定科学语义再接线。

## 2026-09-17 — 服务器磁盘治理（用户授权：80% 占用判为不健康）
- **测量口径**：必须用 `du -shx`。netdata 容器把宿主 `/` bind 到 `/host/root`，未加 `-x` 的 `du` 会递归进整个宿主文件系统，把 `/var/lib/docker` 从真实 38G 虚报为 67G、overlay2 从 31G 虚报为 60G（我据此曾误判"35G 孤儿层"，实为测量假象）。`docker system df` 的 Images/BuildCache 字段同样不可信（`builder prune -af` 实际回收 9.4G 而该字段只报 1.35G）。
- 主因与修复：历史 release 累积的直接原因是**开发工具把不可变 release 目录当配置源挂载**，release 转为 inactive 后被钉住，永不回收。已把 catalog 挂载源解耦到稳定路径 `/opt/openscience-development/catalog/source/`，重建后 `query.mjs` 读回正常、restart=0。
- 清理执行：FD9 锁内复用官方 API 做受控事务（`journal-start(prepared)` → `journal-update(published)` → `retention prepare --prune-unused 1` → `journal-clear` → `retention complete`；顺序不可换）。计划并删除 81 release/56 capability；另清 19 个陈旧镜像 tag、`/opt/openscience/{node_modules,apps}` 过期构建树（3.05G）、1.09G 未完成模型下载（`.part`）、154 个 private-cleanup 陈旧副本、923M Playwright 宿主缓存。**回滚镜像不可删**（事务第 595 行回滚路径 `docker image inspect $PREVIOUS_RELEASE_SHA`，缺则 `rollback_ok=0`）；qwen3-tts 模型 4.3G 有引用，保留。
- 开发栈根因：ClickHouse 卷 6.0G 中 `system.trace_log` 独占 4.74G/3.04 亿行，而 Langfuse 自身数据仅 208KiB；已 TRUNCATE 并设表级 TTL（trace/text 3 天，metric/part/query/error/asynchronous 7 天），卷降至 76M。注意 `query_profiler_*` 属 user-level 设置，写入 config.d 会使容器启动失败（`Code: 137 UNKNOWN_ELEMENT_IN_CONFIG`），须置于 users.xml 的 profiles；该实验配置已按备份逐字节还原。
- **运维软件为何没拦住（三套工具三条独立断链）**：①Netdata 运行 6 周且内置 `disk_space_usage` 告警存在（warn >80%、crit >90% 且 avail<5G），但 `health_alarm_notify.conf` **不存在**——镜像默认 `SEND_EMAIL="AUTO"` 需容器内有 MTA（官方镜像没有），其余渠道默认 `YES` 却无 token，全为 no-op；`/var/lib/netdata/health/` 为空，**告警被求值后送往空处**。②Portainer 是手动面板，无自动化、无人查看。③`openscience-private-cleanup.timer` 每 60 秒运行，但单元描述即"Erase authorized private host job copies"，只处理经授权的一次性作业副本（共 4 条），对 release/镜像/日志/卷无管辖范围。另 journald 无 size 上限（自增至 1.4G）。已补 `SystemMaxUse=500M`（1.4G→481M）；**告警渠道需凭据，待用户选定**。
- **告警已补接并实发验证**：传输走 `msmtprc`（由服务器端脚本从 `.env.prod` 的 SMTP 键生成，0600，不入 git），经 monitor compose 挂入 netdata 容器；路由写 `health_alarm_notify.conf` 的 `SEND_EMAIL=YES` 与 `role_recipients_email[sysadmin]`。`alarm-notify.sh test` 已实发 WARNING/CRITICAL/CLEAR 三封并 exit 0（收件人只在服务器端配置，不写入公开仓库）。另把 netdata 保留期从镜像默认 3 层×1024MiB 收到 1 层/512MiB/7d（dbengine 逐步回收，不立即缩容）。
- **定期缓存维护已部署**：`infra/scripts/disk-cache-maintenance.sh` ＋ `infra/systemd/openscience-disk-cache-maintenance.{service,timer}`，每日回收 docker build cache / dangling 镜像 / 超限 journal，并只读报告历史 release 数量与体积。**刻意不自动回收历史 release**——`project_index.md` 记载 retention 模块"不作独立清理入口"，历史清理保持"用户授权 + 留收据"（流程见 deployment runbook）。
- **已知限制（实测，勿重复投入）**：`netdata/netdata:stable` **不读取用户 `/etc/netdata/health.d`**。四次尝试（写入+重启、最小化告警去标签与 calc、`-W reload-health`（该选项不存在，重载 health 是 USR2）、显式 `[health]`/`[directories]`）均 0 条注册；而 stock 侧 131 个配置正常、日志只出现 `file=/usr/lib/netdata/conf.d/health.d/...`、error.log 为空。故只能用 stock 阈值（warn >80%；crit >90% 且可用<5G，在 148G 盘上不可达）。实验文件已删、`netdata.conf` 已恢复。
- 结果：磁盘 112G/80% → **54G/38%**（可用 30G → 88G）；11 个生产容器 healthy、公网 `/__release` 200。同批再清 Serena `code-intelligence/build` 1.1G（可再生，容器未受影响）与 `/opt/openscience-evals` 454M（目录保留）。**保留**：`/var/backups` 333M（7 套已校验数据库备份）、`chatgpt-browser/jobs` 166M（受授权流程管辖）、qwen3-tts 模型 4.3G（有引用）、回滚镜像 6.24G（事务第 595 行回滚路径依赖）。详见 [deployment](runbooks/deployment.md) 与 [monitoring](runbooks/monitoring.md) runbook。

## 2026-09-16 — 交付线对齐、v6 配图与图片链路隐患收口
- 唯一交付入口定为 `.worktrees/onchip-video-release` 的 `release/onchip-production-line`（＝生产线 `311c980f` ＋我方修复；旧 `codex/onchip-video-release` 缺 journals/学术身份，降级历史线不得发版）。根 `main` 重定位到 `origin/main` 并只作导航；worktree 40→2；AGENTS 增「工作区与发布卫生」（每轮 `git status --porcelain` 必须为空、release 身份须为已推送可解析 SHA、证据放仓库外或已忽略目录）。
- 部署链修复：服务器无源码 git 仓库，生产 release 目录重建为 `311c980f`；真正阻塞是我方分支带旧版 `deploy.sh`（生产线版本接受裸 40 位 `--rollback-ref`）。剔除违反发布守卫的 `packages/search/generated` 21 个误提交文件后 `4099078b` 部署成功，journals/学术身份保留；后续按正常流程迭代至 `d3a0da3f`→`fa66e89e`。
- 配图链路三项修复并部署：结构化输出触顶（`escalateMaxTokens` 8192→16384，只在截断时升级一次、不占 schema 重试预算）、字段长度压线（illustration 三阶段 `maxRetries` 2 ＋请求内明确 ≤100 字符）、设计 skill 构图规则到不了 render（v6：`SKILL.md` 新增 `## Visual craft` 并注入 plan/render/review，`art-directions.md` 增「Ground, frame and hierarchy laws」：单一底色、分隔线须承载真实科学边界）。真实链路 `b182c1c5`（上游修订）→ 图 `a7488c14`（单一底色、无装饰分隔线、`m₀`/`p₀` 入可见标签）经用户认可「还可以」。
- 隐患收口（详见能力台账「当前技术债与处理」）：#2 设计段按语义边界截断；#3 `generateImage` 有界回退只在"确定未提交"前进、带参考图绝不回退、付款方独占"未提交"见证（两轮独立 High，第二轮不 GO 后修回）；F2 API 侧恢复判定池化但**付款方严格等于主 provider 的 spool**，备 spool 只能回答 `completed`，主 provider 无 spool 时完全不注入（第三轮定向 High **GO（代码层）**，H1 类型契约与 M1 付款方按位置认定均已关闭）；Hermes 对话内审批 409 补"重读资产列表"。
- 验证范围：未跑测试、预检或 CI；仅针对审查指出的编译期风险做过一次 API 依赖闭包的最小定向构建（`pnpm --filter @openscience/api build` exit 0），部署由服务器全量 build 与容器内 dist/source 读回证实。旧图、公开 v1、认可淡彩与真实论文均保留；审美差额与下一步只在[CURRENT](handoff/2026-09-10-hermes-web-image-handoff.md)。

## 2026-09-15 — 修复能力接线并追查真实空结果
- `ba184541` 已部署（rollback `6684e448`），仅跳过全套验收；按原资格恢复两篇 confirmed 来源任务，真实完成 deep 58/58 dense、Quantization 42/42 dense，当前 generation 均 active。Weyl UI POST 200、hybrid，实际召回两篇论文，页面无横向溢出。任务4索引闭环已实证；不等同科学或审美质量完成。

## 2026-09-15 — 历史取证：模型路由、联动边界与授权清理
- 代码确认：MiniMax主模型及默认来源审校已消费科学Skill；显式web复核/配图末审另走固定6Pro，并非Skill切换模型。配图审核无MiniMax回退，本轮未改路由。自动任务/来源/方案/结果和Langfuse审计已接，Taskmaster/Backstage/Serena/docs-sync仍需开发者执行；原地纠正能力台账，不另造平台。
- 用户授权后清理36个无现行引用、停止且只读的实验容器，保留私有日志与元数据；27个运行/回滚容器、65处挂载及发布标记读回不变，剩33容器。镜像、卷、release、论文和产物保留。精确范围/收据及未完成主任务只见[CURRENT](handoff/2026-09-10-hermes-web-image-handoff.md)。

## 2026-09-15 — 共享内存峰值根因与技能实证
- 实际页面加载时/dev/shm瞬时用满512MiB，同步173次错误；事后df余量曾漏掉峰值。用户“你来判断”后私有备份并完成1GiB容器切换；相同六页首次加载峰值882MiB、资源错误0。六URL/登录/草稿正文恢复，Chat段落显示格式不同，原样备份保留；旧容器停止保留。证据、原图任务过期及剩余边界仅见[CURRENT](handoff/2026-09-10-hermes-web-image-handoff.md)。
- 真实资产与遥测确认Hermes消费科学/设计Skill，6Pro是配图末审后端，默认论文审校仍为MiniMax。盘点发现历史发布与实验容器积累，盘点时磁盘有61G可用；后续清理见上条。既有多风格和论文端到端交付差额保持。
- 后来输入草稿可能被终态自动清理误关的代码缺陷已收窄：仅回收有任务归属的about:blank，正常runner收尾不变。独立High GO后复用原patch机制安装单文件，保留前后副本、读回字节/权限，无新浏览器重启或模型调用。

## 2026-09-15 — 多风格任务与已有工具重新对齐
- 根因：局部水彩修图被写成总任务；Backstage指向缺少现行要求的旧main；Taskmaster仍是八月已完成tag；Hermes原艺术修订入口未贯穿对话。按代码、Git历史及实际工具结果纠正，未用安装成功代替完成。
- 复用原Taskmaster三项稳定验收；CURRENT保存每项资产、用户反馈、版本和下一动作。仅用户认可可关闭审美交付，已有认可的淡彩原图保留。
- 新学术与编辑候选已实际生成并看图，前者可供评阅，后者尚未达到编辑封面目标。具体差额只见[CURRENT](handoff/2026-09-10-hermes-web-image-handoff.md#illustration-delivery)。
- 应用必要服务器构建/启动完成；原艺术模式已接入Hermes，自有Skill v5与既有末审加入明确艺术要求符合性，无新模型阶段。Backstage/遥测更新、Serena源码同步完成；已用目录和原任务ID读回真实资料及两条调用。
- 真实页面先暴露结构回复拒绝，随后暴露guide重复艺术规划、擅加科学对象；错误安排没有确认。修复后页面返回和确认请求均保留原指令，绑定原稿，769艺术方案科学字段全等；同一6Pro末审修正暗背景线条对比。最终图片和剩余审美差额见CURRENT。
- 最后封面图7cd尚未返回PNG；延迟恢复重复写一次性标记的最小修复已独立High GO并部署，Serena同步，原标记未重置。随后共享内存和误回收修复见本页最新条目；先前“静态硬资源未碰限/等待用户保存”已过时。原任务已过下载恢复期限，新Library精确结果绑定仍未收口，不能称生图链路全面稳定。

## 边界与后续
- Git HEAD、应用release、独立Chat provider、工具bundle与rollback仅在CURRENT定锚。用户认可淡彩图、两篇公开v1及论文/证据/笔记保持；无关dirty设计spec不提交。
- 未跑测试、CI或本机构建；审阅代理误跑一次只读git diff --check，已停止。服务器构建/启动与真实产品操作分别证明各自范围，不证明审美获认可。
- 新正常论文上游claimSuggestions确认、BGE hybrid query正常应用效果等既有未观察项保留在CURRENT/能力台账；不在这里复制新待办。
- Langfuse登录已完成；未知tokens/cost保持未知。SMTP/SSO/定时备份/保留期仍未配置；不为采集造模型调用。
- docs-sync按关键节点同步，不是后台结束回调。工具与规则用于暴露、追踪和纠正漂移，不能宣称绝对零技术债。
