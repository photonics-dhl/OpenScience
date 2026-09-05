# Integrated Research Product Delivery Plan

> 执行者使用 executing-plans；只有独立且有明确 owner 的工作才委派。
> 状态：CURRENT delivery plan；PR86/390afc0已部署并完成真实PDF图解工作流，下一段推进机制图/媒体展示，提取质量并行改进。

**Goal:** 分段交付工作区—Hermes—RO、多模态展示与语音编辑完整产品体验。

**Architecture:** 复用既有路由、AgentTask、SourceMap、Claim/Evidence、审批和版本。先查明用户操作断点，再进行最小连接；生成媒体与语音接入同一研究上下文。

**Tech Stack:** 既有 Next.js、React、next-intl、Radix、Fastify、Prisma、AI Gateway 与隔离 Worker；无新依赖决定。

## Global constraints

- 设计依据：`docs/specs/2026-09-05-integrated-research-product-design.md`。
- 生产 application/rollback 为 `390afc0` / `c07c8d1`，每次新任务先只读核实。
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

### 下一步图解入口：已核实的复用点

- 现有生成/列表/审核 API 位于 apps/api/src/routes/presentation-assets.ts；domain 位于 packages/domain/src/assets/presentation-asset.ts；Worker 与确定性 SVG/HTML 位于 apps/agent-worker/src/presentation/。公开展示已有 PresentationAssetGallery。
- 当前缺少认证 RO 页面中的 Claim 选择、发起生成、任务进度、草稿预览和审核操作。下一步优先补这条产品路径，先使用 chart，复用既有任务/资产/版本合同。
- 实施前需核对草稿内容的认证读取入口及 exact-version Claim 数据合同；已有列表只返回资产元数据，不能把公开 approved 路径误当成私有草稿预览。图片/视频 provider 保持未验证，不新增安装或绕过权限。
- 已核实私有草稿内容接口缺失；新增时复用公开内容的字节上限、完整性与安全 SVG 检查，成员认证后以 private/no-store 返回，前端通过 img 展示，不注入 SVG。现有 chart 是主张摘要卡片，文案不能称为数据图或科学验证。
- 开放入口前先补现有写授权：沿用 Claim/Evidence 的 owner/maintainer/author/contributor 与 draft Version 规则；生成和审核拒绝 Viewer/Reviewer，Worker 在生成前及提交事务内重验角色、精确版本与来源 Claims，并沿用 draft row fence 防止发布并发。只读成员仍可读取；不另建权限体系。
- 权限修复候选已通过 domain 12、worker 16、API 3 项回归和独立复审；包含生成期间 Claim 内容改变但 succeeded 状态不变的检查。并发测试使用确定性交错，未声称实际 PostgreSQL 双会话验收。入队后的撤权仍可能留下已计费但被 Worker 拒绝的媒体任务，沿用 charged-on-submit；对象上传后拒绝落库可能留下无引用对象。
- 批准 UI 前还需处理生成完成后的 Claim 编辑：修改来源 Claim 时应在同一事务中使关联展示资产失效，避免旧图继续被批准。当前 ID/status 和内容校验不能证明图对应最新 Claim；不在本轮权限补丁内另加哈希或扩大到 Claim 编辑流程。

### 发布复审中修正的两处问题

- Dashboard 最后六行标题压缩改变 protected geometry，触发既有 above-wide 菜单定位缺陷；PR #82 撤回该压缩，保留主要 UI 优化。精确 detached 菜单从 3/3 失败恢复 3/3 通过，修正版 Product88 在 CI 通过。后续改 Dashboard 高度需重验此路径。
- 既有 unsafe patrol→blink-single 别名可能与相邻 micro beat 重复，不能以偶然通过的 CI 重跑代替修复。共用 seed 的解析器改选 microCursor+1，跳过前后动作，保持巡游保护和现有节奏；5 个种子、全部 cursor/wrap 与延迟 signature ticks 回归及 performance 23/23 通过，独立复审无阻断。
- 000120b 候选发布停在隔离 OA 下载，精确探针 SIGINT 后 canonical rollback 成功，生产始终为 6478aa8；不跳过下一候选的真实 OA 验收。

### 后续图解写权限修复验收

- PR #84 / c07c8d1：domain 12、worker 16、API 3 与全仓 build/typecheck/lint/test 通过；CI 33942733721 GREEN，独立安全复审无阻断。并发用例为确定性交错，未冒称 PostgreSQL 双会话验证。
- 首次发布在 mutation 前因 runtime entries 96518→96515 拦截，生产 440266c 不变且无 journal/failed。三个原始路径未保留清单，具体原因未定位；不能宣称已修复构建漂移。旧报告已原子归档，正式重新验收成功；验收期间清单无变化，随后完整 install/database generate/build/normalize/四镜像构建及官方报告校验通过。允许一次 canonical 重试；若再漂移，必须定位生命周期差异后新建候选，不重复重签或跳过校验。

### 最终交付状态（2026-09-05）

- UI 440266c 已部署并交用户查看；随后权限补丁 c07c8d1 部署完成，rollback 440266c。最终公网/active 一致、13 容器运行、36/36 与 2/2、无 failed/journal；ECS build/parser/ScanSci/BGE/runtime/retention、CI 与公网 fixtures 16/16 通过。
- 下一步是来源 Claim 编辑时资产失效、认证私有预览及 RO/Hermes 图解生成闭环；这次交付不等于五段产品全部完成。完整实现与验证证据见 CURRENT handoff 与 progress。

### 图解工作流实施批次（用户已授权继续与真实 PDF 验收）

- 用户允许自主下载开放 PDF、上传验证，并自主选择安装必要开源方案；仍优先既有能力，密钥与用户资料约束不变。
- 复用现有确定性 renderer、任务队列、资产/版本 API、Next UI 与公开 Gallery；本段暂不需要引入另一个生成或渲染框架。外部布局方案只参考适用结构与许可。
- 任务 A：在 Claim 的实际内容修改/删除/替换事务中，使当前 draft Version 的关联 draft/approved 展示资产变为 rejected；沿用现有版本 fence 与审核 CAS，禁止改写已发布版本。先补旧图获批/修改竞争、跨版本隔离的失败测试。
- 任务 B：抽取已有公开资产字节交付为共享 helper；新增 GET /research-objects/:roId/versions/:versionId/presentation-assets/:assetId/content，精确成员作用域可读私有各状态，保留字节上限/hash/安全 SVG，private,no-store + nosniff + sandbox CSP。公开交付原有权限与缓存不变；增加越权/范围/完整性/附件回归。
- 任务 C：新增 /research-objects/[id]/presentation 页面和工作区/Hermes入口。使用 listVersions UUID、精确 Claim选择、幂等生成、真实任务轮询、资产列表、私有 img 预览及 expectedUpdatedAt 审核。只读或发布版本禁写，错误可重试；任务恢复核对当前作用域，切换版本清除旧结果。中文/英文和390px均可完成。
- 任务 D：选择可合法获取且适合解析的论文，记录来源/许可与主题；复用既有真实验收脚本和受控测试身份，执行下载→上传→解析→确认→版本/Claim→生成→预览→批准。截取真实页面效果，核对来源内容而非只看响应成功；结果保留可供用户查看，公开发布按已有许可/审批流程。
- 最终：相关 RED/GREEN、全仓 build/typecheck/lint/test、真实浏览器、独立安全/UI复审，合入main后按canonical服务器流程验收部署；记录具体已完成路径与剩余视频/语音范围。

### 真实论文验收发现与修正

- 真实来源为 Lin 等 All-Optical Machine Learning Using Diffractive Deep Neural Networks，https://arxiv.org/abs/1804.08711v2；下载 PDF 4,000,593 bytes / 20 pages，仅用于受控私有研究验收，不公开再分发全文。现有 pdfplumber 可用，无新增第三方安装。
- 已由真实页面完成上传、Hermes review 与 Editor commit。自动提取 problem/insight/limitations；method/results/reproducibility 由论文核对后人工补齐，字段明确保留 Human-reviewed supplement。91.75% 是 10,000 个测试样本的数值准确率；88% 是 50 个经过选择的物理样本与数值分类的一致率，不能混写。
- 真实解析确认只写 SDF，不自动创建 Claims；现有 Editor 也没有 Claim 创建入口。因此任务 C 加入核心主张表单，复用既有 POST claims 与客户端 UUID 幂等，保留人工来源及 missing 证据状态。不能后台植入 Claims 再宣称页面闭环。
- 恢复图解任务新增 exact RO/version/task GET；旧个人任务 GET 不提供足够作用域保证。页面异步完成必须检查当前作用域，版本切换清空选择，所有写操作要求 draft 与内容编辑角色；审核冲突刷新实际 CAS，PATCH 的部分 DTO 不得替换完整资产条目。
- 真实脚本曾在 Editor hydrate/load 前点击而超时，等待实际研究标题后成功。Editor 提交输入与按钮改为加载完成才启用。真实证据保留于 ignored apps/web/test/visual/out/chart-workflow/；后半段图解仍待修正版部署后验证。
- 后续核实 Editor 没有携带导入源文件。Hermes 的继续编辑带 ingestionTask，Editor 校验同 RO 且 confirmed 后将文件并入提交；先读取最近版本 manifest，按 logicalPath 合并，避免遗漏旧附件。E2E 覆盖已有 A.pdf + 新 B.pdf 均保留和外部研究任务拒绝。
- Renderer v2 改为完整换行的主张卡片，标签不再声称科学结论已验证；v1 保持安全内联读取兼容。有效极端输入能生成数十万像素高 SVG，原字节上限不足以限制绘制尺寸，因此绘制高度上限 8192，超限明确要求减少主张/缩短文本，不静默删去限定条件。19 项 renderer 回归通过；本地真实论文内容与中英文截图检查无横向溢出。
- arXiv 页面许可为 non-exclusive distribute grant to arXiv（https://arxiv.org/licenses/nonexclusive-distrib/1.0/license.html），不是全文开放再许可；验收论文留在受控私有空间，用户可查看导出的自写摘要图解和页面证据。
- 提取片段修正：原实现将头尾已有文本和中段重复命中的关键词计入八次候选额度，可能不再选取正文关键结果。两项 RED 回归复现后，跳过已覆盖锚点，保持 24,000 正文字符与偏移合同；27 项 extractor 测试通过。本地 PDF 文本旧片段缺 88% 结果，新片段包含；91.75% 两者都有。未取得生产 canonical parser 文本，不能声称已证明三个空字段的唯一根因；部署后对同一论文重跑比较。

### PR86 生产与真实图解验收

- 390afc09d3b6ec64d5b23e64f6bffe6bf8a375e7 已部署，rollback c07c8d15e5ba3b722577f42d6ad72af8c83189fe；CI33947575816完整99项及Hermes专项通过，ECS完整build/Parser16/ScanSci OA与Worker/BGE/迁移/健康/retention通过，13容器运行，active与公网一致。本轮无runtime漂移。
- 真实页面将已确认的源PDF带入版本，再通过表单创建3条人工主张、发起生成、私有预览并批准；匿名内容请求401且private,no-store。实际修改来源Claim使旧approved资产rejected，恢复来源后重新生成批准成功。未用后台植入Claims替代页面操作；失效检查单独用受控API执行并记录。
- 相同PDF在新版本重新上传/解析仍缺method/results/reproducibility，未提高字段完整度；最初展示版本保留人工补充标识。自动提取/证据匹配原因待进一步诊断，不能宣称选择器修正解决了全部模型输出问题。
- 当前输出是可追溯的主张摘要卡片，real-chart.png/svg与桌面/手机截图可验收，源PDF和受控RO保持私有。所有验收会话已注销；文件位于ignored chart-workflow目录。
- 下一段按用户要求继续功能与展示：成熟方案支持的机制图/图片、视频及Hermes语音编辑讨论；提取完整度和主张/证据自动衔接并行优化。
