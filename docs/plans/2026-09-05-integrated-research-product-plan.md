# Integrated Research Product Delivery Plan

> 执行者使用 executing-plans；只有独立且有明确 owner 的工作才委派。
> 状态：CURRENT delivery plan；首批入口断点已实现并合入 main，完整旅程审计与其余阶段仍待完成。

**Goal:** 分段交付工作区—Hermes—RO、多模态展示与语音编辑完整产品体验。

**Architecture:** 复用既有路由、AgentTask、SourceMap、Claim/Evidence、审批和版本。先查明用户操作断点，再进行最小连接；生成媒体与语音接入同一研究上下文。

**Tech Stack:** 既有 Next.js、React、next-intl、Radix、Fastify、Prisma、AI Gateway 与隔离 Worker；无新依赖决定。

## Global constraints

- 设计依据：`docs/specs/2026-09-05-integrated-research-product-design.md`。
- 生产 application/rollback 为 `6478aa8` / `b32d81c`，开始部署前重新只读核实。
- 不复做 Research Intelligence Tasks 1–12；不修改根目录旧 main 或其他人的未提交内容。
- 每段先参考成熟方案；未经实测不得宣布候选 provider 可用。
- 真实数据操作、发布、迁移和第三方安装遵守既有授权范围；效果按段交用户验收。

## Task 1: 真实页面断点与同事成果核对

**Files to inspect:**

- `apps/web/app/dashboard/page.tsx`
- `apps/web/app/research-objects/new/page.tsx`
- `apps/web/app/research-objects/[id]/{overview,hermes,edit,files,versions,publish,collab}/page.tsx`
- `apps/web/components/hermes/HermesAssistantDrawer.tsx`
- `apps/web/components/navigation/ProductRouteNavigation.tsx`
- `apps/web/lib/api.ts`

**Produces:** 在本计划追加逐步旅程表，每个断点含触发步骤、实际结果、复用 owner、最小修改与验收动作。

- [x] fetch 后核对最新 main、CURRENT handoff 与生产身份的既有实测证据。
- [x] 确认 `frontend/nanqing` 为同事分支，记录持续巡检授权。
- [x] 读取 Dashboard 与 Hermes Drawer，确认已有文献获取和 task/session 路径。
- [x] 比较同事分支与 main 的实际文件，识别已移植功能；只把未包含且适用的成果列入候选。
- [ ] 浏览器完成空工作区、导入处理中、待确认、已有 RO、生成失败、已发布六种状态；记录用户能否找到下一步。
- [ ] 检查跨 RO 切换、浏览器刷新和返回时 Hermes 的目标、任务和版本是否正确。
- [ ] 将每个断点映射到现有代码与测试后，在本文件补充第一段逐文件实现步骤；不得凭文件名猜测修复。

## Task 2: 第一段完整操作体验

**Depends on:** Task 1 的真实断点和逐文件修复清单。

**Consumes:** 既有 API DTO 与 route；不先设计新的统一后端。

**Produces:** 可实际执行的导入 → Hermes 任务 → RO 确认编辑 → 预览 → 返回继续研究。

### 首批已复现断点与实施范围（2026-09-05）

| 触发 | 实际结果 | 修复 owner | 验收 |
|---|---|---|---|
| Dashboard 有待确认材料，点主继续按钮 | 固定跳编辑器，错过待确认任务 | ContinueResearch + DashboardPage | 同 RO needs_review 优先，其他 RO 不串入，无待办仍进入编辑器 |
| 打开 RO 的 /hermes 且不带 task | 显示 missing task，无真实任务入口 | HermesReviewPage + Hermes task entry | 当前 RO 任务列表、空态、错误重试、编辑/材料入口 |
| RO 各页面寻找 Hermes | 二级导航没有 Hermes | ResearchWorkspaceNav | 常驻入口与独立 active 状态，桌面/移动可达 |
| 修改 URL task/RO 或请求失败 | effect 仅监听 task，旧 detail 未清理；失败仍有 loading | HermesReviewPage | 校验返回 RO、取消旧结果、明确错误与重试 |

本批复用 Next Link、现有 Research Folio、getDashboardOverview/getResearchObject、ingestion 确认和已有 deep link；不引入第三方依赖。复审后为既有 ingestion API 增加兼容的 RO 范围参数，见下方合同修正。浏览器证据使用真实 Next 页面与明确的 API fixtures，只证明前端流程，不冒充真实账号/数据库验收。

具体顺序：

1. `apps/web/test/auth-dashboard.test.tsx` 添加 continuation 和 nav 回归，先记录 RED。
2. `apps/web/components/dashboard/ContinueResearch.tsx` 接收现有 tasks，选择同 RO 待复核任务；`apps/web/app/dashboard/page.tsx` 传入已加载 tasks。
3. `apps/web/components/research/ResearchWorkspaceNav.tsx` 增加 Hermes 入口；不扩大后端 DTO。
4. 为 Hermes 入口添加组件与测试，改造 `apps/web/app/research-objects/[id]/hermes/page.tsx` 的空入口、作用域与失败恢复，修改 `messages/zh.json`、`messages/en.json` 对应文案。
5. `apps/web/test/e2e/research-continuation.spec.ts` 验证主继续按钮、直接任务入口、移动空态；再补作用域错误与确认后继续回归。
6. 相关单测、浏览器、Web typecheck/test/build、lint 和独立复审后进入生产发布候选；未验收的状态继续记录为 pending。

同事成果核验：启动时 `origin/frontend/nanqing@e5db5ae` 与 main 有 18 个 Web 文件差异；这批个人主页/设置拆分、身份恢复与移动账号入口现已选择性整合并部署至 `6478aa8`。工具与部署脚本未整合；后续巡检避免重复合并。

- [ ] 先为查明的上下文丢失、错误目标或状态恢复问题编写有意义的失败回归。
- [ ] 复用既有导航、Drawer、任务和 diff 组件补齐断点，统一主动作、返回路径、loading/empty/error 文案。
- [ ] 对选定同事成果做兼容性审查后选择性整合；不整分支盲合。
- [ ] 验证 zh/en、键盘、390px 移动视口和桌面真实交互；检查 Hermes 不遮挡主要内容。
- [ ] 运行相关单测/E2E、typecheck、lint、build；独立审查后按项目授权和发布流程完成服务器验收。
- [ ] 给用户可操作入口、明确的演示步骤与限制；记录接受或修改意见。

## Task 3: 图解与文字修改

- [ ] 在同一论文上比较现有 SVG 输出与 Diagram Design 可借鉴图形语法；查看真实图片效果再定模板。
- [ ] 复核现有 proposal/审批能否支持选定说明和图解修改，缺口单独形成明确 HTTP/domain 合同。
- [ ] 提供真实生成 → 修改要求 → 预览 → 应用 → 保存/刷新链路，确认前内容不变。
- [ ] 将图解集成 RO 编辑与公开展示，来源和生成标记可见；交用户验收实际效果。

## Task 4: 视频

- [ ] 比较 story-to-handdrawn-video、Remotion 与现有生成路径，核实许可、CPU 成本、尺寸、字幕和导出能力。
- [ ] 以同一 RO 做真实分镜/成片样例，选定实现后补充独立视频实施计划与所需安装清单。
- [ ] 接通异步生成、预览、修改和版本展示；失败可恢复，不能用占位视频代替真实产物。
- [ ] 交用户验收实际成片及其在 RO 中的阅读体验。

## Task 5: 语音和讨论回路

- [ ] 对候选 ASR/TTS 核实中文科研术语识别、费用、延迟和隐私边界；MediaRecorder 仅承担录音。
- [ ] 实现显式录音、文本校正与同一修改预览路径，麦克风拒绝时保留完整文字操作。
- [ ] 利用现有协作/版本模块接通公开 RO 的针对性讨论与作者修订，逐一验证目标版本。
- [ ] 分别交用户验收语音修改和阅读讨论体验，不用后台成功率替代交互验收。

## Validation of this planning checkpoint

- 文档同步：`npx pnpm@9.15.0 audit:docs-sync`。
- 文档格式：`npx pnpm@9.15.0 docs:lint`。
- 变更卫生：`git diff --check`。
- 本检查点不声称代码实现、运行时测试、用户效果验收或新部署已完成。

## 首批本地验收记录

- 首批入口修复已实现；Web 7 个真实浏览器交互场景通过（受控 API fixtures），已纳入完整 87-case release suite。同事分支选定成果已整合；完整页面审计与用户效果验收仍未完成。
- 用户已确认五段范围；本批只实现第一段的已复现入口断点，不代表图片/视频/语音或完整产品五段完成。

## 独立复审后的必要范围修正

- 全局最近 20 条个人任务在过滤 RO 前已截断，会把旧任务或协作者任务误判为空；现有 feed 不足以支持 RO 任务页。新增 GET /ingestion?actionable=true&researchObjectId=UUID 的可选兼容查询：先核对 RO membership，再按 RO 过滤后取 20 条，响应仍为既有 tasks DTO；无参数保留个人 Dashboard 合同。首屏继续研究另取当前 RO scoped tasks；其余 Dashboard 列表仍是最近个人工作。无迁移。
- 原 Drawer 恢复第一条全局 guide，会串研究上下文；创建 session 使用既有 researchObjectId 字段，RO 页面只恢复相同 RO，Dashboard 只恢复非 RO session。历史未绑定 RO 的 guide 不在 RO 页自动恢复，不能猜测归属。
- 同事 18 个 Web 文件已选择性整合，保留本轮改动，修复 settings#research-profile 的锚点；没有引入同事的部署/同步脚本。

## 首批候选验证（2026-09-05）

- production browser matrix 87/87 GREEN（含同事 identity/个人主页与本轮 7 个 continuation 场景）；使用独立 fixture 端口 3311，默认 3001 与本机 Windows iphlpsvc portproxy 冲突，未改系统服务。
- Web 479/479 + Node 5/5、domain ingestion 39/39、API scoped route 3/3、全仓 test/typecheck/lint、docs-sync 和 docs-lint GREEN；Web production build GREEN。独立前端审查和 scoped 修正后复审均无剩余阻断。
- 全仓 build 已通过，PR #78 已合入 main `6478aa8ef6045ecef93127c6e3183fc05acb946f`；ECS 全仓 build 与同提交解析器隔离验收通过，部署事务与 retention 完成；公网/loopback 200、core/search 36/36 与 2/2，BGE/ScanSci runtime 通过，公网页面 fixtures 15/15、main CI GREEN。真实 ORCID/SMTP、真实账号研究数据纵向验收未由 mocked 浏览器矩阵替代。
- 非阻断：scoped feed 上限 20 条且未提供分页；viewer 的确认控件仍依赖 API 拒绝无权写入；其他完整产品子阶段保持未完成。

## 首批交付与下一步

- PR #78 已部署至 6478aa8，rollback b32d81c；用户效果尚待验收。
- 验收入口：/dashboard → 当前 RO /hermes → 确认 → RO 编辑；/me → 个人资料、身份与研究项目；/settings → 偏好。
- 首批已覆盖上述四个入口断点及会话作用域修正，尚不能据此勾选六种状态的完整旅程审计。先补齐导入、失败、预览/发布等剩余路径，再推进后续多模态阶段。

## 用户截图反馈：产品界面修订

- 用户否决首批视觉效果，授权先优化再继续流程。采用成熟应用布局：Atlassian spacing/grid（https://atlassian.design/foundations/spacing），8px 节奏、居中自适应容器、克制标题与清晰操作区；保留暖色/朱红品牌。复用现有 Tailwind 和 scoped CSS，无新安装。
- 已复现：profile 的 body reading role 限制整块 grid 为 75ch；缺少 preflight 时 dd 缩进、ul 圆点与链接下划线侵入应用布局；巨幅标题和 20 条长项目名把身份表单挤出首屏。
- 修改 DashboardShell 与 globals 的应用范围布局；profile/settings 使用一致的页标题、资料概要与自适应分区；MyResearchProjects 改为紧凑整行链接及可展开最近列表；精简中英文实现说明。只调整工作台应用表面，公开 RO 长文保持阅读排版。
- 验证：已有身份/continuation 浏览器用例、1440/2048 与 390/320 视口截图；增加真实几何检查与展开访问测试，防止再次仅凭功能测试接受错位页面。随后独立复审、必要测试、构建及服务器发布。
- 之后处理审计发现的具体导入/预览发布断点，不将视觉修订当成完整产品任务完成。
