# OpenScience 进度（CURRENT window）

> 最新同步：2026-08-26 19:16 +08。历史由 Git 保存；旧计划和 archive 不作为默认输入。

## 2026-08-26 — Hermes Research Intelligence Foundation 本地实现

- Taskmaster Task 1 Foundation 已关闭：21 行能力主表与 11 行候选 owner/license/version/resource/latency/cost/data-flow/evaluation/kill-switch/rollback 矩阵受机器门禁；入口为 `audit:hermes-capabilities`。
- 新增 13 项自著权 deterministic corpus 与 schema 1 哈希/locator 清单，不使用用户文件，覆盖 native/scanned/dual-column PDF、table、formula、references、DOCX、TeX、Markdown、CSV/XLSX、notebook 与 code；清单稳定性门禁仅规范化 Git checkout 的 CRLF/LF 差异，其他内容仍须逐字一致。
- ignored current-parser report 只保存 ID/hash/status/reason/textMatched/elapsed/RSS delta；记录运行有 7 项 `ready`、6 项 expected-text matched、6 项显式复核，P50 `0.03 ms`、P95 `226.09 ms`、最大 RSS 增量 `28,672 B`。image-only PDF 因 `pdf-parse` 页分隔符出现 1 项 false-ready，已作为后续候选必须消除的基线缺陷；计时/RSS 仅为观测值。
- PR #4 Ubuntu 视觉门禁已修复：Landing `.05` 硬阈值不变并连续采样真实 RAF，Hermes 仅增加 2px 字体度量容差，零重叠/上界不变；高成本光学证据用例总预算 120s。model `18/18`、build、optical `10/10`、Hermes cold-start `10/10`、release `72/72` 通过，UI 与生产 release 未改。
- Fresh acceptance：全仓 test/typecheck/lint/build、`audit:hermes-capabilities`、`docs:lint`（223 文件、0 问题）、`audit:docs-sync`（8/8，`DOCS_SYNC_OK`）与 `git diff --check` 全绿；agent-worker `57/57`。Docling/LiteParse/GROBID/PaddleOCR/BGE-M3 均保持 `APPROVED_PILOT`；MiniMax OCR 继续 `BLOCKED`。未安装依赖、未读取 `.env`、未写服务器、未部署或改变生产 release。

## 2026-08-26 — Hermes 能力核验与 SSH 误报收口

- 用户确认 LLM OCR 作为平台自动处理能力，不再逐文档询问；仍须经 AI Gateway、最小页路由、来源标记与审计，生成结果不得冒充原始证据。
- 仅检查注入状态、不读取或输出 `.env` 值：本机 Tavily 已注入但额度耗尽，Semantic Scholar 常用变量未进入当前进程；生产 `agent-worker` 已注入 MiniMax，尚未注入 Tavily/Semantic Scholar。用户在聊天中暴露的凭据必须轮换后再配置。
- SSH key 已用同一密钥只读复验成功。历史误报由 Windows 裸 `bash` 命中 WSL 导致；2026-08-26 又确认自动化执行器的 `shell=` 抽象层也会误入 WSL，只有 PowerShell 显式 `& 'C:\Program Files\Git\bin\bash.exe'` 才是可靠入口。`AGENTS.md` 与 deployment §1.1 已锁定根因签名，禁止再误判为密钥失败；未改产品代码、未写服务器、未部署。
- Taskmaster `optical-editorial-v3` 历史 tag 为 15/15；CURRENT `hermes-research-intelligence` 为 1/12 done，下一唯一 ready 项为 Task 2 `Prisma Schema and Core Domain Models`，其余 10 项等待依赖。
- 实施保持四个可回滚阶段：Foundation 已建立能力台账机器门禁、自有 corpus 与现状 parser 基准；后续再依实测依次进入文档/OCR/搜索、兴趣/外部检索、RO/富媒体/生产验收。

## Current version tuple

- Branch / local Foundation code HEAD / deployed application / immutable release: `codex/hermes-wanko-live2d` / `c264bec` / `29344767b350e0a44ef74c04b9b5a55b342ef011` / `29344767b350e0a44ef74c04b9b5a55b342ef011`。
- Current rollback 为前一健康 release `58614c07951374537ed146f164f8568e9957a9b5`；post-deploy docs HEAD 不与应用身份混写。
- ECS release / rollback: `29344767b350e0a44ef74c04b9b5a55b342ef011` / `58614c07951374537ed146f164f8568e9957a9b5`。

## 2026-08-26 — Landing water regression root cause and implementation plan

- 用户确认 Task 24 只恢复既有 OGL 水流并封死回归；Hermes、导航、字体、accepted plates 与非 Landing 表面冻结。Git 证明最近 navigation release 未删除 OGL：`8edf6fa` 隐藏 OS cursor，`8fe2094` 又把 descendants `!important` 和错误发布门禁固化。
- 根因已闭合：线性速度使慢速 traverse `follow≈.007`，而 10s/2.2px presentation 与 aggregate-pixel gate 仍可 GREEN。Candidate `47c8aa9` 移除 `cursor:none!important`，以 `sqrt(magnitude)` 恢复慢速 wake，并把原 ambient clock 收紧为 7s；未重建 renderer、恢复 Canvas2D、改构图或 shader。
- 用户实际浏览器仍为静止图的后续根因是 WebGL/WebGL2 初始化失败时只剩 exact static plate；既有公网门禁只覆盖可用的 SwiftShader/WebGL 路径。Application/release `2934476` 保持 OGL 为唯一正常 owner，仅在 normal-motion + `contextStatus=unavailable` 时挂载已有 Canvas field，以 accepted typography plate 做单层标题水纹；系统 cursor、构图、Hermes 与导航不变，reduced-motion 仍无 canvas。RED→GREEN 覆盖 WebGL 禁用、亮字形运动、静态字版不叠加、滚出/滚回生命周期和 cursor；原尺寸桌面/390px/reduced 本地与公网截图复核，fresh shots、Web `421+5`、typecheck、全仓 lint/docs-sync/build 与 diff check GREEN。两次 `--skip-migrate` 切换用于先恢复再消除人工审图发现的双影；最终 rollback `58614c0`。Backup `436K files=7/7`、server build、27 migrations、容器/Parser isolation、release/failure/rollback evidence、公网 normal/no-WebGL/mobile/reduced 全绿；无 migration/seed/data write。
- 用户最终确认桌面静止的剩余原因是 Chrome 单独报告 `prefers-reduced-motion: reduce`，而非 Cloudflare 或新发布回归：桌面/移动响应均为 `CF-Cache-Status: DYNAMIC`、`no-store`、相同 HTML/hashed chunks；公网桌面 `no-preference` 连续帧变化而 `reduce` 精确静止。Windows 动画已开启但 DevTools/Chrome override 仍生效；恢复 Rendering `No emulation` 并重启 Chrome 后用户确认正常。未清 CF、未改代码、未重新部署；唯一操作记录见 deployment runbook §5.28。
- 新合同已进入 canonical product release：系统 cursor 与所有 descendants 可见；24×10 网格要求 650ms 内存在至少 6 格、横纵各跨 2 格的连通水流；慢/快轨迹分别验证位置、强度和 900ms 恢复，reduced-motion 仍静态无 canvas。Fresh Landing `6/6`、focused `23/23`、Web `421+5`、全仓 test/build、Web typecheck、targeted ESLint 与 diff check GREEN，桌面/移动原尺寸截图已复核。
- Broader Optical Lab capture 的既有 `evolves` 边界 `.899336 < .9` 在 10s/7s 下相同，未放宽阈值。Application/release/rollback `47c8aa9` / `73677d5` / `263c783` 已部署：pre/post checkup、backup `436K files=7/7`、服务器全量 build、27 migrations、目标容器、Parser isolation、release markers 与公网 Landing `6/6` GREEN；未 migration/seed/data write。
- 新增全站一级研究入口：Research desk / Explore / New research / Settings；公开阅读与 collection 同时保留 Home wordmark、Desk、Explore、Create、Login；RO 内继续使用 Overview/SDF/Files/Versions/Collaboration/Publish/Sandbox 二级导航。Dashboard loading/error、注册/登录、Hermes evidence review 与 curator 均不再是死路。
- 390px 原尺寸复核发现首项虽存在却裁切 `6px`，已用品牌/utility 第一行 + 四入口第二行及明确短标签修复；浏览器门禁现逐链接验证 visible 与 `scrollWidth <= clientWidth`。Application `c80f739` 的 fresh evidence：Web `420+5`、全仓 typecheck/lint/docs-sync/docs-lint/test/build、19-page build、product release `72/72` 与 `git diff --check` GREEN；新增 320px Dashboard/Auth/Public/Workspace/Review 五壳层实测。
- Immutable release `263c783` 已以 `8395b4d` 为 rollback、`--skip-migrate` 发布。pre/post checkup、backup `432K files=7/7`、服务器 19-page build、27/27 migrations、目标容器/Parser isolation、Cloudflare/loopback、精确 release/failure/rollback markers 与公开路由均通过。公网 no-write 产品矩阵可匿名部分 `69/69`，其中 Landing normal/reduced 与 320px 五壳层全绿；Admin 三视口按生产 Basic Auth 正确返回 401，本地 release gate 为 `3/3`。未 migration、seed 或写研究数据。

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

## Read first

1. `AGENTS.md`
2. `docs/handoff/2026-08-16-hermes-2d-pet-handoff.md`
3. 当前任务唯一 CURRENT spec（Hermes 为 `docs/specs/2026-08-19-hermes-wanko-live2d-design.md`）
4. 本文件
5. `docs/OpenScience_Kimi_Development_Spec.md` 相关章节
