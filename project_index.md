# OpenScience (XGS) 项目文件索引

> 维护规则：创建/修改/移动文件后必须更新本索引。创建新文件前先查本表防重复。
> **CURRENT source/deployment anchor（2026-08-26 13:03 +08）：** working branch/application/immutable release `codex/hermes-wanko-live2d@2934476`；local main / origin main `c60ffdd` / `7eb2f5b`；ECS release / rollback 为 `2934476` / `58614c0`。后续 docs-only HEAD 不改变 application 身份；只有本锚点与主题唯一 CURRENT handoff 可决定当前状态。

## 根目录
| 路径 | 用途 | 状态 |
|---|---|---|
| `AGENTS.md` | 项目规则总入口（基线指引/分类规范/Memory/工具可迁移性/索引/安全红线） | 活文档 |
| `project_index.md` | 本索引 | 活文档 |
| `.mcp.json` | 项目级 MCP 配置（kimi-code/Cursor）；2026-08-08 保持 10 个：`semantic-scholar`、`github`、`mermaid`、`memory`、`context7`、`tavily-search`、`figma-temp`、`figma-primary`、`shadcn`、`task-master-ai`；双 Figma 直接使用官方 remote URL，过渡期移除低价值 `fetch` | 活文档，**本机持有，已移出 git 跟踪**（2026-07-31） |
| Codex global `ui-ux-pro-max` / `baseline-ui` Skills + `shadcn` MCP | 2026-08-24 为 Hermes 互动视觉纠偏启用：Skills 固定审计提交 `bc826e2` / `bdbcc56`；shadcn 固定 `4.19.0`、cwd 为当前 worktree `apps/web`，MCP 初始化握手通过；不把资料库命中替代用户审美验收 | **本机工具能力，不入库**；重启 Codex 后自动发现 Skills/MCP |
| `.Codex/troubleshooting/issues.json` | 项目工具/MCP/API 故障的结构化问题库；不记录账号、密钥、OAuth URL 或 token | 活文档 |
| [OpenScience Web Design System — canonical](https://www.figma.com/design/gjhowMG7cG4clKwvhvF08E) | 长期项目账号持有的 Optical Editorial V3 canonical；44 variables、12 styles、4 component sets、8 surfaces；旧 `rWS3…` 文件仅为历史迁移来源 | Task 13 验收完成 |
| `.vscode/mcp.json` | VS Code MCP 配置（task-master-ai 直连 node_modules 本地入口） | 活文档，**本机持有，不入库**（含 key） |
| `.env` / `.env.example` | 密钥 / 密钥模板 | 只读，禁打印 |
| `.gitignore` | git 忽略规则（含 `.env` 与本地浏览器、GPU 探针及生成 evidence 临时目录；正式 `apps/web/test/visual/` 不受影响） | 活文档 |
| `minimax_proxy.py` | MiniMax API 本地代理（上个 session 产物） | 活文档 |
| `package.json` / `pnpm-workspace.yaml` / `pnpm-lock.yaml` | pnpm workspace 根配置与锁文件（P1A-1）；`task-master-ai` 已入 root devDependencies（2026-07-31，VS Code MCP 直连用） | 活文档 |
| `eslint.config.cjs` | 全仓 ESLint 9 flat config；排除构建物、隔离 worktree、agent skills、`.superpowers` 与已 gitignore 的 root/web `tmp` 本地证据；豁免不覆盖产品源码或正式 `apps/web/test/visual/` 门禁 | 活配置 |
| `apps/web/components.json` | shadcn/ui `new-york` 配置（Task 7.4，cssVariables + 本地 aliases） | 活文档 |
| `apps/web/app/tokens.css` | 视觉 token 单一事实源（Task 2/8；2026-08-09 Task 1 补 ingestion workbench/evidence/status/focus/spacing/type/radius，与 Figma variables 同名） | 活文档 |
| `apps/web/components/ui/{button,card,badge,skeleton,input,dialog,status-badge,progress-rail,dropzone,evidence-card}.tsx` | UI 基础组件；后四项为研究者导入 Task 1 稳定原语（双语、WCAG、reduced-motion、固定任务状态占位） | 活文档 |
| `apps/web/components/ui/context-menu.tsx` / `apps/web/components/hermes/{HermesVisualAdapter,HermesWorkspaceStage,HermesPresenceControl}.tsx` / `apps/web/lib/hermes/context-menu-actions.ts` | 无主题 Radix context-menu 行为原语；联合 portal/crown/actor/viewport/protected geometry 的可重复稳定器；12 项 action 各有真实 performance 与中英各三句不连重复；桌面右键、Shift+F10/Menu、移动长按，普通点击保留 drawer | **§13.7 DEPLOYED application `5323ba8` / release `bf54eaa`**；不继承 shadcn 默认视觉 |
| `apps/web/app/auth/{register,login}/page.tsx` / `apps/web/components/auth/{ResearchIdentityPanel,SignupCodeForm,LoginForm}.tsx` | Optical Editorial Research Identity 双平面；邮箱验证码注册与独立登录共用真实 session 契约，无邀请码字段；受信 origin `returnTo`、OTP 自动聚焦、可重试错误与中英 i18n | 活文档 |
| `apps/web/app/dashboard/page.tsx` / `apps/web/components/dashboard/` / `apps/web/components/hermes/HermesAssistantDrawer.tsx` | 研究驾驶舱：最近 RO、导入/创建、可行动 Hermes 任务、研究列表与原地 Hermes guide drawer | 活实现 |
| `apps/web/app/research-objects/new/page.tsx` / `apps/web/components/intake/*.tsx` | Optical Editorial Evidence Intake：blank 直接进入 SDF；import 在明确提交前仅本地编排 manuscript/figure/data/code/supplement 与可选主稿，提交后连接真实 ingest batch、逐任务轮询、blocked/retry 与 needs_review→Hermes deep link | 活文档 |
| `GET /research-objects` / `GET /ingestion?actionable=true` | Dashboard 真实数据合同：仅成员 Workspace 的 RO 与当前用户创建的 IngestionTask；Hermes deep link 使用真实 ingestion task ID | 活接口 |
| `apps/web/test/auth-dashboard.test.tsx` / `apps/web/test/e2e/auth-dashboard.spec.ts` | Auth/Dashboard 单元合同与 clean-browser 桌面/移动 E2E；实际选择多文件并断言 Artifact→Commit 引用 | 活文档 |
| `apps/web/playwright{,.signup}.config.ts` / `apps/web/test/e2e/signup-live.spec.ts` / `apps/api/test/support/signup-smoke-server.mjs` | 可重复浏览器门禁；signup smoke 启动编译 Fastify auth 路由和真实 Next rewrite，验证验证码、Cookie 与 `/auth/me`，不使用 API route mock | 测试工具 |
| `packages/domain/src/ingestion/` / `apps/api/src/routes/ingestion.ts` | 多格式 ingestion 格式策略、批次/任务状态机、Artifact + AgentTask 异步边界，以及 consent/status/retry API；已补写权限、bounded multipart、模板限流和 dispatch/CAS 基础 | 执行中 |
| `packages/domain/src/workspace/personal.ts` / `packages/domain/src/usage/grants.ts` | 邮箱确认事务创建 Personal Workspace，并按生效 policy 幂等补齐当前 UTC 月 AI Credit；月度批处理复用同一单用户授信原语 | 已实现，待生产 E2E（2026-08-09） |
| `apps/agent-worker/src/{ingestion-parser,parser-self-test,parser-job-isolation,parser-service,index}.ts` / `apps/agent-worker/test/parser-job-isolation.test.ts` | Artifact→Blob→Hermes 桥接：Markdown/TeX 确定性解码；PDF/DOCX/OCR 只经 shared-volume sidecar；sidecar 无网络/Secret、只读非 root、512MB/64 PID；self-test 用无用户数据 fixture 验证运行时；超限永久阻断、解析失败显式复核 | CURRENT production parser boundary |
| `packages/domain/test/ingestion-service.test.ts` / `apps/api/test/ingestion.integration.test.ts` / `apps/web/test/evidence-intake.test.ts` | PDF/DOCX/TeX-ZIP/Markdown/图片/CSV/TSV/JSON/YAML/Notebook/Python/R、consent、越权、幂等恢复、worker 状态同步、Intake role/primary/progress 与真实存储合同 | 测试工具 |
| `packages/database/test/signup-challenge-migration{,.integration}.test.ts` | migration 23 SQL 顺序门禁与真实 PostgreSQL 预存重复 active challenge 收敛验收 | 测试工具 |
| `apps/web/lib/api.ts` / `apps/web/next.config.mjs` / `infra/nginx/openscience.conf` | web 同源 `/api` 传输层：开发 rewrite、生产反代、受保护写请求 CSRF 获取与一次刷新重试；`/auth/login`、`/auth/register` 精确走 Next，其余 direct `/auth/*` 兼容 API 仍走 Fastify | 活文档；2026-08-10 ECS 登录入口冲突已补回归测试 |
| `apps/web/test/ingestion-foundations.test.ts` / `apps/web/test/visual/ingestion-shots.mjs` / `apps/web/app/{%5Fvisual,_visual}/ingestion-foundations/page.tsx` | 研究者导入视觉地基 TDD 合同与 1440/768/375 三视口浏览器截图门禁；脚本访问仅开发态可用的真实编译原语预览 | 活文档 |
| `apps/web/app/tokens.css` / `apps/web/app/layout.tsx` / `apps/web/test/{tokens-contrast,optical-foundations}.test.ts` | Optical Editorial v3 视觉地基：黑/纸白/朱红 token、0/4/8px 半径、四字体角色、语义 motion、AA/禁蓝紫/降级门禁 | 活文档 |
| `apps/web/components/brand/OpenScienceWordmark.tsx` / `apps/web/components/shell/*.tsx` / `apps/web/test/surface-shells.test.tsx` | Optical Editorial 品牌与 Public/Identity/Dashboard/Workspace 四类无 Card shell；单一 main、skip link、19/56/25 工作区平面与动作反馈门禁 | 活文档 |
| `apps/web/components/shell/ResearchFolioPrimitives.tsx` / `apps/web/app/{layout.tsx,tokens.css,globals.css}` | Research Folio 非 Landing 产品地基：全局 Source Serif 4/Noto Serif SC 阅读、暖纸层级、graphite 工具例外、workflow/evidence/decision 原语与旧暗色类兼容桥 | **CURRENT DEPLOYED**；Landing selectors unchanged |
| `apps/web/components/hermes/{HermesVisualAdapter,HermesSpeechBalloon,HermesPresenceControl,HermesRiggedPortrait,HermesWorkspaceStage,HermesPerformanceBubble,HermesGuideBubble,HermesDockAnchor,HermesAnchor,HermesDraftDiff,hermes-state}.ts(x)` / `apps/web/lib/hermes/{context-menu-actions,action-catalog,behavior-director,performance-beat,performance-director,companion-placement,stage-sizing,anchor-registry,travel-path,dock-preferences,motion-preference,hermes-runtime-status}.ts` | Workspace-wide Hermes：精确 `360/200px`；单路径 speech；真实 viewport/protected-region 工具页测量与 scroll 恢复；12 个 action-first performance、每动作中英各三句不连重复；input/search/modal/drawer/approval 中断；guide/menu/drawer 与 reduced-motion 保留 | **§13.6 CURRENT DEPLOYED `8d1409e` / USER REVIEW PENDING**；release/rollback `6b804f7` / `cbf5737` |
| `apps/web/public/hermes/live2d/{NOTICE.md,live2dcubismcore.min.js,wanko/**}` / `apps/web/test/hermes-live2d-asset-contract.test.ts` / external `C:/Users/Mac/AppData/Local/OpenScience/Live2D/wanko-genie-v1/runtime-v09-export-20260823/` | v09 SDK 4.0 runtime：两张 texture zero-alpha RGB clean、12 motion 参数兼容、manifest 闭合；active renderer 只有单一 Cubism model/canvas，旧 pet/carrier 公开 URL 为 404 | **CURRENT ECS development deployment** `5f4e73c`；母版 SHA `BA111D4E...1121ADD` 未改，operator exception 与版权 notice 已部署，rollback `c97926a` |
| `apps/web/lib/hermes/{live2d-core-loader,wanko-action-director,wanko-renderer-controller,wanko-live2d-renderer,wanko-model-presentation,wanko-runtime-ownership}.ts` / `apps/web/test/{hermes-wanko-action-director,hermes-wanko-renderer-contract,hermes-wanko-runtime-ownership}.test.ts` | 浏览器单 Wanko canvas/model/RAF owner；32-action profile 复用 byte-identical v09 12 motions，旧 OGL pet renderer、三张 pet PNG、carrier decoder/asset/exporter/CSS 已按授权永久移出当前 tree | **CURRENT v09 ECS runtime** `5f4e73c`；五个关键 runtime 文件公网 SHA 与 release tree 一致 |
| `apps/web/app/_visual/hermes-live2d/page.tsx` / `apps/web/app/%5Fvisual/hermes-live2d/page.tsx` / `apps/web/test/visual/hermes-live2d-motion-gate.mjs` / `apps/web/test/visual/hermes-work-assistant-experience-gate.mjs` / `apps/web/test/visual/hermes-companion-motion-gate.mjs` / `apps/web/test/visual/hermes-performance-gate.mjs` / `apps/web/test/visual/hermes-release-gate.mjs` / `apps/web/test/e2e/hermes-dashboard.spec.ts` / `apps/web/test/e2e/hermes-field-guide.spec.ts` | 明示 flag 才开放的真实 RO-create fixture + 诊断 tray；覆盖 runtime、12 action profiles/phrase pools/no-repeat、action-before-speech pixels、viewport/protected geometry、scroll restore、interruption、renderer-ready desktop/mobile/editor；production harness 仍 404 | **§13.6 LOCAL/PUBLIC GATES GREEN**：Web `411+5`、release `65/65`、public `6/6`；application/release `8d1409e` / `6b804f7` |
| `apps/web/app/%5Fvisual/research-workbench/` / `apps/web/app/_visual/research-workbench/` / `apps/web/components/visual/{ResearchWorkbenchReview,ResearchWorkbenchHermes,research-workbench-review.module.css}` / `apps/web/public/hermes/wanko-static.png` / `apps/web/lib/research-workbench-state.ts` / `apps/web/test/{research-workbench-state.test.ts,e2e/research-workbench-review.spec.ts}` | 匿名 noindex 暖纸产品视觉评审入口；六场景 deep-link、真实 v09 `360/200px`、WebGL 失败时同尺寸真实 Wanko 静态帧、Hermes 右键/键盘/长按菜单、普通点击无写入 assistant fixture、19px/1.72 阅读与 evidence-only graphite rail | **CURRENT ECS VISUAL REVIEW `b73a9dd`**：public full E2E `5/5` + keyboard repeat `3/3`；Web `395/395` + 5 Node、19-page server build、route 200；rollback `02d3dd9` |
| `apps/web/components/research/*.tsx` / `apps/web/components/editor/*.tsx` / `apps/web/app/research-objects/[id]/edit/page.tsx` | Optical Editorial RO Workspace：56/64/44px 产品层级、19/56/25 单实例工作面、六节点 SDF、Evidence/Before-After proposal、Artifact rule row、Radix 高影响审查与移动功能等价 | 活文档 |
| `packages/domain/src/commit/commits.ts` / `apps/api/src/routes/commits.ts` | Commit、版本详情/重建/比较及成员受控的 `GET /research-objects/:id/versions` 降序摘要；供 Editor、Overview、Versions、Publish 共用 | 活接口；Task 12 补齐版本列表合同 |
| `apps/web/lib/product-surfaces.ts` / `apps/web/test/product-surface-matrix.test.ts` | Task 12 产品表面真源：Overview/SDF/Files/Versions/Collaboration/Publish/Sandbox/Settings 的真实路由、权限、五态、移动等价与风险声明 | ECS 390/1440 验收通过（2026-08-10） |
| `apps/web/components/research/ResearchWorkspaceNav.tsx` / `ResearchSurfaceShell.tsx` | Research Object 统一工作区导航与三平面产品外壳；编辑器禁用模式已替换为真实页面入口 | 活实现；Task 12 |
| `apps/web/app/research-objects/[id]/{overview,files,versions,publish,sandbox}/page.tsx` / `apps/web/app/settings/page.tsx` | Task 12 真实产品表面：对象概览、证据文件提交、版本比较、许可/审核/R3 发布、服务器沙箱、账户设置/退出登录 | ECS 已部署并通过真实账号验收 |
| `apps/web/test/workspace-shell.test.tsx` / `apps/web/test/visual/workspace-shots.mjs` | RO Workspace 结构/证据/风险合同与 1440/390/320 production browser 门禁；校验三面状态保持、无溢出、console、focus trap/Escape/焦点恢复 | 测试工具 |
| `apps/web/test/workspace-readability.test.ts` / `apps/web/test/e2e/workspace-readability.spec.ts` / `apps/web/test/visual/workspace-readability-gate.mjs` | 三视觉系统阅读与控件合同：14–17 px 语义角色、浏览器无关控件、真实颜色对比、水平/垂直裁切、可访问名与 focus 可见性；覆盖桌面/移动代表路由 | **IMPLEMENTED FOUNDATION / CARRIED FORWARD**；首次真实验收 `06072c1`，现行 release `5f4e73c` |
| `apps/web/test/visual/product-release-manifest.mjs` / `apps/web/test/e2e/product-release.spec.ts` / `apps/web/playwright.release.config.ts` | 18 个真实产品表面 × 三视口、Landing normal/reduced、320px 五壳层与 Hermes 入口/菜单/反馈的 72 案 production browser 门禁 | **CURRENT local `72/72` GREEN**；public anonymous `69/69`，Admin 三视口由预期 Basic Auth 401 阻断 |
| `apps/web/test/e2e/start-release-api.mjs` | 发布门禁专用的无用户数据 mock API，只为 canonical Public RO/Collection SSR 提供稳定数据；生产旅程不得使用 | 测试工具 |
| `apps/web/components/landing/SiteHeader.tsx` | Landing 页极简 i18n 导航；提供真实 `/explore`、`/research-objects/new`、`/auth/login` 入口与 dark/paper 双表面样式 | 活文档 |
| `apps/web/components/landing/Hero.tsx` / `apps/web/components/optical-lab/AcceptedOpticalSurface.tsx` | Landing Hero 保留 PublicShell 上下文、Create/Explore CTA 与 Open RO 过渡；视觉体与 asset Lab 共用 accepted energy→typography plates、唯一语义 h1、隐藏诊断和 amplified AssetInteractionMount，IDs 按 surface 唯一 | Task 23 已部署；release `48809d6` / rollback `744c631` |
| `apps/web/components/landing/HeroLoopMedia.tsx` / `apps/web/lib/landing-motion.ts` | Landing 动效资源策略：loop video 仅桌面非 reduced-motion 挂载；移动/reduced-motion 只加载 poster；Evolution reduced-motion 禁止自动轮播 | 活文档 |
| `apps/web/components/landing/LatestResearch.tsx` | Landing 下滑第二屏（legacy 文件名）：paper `OPEN RO.` 构图、稳定身份说明、N1–N6 六层 SDF anatomy 与真实 `/explore` 入口；不虚构公开研究数据 | 活文档 |
| `apps/web/components/landing/TrustBand.tsx` | Landing 页 `#trust` 信任区（版本/provenance、许可作者贡献、AI+人工复核三支柱） | 活文档 |
| `apps/web/components/landing/EvolutionPanel.tsx` | Landing 页四阶段演化面板（create/parse/diff/publish stage morph + 自动演示一轮即停，2026-08-07） | 活文档 |
| `apps/web/components/landing/HermesBand.tsx` | Landing 页 Hermes 能力带（上下文/证据/审批三卡，2026-08-07） | 活文档 |
| `apps/web/components/landing/evolving-ro-symbol.tsx` | Landing 页 Evolving RO Symbol（Task 7.7，server-safe SVG，两种变体、六面 SDF 结构、减弱动效支持；2026-08-07 重写为计算环形楔形几何 + stage prop） | 活文档 |
| `apps/web/components/landing/in-view.tsx` | Landing 滚动进入触发器（IntersectionObserver 加 `landing-inview--seen` 播 landing-reveal；html.js 门控无 JS 可见、reduced-motion 直过，Task 9） | 活文档 |
| `apps/web/public/hero/ro-loop.{webm,mp4}` + `ro-loop-poster.webp` | Landing Hero 循环视频资产（Gemini 图生视频 video1.mp4 → ffmpeg 首尾 1s 叠化无缝循环 + 中央方形裁切去水印；webm 715KB/mp4 1.0MB/poster 31KB，2026-08-07） | 活文档 |
| `apps/web/public/hero/{ro-symbol,hero-ambient}.{png,webp}` | Landing Hero 生成资产（figA 玻璃楔形环 + figB 氛围底，Gemini 生成，源 `docs/user_ideas/figA.png`/`figB.png`；ro-symbol 自 Task 9 起不再被引用，Task 12 待清理，hero-ambient 仍作氛围底） | 活文档 |
| `apps/web/public/hero/landing-hero.png` | Landing Hero bitmap 主视觉资产（本地 Playwright 生成，已被生成资产路线取代，Task 12 待清理） | 活文档 |
| `apps/web/scripts/generate-landing-hero.mjs` | Landing Hero bitmap 生成脚本（Playwright 渲染 SVG/HTML 合成图至 public/hero） | 活文档 |
| `apps/web/lib/utils.ts` | `cn` class merge 工具（Task 7.4） | 活文档 |
| `apps/web/test/ui-components.test.ts` | 原语 storyless server-rendering 断言（Task 7.4；Task 8 追加双表面 `.surface-dark` 与 state-danger 断言） | 活文档 |
| `apps/web/test/evolving-ro-symbol.test.tsx` | Task 7.7 Evolving RO Symbol server-rendering、变体、动效与 SVG 层级断言 | 活文档 |
| `apps/web/components/brand/{OpticalHeadline,OpticalField}.tsx` / `apps/web/lib/optical-field/*.ts` | 保留的 Canvas/glyph-particle 媒介与模型；OGL 可用时不挂载，仅在 normal-motion + WebGL unavailable 时以 accepted plate 提供单层同源标题水纹 fallback | **Task 24 CURRENT DEPLOYED `2934476`**；reduced-motion 不挂载，勿误删 |
| `apps/web/app/{%5Fvisual,_visual}/optical-lab/page.tsx` / `apps/web/components/optical-lab/{OpticalLabClientMount,OpticalLabPage}.tsx` / `apps/web/lib/optical-lab/{layout,runtime-policy,model,ogl/*}.ts` | 精确 `/_visual/optical-lab` 比较页；`?candidate=asset` 以单面 shared AcceptedOpticalSurface 为真源，non-asset procedural 路径仅保留历史比较 | HISTORICAL non-asset Task 7 的 650ms rest 不适用于 asset；Task 15 本地共享晋升，未部署 |
| `apps/web/components/optical-lab/AssetInteractionMount.tsx` / `apps/web/lib/optical-lab/asset-interaction-model.ts` / `apps/web/lib/optical-lab/ogl/{asset-interaction-renderer,asset-flow-pass}.ts` / `apps/web/lib/optical-lab/ogl/shaders/asset-{flow,composite,overlay}.ts` | accepted shared surface 的 OGL 层；Task 22 idle `.05/6px`、三尺度流与不回绕 10s shader clock；Task 23 Landing-only presentation path 以 `uPresentationAlpha` 增加完整合成透明度、`2.2px` 非线性漂移、中央曲率呼吸和字缘高光，全部在 local input 下让位且 Lab 为零；交互仍为 70ms/5px/10px/.18、700ms local zero | Task 23 `48809d6` 已部署并通过公网最终 surface 门禁 |
| `apps/web/public/optical-lab/{target-reference,current-production,accepted-resting,energy-plate-black-alpha-v1}.png` / `apps/web/test/visual/promote-optical-lab-resting.mjs` | 用户授权参考/current、Task 5 decorative fallback 与用户确认的 1672×941 RGBA 黑底发光分解能量层；promotion 仅接受批准输出并记录 SHA-256 | Landing 与 asset Lab 共用 accepted plates；Task 19 已部署 ECS |
| `apps/web/assets/optical-lab/fonts/` / `apps/web/public/optical-lab/atlas/` / `apps/web/scripts/generate-optical-atlas.mjs` | 高保真 Lab 的 Archivo 900 与同一 pin 上游 Bodoni Moda Italic 400（opsz 96）确定性实例、原样 OFL、受限 charset、MSDF JSON/PNG 与受 pin generator | Task 2 资产合同由 Task 5 用户授权字体修复重开：manifest/精确 family-axis 校验/atlas 已更新；未新增 family、dependency 或 license，生产 `/` 不导入 |
| `apps/web/test/optical-lab-{model,contract,atlas,runtime-budget,asset-interaction}.test.*` / `apps/web/test/visual/{shots,optical-lab-gate,optical-lab-shots,optical-lab-visual-metrics,optical-lab-asset-interaction-gate}.*` / `apps/web/test/visual/{capture-optical-lab-asset.mjs,fixtures/optical-lab-asset-accepted-1672x941.png}` | Optical Lab/Landing production-browser 门禁：系统 cursor、慢/快真实轨迹、局部位置/强度/恢复、connected idle；WebGL-disabled 路径另证一个 Canvas owner、亮字形水纹、静态 plate 透明、滚出/滚回与 no-overflow；reduced-motion 无 canvas | **TASK 24 CURRENT PUBLIC GREEN `2934476`** |
| `apps/web/app/explore/page.tsx` / `apps/web/components/explore/ResearchIndex.tsx` / `apps/web/test/{explore-index.test.tsx,e2e/explore-index.spec.ts}` | Optical Editorial 公开 Research Index：编号式 paper rows、query/SDF field/artifact 筛选、cursor load-more、真实 Public RO link 与 1440/390 无 Card browser gate | 活文档 |
| `packages/domain/src/explore/explore.ts` / `apps/api/src/routes/explore.ts` / `apps/api/test/explore-routes.test.ts` | 匿名 `GET /explore` 合同；仅 public+published，稳定 publicId cursor，有界 query/limit 与关系筛选，返回 SDF/artifact/author provenance 摘要 | 活接口 |
| `packages/domain/src/editorial/` / `apps/api/src/routes/{editorial,admin-editorial}.ts` | Ultrafast Science 策展域：版本绑定快照、媒体 provenance、draft→internal_review→scheduled→published 状态机、platform_admin scoped API 与公开过滤 | ECS 已部署并完成真实 published/audit 验收（2026-08-10） |
| `apps/web/components/editorial/EditorialCollection.tsx` / `apps/web/app/collections/[slug]` / `apps/web/app/editorial/curator` | 纸面期刊精选阅读页与管理员策展工作台；媒体/视频预览、来源说明、非同行评审公开标签；管理 API 走 Nginx Basic Auth `/admin/*` | ECS HTTPS desktop/mobile gate 通过（2026-08-10） |
| `scripts/{demo-research-corpus,seed-demo-research}.{mjs,test.mjs}` | 6 完整 + 12 轻量启动语料清单与默认 dry-run seeder；Git license blob evidence、source idempotency、无删除、完整项内容寻址 provenance artifact | ECS 已 confirmed seed/replay；18 demo RO + 6 provenance artifacts（2026-08-10） |
| `apps/web/test/{landing-page,optical-field,landing-motion-policy}.test.ts{,x}` | Landing SSR 路由/唯一 accepted surface 与 h1、导航/CTA/Open RO/Latest Research 保留、无 legacy runtime；历史 optical model 与 motion policy 继续独立回归 | Task 15 本地 GREEN |
| `apps/web/components/public/{PublicVersionPage,CitationRail,ProvenanceCaption,TabNavigation}.tsx` / `apps/web/app/research/[publicId]/**` | Public RO warm-paper 760/280 阅读 surface、持续对象/不可变版本引用、六 SDF 文本状态、SSR route 与 print provenance | 活文档 |
| `apps/web/test/public-reading-surface.test.tsx` / `apps/web/test/visual/public-reading-shots.mjs` / `apps/web/app/visual-public-reading/page.tsx` | Public RO render contract 与 1440/390/print production browser gate；visual route 仅为确定性验收夹具 | 活文档 |
| `apps/web/test/visual/shots.mjs` | Landing production browser gate：1672×941/390×844 normal/reduced、唯一 main/h1/shared surface、导航/CTA/Latest Research、overflow/errors/focus、bounded pointer；Task 23 normal 最终 surface 连续三段 `1200ms` 验证标题 coverage `>=18%` / average delta `>=1.10`、四象限与色带 `<=20%`，desktop reduced exact fixture | Task 23 本地与公网 production GREEN |
| `apps/web/lib/optical-lab/asset-manifest.mjs` / `apps/web/test/optical-cache-contract.test.ts` | Landing 两张大型光学 PNG 的完整 SHA-256、内容寻址 URL、精确 rewrite/immutable header 与 SSR/WebGL 共享引用合同 | release `b93fa9d` 已部署并验证 Cloudflare `MISS → HIT`；后续 release 继续继承 |
| `apps/web/.gitignore` | web 局部生成物忽略（Task 7.10 截图输出 `test/visual/out/` 不入库） | 活文档 |
| `apps/web/vitest.config.ts` | Vitest Node 环境、`@/` alias 解析与 `.ts/.tsx` 测试发现（Task 7.4/7.7） | 活文档 |
| `tsconfig.base.json` / `eslint.config.cjs` / `.npmrc` | 共享 TypeScript/ESLint/pnpm 基线；ESLint 9 flat config 只忽略构建、agent 与 gitignored 的本地临时/视觉证据目录，正式 visual gate 源文件持续受 lint | 活文档；Hermes 本地预览证据不污染 canonical lint |
| `knip.json` / `.dependency-cruiser.cjs` / `.markdownlint-cli2.jsonc` | 卫生工具配置：knip（未用代码）、dependency-cruiser（依赖边界）、markdownlint（文档门禁）（2026-07-28 落地） | 活文档 |
| `scripts/verify-workspace.mjs` | Monorepo 结构校验脚本（lint 的第二段，`verify:workspace` 入口） | 活文档 |
| `scripts/docs/check-docs-sync.mjs` / `scripts/docs/docs-sync-skill.test.mjs` | 文档同步门禁：索引存在/反向登记/迁移一致性，并锁定 worktree-first、唯一 CURRENT、版本元组、bounded read、active-memory 压缩与 canonical lint wiring | CURRENT；`audit:docs-sync` 先跑 skill `8/8` 再跑结构审计 |
| `scripts/invite.mjs` | 邀请码管理 CLI（create/list/revoke，P1A-3） | 活文档 |
| `scripts/seed-quota.mjs` | 配额占位值幂等 upsert CLI（--dry-run/--confirm，P1A-7，数值集中 `packages/domain/src/usage/seed-data.ts`） | 活文档 |
| `scripts/verify-release-source.mjs` / `scripts/release-sync-command.mjs` / `scripts/cloud-sync.mjs` | 发布源守卫与云同步：要求 clean `HEAD == release ref`，完整 `git archive` 落入 write-once `/opt/openscience-releases/<sha>`；既有 SHA 永不自动覆盖，仅临时 stage 可清理 | **CURRENT release boundary**；完整输入核验与 failed-stage cleanup 合同 GREEN |
| `apps/` | `web` 已实现三栏 SDF 编辑器（P1B-8）+ 移动端抽屉/分步 + WCAG AA（P1B-9）+ **协作区域单页 /research-objects/[id]/collab（P1C-10）+ AI 提取按钮/进度条（P1D-3）**（lib/api + editor-state + suggestions + components/editor + components/collab + i18n 中英）+ **next-intl 已接通（i18n/request.ts + NextIntlClientProvider + LocaleSwitcher，2026-08-06）+ 公开页文案全量 i18n（messages public 命名空间）+ public/ 静态资产（favicon/logo/og-image + hermes/ Live2D 占位）**；`api` 已含 Fastify `/auth`（P1A-3）+ `/workspaces`（P1A-4）+ RBAC preHandler 授权守卫（P1A-5）+ `/admin/audit-logs`（P1A-6）+ `/usage` 与 `/admin/quota-policies`、`/admin/credits`、`/admin/usage`（P1A-7）+ 安全基线 `src/security/`（P1A-8）+ **`/research-objects` + `/sdf`（P1B-2）** + **`/artifacts`（P1B-3）** + **`/commits` + `/versions` + comparison（P1B-4/5）** + **`/research/:publicId` 公开 URL（P1B-6）** + **`/visibility` + `/visibility-grants`（P1B-7）** + **`/versions/:id/export`（P1B-10 zip）** + **`/research-objects/:id/branches`（P1C-2，4 端点）** + **`/research-objects/:id/issues`（P1C-3，5 端点）** + **`/research-objects/:id/licenses`（P1C-4，4 端点）+ `/licenses/catalog`** + **`/research-objects/:id/forks`（P1C-5，2 端点）** + **`/research-objects/:id/pull-requests`（P1C-6，3 端点）** + **`/research-objects/:id/authors` + `/contributions`（P1C-7，5 端点）** + **`/pull-requests/:prId/reviews` + `/merge`（P1C-8，3 端点）** + **`/notifications`（P1C-9，2 端点）** + **`/versions/:versionId/review`（P1D-5，2 端点）**；`agent-worker` 已实现队列消费者 + sdf.extract（P1D-2/3）；`science-worker` 沙箱执行链（dockerode 编排 + pending 轮询消费 + /output 产物收集落库 + AST 策略检查 + 安全基线测试，P1E-4/5/6）；`sandbox-controller` 空壳（功能落在 science-worker） | 骨架 |
| `packages/` | 11 个领域包 + **diff 包（P1B-5）+ identity 包（P1B-6）+ ai-gateway 包（P1D-1，AI 统一路由/回退/日志）**；database/storage 已实现 P1A-2；storage 已加 P1B-3 `blob.ts`；versioning 已实现 P1B-4；identity 已实现 P1B-6；database 已加 P1A-8 `rate-limit.ts`；auth 已实现 P1A-3 + P1A-9；domain 已实现 P1A-4/5/7 + P1B-2/3/4/5/6/7/10（research-object/artifact/commit/diff/identity/visibility/export）+ **P1C-1~10（collab 全模块）**；config 已加 P1B-3 storage + P1B-6 publicIdPrefix + P1D-1 ai env；sdf-schema 已实现 P1B-1；其余占位；云上集成 88/88 全绿（2026-08-04），Phase 1B/1C/1D-1/2 完成 | 已实现 |
| `packages/ai-gateway/src/provider.ts` / `apps/agent-worker/src/index.ts` | 普通 MiniMax OpenAI-compatible 与 Token Plan Anthropic-compatible provider；实际 model ID 与日志槽位分离，key1→key2 配置化回退；结构化输出兼容 thinking/fenced JSON | 已部署；国内 Token Plan 探针与生产 ingestion `needs_review` 闭环通过（2026-08-10） |
| `packages/domain/src/ingestion/ingestion-service.ts` / `apps/api/src/routes/ingestion.ts` / `apps/web/app/research-objects/[id]/hermes/page.tsx` | Hermes ingestion 建议读取、SDF 六字段人工确认、乐观锁写入与 `needs_review → confirmed` 状态流 | 本地实现，待服务器验收（2026-08-10） |
| `infra/scripts/backup.sh` / `docs/runbooks/backup-restore.md` | PostgreSQL + SeaweedFS volume 非破坏备份入口；先校验 active `.release-id`/release marker，再以相同 versioned Compose 执行 | 已实现，待服务器恢复演练（2026-08-10） |
| `infra/scripts/deploy.sh` / `infra/scripts/deploy.test.mjs` | ECS dry-run/confirmed release 部署；完整 Git archive、SHA root/image、非 root 只读 mount、显式 rollback ref、同 SHA no-op、Parser 先行 healthy；首次迁移保存运行 image ID，后续使用 previous Compose，回滚失败撤销 identity | CURRENT；禁止 `--skip-build`，公网成功前保留可验证上一 release |
| `apps/agent-worker/Dockerfile` / `apps/agent-worker/Dockerfile.parser` / `apps/agent-worker/parser-image/{package.json,package-lock.json}` / `apps/agent-worker/src/{clamav,ingestion-parser,parser-job-isolation,parser-service}.ts` | Worker 与 lockfile 固定的自包含 document-parser；构建期经 ECS Squid，运行时无网络/Secret、非 root、只读、512MiB/64 PID、128MiB bounded IPC；Tesseract `eng+chi_sim`、ClamAV fail-closed | CURRENT；ECS 隔离 inspect 与固定哈希 24.7MiB PDF 纵向 gate GREEN（2026-08-17） |
| Rejected local Hermes Blender prototype (not repository content) | 少年星图龙只保留 `hermes-constellation-dragon/apps/web/assets/hermes/HermesConstellationDragon.blend`（SHA-256 `9CF4694D…DDFA5`）；`.blend1`、渲染/contact sheet、manifest、旧脚本/合同已清理 | **用户视觉 NO-GO / HISTORICAL SOURCE ONLY**；二进制进回收站，禁止误读为候选资产 |
| `.cursor/` | Cursor 编辑器配置 | 工具自管 |
| `.taskmaster/` | task-master 任务状态 | 工具自管 |
| `.memory/memory.jsonl` | Memory MCP 知识图谱存储（MEMORY_FILE_PATH 指定） | 工具自管，随 git 备份 |
| `src/` | 未来代码 | 空 |

## docs/
| 路径 | 用途 | 状态 |
|---|---|---|
| `docs/OpenScience_Kimi_Development_Spec.md` | **需求基线 Baseline v1.0（source of truth）** | 活文档，登记例外，禁移动/改名 |
| `docs/OpenScience_Kimi_Development_Spec.docx` | 基线的 docx 原件 | 只读原件 |
| `docs/OpenScience_Kimi_Starter_Pack.zip` | 开发启动包 | 只读原件 |
| `docs/user_ideas/8.10/OpenScience_Art_Direction_v3.md` | Optical Editorial Instrument 唯一视觉真源；覆盖 Masterplan v2 的蓝紫宇宙、六节点圆环与卡片化视觉 | 活文档；从设计 handoff ZIP 原文恢复（2026-08-10） |
| `docs/handoff/2026-08-10-product-surfaces-task12-handoff.md` | Task 12 产品表面矩阵与真实工作区路由交接；记录本地门禁、部署证据待补和下一步 Task 13 | 活交接 |
| `docs/specs/2026-07-24-doc-architecture-design.md` | 文档架构设计 spec（已批准） | 活文档 |
| `docs/specs/2026-07-24-mvp-task-breakdown-design.md` | MVP 任务拆解与工具配置设计（待用户审阅） | 活文档 |
| `docs/specs/2026-07-28-p1a-2-data-foundation-design.md` | P1A-2 数据基础设计（PostgreSQL/Redis/Storage Adapter，已批准，代码已实现，集成测试待阿里云执行） | 活文档 |
| `docs/specs/2026-07-28-p1a-3-invitation-auth-design.md` | P1A-3 邀请码注册与邮箱验证 Auth 设计（已批准，本地已实现，集成测试待阿里云） | 活文档 |
| `docs/specs/2026-07-29-p1a-4-workspace-design.md` | P1A-4 Workspace 模型与成员管理设计（已批准，代码已实现，云上集成测试已全绿 2026-07-31） | 活文档 |
| `docs/specs/2026-08-01-p1a-5-rbac-design.md` | P1A-5 RBAC 权限矩阵设计（已批准，代码已实现，云上集成测试 11/11 全绿 2026-08-01） | 活文档 |
| `docs/specs/2026-08-01-p1a-6-audit-observability-design.md` | P1A-6 统一错误/日志/配置/审计底座设计（已批准，代码已实现，云上集成 15/15 全绿 2026-08-01） | 活文档 |
| `docs/specs/2026-08-03-p1a-7-quota-credits-design.md` | P1A-7 配额策略与 AI Credit 账务骨架设计（design gate 已确认，代码已实现，云上集成 17/17 全绿 2026-08-03） | 活文档 |
| `docs/specs/2026-08-03-p1a-8-security-baseline-design.md` | P1A-8 安全基线设计（design gate 逐节已确认，代码已实现，云上集成 21/21 全绿 2026-08-03） | 活文档 |
| `docs/specs/2026-08-03-p1a-9-cicd-deploy-backup-design.md` | P1A-9 CI/CD 与 ECS 部署及备份设计（design gate 已确认：GitHub Actions/仅 PG dump/临时库演练 + QQ SMTP 偏离，生产已上线 2026-08-03） | 活文档 |
| `docs/specs/2026-08-03-p1b-1-sdf-schema-design.md` | P1B-1 SDF 六字段 core + manifest JSON Schema 设计（design gate 已确认：手写 JSON Schema + ajv，additionalProperties 宽容债务，代码已实现 2026-08-03） | 活文档 |
| `docs/specs/2026-08-03-p1b-2-ro-sdf-model-design.md` | P1B-2 RO/SDF 数据模型设计（design gate 已确认：三实体 + 迁移 7 + API 骨架，代码已实现 2026-08-03） | 活文档 |
| `docs/specs/2026-08-08-openscience-product-web-design.md` | 产品级网页设计 spec（方向 A：Monumental Scholarly Intelligence；统一 RO 工作流、Hermes/Live2D、Public RO、Ultrafast Science 策展、许可与版本模型；用户已批准，待书面审阅） | 活文档 |
| `docs/specs/2026-08-10-optical-editorial-rebaseline-design.md` | 前端视觉与交互 spec：Art Direction v3 Optical Editorial Instrument 为视觉真源；2026-08-11 增量优化边界明确为保留现有线上功能、优先优化 Landing，再传播到 Explore/Dashboard/创建页/公开 RO | 用户已确认范围，待书面审阅 |
| `docs/specs/2026-08-15-hermes-constellation-dragon-prototype-design.md` | Hermes 少年星图龙轻量 Blender 原型历史设计 | **用户视觉 NO-GO**；不得作为当前候选 |
| `docs/specs/2026-08-15-hermes-2d-pet-design.md` | Hermes 2.5D 整图 PNG/CSS-signal 历史原型 | **DEPRECATED / VISUAL NO-GO**；资产可复用，renderer 不得继续 |
| `docs/specs/2026-08-17-hermes-workspace-companion-motion-design.md` | Hermes Workspace Companion 已实施 guide/anchor/travel/dock/diff foundation 与历史 OGL visual contract | **IMPLEMENTED FOUNDATION / VISUAL SUPERSEDED**；CURRENT renderer 见 2026-08-19 Wanko spec |
| `docs/specs/2026-08-19-hermes-wanko-live2d-design.md` | Wanko renderer、`360/200px`、Research Folio；§13.3–13.7 carried sheet、speech、skill reject、action-first 与联合稳定器；§13.8 detached/protected physical fallback | **CURRENT Hermes visual/guide design / §13.8 deployed**；application/release/rollback `9aef5c4` / `8395b4d` / `bf54eaa`，public no-write `10/10`，user review pending |
| `docs/specs/2026-08-24-research-folio-product-system-design.md` | 登录到公开验证的全部真实非 Landing 产品视觉与信息架构；暖纸阅读、graphite 证据工具、18 表面、预留 Hermes 研究页边与无覆盖合同 | **CURRENT non-Landing product UI spec / IMPLEMENTED**；Landing unchanged |
| `docs/specs/2026-08-22-wanko-scholar-hat-design.md` | canonical Wanko 常驻学者帽视觉、佩戴遮挡、流苏运动和 visual-before-Cubism 门 | **CURRENT accessory design COMPLETE / DEPLOYED**；v09 母版与 2026-08-23 runtime bundle 已随 release `5f4e73c` 部署 |
| `docs/specs/2026-08-18-readable-workspace-hermes-guidance-design.md` | B 平衡学者工作台、三视觉系统阅读基线、浏览器无关控件样式、Hermes 不遮挡引导编舞与公网 blank RO→六字段→diff→commit 真实验收 | **IMPLEMENTED FOUNDATION / CARRIED FORWARD**；首次公网真实验收 `06072c1`，现行 release `5f4e73c` |
| `docs/plans/2026-08-18-readable-workspace-hermes-guidance-plan.md` | 可读性基础→代表页面→完整 Hermes footprint 避让→edit-before-accept/缺失证据→语义动作→公网 blank RO gate→ECS checkpoint 的 TDD 实施链 | **COMPLETED**；release `06072c1` / rollback `8ecf96c` |
| `docs/plans/2026-08-19-hermes-wanko-live2d-plan.md` | Tasks 1–20 与 Task 21 的 Wanko、`360/200px` movable companion、protected-region/bubble collision、三视口 Dashboard 与 ECS rollback 实施证据 | **COMPLETED / HISTORICAL EXECUTION EVIDENCE**；release `5f4e73c`，不得作为下个任务的 CURRENT plan |
| `docs/plans/2026-08-24-hermes-contextual-workbench-review-plan.md` | 暖纸视觉评审 route 的 TDD、真实 Hermes、键盘/长按/assistant、浏览器截图、docs-sync 与 immutable ECS 部署任务链 | **COMPLETED REVIEW RELEASE**；Tasks 1–12 complete，release `bba5f14` |
| `docs/plans/2026-08-24-research-folio-product-system-plan.md` | Research Folio 的合同、共享 shell、Hermes 锚定几何、identity/Dashboard/create/RO/public/admin 迁移、60-case production browser 门禁与 immutable ECS 发布链；Tasks 9–10 为口部 speech/menu refinement | **Tasks 1–10 COMPLETE**；application `eb55820`，ECS `3010903` / `33418fd` |
| `docs/plans/2026-08-25-hermes-orbit-actions-plan.md` | 已批准的 Hermes 两段式发言、12 项情境动作、桌面环绕布局、移动分组、安静场景与 ECS 验收实施链 | **COMPLETED / DEPLOYED**；application `e4a19d4`，ECS `7165e9b` / rollback `3010903` |
| `docs/plans/2026-08-25-hermes-carried-tool-sheet-plan.md` | §13.3 的动作/语言合同、工具页—32px 间隙—Hermes 物理分带、Radix 键盘/长按、视觉门禁和 immutable ECS 发布链 | **COMPLETED / DEPLOYED EXECUTION EVIDENCE**；application `1b3bada`，release/rollback `8ed2f3c` / `7165e9b` |
| `docs/plans/2026-08-25-hermes-continuous-speech-correction-plan.md` | §13.4 视觉纠错实施链：单闭合 SVG、真实口部、帽顶净空、slender tail、菜单 `24–48px`、阅读避让、原尺寸审图与 ECS 验收 | **COMPLETED / DEPLOYED EXECUTION EVIDENCE**；application/release/rollback `9a7263e` / `cbf5737` / `cc6cff6` |
| `docs/specs/2026-08-16-hermes-articulated-mesh-pet-design.md` | Hermes 原创 OGL 2D mesh-rig 历史设计：真实角色像素关节、旧待机语法与严格 lifecycle | **DEPRECATED**；由 2026-08-17 Workspace Companion spec 取代 |
| `docs/specs/2026-08-16-hermes-contextual-guide-design.md` | Hermes 情境引导员历史设计：Dashboard 提示、助手抽屉与正式 `workspace.guide` 闭环 | **DEPRECATED**；由 2026-08-17 Workspace Companion spec 取代 |
| `docs/data/launch-research-corpus.md` | 18 条公开启动语料的范围、免责声明、真实来源、上游许可证证据与 ECS seed 操作边界 | 活文档；本地完成，待生产 seed |
| `docs/plans/2026-08-08-openscience-product-web-plan.md` | 旧产品级网页实现计划；2026-08-10 被 Optical Editorial v3 计划取代，仅保留历史 | DEPRECATED |
| `docs/plans/2026-08-10-optical-editorial-frontend-plan.md` | Optical Editorial v3 完整实施计划：15 Task 覆盖生产基线、foundations、三联屏、Auth/Intake/Dashboard/Hermes、Explore/启动语料、Editorial、其余产品面、Figma、质量门禁与 ECS E2E | 当前执行计划 |
| `docs/plans/2026-08-15-hermes-constellation-dragon-prototype-plan.md` | 少年星图龙的 RED 资产合同、确定性 Blender builder、四视图/待机渲染与视觉 stop/go；不接产品运行时 | **历史 NO-GO 计划**；停止执行 |
| `docs/plans/2026-08-15-hermes-2d-pet-plan.md` | Hermes 2.5D 原创资产生成与已删除整图/CSS-signal presentation 历史计划 | **DEPRECATED / VISUAL NO-GO**；只保留资产生成历史 |
| `docs/plans/2026-08-17-hermes-workspace-companion-motion-plan.md` | Hermes Workspace Companion 历史实施计划：事实源、行为导演、part-rig、锚点/路径/停靠、全局 stage、字段引导、diff、默认 full/常驻控制与真实 release gate | **IMPLEMENTED FOUNDATION / HISTORICAL ENTRY**；部署基线 `39c752b`，不得覆盖 2026-08-18 CURRENT next action |
| `docs/plans/2026-08-16-hermes-contextual-guide-plan.md` | Hermes Dashboard 情境引导员历史实施：真实提示模型、`workspace.guide` Worker、助手抽屉与纵向验收 | 已完成的基础能力；新范围转入 2026-08-17 计划 |
| `docs/plans/2026-08-16-hermes-articulated-mesh-pet-plan.md` | Hermes mesh-rig 历史实施：继承纠偏、motion model、真实像素 OGL rig 与感知门禁 | 已完成的基础能力；新范围转入 2026-08-17 计划 |
| `apps/web/app/_visual/hermes-articulation/` / `apps/web/app/%5Fvisual/hermes-articulation/` / `apps/web/test/visual/hermes-articulation-gate.mjs` / `apps/web/test/visual/hermes-performance-gate.mjs` / `apps/web/test/visual/hermes-release-gate.mjs` | Hermes 隔离视觉夹具与 CI 聚合门禁：固定自主时钟、语义 head/forepaws/tail/crown/evidence region 像素、非重叠关节光学配准、裂缝/连通性、整图 affine mutation、冷加载/first-ready 与真实 WebGL draw cadence；production 默认 404 | Task 5 `757de5b` standalone gates GREEN；SwiftShader 证据不替代物理设备或用户审美验收 |
| `packages/domain/src/agent/workspace-guide-contract.ts` / `apps/api/src/routes/agent.ts` / `apps/agent-worker/src/workspace-guide.ts` | `workspace.guide` 跨进程唯一 payload 边界、API 写前校验、Worker trusted-context 重建；模型只读取 membership-scoped RO/SDF 摘要并返回严格只读导航 | CURRENT；真实 ECS MiniMax/Dashboard 任务 GREEN，共享 parser 与 target allowlist 保持严格 |
| `packages/domain/src/agent/agent.ts` / `apps/agent-worker/src/index.ts` / `apps/agent-worker/test/queue-recovery.test.ts` | Hermes task 的 Serializable credit 预留、三次 `P2034` 上界、workspace.guide/sdf.extract 未派发 DB outbox 协调与单消费者 processing 恢复；文本 `sdf.extract` 仅一次安全 retry，blocked/artifact/其他 kind 不可重试 | CURRENT；原 payload/credit 保持不变，Redis 失败恢复合同 GREEN |
| `scripts/docs/hermes-renderer-index.mjs` / `scripts/docs/hermes-renderer-index.test.mjs` | Hermes 事实源门禁：唯一 CURRENT renderer 是 2026-08-19 Wanko，2026-08-17 仅保留 implemented foundation，旧 articulated/2.5D/3D/sprite 不得恢复 | **CURRENT contract**；Wanko 路由与 active-memory 状态已锁定 |
| `apps/web/test/{hermes-behavior-director,hermes-motion-mixer,hermes-travel-path,hermes-dock-preferences,hermes-anchor-registry,hermes-draft-diff}.test.ts` / `apps/web/test/e2e/{hermes-dashboard,hermes-workspace-stage,hermes-field-guide,hermes-draft-diff}.spec.ts` | Workspace Companion 行为、完整 actor+bubble footprint、安全航线、停靠/锚点、edit/apply/dismiss/missing disclosure、默认 full/常驻切换与真实 rig pointer hit | CURRENT acceptance evidence；Task 4 focused `30/30`、browser `5/5` 于 `44b61b0` GREEN |
| `apps/web/test/visual/hermes-articulation-gate.mjs` / `apps/web/test/visual/hermes-companion-motion-gate.mjs` / `apps/web/test/visual/hermes-guidance-geometry-gate.mjs` / `apps/web/test/visual/hermes-release-gate.mjs` | 确定呼吸/字段语义关节帧、90 秒真实动作、内部 pointer articulation、逐 RAF 航行、Diff 安全与聚合门禁；内部动作不得拖动 enclosing silhouette，整图 affine mutation 必须失败 | Task 6 aggregate `158s` GREEN；ECS-only leg 仅在显式环境开关下运行 |
| `apps/web/lib/extract-review-state.ts` / `apps/web/test/e2e/hermes-blank-ro-flow.spec.ts` / `apps/web/test/visual/hermes-blank-ro-production-gate.mjs` | blank RO 字段级 evidence diff、accept/edit-accept/reject/missing/save/reload/commit；checkpoint 只存 task/决策元数据，storage/transport/Redis 失败复用同一付费 task；公网 gate 要求真实账号/MiniMax、零拦截、credit/audit/immutable snapshot、完整 footprint、真实 Wanko idle/work/review/celebration pixels 与 zh/en/mobile/reduced | **IMPLEMENTED FOUNDATION / CARRIED FORWARD**；真实账号纵向证据来自 `06072c1`，现行 `5f4e73c` 仅重跑无写入 Dashboard UI gate |
| `apps/web/test/visual/hermes-real-ro-production-gate.mjs` / `packages/domain/test/artifact/scan.test.ts` | ECS-only 真实论文纵向门禁：固定 arXiv 2009.06045v1 SHA-256、浏览器创建/上传、MiniMax 六字段决策与原文证据、确认前 SDF 不变、显式缺失披露、bulk confirm/version commit、Hermes runtime；上传响应与状态轮询均允许 300 秒生产边缘延迟，同时锁定合法 PDF `../` 不误判而真实 ZIP traversal 继续拒绝 | **ECS-ONLY SMOKE TOOL**；最近完整真实证据来自 `06072c1`，`5f4e73c` 未重跑；不使用本机 Docker、不拦截 API，输出仅写 ignored visual evidence |
| `docs/handoff/2026-08-15-hermes-constellation-dragon-prototype-handoff.md` | 少年星图龙静态 Blender 原型、结构门禁与用户 NO-GO 结论 | 历史交接；不得按其 next action 恢复 3D |
| `docs/handoff/2026-08-16-hermes-2d-pet-handoff.md` | 唯一 compact CURRENT 交接：Hermes 冻结、Landing Task 24、Chrome reduced-motion 诊断结论与本地/ECS version tuple | **CURRENT active-memory**；用户已确认恢复正常；application/release/rollback `2934476` / `2934476` / `58614c0` |
| `docs/plans/2026-08-26-landing-motion-navigation-continuity-plan.md` | 冻结 Hermes、补全 Landing final-composite gate 与真实产品页一级/RO 二级入口 | **COMPLETED / DEPLOYED**；application/release/rollback `c80f739` / `263c783` / `8395b4d` |
| `docs/design/optical-editorial-figma-map.md` | 长期账号 Figma canonical 的 V3 variables/styles/components/八表面节点映射、代码对应关系与 Code Connect 边界 | Task 13 canonical 映射 |
| `docs/superpowers/specs/2026-08-09-researcher-ingestion-product-slice-design.md` | 研究者第一条产品级前端闭环设计：注册、Dashboard、资料导入、Hermes 证据确认、RO Workspace；待用户审阅 | 设计 spec |
| `docs/superpowers/plans/2026-08-09-researcher-ingestion-product-slice-plan.md` | 研究者导入闭环实施计划：基础视觉、Auth/Dashboard、多格式上传、Hermes 证据、RO Workspace、浏览器验收与生产部署；Task 1–2 完成，Task 3 启动 | 执行中 |
| `docs/handoff/2026-08-09-researcher-ingestion-product-slice-handoff.md` | 研究者导入闭环活交接；Task 1–2 完成与复审证据，当前进入 Task 3 | 活文档 |
| `docs/superpowers/plans/2026-08-11-landing-incremental-optimization-plan.md` | 现有 Optical Editorial Landing 增量优化计划：排版/CTA、双层粒子场、Open RO 第二屏、全量 Web 门禁与 ECS 验收；不改 API/数据模型 | 已写入，待选择执行方式 |
| `docs/decisions/ADR-004-figma-account-ownership-and-migration.md` | Figma 临时/长期账号所有权、双 OAuth 隔离、canonical 设计稿迁移与验收决策 | Accepted |
| `docs/decisions/ADR-005-public-email-code-registration.md` | 公开邮箱验证码注册取代邀请码门禁；legacy invitation 仅兼容，规定限流/审计/并发与失败安全 | Accepted |
| `docs/decisions/ADR-006-ingestion-parser-and-ocr-strategy.md` | PDF/DOCX 受控解析、图片本地 OCR 优先与 MiniMax fallback 边界；any2pdf 仅用于未来导出 | Accepted |
| `docs/decisions/ADR-007-production-object-storage.md` | 生产对象存储选择 SeaweedFS 4.41 S3 模式；拒绝归档的 MinIO legacy binary，新 Secret/内网/卷/备份边界 | Accepted |
| `docs/decisions/ADR-008-minimax-token-plan-provider.md` | MiniMax Token Plan 使用 Anthropic Messages 协议；Subscription Key 与普通 API Key 分流，key1→key2 回退与生产边界 | Accepted |
| `docs/decisions/ADR-009-optical-runtime-and-fonts.md` | Accepted production `ogl@1.0.11` Landing/Lab shared exception；WebGL2→exact static/reduced/failure policy、continuous visible ambient suspension、client-only/ECS boundary、measured `/` client/static budget、exact rollback ref boundary；旧 Canvas-only/no-Lab-chunk rule retired | Accepted，2026-08-14 amended；物理移动端 gate 未关闭 |
| `docs/decisions/ADR-010-hermes-visual-runtime-and-live2d-license-gate.md` | Hermes 原创 articulated renderer、静态 fallback、真实任务/六态/单实例契约；2026-08-23 记录 operator 明确接受条款并授权开发阶段服务器部署的 exception，不代表正式 publication licence 分类已验证 | Accepted + development exception |
| `docs/decisions/ADR-011-immutable-git-release-directories.md` | 完整 Git commit → SHA 目录、SHA images、非 root 只读 mounts、稳定 Secret/identity、显式 rollback ref 与 fail-closed recovery | Accepted；CURRENT ECS release topology |
| `docs/handoff/2026-08-08-product-web-tooling-handoff.md` | 产品网页工具前置交接（Codex 10 MCP、双 Figma OAuth、迁移 ADR、重启后验证顺序） | 当前 handoff |
| `docs/handoff/2026-08-10-optical-editorial-rebaseline-handoff.md` | Optical Editorial v3 前端重构交接：27 项 grill-me 决策、三联屏浏览器优先路线、服务器直接验收 | 当前 handoff |
| `docs/handoff/2026-08-10-figma-canonical-task13-handoff.md` | Task 13 长期账号 canonical、节点审计、文档门禁与 Task 14 接续说明 | 活交接 |
| `docs/handoff/2026-08-10-product-release-gate-task14-handoff.md` | Task 14 27 案浏览器矩阵、全仓门禁、既有审计债务与 ECS Task 15 接续 | 当前 handoff |
| `docs/handoff/2026-08-11-optical-editorial-production-acceptance-handoff.md` | `f5bb6e7` ECS 部署、回滚 ref/hash、真实账号 ingestion→Hermes→version 与公开路由验收 | 当前生产 handoff |
| `docs/handoff/2026-08-11-optical-editorial-v3-complete-handoff.md` | Optical Editorial v3 15/15 完成、Hermes 原创 renderer、`0c79aa2` ECS 发布与全量浏览器门禁 | 当前完成 handoff |
| `docs/handoff/2026-08-11-optical-editorial-optimization-design-handoff.md` | 首页增量优化设计交接：保留线上功能与风格，先优化 Landing，再传播到 Explore/Dashboard/创建页/公开 RO | 当前 handoff |
| `docs/handoff/2026-08-11-optical-lab-task8-steps3-5-handoff.md` | Optical Lab Candidate B、高保真 OGL Task 1–8 与资产路线历史证据 | HISTORICAL → 当前入口为 `docs/handoff/2026-08-13-optical-lab-asset-interaction-handoff.md`；不得按其旧 next action 重启资产验证 |
| `docs/handoff/2026-08-13-optical-lab-asset-interaction-handoff.md` | Task 19–23 Optical asset 历史实施与部署证据 | **HISTORICAL → CURRENT Task 24 design 见 2026-08-14 water-flow spec，执行状态见 compact 2026-08-16 handoff** |
| `docs/specs/2026-08-04-p1b-3-blob-artifact-upload-design.md` | P1B-3 Blob 内容寻址存储与上传管线设计（design gate 已确认：五决策，代码已实现 2026-08-04） | 活文档 |
| `docs/plans/2026-07-24-doc-architecture-plan.md` | 文档架构落地实施计划 | 活文档 |
| `docs/plans/2026-07-24-mvp-task-breakdown-plan.md` | MVP 任务拆解与工具配置实施计划（已批准，执行中） | 活文档 |
| `docs/plans/2026-07-28-p1a-1-monorepo-skeleton-plan.md` | P1A-1 Monorepo 全量占位骨架实施计划（方案 A，已确认） | 活文档 |
| `docs/plans/2026-07-28-p1a-2-data-foundation-plan.md` | P1A-2 数据基础实施计划（PostgreSQL/Redis/Storage Adapter） | 活文档 |
| `docs/plans/2026-07-28-p1a-3-invitation-auth-plan.md` | P1A-3 邀请码注册与邮箱验证 Auth 实施计划（本地执行完毕，云上集成测试待执行） | 活文档 |
| `docs/plans/2026-07-29-p1a-4-workspace-plan.md` | P1A-4 Workspace 模型与成员管理实施计划（本地执行完毕，云上集成测试已全绿 2026-07-31） | 活文档 |
| `docs/plans/2026-08-01-p1a-5-rbac-plan.md` | P1A-5 RBAC 权限矩阵实施计划（已执行完毕，云上 11/11 全绿，task-master 2.5 done 2026-08-01） | 活文档 |
| `docs/plans/2026-08-01-p1a-6-audit-observability-plan.md` | P1A-6 统一错误/日志/配置/审计底座实施计划（已执行完毕，云上 15/15 全绿，task-master 2.6 done 2026-08-01） | 活文档 |
| `docs/plans/2026-08-03-p1a-7-quota-credits-plan.md` | P1A-7 配额策略与 AI Credit 账务骨架实施计划（已执行完毕，云上 17/17 全绿，task-master 2.7 done 2026-08-03） | 活文档 |
| `docs/plans/2026-08-03-p1a-8-security-baseline-plan.md` | P1A-8 安全基线实施计划（已执行完毕，云上 21/21 全绿，task-master 2.8 done 2026-08-03） | 活文档 |
| `docs/plans/2026-08-03-p1a-9-cicd-deploy-backup-plan.md` | P1A-9 CI/CD 与 ECS 部署实施计划（已执行完毕，生产已上线，task-master 2.9 done 2026-08-03） | 活文档 |
| `docs/plans/2026-08-03-p1b-1-sdf-schema-plan.md` | P1B-1 SDF Schema 实施计划（已执行完毕，task-master 3.1 done 2026-08-03） | 活文档 |
| `docs/plans/2026-08-03-p1b-2-ro-sdf-model-plan.md` | P1B-2 RO/SDF 数据模型实施计划（已执行完毕，云上 26/26，task-master 3.2 done 2026-08-03） | 活文档 |
| `docs/plans/2026-08-04-p1b-3-blob-artifact-upload-plan.md` | P1B-3 Blob 内容寻址存储与上传管线实施计划（已执行完毕，云上 35/35，task-master 3.3 done 2026-08-04） | 活文档 |
| `docs/specs/2026-08-04-p1b-4-version-engine-design.md` | P1B-4 Commit/Manifest 版本引擎设计（design gate 已确认：五决策，代码已实现 2026-08-04） | 活文档 |
| `docs/plans/2026-08-04-p1b-4-version-engine-plan.md` | P1B-4 Commit/Manifest 版本引擎实施计划（已执行完毕，云上 41/41，task-master 3.4 done 2026-08-04） | 活文档 |
| `docs/specs/2026-08-04-p1b-5-diff-service-design.md` | P1B-5 多类型确定性 Diff 服务设计（design gate 已确认：五决策，代码已实现 2026-08-04） | 活文档 |
| `docs/plans/2026-08-04-p1b-5-diff-service-plan.md` | P1B-5 多类型确定性 Diff 服务实施计划（已执行完毕，云上 45/45，task-master 3.5 done 2026-08-04） | 活文档 |
| `docs/specs/2026-08-04-p1b-6-identity-service-design.md` | P1B-6 标识层与时间戳服务设计（design gate 已确认：五决策，代码已实现 2026-08-04） | 活文档 |
| `docs/plans/2026-08-04-p1b-6-identity-service-plan.md` | P1B-6 标识层与时间戳服务实施计划（已执行完毕，云上 50/50，task-master 3.6 done 2026-08-04） | 活文档 |
| `docs/specs/2026-08-04-p1b-7-visibility-permissions-design.md` | P1B-7 RO 可见性模型与 API 权限强制设计（design gate 已确认：五决策，代码已实现 2026-08-04） | 活文档 |
| `docs/plans/2026-08-04-p1b-7-visibility-permissions-plan.md` | P1B-7 RO 可见性模型与 API 权限强制实施计划（已执行完毕，云上 55/55，task-master 3.7 done 2026-08-04） | 活文档 |
| `docs/specs/2026-08-04-p1b-8-sdf-editor-design.md` | P1B-8 三栏 SDF 编辑器桌面端设计（design gate 已确认：五决策，代码已实现 2026-08-04） | 活文档 |
| `docs/plans/2026-08-04-p1b-8-sdf-editor-plan.md` | P1B-8 三栏 SDF 编辑器桌面端实施计划（已执行完毕，next build 通过，task-master 3.8 done 2026-08-04） | 活文档 |
| `docs/specs/2026-08-04-p1b-9-mobile-a11y-design.md` | P1B-9 移动端分步/抽屉编辑器与可访问性设计（design gate 已确认：五决策，代码已实现 2026-08-04） | 活文档 |
| `docs/plans/2026-08-04-p1b-9-mobile-a11y-plan.md` | P1B-9 移动端分步/抽屉编辑器与可访问性实施计划（已执行完毕，next build 通过，task-master 3.9 done 2026-08-04） | 活文档 |
| `docs/specs/2026-08-04-p1b-10-sdf-export-design.md` | P1B-10 SDF 标准导出包生成与校验设计（design gate 已确认：五决策，代码已实现 2026-08-04） | 活文档 |
| `docs/plans/2026-08-04-p1b-10-sdf-export-plan.md` | P1B-10 SDF 标准导出包生成与校验实施计划（已执行完毕，云上 58/58，task-master 3.10 done 2026-08-04） | 活文档 |
| `docs/specs/2026-08-04-p1c-1-collab-model-design.md` | P1C-1 协作域数据模型与迁移设计（design gate 已确认：五决策，代码已实现 2026-08-04） | 活文档 |
| `docs/plans/2026-08-04-p1c-1-collab-model-plan.md` | P1C-1 协作域数据模型与迁移实施计划（已执行完毕，云上 62/62，task-master 4.1 done 2026-08-04） | 活文档 |
| `docs/specs/2026-08-04-p1c-2-branch-management-design.md` | P1C-2 Branch 管理与可见性继承设计（design gate 已确认：五决策，代码已实现 2026-08-04） | 活文档 |
| `docs/plans/2026-08-04-p1c-2-branch-management-plan.md` | P1C-2 Branch 管理与可见性继承实施计划（已执行完毕，云上 63/63，task-master 4.2 done 2026-08-04） | 活文档 |
| `docs/specs/2026-08-04-p1c-3-issue-comment-design.md` | P1C-3 Issue 与评论基础交互设计（design gate 已确认：五决策，代码已实现 2026-08-04） | 活文档 |
| `docs/plans/2026-08-04-p1c-3-issue-comment-plan.md` | P1C-3 Issue 与评论基础交互实施计划（已执行完毕，云上 67/67，task-master 4.3 done 2026-08-04） | 活文档 |
| `docs/specs/2026-08-04-p1c-4-license-design.md` | P1C-4 三类许可选择与继承规则设计（design gate 已确认：五决策，代码已实现 2026-08-04） | 活文档 |
| `docs/plans/2026-08-04-p1c-4-license-plan.md` | P1C-4 三类许可选择与继承规则实施计划（已执行完毕，云上 71/71，task-master 4.4 done 2026-08-04） | 活文档 |
| `docs/specs/2026-08-04-p1c-5-fork-design.md` | P1C-5 Fork 与来源关系及许可继承校验设计（design gate 已确认：五决策，代码已实现 2026-08-04） | 活文档 |
| `docs/plans/2026-08-04-p1c-5-fork-plan.md` | P1C-5 Fork 与来源关系及许可继承校验实施计划（已执行完毕，云上 74/74，task-master 4.5 done 2026-08-04） | 活文档 |
| `docs/specs/2026-08-04-p1c-6-pr-design.md` | P1C-6 Pull Request 声明与提交流程设计（design gate 已确认：五决策，代码已实现 2026-08-04） | 活文档 |
| `docs/plans/2026-08-04-p1c-6-pr-plan.md` | P1C-6 Pull Request 声明与提交流程实施计划（已执行完毕，云上 77/77，task-master 4.6 done 2026-08-04） | 活文档 |
| `docs/specs/2026-08-04-p1c-7-authors-design.md` | P1C-7 作者组与 CRediT 贡献记录设计（design gate 已确认：五决策，代码已实现 2026-08-04） | 活文档 |
| `docs/plans/2026-08-04-p1c-7-authors-plan.md` | P1C-7 作者组与 CRediT 贡献记录实施计划（已执行完毕，云上 79/79，task-master 4.7 done 2026-08-04） | 活文档 |
| `docs/specs/2026-08-04-p1c-8-review-merge-design.md` | P1C-8 Review 与 Merge 流程及高风险确认设计（design gate 已确认：五决策，代码已实现 2026-08-04） | 活文档 |
| `docs/plans/2026-08-04-p1c-8-review-merge-plan.md` | P1C-8 Review 与 Merge 流程及高风险确认实施计划（已执行完毕，云上 82/82，task-master 4.8 done 2026-08-04） | 活文档 |
| `docs/specs/2026-08-04-p1c-9-notification-design.md` | P1C-9 协作通知、事件投递与审计设计（design gate 已确认：五决策，代码已实现 2026-08-04） | 活文档 |
| `docs/plans/2026-08-04-p1c-9-notification-plan.md` | P1C-9 协作通知、事件投递与审计实施计划（已执行完毕，云上 84/84，task-master 4.9 done 2026-08-04） | 活文档 |
| `docs/specs/2026-08-04-p1c-10-collab-frontend-design.md` | P1C-10 GitHub 式协作区域前端设计（design gate 已确认：五决策，代码已实现 2026-08-04） | 活文档 |
| `docs/plans/2026-08-04-p1c-10-collab-frontend-plan.md` | P1C-10 GitHub 式协作区域前端实施计划（已执行完毕，next build 通过，task-master 4.10 done，Phase 1C 完成 2026-08-04） | 活文档 |
| `docs/specs/2026-08-04-p1d-1-ai-gateway-design.md` | P1D-1 AI Gateway 统一路由与调用日志设计（design gate 已确认：五决策，代码已实现 2026-08-04） | 活文档 |
| `docs/plans/2026-08-04-p1d-1-ai-gateway-plan.md` | P1D-1 AI Gateway 统一路由与调用日志实施计划（已执行完毕，云上 86/86，task-master 5.1 done 2026-08-04） | 活文档 |
| `docs/specs/2026-08-04-p1d-2-agent-tasks-design.md` | P1D-2 Hermes 会话与异步任务通道设计（design gate 已确认：五决策，代码已实现 2026-08-04） | 活文档 |
| `docs/plans/2026-08-04-p1d-2-agent-tasks-plan.md` | P1D-2 Hermes 会话与异步任务通道实施计划（已执行完毕，云上 88/88，task-master 5.2 done 2026-08-04） | 活文档 |
| `docs/specs/2026-08-04-p1d-3-extractor-design.md` | P1D-3 SDF Extractor 建议式提取设计（design gate 已确认：五决策，代码已实现 2026-08-04） | 活文档 |
| `docs/plans/2026-08-04-p1d-3-extractor-plan.md` | P1D-3 SDF Extractor 建议式提取实施计划（已执行完毕，云上 90/90，task-master 5.3 done 2026-08-04） | 活文档 |
| `docs/specs/2026-08-04-p1d-4-approval-design.md` | P1D-4 R0-R4 分级审批与统一确认设计（design gate 已确认：五决策，代码已实现 2026-08-04） | 活文档 |
| `docs/plans/2026-08-04-p1d-4-approval-plan.md` | P1D-4 R0-R4 分级审批与统一确认实施计划（已执行完毕，云上 92/92，task-master 5.4 done 2026-08-04） | 活文档 |
| `docs/specs/2026-08-04-p1d-5-publish-review-design.md` | P1D-5 发布审核硬阻断管线设计（design gate 已确认：五决策，代码已实现 2026-08-04） | 活文档 |
| `docs/plans/2026-08-04-p1d-5-publish-review-plan.md` | P1D-5 发布审核硬阻断管线实施计划（已执行完毕，云上 94/94，task-master 5.5 done 2026-08-04） | 活文档 |
| `docs/specs/2026-08-04-p1d-6-warnings-design.md` | P1D-6 发布审核警告层与结构化报告设计（design gate 已确认：五决策，代码已实现 2026-08-04） | 活文档 |
| `docs/plans/2026-08-04-p1d-6-warnings-plan.md` | P1D-6 发布审核警告层与结构化报告实施计划（已执行完毕，云上 95/95，task-master 5.6 done 2026-08-04） | 活文档 |
| `docs/specs/2026-08-04-p1d-7-appeal-design.md` | P1D-7 审核申诉流程与 Moderator 队列设计（design gate 已确认：五决策，代码已实现 2026-08-04） | 活文档 |
| `docs/plans/2026-08-04-p1d-7-appeal-plan.md` | P1D-7 审核申诉流程与 Moderator 队列实施计划（已执行完毕，云上 97/97，task-master 5.7 done 2026-08-04） | 活文档 |
| `docs/specs/2026-08-04-p1d-8-publish-design.md` | P1D-8 发布事务与状态机推进设计（design gate 已确认：五决策，代码已实现 2026-08-04） | 活文档 |
| `docs/plans/2026-08-04-p1d-8-publish-plan.md` | P1D-8 发布事务与状态机推进实施计划（已执行完毕，云上 99/99，task-master 5.8 done 2026-08-04） | 活文档 |
| `docs/specs/2026-08-04-p1d-9-public-page-design.md` | P1D-9 公开 RO 页面设计（design gate 已确认：五决策，代码已实现 2026-08-05） | 活文档 |
| `docs/plans/2026-08-04-p1d-9-public-page-plan.md` | P1D-9 公开 RO 页面实施计划（已执行完毕，next build 通过，task-master 5.9 done，Phase 1D 完成 2026-08-05） | 活文档 |
| `docs/specs/2026-08-06-p1e-4-sandbox-controller-design.md` | P1E-4 Sandbox Controller 与隔离 Docker 网络设计（design gate 已确认，代码已实现 2026-08-06） | 活文档 |
| `docs/plans/2026-08-06-p1e-4-sandbox-controller-plan.md` | P1E-4 Sandbox Controller 实施计划（已执行完毕，task-master 6.4 done 2026-08-06） | 活文档 |
| `docs/specs/2026-08-06-p1e-5-sandbox-jobs-api-design.md` | P1E-5 Sandbox Jobs API、配额限流与完成事件设计（design gate 已确认，代码已实现 2026-08-06） | 活文档 |
| `docs/plans/2026-08-06-p1e-5-sandbox-jobs-api-plan.md` | P1E-5 Sandbox Jobs API 实施计划（已执行完毕，云上集成测试通过，task-master 6.5 done 2026-08-06） | 活文档 |
| `docs/specs/2026-08-06-p1e-6-visualization-display-design.md` | P1E-6 可视化结果展示与 IndexedDB 临时存储设计（design gate 已确认，代码已实现 2026-08-06） | 活文档 |
| `docs/plans/2026-08-06-p1e-6-visualization-display-plan.md` | P1E-6 可视化结果展示实施计划（已执行完毕，task-master 6.6 done 2026-08-06） | 活文档 |
| `docs/specs/2026-08-06-p1e-7-script-modification-design.md` | P1E-7 自然语言修改脚本与 diff 展示设计（design gate 已确认，代码已实现 2026-08-06） | 活文档 |
| `docs/plans/2026-08-06-p1e-7-script-modification-plan.md` | P1E-7 脚本修改与 diff 实施计划（已执行完毕，task-master 6.7 done 2026-08-06） | 活文档 |
| `docs/specs/2026-08-06-frontend-visual-system-design.md` | 前端视觉系统设计 spec（三方定稿正式版：定位/符号/token/三套视觉/字体/IA/Hermes/分期/验收，源出设计方向稿 v2 终稿决策层） | 已定稿 |
| `docs/specs/2026-08-11-optical-lab-candidate-b-design.md` | Optical Lab Candidate B 历史设计：单一 GPU 字形层、固定狭缝与 native WebGL 生命周期 | DEPRECATED → `docs/specs/2026-08-11-optical-lab-high-fidelity-design.md`；工程通过但视觉否决 |
| `docs/specs/2026-08-11-optical-lab-high-fidelity-design.md` | `Science evolves.` 高保真生产共享规范：Task 19 建立透明 overlay；Task 22 以三尺度、不回绕 10s shader clock 与 curvature-gated 近中性窄光替代 Task 21 CSS sweep，其余 70ms、700ms local zero、5px follow、10px combined、.18 gain、纵向 .20/横向 .14 与 overlay `<=.04` / final `<=.08` 不变 | Task 22 已部署；物理手机门禁豁免至本任务结束，release `744c631` |
| `docs/plans/2026-08-06-frontend-p0-p1-plan.md` | 前端 P0 地基收尾 + P1 首页视觉原型实施计划（11 Task：Tailwind v4/token+WCAG 门禁/字体/shadcn/i18n/Header/EvolvingRoSymbol 两变体/Hero/#latest/Playwright 三尺寸截图/用户验收门） | 待执行 |
| `docs/superpowers/plans/2026-08-07-homepage-rework.md` | Landing 首页视觉重做计划（主视觉 bitmap、真实 latest/trust 模块、入口修复、截图验收） | 已完成（2026-08-07，commit 481b5c4） |
| `docs/superpowers/plans/2026-08-11-optical-lab-candidate-b-plan.md` | Optical Lab Candidate B 实施计划：纯模型静止能量/8px 液态折射 → Candidate A visual RED 与单一 GPU 字形 GREEN 合并复审 → 本地验收与用户选择 | Task 1–3 本地工程验收完成；Step 6 用户选择 pending，未部署 |
| `docs/superpowers/plans/2026-08-11-optical-lab-high-fidelity-reconstruction-plan.md` / `.superpowers/sdd/2026-08-11-optical-lab-high-fidelity-reconstruction/task-8-report.md` / `.superpowers/sdd/2026-08-11-optical-lab-high-fidelity-reconstruction-plan/task-{13,15,17,18,19}-report.md` / `.superpowers/sdd/2026-08-11-optical-lab-high-fidelity-reconstruction-plan/final-fix-report.md` | 高保真 OGL 重构计划及逐 Task/final-fix 证据：Tasks 1–16 基线；Task 17/18 失败并撤回；Task 19 独立 overlay 闭合；Task 20 增强默认 idle 且保留 pointer/recovery 合同 | Task 20 Steps 1–3 完成；release `28c7789` / rollback `b6a41da` |
| `docs/superpowers/plans/2026-08-12-optical-lab-energy-composition-iteration-plan.md` | Optical Lab 能量构图迭代：单一粒子拥有的透镜壳、弯曲全高粒子幕、径向连续性/绝对能量与稀疏右向细束门禁 | 已完成并经独立复审；本地全门禁 GREEN，待真机性能与用户视觉终验；生产 `/`/ECS 不变 |
| `docs/plans/2026-08-07-web-quality-pipeline-plan.md` | Web 品质管线实施计划（Task 8 设计系统固化 → 9 动效层 → 10 Figma+MCP → 11 全站一致性 → 12 视觉回归门禁，2026-08-07 用户拍板） | 待执行 |
| `docs/security/sandbox-threat-model.md` | 沙箱威胁模型（STRIDE + 8 类攻击向量 + 残留风险 + 缓解路线图，P1E-8） | 活文档 |
| `docs/security/sandbox-security-statement.md` | 沙箱安全承诺与免责声明（P1E-8，待法律审核） | 活文档 |
| `docs/security/production-security-checklist.md` | 生产安全检查清单（P0/P1/P2 三级，P0 为上线阻断项，P1E-8） | 活文档 |
| `docs/project-index-p1e-supplement.md` | P1E 索引补充草稿（内容已合并入本索引 2026-08-06；注意其 P1E-1/2 设计文档条目为登记错误，实际不存在） | 已合并，留存快照 |
| `docs/progress.md` | 不超过 120 行 / 16 KiB 的 CURRENT progress window；完整历史只查 Git history，不进入默认 session 输入 | **CURRENT active-memory** |
| `docs/handoff/` | 交接文档目录（阶段边界/换 agent/换电脑，必须入库） | 活文档 |
| `docs/handoff/2026-07-28-before-p1a-2-handoff.md` | P1A-2 前交接：Phase 0 Accepted、P1A-1 done、下一任务 P1A-2 | 活文档 |
| `docs/handoff/2026-07-28-p1a-2-local-done-cloud-pending-handoff.md` | P1A-2 本地完成交接：代码+本地门禁 done，集成测试待阿里云，下一任务 P1A-3 design gate | 活文档 |
| `docs/handoff/2026-07-28-p1a-3-local-done-handoff.md` | P1A-3 本地完成交接：auth/api/CLI done 待提交，集成测试待阿里云，下一任务 P1A-4 design gate | 活文档 |
| `docs/handoff/2026-07-31-p1a-2-3-4-cloud-done-handoff.md` | P1A-2/3/4 云上收口交接：集成测试 9/9 全绿、云环境/DNS/Portainer 就绪，下一任务 P1A-5 RBAC design gate | 活文档 |
| `docs/handoff/2026-08-01-p1a-5-cloud-done-handoff.md` | P1A-5 RBAC 云上收口交接：集成测试 11/11 全绿、2.5 done，下一任务 P1A-6 审计日志 design gate | 活文档（主交接） |
| `docs/handoff/2026-08-01-ops-monitoring-proxy-handoff.md` | 运维底座补充交接：SSH 隧道定案+常驻化、监控面板（/nav/ /traffic/ /monitor/）、Tailscale 卸载禁令 | 活文档 |
| `docs/handoff/2026-08-01-p1a-6-audit-observability-done-handoff.md` | P1A-6 统一错误/日志/配置/审计底座收口交接：云上集成 15/15 全绿、2.6 done，下一任务 P1A-7 design gate | 活文档 |
| `docs/handoff/2026-08-03-p1a-7-quota-credits-done-handoff.md` | P1A-7 配额/AI Credit 账务骨架收口交接：云上集成 17/17 全绿、seed 8/8、2.7 done，下一任务 P1A-8 安全基线 design gate | 活文档 |
| `docs/handoff/2026-08-03-p1a-8-security-baseline-done-handoff.md` | P1A-8 安全基线收口交接：云上集成 21/21 全绿、2.8 done，下一任务 P1A-9 CI/CD design gate | 活文档 |
| `docs/handoff/2026-08-03-p1a-9-cicd-deploy-done-handoff.md` | P1A-9 CI/CD 部署收口交接：生产栈上线、备份/恢复演练、2.9 done，Phase 1A 完成 | 活文档 |
| `docs/handoff/2026-08-03-p1b-1-sdf-schema-done-handoff.md` | P1B-1 SDF Schema 包收口交接：core/manifest JSON Schema + ajv，3.1 done，下一任务 P1B-2 数据模型 | 活文档 |
| `docs/handoff/2026-08-03-p1b-2-ro-sdf-model-done-handoff.md` | P1B-2 RO/SDF 数据模型收口交接：迁移 7 + API 骨架，云上 26/26，3.2 done，下一任务 P1B-3 Blob 上传 | 活文档 |
| `docs/handoff/2026-08-04-p1b-3-blob-artifact-done-handoff.md` | P1B-3 Blob 内容寻址存储收口交接：迁移 8 + /artifacts API，云上 35/35，3.3 done，下一任务 P1B-4 版本引擎 | 活文档 |
| `docs/handoff/2026-08-04-p1b-4-version-engine-done-handoff.md` | P1B-4 Commit/Manifest 版本引擎收口交接：迁移 9 + /commits /versions API，云上 41/41，3.4 done，下一任务 P1B-5 Diff 服务 | 活文档 |
| `docs/handoff/2026-08-04-p1b-5-diff-service-done-handoff.md` | P1B-5 多类型确定性 Diff 服务收口交接：packages/diff 九类 + comparison API，云上 45/45，3.5 done，下一任务 P1B-6 标识层 | 活文档 |
| `docs/handoff/2026-08-04-p1b-6-identity-service-done-handoff.md` | P1B-6 标识层与时间戳服务收口交接：packages/identity + 迁移 10 + /research URL，云上 50/50，3.6 done，下一任务 P1B-7 可见性 | 活文档 |
| `docs/handoff/2026-08-04-p1b-7-visibility-done-handoff.md` | P1B-7 RO 可见性模型收口交接：迁移 11 + 三态矩阵 + 扩大审批记录，云上 55/55，3.7 done，下一任务 P1B-8 编辑器 | 活文档 |
| `docs/handoff/2026-08-04-p1b-8-sdf-editor-done-handoff.md` | P1B-8 三栏 SDF 编辑器收口交接：apps/web 三栏 + 建议确认 + 版本导航，next build 通过，3.8 done，下一任务 P1B-9 移动端 | 活文档 |
| `docs/handoff/2026-08-04-p1b-9-mobile-a11y-done-handoff.md` | P1B-9 移动端分步/抽屉编辑器与可访问性收口交接：Drawer + 虚拟化 + WCAG AA，next build 通过，3.9 done，下一任务 P1B-10 导出包 | 活文档 |
| `docs/handoff/2026-08-04-p1b-10-sdf-export-done-handoff.md` | P1B-10 SDF 标准导出包收口交接：export API + 脱库校验，云上 58/58，3.10 done，下一任务 P1C-1 协作模型 | 活文档 |
| `docs/handoff/2026-08-04-p1c-1-collab-model-done-handoff.md` | P1C-1 协作域数据模型收口交接：迁移 12 + 11 实体，云上 62/62，4.1 done，下一任务 P1C-2 Branch 管理 | 活文档 |
| `docs/handoff/2026-08-04-p1c-2-branch-done-handoff.md` | P1C-2 Branch 管理收口交接：迁移 13 + /branches API，云上 63/63，4.2 done，下一任务 P1C-3 Issue/评论 | 活文档 |
| `docs/handoff/2026-08-04-p1c-3-issue-comment-done-handoff.md` | P1C-3 Issue 与评论收口交接：/issues API + 限流，云上 67/67，4.3 done，下一任务 P1C-4 许可选择 | 活文档 |
| `docs/handoff/2026-08-04-p1c-4-license-done-handoff.md` | P1C-4 三类许可收口交接：/licenses API + 继承校验，云上 71/71，4.4 done，下一任务 P1C-5 Fork | 活文档 |
| `docs/handoff/2026-08-04-p1c-5-fork-done-handoff.md` | P1C-5 Fork 收口交接：/forks API + Blob 共享，云上 74/74，4.5 done，下一任务 P1C-6 Pull Request | 活文档 |
| `docs/handoff/2026-08-04-p1c-6-pr-done-handoff.md` | P1C-6 Pull Request 收口交接：/pull-requests API + 迁移 14，云上 77/77，4.6 done，下一任务 P1C-7 作者/CRediT | 活文档 |
| `docs/handoff/2026-08-04-p1c-7-authors-done-handoff.md` | P1C-7 作者组与 CRediT 收口交接：/authors API，云上 79/79，4.7 done，下一任务 P1C-8 Review/Merge | 活文档 |
| `docs/handoff/2026-08-04-p1c-8-review-merge-done-handoff.md` | P1C-8 Review/Merge 收口交接：/reviews API + 高风险确认，云上 82/82，4.8 done，下一任务 P1C-9 通知 | 活文档 |
| `docs/handoff/2026-08-04-p1c-9-notification-done-handoff.md` | P1C-9 协作通知收口交接：/notifications API，云上 84/84，4.9 done，下一任务 P1C-10 协作前端 | 活文档 |
| `docs/handoff/2026-08-04-p1c-10-collab-frontend-done-handoff.md` | P1C-10 协作前端收口交接：collab 单页 + tab，next build 通过，4.10 done，**Phase 1C 完成**，下一任务 Phase 1D Hermes | 活文档 |
| `docs/handoff/2026-08-04-p1d-1-ai-gateway-done-handoff.md` | P1D-1 AI Gateway 收口交接：ai-gateway 包，云上 86/86，5.1 done，下一任务 P1D-2 异步任务通道 | 活文档 |
| `docs/handoff/2026-08-04-p1d-2-agent-tasks-done-handoff.md` | P1D-2 异步任务通道收口交接：迁移 15 + agent-worker，云上 88/88，5.2 done，下一任务 P1D-3 SDF Extractor | 活文档 |
| `docs/handoff/2026-08-04-p1d-3-extractor-done-handoff.md` | P1D-3 SDF Extractor 收口交接：worker handler + 编辑器通路，云上 90/90，5.3 done，下一任务 P1D-4 R0-R4 审批 | 活文档 |
| `docs/handoff/2026-08-04-p1d-4-approval-done-handoff.md` | P1D-4 R0-R4 审批收口交接：approval domain + /agent/approvals，云上 92/92，5.4 done，下一任务 P1D-5 发布审核 | 活文档 |
| `docs/handoff/2026-08-04-p1d-5-publish-review-done-handoff.md` | P1D-5 发布审核硬阻断收口交接：迁移 16 + 七类硬阻断，云上 94/94，5.5 done，下一任务 P1D-6 警告层 | 活文档 |
| `docs/handoff/2026-08-04-p1d-6-warnings-done-handoff.md` | P1D-6 警告层收口交接：review.analyze handler，云上 95/95，5.6 done，下一任务 P1D-7 申诉流程 | 活文档 |
| `docs/handoff/2026-08-04-p1d-8-publish-done-handoff.md` | P1D-8 发布事务收口交接：迁移 18 + /publications，云上 99/99，5.8 done，下一任务 P1D-9 公开页 | 活文档 |
| `docs/handoff/2026-08-06-mvp-complete-handoff.md` | MVP（Phase 0-1E）完成交接：6/6 Phase done、99/99 云上测试、P1E-8 威胁模型交付，下一步生产安全检查清单 P0 | 活文档（当前最新） |
| `docs/handoff/2026-08-06-frontend-p0-p1-sdd-handoff.md` | 前端 P0/P1 SDD 执行交接：7.1–7.3 done（2bacb65/fd46359/61d19a4），7.4–7.11 移交 GPT；含工作流/约束/遗留 minor/验收门 | 活文档（执行中） |
| `docs/CODEBASE_AUDIT.md` | Phase 0 Scholars Tea 只读审计报告（地图/模块分类/风险登记/迁移含义） | 活文档 |
| `docs/proposals/` | 方案/脑暴稿 | 含前端设计方向 v1（旧方案0723已废弃不归档） |
| `docs/proposals/2026-08-25-openscience-patent-product-introduction.md` / `.docx` | OpenScience 完整产品与技术方案介绍：RO/SDF、证据、版本、AI 审批、隔离解析、沙箱、协作发布、Hermes 与可拆分技术点；DOCX 为专利技术交底用途交付件，Markdown 为可维护源稿 | **CURRENT patent-introduction draft**；需专利代理人完成现有技术检索与权利要求撰写 |
| `docs/proposals/2026-08-06-frontend-design-direction-v1.md` | 前端整体设计方向（三方讨论稿，文末「v2 终稿决策层」D1–D9 效力最高：符号=Evolving RO 映射 SDF 六节点/纯 SVG 辉光/三套视觉+token/Live2D 一步到位/分期 P0–P4，下一步转 specs+plan） | **已定稿 v2** |
| `docs/user_ideas/竞品分析报告.docx` | 用户竞品分析（34 竞品/11 类，战略与 IA 层启发，前端设计 v1 的输入材料） | 只读原件 |
| `docs/user_ideas/OpenScience-Kimi-Handoff-v2.zip` | 用户×GPT 讨论交接 v2（HANDOFF.md + hero 参考图；已解压至 handoff-v2-extract/ 并入设计方向 v2 定稿） | 只读原件 |
| `docs/user_ideas/handoff-v2-extract/` | 上述 zip 的解压工作副本（HANDOFF.md + assets/openscience-homepage-hero-v3.png） | 工作副本 |
| `docs/user_ideas/主页原型图.png` | 首页 art-direction 参考图（1672×941，Evolving RO 六面环+暗场 hero；禁止直接作上线资产） | 只读原件 |
| `docs/user_ideas/generated_figures/` | Gemini 生成素材目录（figA/figB/figD1 等图 + `video/video1.mp4` 图生视频源；figD1 六面板 Hermes 枢纽版为用户选定方向，video1 已加工为 public/hero/ro-loop.* 上线资产） | 只读原件 |
| `docs/decisions/` | 决策记录 ADR | ADR-001 已接受；ADR-002 已建 |
| `docs/decisions/ADR-001-target-architecture.md` | 目标架构决策：选择性抽取 Scholars Tea，按 Baseline 重建平台底座 | 活文档（已接受） |
| `docs/decisions/ADR-002-agent-tooling-portability.md` | Agent 工具能力与可迁移性决策（项目内安装/密钥不入库/分阶段工具候选） | 活文档 |
| `docs/decisions/ADR-003-admin-strong-auth.md` | 管理后台强认证决策：nginx basic_auth 双层 + TOTP 列上线路障（P1A-8） | 活文档 |
| `docs/decisions/ADR-005-public-ingress-and-egress-failover.md` | 公网入站与服务器出网分离：Cloudflare Tunnel 入站、Squid/v2ray 出网及失效回退边界 | Accepted |
| `docs/decisions/ADR-006-cloudflare-tunnel-public-ingress.md` | 未备案域名公网入口改由 ECS 常驻 Cloudflare Tunnel 承载；Nginx 继续作为统一回源与安全边界 | Accepted |
| `docs/handoff/2026-08-15-cloudflare-tunnel-egress-incident-handoff.md` | Cloudflare Tunnel 502/530 事故根因、生产修复、回滚证据与后续观察项 | 当前基础设施交接 |
| `docs/specs/2026-08-16-edge-cache-asset-versioning-design.md` / `docs/plans/2026-08-16-edge-cache-asset-versioning-plan.md` / `docs/handoff/2026-08-16-edge-cache-asset-versioning-handoff.md` | Landing 大型光学资产内容寻址缓存的设计、实施与部署证据 | 已完成历史主题；release `b93fa9d`，不作为当前 Hermes 入口 |
| `docs/runbooks/deployment.md` | 部署 runbook（cloud-sync/迁移/seed/nginx/验证、Parser 隔离、Windows Git Bash 专用密钥调用与版本化资产）；§5.26–5.28 登记 Landing water recovery、WebGL fallback 与 Chrome reduced-motion 排障 | CURRENT；application/release/rollback `2934476` / `2934476` / `58614c0`，用户已确认正常 |
| `docs/runbooks/backup-restore.md` | 备份与恢复 runbook（四节骨架，Phase 1A 填充） | 骨架 |
| `docs/runbooks/incident.md` | 故障响应 runbook（四节骨架，Phase 1A 填充） | 骨架 |
| `docs/runbooks/monitoring.md` | 监控面板 runbook（Netdata + vnStat，同域 /monitor/ /traffic/ 路径，2026-08-01） | 已上线 |
| `docs/runbooks/cloudflare-tunnel.md` | Cloudflare Tunnel 公网入口、固定 Edge/HTTP2、HA watchdog、回滚与移动端验收 | 已部署并完成 2026-08-15 出口事故修复 |
| `docs/runbooks/visual-release.md` | Optical Editorial production-build 视觉/无障碍/性能发布门禁：27-case 矩阵、accepted shared surface/reduced exact/pointer focused gate、实测 route/static 预算、physical desktop/mobile cadence contract 与人工审美拒绝项；物理手机风险豁免由 Task 19 建立并明确续签至 Task 23 | 活 runbook；模拟 mobile 不冒充硬件证据，Task 23 后需重新授权 |
| `docs/superpowers/specs/2026-08-14-optical-idle-attention-design.md` | Task 21 首屏自主光流与黑色系统光标修复设计：Landing-only idle/pointer 双态、标题带人眼感知门槛、reduced-motion 边界 | 已实现并随 `8edf6fa` 部署 |
| `docs/superpowers/plans/2026-08-14-optical-idle-attention-plan.md` | Task 21 单任务 TDD 实施计划；弱 idle 与系统 cursor RED 已闭合，Landing-only presentation owner 通过完整本地/公网门禁 | 已完成；release `8edf6fa`，rollback `28c7789` |
| `docs/superpowers/specs/2026-08-14-optical-water-flow-refinement-design.md` | 唯一 CURRENT Landing water spec；Task 24 恢复系统 cursor、真实慢/快轨迹与连贯 OGL 水流，并规定 WebGL unavailable 时的单层 Canvas continuity fallback | **TASK 24 COMPLETE / DEPLOYED `2934476`** |
| `docs/superpowers/plans/2026-08-14-optical-water-flow-refinement-plan.md` | Task 22/23 历史实施；Task 24 已恢复 OGL 水流并补 WebGL-disabled Canvas fallback、无双影、滚出/滚回与跨发布回归保护 | **Step 7 COMPLETE / PUBLIC GREEN `2934476`** |

## infra/
| 路径 | 用途 | 状态 |
|---|---|---|
| `infra/README.md` | infra 目录说明（脚本清单/安全约束/迁移路径） | 活文档 |
| `infra/scripts/ssh-run.sh` | 远程命令唯一入口（BatchMode 密钥认证、危险命令黑名单需 --confirm） | 可用 |
| `infra/scripts/checkup.sh` | 只读巡检（磁盘/内存/负载/Docker/服务/TLS 证书） | 可用 |
| `infra/scripts/backup.sh` | 数据库/对象存储备份 | 骨架，Phase 1A 填充 |
| `infra/scripts/traffic-report.sh` | vnStat JSON → 流量账单静态页渲染（cron 每 5min，2026-08-01） | 已部署云上 |
| `infra/scripts/with-proxy.sh` | 代理兜底包装：隧道可用走 v2ray、失效回落直连（云上 `/usr/local/bin/with-proxy`，2026-08-01） | 已部署云上 |
| `infra/scripts/proxy-tunnel.sh` / `proxy-tunnel.vbs` | 本机侧 SSH 反向隧道常驻（Windows 计划任务 `OpenScience-ProxyTunnel` 登录自启 + 断线重连，2026-08-01） | 已启用 |
| `infra/scripts/deploy-cloudflare-tunnel.ps1` | 使用项目 Secret 幂等部署/查询/回滚 ECS 常驻 Cloudflare Tunnel；同步版本化 unit/watchdog，token 仅经 stdin 写入服务器 | 已执行验证（2026-08-15） |
| `infra/scripts/cloudflared-watchdog.sh` / `infra/scripts/cloudflared-resilience.test.mjs` | HA metrics + 公网状态 watchdog（180 秒冷却）及配置/metrics 失败回归门禁 | 4/4 GREEN，已部署（2026-08-15） |
| `infra/scripts/deploy.sh` | 部署脚本 | 骨架，Phase 1A 填充 |
| `infra/systemd/cloudflared.service` / `infra/systemd/cloudflared-watchdog.service` / `infra/systemd/cloudflared-watchdog.timer` | 固定 SJC IPv4/HTTP2 Edge 池、loopback metrics 与每分钟恢复 timer | 已部署（2026-08-15） |
| `infra/compose/` | dev/monitor/prod compose；生产栈 data/app 分段，API/Web/worker + SeaweedFS 4.41 S3；Web SSR 以 `API_ORIGIN=http://api:3001` 走 app_net 并依赖 API healthy；合同测试固化私有端口/凭据/健康依赖 | ECS 已重部署并通过 SSR live gate（2026-08-10） |
| `infra/nginx/` | 反代配置：Portainer/监控入口；OpenScience Web/API、`/__release`、Curator 与 `/api/admin/` Basic Auth；验证后清除上游 `Authorization`，Fastify 只接收 session/角色边界 | CURRENT config；release `06072c1` Nginx syntax/public routing GREEN |
| `infra/nginx/openscience.test.mjs` | 生产 Nginx 合同：`/api` rewrite、Auth 页面/API 分流、Curator/Admin API 保护、Basic credential 不转发、Tunnel 真实 IP 与部署同步 | 8/8 GREEN |
| `infra/www/` | `nav/index.html` 服务器面板导航静态页（/var/www/nav，2026-08-01） | 已部署云上 |
| `infra/sandbox/` | 沙箱配置占位（P1A-1） | 骨架 |
| `infra/migrations/` | Prisma 迁移 1–27（27 = `agent_tasks.retry_count` 单次安全重试元数据；26 = Editorial Collection/Selection），各附 rollback.sql | ECS 27/27 up to date（release `06072c1`） |
| `infra/schema.prisma` | Prisma schema（`app_meta` 基线模型，P1A-2；2026-08-06 补 `SandboxJob`/`SandboxArtifact`/`SandboxJobStatus`，对齐迁移 20/21 DDL，P1E） | 已实现 |

## .agents/skills/（项目级 Skills，Spec §20.3）
| 路径 | 用途 | 状态 |
|---|---|---|
| `.agents/skills/repo-map/SKILL.md` | 只读扫描与代码库地图（目录/依赖/服务/数据） | 活文档 |
| `.agents/skills/architecture-guard/SKILL.md` | 架构边界守卫（Monorepo 边界、AI Gateway 收口） | 活文档 |
| `.agents/skills/api-contract/SKILL.md` | API 合同规范（REST/JSON、幂等键、乐观锁、合同测试） | 活文档 |
| `.agents/skills/database-migration/SKILL.md` | 数据库迁移规范（可回滚、生产禁自动破坏性迁移） | 活文档 |
| `.agents/skills/frontend-design/SKILL.md` | 前端视觉与交互规范（三套视觉系统、响应式、WCAG、i18n） | 活文档 |
| `.agents/skills/infra-runbook/SKILL.md` | 基础设施与运维 runbook 规范（单 ECS 拓扑、备份、部署） | 活文档 |
| `.agents/skills/security-review/SKILL.md` | 安全审查清单（密钥、越权、上传、沙箱、日志脱敏） | 活文档 |
| `.agents/skills/test-gate/SKILL.md` | 测试门禁（最小相关测试→阶段验收、禁隐藏失败） | 活文档 |
| `.agents/skills/docs-sync/SKILL.md` / `scripts/docs/docs-sync-skill.test.mjs` | 文档同步与记忆卫生纪律：Git 定锚、每主题唯一 CURRENT、search-only index、120 行 progress、80 行 handoff、16 KiB active-doc 上限、历史转 Git/archive 且不进入默认读取 | CURRENT；TDD `8/8`，防旧记忆回流与重复证据膨胀 |

## 已废弃
| 路径 | 说明 |
|---|---|
| `方案0723.docx` | 早期脑暴稿，2026-07-24 被 Baseline v1.0 取代，用户确认放弃，不归档 |
