# Integrated Research Product Delivery Plan

> 执行者使用 executing-plans；只有独立且有明确 owner 的工作才委派。
> 状态：CURRENT；2026-09-06 收尾与页面调查完成，见末尾审计。应用4d39808 / rollback f144eb7（PR102选择性同事UX已部署）；独立动画demo9848411。整体联调和改版先经 grill-me 讨论，旧任务顺序不构成继续实施授权。

**Goal:** 分段交付工作区—Hermes—RO、多模态展示与语音编辑完整产品体验。

当前调查入口：[2026-09-06 收尾与页面审计](#closeout-20260906)。以下实施任务保留为历史/候选，等待用户讨论后重排。

**Architecture:** 复用既有路由、AgentTask、SourceMap、Claim/Evidence、审批和版本。先查明用户操作断点，再进行最小连接；生成媒体与语音接入同一研究上下文。

**Tech Stack:** 既有 Next.js、React、next-intl、Radix、Fastify、Prisma、AI Gateway 与隔离 Worker；无新依赖决定。

## Global constraints

- 设计依据：`docs/specs/2026-09-05-integrated-research-product-design.md`。
- 当前生产 application/rollback 为4d39808 / f144eb7（2026-09-06实测）；以下早期检查记录为历史证据。
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

### 当前执行批次：D2NN 科普样片

### 服务器演示执行（用户已批准继续）

目标是在ECS实际重新渲染已验收分镜，并提供可访问的演示页面；不把单论文演示标记为任意RO自动生成。不变更当前应用release/rollback、数据库或私有RO。

1. `apps/media-demo/` 固定人工核对绘图/CLI、参数保护测试；输入仅原创插图与已有5段WAV，输出720pMP4/海报/分镜/真实运行指标。Linux使用Noto CJK字体，配音文件复用而非宣称Linux TTS已实现。
2. `apps/media-demo/Dockerfile` 使用Node22、复用ScanSci Chromium、Debian FFmpeg/Noto CJK、精确playwright-core依赖；一次性无网非root容器，限制CPU/RAM/PID/临时目录，输入只读，输出在独立demo目录。非任意用户代码运行器。
3. `apps/media-demo/web/` 提供科普视频、章节、来源与明确演示说明；仅公开原创媒体和页面，不公开私有PDF、源脚本或原始旁白目录。
4. `infra/scripts/deploy-science-video-demo.sh` 完成受管Nginx片段、原配置备份/失败恢复和独立目录发布；Nginx原生Range播放，禁止往active应用runtime tree写演示文件。既有用户部署授权适用。
5. 部署前审查及有意义测试；服务器镜像build、隔离实际渲染、ffprobe/decode与公网首播/seek/390px截图，复核应用release/健康未变。只报告实际时长与资源，不用本地25秒替代ECS实测。

用户新增纠正与参考：开始镜像构建前未完整盘点现有Chromium/Playwright缓存与镜像，不能仅凭PATH无可执行文件判断能力缺失。实际Chromium在ScanSci的 `/opt/scansci-browsers/`，Chrome151.0.7922.34/revision1234精确匹配playwright-core1.62.1。旧重复安装构建acc3963ac653已主动停止（exit137非OOM），无暂停残留。改用多阶段复制完整262MB headless-shell bundle到独立renderer；只补FFmpeg/CJK/运行库，不复制生产容器overlay，不继承ScanSci服务或运行权限。应用生产仍未变。Docker最终ldd/launch/成片验收通过。

新参考为用户提供的微信公众号文章“过去7天·GitHub被加星最猛的9个videoSkill”；正文访问受限，已据可读元数据定位并查阅[creator-buddy官方仓库](https://github.com/SpaceZephyr/creator-buddy/tree/main/video-Skills)。`space-video-broll`的连续运动叙事、已有浏览器探测和确定性时间轴与当前路线吻合；`space-video-script`适合口语化/逐秒分镜，`space-video-subtitle`强调实际音频时间与科研术语校对。`space-video-broll-sketch`使用Seedance/libtv，不是本地免费生成器；它的静止白板/硬切风格也不能原样替代用户认可的光学动效。未发现仓库LICENSE，暂参考方法，不直接复制代码入产品或批量安装技能。

用户已认可科学插图方向并批准按质量与成本自主选型。本批先产出可播放样片，不把单篇预制动画当作任意论文自动生成能力。

- [x] 核对 Git 与服务器：2026-09-05 release/rollback 仍为390afc0/c07c8d1；16 CPU、约30GiB内存，nvidia-smi和宿主机ffmpeg未发现；13容器运行，公网与loopback健康。
- [x] 比较成熟方案：diagram-design提供HTML/SVG图形语法；story-to-handdrawn-video基于Remotion做无声画面轨；Remotion自动化商业许可需按实际组织情况核实。当前已有Playwright与FFmpeg足够验证样片，暂不新增渲染框架。
- [x] 在 ignored `apps/web/test/visual/out/science-video/` 保存分镜、可复现脚本、MP4和抽样帧。为完整保留旁白，成片46.25秒（比原45秒目标多1.25秒）；首尾复用生成插图，中段为传播/干涉/探测动画。
- [x] 核对五层结构、训练/推理、10区域光强读出；主线程查看海报及干涉/探测帧，ffprobe证实1280×720、24fps、H264/yuv420p与AAC，1,779,576bytes；全片解码exit0。
- [x] 独立High审查现有presentation接入缺口；未绕过权限或启用占位provider。主线程本机浏览器首播/跳转26.96秒成功、无video error；390px无横向溢出，证据为playback-validation.json与截图。
- [x] 输出实际视频、分镜与限制；用户视频效果验收待反馈，独立服务器渲染已实施；RO自动接入尚未实施。

样片产物：`d2nn-science-explainer.mp4`、`source-artwork.png`、`poster.png`、`frame-*.png`、`storyboard.json`、`narration.srt/vtt`、`preview.html`、`render.mjs`、`narrate.ps1`、`README.md`、`validation.json`、`playback-validation.json`。本批项目局部Gyan FFmpeg9.0.1保留许可证；系统Scoop shim无目标bin，未改系统安装。编码约21秒按文件时间估算，非严格性能基准；首次下载约158秒。新增付费API调用0，已有图的历史成本与硬件成本未计入。旁白为Windows Huihui，Linux服务端替代方案尚未选择；SRT短语时间近似，画内要点字幕按场景显示。

v2效果迭代：用户认可v1并要求过渡自然、动效突出；`render-v2.mjs`加入0.6秒画面过渡、3.5%镜头推进、层板依次入场/波包响应与区域7柔和脉冲。`d2nn-science-explainer-v2.mp4`保留46.25秒旁白，4,798,719bytes，720p/24fps/H264/AAC；渲染计时25.173秒，新增模型调用0。主线程完整解码exit0并直接从最终MP4抽取第23秒确认文字/画面；v1保留。README-v2/validation-v2/render-timing-v2保存制作方法与证据，生产未改。

独立 High 架构审查已核对的接入缺口（本批不冒称已修复）：

1. `apps/agent-worker/src/presentation/minimax-admin.ts` 只有接口，且仅传 kind/Claim IDs；`src/index.ts` 注册时未注入生成器。应在 Worker 按当前授权版本解析 SDF/Claims/Evidence/SourceMap，形成有界叙事与分镜，再交给 Gateway 和 renderer。原始 proof 与衍生资产必须分开。
2. `PresentationWorkbench.tsx` 当前只生成 chart，尚无视频播放器；Hermes 需要绑定具体资产和版本的生成/修订动作。样片手工分镜不能证明这条自动链已打通。
3. Worker 输出上限10MiB、reader上限16MiB，private route拒绝Range且reader全量buffer。正式视频接入先按实际成片决定容量，并验证首播、seek与移动播放；不能仅把MP4上传就声称可用。
4. 现有Claim变更失效可复用；当生成叙事消费Evidence时，也要覆盖Evidence变更。重试要复用已完成媒体，避免同一任务重复消耗provider额度。
5. Renderer部署应仿照parser的独立无网、无Secret、非root、资源限制容器，接收验证后的本地资产与JSON；不让模型HTML/外部URL直接进入浏览器。首阶段不需要新表、新hash或全局门禁。

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

### ECS独立演示实测（2026-09-05）

独立服务器演示已部署：source 6a1b848a3df109098e5f1b9721e6c4df06c2c6d0，run 6a1b848-20260905T081000Z；公网 /demos/science-video/d2nn/。复用ScanSci Chrome151完整headless bundle，CPU渲染22.80秒生成46.25秒720p/H264/AAC视频（4,814,309 bytes），无新增付费API调用。全片解码、五项资源200、Range206、实际首播/章节seek、390px无溢出及零页面异常通过；内部路径最终404（input/先308规范化）。应用release仍390afc0。

首次公网验收发现Nginx精确location将文件alias再次追加index.html导致500；6a1b848改用root+try_files，重新部署并以真实GET/浏览器验收通过。早期测试只覆盖配置事务，不能替代真实Nginx请求。新增参考creator-buddy/video-Skills的连续动作、口语分镜与字幕对齐方法；微信正文被验证页阻断，已读公开仓库原件。仓库未发现LICENSE，不整包复制；sketch依赖模型渠道，不等于免费本地推理。

### Qwen CPU配音试听（用户已批准）

1. 盘点并复用已有CPU PyTorch基础，隔离试验与BGE服务；模型独立存放，新增磁盘峰值预算15GB。
2. 下载固定版本Qwen3-TTS 1.7B CustomVoice（约4.52GB），不使用云API，不安装VoiceDesign/Base。
3. 同文案生成Serena、Uncle_Fu、Vivian短试听；固定随机种子，记录加载/生成耗时、音频时长、峰值内存与磁盘。容器无网推理、资源受限、任务超时。
4. WAV完整解码、非空/有限波形校验后提供实际音频；正式RO/Hermes接入仍走Gateway，当前是隔离模型评估而非产品新端点。
5. 更新runbook/索引/进度，按实测决定CPU适用性。

实测结果：Qwen三音色已在ECS CPU完成：Serena15.92s/生成39.57s、Uncle_Fu15.68s/39.45s、Vivian17.68s/43.99s；峰值进程RSS5.22–5.31GiB，4线程/BF16/SDPA，付费API调用0。三段WAV全片解码、有限非零波形通过；自然度与内容完整性待用户试听，不能把生成成功当作听感验收。基础镜像971705460bytes；子镜像2043364436bytes已含基础层；模型4520217432bytes。df可用101313294336bytes（94.36GiB），较清理后占用增加约6.11GiB；公网/loopback200、应用390afc0不变。

### Voice naturalness revision

用户反馈第一轮Qwen比系统语音好，但仍机械。复用Serena/seed42/CPU模型，先生成A（原文+具体日常聊天指令）与B（相同聊天指令+短句口语文案）。B保留五层结构、传播分类，并补充训练制造在先，避免误解为无需训练。原样本保留，各候选输出独立目录；不追加模型或付费API。比较A与旧版看指令影响，比较B与A看口语稿整体影响（B时长和措辞变化，不是严格同文案实验）。最终自然度需用户试听。

### Full video conversational narration (approved B)

User accepted B naturalness and approved applying it to full demo. Generate five reviewed scene paragraphs with the existing offline Qwen/Serena runtime and fixedseed42; retain original demo release for rollback. Reuse audio-duration scene timing, attach bounded optional narration.json with scene-level exact-text cues, replace stale Windows provenance. Update chapter buttons and page duration from actual WAV timings, then build/render/publish via existing isolated demo transaction. Validate narration4 unit tests, renderer cue bounds, full MP4 decode, real browser playback/chapters/mobile and unchanged app release. No new model, API, schema or gateway endpoint.

完整口语视频交付实测：历史独立视频演示：source617ed1ca4365d67c1e363b200e14fd39ef4f9f57，run617ed1c-20260905T101000Z；用户认可B口语方式后，五段Qwen/Serena旁白总长37.12秒、生成耗时91.82秒，新视频40.00秒/4,422,573bytes/720p，ECS渲染20.52秒。字幕按场景真实音频时长显示，手机另有同步可读字幕；章节0/7.541667/16.291667/25.75/32.166667。公网资源200、Range206、实际首播/跳转、手机字幕内容与无横溢出、完整解码均通过；应用390afc0/回滚c07c8d1保持不变。此前6a1b848-20260905T081000Z的46秒系统配音版保留，可按runbook回退；当时新增版本CI待完成；当前最终main CI已通过。

### Continuous narration accepted (v4)

User accepted v4 relaxed full WAV (41.28s); further voice polish deferred. Preserve the exact single audio stream, bypass legacy per-scene padding, and derive five visual intervals from reviewed sentence pauses at 0/6.45/11/20.56/31.81 seconds. Sentence captions use waveform silence boundaries, not claimed phoneme forced alignment. Update mobile chapter captions and duration. Validate bounded input/metadata, unchanged audio sample stream at staging, render/decode/public playback on ECS; keep prior demo for rollback. No new dependencies, model calls, or application/schema changes. Then proceed to artistic visual styles in the next product increment.

历史技术风格视频：f4b4db3df77c7568b0c2a7e266035dc6f5f42303，run f4b4db3-20260905T113000Z。用户已接受v4完整配音；原WAV41.28秒逐字节一致，直接AAC封装，无分段/补静音/变速。视频41.292秒/991帧/4,432,202bytes，ECS渲染20.50秒。字幕依据语句停顿，章节0/6.45/11/20.56/31.81；10项渲染测试、音频4项、lint/docs、独立发布复审、全片解码、公网200/Range206/实际播放跳转/390px字幕无溢出/零页面错误均通过。应用390afc0/回滚c07c8d1不变，旧demo617ed1c保留。当时PR88 CI待完成，现已通过。下一步图片/画面艺术风格，声音后续微调。

### Artistic visual iteration (approved next step)

Keep the accepted v4 full narration and sentence timings. Add an optional watercolor visual style while retaining technical rendering as the default for old inputs. Generate an original panorama with exactly five plates and ten detector cells; full-image contain framing protects scientific objects. Reference story-to-handdrawn-video's contained composition and monochrome-to-color reveal, then adapt to the existing CPU Canvas renderer rather than adding a second full Remotion runtime. Apply consistent pencil contours/paper material and restrained wave motion to mechanism scenes. Render and inspect representative frames, then deploy the isolated demo and validate audio, playback/Range/mobile. Scientific limits remain visible; illustrated intensity values are not measurements.

淡彩独立演示发布时验收（应用版本为当时状态，当前应用见文末RO接入验收）：source381705a32deeed38fb94564eccbcbb2c66fb7739，run381705a-20260905T121000Z；原创2172x724五层/十探测区全景、线稿显色、纸张与石墨质感。用户已认可的v4原WAV保持逐字节一致；视频41.292s/3,203,000bytes，ECS渲染37.76s。11项测试、ESLint/docs、独立复审（technical兼容/画面确定性/无裁切）、服务器build/全解码/public200/Range206/播放跳转/手机字幕无溢出/健康通过。应用390afc0及回滚c07c8d1不变；原技术风格f4b4db3保留。一次内置生图，无新增服务器依赖，render模型调用0不代表图片生成免费。视觉效果待用户验收；下一步按反馈优化或接入RO/Hermes媒体能力。

### Reviewed RO media integration

1. Implement admin+writer/draft scoped import, exact Claim snapshot checks, existing version fence and replay semantics, draft status/audit/provenance; CLI defaults dry-run.
2. Add authenticated and publication-guarded single Range video delivery after complete digest verification, preserving16MiB bound; add private video preview and server canTransition capability.
3. Run focused permission/replay/tamper/range/UI tests, full build/typecheck/test/lint and independent security review.
4. Deploy through canonical full application transaction; create two-session import evidence in the controlled admin-owned private D2NN RO, verify replay, approval and Claim invalidation, actual desktop/mobile playback/seek, anonymous denial and health. No role escalation, external invitation or public research publication.
5. Update CURRENT with actual app/demo/rollback tuple. Automatic narrative/image/video generation and Hermes edits remain next slices.

### Reviewed-media delivery checkpoint — 2026-09-05

Steps1–5 for reviewed-media import are complete on application83b2933 (rollback390afc0): source/image-bound Parser acceptance, server build/runtime/migrations, real two-session database import, browser playback/Range/individual approval/Claim invalidation and restoration all passed. The private controlled test leaves assets rejected after invalidation; approved screenshots are prior-state evidence. No arbitrary-paper generation or Hermes media-editing completion is claimed. Next prioritize clear media-page hierarchy and terminology, then sourced narrative/storyboard and generation/editing orchestration.

### Media-first layout implementation

1. PresentationWorkbench and localized navigation/copy: gallery first, responsive contained media, explicit status/actions, collapsible source metadata and subsequent concept-map editor; reuse tokens and native controls.
2. Verify component semantics plus existing E2E permissions, scope changes and recovery. Run scoped lint, Web build/typecheck and local browser screenshots at desktop/390px; check keyboard and reduced motion.
3. Independently review the diff, sync docs/index, merge candidate, prepare exact Parser acceptance and canonical ECS deployment. Reuse existing media/voice/runtime; no new paid generation or dependency installation.
4. Validate real private RO media visibility, playback/seek and disclosures in both locales after deployment; logout test session. Record exact source/rollback and screenshots, then continue sourced generation/Hermes editing as a separate slice.

Media-first steps1–4 complete on64ae872 (rollback83b2933): PR91 CI, Web499+5 tests,10 E2E, full server build, exact Parser acceptance, BGE/ScanSci runtime, core36/search2 migrations and13 running/10 healthy checks passed. Direct public browser en/zh ×1440/390 verified contained images,41.291667s playback and28s seek, keyboard disclosures and no overflow; session closed. Local buffered proxy playback was unreliable and is not the final playback evidence. Next: sourced narrative/storyboard and generation/Hermes revision integration.

### Sourced storyboard implementation — deployed d6507ea

- [x] Domain/API/Worker: add bounded storyboard contract in packages/domain/src/assets/storyboard.ts; extend presentation payload and narrow list DTO, billing routing and exact base validation in presentation-asset.ts; connect Gateway planning in apps/agent-worker/src/presentation/storyboard.ts and existing handler/index; existing API generation accepts optional validated settings. First failing contract/billing/scope/changed-source tests, then implementation.
- [x] UI: apps/web/components/presentation/StoryboardPanel.tsx plus Workbench/page/API helper/i18n integration; select Claims and style, show charge, create scenes, feedback creates separate draft, compare parent/new before existing approve. Preserve task recovery/version races; tests for create/revise/readonly and scope.
- [x] Integration: focused tests, all-workspace build/typecheck/lint/tests and independent security/concurrency review; real local browser preview, exact candidate Parser acceptance, canonical server deployment, real Gateway create+revise+approve/reload and revoked/invalid source checks. No media rendering completion claim.
- [x] Record exact release/rollback and browser evidence in CURRENT, progress and index; next consumer is image/video production from reviewed plan.

Sourced storyboard acceptance (2026-09-06): canonical d6507ea/rollback64ae872, PR93/main CI, exact Parser/build/runtime/health checks passed. Real controlled RO used 3 tasks and4 MiniMax-M3 calls (one structured retry), charged3 credits with stable replays. Human review corrected an unsupported independent-validation claim via a new revision; corrected six-scene45s plan approved, prior drafts retained. Four public-browser locale/viewport cases, approval/reload and existing media playback passed. This is selected-Claim planning, not automatic raw-paper understanding, image/video production or global Hermes dialogue.

### Reviewed storyboard scene imagery — deployed 615ca2d; quality iteration pending

- [x] Gateway: add bounded single-image provider/API, metadata-only audit, no automatic retry, bytes/type/dimension validation; tests for disabled/malformed/oversized/provider failures. Reuse existing credential and official endpoint.
- [x] Domain/API/Worker: optional sceneImage payload and narrow DTO; approved exact parent and Claim set before charge and final write, parent rejection invalidation, admin+writer authorization, prompt planning and real image persistence; regression tests for scope/replay/invalidation/races.
- [x] UI: per-scene generation on eligible approved plans, explicit one-credit copy, parent/scene attribution and existing image approval/task recovery; bilingual mobile/desktop tests.
- [x] Technical acceptance: workspace checks, independent review, canonical deploy615ca2d/rollbackd6507ea, real CN image generation and four browser cases plus ECS existing Chromium decode passed. Two attempts each reserved1 credit; first global request failed, second CN image succeeded in27.588s. Dollar cost unknown.
- [ ] Visual acceptance: first image remains draft because its abstract rays do not clearly explain diffraction/interference. Improve subject placement and causal composition before approval; then reviewed image -> CPU video.

### Concrete composition iteration

1. Add planner tests in apps/agent-worker/test/presentation/scene-image.test.ts for structured fields, source context, invalid/oversized output and exact assembled prompt bound; update the existing handler fixture.
2. Change only apps/agent-worker/src/presentation/scene-image.ts to request and compile concrete composition, keeping its string return contract and existing Gateway.
3. Use the controlled approved scene for a bounded real candidate evaluation before deploying; inspect scientific clarity and retain prior draft. Run Worker tests/typecheck, workspace gates and independent review.
4. If visually useful, merge, canonical deploy with current rollback615ca2d, exact Parser/runtime checks and real product preview acceptance. Record exact candidate/production separately and pending limitations.

Composition checkpoint: implementation/tests/review completed; real MiniMax picture fails visual criteria, so step4 deployment is intentionally pending. Do not merge this as an accepted quality fix. Next determine a server-callable image provider or source-constrained layout approach that passes the same controlled scene before production rollout. Comparison images and exact prompt are in ignored science-video/composition-* files.

### CPU image feasibility

1. Verify actual release/resources and upstream model/license/size metadata; independent High resource review.
2. infra/local-image-eval/prepare.py downloads the single pinned Q4 set, validates published digests and safe archive extraction, preserves incomplete downloads; root only in isolated download container.
3. infra/local-image-eval/run.mjs performs an offline nonroot bounded512×288 run with resource monitoring, preserving output/log/report/stopped container. Reuse existing CPU foundation.
4. Inspect generated scientific composition and actual elapsed/RAM/production health. Only integrate after quality and cost feasibility; otherwise retain documented evidence and stop this route.

2026-09-06 user steering: PAUSE local model preparation; retest MiniMax before any further installation. Exact download container stopped; about1.1GB archive/partial remains under /opt/openscience-evals/local-image, no weights complete and no inference/runtime install executed. Do not resume automatically. Production615ca2d/rollbackd6507ea unchanged.

MiniMax retest complete: same explicit scene prompt/seed42, image-01 optimizerfalse33.039s vs optimizertrue58.000s. Both preserve the screen better, but waves/intensity remain scientifically weak; optimization introduces a focus-like shape. image-01-live optimizertrue failed88.899s within the120s request ceiling; exact provider failure cause unknown, no automatic retry. Three audited image calls, no M3 call, no product asset/credit reservation; provider dollar costs null. No production switch. Next may test isolated official Codex CLI ChatGPT login, conditional on actual account/tool provisioning; API key absence alone does not exclude built-in imagegen.

## Current batch: administrator Hermes → Codex and mechanism video

User authorized execution on 2026-09-06. Architecture: ADR-013. No additional approval checkpoint is required for the already-authorized implementation and deployment.

1. Gateway: add shared request/result validation, exclusive task submission and readonly result polling; forward AgentTask UUID and preserve all existing source/permission/retry checks. Add explicit provider config and focused tests.
2. Runner: private claimed/started state, one job at a time, fixed Docker arguments, socket-only egress, readonly credential, bounded image collection and existing FFmpeg normalization. Test crash/replay/expiry and sandbox boundaries before server use.
3. Video: add optional scene3-artwork.png only to mechanism scene index2 (11–20.56 seconds); preserve the accepted continuous narration and detector-classification scene. The six-scene RO storyboard and older five-scene demo have different indices; map by content, not index alone.
4. Review and validate: full workspace build/typecheck/lint/tests, runner and media tests, independent review, docs sync and CI. Install the versioned runner bundle with existing runtime/images; activate Codex only after its heartbeat is healthy.
5. Server acceptance: submit through the existing authenticated RO/Hermes scene-image API, verify one task/credit/audit, Codex provider provenance, parent/Claims and actual image decoding. Keep generated asset draft until visual review.
6. Render/deploy the revised demo with the unchanged voice, verify video duration/decoding/seek/mobile display, and give the user the actual result. Do not describe this fixed demo as arbitrary RO-to-video automation.

Batch completed2026-09-06: app/main3d518af and demo7e1b6ea deployed. PR/main CI, exact server build/parser/runtime/health and real administrator Codex task/browser/audit passed. See CURRENT handoff for identities and evidence. Output remains draft for scientific/visual approval; next batch is global Hermes action routing and generic approved-storyboard CPU video generation. Historical MiniMax trials above did not pass visual acceptance; CPU image installation remains paused.

## Current batch: global Hermes presentation actions

1. Add tested bounded zh/en presentation-intent preparation; preserve literature/guidance routes. Wire current RO across all RO paths and clear drawer preparation on scope changes.
2. Add a scoped, accessible review card using existing API wrappers for RO/version/workspace/Claims/assets; explicit create/revise/image selection, source/parent/scene preview and1Credit confirmation. Submit with a stable per-intent key; hand accepted task to existing presentation page via version/task URL.
3. Browser coverage: free-form revision through drawer, image capability/approved-parent boundary, no request before confirmation, double click, failed/ambiguous outcome, RO/version switch, zh/en and390px. Reuse existing workbench diff/approval and task resume.
4. Independent review, workspace checks and CI; canonical server build/parser/runtime/deploy. Real controlled administrator revision through global Hermes; compare old/new drafts, exact task/credit/source and session cleanup. Preserve Codex runner, accepted audio and paused CPU model.

Batch completed2026-09-06: global actions b23102b and contrast correction f144eb7 deployed; PR98/99 CI and exact server acceptance passed. Real6-scene revision retained3Claims and its approved parent,1 task/credit/audit; final zh/en and Chinese confirmation revalidation created0 additional tasks. Contrast regression was reproduced before the fix. No provider/backend/schema change. See CURRENT handoff for exact release/rollback/evidence and pending duplicate main CI; next is generic approved-RO CPU video generation.

## Generic video renderer: first integration slice

Approved direction: retain continuous narration, reuse Chromium/FFmpeg and reviewed artwork. First remove the fixed-paper assumptions before exposing asynchronous video generation. No new model or dependencies.

- [x] Add `apps/media-demo/storyboard-input.mjs` and tests: accept three to six scenes, bounded titles/cues, explicit sample-time starts, local PNG names; reject missing artwork, escaping paths, overlapping cues and duration over90 seconds. Do not infer scientific approval from a JSON flag.
- [x] Add `apps/media-demo/storyboard-drawing.mjs` and browser tests: full-image contain, gentle reveal/crossfade, short titles/subtitles; no hardcoded scientific objects or text. Verify distinct input images and deterministic transitions.
- [x] Adapt `render.mjs`/`inputs.mjs` with opt-in `storyboard.json`; keep legacy demo output/audio byte inputs unchanged. Reuse frame encoder, full WAV mux, decode and fast-start verification.
- [x] Exercise a prepared bundle on ECS using existing renderer image as a source-only base. Preserve existing public demo and application. Record actual render/format and source audio evidence.
- [x] Review, lint/tests/docs sync; record exact remaining work: trusted approved RO asset export, Gateway Qwen synthesis/alignment, bounded asynchronous execution and UI/task/draft integration. These must not be described as delivered by the file-driven renderer alone.

Risks: source image cropping changes scientific meaning; captions can overflow; supplied cue timestamps can exceed actual WAV; file paths can escape the input directory. Existing fixed-five-scene validation cannot validate arbitrary scene manifests, hence the bounded parser below. No new digest scheme or release gate.

Renderer slice accepted at049e544: PR100 merged, CI34018403393 passed,20focused and full workspace tests passed; isolated ECS build/render/decode/audio identity and unchanged app/demo verified. See runbook for metrics. Authenticated RO video task integration and new-narration timing remain the next slice.

## Repair repeated-image delivery — 2026-09-06

User rejected the generic evaluation video: its preparation script copied one panorama into four of five scenes and the generic mode only zooms/crossfades images. Encoding success was incorrectly treated as visual equivalence. Restore the accepted D2NN scientific animation delivery; keep the generic renderer explicitly an illustrated-storyboard preview until per-scene animation exists.

- [x] Add a tracked animated-demo preparation command/test that copies only original continuous narration/metadata/panorama and optional scene3 artwork into a fresh input directory; never synthesize a generic storyboard from repeated images.
- [x] Report explicit renderMode in returned input/metrics and test retained training/wave/detector visuals and motion, in addition to file/cue checks. No new hashes, model, schema, or deployment gate.
- [x] Re-render and deploy the independent animated demo with the existing image/runtime, original WAV and canonical deploy script; inspect multiple scene midpoints and real playback/seek/mobile. Mark prior generic evaluation visually rejected, update CURRENT, hold further page/workflow integration pending the user discussion required below.

## Proposed product integration — discussion required

User explicitly requires discussion before deciding how to perform whole-product integration. Do not start integrated debugging or page redesign without that discussion and an agreed scope. The following is a proposal only. The architecture mainline can support integration work once agreed. Use the existing pages and APIs to test Workspace → PDF import → Hermes guidance/proposals → exact-version RO edit/evidence → storyboard/media review → publication/discussion. Prioritize broken navigation, unclear next actions, lost context, pending/error recovery and desktop/mobile usability. Apply consistent layout/typography/controls to that journey, selectively reuse colleague frontend work after review, and verify the final flow with real papers on ECS. This is the next product direction, not a claim these full-journey checks already passed.

Remaining capabilities are explicit: arbitrary-RO video jobs, new narration/alignment, approved per-scene animation/assets, source extraction completeness and Evidence grounding. The restored fixed D2NN sample does not close these gaps.

Video repair closed9848411: PR101 merged/CI34019708441 passed;23media/full workspace tests, independent High review and canonical server animation/browser acceptance passed. Whole-product integration and redesign remain explicitly awaiting discussion.

## Closeout 20260906

### 范围与证据边界

本轮授权：核对状态、清理服务器磁盘、审查同事分支、统计页面与设计参考，然后 grill-me 讨论。未合并分支、改动业务代码、安装依赖、部署应用或执行新生成任务。后续联调/页面改版仍待讨论。

版本：codex/product-workflow-design；调查 HEAD/origin-main `83695240d9f2bc328db3ed668aaa11fc8389f41c`。应用生产/公网实测 `f144eb772f1063c00bd61a97612137328443edde`，rollback `b23102b071ae715d738aa37504a838d2f3fc78f1`。独立 demo source `9848411d1419a0dd690f74cca9042369b651f7b2`；Codex controller仍3d518af。后续文档提交以Git为准，不改变应用。

证据均在 Git 忽略目录 `apps/web/test/visual/out/science-video/`：`closeout-checkup*.log`、`closeout-disk-*.log`、`closeout-cleanup.log`、`closeout-pages.json`、`closeout-public-ro.json` 与 `closeout-*.png`。源码盘点覆盖36个tracked page.tsx：22个产品路由模板，14个视觉/评审源文件（包含私有目录及编码路由副本，不等于14个公开URL）。

公网浏览器核验8个入口×桌面1440/移动390，以及3个真实公开RO×两视口；Dashboard/me/settings匿名跳转登录，不能记为已审查其登录后实际布局。登录后页面本轮是源码审计，未重新验证写操作、完整多角色旅程或服务器build/迁移；本轮没有应用部署。

### 磁盘维护结果

- 操作前文件系统158132850688bytes，已用53646221312bytes，可用97826545664bytes；Docker cache1.758GB。Docker显示镜像可回收6.702GB不代表都应删除，其中包含回滚和共享运行时。
- 经独立只读安全复核，按deployment runbook同类操作执行 `docker builder prune -f --filter until=12h --keep-storage=1GB`；未使用 `--all` 或system/image/volume prune。
- Docker报告回收753.4MB，cache剩1.005GB/184records；文件系统已用52848979968bytes，可用98623787008bytes（约91.85GiB），占用35%。文件系统前后变化约797MB，包含同时发生的其他写入/回收，不能冒称全部来自清理。
- 保留13运行容器、全部47容器、29镜像和12卷；8个应用active/rollback镜像标签、TTS/PyTorch及当前/前版demo镜像存在。健康检查通过，公网/loopback200、出网204；应用版本未变。
- Qwen模型4.3G、local-image暂停下载1.1G、Playwright缓存656M、业务数据库/对象存储/备份/发布源不动。停止容器全部可回收仅48MB，缺少逐个产物持久化证明，本次保留。没有必要为扩大清理数字牺牲复用能力。

### 页面职责、布局和功能盘点

以下“已接入”指源码存在真实API路径，不等于所有状态已端到端通过。P1表示影响主流程/理解，P2表示后续体验完善。

| 路由（22个模板） | 当前职责及布局 | 已有能力与主要问题 | 建议优先级 |
|---|---|---|---|
| `/` | 独立光学品牌首页，产品入口 | 公网正常；保留已验收光学效果，需确保入口与最终主流程一致 | P2 |
| `/explore` | 暖纸长列表、过滤栏 | 真实索引；公网首批混有Task11/E2E验收内容，标题长、缺少视觉摘要与内容区分；不要擅删公开数据 | P1 |
| `/collections/[slug]` | 编辑精选、双栏说明 | 公网精选只有一条示例；信息密度低、说明占比高，应明确与Explore区别 | P2 |
| `/auth/login` | 左侧品牌叙述、右侧登录表单 | 真实登录；大空白、细线输入边界、控件观感需优化；密码恢复能力须诚实展示 | P1 |
| `/auth/register` | 同登录壳层、长身份表单 | 首次验证码之前填写角色/学科/方法等，桌面页面约1760px高；渐进填写值得讨论 | P1 |
| `/dashboard` | DashboardShell、继续研究/任务/列表/Hermes | 真实用户、RO、导入/文献任务；需明确“现在该做什么”，本轮未登录截图 | P1 |
| `/research-objects/new` | blank/import双模式、Intake | 真实workspace/RO/上传/batch/重试；导入与空白创建的默认路径需讨论 | P1 |
| `/research-objects/[id]/overview` | RO总览、ResearchWorkspaceNav | 真实RO/版本；需承担进度、内容概览、下一步的统一入口 | P1 |
| `/research-objects/[id]/hermes` | 导入任务/字段确认工作区 | 真实任务轮询与确认；和全局Hermes职责重叠，需要明确上下文与返回路径 | P1 |
| `/research-objects/[id]/edit` | SDF三栏编辑、graphite工具区 | 已有编辑/证据/版本流程；六字段与普通读者语言的转换需优化 | P1 |
| `/research-objects/[id]/presentation` | 媒体工作台、版本/Claim/任务/预览/审批 | 真实分镜、图像管理员评测、draft审批；任意RO自动视频尚未闭合，不能用固定demo冒充 | P1 |
| `/research-objects/[id]/files` | 文件/commit台账 | 真实文件/提交；需区分原文、proof和生成展示物，降低技术术语负担 | P1 |
| `/research-objects/[id]/versions` | 版本列表/diff | 真实版本与比较；需明确当前草稿、已发布版本和媒体归属 | P2 |
| `/research-objects/[id]/collab` | GitHub式协作工具 | issues/PR/作者/评审组件已接入；按Claim讨论与普通用户理解仍需真实验收 | P1 |
| `/research-objects/[id]/publish` | 发布前检查与审核 | 真实许可/审核/发布；需清晰区分保存、批准媒体、公开发布 | P1 |
| `/research-objects/[id]/sandbox` | graphite复现工具区 | 已有sandbox提交；专业操作不应与普通阅读/生成抢主入口 | P2 |
| `/research/[publicId]`、`/research/[publicId]/v/[versionNo]` | 学术阅读、Claim区与证据侧栏 | overview已有媒体Gallery、SDF、版本历史；其余9个tab仍ComingSoon。媒体在长正文后，核心图解不够前置 | P1 |
| `/me` | 私有资料与研究身份 | 已有资料/ORCID/机构信息；需和研究桌面/设置去重，本轮匿名只能看到登录 | P1 |
| `/settings` | 偏好与学术身份控制 | 已有语言/动效/身份相关入口；账号身份职责仍需与me明确分配 | P2 |
| `/editorial/curator`、`/admin/editorial` | 策展/管理队列 | 已有真实编辑精选操作；角色边界保留，单独验收，不向普通用户铺开 | P2 |

不存在独立notifications/community/password-reset页面模板；部分通知和协作在组件中，自助密码重置不能当作已有能力。`ResearchWorkspaceNav`同时暴露9个RO入口，主任务顺序尚不突出。`product-surfaces.ts`未覆盖新增Hermes/presentation，不应把旧18表面浏览器测试当成完整页面清单。

### 视觉与实际截图发现

- 三个主要产品视觉族：暖纸folio产品壳、graphite编辑工具区、`pub-reading-*`学术阅读；Landing光学品牌另计。统一tokens在 `apps/web/app/tokens.css`，全局兼容覆盖在 `globals.css`。优先统一控件、空间、标题层级与状态，不简单把全部页面换成相同卡片。
- PublicVersionPage已在overview渲染 `PresentationAssetGallery`，不能误报“公开页没有媒体”。但真实OSR-2026-000019的媒体在长正文后，卡片还暴露`presentation_not_evidence`、generator/Claim IDs等技术元数据，科普展示效果不足。
- 公开导航的manuscript/methods/data/figures/versions/issues/pull-requests/reviews/citations均为ComingSoon；其中overview已有部分版本/媒体数据，说明存在重复入口与未完成的信息组织。
- 3个公开RO里，OSR-2026-000019移动端scrollWidth393对viewport390，有3px横向溢出；另2个为390。尚未定位具体元素，本轮仅登记。
- 登录/注册/Explore/精选的桌面截图已人工检查；其余受保护页面的布局判断来自代码，不能宣称全部页面已视觉验收。8入口浏览器记录无pageerror，但成功HTTP/零异常不代表产品可用性合格。

### 同事GitHub成果（独立审查）

[PR71](https://github.com/photonics-dhl/OpenScience/pull/71) 的frontend/nanqing tip `e5db5aea422e258d5086bd563f81c28b2b089c9a`：落后main86/独有6提交；release/profile-settings-20260904 tip `93bb1609982eb624023ecba1e71bf88b49ff4336`：落后86/独有13。只读merge-tree发现21冲突路径；结论基于实际merge检查，不能从两个分支tip的大diff直接推断合并会回退代码。

[PR78](https://github.com/photonics-dhl/OpenScience/pull/78) 已适配吸收私有me、设置拆分、身份恢复和紧凑导航；merge6478aa8，后续0b94e8f补充账号布局。当前应选择局部UX，不整支合入，不带入旧CURRENT handoff或部署脚本。

| 提交 | 可参考的成果 | 合入前需解决 |
|---|---|---|
| 8c285e3 | 注册完成页、资料隐私和结构化错误提示 | `/MAIL/`先匹配会把EMAIL_ALREADY_REGISTERED误报邮件失败；完成页改变returnTo行为待产品决定 |
| 30fabce | 密码显隐、未提供自助重置的诚实说明 | ACCOUNT_NOT_ACTIVE(403)漏分类为网络错误；这是唯一精确patch check通过的功能提交 |
| 609d313 | ORCID成功和恢复提示 | 适配当前组件，避免重复实现 |
| c13b81f | 机构来源说明、验证码聚焦/冷却/重发 | 共享busy会使机构操作期间ORCID错误显示Opening；需拆开状态 |
| b0741eb | 资料dirty、保存/放弃、完成度 | 适配当前account-workspace布局 |
| 93bb160 | 身份步骤摘要 | 与现有进度文案去重，不增加注册负担 |

PR71绿色CI33863229583仅覆盖e5db5ae；93bb160没有对应check/status，不能沿用旧绿灯。本轮未merge、cherry-pick、关闭PR或发布评论。

### 设计参考及复用结论

- [用户文章1](https://mp.weixin.qq.com/s/Z_rFngC5Tcss_7y1lUkNCQ) 对应 [emilkowalski/skills](https://github.com/emilkowalski/skills)，官方MIT仓库已核实。适合控件细节、可中断动效、缓动和减少无效动画的审查；它不会自动解决页面职责与科研工作流。当前仅阅读参考，未安装第三方skill。
- [用户文章2](https://mp.weixin.qq.com/s/JvO0PVLCXiZKE3TijZH21Q) 经现有Playwright读到完整内容：Huemint、Happy Hues、Realtime Colors、CSS Gradient四个网页工具，不是GitHub页面框架。适合配色候选与实际页面预览，不能替代布局/交互设计。代理曾返回验证页，浏览器后续成功；不把失败页当文章来源。
- [shadcn/ui](https://github.com/shadcn-ui/ui) 与 [Radix Primitives](https://github.com/radix-ui/primitives) 可作为组件/交互参考；现有项目已有Radix dialog/context-menu/slot、UI button/input与Tailwind，不需要先引入另一整套框架。具体组件和许可在实施选择时按需复核。
- 暂定讨论方向：研究桌面强调任务与续接，RO工作区强调编辑/证据/生成，公开页强调图解/贡献/深入阅读。这是建议，不是已批准的页面改版方案。

### grill-me讨论顺序（一次一问）

先确认首个完整旅程与目标使用者，再逐一确定Dashboard、RO总览、Hermes、媒体、公开阅读、协作、身份设置的职责和合并/保留关系；最后讨论视觉方向、实现顺序和真实论文验收条件。

首问建议：第一轮完整验收围绕“导入一篇论文→Hermes辅助凝练RO→生成可视化→审核并发布→读者理解并围绕证据讨论”的闭环。既有多角色能力保留，但是否把全部协作功能纳入首轮验收由用户决定。用户回答之前不启动整体联调/改版。

## Selective coworker integration — authorized 2026-09-06

User accepted the paper→Hermes→RO→visual media→review/publish→reading/discussion journey and explicitly requested selective coworker integration. Whole-site responsibilities and visual redesign remain under grill-me discussion; this bounded integration is authorized separately.

- [x] Adapt 30fabce login password visibility, recovery explanation and localized errors; put keys under auth.login and handle actual ACCOUNT_NOT_ACTIVE403. Preserve safeReturnTo/API/session behavior.
- [x] Adapt b0741eb research profile dirty/save/discard to current layout; preserve expectedProfileVersion, protect edits against in-flight saves and interest-signal responses.
- [x] Verify real error codes, translated controls and profile state in focused tests; inspect desktop/mobile and existing account flows, then full required checks and independent review.
- [x] Selectively merge validated adaptation with coworker provenance; deploy using existing authorized canonical pipeline and verify public behavior. No unrelated deployment-script or stale handoff changes.

Other candidate ORCID/registration/identity-step changes stay deferred until their role in the redesigned journey is agreed. No broad branch merge, new dependencies or API/schema changes.

Acceptance: PR102 merged4d39808; CI34022708530 success. Full workspace checks, final web build and14account browser cases passed. ECS full build/parser16/core36/search2/BGE/ScanSci/health/retention passed; public en/zh login1440/390 and controlled profile discard1440/390 passed,0profile writes and session closed. Independent High review fixed draft loss, unrelated remote-field overwrite and coupled identity invariants. Deployment SSH interruption was verified safe before retry; missing exact parser report was prepared before final deployment. Whole-site aesthetic redesign remains pending discussion.

## 2026-09-06 approved visual prototype

用户已确认 A 配色方向及研究桌面、RO 概览、Hermes 侧栏三态样稿。当前授权为隔离本地交互样稿；生产整站改版待实际视觉验收。

1. 在 `/_visual/research-journey` 复用 Next.js / CSS Modules / Radix，连接三种状态。
2. 使用已验收 D2NN 机制插图与动画视频；明确生成解释图不属于原始证据。
3. 本地演示证据展开、Hermes 修改预览、应用与撤销，不调用业务写 API。
4. 验证桌面/移动端、中英文、浏览器返回、焦点和溢出，截图审视实际效果。
5. 同步交接与索引，交用户验收；不部署或替换生产页面。

## 2026-09-06 accepted A direction — companion and dashboard slice

用户基本验收A样稿，要求保留阿拉丁神狗作为品牌记忆/陪伴助手，并继续下一步。

1. 样稿复用现有ResearchWorkbenchHermes/Wanko Live2D与原静态回退，小入口用同角色头像；单实例、安静模式、系统减少动效、确认时静止。
2. 正式dashboard只改展示层：page及scoped module；继续/开始/任务/文献/研究列表沿用原真实组件和API。HermesDockAnchor与全局舞台/Drawer保留，不搬样稿模拟状态进入产品。
3. 运行原dashboard单元/浏览器回归，桌面/手机截图与Hermes运行时检查。此次第一片候选不等于RO/全站联调完成；部署前仍需完整发布验收。

## Real overview and contextual Hermes slice

用户继续授权：概览默认阅读完整SDF研究叙述；最新已提交versionNo资产仅展示approved image/video，明确与当前编辑文本的区别，原始证据单独入口；复用Shell神狗与Drawer，通过现有target字段发送段落上下文。修改overview page/module、Shell可选展示/调用入口、dashboard无待办续接路径及中英文文案；不新增API/数据库/模型。验证当前版本过滤、异步换RO隔离、助手目标请求、移动端与真实续接。正式发布需另跑完整构建/发布验收。

## PR103 release continuation

用户已授权正式研究桌面/概览/段落Hermes发布。Worker传递trusted target；首轮CI构建/类型/lint/单元通过，发布浏览器104/110。修正重复桌面header链接、缺失媒体fixture、菜单rail宽度及detached宽菜单实际碰撞计算，保留所有现有geometry断言。最终候选须经完整CI、精确SHA服务器parser预验收、canonical deploy与公网中英桌面/移动端受控只读验收；rollback使用当前应用4d39808。

## Public medium-width correction

PR103 deployed7579738 with full CI/server checks. Public1024 revealed the percentage overview rail cannot hold original360px Wanko. Use scoped220px/main/400px at>=1280 and main/400px at1024–1279 with hidden structure rail. Keep original model size; preserve full English map labels. Add1024/1280 and post-model-ready overflow coverage to existing release config. Patch acceptance and deployment rollback anchor7579738 are required before closing public verification.

Acceptance: PR104080fa74 merged/deployed; CI34034878269 and exact server build/parser16/runtime/migrations/health passed. Public zh/en1440/1024/390 desk/overview12 scenarios passed,0business writes/session closed. Post-release package script now explicitly includes overview suite (config alone did not change explicit CLI list); actual command targeted5/5 passed. Next: remaining agreed pages and full-paper workflow acceptance; no new AI generation claimed.

## Screenshot correction — user-directed fast production slice

1. Reproduce Wanko black geometry across renderer teardown; repair shared texture lifetime and original-character fallback.
2. Apply accepted A to shared RO shell/navigation, overview onboarding, editor and presentation no-version state. Preserve business workflows and move secondary tools into an accessible menu.
3. Run focused runtime checks, Web build and real browser screenshots; independently review material regressions. Deploy via existing exact-source script and inspect public three-page journey. Do not repeat the full-site browser matrix or add new gates.

Public69aac51 follow-up: floating Hermes covered a presentation asset despite no viewport overflow. Reserve a dedicated380px companion rail with the existing DockAnchor/Drawer and real RO identity; stack below content on smaller screens. This is required before closing screenshot correction.
