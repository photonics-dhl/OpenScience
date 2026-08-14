# OpenScience (XGS) 进度日志

## 2026-08-14（Task 21 首屏自主光流与黑色光标）— ✅ 已部署并通过公网验收

- **用户反馈**：生产 Landing 的 no-input 动效依然肉眼不可见；用户截图中的黑色“鼠标”破坏底层粒子背景，希望首屏先由 `Science evolves.` 的自主运动抓住注意，再以 pointer 形成不同的局部反馈。
- **已确认并保留**：黑色形状是系统默认 arrow cursor，不是底图或 WebGL 黑洞。生产 computed style 为 `cursor:auto`，真实浏览器门禁按预期 RED；光学舞台改为 `cursor:none`，按钮/链接仍保留自身 cursor。Landing 门禁从 threshold-1 全场计数收紧为连续三个 `360ms` 标题带 threshold-3 感知门槛；当前线上/回退代码真实 RED 为标题带 `101 / 0 / 9` changed pixels（`628,672` total），证实 Task 20 的旧“1% threshold-1”证据不足以支持肉眼可见。
- **最终实现**：WebGL renderer/shader 保持 `28c7789` 的已验收行为；只在 Landing accepted surface 的 interaction host 上增加独立、低成本的冷白暖 `screen` 光流层，`3.4s` 横向循环。它在 no-input 时持续扫过 `Science evolves.`，local follow 出现时暂停，让 pointer-owned 局部折射成为唯一主反馈；reduced-motion 下完全隐藏。系统 arrow cursor 也只在 Landing 光学舞台内隐藏，Lab 不受影响。
- **真实门禁**：旧线上候选在连续三个 `360ms`、RGB delta `>=3` 的标题带窗口仅有 `101 / 0 / 9` changed pixels（`628,672` total），按预期 RED；最终 Landing 浏览器门禁 GREEN，并生成 desktop/mobile idle 截图供肉眼检查。完整 Lab native matrix GREEN，证明 centroid/locality/halo/recovery/touch/lifecycle 未被改写；focused `14/14`、全 Web `241/241`、typecheck、canonical lint、16-page build、27-case release matrix 与 production `next start` Landing gate 均 GREEN。
- **发布与公网验收**：独立审查 `APPROVE`（0 Critical/Important）；release `8edf6fa`，rollback `28c7789`。部署前后 checkup 均健康，备份 `BACKUP_OK size=280K files=7/7`；dry-run 后执行 `deploy.sh --confirm --skip-migrate`，没有迁移/seed。远端 16-page 全量 build 通过，Web/API/agent-worker 正常重启。公网 `/`、asset Lab、`/explore` 返回 `200`，未登录 `/auth/me` 返回 `401`；公网 desktop/mobile normal/reduced Chromium 门禁与三段 idle 感知门槛 GREEN，截图人工检查确认字形完整、光流清晰且无黑色 arrow cursor。

## 2026-08-14（Task 20 默认流动增强）— ✅ 已部署并通过公网验收

- **目标与边界**：针对用户反馈“无鼠标时默认流动太弱”，只增强 idle authored-composite；鼠标 `70ms`、follow `5px`、local/combined `10px`、gain `.18`、radius `.20/.14`、overlay alpha 与 `700ms` local zero 均保持不变。reduced-motion 继续 pixel-exact static。
- **实现**：idle displacement `2px → 4.5px`，cycle `8s → 5s`，flow vector cap 仍为 `.05`。交互期间只暂停 ambient phase，`700ms` 后扣除暂停时长从同一 phase 连续恢复；flow persistence 在 previous-local support 内仍为原 `.985`，support 外归零，消除输入时上一帧 ambient 被整屏重复叠加的旧缺陷。无新增 pass/FBO/texture/canvas/dependency。
- **TDD/调试证据**：旧版 focused 对 `4.5px/5s` 合同 RED，Landing 三个 `360ms` 窗口在旧版降到约 `0.42%`；单纯放大后 native RED 至 centroid `.14`，冻结 phase 后仍 RED 至 `.18`，最终由 binary previous-local 根因修复闭合。独立复审曾复现未锁 phase 的 layer RED（energy `13.28 < 15.42`）；固定 `.25` phase 后两轮完整 native 连续 GREEN。最新 idle `33,890` pixels、四象限 `[4,910,14,352,2,851,11,777]`；最差 centroid `.02263`、最差 locality `.98994`；layers `20.37 > 15.40 > 5.14`，touch `.99954`，halo `2/16`，恢复 PNG `788.5ms`。其间一次恢复 PNG 编码为 `992.7ms` RED（恢复像素 max delta 已为 9），如实保留为环境时序抖动，随后两轮分别 `184.6s/178.6s` exit 0。
- **本地门禁**：focused `14/14`、Web `32 files / 241 tests`、typecheck、canonical lint/workspace/docs sync、production build（`/` `804 B / 132 kB`）、Landing desktop/mobile normal/reduced/pointer/三窗口 idle、Lab full native 连续两轮、reduced exact-static、product release `27/27` 均 GREEN；桌面/移动截图人工检查无截字、硬圆环、全局闪烁或布局回归。
- **生产发布**：独立复审 APPROVE；release `28c7789`、rollback `b6a41da`。部署前后巡检通过，数据库备份 `BACKUP_OK size=280K files=7/7`；dry-run 后以 `--confirm --skip-migrate` 完成远端全仓 build 和 Web/API/worker 重启，未运行 migration/seed。公网 `/`、Lab、`/explore` 为 `200`，未登录 `/auth/me` 为 `401`；四个关键渲染文件远端 SHA-256 与本地一致。公开 Chromium 的桌面/移动 normal+reduced、三段连续 idle 和 pointer 均 GREEN，截图人工检查正常。重启前日志仅含预期 SIGTERM 与旧部署 Server Action 请求，最新 Ready 后无新运行错误；不改 schema、API、Nginx 配置内容、Compose、Secret 或 ECS 拓扑。物理手机门禁沿用本次 release 的显式豁免，模拟移动端不冒充真机。

## 2026-08-14（Task 19 独立覆盖层）— ✅ 已部署并通过公网验收

- **实现**：复用现有 RGBA8 flow texture 的 A 通道承载 phase-independent pointer carrier；原 authored composite 先以 `clear:true` 绘制，新的 ledger-owned transparent overlay 再以 `clear:false` 绘制。无新增 FBO、texture、canvas owner、依赖或服务器 GPU。最终参数为 response `70ms`、follow `5px`、local/combined cap `10px`、gain `.18`、ambient `.05`/`2px`/`8s`、纵向 `.20`/横向 `.14`、empty `.27`，local geometry/carrier 在 `700ms` 精确归零。
- **双层视觉合同**：renderer-owned readPixels 直接测量生产 framebuffer alpha，隔离 overlay mask 五位置 centroid 距离 `.00784–.01083`、locality `1.0`，满足 overlay `<=.04`；最终 authored+overlay 四相位二十样本最差为 right phase `.25` 的 `.0609174`、locality `.852831`，满足 composite `<=.08` / locality `>=.80`。真实 WebGL skip-draw mutation 跳过 `487` 次 overlay draw 后重新产生 upper/lower `.11–.12` 失败，证明 layer-order/draw 是 load-bearing。
- **保留门禁**：真实 follow A/B 为 `+5px`（`148,512` pixels），10→14 cap mutation 暴露禁止的 `+4px`（`144,857` pixels）；outer halo `2/16`；energy `21.7211` > typography `14.6018` > empty `5.60004`；touch locality `.9673`。同 RAF recovered PNG 在 `767.8ms` 完成，point-matched ambient/recovered 均 max delta `9`，follow 已在 `700ms` 归零且 ambient RAF 持续。idle 不再执行透明 overlay 全屏 draw。
- **全量证据**：focused `12/12`、Web `32 files / 239 tests`、typecheck、canonical lint/workspace/docs sync、production build（`/` `804 B / 132 kB`）、Landing desktop/mobile normal+reduced+pointer+idle、Lab reduced exact-static、product release `27/27` 全部 GREEN；最新桌面/active 截图人工检查无截字、硬圆环或布局回归。
- **生产发布**：独立复审 APPROVE（无 Critical/Important）；release `b6a41da`、rollback `cd5be36`。部署前/后巡检通过，数据库备份 `BACKUP_OK size=280K files=7/7`，dry-run 后以 `--confirm --skip-migrate` 完成全仓 build 和应用服务重启；未执行 migration/seed，未改 schema、Nginx、Compose、Secret 或 ECS 拓扑。公网 `/`、Lab、`/explore` 为 `200`，未登录 `/auth/me` 为 `401`；桌面/移动 normal+reduced 均无浏览器错误/溢出，normal idle 四象限有真实像素变化且指针响应有效，reduced 无 interaction canvas。远端 overlay SHA-256 与 release 一致，关键日志匹配 `0`。物理手机性能门禁按用户一次性豁免保留为已知风险，模拟移动端不冒充真机结果。

## 2026-08-14（最终动效调优与手机门禁豁免）— ⛔ Task 18 单纹理架构阻塞，未部署

- **架构决策**：用户选择继续增强版并批准单纹理双通道方案。flow RG/B 保留速度与几何记忆，A 新增独立的 pointer-centred 可见载体；composite 将折射与零均值方向性水纹分开，避免中央字形/能量把边缘响应 centroid 拉向内侧。局部通道改为 `700ms` 精确视觉归零，同 RAF PNG 仍须在 `900ms` 前完成；不增加 texture、pass、package 或服务器 GPU 依赖。
- **Task 18 真实结论**：focused RED 精确暴露旧 `900ms`、常量 A 与尾部阈值，最小双通道实现后 focused `12/12` 和 typecheck GREEN；carrier-only 五位置自身 centroid 距离约 `.002–.034`、locality `.999–1.0`，证明载体几何居中。但一旦与 authored displacement 合成，同一 RGB 输出仍发生内外侧像素相消，完整矩阵多次 RED，最差 centroid `.12785`。统一 carrier 幅度和近零亮度色散轴两项单变量修复均未闭合门禁。
- **清理与边界**：所有未验收的 A-channel 产品实现、carrier mutation/diagnostic 和色散 probe 已撤回；focused 恢复到 Task 17 工作树的 `11/11`，端口 3174–3179 均释放。按三次失败停止规则，不继续叠加 shader 参数。
- **扩展授权**：用户确认新增独立透明 overlay pass。它复用同一 flow texture/canvas，只新增一个 ledger-owned program/draw；authored composite 先画折射，overlay 以 `clear:false` 最后绘制 pointer-centred warm/cool 水纹，alpha 上限 `.16`。不新增 FBO、texture、package、owner 或服务器 GPU 依赖。
- **最终参数**：用户选择平衡增强：response `70ms`、ambient displacement `2px`、ambient flow `.05`、local displacement `10px`、patch follow `5px`、gain `.18`、ambient cycle `8s`；radius 保持纵向 `.20` / 横向 `.14`，empty carrier `.27`。
- **静止态目标**：无输入时四象限持续可见但低幅的流体运动；不得出现全局亮度脉冲、标题/镜头漂移、缩放或圆形 halo。交互后局部通道在 `700ms` 精确视觉归零，同 RAF PNG 在 `900ms` 前完成，环境流继续。
- **发布授权与风险接受**：用户明确选择“豁免物理手机门禁并部署”。本次会保留模拟移动端/真实 RTX 桌面证据，但不会把它们写成物理手机结果；该豁免作为已知移动 GPU 性能风险进入 release/rollback 记录。
- **部署条件**：Task 17 全门禁和独立复审无 Critical/Important 后，执行已确认的 checkup、备份、`--skip-migrate` 部署和公网回归；不改 schema、seed、Nginx、Compose、Secret 或 ECS 拓扑。
- **当前阻塞证据**：批准参数的原始 Task 16 wake 在真实四相位矩阵中仍出现右侧 centroid `.07028 > .065`；最终单变量 `1.15` support 假设又在同 RAF 恢复证据处得到 `961.8ms > 900ms`（`1,382` pixels、max delta `79`）。按系统化调试停止规则，不再叠加第 4 个补丁；该假设和失败的相位解耦均已撤回，Task 17 未提交、未部署。
- **下一步**：按 Task 19 对 overlay 进行真实 draw/carrier-disable mutation RED，最小实现后重跑完整 native/release 门禁。手机门禁豁免仍有效，但不豁免本地失败门禁。

## 2026-08-14（Optical 最终整体验收修复）— ⚠️ 仅物理移动端仍阻断部署

- **真实像素链路**：`patchFollowPx4` 已从诊断值接入 renderer uniform 与
  composite shader；贡献只在 `localAmount * layerWeight` 内沿 signed-x 生效，
  与 local refraction 的合成向量仍严格 `<=8 CSS px`，不移动全局标题、camera
  或 shared surface。严格 TDD 先由缺少 uniform/source contract 产生 RED，随后
  focused `10/10` GREEN。
- **原生抗突变证据**：同一手势分别运行 production shader 与只禁用 follow
  项的单点 mutation，诊断值在两边都保留；新鲜 A/B 产生 `131,800` 个真实
  像素差，image-space registration 唯一最佳位移为 `+4px`。生产快照为
  `patchFollowPx=3.9385276665`、`refractionPx.x=7.8770553331`。另一个
  full-flow A/B 只把 composite cap 从 `8px` mutation 为 `12px`，产生
  `78,488` 个像素差且恰好多出 `+4px`，证明真实 cap branch 已被执行；完整原生
  locality/layers/caps/recovery/failure/context/visibility/offscreen/
  delayed-init/unmount/route-transfer 继续 GREEN，halo `1/16`。
- **架构与预算**：ADR-009 已正式接受 production `ogl@1.0.11` 例外、唯一
  `AcceptedOpticalSurface`、WebGL2→exact-static/reduced/failure 策略、可见
  ambient RAF 与隐藏/离屏/失败/卸载 suspension、client-only/ECS 边界、精确
  release/rollback ref；旧 Canvas-only/Lab-only/no-Lab-chunk 条款退役。新鲜
  build 首页为 `805 B / 132 kB First Load JS`；`/page` client JS/CSS
  `461,103 B raw / 135,268 B gzip`，route-exclusive `119,866 / 35,935 B`；
  两个 runtime optical plates 合计 `2,485,771 B raw / 2,465,418 B gzip`。
- **物理桌面**：安装版 Chrome `150.0.7871.187` 的 unmasked WebGL2 renderer
  为 D3D11 `NVIDIA GeForce RTX 4060`，非 SwiftShader/software，DPR 约 `1`。
  自动化位于实际 `~32.05Hz` RDP display cadence，不冒充 60Hz console：rest
  与 continuous-pointer 各 15 秒均 `480` frames、median `31.2ms`、p95
  `31.9ms`、dropped `0`、fixed-full quality/`96x54` flow。
- **完整门禁**：focused `10/10`、Web `32 files / 237 tests`、typecheck、build、
  Landing desktop/mobile normal/reduced/pointer、Lab full native 与 reduced exact
  static `952,176 B`、product release `27/27` 均 GREEN。release 首次在用例前
  因前序 dev gate 替换 production `.next` 而拒绝启动；按正确顺序重新 build
  后原样矩阵全过，不是产品断言失败。
- **唯一 blocker**：本机无 ADB，Windows 只读 portable/USB 探测未发现已连接
  物理移动端；emulation 不能替代。物理移动端两段 15 秒尚未测量，因此仍是
  唯一 deployment blocker。桌面在实际 cadence 下健康且无移动端证据，故未
  添加无依据的 adaptive/DPR downshift。未执行 cloud/SSH/`.env`/backup/deploy。

## 2026-08-14（Accepted Optical Surface 本地晋升）— ✅ 本地 release candidate，未部署

- **共享实现**：新增 `AcceptedOpticalSurface`，由 Landing Hero 与精确
  `/_visual/optical-lab?candidate=asset` 共用同一 accepted plate、唯一语义
  `h1`、`AssetInteractionMount` 与隐藏诊断。生产 `/` 仍保留
  `PublicShell`、SiteHeader 导航、Explore/Create CTA、Open RO 过渡和
  Latest Research；旧 `OpticalHeadline` 留档但已退出 Landing runtime。
- **TDD 与浏览器证据**：SSR/浏览器 RED 先证实 Landing 没有 shared surface；
  GREEN 后 focused Landing/Lab `45/45`、Web 全量 `32 files / 236 tests`、
  typecheck、production build、canonical root lint、27/27 production release
  matrix 全部 exit 0。Landing 原生 desktop/mobile normal/reduced、pointer、
  focus、overflow、one-main/one-h1 通过；desktop reduced frame 与接受 fixture
  byte-for-byte 相同。
- **Lab 回归**：完整 native pointer/touch/five-position/lifecycle/failure matrix
  exit 0；Lab → Landing SPA 迁移会销毁旧 Lab canvas/resources/listeners，并只
  保留一个新的 Landing canvas owner。reduced-motion 1672×941 capture 为
  `952,176 B`，与接受 fixture byte-for-byte 相同；桌面与移动截图人工检查无
  裁切、诊断泄漏、焦点残留或导航/CTA 回归。
- **发布边界**：本轮只形成独立复审就绪的本地 release candidate；尚未执行
  dry-run、ECS checkup、数据库备份、rollback ref 记录、云端同步或部署。
  无 schema/API/seed/Nginx/Compose/topology/Secret 变更。所有任务自有端口已
  释放，既有 3000 listener 未触碰；下一步必须先完成独立审查，再在明确的
  deployment turn 中按 runbook 执行生产 preflight。

## 2026-08-13（全画面动效增强与生产发布）— ⏳ 用户确认组合方案，待执行 Tasks 14–15

- **确认选择**：用户要求同时采用“强度约两倍”和“扩大作用范围”，并授权验证通过后部署。设计固定为 ambient `1.4px`、local `8px`、follow `4px`、gain `.14`、radius `.20`；保留方向性不规则尾流、900ms 恢复、无圆形 halo、静态构图和分层顺序。
- **发布结构**：先完成候选面的 RED/GREEN 与原生空间门禁，再抽取唯一共享 `AcceptedOpticalSurface` 供 Lab 与生产 Landing Hero 共用；生产保留 PublicShell、导航与 Latest Research，不维护第二套视觉实现。
- **部署边界**：用户已授权生产发布；部署为纯 Web/源码变更，必须走 `infra/scripts/deploy.sh --confirm --skip-migrate`，执行前巡检与数据库备份，记录 release/rollback ref；不改 schema、seed、Nginx、ECS 拓扑或 Secret。

## 2026-08-13（恢复证据有效性复修）— ✅ 同 RAF 真实像素与诚实 900ms 门禁 GREEN

- **旧证据 RED**：复审发现 `preserveDrawingBuffer:false` 时在 RAF 外
  `drawImage(WebGL canvas)` 得到全透明 PNG；严格非零断言记录 ambient
  start/end 的 alpha/RGB 均为 `0/0`，因此此前 `762.3ms` compositor-copy
  结论明确作废。
- **实现 GREEN**：renderer 在同一 RAF 的 `renderer.render` 后立即
  `gl.readPixels`，翻转真实 WebGL frame、完成 PNG 编码后才记录时间；
  `preserveDrawingBuffer` 仍为 false，capture bridge 受 generation/lifecycle
  所有权约束。最终完整外部矩阵在 production preview 3066 listener PID
  `20136` exit 0：ambient alpha/RGB 为 `1571552/1568210`，时变像素
  `122`；active 为 `1571677/1569839`；recovered 为
  `1571650/1568338`，完成于 `850.1ms`，局部差异 `33/max9`，900ms CPU
  follow 精确为 0 且 ambient RAF 继续。
- **空间稳定性复修**：最终复验先捕获 upper centroid 距离 `.0418` RED；
  保持各向异性 wake，backtrace `.012 -> .009` 并向速度反向重心校正
  `.04 * radius`。新鲜 GREEN upper `(.53217,.31360)`、距离 `.0349`、
  locality `.992657`；halo `2/16`，层级仍为
  `11.816 > 8.002 > 3.133`。
- **回归与边界**：五位置 centroid/locality、halo 形状、
  `energy > typography >= empty*1.25`、touch、caps、failure/lifecycle 均未
  弱化；focused `35/35`、web typecheck、reduced-motion exact-static capture、
  production build exit 0。build 后 3066 production preview listener PID
  `20136`，`/`/asset 均 HTTP 200、asset-only marker true、panel count 1。
  端口 3000 PID `33620` 未改变；未 commit/deploy/ECS/`.env`/生产 `/`。

## 2026-08-13（全画面流体最终复审修复）— ✅ 3 Important + 1 Minor 已关闭

- **可见圆盘 RED/GREEN**：独立复审确认旧 radial flow + 高频 grain 会在
  cursor 周围形成 ribbed circular halo。新增 native 图像形状门禁，在空白
  literal patch 的半径 35–78% 环带按 16 个角扇区统计连续 rim；旧实现
  mutation 为 `16/16`、coverage `1.0`，明确 RED。新实现改为沿 signed
  velocity 的 `1.12 × 0.54` 各向异性 irregular wake 与低频非线性 liquid
  texture，最终为 `3/16`、coverage `.1875`，画面不再出现闭合圆盘/硬边界。
- **恢复时间诚实化**：旧 `827.7ms` 是 screenshot 请求前时间，复审判定
  无效；改为浏览器侧真实 WebGL compositor canvas PNG，并在编码完成后
  记录 `performance.now()`。旧 native screenshot 完成于 `1209.8ms` RED；
  最终 evidence 于 `762.3ms` 完成，local `count=0/max=0`，900ms CPU
  follow 精确归零且 ambient 继续。
- **层间裕量**：门禁从严格排序提高为
  `energy > typography >= empty * 1.25`。旧运行曾出现
  `15.423 > 6.193 < 6.646` RED；最终为
  `14.258 > 7.928 > 3.501`，type/empty=`2.26`。empty lift 理论最大由
  `5.5%` 降为 `2.64%`，仍有可感知像素但不压过字形。
- **空间与工程 GREEN**：同一 owned 3114 server 完整外部矩阵 exit 0，
  五点 locality 最低 `.998551`、centroid 全部 `<.04`、四象限 ambient 与
  touch 继续通过。focused Vitest `35/35`、web typecheck、reduced-motion
  exact static capture、production build 全部 exit 0；build 首页仍
  `3.87 kB / 112 kB`。
- **文档纠偏**：`project_index.md` 当前 AssetInteraction 行已改为
  full-stage ambient / real x-y `.14` / layered / 900ms；current gate 行已改为
  five-position stable-server + halo rejection；旧 650ms 仅保留在明确标为
  HISTORICAL non-asset Task 7 的行。禁止后续 session 再按 fixed `.58`
  central patch/650ms 执行。
- **边界**：未 commit/deploy/ECS/`.env`/生产 `/`；端口 3000 PID `33620`
  未改变。最终 docs lint 为 `182 files / 0 issues`，docs sync 为
  `DOCS_SYNC_OK`；build 后 production preview 以 PID `95964` 留在 3066，
  `/` 与 asset 均 HTTP 200、asset-only 为真、panel count 为 1。

## 2026-08-13（全画面分层流体 Task 13）— ✅ 工程门禁 GREEN，待用户动态视觉验收

- **稳定外部服务器五连**：门禁新增
  `OPTICAL_LAB_ASSET_INTERACTION_BASE_URL`，外部模式先验证精确
  asset-only 路由和单 panel，且从不 spawn/kill Next。任务自有
  `127.0.0.1:3113` parent PID `53936` / listener PID `80740`；最终五轮
  完整矩阵分别用时 `49.1/50.7/48.7/51.2/51.3s`、全部 exit 0，listener
  PID 每轮前后均未改变，随后已按所有权验证释放 3113。
- **空间/分层/恢复证据**：最终轮 left/centre/right/upper/lower centroid
  均距输入小于 `.04`，locality 最低 `.998889`（要求 `.75`）；空白/字形/
  能量 literal patch 平均幅度为 `6.712/7.787/15.770`，满足
  `energy > typography > empty`；四个 ambient quadrant 均非零，touch
  locality `.999951`。恢复帧于注入后 `827.7ms` 已为 `count=0/max=2`，
  并在 `900ms` 单独证明 follow 精确归零、ambient RAF 继续。
- **真实缺陷与最小调节**：upper 空白区最初被邻近 authored 粒子幕拉偏；
  RED centroid 从 `(.52446,.36390)` 经第一轮仍为
  `(.51400,.34294)`。最终只把空白层改成连续软 liquid lift，仍保持
  `emptyWeight=.22`、理论最大亮度提升 `5.5% < 8%`，未改变静态 plates、
  字形、能量构图、`.14` 半径或位移上限。
- **顺序工程门禁**：reduced-motion 外部 capture 在零 canvas/RAF 下与
  accepted 1672×941 fixture 逐字节相同；focused Vitest `35/35`、web
  typecheck、production web build 均 exit 0，build 首页仍
  `3.87 kB / 112 kB`；docs lint 为 `182 files / 0 issues`，docs sync 为
  `DOCS_SYNC_OK`。旧 3066 preview 在 build 前按相关 worktree PID 精确
  停止；build 后 production preview 以 PID `61128` 运行在 3066，`/` 与
  asset 路由均 HTTP 200、asset-only marker 为真、panel count 为 1。
  端口 3000 PID `33620` 始终未改变。
- **边界**：生产 `/`、ECS、`.env`、commit/deploy 均未修改或执行；静态
  构图仍为用户已验收资产。自动门禁不等于动态视觉批准，下一步只等待
  用户在 3066 预览做 motion review。

## 2026-08-13（全画面分层流体方向）— ✅ 书面规格确认，Tasks 11–13 计划完成

- **用户纠正**：固定 58% seam 的小范围反馈不自然；目标改为参考 Moonshot 首屏的“介质本身持续流动，鼠标到哪里哪里反馈”，而不是放大中央 patch。
- **运行态观察**：Moonshot 首屏存在横贯画面的持续 canvas 光学介质，光标在左/中/右移动时局部扰动中心随 x/y 移动；不照搬其 Moonshot 字样、发光球或自定义 cursor。参考文本已按 `read` 流程保存至本机 Downloads。
- **选择与书面设计**：用户在视觉伴随页选择 C“全画面分层响应”。现有唯一高保真 spec 新增 “Full-Surface Layered Fluid Interaction”：保留已验收静态字形/能量/16:9 构图，全画面低幅环境流，指针处 12–16% 宽度局部扰动，空白区弱、字形中、能量区强，700–900ms 单调衰减；reduced-motion/失败态精确静止。
- **实施计划**：现有唯一高保真计划追加 Tasks 11–13：先以 TDD 建立 pointer x/y、900ms 衰减、visibility/intersection suspension 与 diagnostic-global cleanup；再实现全画面 OGL ambient/local layered composite；最后用同一稳定外部 3066 server 做五位置空间门禁和五连验证，避免旧 Next 每轮重启污染。
- **边界**：新节明确取代上一修订的固定中心空间约束与无 resting animation 约束；单候选呈现、静态构图和生产隔离仍有效。尚未执行 Tasks 11–13 或修改交互代码，未 commit、未替换生产 `/`、未部署。

## 2026-08-13（Mounted follow timing-flake override）— ⛔ 五连 native 证据被 gate server cleanup 基础设施阻塞

- **唯一代码范围**：只改 `optical-lab-asset-interaction-gate.mjs`。固定 `setTimeout(120)` 后读取最后 RAF snapshot 改为对真实 mounted global 进行 `polling:'raf'` 的有界 condition wait：follow `≥.5`，strict timeout `500ms`，失败带 latest snapshot。18px/24ms event timestamps、180ms wall-clock separation、caps、中央像素、recovery 与所有 lifecycle assertions 原样保留；gate 未调用纯 mapping helper，旧 `.1` sensitivity 理论目标上限 `.075` 仍必然失败。
- **修复后 native 事实**：follow-threshold assertion 未再失败；独立 runs 在 3067、3068、3071、3072、3073 均 exit 0。但快速重启批次为 `0,1,0,1,0`（dev reload 后 global undefined、Next startup 500），另有 3069 `Array buffer allocation failed`、3070 既有 unmount `canvasRemove 0 !== 1`。
- **停止条件已触发**：fresh-port streak 达 3071/3072/3073 三连 exit 0 后，3074 在 120s ceiling 后仍遗留已不监听的 owned `next dev -p 3074`，重复 3065 的 process-exit hang；按用户规则停止。所有本轮 owned orphan 均精确验证 PID/command 后停止，未触碰端口 3000 或旧 3066 server。不得声称五连 stable native GREEN。
- **其余门禁**：focused `35/35` 与 web typecheck exit 0。两个 promotion minors（durable responsive assertions、SPA unmount diagnostic-global cleanup）仍延期且本轮未实现。

## 2026-08-13（Tasks 9/10 fresh verification）— ⚠️ 浏览器门禁存在 RAF 时序抖动

- **新鲜复验推翻稳定 GREEN 结论**：控制会话重跑 native interaction gate 时，确定性 18px/24ms mounted gesture 首次只发布 `follow=.3845`；随后四次复现为失败 `.4135`、失败 `.4583`、通过、通过，约一半运行未在固定 120ms 读取点达到 `.5`。focused Vitest 仍为 `35/35`，web typecheck 仍 exit 0，实际 3066 asset-only 页面 HTTP 200 / 单 panel 正常。
- **根因已定位、尚未修复**：输入样本时间戳与 `.75` 映射正确；门禁用固定 `setTimeout(120)` 后立即读取“上一个 RAF 已发布 snapshot”，错误假设浏览器定时器到点前必有足够 RAF 帧。正确方向是 bounded condition wait 等待 mounted snapshot `follow >= .5`，同时保留超时失败；旧 `.1` 映射最高仅 `.075`，不会被该等待放过。
- **当前状态**：不得把 native gate 或动态交互称为稳定 GREEN。SDD 最终修复波次已用完，需用户明确授权一个额外、仅限门禁时序稳定性的修复波次；此前记录的两个 production-promotion minors 仍延期。

## 2026-08-13（Tasks 9/10 final review fix wave）— ✅ 本地工程 GREEN，动态视觉验收 pending

- **浏览器证据缺口已关闭**：原 native gate 的 Playwright 18px move 只证明可见活动与上限，不能证明 24ms 映射；新增真实 mounted PointerEvent 路径，两个 sample 精确相隔 18 CSS px / 24ms，同时故意隔开 180ms wall clock。RED 如预期发布 follow `.071092 < .5`，证明组件忽略 event timestamp；最小修复改为 `event.timeStamp` 计算 sample delta，同时继续用 `performance.now()` 驱动 120/650ms renderer clock。
- **GREEN 与不变边界**：修复后 native interaction gate exit 0；确定性路径在 120ms response point 发布 follow `≥.5`，仍守住 `.58` aperture、follow `≤2px`、refraction `≤4px`、caustic `≤.08`，且只有中央 seam pixels 可变。原 native baseline、pointer/touch、reduced motion、init/runtime failure、context loss、SPA unmount、650ms exact-rest assertions 未删除或弱化。focused `35/35` 与 web typecheck 均 exit 0。
- **文档事实修正**：`project_index.md` 现标记 “Accepted Asset Interaction Amendment” 与 “Asset Presentation and Perceptibility Iteration” 均已实现；唯一 current handoff 同时引用两节。task-10 report 区分初始 unit proof 与本轮 mounted-browser proof。
- **延期 minor（生产 promotion 前必须关闭，本轮不实现）**：一是把 normalization 之前的 desktop/mobile 实际布局检查固化为 durable browser assertions；二是 SPA unmount 后清除 diagnostic global。现有 GL resource / RAF / listener cleanup 已正确，这两项不阻断隔离 Lab 动态视觉验收，但阻断 commit/production promotion。

## 2026-08-13（Asset 单一可部署候选面）— ✅ 本地工程 GREEN，待用户动态视觉验收

- **唯一候选面**：精确 `/_visual/optical-lab?candidate=asset` 现在只输出一个 `data-optical-lab-panel="candidate"`、一个语义 `h1` 与一个右上退出链接；target/current figures、comparison captions 和 `current-production.png` 不再进入该路由 SSR。默认、未知及重复 candidate 继续保留原三栏比较面。
- **布局与可访问性**：asset-only grid 居中单一 16:9 stage，最大宽度 `1672px`，plates 使用 `object-fit: contain`；桌面 1672×941 与移动 390×844 的浏览器检查均为零横向溢出、零裁切，退出链接 `:focus-visible` 为 2px 高对比 outline。diagnostics 只在 asset mode 视觉隐藏，DOM/data contract、交互 ownership 与既有 envelope limits 均保留。
- **TDD 证据**：合同先在 `optical-lab-contract.test.tsx` 加入六个 literal asset-route assertions；RED 为 `1 failed / 25 passed`，明确收到 3 panels 而预期 1。最小实现后 focused GREEN 为 `26/26`；最终 focused contract + interaction model 为 `2 files / 35 tests`，其中 `18px / 24ms → .5625`、follow/refraction/caustic caps 与 650ms exact inactive recovery 均继续通过。
- **浏览器门禁**：`node test/visual/optical-lab-asset-interaction-gate.mjs` 与 `node test/visual/capture-optical-lab-asset.mjs` 均 exit 0；原生 gate 的 1672×941 rest 与 accepted fixture 逐像素相同，活动帧仅改中央 seam patch，recovered 与 rest byte-identical，reduced-motion/runtime failure/context loss/SPA unmount cleanup 均保持通过。端口 3065、3063 与临时响应式检查端口 3066 均已释放。
- **最终顺序门禁**：`npx pnpm@9.15.0 --filter @openscience/web test -- optical-lab-contract.test.tsx optical-lab-asset-interaction.test.ts`（35/35）、web typecheck、production web build（`/` 仍 `3.87 kB / 112 kB`）、`docs:lint`、`audit:docs-sync` 全部 exit 0。未提交、未替换生产 `/`、未部署 ECS；下一步仍只等待用户动态视觉验收。

## 2026-08-13（Asset 中央混合光流实现）— ⏳ 工程 GREEN，等待用户动态视觉验收

- **范围与实现**：只为精确 `/_visual/optical-lab?candidate=asset` 新增独立 `AssetInteractionMount`、纯响应包络、OGL `AssetInteractionRenderer`、固定 `.58` seam 的 96×54 ping-pong flow pass 与羽化 replacement composite；旧 procedural renderer、已验收静止 plates、生产 `/`、后端和 ECS 均未改变，也未新增依赖。
- **TDD 与边界**：纯模型先记录 `5/5` 预期 RED，再达到 `5/5` GREEN；asset mount/shader/renderer 合同先记录 `4` 个预期失败，再与既有 contract 合并达到 `34/34`。响应保持 follow `≤2px`、局部折射 `≤4px`、caustic gain `≤.08`、约 120ms 单调接近、650ms 精确归零并停止 RAF；鼠标与 touch 使用同一速度归一化，reduced-motion 不创建 canvas/context。
- **浏览器根因修复与独立 review**：首轮真实 gate 暴露 GLSL ES 3.0 保留字 `patch` 导致 composite shader 链接失败；改为 `patchMask`。独立 review 随后发现并关闭 4 项 Important：负 x 反向传播改为只沿 positive-x 场弯曲；runtime GL failure 现在停止 RAF、释放 ledger/flow 并移除 canvas；browser gate 增加 WebGL2 初始化失败、runtime `INVALID_OPERATION`、context loss、React SPA unmount 的 canvas/listener/create-delete exact cleanup；主门禁改为真正 1672×941 stage-only，并与 `fixtures/optical-lab-asset-accepted-1672x941.png` 逐像素比较。
- **新鲜证据**：Web Vitest `32 files / 237 tests`、Web typecheck、`optical-lab-asset-interaction-gate.mjs`、原静态 `capture-optical-lab-asset.mjs`、production build、`git diff --check` 全部 exit 0；build 中 `/` 仍为 `3.87 kB / 112 kB`。浏览器证据位于已忽略的 `apps/web/test/visual/out/optical-lab/asset-interaction/`。
- **当前唯一下一步**：用户原尺寸查看实际运动后选择接受或给出动态微调意见。自动门禁通过不等于视觉批准；未获单独授权不得替换生产 `/`、不得部署 ECS、不得提交。

## 2026-08-13（Session 边界交接）— ⏳ 下一任务唯一锁定为中央混合光流

- **唯一 current handoff**：`docs/handoff/2026-08-13-optical-lab-asset-interaction-handoff.md`。下个 session 必须从该文件继续；旧 `2026-08-11-optical-lab-task8-steps3-5-handoff.md` 已降级为历史证据。
- **禁止任务漂移**：不得回到早期蓝色六面对象、被否决的 procedural 射线扇面/Candidate B、透明资产重新生成或静止字形重做。真实 source of truth 仍是 `apps/web/public/optical-lab/target-reference.png`；静止资产候选已经用户视觉验收。
- **下个 session 唯一工作**：为 `/_visual/optical-lab?candidate=asset` 编写交互实施计划并以 TDD 实现独立 `AssetInteractionRenderer`；全 Hero 输入、中央 58% seam 响应、桌面/触屏同构、reduced-motion 静止、650ms 精确复位。先隔离 Lab 动态验收，不改生产 `/`、不部署 ECS。
- **工作树纪律**：当前 branch/worktree 为 `codex/optical-editorial-v3` / `E:/Miscellaneous/XGS/.worktrees/optical-editorial-v3`，存在有意未提交修改及 `tmp/` 证据；下个 session 不得 reset、清理或删除，也不得读取 `.env`。

## 2026-08-13（混合光流架构确认）— ✅ 用户决策闭合，待计划与实施

- **用户选择**：混合光流、全 Hero 输入但仅中央响应、桌面/触屏同构；`prefers-reduced-motion` 保持验收静止帧。
- **架构**：现有高保真设计新增 Asset Interaction Amendment：独立轻量 OGL 覆盖层，静止时完全透明，活动时只替换羽化中央 patch；复用已固定 OGL 与 96×54 flowmap，不修改旧 procedural renderer、不引入依赖。
- **硬边界**：局部折射 `≤4px`、patch 内 apparent follow `≤2px`、焦散增益 `≤8%`、约 120ms 单调响应、650ms 精确归零并停止 RAF；58% 孔径、已验收静止字形/光效和中央外标题均不漂移。
- **下一门禁**：用户已确认架构和全部行为选项，并要求下个 session 执行未完成任务。下一步直接基于 `docs/specs/2026-08-11-optical-lab-high-fidelity-design.md` amendment 编写实施计划并以 TDD 实现；交互动态仍需单独用户视觉验收。尚未写交互代码、未改生产 `/`、未部署 ECS。

## 2026-08-13（资产候选视觉验收）— ✅ 用户确认；交互设计待锁定

- **视觉结论**：用户明确确认当前原尺寸候选视觉正确并允许验收；`Science`、`evolves` 与中心光效的固定静止构图不再开放漂移。
- **新增需求**：实际验收产品需要中央区域随鼠标产生动态交互。现有高保真 spec 已定义受限方向：指针写入低分辨率速度场，整行跟随 1–2 CSS px、局部折射不超过 4 CSS px、焦散增益不超过 8%、120ms 单调跟随、650ms 精确复位，且 58% 孔径不漂移。
- **当前状态**：尚未选择资产候选采用轻量 2D 位移/遮罩还是恢复 WebGL flowmap；在用户确认交互强度与范围前不实现，不得以动态效果改写已验收静止帧。生产 `/` 与 ECS 仍未修改或部署。

## 2026-08-13（字形—光效耦合纠偏）— ⏳ 工程 GREEN，待用户视觉验收

- **否定旧结论**：上一轮以 `overflow:hidden` 消除重影的修复错误地截断了 `Science` 末尾 `e`，不能视为完成；用户指出的 `evolves` 字形/字效偏差同样成立。
- **根因与结构修正**：旧实现把不透明 DOM 字和能量板分层叠放，无法产生目标中的粒子溶解、首字母折射与色散。资产候选现改为三层：全高透明能量板、带羽化边界的目标中央字效板、透明但保持可选择的唯一语义 `h1`；旧 `1.6px` DOM 黑描边也已归零，避免透明字残留轮廓。
- **原尺寸证据**：1672×941 native capture 与 `target-reference.png` 在标题带 `(0,320)–(1672,565)`、headline core 及首个 `e`/光缝区域的 RGB mean absolute error 均为 `0`、max=`0`；`Science` 完整字形、`evolves` 字形及中心融合逐像素一致。
- **诚实边界**：这是隔离固定宽高视觉验收原型，仍只在 `/_visual/optical-lab?candidate=asset`；生产 `/`、ECS 和响应式上线实现未改变。工程门禁通过不等于用户视觉批准，下一步只等待用户查看原尺寸结果。

## 2026-08-13（资产候选孔径重影修复）— ✅ 原尺寸截图 GREEN

- **根因**：透明能量资产经黑底复合确认不含文字；重影来自 Archivo `Science` 实际 ink 越过固定 58% 容器，而 Bodoni `evolves` 同时从 58% 起绘，孔径处两套字形叠印。
- **最小修复**：仅在 `data-asset-candidate=true` 下裁切 `.science` 的横向越界 ink，保留能量资产、排版容器、唯一可选择语义标题及默认 GPU/production 路径不变。
- **回归门禁**：browser gate 先以 computed `overflow-x: visible` 正确 RED，再在修复后 GREEN；门禁同时确认原始 ink 确实越过 seam，避免无效断言。原尺寸截图为已忽略的 `apps/web/test/visual/out/optical-lab/asset-candidate-1672x941.png`。

## 2026-08-13（透明能量资产候选接入）— ✅ 隔离 Lab 验证通过

- **用户确认与接入边界**：用户确认黑底发光分解候选后，将 `energy-plate-black-alpha-v1.png` 提升为 1672×941 RGBA 公共实验资产；仅 `/_visual/optical-lab?candidate=asset` 启用，生产 `/`、ECS、后端与既有默认 GPU 候选均未改变。
- **渲染合同**：资产模式只渲染 decorative 透明图与唯一可选择语义 `Science evolves.` 标题，不挂载 `OpticalLabClientMount`、canvas 或 GPU runtime；默认/未知/重复 candidate 仍走原 `static-fallback`。机器诊断为 `asset-static`，可见诊断为 `Asset/static`，默认 `DOM/static` 文案保持不变。
- **质量收口**：独立复审提出的 diagnostics 一致性、截图进程所有权/清理和否定 query 契约已以 RED/GREEN 修复；最终复审无 Critical/Important。截图脚本会拒绝既有 3063 listener、检测服务提前退出、关闭 browser/page，并在清理后验证端口释放。
- **最终证据**：focused contract `26/26`、Web typecheck、production build、1672×941 本地 browser capture 与 `git diff --check` 均 GREEN；production build 首页仍为 `3.87 kB / 112 kB`。截图位于已忽略的 `apps/web/test/visual/out/optical-lab/asset-candidate-1672x941.png`，未提交、未部署。

## 2026-08-13（黑底发光分解替代方案）— ✅ 无 API Key 获得透明候选

- **方法纠偏**：半透明白光不再使用彩色色键。Codex 内置生图以 `target-reference.png` 为构图参考生成纯黑底、无文字能量层；随后按加色模型以像素峰值反推 alpha，并反预乘 RGB。黑色代表零光，因此不存在洋红污染，也无需 OpenAI API Key。
- **候选结果**：`tmp/imagegen/energy-plate-black-alpha-v1.png` 为 RGBA 1672×941，四角 alpha=0，非零 alpha coverage `.144896`，其中 227,658 像素为连续半透明、314 像素完全不透明；孔径约在目标 57–58%，保留上下粒子幕、软焦散和右侧非均匀细丝。
- **可逆验证**：透明候选重新叠回黑底后与生成源图的平均通道误差 `.210699`、p99=`2`、max=`2`，证明低亮辉光和细丝几乎无损保留。黑底审图为 `tmp/imagegen/energy-plate-black-alpha-v1-preview.png`。
- **后续状态**：该候选已获用户确认并提升到隔离 Optical Lab；详见上方“透明能量资产候选接入”。生产 Landing 与 ECS 仍未改变。

## 2026-08-13（Codex 内置生图透明能量层实验）— ⏸️ Chroma 路径不适用

- **正确输入**：以 `apps/web/public/optical-lab/target-reference.png` 为唯一构图参考，生成 1672×941、无文字、固定 58% 孔径的粒子幕、焦散和右向非均匀细丝；未再使用早期蓝色六面对象。
- **内置生图结果**：生成图在孔径位置、上下粒子幕和右侧不规则细丝上接近目标结构，但模型只能先输出纯洋红 chroma 背景。源图保存为未跟踪 `tmp/imagegen/energy-plate-v1-source.png`，未接入页面。
- **透明化验证**：第一次去色键得到 RGBA 1672×941、透明角、主体 alpha coverage `.018473`，但软辉光带有明显洋红污染；按规则仅重试一次 `edge-contract=1`，coverage 降为 `.002593` 且主体大面积消失。`energy-plate-v1.png` 与 `energy-plate-v2.png` 均不合格，不作为候选资产。
- **CLI 原生透明尝试**：用户明确批准后，bundled `image_gen.py` dry-run 确认 `gpt-image-1.5`、`/v1/images/edits`、1536×1024、高输入保真与透明 PNG 参数有效；真实调用在认证层返回 HTTP 401 `invalid_api_key`。变量存在但凭据无效，未生成 `output/imagegen/energy-plate-native-v1.png`，未重试、未读取或打印 `.env`。
- **当前边界**：用户需在本机更新有效的 `OPENAI_API_KEY` 并重新启动/刷新当前进程环境，确认后才能复跑同一非覆盖调用。不继续调 chroma、不接入 runtime、不改生产 `/`、不部署 ECS。

## 2026-08-13（资产优先路线决策）— ⏸️ 已确认下个 session 执行

- **用户结论**：当前右侧解析射线扇面与真实原型差距过大，停止继续调 procedural shader；采用“资产优先混合层”路线，先验证高保真静态透明 PNG，再决定是否制作 WebM 动态层或引入 Unicorn Studio。
- **本 session 诊断**：真正原型是 `apps/web/public/optical-lab/target-reference.png`；此前误展示 `test/visual/out/optical-lab/reference-desktop.png`（三栏实验对照页），已纠正。仓库已有 `target-reference.png`、OGL/MSDF atlas 和现有截图，但没有可直接复用的能量视频/3D 资产。
- **路线分析**：当前 OGL 适合生命周期、交互和降级，不适合继续承担原型级右侧体积散射/非均匀细丝的完整生成。Unicorn Studio 官方提供 JS SDK、JSON export、WebM/MP4 export 与商业授权，但当前 session 无法操作其账户场景，不能凭空引入或假设 CDN/许可证边界已解决。
- **失败实验**：本地 Pillow 程序生成的两版透明能量层仅作预览，均未接入页面、未提交；第一版过度规则，第二版能量过暗。临时实验目录为未跟踪 `tmp/`，下个 session 首先决定保留、迁移或清理。
- **下个 session 单一入口**：使用已授权的图像生成/Unicorn 场景工具，制作一张无文字透明 `energy-plate.png`，叠加现有 DOM/MSDF 标题后在原尺寸与 `target-reference.png` 并排验证；未达到视觉接近前不得改生产 `/`、不得接入动态 runtime、不得部署 ECS。

## 2026-08-13（Optical Lab 能量构图迭代）— ✅ 本地实现与回归门禁收口

- **单核构图**：粒子幕改为向固定 `.58` 孔径非线性汇聚；高能 pass 删除七列平行光柱，改为由粒子证据拥有的单一双侧透镜壳；最终 composite 只保留一组右向稀疏直线细束，降低 blur 占比并移除传播距离相关弯折。生产 `/`、ECS、后端、schema、认证与 Hermes 均未改变。
- **可证伪视觉门禁**：新增外带丝状/宽雾比例、141 档径向连续性、目标相对绝对能量，以及普通/高密竖条纹、稀疏点、纯标题、悬空射线段和孤立桥点反例。独立复审发现的旁路与近场连接漏洞均以 RED/GREEN 关闭；每条有效轨迹现必须同时满足局部切向脊线、暗法向侧翼、稀疏角谱，以及孔径右侧 `.05–.11` 的 13 点连续桥接覆盖率 `≥75%`。
- **最终本地指标**：caustic center error `.001352`、width `.059211`、curtain `.974914`、dissolution `.779762`、masked similarity `.861427`；filament `.805872`（target `.795277`）、haze `0`（target `.052510`）；连接径向轨迹 `6/141=.042553`、coherent energy `.012027`、absolute energy `.071579`（target `.028456`）。原尺寸截图确认单壳连续、无旧式七列光柱与宽雾回潮。
- **验证**：focused `2 files / 35 tests`、全 Web `31 files / 223 tests`、全仓 test/typecheck/lint、workspace/docs sync、fresh production build、127.9s production-start browser matrix、docs lint `181 files / 0 issues`、diff check与 3062 端口清理均 GREEN。物理桌面/手机 15s 性能与用户最终视觉选择仍是诚实缺口；本结果不构成替换生产 `/` 或部署 ECS 的授权。

## 2026-08-12（Optical Lab 高保真 Task 8）— ⏳ 本地工程验收完成，待真机与用户视觉终验

- **独立审查收口**：独立 reviewer 无 Critical，3 项 Important 已以 RED/GREEN 修复并提交 `54236f3`：生产浏览器真实覆盖自适应两级降质/恢复、验收阶段 pointer 三位置帧与真实鼠标选择；运行诊断改为发布实测 FPS/CPU/bloom，GPU timer 不可用时明确 `unavailable`。静态 decorative fallback 现不截获指针，动态与 DOM/static 均可拖选唯一 `Science evolves.`。
- **自适应证据**：`65536 / .25 → 36044 / .125 → 65536 / .25`（粒子/bloom），三阶段 bounds 均为 `10.8,99.1,460.0,69.2`；受控恢复观测 `60 FPS / 2ms CPU`。shader failure 与 incomplete FBO 的 Texture/Buffer/Shader/Program/Framebuffer create-delete 全量逐项相等。
- **最终门禁**：全 Web `31 files / 221 tests`、typecheck、root lint（`WORKSPACE_STRUCTURE_OK` / `DOCS_SYNC_OK`）、fresh production build、133.2s production-start browser matrix、docs lint `180 files / 0 issues`、docs-sync、diff check 与 3062 端口前后清理全 GREEN；生产 `/` 仍 `3.87 kB / 112 kB`。
- **诚实缺口**：本 session 无物理桌面/手机，未采集各 15s resting 与 pointer/touch 的 median/p95 frame time、tier、dropped frames；SwiftShader 证据不冒充真机 GPU。下一门禁为用户原尺寸最终视觉选择；即使批准也不构成替换生产 `/` 或部署 ECS 的授权。

## 2026-08-12（Optical Lab 高保真 Task 7）— ✅ 验收静态 fallback 与运行时预算

- **静态验收资产**：受限 promotion CLI 只接受 `test/visual/out/optical-lab/desktop-resting.png`，校验 PNG、1672×941 与 2 MiB 上限后写入 `public/optical-lab/accepted-resting.png`，源 SHA-256 为 `711f74c957db07006d9b0a6bccb4b92c0074234018a3e30f2d13262993f3ed35`。图片为 decorative；唯一语义 h1 保持可选择，静态图 load 后隐藏重复 DOM ink，error 时恢复。
- **稳定自适应**：新增 `full → reduced-particles → reduced-bloom` 纯状态机；两个连续 2s `<45 FPS` 窗口逐档降级，`>55 FPS` 连续 10s 才恢复一档。DPR `≤2`，粒子 draw range 最低 55%，reduced bloom 使用 1/8 离屏目标；排版、58% seam、flow topology 与布局测量不变。
- **预算与故障矩阵**：fallback `589,510 B ≤2 MiB`，atlas 总量 `82,731 B ≤512 KiB`；production `/` 仍 3.87 kB / First Load 112 kB，首页实际 route chunks 不含 OGL/Lab renderer。WebGL1、reduced motion、WebGL2/shader/FBO/atlas 初始化失败均显示验收图、无 canvas/RAF，context restore 与逐资源 cleanup 继续通过。
- **验证**：focused `24/24`、全 Web `31 files / 221 tests`、typecheck、fresh production build、完整 production-start browser matrix、root lint (`WORKSPACE_STRUCTURE_OK` / `DOCS_SYNC_OK`)、`audit:docs-sync` 与 `git diff --check` 全 GREEN。
- **范围**：只更新隔离 no-index Lab；生产 `/` 和 ECS 均未改变。下一步 Task 8 最终本地验收、独立 review、文档收口与用户最终选择。

## 2026-08-12（Optical Lab 高保真 Task 6）— ✅ 有界 flowmap 指针响应

- **用户门禁与提交**：用户批准 Task 5 原尺寸静止材质；批准态以 `2404da2` 提交。Task 6 继续只在 `codex/optical-editorial-v3` 的 no-index Lab 中执行，未替换生产 `/`、未部署 ECS。
- **TDD 响应契约**：新增 `stepOpticalResponse`，真实 RED 为缺失 API；GREEN 固定 120ms 到达、整行绝对位移 `1–2px`、局部峰值 `≤4px`、caustic gain `≤.08`、左右 aperture 方向与 650ms exact rest，无 spring reversal。
- **GPU 实现**：新增独占 96×54 双 RenderTarget 的 ping-pong flow pass；真实 pointer 时间戳、stage-local CSS 坐标与 capped velocity 经 renderer RAF 送入 flow。glyph composite 径向限制合成位移到 4px，particle 仅沿既有正 x 场偏转，caustic gain 由 composite uniform 消费。
- **故障证据**：production-start gate 先捕获 final composite 缺失 `uCausticGain` 声明并 fail closed，所有 GPU 资源完整回收；采集真实 GLSL info log 后修正声明归属。三位置最初同帧的根因是模型丢失 aperture-relative 方向，源头修复后 left/slit/right 产生非零像素差。
- **验收**：focused `29/29`、全 Web `30 files / 214 tests`、typecheck、fresh production build、完整 production-start browser lifecycle/fallback/resize/context-loss matrix、根 lint/workspace/docs-sync、`git diff --check` 全 GREEN；原尺寸 resting/left/slit/right/recovered 无环、机械线、标题断裂或布局跳动，650ms 恢复通过。
- **下一步**：Task 7 推广已批准的静止 fallback，并实现粒子/blur 运行时预算降级；仍不得替换生产首页或部署 ECS。

## 2026-08-12（Optical Lab Task 5 字形坐标契约修复）— ⏳ 技术 GREEN，等待用户原尺寸视觉批准

- **可证伪根因与 RED**：原 production-start gate 原样复现 isolated `evolves`：bounds `.901261`、density `1.076923` 通过而 shape `.766194 < .90`；GPU/DOM bbox 为 `287..466` / `291..475`，同掩膜只需约 `(+9,-1)` 刚性位移即可达 `.971335`。BMFont `base=108`、atlas size `96`、padding `4` 与 OGL/CSS tracking 语义给出 `7 × (.085 × 12) + 4 = 11.14` atlas px（约 `8.29` screen px）的末端 landmark 漂移预测。新增 contract test 先以缺失 ink-mapping authority 精确 RED（16 pass / 1 fail）。
- **单一结构契约**：OGL tracking 现从 atlas `info.size` 换算；source 以 BMFont 声明 padding 后的真实 ink landmark 归一化；target 由浏览器按实际 computed font/letter-spacing 逐 glyph `TextMetrics` 并经真实 CSS matrix/origin 映射。没有 `+9px` 单词偏移，也没有修改 `.90`、radius `5`、target、mask 或 typography 阈值；唯一 h1 的 `Science evolves.`、58% seam、baseline、straight alpha、Task 4 lifecycle/resource cleanup 均保留。
- **parity 与材质 GREEN**：isolated GPU/DOM bbox 更新为 `291..470` / `291..475`，bounds `.941251`、shape `.907246`、density `1.047571`；native material 保持 continuity `.957711`、dissolution `.809524`、curtain `.865450`（floor `.746579`）、caustic `.046651/.001053`、right `7.365091`、left `.119544`、similarity `.844167`，ring `.527778`、fan `.045455`，mechanical/staircase/uniform/duplicate `0`。
- **完成态门禁**：focused `51/51`、全 Web `30 files / 212 tests`、Web/全仓 typecheck、fresh production build、完整 production-start resize/context/failure/restore matrix、root lint + workspace + docs-sync 与 atlas 双生成确定性均 GREEN。测试 shader-failure injector 只对 WebGL context 注入 invalid shader，避免把新的 2D measurement context 误当成 GL；真实 compile/link fail-closed 路径仍完整执行。
- **硬停止**：已原尺寸检查 target、native resting、isolated GPU/DOM、resize 与 fallback；GPU/DOM 首缘对齐，GPU 末缘约短 5 px但通过原 literal contract。当前只等待用户视觉批准；未推广 fallback、未 commit、未部署，未开始 pointer/Task 6。

## 2026-08-12（Optical Lab 高保真 Task 5 结构修复）— ⏳ 字形同构三轮后 NEEDS_CONTEXT

- **授权结构修复**：沿用既有 pin 的 Google Fonts 上游，将 `evolves` 确定性静态实例改为 Bodoni Moda Italic `opsz=96,wght=400`，按真实 inner ink bounds 映射 GPU；材质拆出独立 upstream x-strata / y-mapping dissolution role，并把梯状 caustic 改为稀疏曲线高能细丝。未新增字体家族、依赖、pointer uniform、flowmap 或 Task 6 行为。
- **字体目标门通过**：旧 700 在真实 native suffix 的 width/height/density/slant 分别为 `.93250/.90954/1.85623/6.0293deg` RED；新实例与几何最终为 `.97336/.99497/1.20693/1.1966deg` GREEN，bottom error `.004251`，58% seam `.579994`、baseline `.541993`，Archivo 未改。
- **材质结构门通过**：continuity `.957711`、dissolution `.809524`、curtain `.865450`、caustic width `.046651` / center `.001053`、right `.7.365091`、left `.119544`、similarity `.844222`；ring `.569444`、fan `.045455`，mechanical/staircase/uniform/duplicate 均为 `0`。
- **当前停止点**：同一 `evolves` DOM/GPU shape-parity 在三次限定映射中为 `.747038 → .708614 → isolated .766194 < .90`；最终 bounds `.901261`、density ratio `1.076923` 已通过，但 GPU 可见字约比 DOM 左移 7–8 px，根因指向 atlas quad/padding/advance origin 与 CSS inner-ink/negative letter-spacing 语义差异。按规则停止，不做第 4 次标量调参；完整 resize/context/failure matrix、root lint/full Web/双 atlas generation 未宣称，未请求视觉批准、未提交。

## 2026-08-12（Optical Lab 高保真 Task 5）— ⏳ 三轮同断言后 NEEDS_CONTEXT

- **静止材质实现**：隔离 Lab 已接入固定 seed、glyph-mask 派生的 OGL GPGPU 粒子，以及 intact glyph / dissolution / curtain / 4–6vw caustic / rightward emission 五层诊断；高能量独立四分之一分辨率模糊，color targets 优先 RGBA16F、WebGL2 内回落 RGBA8，最终维持 straight alpha。Task 5 没有 pointer uniform、flowmap 或 Task 6 行为。
- **真实 RED/GREEN**：MSDF-only native frame 在 dissolution=`0` 精确 RED；synthetic valid/五个 forbidden fixtures 与 focused contract 最终 `25/25`，Web typecheck 和每轮 production build 通过。literal native thresholds 未降低，reference/accepted metrics 未改写规避失败。
- **停止证据**：三次调参均在同一 `dissolutionTransfer ≥ .55` 断言失败，最终 `.511905`；其余最终指标已达：continuity `.956468`、curtain `.758267`、caustic width `.050239` / center error `.000144`、right `.7.365091`、left `.119544`、similarity `.819972`，ring/fan/mechanical/uniform/duplicate 均通过。按计划硬规则停止为 `NEEDS_CONTEXT`，未继续盲调。
- **视觉结论与下一步**：原尺寸最新帧的点幕覆盖已合格，但 caustic 断续纹理仍呈梯状竖柱，且窄上游 dissolve 缺少确定性 x-column coverage；因此未请求用户材质批准、未运行完成态全门禁、未提交。若获准恢复，应先拆出确定性 mask-derived dissolution role 并将 caustic 改为稀疏曲线高能细丝，而非继续改标量。

## 2026-08-12（Optical Lab Task 4 review fix round 1/5）— ✅ 四项 Important 已修复

- **异步几何 ownership**：renderer 以单调 generation 统一初始 DOM 测量、共享 atlas load、二次 parity、resize 与 RAF；resize 先同步撤回 GPU ink、取消旧 RAF 并使旧 async token 失效，最新 layout 完整重画后才重发。阻塞 `document.fonts.ready` 的 post-frame probe 在旧代码精确 RED 为 stale bounds 重新发布；延迟 atlas PNG 的 init-resize case 证明 pending atlas 不再导致永久 fallback。
- **真实负样本**：移除稀疏 border/crossbar，改用两行相同外框、连续列与相近笔画密度的多字形 bitmap masks。错误字形 bbox IoU=`1.0`、continuity=`0.7375`、density ratio=`0.9850`，但整体/Science/evolves AA-tolerant overlap 仅 `0.829811 / 0.817836 / 0.852063`，均不能越过原 `0.90` 门；radius 与 literal threshold 未降低。
- **straight alpha**：内部 color target 继续保存 premultiplied MSDF coverage，final composite 在 `premultipliedAlpha:false` drawing buffer 安全 unpremultiply。1672×941 composite-draw 内 `readPixels` 记录 2,141 个白色 AA edge pixels（平均最小通道 `231.06`）、28 个 vermilion edge pixels（R=`255`、G=`77.93`）且透明像素 RGB 污染为 `0`。
- **真实失败矩阵**：invalid GLSL 确实执行 compile/link 后 0 glyph draw、停止 RAF、保留 DOM 并逐项资源回收；注入 `FRAMEBUFFER_INCOMPLETE_ATTACHMENT` 在旧代码精确 RED 为 30s 未离开 `webgl2-full`，修复后 target 采用 create→track→check 事务，部分构造 mask target 精确 cleanup 并静态 fail closed。
- **验证与范围**：focused `18/18`、Web 全量 `199/199`、Web typecheck、production build、扩展 production-start 11-case gate 与原尺寸 GPU/DOM/resize/init-resize/shader/FBO 审图均通过；真实 reference shape overlap 现为 `0.959058`（Science `0.962785`、evolves `0.936090`）。没有 Task 5 effects，生产 `/` 仍 3.87 kB / 112 kB，未部署。

## 2026-08-12（Optical Lab 高保真 Task 4）— ✅ MSDF 字形与 DOM 精确同构

- **真实字形通道**：隔离 Lab 使用 OGL `Text`/BMFont geometry 与已批准的 Archivo 900、Bodoni Moda Italic 700（opsz 96）单页 atlas；derivative median MSDF shader 在线性 mask/color targets 中绘制 `Science evolves.`，句点保持 vermilion。没有加入粒子、溶解幕、焦散、bloom、GPGPU、flowmap 或 Task 5 材质。
- **DOM 权威与首帧诚实性**：唯一可选择 `h1` 继续提供 CSS-pixel word/baseline/seam bounds；仅在两词 mask/color 与 composite 五次真实 draw 完整成功后发布 `firstCompleteFrame=true` / `data-optical-ink=gpu`。resize 与 context restore 先撤回 GPU ink，fresh context 完整重画后才再次发布；atlas/初始化失败、WebGL1、mobile、reduced motion 均保留静态 DOM。
- **形状而非外框门禁**：AA 容差双向 mask coverage 在 1672×941 为 `0.946859`（Science `0.961199`、evolves `0.912870`），外框 IoU `0.904320`、occupied-column continuity `0.960440`；同外框错误轮廓 fixture 虽 bbox IoU=`1.0`，形状分仅 `0.197853`，证明门禁不会把外框近似误判为字形同构。
- **显式阶段边界**：当前唯一 glyph phase 为 `task-4-msdf-glyph-v1`，由命名的 `runTask4MsdfGlyphAssertions` 验证；旧 Candidate B 完整材质断言保留但不激活，Task 5 后续必须显式使用 `task-5-resting-material-v1`，未知 marker fail closed。
- **验证与范围**：focused `17/17`、Web 全量 `198/198`、Web typecheck、根 lint/workspace/docs-sync、production build、production-start browser gate 与原尺寸 desktop/resize/restore/mobile/fallback 审图均通过；生产 `/` 仍为 3.87 kB / 112 kB，未改 Landing、ECS、API/schema/auth/Hermes，未部署。
- **下一步**：Task 5 才可实现并激活完整静止材质门禁；当前仍无获准 fallback asset，静态环境继续使用诚实 DOM。

## 2026-08-12（Optical Lab 高保真 Task 3）— ✅ WebGL2 OGL 运行壳

- **运行策略**：隔离 Lab 新路径只保留 `webgl2-full` / `static-fallback` / `dom-only`；WebGL1、reduced motion、低功耗与初始化失败均不挂动态 Canvas、不启 RAF。OGL 构造在 canvas 实例上阻断其内置 WebGL1 fallback，未修改全局浏览器 API。
- **布局与诚实发布**：Candidate 使用已批准 Archivo/Bodoni 单行 DOM 几何，桌面/移动均以 58% 结束 `Science` 并开始 `evolves.`；字体 ready 后读取真实 CSS-pixel word/baseline rectangles，超过 1px 拒绝 GPU 发布。Task 3 壳始终报告 `firstCompleteFrame=false` 并保留可选中 DOM ink，未伪造 glyph/particle/composite 或提前推广静态资产。
- **事务生命周期**：按 context 建立 OGL raw-handle ledger，覆盖 shader/program/buffer/texture/framebuffer/renderbuffer/VAO，交叠 ownership 去重且每 program 只 detach 自己 shader；初始化失败、policy change、context loss、unmount 均 cancel RAF、精确 dispose、移除 canvas，restore 使用 fresh canvas + fresh WebGL2 context。
- **复审修复 round 1/5**：首个 WebGL2 capability acquisition 与 OGL constructor 共享 frozen context attributes；异步 unavailable 走单一可重入 ownership teardown，先 dispose renderer、移除 listeners/canvas、清空 refs 再发布 static；浏览器门禁以 `task-3-runtime-shell-v1` 显式分派，完整 Candidate B visual assertions 保留在命名 Task 4 分支，不再由恒真条件静默跳过。
- **TDD/验证**：初始 RED 为 2 files / 6 intended failures；审查补充 RED 捕获跨 program 8 次错误 detach 与旧 SSR mode；fix-round RED 为 3 intended failures / 23 pass（缺 context acquisition contract、phase marker、ownership lifecycle）。最终 focused 2 files / 26 tests、scoped lint、Web typecheck、production build、production-start 浏览器 lifecycle matrix 均 exit 0；生产 `/` bundle 仍 3.87 kB / First Load 112 kB，未改 Landing/ECS/backend。
- **下一步**：Task 4 才可注册非零 OGL glyph resources 并实现 MSDF 排版；完整 glyph/particle/composite frame 前不得隐藏 DOM ink。

## 2026-08-12（Optical Lab Task 2 review fix round 2/5）— ✅ Node Buffer lint gate

- **根因与修复**：atlas generator 在 Node 运行时直接使用全局 `Buffer`，根 ESLint `no-undef` 不推断 Node global。以显式 `import { Buffer } from 'node:buffer'` 绑定标准库，未改 atlas bytes/settings、依赖、字体、OGL runtime 或后续 Task。
- **RED/GREEN**：targeted ESLint RED 为 `generate-optical-atlas.mjs:157:73 'Buffer' is not defined no-undef`；单行 import 后 targeted ESLint exit 0。focused atlas `6/6`、双生成 scoped clean diff、Web typecheck 与全根 `lint`（ESLint + `verify-workspace` + docs-sync）全部 exit 0。

## 2026-08-12（Optical Lab Task 2 review fix round 1/5）— ✅ 输出映射与配置不可变

- **审查修复**：生成器不再从 mutable `font.file` basename 推导写入路径；代码拥有且先验证唯一的 `science-display.ttf → science-display.{json,png}` 与 `evolves-editorial.ttf → evolves-editorial.{json,png}` 映射。篡改 source、输出重复/缺失/额外项会在任何 generation/write 前失败。
- **不可变 gate**：代码与 manifest 同时固定 charset、`msdf-bmfont-xml@2.8.0`、96px、range 8、padding 4、JSON/MSDF、smart/POT、单页与 512 KiB 总预算；生成结果在写入前复核单页与总字节数。focused atlas suite 以实际 JSON 检查精确 unique glyph set、pages、POT 尺寸、distance field、size/padding 与 budget。
- **TDD/验证**：RED 为 3 个缺失 `validateOpticalAtlasContract` 的映射/config probes + 缺失 manifest settings；GREEN `6/6`。随后双生成 scoped diff、Web typecheck 与 `audit:docs-sync` 均 exit 0；无 Task 3、生产首页或 ECS 改动。

## 2026-08-12（Optical Lab 高保真 Task 2）— ✅ 固定 OGL/MSDF 资产

- **字体/许可取证**：Google Fonts 仅提供变量上游，故固定 `google/fonts@038b637` 的官方 Archivo 与 Bodoni Moda Italic 输入，以 FontTools 4.55.3（禁止 timestamp 重算）分别实例化为 `Archivo Black`（`wdth=100,wght=900`）和 `Bodoni Moda 96pt Bold Italic`（`opsz=96,wght=700`）。上游、实例输入与生成输出 SHA-256、轴值、工具版本与原样 OFL 已登记在 `apps/web/assets/optical-lab/fonts/manifest.json`；不使用 `.next` 临时字体。
- **受限生成器**：`@openscience/web` 固定 `ogl@1.0.11`（Unlicense）与 `msdf-bmfont-xml@2.8.0`（MIT）。`atlas:optical` 只允许空格与 `Sciencevolves.`、96px/8 distance range/4 padding、JSON、单页 smart power-of-two atlas，校验输入 hash/工具版本/输出目标，并仅覆写四个 atlas 输出后刷新 manifest hash。
- **TDD/验证**：atlas integrity RED 为缺少 manifest 的 `ENOENT`；审查发现 charset 可被 manifest 与文本同时篡改后，再以 `assertAcceptedCharset` RED→GREEN 固化不可变标题字符集。focused test `2/2`、两次生成后的 scoped `git diff --exit-code`、Web typecheck 均 exit 0；四个 atlas 共 `82,731 B`（≤512 KiB）。
- **隔离与文档**：ADR-009 改为仅 no-index Lab 的 OGL WebGL2 exception，明确 Unlicense/MIT/OFL 与浏览器/ECS 边界。OGL 目前尚未被任何源代码 import（Task 3 才可在 Lab client graph 使用）；生产 `/` 无 Lab import，未改 API/schema/auth/Hermes/ECS 或部署。
- **下一步**：Task 3 才可消费这些已提交的 Lab-only assets；仍不得更改生产首页或 ECS。

## 2026-08-11（Optical Lab 高保真重构计划）— ✅ 设计确认，待选择执行方式

- **书面确认**：用户确认 `docs/specs/2026-08-11-optical-lab-high-fidelity-design.md`，忠实原型、OGL WebGL2 多通道、静态高保真降级与轻量 flowmap 交互边界不再开放漂移。
- **实施计划**：新增 `docs/superpowers/plans/2026-08-11-optical-lab-high-fidelity-reconstruction-plan.md`，8 个 TDD task 覆盖全尺寸字体样张、固定版本 OGL/MSDF 资产、WebGL2 生命周期、MSDF 排版、五层静止光场、4px 内 flowmap、静态降级/预算及最终验收。
- **硬验收点**：Task 1 全尺寸字体样张必须先获用户批准，才可进入粒子/后处理；Task 5 静止材质必须先获批准，才可加入鼠标响应与推广静态 fallback；最终批准仍不授权替换生产 `/` 或部署 ECS。
- **当前边界**：本轮只写计划并同步文档，没有修改 Web 实现、依赖、锁文件、生产 Landing、API/schema/auth/Hermes，也没有部署。
- **下一步**：用户选择 Subagent-Driven（推荐）或 Inline Execution；执行从 Task 1 的真实 RED 与 1672×941 字体样张开始。

## 2026-08-11（Optical Lab 高保真重构设计）— ⏳ 分段确认，待书面复核

- **用户裁决**：Candidate B 虽工程门禁全绿，但标题比例、粒子层次、焦散与合成材质离 `Science evolves.` 原型过远，视觉上显得廉价，正式拒绝为审美基线；选择“忠实原型”方向 A。
- **技术调研**：核对 OGL 的 MSDF、Mouse Flowmap、GPGPU particles、RenderTarget/Bloom/Fluid Distortion，及 Three.js + Troika + postprocessing、VFX-JS、Curtains.js、PixiJS 的适用边界；最新版 Three.js WebGLRenderer 已为 WebGL2-only。用户确认采用 OGL WebGL2 多通道重构，WebGL1/低性能环境使用高保真静态降级。
- **已确认设计**：1672×941 下标题约占 `x=2.2%–95.7%`、`y=35.8%–60%`，基线约 54.2%，两套字体和固定 aperture 在 58% 相接；静止态由完整字形、字形溶解、全高粒子幕、4–6vw 窄焦散和仅向右射流五层组成；鼠标只以 flowmap 做 1–2px 整行跟随、局部不超过 4px、650ms 无 bounce 归零。
- **文档**：新增 `docs/specs/2026-08-11-optical-lab-high-fidelity-design.md`，Candidate B spec 标记 DEPRECATED；生产 `/`、ECS、API、schema、auth 与 Hermes 均未修改或部署。
- **后续状态**：用户已书面确认，新实施计划已建立；第一实施门仍只做全尺寸字体 specimen，未通过人工排版验收前不得进入粒子或后处理实现。

## 2026-08-11（Optical Lab Candidate B 最终复审）— ✅ Important 修复，待 Step 6 用户选择

- **TDD 与最终复审**：`af08251` 修复两个 Important：真实鼠标拖选现精确得到 `Science evolves.`，且 stage pointer 事件继续通过；斜向 target/current refraction 按真实 RAF `dt` 指数跟随、无 bounce，velocity/phase 有界，refraction + wave + flow 的 CSS 像素合成向量总量不超过 `8px` 并在 `650ms` 归零。RED 分别为拖选空串、`Scienceevolves.`、斜向 `11.313708px > 8px`、缺少平滑 step 与 raw velocity `707.106781 > 1`。
- **fresh GREEN**：focused Optical Lab 3 files / 16 tests、Web 全量 29 files / 177 tests；Web typecheck、production build、150.1 秒 production-start browser matrix、root lint 与 `git diff --check` 均 exit 0，3062 无 listener。现有 topology 与 active `.35/.008` 阈值未修改；直接 `particleCount <= 3,840` 断言已补，只有显式 steady-state FPS/CPU budget 仍为 deferred Minor。
- **静止/交互证据**：desktop topology 为 `1.474743 / 0.092701 / 0.965347 / 1.563921 / 0.510417 / 0.481993`；forced WebGL1 为 `1.298521 / 0.093620 / 0.971795 / 1.579973 / 0.989247 / 0.587262`。desktop active left/slit 为 `1.571805 / 0.039936`、slit/right `1.056231 / 0.035001`（mean/changed）；aperture 仍固定 `x=.58`。
- **人工审图**：desktop/resting/left/right、DOM fallback 与 WebGL1 resting 原尺寸证据未见重复/截断标题、暗腰、白环、机械竖线、蜘蛛网扇形或 aperture 位移；inline-flow 选择修复未造成可见几何偏移。相对参考，候选焦点和右向光束更克制，上下离散粒子幕更明显，因此只进入用户审美选择，不宣称等同参考。
- **范围**：全部逐帧计算在访客浏览器；headless Chromium 使用 ANGLE/SwiftShader，不能代表真机 GPU 性能。ECS 未改、未部署，生产 `/` 与现有 Canvas Landing 未改；只有用户在 Step 6 明确选择后才能另立生产替换计划。

## 2026-08-11（Optical Lab Candidate B 计划）— ⏳ 书面设计确认，待执行方式

- **设计确认**：用户复核 `docs/specs/2026-08-11-optical-lab-candidate-b-design.md` 后要求继续；ECS 无 GPU 的客户端执行边界再次确认。
- **实施计划**：新增 `docs/superpowers/plans/2026-08-11-optical-lab-candidate-b-plan.md`，分为纯 field model、单一 GPU glyph material、reference-relative resting/pointer 像素门禁、本地验收与文档同步四个 TDD task。
- **当前边界**：尚未修改 Candidate 实现、未部署、生产 `/` 不变；下一步选择 inline execution 或 subagent-driven execution。
- **执行裁决**：用户选择 Subagent-Driven，并批准把原 shader Task 与 browser visual-gate Task 合并为一个复审单元，保证 Candidate A 真实 RED 先于任何 shader GREEN；计划现为三个复审单元。

## 2026-08-11（Optical Lab Candidate B 设计）— ⏳ 方向已批准，待书面复核

- **用户决策**：静止态必须直接接近参考图；鼠标只做轻微增强，但整行文字需要平滑跟随形变。用户接受“液态折射”而非弹性回弹。
- **选定方案**：WebGL ready 时仅显示一层连续 GPU 字形，语义/可选择 `h1` 保留但抑制重复视觉墨迹；固定 58% 狭缝、静止焦点和右向出射是主构图，pointer 只调相位/能量/全行低幅折射。
- **运行边界**：ECS 无 GPU 不影响；服务端只交付 Next.js 资源，逐帧 shader/flow/particle 全在访客浏览器运行，WebGL2→WebGL1→DOM 降级不变，不改 Docker/ECS。
- **文档**：新增 `docs/specs/2026-08-11-optical-lab-candidate-b-design.md`；当前未改实现、未部署，等待用户复核书面 spec 后进入实施计划与 TDD。

## 2026-08-11（Optical Lab review fix round 1）— ✅ Critical/Important 已修复

- **浏览器验收加固**：pointer 截图改为 candidate-only clip 与 case-qualified 文件名，并以独立像素差、径向/白环/机械线 edge probe 和隐藏 Canvas ghost probe 做真实视觉门禁；synthetic regression fixture 证明门禁会拒绝退化，不再依赖自报 attribute。
- **GPU fallback 与 lifecycle**：WebGL2/WebGL1 每次初始化使用 fresh canvas + transactional resource ledger；WebGL2 shader/init 失败会完整回收后继续 WebGL1，双失败才进入 DOM。cleanup gate 直接核对 Shader/Program/Buffer/Texture/Framebuffer/Query create/delete 计数。
- **粒子与 policy**：WebGL2 使用 `drawArraysInstanced`，WebGL1 使用 `ANGLE_instanced_arrays`，能力缺失时不画非 instanced 粒子；reduced-motion 与 viewport policy 变化监听会卸载 GPU host。context-loss extension 缺失现在使门禁显式失败。
- **证据**：RED `npx pnpm@9.15.0 --filter @openscience/web shots:optical-lab` 在旧实现以 `desktop must issue real instanced particle draws` 失败；修复提交 `a0509ef` 后，主代理复跑 focused 9/9、Web 全量 28 files / 170 tests、Web typecheck、production build 和 64.2 秒 production-start browser gate，均 exit 0。独立 scoped re-review 判定全部 finding 已解决、无新增 Critical/Important。未部署、未修改生产 Landing/API/schema/auth，忽略截图未提交。
- **下一步**：Step 6 仍等待用户真机视觉选择；SwiftShader 工程门禁不代表审美或真实硬件性能验收。

## 2026-08-11（Optical Lab session freeze）— ⏸️ 已同步，部署留待下一 session

- **实现状态**：隔离 Lab 已提交为 `8485dac22edb15041e61884f47f3118ea2ef4708`；主代理重新运行 focused 9/9、Web 170/170、Web typecheck 与 production build，均通过，worktree clean。生产 `/` 仍为原 Canvas Landing，未部署 Lab、未修改 ECS/compose/API/schema/auth。
- **审查状态**：独立 reviewer `/root/review_optical_lab` 已收到 `review-7c470ad..8485dac.diff`，本 session 结束时尚未回传结论；下个 session 必须先读取 reviewer 结果并处理 Important/Critical finding，不能把实现代理自测等同于审查完成。
- **人工视觉门禁**：`apps/web/test/visual/out/optical-lab/desktop.png` 显示 Candidate A 仍存在低对比重叠字形，固定狭缝的压缩/出射拓扑弱于用户参考图；工程门禁通过不代表审美通过。可以把 Lab 部署为隔离对照，但不得据此替换首页或宣称视觉验收。
- **服务器预检**：使用 Git for Windows Bash 执行 `infra/scripts/checkup.sh` 通过；磁盘使用 11%、可用内存约 26 GiB，nginx/Docker/生产 Web/API/Postgres/Redis/对象存储/ClamAV 正常。PowerShell 直接调用 `bash` 会误入 WSL 并因 `Z:\\Dirac\\scripts` PATH 转换失败，后续必须使用 `C:\\Program Files\\Git\\bin\\bash.exe`。
- **下一步**：读取本交接与 reviewer 结论 → 必要时修复并复审 → 重新跑视觉/全量门禁 → 用户允许后先远端数据库备份，再以 `--skip-migrate` 部署隔离 `/_visual/optical-lab` → 在线核验 Lab 与 `/` 零回归；Step 6 仍由用户决定接受、迭代或拒绝 Candidate A。

## 2026-08-11（Optical Lab Task 8 Steps 3–5）— ✅ 隔离候选与测量门禁完成

- **TDD 合同**：先建立 model/render/route/browser RED 门禁，再实现精确路由 `/_visual/optical-lab`。页面并排展示用户参考图、未改动生产首页的本地 production capture 和候选，候选保留单一可选择语义 `h1`，且首页模块无 Lab import。
- **GPU 候选**：原生 WebGL 按 WebGL2→WebGL1（需 half-float）→DOM/static 降级；96×54 ping-pong dissipating field、固定 58% aperture signed displacement、轻量方向性 caustic/chroma 和稀疏 glyph-edge particles 均只在浏览器运行。移动低功耗与 reduced-motion 不启动 GPU loop；context loss/restore、卸载资源清理有浏览器门禁。
- **测量证据**：production-start Chromium 的 desktop/WebGL1/shader failure/无 WebGL/mobile/reduced 与独立 pointer frames 全绿；desktop/WebGL1 为 60/58 FPS，CPU submit 为 0.08/0.05 ms。SwiftShader 的同步 GPU fallback 本轮均为 0.00 ms，记录为可观测诊断而非真机性能结论。Lab route-exclusive JS 为 19,559 B raw / 6,266 B gzip，CSS 为 4,134 B raw / 1,422 B gzip；首页 build 仍为 3.87 kB、First Load 112 kB。
- **范围与状态**：未修改 `/`、生产 Landing renderer、API、数据模型、ECS/compose 或依赖/lockfile；Task Master Task 4 保持 `in-progress`。Task 8 Steps 3–5 已完成，Step 6 仍等待用户在真实设备选择候选，未授权生产替换或部署。
- **下一步**：用户访问隔离 Lab 对 reference/current/candidate 做视觉裁决；只有明确选中候选后，另写生产替换计划并重新走 TDD、全量产品门禁和 ECS 授权。

## 2026-08-11（Optical Lab ECS GPU 能力探测）— ✅ 确认纯客户端 GPU 架构

- **服务器事实**：ECS PCI 仅有虚拟 Cirrus Logic GD 5446；`/dev/dri` 无 render node，`nvidia-smi`/`rocminfo` 不可用，无 GPU kernel module；Docker runtimes 只有 `runc`，生产 compose 无 GPU 声明。因此服务器不具备 CUDA/ROCm/WebGL 硬件计算能力。
- **浏览器事实**：Windows headless Chromium 访问生产首页时 WebGL/WebGL2 均可用，ANGLE Vulkan SwiftShader，max texture size 8192，语义 `h1` 存在；证明软件渲染门禁可运行，但不替代真实设备 FPS 验收。
- **架构结论**：Optical Lab 继续实现，但所有逐帧 shader/flowmap/particle 计算只在用户浏览器；ECS 只负责 Next.js 构建和静态资源交付，不安装 GPU 驱动、不修改 compose。必须实现 WebGL2→WebGL1→DOM 静态标题三级降级与 context-loss 恢复。
- **下一步**：把 client-only、SSR semantic headline、capability detection、SwiftShader acceptance 与真实设备性能预算写进 Optical Lab RED contract，再开始隔离候选实现。

## 2026-08-11（Landing 第四轮：停止 Canvas 调参，转外部实现调研）— ⏳ 参考架构已确认，待 Optical Lab

- **用户验收**：用户明确判定线上 `cd5be36` 仍不好看，并要求先检索成熟实现；此前“生产发布完成”仅代表发布与工程门禁，不代表视觉验收，Task Master 4 已重新置为 in-progress。
- **根因**：当前 `canvas-renderer.ts` 在 CPU 上逐粒子调用 `arc()`，用额外 focal vertical dots/Fresnel families 模拟光学现象；连续 DOM 字形本身没有共享位移材质，因此结果是灰色点阵盖住文字、机械竖线和装饰性波纹，而非原型的连续表面形变。
- **外部证据**：实际运行 Codrops Interactive Particles、Accessible WebGL Text、Distorted Pixels、Dreamy Particles 与 Text Distortion 演示；读取对应 GitHub 源码、依赖和许可证。成熟模式是 HTML-first WebGL 字形同步、instanced glyph particles、DataTexture/Flowmap 位移与衰减，而不是 CPU Canvas 手绘点阵。
- **技术纠偏**：spec 已冻结第四轮为“连续字形材质 + 共享 GPU 位移场 + 稀疏粒子辅层”；优先 OGL/原生 WebGL2 轻量 spike，Three.js + troika 仅作证据驱动备选；无明确许可证的仓库只学习，不复制。
- **下一步**：不改生产 Landing。先在独立 Optical Lab 并排实现 reference/current/candidate，以真实字体、相同排版和固定 aperture 比较；提交用户视觉选择后再建立替换计划并部署。

## 2026-08-11（Landing 固定字形衍射第三轮纠偏）— ✅ 生产发布完成

- **线上复核失败**：用户确认 release `b45e002` 仍有跟随鼠标的大圈粒子、扇形衍射线和缺失的原型字形穿越形变，因此上一条“已无大面积粒子团”的静态截图结论无效；`b45e002` 不作为视觉接受基线。
- **根因证据**：`canvas-renderer.ts` 的 ambient pass 仍以 moving `sample.origin` 形成圆形粒子盘，core strip 仍用鼠标径向排斥；CSS/SVG 仍以 moving origin 形成椭圆 mask 并用 turbulence 撕裂完整标题；浏览器旧门禁没有捕获 60/150/300ms active frames。
- **事实源修正**：现有 Optical Field spec 与增量计划 Task 7 已改为固定 aperture、真实 glyph alpha 粒子采样、上游字形压缩/焦点/下游波前重构、pointer energy-only modulation；Task Master 4 重新置为 pending。
- **TDD 与实现**：旧代码 RED 精确暴露 moving origin、radial disk/mask、turbulence duplicate、缺失 glyph sampler 和 active-frame 覆盖；GREEN 后标题继续保持单一可访问 DOM 与原布局，Canvas 改为加载真实字体后采样 glyph alpha，固定 50% aperture，上游压缩、焦散、下游 Fresnel grain，指针只调制 phase/energy/≤18px vertical bias。
- **独立复审修复**：reduced-motion 在字体 alpha 采样完成后补静态重绘；删除首次挂载的重复全标题栅格化；resize 先提交新画布尺寸再重建粒子；active-frame 门禁每个 60/150/300ms 样本先独立回到 neutral，避免累计成 60/210/510ms；删除已无生产消费者的旧 density/displacement/wavefront 合同与 CSS 写入。
- **本地证据**：focused 24/24、Web 26 files / 161 tests、typecheck、production build 通过；3045 production 截取 1440/1920/390 normal/reduced/Open RO，以及相互独立的 pointer-left/slit/right 60/150/300ms 帧。人工复核确认无鼠标圆形边界、无移动光轴、无贝塞尔扇形线；移动端使用独立窄遮罩，避免桌面宽遮罩造成整词灰化。
- **生产发布**：release `cd5be36` 在巡检正常、数据库备份 `BACKUP_OK size=276K files=7/7` 后以 `--skip-migrate` 从隔离 worktree 部署；远端全仓 build、compose 收敛、API/Web/agent-worker 重启和 Nginx `-t` 均通过。
- **线上验收**：公网 Chromium 完成 1440/1920/390 normal/reduced/Open RO 和相互独立的 pointer-left/slit/right 60/150/300ms 全矩阵；人工检查未见鼠标大圆、移动光轴或蜘蛛网扇形，字形在固定狭缝附近保持 alpha-derived 压缩/聚焦/重构；`/`、`/explore` 返回 200，未登录 `/auth/me` 返回 401。Task Master 4 已置 done。
- **下一步**：由用户在真实鼠标操作中复核细腻度；不再恢复被否决的 pointer disk。后续按既定产品表面计划继续增量优化 Dashboard/Workspace/Public RO/Hermes。

## 2026-08-11（Landing 原型形变纠偏）— ✅ 第二轮已部署

- **用户纠正**：首轮把问题误判为文字轴位置，并把核心点阵扩成大面积白色椭圆；release `3336be4` 虽通过工程门禁但视觉不合格，不能作为接受基线。
- **第二轮实现**：完整恢复 `3336be4` 之前的标题布局和 50% 光轴；删除造成白色大圈的同心椭圆干涉环；点阵压缩为窄垂直狭缝，指针只产生局部径向扰动；以更密、更细、低透明度的右向波前线表达穿过狭缝后的衍射；文字折射遮罩同时收窄，避免多字大面积撕裂。
- **验收**：focused 20/20、Web 159/159、typecheck、production build 通过；隔离 production 端口 3044 与线上 Playwright 1440/1920/390 normal/reduced/Open RO 截图门禁通过，截图中已无白色同心圆或大面积粒子团；线上 `/`、`/explore` 为 200，未登录 `/auth/me` 为 401。
- **生产发布**：部署前 `BACKUP_OK size=276K files=7/7`；release `b45e002` 已从隔离 worktree 同步，远端全量 build、生产栈重启、容器健康检查与 Nginx `-t` 全部通过；临时配置链接发布后已移除。
- **下一步**：以 `b45e002` 作为新的 Landing 纠偏基线，等待人工审美复核后再进行下一轮局部光学细化；不得恢复已否决的 `3336be4` 大椭圆方案。

## 2026-08-11（Landing 增量优化）— ✅ 已实现并部署

- **实现**：在 `codex/optical-editorial-v3` 完成 Hero 单轴排版、Science/evolves 光学交互、固定狭缝衍射/半色调粒子场、Open RO 六层第二屏；保留现有入口、API、Hermes、RO 与上传/认证流程。
- **视觉收口**：粒子核心改为以狭缝为中心、指针轻微牵引的纵向椭圆场；文字滤镜保留可读底层并限制叠影，桌面/移动/减少动效均通过截图门禁。
- **工程门禁**：Web 157/157 tests、typecheck、production build、root lint、docs:lint、audit:docs-sync 全部通过；补齐 intentional html hydration delta 与视觉脚本 ESLint 合同。
- **部署**：部署前 `BACKUP_OK size=276K files=7/7`；release `99f1686` 已通过 ECS cloud-sync、远端全量 install/build、生产栈重启、nginx `-t`；线上 Chromium 1440/1920/390 normal/reduced/open-RO smoke 全部通过。
- **下一步**：继续按产品表面矩阵推进已有 Dashboard/Workspace/Public RO/Hermes 的细节优化；任何新范围先写 spec/plan 并同步 Task Master，不在本轮扩张后端或数据模型。

## 2026-08-11（Landing 增量优化实施计划）— 计划已写入，等待执行方式

- **计划产出**：`docs/superpowers/plans/2026-08-11-landing-incremental-optimization-plan.md`，共 6 个可验收任务：契约测试、Hero 排版与入口层级、双层光学粒子场、Open RO 第二屏、全量本地产品门禁、ECS 部署验收。
- **事实边界**：执行目标分支为 `codex/optical-editorial-v3`；直接复用现有 `OpticalHeadline`、`OpticalField`、Open RO、Playwright release gate 和 ECS 脚本，不修改后端、Schema、上传、认证或 Hermes 运行时。
- **下一步**：用户选择执行方式后，在隔离 worktree 中按 TDD 执行；每个任务独立提交，生产写入前运行 checkup 和远程数据库备份。

## 2026-08-11（首页增量优化设计门禁）— 已确认范围，等待用户审阅书面设计

- **用户纠正**：线上已有登录、Explore、Dashboard、创建、编辑器、公开 RO、版本、协作和 Hermes 相关流程；本轮目标是优化当前布局与交互，不重新探索或重构系统功能。
- **线上核验**：服务器路由 `/`、`/login`、`/explore`、`/dashboard`、`/research-objects/new`、`/research-objects` 均返回 200；生产 Web/API/Worker/Postgres/Redis/对象存储/病毒扫描容器均运行中。
- **设计更新**：`docs/specs/2026-08-10-optical-editorial-rebaseline-design.md` 新增“本轮增量优化边界”，明确保留现有风格、素材、API、数据模型和流程；首页入口为 Explore 主、Create 次、Sign in 独立；移除虚构首页元数据；保留粒子光学交互；Hermes 全局可唤起、Live2D 只在面板内出现。
- **当前门禁**：设计文档已完成自检，等待用户书面审阅；未修改业务代码。
- **下一步**：用户审阅通过后，编写仅针对现有 Landing 的实施计划，先做真实服务器三视口验收，再把规则传播到已有页面。

## 2026-08-11（Optical Editorial v3 Task 9）— ✅ 15/15 收口

- **Hermes 正式 renderer**：将旧静态人像替换为原创 Optical Guide；单 SVG/CSS 实例按 `idle/guiding/scanning/suggesting/awaiting_approval/failed` 映射真实 ingestion 状态，加载后提供有阻尼的指针凝视、轨道/节点/扫描/故障反馈，审批与 reduced-motion 保持静止。
- **诚实标记**：移除会把 fallback 冒充运行时的 `data-live2d-instance`，改为 `data-hermes-renderer="original-vector"` + 单实例标记；未复制 Wanko、`.moc3`、Pixi 或 Cubism Core。
- **许可决策**：ADR-010 根据 2026-08-11 官方 Free Material Agreement 与原始 Wanko ReadMe，确认 agent 不得代运营主体作资格/接受声明；Wanko 保留可替换 adapter，但启用前必须记录运营主体、适用类别、当时有效许可接受、署名、用途和终止响应。
- **门禁**：Hermes 4/4 unit；六态 + loading/error + 1440/390 browser 2/2；Web 26 files / 155 tests；typecheck、production build；八表面三视口 + reduced-motion release matrix 27/27 全绿。Dashboard first-load JS 128 kB，无新增视觉依赖。
- **ECS 最终发布**：部署前巡检通过，数据库备份 `BACKUP_OK size=272K files=7/7`；`0c79aa2` 全量 workspace build 后重启 API/Web/agent-worker，Nginx 校验通过。远端 Hermes source SHA-256 与本地一致；API healthy、数据/对象/恶意软件服务 healthy、worker 关键错误 0。
- **生产浏览器**：Landing、Login、Explore、Collection、Public RO 均 200；生产 Dashboard 无用户数据夹具在 1440×900/390×844 均 200、overflow 0、browser errors 0，并确认原创 renderer、scanning、同一 deep link、单实例、指针响应及无伪 Live2D 标记。
- **Task Master**：Optical Editorial v3 15/15 done，无未登记产品任务；仅等待用户对已部署 Landing、Workspace/Public RO 与本轮 Dashboard 的最终审美接受。

## 2026-08-11（Task 15 Optical Editorial v3 生产验收）— ✅ ECS 已上线

- **备份与回滚**：部署前数据库备份 `BACKUP_OK size=232K files=7/7`；旧远端 OpticalField SHA-256 与 `53d5cbf` 一致，作为可重建 rollback ref。新远端 SHA-256 与本地 `f5bb6e7` 文件完全一致。
- **部署**：隔离 worktree 通过 `XGS_CONFIG_ROOT` 使用主配置，cloud-sync 排除 `.env`、`.git`、依赖、构建物、screenshots、Task Master 与 agent 状态；ECS 全量 install/build 后仅重启 api/web/agent-worker，Nginx `-t` 通过。
- **服务**：API healthy；PostgreSQL、Redis、SeaweedFS 4.41、ClamAV healthy；Web/agent-worker running；worker 最近 15 分钟 fatal/uncaught/module/connection-refused 计数 0。
- **真实账号旅程**：登录→科研工作台→7 个 authenticated RO surface 均 HTTP 200；Markdown + 有效 PNG + CSV 真实上传后 3/3 进入 `needs_review`；Hermes 六字段页可编辑并确认生成新版本；Versions 与 Publish ready 页均 200。为避免污染公开索引，没有公开发布合成验收对象。
- **公开旅程**：Landing、Explore、Ultrafast Science Collection、`OSR-DEMO-000001` 均 200；1440/390 production Chromium 验收无横向溢出、无 console/page error，Optical Field 单实例且 Open RO 六层完整。
- **安全**：测试账号凭据只作为一次性进程环境注入，不写仓库、文档或截图；验收输出不包含邮箱、密码、session、RO ID 或 task ID。`.env` 未读取/打印。
- **基础设施偏差**：现有 compose 使用 pinned base/worker image + bind-mounted application build，并非每个 release 独立 Web/API image；本轮以 Git ref + 源文件哈希作为可验证回滚锚点。后续基础设施计划应单独迁移 immutable application images，不把该架构债务伪装成已完成。
- **下一步**：回到唯一未闭环的 Task Master Task 9，处理 Hermes Live2D 许可/资产门禁；若无法合法部署 Wanko runtime，保持静态 Hermes fallback 并明确产品级替代方案。

## 2026-08-10（Task 14 产品发布质量门禁）— ✅ 27 个生产浏览器案例通过

- **统一 manifest**：八个 canonical surface 均覆盖 1440×900、1920×1080、390×844；Landing 另覆盖三个 reduced-motion 案例，共 27 个，不再依赖四份各自为政的截图脚本作为发布判断。
- **确定性**：production build 下等待 network idle 与 `document.fonts.ready`，固定 Optical Field 测试时钟、稳定 demo IDs，并在截图前暂停 CSS/Web Animations；普通 PR 不自动接受或更新视觉基线。
- **功能门禁**：每案检查单一 `main`/`h1`、零横向溢出、表单可访问名称、skip-link/键盘焦点、零 console/page error，以及 LCP `≤4000ms`、资源传输 `≤3.5MB`、DOM `≤1800`。
- **浏览器证据**：27/27 Playwright 通过；人工复核 Landing、Auth、Dashboard、Workspace、Public RO、Explore/Intake/Collection 的桌面与移动截图，未见旧 AI 卡片墙、测试焦点残留或表面风格断裂。
- **全仓门禁**：单测通过（Web 154/154；其余 workspace 全绿）、typecheck、build、lint、`DOCS_SYNC_OK`、syncpack 通过。Knip 仍报告 8 个旧未用文件/旧导出，dependency-cruiser 仍报告旧 hero generator 的 dev-dependency 边界，jscpd 记录既有 6.20% token 重复；本任务未新增这些债务，也未删除用户文件。
- **CI**：安装 Chromium，运行 `test:release`，无论成功失败均上传 14 天 visual report、screenshots 与 traces。
- **下一步**：Task 15 只通过项目 SSH/deploy 脚本同步到 ECS，记录 rollback tag，执行真实注册/登录→Dashboard→Intake→Hermes→Workspace→版本/发布→Public/Explore/Collection 全旅程。

## 2026-08-10（Task 13 Figma canonical）— ✅ 长期账号验收完成

- **所有权**：用户手工复制的 `gjhowMG7cG4clKwvhvF08E` 已由长期项目账号持有；`figma-primary` OAuth、Full seat、文件读写和回读审计均通过。旧 `rWS3…` 文件降级为历史迁移来源。
- **V3 foundations**：建立四个独立 collection，共 44 个与 `apps/web/app/tokens.css` 对应的 Web-scoped variables；另有 9 个 text styles、3 个 effect styles。审计结果为 `ALL_SCOPES=0`、缺失 Web syntax `=0`。
- **真实映射**：建立 StatusBadge、Dropzone、ProgressRail、EvidenceCard 四个 component set；只登记真实 React 路径和可表达 variant，不伪造浏览器原生 input、next-intl、回调、计算进度或 Canvas Optical Field 的 Code Connect 能力。
- **八表面**：Landing、Workspace、Public、Auth、Dashboard、Intake、Explore、Collection 均有 route/shell/anatomy/state 结构帧；Collection 明确包含 SDF metadata 与图片/视频媒体。
- **历史说明**：本日志 2026-08-08 对复制文件“仅有空 Cover”的记录是当时快照，现已由本条 canonical 写入与回读证据取代。
- **下一步**：执行 Task 14，将确定性三视口截图、reduced-motion、键盘/焦点、性能预算和人工审美审查安装为发布门禁。

## 2026-08-10（Task 12 产品表面矩阵与完整工作区路由）— ✅ ECS 上线

- **矩阵先行**：新增 `apps/web/lib/product-surfaces.ts` 与 `apps/web/test/product-surface-matrix.test.ts`，锁定 Overview、SDF、Files、Versions、Collaboration、Publish、Sandbox、Settings 八个产品表面，以及 loading/empty/error/forbidden/ready、移动等价和风险等级声明。
- **真实路由**：新增 `/research-objects/[id]/{overview,files,versions,publish,sandbox}` 与 `/settings`；Publish 使用真实版本列表、三类许可、同步发布审核、版本状态机和 Radix R3 确认；Files 使用真实 Artifact 上传并通过 commit 绑定版本；Sandbox 使用真实 server job + 输出下载/脚本修改链；Settings 使用 `/auth/me` 与真实 logout。
- **统一导航**：新增 `ResearchWorkspaceNav`、`ResearchSurfaceShell`；编辑器移除 Overview/Publish 禁用占位，协作页和 Sandbox 结果面板接入 Optical Editorial 规则线表面；中英文案对称。
- **门禁**：Web 全量测试 150/150、Next production build、typecheck、i18n JSON 与 product matrix 全绿；尚未部署本批 web 代码。
- **生产结论**：`c05145b`、`ab90a9d`、`c30848b`、`7f7121e` 依次上线；真实账号 Dashboard → 七个 RO 表面 + Settings 全部 HTTP 200。390px 全表面统一导航/overflow/console gate 通过；Collaboration 追加 1440px 复验同样为 200、overflow=0、console error=0。
- **下一步**：Task 13 验证长期 Figma owner/canonical，在不覆盖浏览器真实 Optical Field 的前提下建立 tokens/components/screens 映射；随后 Task 14 固化视觉、无障碍、性能发布门禁。

### ECS 登录入口阻断与修复

- `c05145b` 已在 ECS 全量构建并切换，公开 Landing/Explore/Settings/Collection 均可由 Chromium 读取且 390px 无横向溢出；生产 route manifest 包含五个新 RO 路由和 Settings。
- 登录浏览器验收发现 `/auth/login` 被旧 Nginx `^/(auth|...)` API 兼容正则转发到 Fastify，返回 404；根因不是 React 页面或账号，而是 Web/API 同路径冲突。
- 已以 TDD 增加精确 `/auth/login`、`/auth/register` → Next 路由，保留其他 `/auth/*` → Fastify；Nginx/deploy Node tests 5/5。待提交并重新部署后继续真实登录态七个 RO 表面验收。

### ECS 版本列表合同阻断与修复

- Nginx 修复上线后，真实测试账号可登录 Dashboard；Files、Collaboration、Sandbox、Settings 进入成功且 390px 无溢出。
- Overview、Versions、Publish 的共同依赖 `GET /research-objects/:id/versions` 返回 404。审计确认 Web client 早已声明 `listVersions()`，但 Fastify 与 domain 从未实现该读接口；旧编辑器在 RO 已加载后仅显示局部错误，因此历史门禁漏报。
- 已按成员权限先行、私有对象不泄露、`versionNo desc` 最小摘要合同补齐 domain/API，新增 domain 单测与 API 集成断言；focused domain 10/10、Domain/API typecheck 通过。待全量门禁、提交和 ECS 重部署。

### ECS 七表面验收与 Collaboration i18n 收口

- `c30848b` 已完成 ECS 全量构建和应用切换；真实账号下 Overview/Edit/Files/Versions/Publish/Sandbox/Settings 均 HTTP 200、统一导航存在、390px overflow=0、console error=0；无版本对象正确进入 empty state。
- Collaboration 功能与布局正常，但浏览器捕获 10 条 `MISSING_MESSAGE`：旧消息把 `issue.kind.question` 等 next-intl 路径写成 JSON 扁平 dotted key。已把 issue/pr/review/notification 结构改为嵌套键，标签冲突改为 `kindLabel`/`verdictLabel`，并新增全消息树禁止 literal dotted key 门禁。
- focused i18n/collab 9/9、Web typecheck/build 通过；待提交、部署后复验 Collaboration console error=0，随后关闭 Task 12。

## 2026-08-10（Task 11 Editorial Curator）— ✅ ECS 全流程上线

- **数据合同**：migration 26 新增 `editorial_collections` 与 `editorial_selections`；精选固定 `researchObjectId + versionId`，保存 title/publicId/versionNo/SDF 快照，媒体必须提供 HTTPS URL、alt、credit、licenseId、sourceUrl。published selection 不可编辑，源 RO/version 仍须 public/published 才公开显示。
- **状态机与权限**：`draft → internal_review → scheduled → published`，平台管理员独占策展写入；普通用户/普通 moderator 不能访问候选或队列。公开文案明确“Editorial selection, not peer-review acceptance”。
- **接口与页面**：匿名 `GET /editorial/collections/:slug`；管理员候选、队列、创建、编辑、状态推进 API；公开 `/collections/[slug]` 纸面期刊页；`/editorial/curator` 管理工作台可选已发布版本、录入编辑说明与媒体 provenance、推进全流程。管理请求走 Nginx Basic Auth `/admin/editorial/*`，再叠加应用 `platform_admin` 与 CSRF。
- **门禁**：全仓 test 通过（Web 147/147；新增 domain 4/4、API route 3/3）；root typecheck/build、Prisma validate（dummy non-secret URL）、Next production build、lint、docs:lint 0、docs-sync、Nginx/deploy/seed Node tests 8/8、敏感差异扫描全部通过。
- **生产闭环**：backup 208K（7/7）、migration 26、服务器全量 build、应用/Nginx 切换完成；测试账号升级为 `platform_admin`，真实 demo v1 依次推进四态至 `published`，DB 为 1 条 published selection / 4 条 editorial audit。
- **HTTPS/browser gate**：公开 collection API 200；`/collections/ultrafast-science` 桌面/390px 均 200、1 个 exact-version link、非同行评审声明与中文描述可见、overflow=0、console errors=0；`/editorial/curator` 与 `/admin/editorial/*` 未认证均 401。
- **下一步**：Task 12 先建立真实 route/state matrix，再统一 Collaboration、Versions、Publish、Sandbox 与 Settings 等剩余产品面；Task 9 Live2D 许可门禁独立保留。

### ECS SSR transport follow-up

- migration 26、完整服务器 build、应用切换与一条真实 `published` 精选均成功；内部 Fastify collection API 返回 200。
- 生产浏览器发现 collection 页面落入 unavailable：Web 容器未配置 `API_ORIGIN`，Next server request 默认访问容器自身 `127.0.0.1:3001` 并得到 `ECONNREFUSED`。这也影响既有 Public RO 的 server rendering，不能作为 Task 11 特例绕过。
- Compose 现显式设置 Web `API_ORIGIN=http://api:3001` 并等待 API healthy；重部署后 Web 容器到 API 200，公开 Collection 与既有 Public RO 的 SSR transport 已恢复。

## 2026-08-10（Task 10 Explore 与启动语料）— ✅ ECS 已上线并完成 live 验收

- **现场证据**：18 条启动语料 confirmed seed，replay `created=0 existing=18`；部署脚本补齐 bind-mounted `api web agent-worker` 应用重启（数据服务未重启）。
- **Live gate**：ECS API `/explore?limit=50` HTTP 200 / 18 items，`field=method` HTTP 200 / 18 items；Web `/explore` 与 `/research/OSR-DEMO-000001` HTTP 200；PostgreSQL demo RO=18、provenance Artifact=6。
- **浏览器证据**：生产 HTTPS Chromium 1440/390 均 HTTP 200、18 个真实研究链接、scroll overflow=0、console errors=0；截图 `apps/web/test/visual/out/explore-live-{desktop,mobile}.png`（ignored）。
- **门禁**：deploy contract 2/2、docs:lint 0、audit:docs-sync `DOCS_SYNC_OK`、shell syntax、git diff --check 通过。
- **下一步**：进入 Task 11 Ultrafast Science Collection / scoped Editorial Curator；Task 9 Live2D 许可门禁独立保留。

## 2026-08-10（Task 10 ECS seed 入口修复）— ⏳ POSIX 主入口已修，待重同步

- **现场证据**：Compose 服务切换已成功；首次服务器 dry-run 命令退出 0 但无输出。直接容器检查确认 `scripts/seed-demo-research.mjs` 已同步，Linux 路径下手写 `file:///` 比较导致 `main()` 未执行，数据库仍未写入。
- **根因与修复**：改用 Node `pathToFileURL(process.argv[1]).href`，并新增跨平台入口回归测试；本地 Node tests 需重新通过后再同步。
- **下一步**：同步此修复，重跑服务器 dry-run → `--confirm` → replay，并查询公开 index/RO 数量。

## 2026-08-10（Task 10 ECS seed runtime 修复）— ⏳ workspace package 入口已修，待重同步

- **现场证据**：服务器 dry-run 已输出 18 条；`--confirm` 在动态导入阶段因根脚本无法解析 workspace alias `@openscience/storage` 退出，发生在 catalog/对象存储/数据库写入之前。
- **根因与修复**：seeder 改用仓库内 `../packages/storage/dist/index.js` 运行时入口，并扩展跨平台/运行时入口测试。
- **下一步**：同步后重跑确认写入、replay 与 live public index。

## 2026-08-10（Optical Editorial v3 Task 9 检查点）— ⏳ Dashboard 完成，Live2D 许可门禁待确认

- **真实任务契约**：修正 Dashboard 把 `AgentTask.id` 传给只接受 `IngestionTask.id` 的 Hermes 页面这一阻断；新增登录态 `GET /ingestion?actionable=true`，领域层只查询 caller-owned batch，返回真实 task/RO/title/logicalPath/state，外部用户结果为空。无需数据库迁移。
- **Optical Editorial Dashboard**：统计 Hero、圆角 Card 网格和状态 pill 已退役；现在以单一 Continue Research、规则线 RO 索引、Evidence Intake 双入口、Hermes portrait/queue 构成。Visual 与 task row 共用同一个 `/research-objects/:ro/hermes?task=:ingestionTaskId`。
- **Hermes 六态**：`idle/guiding/scanning/suggesting/awaiting_approval/failed` 从真实 ingestion state 推导；审批态静止，reduced-motion/失败保留静态矢量回退，移动 390px 无横向溢出。截图审查后移除浏览器默认列表标记，避免 `1. 01` 重复。
- **许可门禁**：候选 Wanko 随附声明允许一般用户/小规模事业者接受 Live2D 免费素材协议后商用，中大型主体仅限非公开测试。主体资格和协议接受尚未形成项目决策，因此本检查点未复制/部署模型二进制，也未把静态 fallback 声称为真实 Live2D。
- **证据**：Domain ingestion focused 35/35；Web 22 files / 144 tests；Dashboard/Auth Playwright 7/7；Web/Domain/API typecheck 与 Next production build通过；1440/390 approval screenshot、one-mount、same-link、approval-still、no-card 与 overflow 门禁通过。开发 E2E 仍输出既有 `collab` dotted-key warning，留在 Task 12 统一修复。
- **下一步**：完成 Live2D 许可决策与 LCP 后单实例运行时，补 empty/loading/error/active 状态截图后关闭 Task 9；不影响先行执行依赖已满足的 Task 10 Explore/启动语料。

## 2026-08-10（Optical Editorial v3 Task 8）— ✅ Mixed-Material Evidence Intake 完成

- **占位流程退役**：`/research-objects/new` 不再使用“创建 RO → 分文件 Artifact upload → 立即 commit”的旧双 Card 流程；新页面以黑纸、规则线、朱红动作构成 Research Identity + Evidence Intake 编辑面，blank 与 import 两条真实路径继续等权可达。
- **本地编排与格式**：文件在用户明确提交前只存在浏览器内存；支持 PDF/Word/TeX-ZIP/Markdown/常见图片、CSV/TSV、JSON/YAML、Notebook、Python/R。材料可标记 manuscript/figure/data/code/supplement，并可选择零个或一个主文稿；数据/代码仍按 UTF-8/NUL/MZ/MIME/ClamAV 安全边界处理，不执行上传代码。
- **真实异步状态**：新增受 CSRF 保护的 multipart ingest client、batch polling 与 task retry；上传进度取自 XHR bytes，后续状态只映射 API 的 queued/stored/parsing/needs_review/confirmed/written/failed 状态，不用定时器伪造进度。`needs_review` 直接链接同一 RO/task 的 Hermes，checkpoint 可在刷新后恢复已上传批次。
- **失败恢复**：恶意/格式/超限错误进入 `failed_blocked` 且不显示错误重试；worker retryable task 调真实 retry endpoint；网络上传失败复用已创建 RO，避免重复对象。
- **视觉审查**：Chromium 1440 与 390px 实际材料队列截图完成；390px `scrollWidth=innerWidth=390`，移除浏览器默认白色按钮底并将非文稿的禁用主稿单选替换为“支持证据”文本。3019 已切换至最新 production build，HTTP 200。
- **门禁**：TDD RED 已分别证实缺格式、缺 intake model、缺 poll/retry；全 Web 141/141、全 Domain 321/321、Playwright 6/6、Web/Domain typecheck、Next production build 与 `git diff --check` 通过。上传安全自审确认 API 层成员权限、CSRF、显式 consent、100/250MB 限制、MIME/签名/ClamAV 与日志无原始文件内容边界均沿用。
- **下一步**：Task Master `optical-editorial-v3` Task 9 已启动；重构 Dashboard 为 Continue Research + actionable confirmations，并让 Hermes visual/task 共享真实 deep link 与六态。

## 2026-08-10（Optical Editorial v3 Task 4 + Task 7）— ✅ Landing 封版与 Research Identity 完成

- **Landing 交互抛光**：用户确认交互基本可用后，将 pointer optical tracking time constant 收紧为 58ms；保留 `80c8312` 非对称主构图、Bodoni glyph safe zone、固定狭缝衍射、N1–N6 `OPEN RO.` 第二屏和 reduced-motion 降级，不恢复 v3 禁用的 RO loop/轨道/视频/卡片段。
- **Research Identity**：注册/登录页改为 `IdentityShell` 两平面、规则线与 Editorial Serif 构图；保留 `request-signup-code`、`confirm-signup`、login/cookie 与 Create-intent `returnTo`，验证码阶段自动聚焦，503 后错误可读且可重试；新增文案全部进入 en/zh 对称目录。
- **安全修复**：`safeReturnTo` 以受信 origin 解析并拒绝反斜杠、ASCII 控制字符、跨 origin 与 auth-loop；回归覆盖 `/\\attacker.example` 与 NUL 变体。
- **证据**：focused 27/27；全 Web 135/135；stubbed Playwright 5/5；compiled Next + real Fastify signup 1/1；typecheck/build、桌面/移动无横向溢出、`git diff --check` 通过；独立复审最终 APPROVE。3019 已切换至最新 production build，HTTP 200。
- **已知非阻断债务**：next-intl 在开发/E2E 日志仍报告旧 `collab` dotted keys；不影响本轮认证成功，但必须在 Task 12 统一修复。
- **下一步**：执行 Task 8 Mixed-Material Evidence Intake，使用真实 ingest/batch/task/retry/confirm 契约，不再沿用“创建 RO 后只上传并 commit”的占位流程。

## 2026-08-10（Optical Editorial v3 Task 4 三项视觉纠偏）— ⏳ 3019 等待用户验收

- **原型定位**：用户所指“文字穿过狭缝的衍射”已确认对应 `docs/user_ideas/8.10/ChatGPT Image 2026年8月10日 01_30_19 (1).png`。此前实现只有 pointer-local turbulence displacement 与点阵圆场，没有狭缝、衍射扇面或干涉波前；不得再把“局部扭曲”描述成“狭缝衍射”。
- **根因与修复**：`OpticalHeadline` 的 `.78` 行高没有为 Bodoni 斜体下伸部保留字形安全区，且 Hero `overflow-hidden` 会在不同栅格化环境裁切下缘；现为 `evolves.` 增加显式 glyph safe zone 并调整行高。`OpticalField` 原先直接绑定原始 pointer 坐标；现采用 frame-time target/current 指数插值，并在两词交界建立固定孔径、对称衍射射线与波前。
- **Open RO 第二屏**：`LatestResearch.tsx` 之前实际渲染三条产品原则，属于占位；现改为 paper surface `OPEN RO.` 构图、稳定 RO identity 说明、N1–N6 六层 SDF anatomy 和真实 `/explore` 入口，不虚构论文或公开数据。
- **TDD/浏览器证据**：新增四项断言先得到预期 RED（缺 `smoothOpticalPoint` / `sampleDiffractionWavefront` / glyph safe zone / Open RO），现 focused 15/15、全 Web 133/133；Web typecheck、production build、visual shots 通过。Chromium 1440 指针横移逐帧 `x=486.07 → 713.92 → 921.21 < target 1100.8`，字形 bottom 569.6 < Hero bottom 959.6，Open RO 节点 6；3019 HTTP 200。截图脚本输出目录改为相对脚本文件解析，避免从仓库根运行时误写根 `test/`。
- **独立复审纠偏**：reviewer 未发现实现层 Critical；指出固定 `16ms` 的浏览器逐帧门禁会在繁忙 CI 偶发没有新 rAF，以及 SiteHeader 索引过时。门禁现改为 `polling: 'raf'` 等待实际诊断坐标变化，并分离 `--os-optical-pointer-x`（target/current 插值层）与 `--os-optical-x`（含静止回归的显示层）；连续 3 轮完整 shots 均通过。SiteHeader 索引已同步。
- **任务状态**：Task Master `optical-editorial-v3` Task 4 仍为 `in-progress`，但已清除错误的 RO loop/chromatic/video 描述并登记本轮真实验收策略；用户确认实际观感前不提交、不标记 done。

## 2026-08-10（Optical Editorial v3 Task 4 二次重开）— ⏳ 回到用户确认的 pre-distortion 基线

- **用户纠正**：最近两次 Landing 修正均属倒退；正确参考点是文字动效修改前的版本，而不是更旧的六节点媒体原型，也不是三层标题叠加后的文字重影。
- **Git 证据**：`80c8312` 是文字动效提交 `ea882b9` 的直接前置版本；其 Landing 使用非对称大尺度排版 + Canvas Optical Field，没有 `ro-loop`/视频。`ea882b9` 复制三层完整 `<h1>` 叠加 SVG filter；`01966eb` 又恢复了 v3 明确禁用的旧六节点媒体与卡片模块。
- **当前修正**：仅恢复 `80c8312` 的 Landing 构图，不回滚已完成的 Workspace/Public RO；移除 Landing 上的旧媒体、Evolution/Hermes/Trust 卡片段和 chromatic 第三标题层，保留一个可访问 `<h1>` 与一个 `aria-hidden` 局部折射层。
- **视觉真源修复**：`OpenScience_Art_Direction_v3.md` 之前只存在于 handoff ZIP，活 spec 却指向不存在的普通文件；现已将原文落到登记路径，明确其覆盖 Masterplan v2 的旧视觉。
- **回归与预览**：Landing 测试先以“缺 v3 marker / 3 个 h1”得到预期 RED，现 focused 12/12、全 Web 130/130、typecheck、production build、Chromium 1440/1920/390 normal/reduced-motion 通过。`127.0.0.1:3019` 返回 HTTP 200 且含 v3 marker，等待用户视觉检查后再做精修与提交。
- **任务状态**：Task Master `optical-editorial-v3` Task 4 已重新置为 in-progress；不得在用户确认前再次标记 done。

## 2026-08-10（Optical Editorial v3 Task 4 回归）— ✅ 完整 Landing 原型与真实文字交互恢复

- **用户验收结论**：主屏 `Science evolves` 在当前主站没有交互，且原型页的核心视觉和后续叙事模块被替换成纯文字页面；此前“交互已完成”的表述混淆了隔离工作树代码状态与已部署状态。
- **根因证据**：`80c8312` 将 Landing 整页重构并移除了 RO loop/ambient 视觉以及 Evolution/Hermes/Trust 三个模块；`ea882b9` 的文字局部折射只存在于未部署工作树。Task Master `optical-editorial-v3` Task 4 已从 done 重新置为 in-progress。
- **纠正结果**：恢复用户认可的 RO loop/ambient 主视觉、移动 poster 与 Evolution/Hermes/Trust 完整叙事；SVG/Canvas pointer-local 交互只叠加到原 `Science evolves` 可访问 DOM 标题，不再以纯文字媒介替换整页。补齐 base-layer lens mask，桌面 160–200px、移动 105–120px，运行时位移严格保持 8–14px。
- **真实运行时根因**：本工作树遗留 `next dev -p 3010` 与生产构建共用 `.next`，把生产 manifest 改回开发态，导致浏览器 `main-app.js` 404、客户端完全未 hydration；已停止该明确冲突进程并用干净生产 build/start 验证。
- **审查修复**：Evolution reduced-motion 初始即静止，且运行中切换到 reduced-motion 会立即取消已有定时器；loop video 仅桌面非 reduced-motion 挂载，移动/reduced-motion 不发起视频请求；Task Master 已改为“保留完整原型”；视觉脚本直接断言 pointer 局部坐标、SVG scale、视频请求策略、初始/运行时 reduced-motion 静止、overflow/console 与下半页三个模块。
- **门禁**：聚焦 14/14、全 Web 130/130、typecheck、production build 与 `shots` 通过；1440/1920/390 normal/reduced-motion、1440/390 full-page 浏览器证据位于忽略目录 `apps/web/test/visual/out/`。独立 reviewer 最终 APPROVE，无 Critical/Important；Task Master `optical-editorial-v3` Task 4 已重新置为 done。
- **下一步**：继续 Task 7 Auth Research Identity；部署仍需按服务器操作流程单独执行，当前修复尚未声称已进入 ECS。

## 2026-08-10（Optical Editorial v3 Task 5）— ✅ RO Workspace 三稳定工作面完成

- **独立产品层级**：Workspace 由 56px Global Nav、64px Object Header、44px Mode Tabs 与 19/56/25 三工作面组成；对象标题、RO ID、版本、可见性、保存状态和提交动作不再挤入全局导航。Overview/Publish 尚无真实 surface，已明确渲染为 `aria-disabled`，不伪装成链接。
- **研究编辑结构**：六个 SDF 节点以 01–06 编号，只有当前节点使用朱红；左栏保留大纲/版本，中央保留 SDF 编辑和 Artifact 上传，右栏采用带来源、范围、Before/After 与审批动作的 Hermes proposal，并用可折叠 EvidenceSnippet 保留证据位置。
- **证据真实性**：当前 `sdf.extract` 接收的是 SDF 聚合文本，因此建议明确标记“当前 SDF 聚合内容”；只有调用方实际提供 artifact/page/span locator 时才展示素材定位，不根据附件数量猜测 provenance。演示建议已从产品运行时移除。
- **高影响审查**：Results/Reproducibility 建议进入 Radix 全屏审查；浏览器实测 Shift+Tab 不逃逸、Escape 关闭、焦点回到触发按钮。保存错误与其他加载/提取错误分离，不再错误污染 save state。
- **移动功能等价**：三个工作面保持单实例挂载，以底部三模式切换显隐；390/320px 实测跨面编辑状态不丢、提交说明可用、无横向溢出。对象标题/版本/保存状态在窄屏仍保留紧凑上下文。
- **模式导航纠偏**：Data/Versions 不再依赖隐藏面板的 URL 锚点；按钮先切换到中央/左侧工作面，再滚动到 Artifacts/Versions，移动端真实门禁覆盖该路径。
- **i18n 与视觉**：可见性、保存、版本、Artifact、Hermes/SDF 标签与 Workspace modes 全部中英文对称；规则线、字体层级和朱红动作替代 Card/pill 墙。
- **门禁**：Web 18 files / 121 tests、typecheck、production build、focused ESLint、`git diff --check` 全通过；`shots:workspace` 通过 1440×900、390×844、320×720，含移动 Outline/Evidence 分面、状态保持、console 与 focus 门禁；独立 reviewer 最终 APPROVE。
- **下一步**：执行 Task Master `optical-editorial-v3` Task 6，重构 Public RO 为 760px 可引用纸面阅读列 + 280px metadata rail，并完成 print/citation/provenance 浏览器验收。

## 2026-08-10（Optical Editorial v3 Task 4）— ✅ Landing 品牌媒介完成

- **真实 DOM 品牌记忆**：Landing 已替换为非对称 `Science evolves.` / `科学，持续演化。` 排版；可访问标题不依赖 Canvas，朱红只保留在句点与主动作，Create/Explore/Login 均指向真实路由。
- **局部 Optical Field**：Canvas 仅承担 `aria-hidden` 的半色调证据粒子与指针局部扰动；作用半径 160–200px、位移 8–14px、500ms 回弹，移动端密度 32%。按住时短暂出现无文字的 SDF 证据线层；坐标以标题容器计算，尺寸由 ResizeObserver 缓存，IntersectionObserver 在离屏时暂停 RAF。
- **真实 Explore**：新增 `/explore` 公开索引入口，以明确空状态等待 Task 10 启动语料；Landing 不再把产品原则伪装成“最新研究”，也移除了 `OS / 00—∞`、`RO / SDF / v∞` 等无意义 HUD。
- **浏览器审美验收**：已抓取 1440×900、1920×1080、390×844 的 normal/reduced-motion 证据。正常 A/B 指针状态哈希不同；reduced-motion A/B 哈希一致。额外验证英文 320px `scrollWidth=clientWidth=320`、标题可选择、只有一个 main、Canvas 对辅助技术隐藏且浏览器 console 无错误；按住与 650ms 回弹画面哈希不同。
- **环境纠偏**：发现 3002 被旧版服务占用并返回旧 Landing，未把旧截图误判为新版结果；改用干净 3012 端口重跑生产构建。视觉脚本现支持 `VISUAL_BASE_URL`，避免后续端口污染。
- **审查修正**：独立 reviewer 两轮指出并验证了回弹、离屏 RAF、320px 英文、真实 Explore、朱红层级等问题；末轮补齐 reduced-motion 的静态 click/hold 与 pointercancel/blur 释放，并让导航显式支持 dark/paper tone。
- **可访问性实测**：reduced-motion 初始帧与按住帧哈希不同，pointercancel 后精确恢复初始哈希；Explore 纸面导航实测 Explore/Create 5.34:1、Login 15.07:1，达到 WCAG AA。
- **门禁**：Landing/Optical/i18n focused 12/12、全 Web 116/116、typecheck、Next production build 通过；视觉证据位于 `apps/web/test/visual/out/`（忽略目录，不入 Git）。
- **下一步**：执行 Task Master `optical-editorial-v3` Task 5，重构 RO Workspace 为 19/56/25 三稳定工作平面，并用真实测试 RO 做桌面/移动浏览器验收。

## 2026-08-10（Optical Editorial v3 Task 3）— ✅ 品牌与产品 Shell 完成

- **品牌原语**：新增纯文字 `OpenScience.` wordmark，朱红句点独立可测；compact 变体为 `O.`。favicon 已从旧青色波形替换为黑/纸白/朱红的几何 `O.`，未引入图片 logo。
- **四类 surface shell**：Public、Identity、Dashboard、Workspace 均只有一个 focusable `#main-content`，提供可见 skip link；Workspace 固定 19/56/25 三平面，移动端自然串联。所有结构使用背景色阶与规则线，不依赖 Card 或 glass/backdrop blur。
- **交互与 i18n**：Shell 导航动作统一 8px 半径、active 位移和 reduced-motion 取消位移；新增中英文对称的 skip/navigation 文案键。
- **TDD/门禁**：缺失组件 RED；动作反馈补测再次 RED；最终 focused 9/9、全 Web 108/108、typecheck、Next production build 通过。
- **下一步**：执行 Task Master `optical-editorial-v3` Task 4，替换 Landing 为真实 DOM 中英混排 + pointer-local Canvas Optical Field，并在 1440×900/390×844 浏览器截图中做首轮审美裁决。

## 2026-08-10（Optical Editorial v3 Task 2）— ✅ 视觉地基完成

- **官方取证与 ADR**：MDN `feDisplacementMap`、`requestAnimationFrame`、`prefers-reduced-motion` 以及 Google Fonts 官方 OFL 记录均直达返回 200；内置 search 端点 404 后降级为官方 URL 直连。新增 `ADR-009`（原计划 ADR-005 已被邮箱验证码注册占用），决定不新增视觉运行时依赖，使用 Canvas 2D + SVG/CSS，静态 poster 与 reduced-motion 保底。
- **字体系统**：`next/font` 接入 Bricolage Grotesque（展示）、Bodoni Moda（编辑衬线）、Noto Serif SC（中文）、IBM Plex Mono（数据）；生产构建自有源分发，无浏览器第三方字体请求。
- **视觉 token**：落地 `--os-black-*`、paper/ink/vermilion/confirmed、规则线、0/4/8px 半径、语义 motion 与字体角色；旧组件所需 token 只保留为 canonical token alias。旧蓝色/深蓝驾驶舱 token 已从 `tokens.css` 清除。
- **TDD 与回归**：初始聚焦测试得到 14 个预期 RED；review 修复补测后聚焦 24/24、全 Web 99/99。旧 ingestion AA 测试补充 CSS alias 递归解析，并据真实 2.85:1 证据把双表面 focus ring 调为中性灰，黑/纸均达到非文本 3:1；朱红主按钮改用黑字。
- **构建门禁**：Web typecheck 与 Next production build 已通过；Bodoni fallback metric warning 已通过显式关闭不可靠自动 override 消除。
- **下一步**：执行 Task Master `optical-editorial-v3` Task 3，建立无卡片墙的 Wordmark 与 Public/Identity/Dashboard/Workspace 四类共享 shell；继续 RED → GREEN → browser → docs-sync。

## 2026-08-10（Hermes review/confirm 与计费流水）— ⏳ 本地门禁通过，待服务器发布验收

- **Review/confirm**：新增 `GET /ingestion/tasks/:taskId` 返回脱敏建议、任务状态和 RO 版本；新增 `POST /ingestion/:taskId/confirm`，校验 SDF core + 乐观锁后写入 SDF、推进 `needs_review → confirmed`。Web 新增 `/research-objects/[id]/hermes?task=...` 六字段确认界面，支持编辑建议后创建新版本。
- **计费**：AgentTask 成功状态与 `ai_credit` `consume` 流水放入同一事务，幂等键 `agent-task-consume:<taskId>`，每个成功 AI task 消耗 1 credit；重放不会重复扣费。domain agent focused 11/11。
- **备份**：`infra/scripts/backup.sh` 新增 `--objects`，对 SeaweedFS Docker volume 创建非破坏 tar 快照；runbook 已同步恢复说明。
- **门禁**：全量 test/build、docs:lint、audit:docs-sync 均通过。
- **下一步**：同步并部署 API/Web/domain 到 ECS，使用已存在 needs_review 任务做确认 API 真实验收；随后接入 AV quarantine 与本地 OCR/远端 fallback。

### 服务器验收与 OCR/AV 增量

- **生产已验收**：数据库备份 116K、SeaweedFS 对象卷快照 36K；confirm API 返回 200，任务 `needs_review → confirmed`，写入 7 个 SDF 字段；独立成功任务 smoke 为 `succeeded` 且仅 1 条 consume 流水。
- **本地 OCR**：worker 新增受控 Tesseract stdin adapter，支持 PNG/JPEG/WebP/TIFF，60 秒超时和 4 MiB 输出上限；agent-worker 24/24。专用镜像安装 `eng+chi_sim`，不依赖 MiniMax。
- **生产 AV**：新增私有 `clamav/clamav:stable` 服务与 clamd INSTREAM 客户端；Blob 在解析/OCR/AI 前扫描，命中或扫描器异常均以 `[blocked]` 进入 `failed_blocked`，不降级绕过。ClamAV 数据卷持久化且无宿主端口。
- **服务器验收**：专用 worker 镜像已构建并切换；Tesseract 5.3.0 可用，`eng/chi_sim/osd` 语言包存在；ClamAV healthy，EICAR 探针返回 `CLAMAV_EICAR_BLOCKED=true`。旧 worker 已安全替换，MiniMax 配置保持不变。
- **最终证据**：对象快照已在新隔离 volume `openscience-restore-1786305623` 解包，恢复卷包含 92 个文件；生产 SeaweedFS 卷未被修改。服务器内生成确定性 PNG 文字 fixture，真实生产 parser 返回 `OCR_TEXT_FIXTURE status=ready text_nonempty=true`；Tesseract OCR→文本闭环通过。

## 2026-08-10（生产 Token Plan 区域切换与结构化提取修复）— ✅ 真实 ingestion 闭环通过

- **区域根因已验证**：同一组 Token Plan Subscription Key 在国际入口 `api.minimax.io/anthropic` 均返回 401；按 MiniMax 国内官方 Quick Start 切换 `api.minimaxi.com/anthropic` 后，key1/key2 均返回 200 和非空文本。服务器 `.env.prod` 已保留可恢复备份并切换区域，worker 已重建。
- **实时证据**：worker 脱敏配置为 AI enabled、双 key、`auto`、`MiniMax-M3`；生产 provider probe 输出 `PROVIDER_PROBE_OK`，模型调用耗时约 1.2 秒。
- **正式重试**：登录后重新获取 CSRF cookie/token，`POST /ingestion/:taskId/retry` 返回 200，任务已进入 `parsing`；worker 已成功调用 MiniMax，但模型返回的 thinking/markdown 包裹导致原始 JSON.parse 校验失败。
- **代码修复（TDD）**：`AiGateway.completeStructured` 现在剥离 `<think>` 和 markdown JSON fence，并从附带说明中提取 JSON 对象后继续 SchemaGuard；新增回归测试，ai-gateway 11/11、全量 build 通过。
- **最终验收**：全量服务器 build 通过并重建 worker；登录后按真实 CSRF 流程执行正式 retry，HTTP 200，状态依次为 `failed_retryable → parsing → needs_review`。`needs_review` 是预期的人机确认状态，证明上传、SeaweedFS、Redis、worker、MiniMax、结构化 SchemaGuard 与状态映射端到端可用。
- **下一步**：进入下一生产切片：真实 OCR/AV quarantine、AgentTask `consume` 流水、对象存储非破坏备份/恢复演练；前端需要把 `needs_review` 建议展示与确认写入流程做成可操作界面。

## 2026-08-10（生产 ingestion 基础链路与 MiniMax Token Plan 根因）— ⏳ 协议红绿完成，待部署重试

- **生产证据**：当月授信批处理通过既有 domain 函数执行，`granted=2, skipped=0`；真实测试得到 CSRF=200、RO=201、ingest=202、Blob HEAD=present，worker 从队列进入 `failed_retryable`。一次性 session 已在 `finally` 销毁，测试 RO/Artifact 按不删除规则保留。
- **根因收敛**：worker 脱敏探针显示未注入 AI 配置；MiniMax 官方最新文档进一步证明 Token Plan Subscription Key 应走 Anthropic Messages Quick Start，且与普通 pay-as-you-go API Key 不可互换。既有 worker 固定 OpenAI `/chat/completions`，调用方式确实不完整。
- **TDD**：新增 Token Plan provider 测试先因 constructor 缺失失败；实现 `/anthropic/v1/messages`、`x-api-key`、system/text/usage 映射后 ai-gateway 10/10。worker 双 key 测试先因 `buildGateway` 缺失失败；实现自动协议识别与 key1→key2 回退后 1/1。
- **架构修复**：Provider `name` 与 `model` 分离；日志仅记录 `minimax-key-N-model-N` 槽位和模型元数据，不记录 key、prompt 或响应正文。ADR-008 记录 Token Plan 仅作受控内测、正式多用户生产应迁移 pay-as-you-go。
- **下一步**：全量门禁、提交、同步服务器；不读取/打印本机 `.env`，通过进程管道把 key1/key2 写入服务器 Secret，重建 worker，再对既有 `failed_retryable` 任务走正式 retry API 并验证 `needs_review/succeeded`。

## 2026-08-09（注册后 AI Credit 补齐）— ⏳ 本地红绿通过，待生产 E2E

- **生产阻断**：SeaweedFS 上线后，真实 ingestion 从原先的 500 存储错误推进到 409 `INSUFFICIENT_CREDIT`；根因是邮箱确认事务只创建 Personal Workspace，没有为当月新用户执行既有月度授信规则。
- **既有决策复用**：未新增额度常量；注册补发读取 `ai_credit` 生效 policy，保持“每月 +N、累积不清零”。默认 seed 当前为 500，但运营修改 policy 后注册流程会自动采用新值。
- **TDD 证据**：`workspace-personal.test.ts` 先以 `expected [] to have a length of 1` 失败；实现单用户当期 grant 后 5/5 通过，usage/workspace focused 合计 19/19。
- **幂等边界**：账本 key 为 `monthly-ai-credit:<userId>:<YYYY-MM>`；Personal Workspace 已存在时仍会补齐当月 grant，同月重复回调不会重复发放；无 policy 时不阻断注册。
- **未关闭债务**：AgentTask 当前只校验 AI Credit 余额，尚未按实际模型成本写 `consume` 流水；本轮只恢复新用户可用性，不将其表述为完整计费。
- **下一步**：全量门禁后部署 API/domain；通过同一领域函数为已授权测试账号幂等补发当期 grant，再跑 Markdown 上传→S3→Redis→worker→Blob/解析状态真实链路。

## 2026-08-09（生产对象存储根因与修复设计）— ⏳ compose 红绿完成

- **真实 E2E 根因**：一次性测试 session 按真实 `email_verified` 合同建立后，CSRF=200、创建 RO=201、ingest=500；脱敏探针确认 S3 配置 `0/7`、endpoint class=loopback、`StorageUnavailableError`。生产上传此前必然失败。
- **选型**：MinIO 社区仓库已归档且社区二进制停止维护，不作为新生产基线；ADR-007 选择持续维护、Apache-2.0 的 SeaweedFS 4.41 单节点 S3 模式，业务层继续复用 S3-compatible SDK。
- **TDD 证据**：`docker-compose.prod.test.mjs` 先因没有对象存储服务而红；新增仅 `data_net` 的 object-storage、`seaweed-data`、健康依赖和 API/worker S3 endpoint 后 1/1 通过。
- **安全边界**：无宿主端口；access/secret 仅服务器生成；测试账号密码未进入命令、脚本或日志；首次失败产生的测试 RO 保留并明确标记，未做未经批准的删除。
- **下一步**：同步服务器，备份 `.env.prod` 后生成缺失 S3 Secret，拉取并记录镜像 digest，验证 compose/health/put-head-get，再重跑真实 ingestion。
- **服务器准备证据**：`.env.prod` 可恢复备份存在，S3 必需字段 3/3（值未输出）；SeaweedFS 4.41 已拉取并固定 digest `sha256:43b768...d771d`，服务器 `docker compose config --quiet` 通过。

## 2026-08-09（生产 parser 闭环验收）— ⏳ 真实 fixture 本地门禁已通过

- **诊断边界**：生产容器与 worker 均保持运行；只读数据库/对象存储探针返回 `STORAGE_PROBE_NO_ARTIFACT`，说明当前生产库没有可用于 Blob head 验证的 Artifact，不能把它误判为存储故障。
- **TDD 证据**：新增 production parser self-test 前，focused test 因 `parser-self-test` 模块不存在而红；实现后使用无用户数据的真实 PDF/OOXML DOCX fixture，`ingestion-parser.test.ts` 7/7 通过。
- **实现**：`apps/agent-worker/src/parser-self-test.ts` 复用生产 `pdf-parse`/Mammoth composition，成功条件要求两种格式都提取到确定性正文；CLI 仅输出通过/失败标记，不输出文件正文、配置或 Secret。
- **下一步**：全量构建并同步到 ECS，在 worker 容器运行同一 self-test；随后用已授权测试账号保留一份明确标记的测试 RO/Artifact，验证上传→Redis→worker→Blob→解析状态闭环。

## 2026-08-09（服务器 ingestion worker 部署）— ✅ 干净 release 已切换

- **服务器巡检**：磁盘 9%、内存充足，现有 API/Web/PostgreSQL/Redis 健康；生产 compose 原先没有 `agent-worker`。
- **部署准备**：生产 compose 已增加不暴露端口的 `agent-worker`；部署脚本支持 worktree 源码与主工作区服务器配置分离，并修正生产迁移必须经 API 容器执行。
- **云上证据**：新依赖与 worker dist 已同步；当前生产迁移状态显示 26 个迁移中 3 个待应用（signup unique、ingestion idempotency、ingestion tasks）。迁移未执行，生产容器未切换。
- **阻断**：既有 tar-over-ssh 只覆盖不删除，服务器残留旧 `/login`、旧 create/dashboard 源码，导致云上 Next build 继续编译已不属于当前 release 的文件。继续添加兼容 alias 会污染当前架构。
- **部署结果**：旧 release 保留为 `/opt/openscience-backup-20260809-2218`；新 release 在 staging 完成 install、Prisma generate、全量 build 后切换。预迁移数据库备份已校验非空，3 个待迁移项成功应用，schema up to date。
- **运行验收**：API/Web/agent-worker 已重建；API compose health 为 healthy，公网首页 200、未登录 auth 401，本地 Web 200；worker 日志出现启动行，容器内 `createDefaultIngestionAdapters` 加载返回 `PARSER_RUNTIME_OK`。
- **规则固化**：AGENTS 新增 Deployment Acceptance Rule，本地仅做编写/门禁，服务器为部署功能最终验收场景。

## 2026-08-09（研究者导入闭环 Task 3 深度复审）— ⛔ 撤回完成状态，禁止部署

- **复审结论**：安全与架构独立审查均为 BLOCK；migration 25 和 ingestion 入口不得部署。现有 `sdf.extract` 仅接受 `manuscriptText`，而 ingestion 只提交 Artifact/RO ID，真实任务会必然失败。
- **安全阻断**：服务端实际 MIME/恶意内容仍未形成硬阻断；Viewer/Reviewer 与归档 Workspace 可写；上传在授权前整批缓冲且限流 bucket 使用实际 UUID 路径，存在内存 DoS 与绕过风险。
- **可靠性阻断**：AgentTask 创建、IngestionTask 关联和 Redis dispatch 非原子；并发 replay 可重复入队，worker 无原子 claim；Redis 失败可能留下永久 queued。integration teardown 还会无条件清空核心表，严禁连接生产库执行。
- **本轮已关闭**：上传/重试参数路由限流、重复文件名消歧、路径式文件名拒绝、浏览器 MIME 不再持久化；Hermes Session/Task 幂等重放重新绑定 user/session/kind/payload。TDD 红态证明跨会话/并发 P2002 可泄露错误任务/会话，修复后 agent+ingestion focused 23/23。
- **继续修正**：ingestion 写入现在复用明确角色门禁（Owner/Maintainer/Author/Contributor）与 active Workspace 检查；multipart 在授权后逐 chunk 限制 250 MB、并发门禁为 1；参数化 URL 使用模板 bucket；AgentTask 增加 `dispatched_at`，submit/replay/ingestion association/worker CAS claim 具备可恢复 dispatch 基础，retry dispatch 失败回滚为 `failed_retryable`。新增 focused domain 30/30、agent-worker 15/15。
- **内容边界**：新增服务端 PDF/Office/ZIP/图片签名、UTF-8/主动 SVG 文本校验，以及 EICAR/PE/明显归档路径穿越快速阻断；这不是完整 AV 扫描，quarantine + ClamAV 类引擎仍是生产门禁。
- **worker 桥接**：新增 Artifact→Blob→解析器路径；Markdown/TeX 进入 Hermes 正文提取，PDF/Office/图片在未挂载受控解析器时明确返回 `needs_review`，不再因 payload 只有 ID 而必然抛出“缺少正文”。
- **本轮门禁**：全仓 `test`、`build`、`lint`、`docs:lint`、`audit:docs-sync` 均通过；工作树干净。该证据仍不等同于生产 AV、二进制 parser 或隔离 PG/Redis/MinIO 验收。
- **失败分类**：永久阻断错误使用 `[blocked]` 标记并同步为 `failed_blocked`；该状态不会进入普通 retry 路径，新增 agent 状态机回归测试通过。
- **二进制 parser**：worker 已接入受控 `pdf-parse@2.4.5` 与 `mammoth@1.12.0` adapter；PDF/DOCX 解析失败或超过 20 MiB parser 输入上限时转为 `needs_review`，不让解析异常打崩消费循环。当前仍需真实 PDF/DOCX fixtures、图片 OCR 策略与生产 quarantine/AV。
- **方案决策**：ADR-006 明确 `any2pdf` 仅用于未来 Markdown→PDF 导出；ingestion 采用受控 PDF/DOCX adapter，图片 OCR 走本地引擎优先、MiniMax fallback。
- **验证证据**：修复前全仓 test、build、lint、docs lint、docs-sync 均通过，但深度复审证明“测试绿不等于合同完整”；后续必须增加权限、内容伪装、流式上限、队列 claim/outbox 与真实 Artifact extraction 门禁后重新跑全量。
- **下一步**：挂载受控 PDF/DOC/DOCX/ZIP/图片解析器与完整 quarantine/AV adapter；增加跨服务 upload→worker→needs_review 与隔离数据库 migration/rollback 证据。未通过新一轮独立复审前不触碰云上迁移。

## 2026-08-09（研究者导入闭环 Task 3）— 多格式 ingestion pipeline，等待独立复审

- **格式与安全合同**：集中校验 PDF、DOC/DOCX、TeX/ZIP、Markdown、PNG/JPEG/WebP/SVG 的扩展名与 MIME；multipart 单文件 100 MB（含 truncated 检测）、单批 250 MB、最多 20 文件；未同意 `processingConsent`、无文件、格式不匹配或越权均在写入前拒绝。
- **持久化状态机**：新增 migration 25（`20260809040000_ingestion_tasks`），只保存 IngestionBatch/IngestionTask/Artifact/AgentTask 关系与九态元数据；二进制仍只走 Blob/Storage Adapter。
- **异步 Hermes 边界**：每个 Artifact 创建 `sdf.extract` AgentTask 并入既有 Redis 队列，payload 仅含 ID；worker 的 pending/running/succeeded/failed 映射为 queued/parsing/needs_review/failed_retryable，不在 API 同步调用 provider。
- **恢复与重试**：batch 的 request digest 绑定有序文件名/MIME/内容 SHA-256；AgentSession、Artifact、AgentTask、IngestionTask 分层稳定幂等；响应丢失或重叠请求可从部分 batch 继续且不产生第二条 Hermes 会话；仅一个并发调用可原子 claim `failed_retryable` 并重排既有 AgentTask。
- **证据**：domain ingestion + agent focused 19/19，agent-worker 15/15，domain/API/worker typecheck 通过；真实 PG/Redis/MinIO integration 已写，待云上迁移 22–25 后执行。
- **状态**：实现尚未自行标记完成；等待全量门禁与独立 scoped review。

## 2026-08-09（研究者导入闭环 Task 2）— ✅ 最终复审通过，Task 3 启动

- **资料入口闭环**：`mode=import` 现在强制选择至少一份资料；创建 RO 后逐文件走现有受 CSRF 保护的 `/artifacts/upload`，再把全部 Artifact 引用写入首个不可变 Commit。`mode=blank` 不再显示伪上传控件。桌面/移动 Playwright 均实际选择 Markdown + PNG，并断言两次上传和 Commit 引用，4/4 通过。
- **注册反枚举**：已验证账号与未注册账号统一执行 challenge + 邮件投递路径；SMTP 失败失效 challenge、写脱敏审计并仍返回通用 202，避免通过状态码或明显分支时延枚举账号。并发/失败安全 auth focused 23/23。
- **真实跨进程证据**：新增独立 Playwright 门禁，启动编译后的 Fastify auth 路由和真实 Next dev server，经 `/api` rewrite 完成请求验证码、确认注册、会话 Cookie 与 `/auth/me`，1/1 通过，不再以 route mock 代替前后端契约。
- **迁移前向安全**：active challenge partial unique index 从原 signup table migration 拆为独立 `20260809025000_signup_challenge_active_unique`，即使某环境已应用早期 migration 22，也能通过后续 deploy 获得约束。
- **修复复审遗留**：导入路径现在对同名文件做确定性消歧；页面保留 import checkpoint、已创建 RO、已上传 Artifact 与稳定 create/commit 幂等键，网络中断重试不会创建第二个 RO 或重复上传已完成文件。迁移 23 先按邮箱保留最新 active challenge、消费其余重复行，再建 partial unique index；新增 SQL 顺序门禁测试。
- **云上迁移验收**：另增真实 PostgreSQL integration test，在事务内预置重复 active rows、直接读取并执行 migration 23 源文件、断言只保留最新行后回滚；需在云上 migration 23 deploy 后执行。
- **最终复审遗留与修复**：复审确认前述问题已关闭，但发现客户端稳定 key 未被服务端兑现。新增 migration 24，为 RO 与 Artifact 建可空唯一幂等键；Fastify 透传 header，domain 重放返回原对象；每个上传使用稳定 import/index key；checkpoint 写入 localStorage，刷新后可恢复。新增 RO/Artifact 重放测试，证明响应丢失后的同 key 请求不重复落库。
- **内容身份收口**：文件 fingerprint 升级为浏览器 SHA-256；checkpoint 绑定导入模式、完整 logicalPath + digest 材料集合，并恢复 title/workspace；不同内容即使同名也启动新 import。服务端读取实际内容后核对 digest，同 key 不同内容明确拒绝；RO/Artifact 捕获并发唯一冲突并返回赢家对象。migration 23 实库测试按语句执行实际源文件，避免 prepared statement 多语句限制。
- **最终复审**：独立审查 `6296343..3cd0c79` 给出 `READY`，SHA-256 材料身份、同名异内容、并发 P2002 replay、checkpoint 批次绑定、migration 23 源 SQL 执行与文档同步全部关闭；Task 2 正式完成。
- **下一步**：Task 3 启动多格式 Artifact ingestion contract、批次/任务状态机与异步 Hermes extraction 队列。迁移按当前最新 24 之后新增，云上实库 apply 仍是部署门禁。

## 2026-08-09（研究者导入闭环 Task 2 复审）— 撤销完成标记，进入修复轮次

- **复审结论**：Task 2 暂不通过。真实注册首请求存在 web/Fastify payload 漂移；Dashboard 仍固定为空数组；主 CTA 指向未实现路由；新 signup 路由缺限流与原子 attempt；SMTP 失败残留 challenge；部分 protected writes 绕过 CSRF。
- **决策裁定**：公开邮箱验证码注册是用户明确的新产品决策，优先于旧 baseline 的测试期邀请码描述；本轮更新 canonical spec/ADR，不回退邀请制。
- **执行纪律**：Task 3 只完成 schema 路径和迁移顺序预检，暂停实现；Task 2 必须增加真实 web-wrapper→Fastify 合同测试、非 mock 注册 smoke、真实 Dashboard 数据与可达 `/research-objects/new` 后才能重新完成。
- **Fix round 1 实现**：email-only 请求与 Fastify schema 已统一；新 signup 路由限流；challenge 单邮箱 active 唯一、错误 attempt CAS 计数、SMTP 失败失效并脱敏审计；全部 protected writes（含 script modify、multipart XHR）接入 CSRF；Dashboard 从成员 RO/当前用户 AgentTask API 取值；新增可达 `/research-objects/new` 创建/资料入口；baseline + ADR-005 确认公开邮箱验证码注册。
- **当前证据**：auth 22/22、domain RO/Agent 18/18、API auth/security/rate-limit 20/20、web Auth/Dashboard/transport 22/22、Playwright 桌面/移动 4/4；Prisma schema valid；全仓 build 通过。仍需独立 scoped re-review，未提前恢复 Task 2 complete。

## 2026-08-09（研究者导入闭环 Task 3）— 迁移与 schema 路径预检（实现暂停）

- **计划校正**：仓库 Prisma 单一事实源为 `infra/schema.prisma`，不是旧计划中的 `packages/database/prisma/schema.prisma`；已存在 signup migration `20260809020000`，因此 ingestion migration 顺延为 `20260809030000_ingestion_tasks`，避免生产前向迁移乱序。
- **边界确认**：二进制继续走 Storage Adapter/Blob，数据库仅保存 batch/task/artifact 关联与状态元数据；解析仍复用异步 AgentTask/worker，不在 API 请求中同步调用模型。
- **下一步**：Task 2 复审通过后，才按校正后的 Task 3 brief 写 PDF、DOCX、TeX/ZIP、Markdown、图片、同意、越权与 retry 的红态合同测试。

## 2026-08-09（研究者导入闭环 Task 2）— Auth/Dashboard 初版（后续复审撤销完成）

- **页面**：新增 `/auth/register`、`/auth/login`、`/dashboard`，验证码注册不再包含邀请码字段；Dashboard 对新用户突出首份资料导入，对回访用户突出最近 RO，并保留上传与空白创建的同等主操作。
- **组件**：新增 SignupCodeForm、LoginForm、ContinueResearch、ImportStage、HermesTaskRail、ResearchList；Dashboard 只显示可行动 Hermes 任务。
- **真实契约**：恢复 `POST /auth/request-signup-code`、`POST /auth/confirm-signup`、`signup_challenges` 迁移与 legacy invited-account 兼容；web 统一走同源 `/api`，受保护写请求自动获取/刷新 CSRF token，开发 rewrite 与生产 nginx 均保持同一路径语义。安全复核进一步把 CSRF 豁免收紧到无会话公开认证写入，`/auth/logout` 等会话变更继续受保护；本条的完成措辞已由顶部复审条目修正。
- **验证**：`auth-dashboard.test.tsx` 10/10、`api-client-contract.test.ts` 8/8、API `auth-routes.test.ts` 6/6、API security 6/6；Playwright clean-browser flow 4/4（注册键盘流程、安全重定向、桌面与 375px 导航）；`npx pnpm@9.15.0 build` 全仓通过。API 首次未收集用例的根因是仅运行 Prisma generate 而缺少 `@openscience/database` dist，按正式 package build 顺序补齐后通过，不属于业务失败。
- **后续修正**：本条验证只能证明局部合同/模拟浏览器流程，不能证明真实前后端闭环；以顶部 Task 2 复审条目为准。

## 2026-08-09（研究者导入闭环 Task 1）— 视觉地基与浏览器门禁完成，Code Connect 受套餐阻断

- **代码地基**：新增 `StatusBadge`、`ProgressRail`、`Dropzone`、`EvidenceCard` 四个稳定原语；`tokens.css` 补齐深蓝工作台、纸白证据、状态、focus、spacing/type/radius token，`globals.css` 增加双表面与 reduced-motion RO-node 规则，并把 drawer z-index 收口到 token。
- **测试证据**：TDD 红态先因四个组件缺失而失败；审查新增真实预览路由回归测试后再次红态（旧脚本使用手写 HTML），改为编译后的 React 原语后 focused suite 为 19/19；web typecheck、build 与根 lint 均通过。
- **浏览器截图**：`apps/web/test/visual/ingestion-shots.mjs` 启动后访问仅开发态可用的 `/_visual/ingestion-foundations`，捕获真实组件与编译 CSS；产物位于 `E:/Miscellaneous/XGS/.worktrees/researcher-ingestion/.playwright-mcp/ingestion-foundations/{desktop-1440x900,tablet-768x1024,mobile-375x812}.png`。人工复核确认三视口无横向溢出，375px 下 Confirm/Edit/Reject 全部可见。
- **Figma**：过渡设计源 `rWS3seZaDMdlnSljqktMDp` 新增 30 个 ingestion variables + `Shadow/Evidence`、四个 canonical components（`StatusBadge` `101:38`、`ProgressRail` `101:43`、`Dropzone` `101:51`、`EvidenceCard` `101:57`）与六屏 skeleton（`101:69`、`101:73`、`101:77`、`101:81`、`101:85`、`101:89`）；metadata 校验尺寸/层级通过。
- **已知阻断**：Figma 官方拒绝 Code Connect 写入，明确要求 Organization/Enterprise + Dev/Full seat；当前 Professional 临时 workspace 无法满足，故未伪造映射。Task 2 可消费代码原语继续，但正式 Code Connect 必须先升级套餐/席位并发布 library。
- **下一步**：由主 session 评审 Task 1 commit；确认后才进入 Task 2 Auth/Dashboard，不在本任务提前实现业务页面。
## 2026-08-09（产品前端与设计闭环审计）— 重新基线化，暂停零散视觉开发

- **用户反馈**：注册已成功，但注册页视觉明显不达产品级；要求核对原方案落实度、补齐 Hermes 多格式上传，并明确 Task Master 与产品计划的关系。
- **事实核验**：当前仓库的后端 Phase 1A–1E 能力和 API/集成测试较完整；但 `apps/web/app` 只有 Landing、公开 RO、协作和编辑器路由，没有独立的登录/注册、Dashboard、Hermes 工作台、Explore、Editorial Curator 页面。`ArtifactUploader` 只存在于编辑器组件，尚未形成 Hermes 的 PDF/Word/TeX/Markdown/图片导入流程。
- **Figma 核验**：用户提供的复制文件 `gjhowMG7cG4clKwvhvF08E` 仅有 `00 Cover` 空页面（顶层页面 1 个，Cover 画布尺寸为 0×0）；过渡文件 `rWS3seZaDMdlnSljqktMDp` 同样仍为空态。由此可见，Figma 工具已可调用，但设计源、代码实现和视觉验收没有形成闭环，不能把此前的“工具门禁/局部节点写入”视为六屏产品设计完成。
- **判断**：用户关于“之前计划没有充分落实”的判断基本正确；更准确地说，Task Master 主要记录了后端垂直基础设施完成项，早期 P1A-3 计划明确排除了 web 注册页，后续产品网页计划停留在 Figma discovery/局部 Landing 原型，导致产品级前端交付被高估。
- **前进方向**：将当前工作切换为“产品前端 re-baseline”：①先冻结信息架构与核心用户旅程；②以 Figma canonical foundations + 六个可验收屏幕为视觉上游；③按登录/注册→Dashboard→Hermes 导入→RO Workspace→Public RO/Explore→期刊策展的垂直切片实现；④每个切片必须有真实 API、空/加载/错误/成功状态、Playwright 三视口截图和人工审美签字；⑤完成后再接 Live2D/Hermes 共享状态与高级动效。
- **下一步**：先提交 re-baseline 计划与差距矩阵供用户确认；确认后再写代码，不继续堆叠孤立页面或装饰性动效。

## 2026-08-09（研究者导入闭环设计）— 设计 spec 已写入，等待审阅

- **设计产出**：`docs/superpowers/specs/2026-08-09-researcher-ingestion-product-slice-design.md`，固定 Dashboard 优先级、七条路由、PDF/DOCX/TeX/Markdown/图片导入状态、Hermes 六节点证据确认、素材许可证和浏览器验收门禁。
- **设计决策**：Dashboard 回访用户优先“继续最近研究”；新用户自动切换为“导入第一份资料”；“上传资料/创建 RO”保持同等权重。
- **阻塞门禁**：spec 需用户审阅通过后，才能进入 writing-plans 和前端实现；当前未修改业务代码。

## 2026-08-09（研究者导入闭环实施计划）— 计划已写入，等待执行方式选择

- **计划产出**：`docs/superpowers/plans/2026-08-09-researcher-ingestion-product-slice-plan.md`，拆为 6 个可独立验收任务：视觉基础、Auth/Dashboard、导入 API、Hermes 证据、Workspace/Live2D、浏览器与生产门禁。
- **执行门禁**：每个任务要求 focused tests、真实浏览器验证、docs-sync；当前未修改业务代码。

## 2026-08-08（产品网页 Task 1 / Figma Phase 0）— 过渡文件创建与 discovery 完成

- **设计源创建**：用户确认后，在临时 Full 席位的 `501428005's team` 创建 `OpenScience Web Design System`：<https://www.figma.com/design/rWS3seZaDMdlnSljqktMDp>；该文件是 transitional source，不是最终 canonical。
- **Figma 空态审计**：文件仅有空白 `Page 1`；0 collection、0 variable、0 local style、0 component。`Noto Serif SC` 与 `Noto Sans SC` 所需字重均可用。
- **代码 token 审计**：`tokens.css` 35 个变量、`globals.css` 16 个变量，共 51；其中 39 个颜色、2 个阴影、3 个 motion duration、2 个 easing、3 个 z-index、1 个 radius、1 个 font stack。映射后预计 49 个 Figma variable + 2 个 Effect Style。
- **组件审计**：已有 Button/Card/Badge/Input/Dialog；Tabs、RO Card、SDF Node、Artifact Card、Review Row、Version Diff、Hermes Rail 尚无统一 `components/ui` primitive。
- **库审计**：文件未订阅库；Simple Design System 有 Button 等候选，但 token/API/所有权模型与本项目不一致，建议本地重建，只把库作为结构参考或图标来源。
- **阻塞决策**：代码真源缺少 spacing、完整 typography/radius token，且 drawer 仍写死 `z-index: 100`。Phase 1 前需批准先补齐代码 token，再镜像到 Figma，避免在 Figma 发明第二套命名。

## 2026-08-08（Figma 最终工具门禁）— 双身份通过，长期账号编辑席位待开通

- **工具加载**：重启后 `figma-temp` 与 `figma-primary` 各暴露 26 个官方工具，共 52 个；两边 `whoami` 均成功。
- **身份验证**：两个 email 不同且分别匹配预期账号前缀；临时账号 handle 为 `Ran`，长期账号 handle 为 `zju`，双 OAuth 不再串号。
- **席位验证**：临时账号拥有 Full 席位（student tier）；长期账号当前唯一 plan 为 starter tier + View 席位，没有 Team/Project 编辑席位。
- **结论**：Figma MCP 工具门禁通过，但长期账号暂不能作为可编辑 canonical owner。开始 Task 1 前需二选一：为长期账号开通 Full/Edit 席位并直接创建 canonical 文件，或按 ADR-004 先在临时 Full 账号制作、同步邀请长期账号并在席位开通后迁移。

## 2026-08-08（Figma 双账号隔离验证）— 浏览器会话复用已纠正

- **发现**：重启后两个 Figma MCP 均加载，各暴露 26 个官方工具；但首次并行 `whoami` 返回同一临时账号，说明 `figma-primary` 授权时复用了浏览器现有身份。
- **修复**：仅撤销 `figma-primary` 本地 OAuth，用户将默认浏览器切换到长期账号后重新授权；`figma-temp` 保持不变。
- **验证**：全新、只读、ephemeral Codex 客户端调用 `figma-primary.whoami`，确认邮箱属于长期账号前缀，handle 与 plan 数也和临时账号不同；未输出或记录完整邮箱、授权 URL、state 或 token。
- **当前状态**：双账号 credential 已隔离且身份正确；本对话仍持有重启前的 primary 客户端缓存，需要最后一次重启刷新 App 工具连接。

## 2026-08-08（Figma OAuth 登录完成）— enabled 与 authenticated 状态已分离验证

- **现象**：重启后 Mermaid 已正常加载，但 `figma-temp`、`figma-primary` 显示 enabled 且 auth failed，当前工具目录没有 Figma。
- **根因**：Codex 已正确读取两个原生 remote URL，但 `enabled` 只表示配置启用，不会自动完成 OAuth；官方 CLI 显示两个 server 均为 `Not logged in`。
- **修复**：分别执行官方 `codex mcp login figma-temp` 与 `codex mcp login figma-primary`，两个浏览器 OAuth 都成功完成；未读取 `.env`，未记录授权 URL、账号或 token。
- **验证**：`codex mcp list` 显示两个 Figma server 均为 `enabled / OAuth`；两个流程使用独立 OAuth 客户端和回调。Mermaid 工具 `generate_mermaid_diagram` 已在当前会话可调用。
- **剩余门禁**：当前 App 工具清单在会话启动时固定，需再重启一次；之后使用两个账号各自专属测试文件验证没有串号，再确认长期账号为 canonical owner。

## 2026-08-08（Figma 原生 MCP 修正）— 停用代理注册路径，等待一次重启认证

- **复现**：移除 profile header 并隔离 `MCP_REMOTE_CONFIG_DIR` 后，`mcp-remote` 仍在 Figma 动态客户端注册阶段返回 HTTP 403，故根因不是账号或 token 目录。
- **官方接法**：Figma 的 Codex 安装说明要求直接添加 `https://mcp.figma.com/mcp`，由 Codex 原生远程 MCP 客户端完成 OAuth。
- **修正**：Codex `config.toml` 与项目 `.mcp.json` 中的 `figma-temp`、`figma-primary` 均改为原生 `url` 配置；保留不同 server 名，并将双账号隔离列为重启后必须实测的门禁。
- **Mermaid**：使用 MCP SDK 完成真实握手，成功列出 `generate_mermaid_diagram`；包缓存已预热，等待 Codex 下次加载。
- **下一步**：重启 Codex，分别认证两个 Figma server，并用账号专属文件验证 token 不串号；如同 endpoint token 被复用，则改用两个独立 Codex profile。

## 2026-08-08（Figma OAuth 修正）— 双账号隔离从请求 header 改为独立 token 目录

- **复现**：`figma-temp` 通过 `mcp-remote` 初始化时，Figma 动态客户端注册返回 HTTP 403；错误发生在浏览器 OAuth 之前。
- **根因**：用于区分账号的自定义 `X-OpenScience-Figma-Profile` header 被带入 Figma 注册请求，Figma 拒绝该请求；因此两个 Figma MCP 在 Codex 中均未 ready。
- **修正（已由上方条目取代）**：曾移除自定义 header 并分别设置 `MCP_REMOTE_CONFIG_DIR`，但 `mcp-remote` 仍被 Figma 拒绝；最终改用 Codex 原生 remote URL。
- **Memory**：本地 memory JSONL 发现 4 个旧实体缺少 schema 字段，已无删除地补齐 `entityType`/`observations`；Memory MCP 搜索恢复，并新增产品网页设计与 Figma 所有权两条 `XGS-` 索引记忆。
- **下一步（已由上方条目更新）**：重启后走 Codex 原生 OAuth 并验证双账号；Mermaid 已完成独立握手验证。

## 2026-08-08（Codex MCP 修正）— 配置源对齐与 Figma 双账号迁移准备完成

- **根因**：重启后当前会话仍无 Figma/shadcn/Task Master 工具；审计确认 `C:/Users/Mac/.codex/config.toml` 原有 `mcp_servers=0`，项目 `.mcp.json` 不会自动加载进 Codex Desktop。
- **修正**：在 Codex `config.toml` 和项目 `.mcp.json` 对齐配置 10 个 MCP：semantic-scholar、github、mermaid、memory、context7、tavily-search、figma-temp、figma-primary、shadcn、task-master-ai；JSON/TOML 解析均通过。
- **双 Figma（已由后续条目修正）**：profile header 与 `mcp-remote` 方案均被 Figma 动态客户端注册拒绝；最终改为 Codex 原生 remote URL。临时/长期账号凭据已按用户要求写入本机 `.env`，未读取或回显现有 `.env`，不入 Git。
- **迁移决策**：新增 `docs/decisions/ADR-004-figma-account-ownership-and-migration.md`；长期账号为 canonical owner，临时账号只做过渡编辑，迁移采用目标 Team 移动/复制 + `.fig` 备份 + variables/components/prototype/Code Connect 对照验收。
- **下一步**：再次重启 Codex，实际检查 10 MCP 工具；分别完成两个 Figma 浏览器 OAuth 并核对身份；工具前置齐全后才启动 subagent-driven Task 1。

## 2026-08-08（MCP 精简）— 保留产品工作流所需的 10 个 server，等待一次重启启用

- **配置调整**：`.mcp.json` 从 11 个降至 10 个 server；移除与 `semantic-scholar` 重复的 `paper-search`，避免同类 academic MCP 重叠和上下文开销。
- **保留能力**：`figma`（设计源/MCP）、`shadcn`（组件注册表）、`task-master-ai`（任务记录）、`github`（仓库协作）、`mermaid`（图表）、`context7`（技术文档）、`tavily-search`（网络检索）、`semantic-scholar`（学术检索）、`memory`（跨会话记忆）、`fetch`（REST/API 获取）。
- **验证**：JSON 解析通过，`server_count=10`；未读取或打印任何密钥值。下一步为 Figma Professional OAuth 完成后重启 Codex，使配置一次性加载。

## 2026-08-08（工具审计）— docs-sync 与基础执行环境已验证

- **docs-sync**：`npx pnpm@9.15.0 audit:docs-sync` → `DOCS_SYNC_OK`；工作区无未提交变更后开始审计。
- **基础运行时**：Node `v24.11.0`、pnpm `9.15.0`、git `2.52.0`、rg `15.0.0`、FFmpeg `9.0`、ImageMagick 可用；`npx pnpm@9.15.0 typecheck` 与全仓 `test` 通过（apps/web 58、packages/domain 276、apps/api 50、science-worker 29 等）。
- **MCP/插件**：项目 `.mcp.json` 已登记 11 个 server，Task Master MCP server 可启动并注册 7 个 core tools；当前 Codex 会话实际工具清单未暴露 Figma、shadcn、Task Master 或 Playwright MCP，不能把配置文件当作已加载能力。
- **Figma 前置**：Figma remote MCP 配置存在，但 Professional Dev seat/OAuth 与 Codex session reload 仍是执行 Task 1 的前置条件。
- **Playwright**：浏览器缓存存在（Chromium/headless shell），`npx --no-install playwright --version` 可运行；但 root/web package 未锁定 `@playwright/test` 或 `playwright` 依赖，跨机/离线执行不保证。执行视觉任务前应将项目依赖和浏览器安装纳入 Task 1/6 门禁。
- **工具问题**：health skill 的 WSL 采集脚本因本机路径转换（`wsl: Failed to translate 'Z:\\Dirac\\scripts'`）无法运行；未修改全局配置，保留为环境风险，后续若需要完整 health audit 先修复脚本路径调用。

## 2026-08-08 — 产品级网页设计方向 A 定稿，正式 spec 已写入

- **用户确认**：采用 `Monumental Scholarly Intelligence` 作为完整产品设计基线；融合期刊策展层的编辑叙事与研究工作区效率，保留深色工作区/浅色 Public RO 双表面体系。
- **产品闭环**：明确 invite-only 候补、邮箱绑定邀请码、Dashboard 首屏、Hermes 证据与不确定性、草稿/不可变版本、RO unique ID 演化、双重引用、社区 review、Live2D/Hermes 共用状态、Ultrafast Science 策展和宽松分层许可。
- **正式 spec**：`docs/specs/2026-08-08-openscience-product-web-design.md`，定义信息架构、状态模型、媒体 provenance、响应式/无障碍、Figma 六屏交付与验收门槛；尚未修改业务代码。
- **下一步**：请用户审阅正式 spec；通过后使用 `writing-plans` 拆分 Figma foundations、统一 RO workspace、Public RO/Explore、Editorial Curator、Hermes/Live2D 和质量验收计划。

## 2026-08-08（续）— 实施计划完成，拆为六个可独立验收任务

- **计划**：`docs/plans/2026-08-08-openscience-product-web-plan.md` 已完成并与已批准 spec 对齐。
- **六任务**：Figma foundations/六屏原型；Dashboard + 统一 RO Workspace；创建/Hermes 证据/版本/任务中心；Public RO + Explore + Artifact provenance；Ultrafast Science Editorial Curator + Collection；Hermes/Live2D bridge + 视觉回归/无障碍/性能/生产验收。
- **复用策略**：复用现有 Landing、SDF editor、collab、Public RO、API/domain；Task Master 10–12 映射到计划中的 Task 1/4/6，不创建重复路线。
- **下一步**：用户选择执行方式（subagent-driven 或 inline execution）；Figma 专业版开通后先执行 Task 1。

## 2026-08-07（补七）— 一并 commit/push + Hero 重设计 v2：布局比例、视频融合、核心思想条，已上生产

- **Commit/push**：用户确认后 Task 8+9 全部改动单笔提交 `15c939e`（feat(web): design system tokens + hero loop video & entrance motion）并推送 GitHub（Basic 头方案）。
- **设计工具**：`.mcp.json` 追加 `shadcn` MCP（组件注册表查询，无需 key，重启 session 生效）；`figma` MCP 仍待用户开 Professional Dev seat + 重启 OAuth。ui-expert-mcp/Playwright/ffmpeg 已具备。职能划分定论：设计工具全部装本机（author-time），服务器只做运行时——构建产物经 cloud-sync + 远端 build + compose restart 上生产，服务器不装任何设计工具。
- **Hero 重设计 v2**（用户反馈：布局比例失调、视频与其他元素割裂、缺体现核心思想的文字元素）：
  - **融合**：符号容器放大至 `h-[min(118vh,1360px)]`、`right-[-16%]`，mask 羽化加深（black 45%→74%），视频加 `contrast-[1.08] saturate-[1.06]` 压掉近黑底色（消除 screen 混合下的方形边界），符号背后加 accent 径向光晕（rgba(42,109,255,0.18) blur-2xl）把符号"渗"进背景。
  - **核心思想条**：hero 底部新增三柱条——`01 结构化`（SDF 可查询结构）/`02 可验证`（沙箱重跑）/`03 自进化`（Hermes 评审演化），mono 序号 + display 标题 + muted 描述，顶部分隔细线；i18n 新 key `hero.pillar{1,2,3}{Title,Desc}`（zh/en）。
  - **布局比例**：容器改两段式 flex-col——内容区 `flex-1 justify-center` 垂直居中，三柱条钉底。
  - **坑**：三柱条初版 `absolute bottom-0` 被 LatestResearch 的 `-mt-24/-mt-28` 叠印遮盖（elementFromPoint 实测命中下一 section），改 in-flow + 容器 `pb-32/lg:pb-36` 让出叠印区。
- **验证**：build/typecheck 绿；本地 3100 双视口截图迭代三轮（v1 方框边残留 → v2 CTA 碰撞 → v3 成立）；生产部署后实测：桌面 1440×900 与移动 390×844 截图符合预期，video 播放中（ro-loop.webm，t=5s）。
- **下一步**：等用户确认 commit 本轮（Hero v2 + i18n + index）；Task 10 Figma 待 seat/OAuth；Task 11 全站收口。

## 2026-08-07（补六）— Task 9 动效层完成：Hero 循环视频 + CSS 进入动效，已上生产

- **视频管线**：用户用 Gemini 按分镜 prompt 生成 `docs/user_ideas/generated_figures/video/video1.mp4`（1280×720/24fps/10s，figD1 六面板 Hermes 枢纽版）。本机 scoop 装 ffmpeg 9.0（一次性素材加工，非项目依赖）处理：首尾 1s xfade 叠化消循环接缝（原片末帧仍在亮态、直循有跳切）→ 中央 720² 裁切（顺带去掉右下角 Gemini ✦ 水印）→ 三产物入 `apps/web/public/hero/`：`ro-loop.webm`（VP9 crf34，715KB）/`ro-loop.mp4`（H.264 crf23 faststart 兜底，1.0MB）/`ro-loop-poster.webp`（首帧，31KB）。
- **Hero 接入**：桌面 `<video autoplay muted loop playsInline poster>`（webm 优先）+ `motion-reduce` 下隐藏视频改渲染 poster Image；移动端静态 poster（省流量）。video 继承 mix-blend-screen + 径向 mask，旧 `ro-symbol.webp` 不再被引用（Task 12 待清理）。
- **进入动效（零依赖路线，弃 framer-motion）**：globals.css 新增 `landing-reveal`（fade+translateY 24px，0.7s var(--ease-entrance)）与 `landing-symbol-in`（纯淡入 1.2s），全部 `prefers-reduced-motion: no-preference` 门控；Hero 徽章/标题/副文/CTA inline animationDelay 60–300ms stagger。滚动进入用自写 `in-view.tsx`（IntersectionObserver，-12% rootMargin，一次即停），CSS 侧 `html.js` 门控（layout 一行 inline script 加 js 类）——无 JS 时内容始终可见，SEO/降级安全。弃 framer-motion 理由：纯进入动画 CSS 等价且 SSR/reduced-motion 零风险，首包仅 +1kB（108→109kB，门 <30kB）。
- **验证**：web 58/58、typecheck、build、全仓 lint+docs-sync 全绿；本地 1440×900/390×844 截图；reduced-motion 仿真实测视频隐藏暂停、poster 显示；生产部署后实测 video 播放中、`landing-reveal` 激活、4 个 landing-inview 滚动触发正常。
- **部署坑**：云上 `pnpm install` 直连 registry 网络失败（管道 tail 掩盖退出码，build 才报 @radix-ui/react-dialog 缺失）——云上联网命令必须 `with-proxy` 且不吞退出码；install 后 build 7.8s 过（cpu-features 可选原生依赖 gyp 失败无害）。
- **下一步**：等用户确认后一并 commit（Task 8 + 9，用户指定）；Task 10 Figma 待用户开 seat + 重启 session OAuth。

## 2026-08-07（补五）— Push 完成 + Task 8 设计系统固化（token 补全 + 原语双表面）

- **Push**：`c82759f..baefcc4` 已推 GitHub。坑：`.env` 两个 token 走 `Authorization: Bearer` 均被拒（extraHeader Bearer 对 PAT 无效），改 `x-access-token:<tok>` base64 的 Basic 头成功；值需 tr 掉引号。
- **Task 8 完成**（计划 docs/plans/2026-08-07-web-quality-pipeline-plan.md）：
  - `tokens.css` 补结构 token：`--state-danger:#B91C1C`（初取 #DC2626 实测 hero-text 白字对比 4.32 不达标，换 #B91C1C 达 5.8）、`--motion-fast/breathe/scan`（spec §2.2 上限值）、`--radius-card`、`--shadow-card/overlay`、`--ease-standard/entrance`（Task 9 framer-motion 同值镜像预留）、`--z-header/overlay/modal`。
  - **双表面机制**：原语默认纸白；祖先挂 `.surface-dark` 类整体切深色（`[.surface-dark_&]:` 任意变体，server-safe 无 JS）；Dialog 因 Portal 断链用 `surface="dark"` prop。规格落 spec §3.1。
  - **修契约违约**：button/badge 的 `destructive` 原用 accent-diff（违反"暖橙仅表 diff"），改 state-danger。
  - 新增原语 `input.tsx`、`dialog.tsx`（@radix-ui/react-dialog 入 web deps）。
  - 测试：ui-components 加双表面/state-danger 断言；tokens-contrast 门禁加 hero-text/state-danger 配对、@theme 映射检查改为仅约束颜色值变量（结构 token 不进 --color-* 命名空间）。web 58/58、typecheck、build 全绿；产物 CSS 实测 `.surface-dark` 后代选择器、`rounded-card`/`shadow-card`/`ease-standard`/`z-(--z-modal)`/`duration-(--motion-fast)` 均生成。
- **注意**：原语尚未被任何页面引用（grep 无业务引用）， landing 视觉零变化，无需部署；Task 11 全站收口时统一接入。
- **下一步**：Task 9 动效层（framer-motion + Hero 循环视觉，Gemini 图生视频 prompt 待交付用户）。

## 2026-08-07（补四）— Landing 全部改动 commit + Web 品质管线立项（Task 8–12）

- **Commit**：用户批准后拆三笔——`481b5c4` feat(web) landing 完整版（生成资产/EvolutionPanel/HermesBand/TrustBand/符号 stage 化/i18n/测试，19 文件 +837）；`182181f` chore（eslint 覆盖 apps/*/scripts、prod web `npm run start`）；docs 批（本日志 + project_index 补登记 EvolutionPanel/HermesBand/hero 资产/新计划 + 计划文档 + tasks.json + 用户素材 figA/figB/v2 交接解包件）。未 push。
- **立项**：用户拍板做产品级全站品质（不只主页）。产出 `docs/plans/2026-08-07-web-quality-pipeline-plan.md`——Task 8 设计系统固化（token 补全 + shadcn 原语双表面）→ 9 动效层（framer-motion + Hero 循环视觉，Gemini 图生视频优先）→ 10 Figma 设计上游 + 远程 MCP + Code Connect → 11 全站一致性（三套视觉 × 公开 RO/工作台/About/auth/Explore）→ 12 视觉回归门禁（shots.mjs → CI）+ 闲置资产清理。tasks.json 已追加 Task 8–12（parse_prd append 实际写入但回包超时，依赖手工对齐为 8←7、9←8、10←8、11←[9,10]、12←11）。
- **Figma 决策**：用户认为产品级需要 Figma，同意。核实：远程 MCP 全计划可用但免费档仅 6 calls/月不可用，实际需 Professional Dev seat（$12/月，200 calls/day）；Code Connect 是生产级输出前置（否则生成代码绕过设计系统）。Figma 侧待用户操作：开通 seat、OAuth 授权。
- **对账外部推荐清单**：跳过 Vercel/Supabase/Webflow/Framer（与自有 ECS+Docker+Postgres 架构冲突）；Playwright/GitHub MCP、Next/Tailwind/shadcn 底座、Lucide 均已具备；真缺口 = 动效层、Figma 环节、视觉回归门禁。
- **下一步**：Task 8 开工；等用户 Figma seat/OAuth（Task 10）；api 容器 unhealthy 仍待查。

## 2026-08-07（补三）— Landing 全区块补齐：四阶段演化面板 + Hermes 区块（P2 页面部分）

- **起因**：用户指出首页仍不达预期、缺核心思想元素。复盘根因：P0/P1 计划 11 个 Task 只覆盖 Header+Hero+#latest 原型，承载概念的「四阶段演化面板」「Hermes 区块」划在 P2 且一直未排期——把原型当成了成品页。本轮按 v2 定稿 §4 补齐整页（GET /explore 后端端点仍待 P2 另排）。
- **新增**：`EvolutionPanel.tsx`（client）——四阶段 stepper（创建→Hermes 解析→协作 Diff→合并发布），同一 SVG 符号随阶段 morph（`EvolvingRoSymbol` 新增 `stage` prop：create=环 0.35 暗+problem 面亮+隐轨迹；parse=主轨迹；diff=分支/merge/橙点；publish/默认=全亮），组 opacity CSS 600ms 过渡，挂载后 2.6s 步进自动推进一轮即停（v2：禁循环禁 scroll-jacking），点击即接管；移动端横向 snap 滑动卡片。`HermesBand.tsx`——上下文理解/证据检查/分级审批三卡（v2 §4.5 的 Hermes 面，非"万能 AI"罗列）。
- **Hero 再升级**：符号放大到 h=108vh（max 1200px）右 -12% 越界；新增 v0.1/v0.2/v0.3 版本标签（font-mono 10px、hero-muted/40，沿符号左弧排布，provenance 暗示，aria-hidden）；标题 xl:text-8xl；SiteHeader 容器 max-w-7xl→max-w-none（超宽屏导航贴边）。
- **LatestResearch 去浮盒**：删掉 32px 圆角大边框容器，改平铺分隔线 band。
- **坑**：EvolutionPanel 桌面 grid 未显式 `grid-cols-1` 时，auto 轨道取 max-content 导致移动端 stepper 把 body 撑出横向滚动条（scrollWidth 952）；改 `grid-cols-1`（minmax(0,1fr)）+ 子项 min-w-0 修复，实测 scrollWidth 375 ≤ 390。
- **验证**：web 56/56（符号 stage 新增 3 断言、landing 结构锁 evolution/hermes 模块）、typecheck、build（首包 108 kB）、全仓 lint + docs-sync 全绿；本地 1440×900/390×844 与生产整页截图一致。生产已部署。未 commit。
- **下一步**：用户验收整页 → commit；GET /explore 真实 feed（P2 后端）；api 容器 unhealthy 排查仍未做。

## 2026-08-07（补二）— Hero 质感层上线：Gemini 资产 screen 混合合成

- **资产**：用户用 Gemini Plus 按项目 prompt 自生成 `figA.png`（玻璃楔形环符号，1254² 纯黑底，自带橙点 diff/轨道环/历史轮廓）与 `figB.png`（氛围底，1672×941）；入库 `apps/web/public/hero/ro-symbol.{png,webp}`（webp 104KB）与 `hero-ambient.{png,webp}`（webp 8KB），PNG 为源文件。
- **合成方案**：figB 全幅 cover 氛围底 → 左侧文案可读性渐变 veil → figA `mix-blend-screen` 消黑底 + 径向 mask 羽化（black 60%→transparent 88%，首版 56%/77% 会切出直线边已修）+ 12s 呼吸动效（globals.css 追加 `hero-symbol-breathe`，reduced-motion 不加载）；移动端同一资产居中。SVG 版 `evolving-ro-symbol.tsx` 保留（后续四阶段面板复用），Hero 不再引用。
- **验证**：web 53/53、typecheck、build 全绿；本地 1440×900/390×844 截图确认；云上 build + restart web 后生产桌面/移动截图确认一致（过程中一次 public:000 为云上 DNS 解析抖动，重试 200）。
- **部署**：cloud-sync → 云上 `next build` → restart web；生产已上线玻璃环版本。未 commit。

## 2026-08-07（补）— Landing Hero 结构层重做上线：环形楔形几何 + 去假数据 + 全暗场

- **背景**：用户对已上线首页美感不达标（对照 Moonshot 与 v2 定稿差距大）。实测调研：moonshot.cn 营销站 = Rive/预渲染视频 + 大图 + 真实 DOM（非 Three.js）；Linear/Terax 类 = 单一 WebGL shader 面（OGL 级小库）。结论：质感靠预制资产，语义靠真实 DOM/SVG。
- **路线定稿（用户确认）**：分层混合——SVG 精确环形几何（结构层）+ 用户用 Gemini Plus 按项目 prompt 自生成玻璃质感贴图（质感层，待供图）+ SVG 蓝色轨迹/橙点 diff（语义层）；GLSL 氛围背景可选后置。prompt 已交付用户（主符号 1:1 纯黑底 / 氛围 16:9 / interface 变体）。
- **实现**：`evolving-ro-symbol.tsx` 从手摆四边形重写为计算几何——6 个 52° 环扇楔形（8° 缺口）、内外半径 330/158 开放中心、楔形顺序=研究周期顺时针（problem→reproducibility）；轨迹改为主轨迹穿中心 + 右下缺口处分支 merge 成泪滴环、橙点 diff 落在楔形缺口（60°, r≈244）；辉光降不透明度（0.78→0.55 / 0.38→0.22）+ 玻璃填充加 accent 淡蓝渐变。`Hero.tsx` 弃用 bitmap 全幅背景（`generate-landing-hero.mjs`/`public/hero/landing-hero.png` 自此闲置待清理，knip 会报），符号改为真实 DOM 右侧越界排布（h=92vh）；标题 i18n 加显式 `\n` 锁定两行（whitespace-pre-line），修复"化。"孤行；CTA 主按钮加蓝色光晕、次按钮毛玻璃。`LatestResearch` 删除全部假数据（latest.cards.* 文案同步删除）改纯 skeleton+空态。`TrustBand` 从纸白改深色延续（hero-surface 卡片）。
- **验证**：符号测试 8/8（轨迹期望值更新 + 新增环形几何断言 A330/A158 ≥18）；web 全套 53/53、typecheck、build（首包 101 kB）、全仓 lint + docs-sync 全绿；本地/生产 Playwright 截图（1440×900、390×844）确认构图与移动端顺序。
- **部署**：cloud-sync → 云上 `next build` → restart web 容器；隧道实测存活（经隧道 registry 401=可达）；生产 https://openscience.428312321.xyz/ 200 已上线新版。未 commit。
- **注意**：`openscience-prod-api-1` 容器显示 unhealthy（已 3 天），本轮未处理，待查。
- **下一步**：等用户 Gemini 生成质感层资产 → 合成（screen 混合/裁切）→ 三尺寸截图验收 → token 冻结（Task 7.11）；P2 接 GET /explore 真实 feed；查 api 容器 unhealthy。

## 2026-08-07 — Landing 首页视觉重做、入口修复与生产部署

- **状态**：针对生产页“视觉未达规划、子入口失效”的问题完成重做并部署到生产，尚未 commit / push。
- **实现**：Hero 改为全幅 bitmap 主视觉背景（`apps/web/public/hero/landing-hero.png`，由 `apps/web/scripts/generate-landing-hero.mjs` 本地生成，不直接使用原型图）；`#latest` 改成真实深色内容带 section；新增 `#trust` 信任区；Header 的“探索/关于”现在落到真实 section；新增 landing 结构回归测试锁定 `hero/latest/trust` 三模块与锚点。
- **工具取舍**：GitHub 社区方向调研后试装 `motion`，build 实测首页首包 106 kB → 156 kB，收益不抵成本，已撤回依赖并改用 CSS transition；未引入 Three.js / Live2D / pixi。
- **部署修复**：首次重建 web 容器后生产首页 502；定位为 `docker-compose.prod.yml` 中 web command 使用 `npx pnpm@9.15.0 ...`，新容器内需联网/确认 pnpm，Next 未真正启动。已改为 `npm run start`，使用 `apps/web` 本地 `next` binary 启动，重建后容器日志显示 Next ready。
- **验证**：focused landing test 2/2、web 全套 52/52、web typecheck、web build 通过；build 后首页首包 6.82 kB / First Load JS 106 kB；全仓 lint/docs 门禁通过；云上全量 build 通过；生产 `https://openscience.428312321.xyz/` 返回 200，SSR 含 `hero/latest/trust` 模块与 `landing-hero` 资产；`/auth/me` 仍返回 401；Playwright 生产桌面 1440×900 与移动 390×844 截图确认无横向溢出，`#latest` 与 `#trust` 均存在且 `#latest` 首屏可见。
- **下一步**：本轮上线版仍未达到最终审美标准；继续专门做视觉质量迭代（构图、字体节奏、真实内容密度、动效/图像资产），用户确认后再 commit/push。

## 2026-08-07 — 前端 P0/P1 Landing 页面组装与部署准备

- **状态**：Landing 首页已部署到生产域名；两版 `EvolvingRoSymbol` 可由 `?symbol=a|b` 切换；生产拓扑已补 Web 服务与 nginx 分流；本地代码作为本次收口 commit 入库，尚未 push。
- **实现**：`apps/web/app/page.tsx` 替换占位；新增 `Hero.tsx`、`LatestResearch.tsx` 与 Playwright 截图脚本；`app/layout.tsx` 移除全局 LocaleSwitcher，避免 Header 内控件重复；`infra/compose/docker-compose.prod.yml` 增加 `web` 服务（127.0.0.1:3000），`infra/nginx/openscience.conf` 根路径转 Web、API/auth/admin 等路径转 Fastify。
- **验证**：web typecheck、web tests 50/50、web build、全仓 lint、docs-sync、docs:lint 通过；本地 `next start -p 3002` 返回 200；Playwright 8 张截图已生成于 `apps/web/test/visual/out/`（gitignored），人工检查桌面与移动无明显重叠/空白，移动端 latest 提示露出；云上 install + 全量 build 通过，`openscience-prod-web-1` Up，服务器与 Playwright 均验证 `https://openscience.428312321.xyz/` 返回 200 且包含新首页内容，`/auth/me` 仍经 nginx 分流到 API 返回 401。
- **下一步**：提交当前落地页与部署配置改动；如需对外同步，执行 git push。

## 2026-08-06（补十七）— 前端 P0/P1 Task 7.7 EvolvingRoSymbol

- **状态**：Task 7.7 已实现并完成本地验证，未创建 commit。
- **实现**：新增 server-safe `apps/web/components/landing/evolving-ro-symbol.tsx`，提供 `sculptural`/`interface` 两种变体；六个 SDF facet、三层蓝色轮廓辉光、历史轮廓、中心轨迹/分支/合流与单个橙色 diff node；`prefers-reduced-motion` 下不输出动画 class/style。
- **测试**：新增 `apps/web/test/evolving-ro-symbol.test.tsx`；Vitest 配置扩展为发现 `.test.tsx`。Review fix 后补充轨迹拓扑与 SVG 层级断言；focused 7/7、web 全套 50/50、web typecheck/build 全部通过。
- **下一步**：进入 Task 7.8 Hero assembly；用户确认后再按既定节奏提交。

## 2026-08-06（补十六）— 前端 P0/P1 Task 7.6 Landing SiteHeader

- **状态**：Task 7.6 已实现并完成 fix round 1，task-master 已置 `done`；reviewer scoped re-review clean，未创建 commit。
- **实现**：新增 `apps/web/components/landing/SiteHeader.tsx`，包含语义 header/nav、landing.nav.* 文案、四个指定 href、logo + OpenScience wordmark、现有 LocaleSwitcher、滚动超过 24px 后的 token 化深色模糊背景、passive listener cleanup 与可见焦点状态；窄屏下 header/nav 分行并允许导航换行，避免英文横向溢出。
- **集成风险**：按 brief 保留 `app/layout.tsx` 不变，因此全局 LocaleSwitcher 与 SiteHeader 内 LocaleSwitcher 会同时存在，待后续 landing page assembly 处理。
- **验证**：web typecheck、web build、web 全套测试 43/43、`git diff --check` 全部通过；详细报告见 `.superpowers/sdd/2026-08-06-frontend-p0-p1-plan/task-6-report.md`。
- **下一步**：用户确认后提交 `feat(web): landing site header`，再进入 Task 7.7 EvolvingRoSymbol。

## 2026-08-06（补十五）— 前端 P0/P1 Task 7.5 审查收口

- **状态**：Task 7.5 落地页 `landing.*` i18n 命名空间已实现，task-master 7.5 已置 `done`；reviewer clean，当前等待用户确认 commit。
- **实现**：`apps/web/messages/zh.json` 与 `apps/web/messages/en.json` 新增对称 11 键，覆盖 nav、hero、Hermes 状态与 latest 空态；未改组件或依赖。
- **验证**：focused i18n 2/2、web 全套 43/43、JSON 语义检查、`git diff --check` 通过；reviewer 独立确认两份消息叶键集合均为 201 且无无关改动。
- **下一步**：用户确认后提交 `feat(web): landing i18n messages`，再进入 Task 7.6 SiteHeader。

## 2026-08-06（补十四）— 前端 P0/P1 Task 7.4 审查收口

- **状态**：Task 7.4 `shadcn/ui` 底座已实现并提交，任务 reviewer 双审通过；task-master 7.4 已置 `done`。
- **实现**：新增 `components.json`、`lib/utils.ts`、`button`/`card`/`badge`/`skeleton` 四组件、`ui-components.test.ts`；`CardTitle` ref 类型与 `<h3>` 对齐，Vitest 增加 `@/` alias。
- **验证**：web focused render 1/1、web 全套 43/43、web typecheck/build、全仓 lint（含 workspace/docs-sync）、`audit:docs-sync`、`docs:lint`（146 文件 0 issues）全部通过。为清除基线遗留的 MD012，修复 handoff 工作副本末尾多余空行。
- **审查**：初审 2 个 Important 已在 fix round 1 修复，scoped re-review 无新 Critical/Important；提交为 `feat(web): add shadcn ui base components`。

## 2026-08-06（补十三）— Task 7.4 Round 1 review findings fixed

- **修复**：`CardTitle` ref 类型改为 `HTMLHeadingElement`；新增 `apps/web/test/ui-components.test.ts`，用 `react-dom/server` 实际渲染并断言 Button/Card/Badge/Skeleton；Vitest 增加既有 `@/` alias 解析，Skeleton 补显式 React runtime import。
- **验证**：web `typecheck` 通过；web `test` 9 files / 43 tests 通过；web `build` 通过；`audit:docs-sync` = `DOCS_SYNC_OK`；`git diff --check` 通过。
- **报告**：fix wave 已追加到 `.superpowers/sdd/2026-08-06-frontend-p0-p1-plan/task-4-report.md`；无 commit。

## 2026-08-06（补十二）— 前端 P0/P1 Task 7.4 shadcn/ui 底座完成

- **实现**：`apps/web` 新增 shadcn/ui `new-york` 配置、`cn` 工具，以及 `button`、`card`、`badge`、`skeleton` 四个基础组件；新增五个 runtime dependencies，未修改现有页面行为或 CSS。
- **Token 约束**：组件默认表面使用现有 `paper-bg`/`canvas-bg`/`ink`/`hero-*`/`accent-*`/`border-subtle` Tailwind v4 token；未引入 slate/zinc 默认色或 preflight。
- **验证**：`npx pnpm@9.15.0 typecheck`、`test`、`build` 全部通过；web 单测 42/42；`git diff --check` 通过。构建仅有既存 next-intl cache warnings。
- **测试说明**：未新增 storyless render assertion，因为当前 `apps/web/vitest.config.ts` 是 Node 环境且未提供 DOM renderer；未引入新测试框架。详细报告：`.superpowers/sdd/2026-08-06-frontend-p0-p1-plan/task-4-report.md`。
- **下一步**：controller review 未提交 diff。

## 2026-08-06（补十一）— 前端 P0/P1 开工：7.1–7.3 完成（SDD 模式），交接 GPT 续作

- **执行模式**：subagent-driven-development——每 Task 派 implementer + reviewer 双审，审查干净后问用户 commit；台账 `.superpowers/sdd/2026-08-06-frontend-p0-p1-plan/progress.md`。
- **7.1 Tailwind v4**（`2bacb65`）：postcss 接入；关键决策=走 theme+utilities 降级导入（无 preflight），因协作/公开页多处裸 h3/h4/ul 依赖 UA 默认样式，审查抽查成立。
- **7.2 token + WCAG 门禁**（`fd46359`）：tokens.css 11 变量 + @theme 映射；对比度测试从 tokens.css 正则取色（防漂移）；`--accent-primary-strong` #256BFF→#2A6DFF（4.47→4.57 最小调整，审查复算证实）并同步 spec §3。
- **7.3 字体 + LocaleSwitcher**（`61d19a4`）：Noto Serif SC 600/900 + swap + `--font-display`；关键决策=`preload:false`（next/font 对 google CJK 只登记 latin 子集，preload 需 subsets:['latin'] 会丢 CJK 字形；保留 202 条 unicode-range 分片按需加载，首屏 preload 0KB）；LocaleSwitcher token 化样式（逻辑不动）。
- **task-master**：任务 7 登记（11 子任务，与 plan 一一对应），7.1–7.3 done。
- **遗留 minor（台账记录，终审复核）**：惰性 utility 4 条；LocaleSwitcher 浅色页面对比度（P3 产品壳解决）；tokens 正则健壮性。
- **交接**：token 预算原因，7.4–7.11 移交 GPT 执行，交接文档 `docs/handoff/2026-08-06-frontend-p0-p1-sdd-handoff.md`。

## 2026-08-06（补十）— 前端设计方向 v2 定稿（用户 × GPT × Kimi 三方）

- **输入**：GPT handoff v2（`docs/user_ideas/OpenScience-Kimi-Handoff-v2.zip`，含 HANDOFF.md + hero 参考图）与 `docs/user_ideas/主页原型图.png`（1672×941 art-direction 稿）。
- **Kimi 代码库校验两发现**：①SDF 真实六节点类型为 problem/insight/method/results/limitations/reproducibility（`infra/schema.prisma` SdfNodeType），与 GPT 猜测的内容六类不符 → 六面语义改映射真实节点；②API 无公开 RO 列表端点 → 定稿新增 `GET /explore` 轻量公共端点（走 api-contract）。
- **调研**：AI poster 质感纯前端复现可行（SVG 分层辉光 3–4 层 feGaussianBlur/feMerge、mix-blend-mode 叠光、feTurbulence 噪点；动效只调 opacity/transform）；copy-in 生态（Magic UI/Aceternity，与 shadcn 同模式）仅用于氛围、不用于核心符号。
- **grill-me 逐分支定稿 D1–D9**：D1 定位 Monumental Scholarly Intelligence；D2 符号=Evolving RO（SDF 六节点语义+纯 SVG+两版变体）；D3 首页 IA（hero 文案/双 CTA/feed 嵌首页+新端点/四阶段面板禁 scroll-jacking）；D4 三套视觉+token 按 GPT（蓝主色 #4C8DFF、暖橙仅 diff、WCAG 验证后冻结）；D5 期刊元素=符号通用+内容层露出；D6 Hermes Live2D 一步到位+五条缓释（iframe 常驻单实例/懒加载/首曝 Dashboard/reduced-motion 回退/单 PIXI）；D7 思源宋子集自托管+系统正文；D8 分期 P0–P4（Live2D 从 GPT P4 提前到 P3）；D9 沿用 GPT 验收标准（3 秒识符号/LCP≤2.5s/WCAG AA 等）。v1 的 10 个开放问题全部结案。
- **落档**：`docs/proposals/2026-08-06-frontend-design-direction-v1.md` 头部状态改 v2 定稿，文末新增「v2 终稿决策层」（效力高于 v1.x 各节）+ 讨论纪要 v2 条目。
- **执行方案**：正式 spec `docs/specs/2026-08-06-frontend-visual-system-design.md`（定稿版，无历史脉络）+ P0/P1 实施计划 `docs/plans/2026-08-06-frontend-p0-p1-plan.md`（11 Task：Tailwind v4→token+WCAG 门禁→字体→shadcn→i18n→Header→EvolvingRoSymbol 两变体→Hero→#latest→Playwright 三尺寸截图→用户验收门；P2+ 待 P1 验收后另出计划）。
- **下一步**：用户审 spec/plan → 选执行方式（subagent-driven 或 inline）→ 开工 P0 Task 1。

## 2026-08-06（补九）— 前端地基三修：next-intl 接通 + 公开页文案 i18n + 静态资产

- **next-intl 接通**（修「14 文件 useTranslations 无 Provider」P0 坑）：采用 v4 无 locale 路由方案——`next.config.mjs` 包 `createNextIntlPlugin`；新增 `apps/web/i18n/request.ts`（getRequestConfig，cookie `NEXT_LOCALE` → Accept-Language → 默认 zh）+ `i18n/locale.ts`（client 安全的常量/解析器，避免 server-only 依赖进 client bundle）；`app/layout.tsx` 改 async server component，`getLocale`/`getMessages` + `NextIntlClientProvider` 包 children，`<html lang>` 按 locale 输出；新增 `components/LocaleSwitcher.tsx`（写 cookie + router.refresh）。
- **公开页文案 i18n**：`messages/zh.json`/`en.json` 新增 `public` 命名空间（错误态/复制按钮/概览页各节/AI 审核/标签导航，约 40 键，zh/en 对称）；`components/public/PublicVersionPage.tsx`、`TabNavigation.tsx` 全部硬编码文案改 `useTranslations('public')`（原英文 TAB_LABELS 一并收编为 `public.tab.*`）。
- **静态资产与 metadata**：新建 `apps/web/public/`——手写极简 SVG：`favicon.svg`（脉冲线深色圆角方块）、`logo.svg`（脉冲标 + 字标）、`og-image.svg`（1200×630 占位）；`public/hermes/README.md` 记录 Hermes Live2D（wanko 模型）待从 Scholar's Tea 迁移且须保留出处。`layout.tsx` metadata 换真实 title/description（中文为主）+ favicon/OG 引用 + `metadataBase`。
- **验证**：vitest 34/34（含 i18n zh/en 键对称门禁）；`next build` 通过；`next start` 冒烟：默认 zh-CN、Accept-Language en 生效、公开页 SSR 输出 i18n 文案（研究对象标签）无抛错。
- **遗留**：LocaleSwitcher 无样式（globals.css 未动，P2A 统一处理）；`/research/[publicId]` 页面本体仍是占位。

## 2026-08-06（补八）— 前端设计方向 v1 讨论稿产出（进入网页设计规划阶段）

- **产出**：`docs/proposals/2026-08-06-frontend-design-direction-v1.md`（三方讨论稿 v1），含审美定位（学术工程感）、色彩/字体/符号、IA 页面地图、三套视觉具体化、动效 L0–L3 分级、Hermes Live2D 陪伴形象、技术底座决策、10 个开放问题、P2A–P2E 分期草案。
- **调研输入**：竞品分析 docx（pandoc 提取，34 竞品全为战略/IA 层启发无视觉观察）、moonshot.cn 交互风格、微信文章（scroll-world + img2threejs 两个 agent skill 项目）、nyblnet/bento（明文 JSON + morph 转场 + Fraunces/Instrument Sans 字体）、SPJ 期刊模板、GitHub 设计 skill 生态（结论：引 Tailwind v4+shadcn/ui 底座 + Playwright MCP 截图闭环 + vercel-labs 两 skill，否 Figma/21st.dev/v0 类）。
- **摸底发现（P0 地基坑）**：i18n provider 疑似未接线（14 文件 useTranslations 无 NextIntlClientProvider，运行时即抛错）；公开页文案硬编码中文违反自家 frontend-design skill 第 11 条；无 public/ 静态资产；1397 行单文件全局 CSS。
- **下一步**：用户与 GPT 讨论 v1 → 回稿迭代 v2 → 定稿后转 `docs/specs/` 正式 spec + 拆 plan。

## 2026-08-06（补七）— 测试链路修通：沙箱安全基线 19/19 + api 集成 104/104 云上全绿

- **测试脚本修复**：science-worker `test:integration` 原为匹配不到测试的 jest 残骸（pnpm -r 遇错即停，api 套件从未被执行）；拆分后 Docker 用例走 test:integration、纯单测本地 29/29 首绿。
- **沙箱安全基线 5 败修复**（P1E-8 门槛首跑）：pickle/动态导入/getattr 绕过 3 例根因=静态 AST 黑名单未接入执行链——补双层纵深（pollOnce 静态拒收 + 容器内运行时前言中和 os.system/pickle 族；实证 eval/exec/compile 不能中和，CPython import 机制依赖）；内存测试 payload 错（np.zeros 惰性零页不占 RSS，补 .fill(1.0) 真触发 OOM）；设备节点测试 `os.stat.S_IFBLK` 笔误改 `stat.S_IFBLK`。
- **api 集成 3 败修复**：sandbox-jobs 测试字段名错（kind→type + 补 ownerId，该文件从未真正运行过）；research 断言过期（P1D-9 改 {research:{version}} 包装，测试没跟上）；配额 2 败根因=其他测试文件 afterAll `quotaPolicy.deleteMany()` 全表清理误杀迁移 20 seed 行（实现无错，测试改自建夹具+精确回收）。
- **最终证据**：云上 `sandbox-(security|escape)` 19/19 过；api 集成 21 文件 104/104 过（无 skipped）。
- **结构性隐患（已记 Memory）**：集成测试全表 cleanup 惯例会误杀任何 seed 依赖；P1D-9 未跑 research 测试说明集成套件缺 CI 强制门禁（需 Docker 环境）。

## 2026-08-06（补六）— 卫生审计清零：syncpack 版本对齐 + knip 杂项修复

- **audit:deps（syncpack）**：science-worker 的 @types/node/typescript 版本与全仓对齐；14 个包 vitest `2` → `^2` 统一（syncpack fix），`audit:deps` 转绿。
- **audit:knip 清零**（除豁免项）：ioredis 补进 apps/api devDependencies（原靠 hoist）；`@types/diff`（diff@9 自带类型）与 `fake-indexeddb`（无引用）移除；agent-worker 测试跨包深引用改为 `@openscience/domain/test-helpers` 子路径导出（domain package.json 新增 exports 映射，已确认全仓无其他深引用）；5 个 unused exports/types 分诊——`WARNING_CATEGORIES`/`getUsageByPeriod`/`UsagePeriodQuery` 为计划内预留（补了 usage-ledger period 过滤测试 + fake 保真度），`PolicyViolation`/`HighRiskState` 去 export。
- **audit:dep（depcruise）**：6 个 orphan 均为占位/待接线文件（search/ui/sandbox-controller/sandbox-cache 等），warn 级设计内。
- **audit:dup（jscpd）**：7.79%（178 clones），信息级无门禁，不在本轮范围。
- knip 剩余 3 个 unused files = 待接线的沙箱前端组件（ScriptModifier/VisualizationResult/sandbox-cache），留给前端设计阶段接线，属预期。

## 2026-08-06（补五）— 技术债清零：schema 模型补齐、产物落库闭环、完成事件接通知

### 修复内容
- **schema.prisma 漂移**：补 `model SandboxJob`/`SandboxArtifact`/`enum SandboxJobStatus`（严格对齐迁移 20/21 DDL；memberships 复合 FK 因列序与 prisma 唯一键相反，仅 DB 侧强制不建模）；User/Workspace 加反向关系。仅 `prisma generate`，不走 migrate dev/db push。`sandbox-jobs.integration.test.ts` 的 `prisma.sandboxJob` 自此名正言顺。
- **产物落库闭环（P1E-6 缺口）**：P1E-4 设计文档只定义了 SandboxArtifact 数据模型（§4.2），未规定产出机制。采用最简约定：脚本写产物到容器 `/output`（tmpfs 挂载 + `OUTPUT_DIR` env），执行完 `getArchive` 拉 tar → 自研最小 ustar 解包（`artifact-collector.ts`，无新依赖）→ `createSandboxArtifacts` 落库（先于状态写回）。收集失败返回空不炸作业。
- **完成事件接通知（P1C-9）**：`onSandboxJobCompleted` 同事务补 `notification.create`（type `sandbox_job.completed`，payload 带 status 区分成功/失败/超时，对齐 §16 点分风格）。
- **auth fake 补 level**：`fakes.ts` user.create 默认 `level: 'free'`，CurrentUser.level 单测有真实值。
- **单测新增 15 例**（job-runner 8 + artifact-collector 7，全 mock 接缝，不依赖 Docker）。

## 2026-08-06（补四）— 迁移 19/20/21 云上 deploy 完成（生产库已验证）

- 容器内 `migrate deploy` 成功：迁移 20（sandbox_jobs）+ 21（sandbox_job_context + users.level）应用完成，并顺带补上此前漏 deploy 的 19（author_affiliation）——生产库此前实际停在 18。
- 生产库直查验证：`sandbox_jobs.context` / `sandbox_artifacts` / `users.level` 列均在，`user_level` 配额 9 行（free/pro/team × 3 资源）落库。
- 至此迁移 1–21 全部云上生效。**遗留**：生产 compose 仍无 science-worker 常驻服务（用户选择本次只上迁移），沙箱作业执行链要真正跑起来需后续走 infra-runbook 流程加服务。

## 2026-08-06（补三）— science-worker 执行链接线 + updateSandboxJobStatus 合并写

### 排查结论
- **执行链未接线**：`apps/science-worker/src/index.ts` 此前只有 `export const placeholder = true`，POST /sandbox-jobs 落库后无任何消费者（全仓 grep 证实 `updateSandboxJobStatus`/`onSandboxJobCompleted` 仅被 domain 自身与测试引用）。设计文档数据流图（创建任务 → SandboxController → 状态/记账/审计）从未落地。
- **已修复**：science-worker 新增注入式 `pollOnce`（接缝参照 agent-worker createPollOnce）：`claimNextPendingSandboxJob`（domain 新增，UPDATE ... FOR UPDATE SKIP LOCKED 原子认领置 running，多 worker 安全）→ `SandboxController.execute` → `updateSandboxJobStatus` + `onSandboxJobCompleted`（审计 + UsageLedger 记账）；`main()` 串行轮询，空闲/异常退避 2s；ESM 入口用 `import.meta.url` 守卫（本包 `"type": "module"`，无 require.main）。
- **updateSandboxJobStatus 合并写**：result 改 `COALESCE(result,'{}'::jsonb) || 新结果`，保留创建时存入的 idempotencyKey；result 缺省（纯状态推进）时不再动 result 列（旧逻辑会写成 null 连带冲掉幂等键）。选合并写而非新列，无需迁移 22。
- **单测**：`apps/science-worker/test/job-runner.test.ts` 7 例（无作业退避 / completed / timeout / failed / 执行器异常兜底 / 截断标记 / exitCode 推导），全 mock 接缝，不依赖 Docker。

## 2026-08-06（补二）— P1E-5 遗留四项修复：artifact 归属过滤、users.level 配额档、context 字段、迁移 21

### 修复内容
- **getSandboxArtifact 加 jobId 过滤**（`packages/domain/src/sandbox/jobs.ts`）：签名改 `(deps, jobId, artifactId)`，SQL 加 `AND job_id = ...`，防同 workspace 成员跨 job 猜测下载；路由调用点同步。
- **jobs.ts $queryRaw 列名对齐**（顺带修的潜伏 bug）：`SELECT *`/`RETURNING *` 返回 snake_case 键，camelCase 字段（workspaceId/createdAt 等）运行时为 undefined（路由 GET 会 500）；全部改显式列清单 + `AS "camelCase"` 别名。
- **users.level 配额档**（修复 4）：User 表本无 level 列（集成测试 `level: 'free'` 一直引用不存在字段）；迁移 21 `ALTER TABLE users ADD COLUMN level TEXT NOT NULL DEFAULT 'free'` + schema.prisma 同步；`CurrentUser` 加 `level`，`getCurrentUser` 选出；`/sandbox-jobs` 创建时 `userLevel: user.level` 传回 `checkPythonTaskQuota`，恢复 user_level 回退层。
- **context 字段**（修复 3）：迁移 21 加 `sandbox_jobs.context JSONB`；domain `createSandboxJob` 入参/落库、路由 schema/GET 响应、前端 `CreateSandboxJobRequest`/`SandboxJobView` 全链路透传。
- **限流核实**（修复 2，无需改码）：`RATE_LIMIT_ROUTES['/sandbox-jobs'] = 10/60s` 已配置，`rate-limit.ts` keyGen 用 `ip + route`（P1A-8 统一做法），不依赖 `req.user`，限流真实生效；设计文档 §4.1 的 `req.user.id` keyGen 是未实现的设想。
- **迁移 20 INSERT 缺列 bug（顺带修）**：quota seed 的 INSERT 目标 7 列、SELECT 仅 6 表达式且 scope 列错位，deploy 必报 42601；已补 `'user_level'` 常量（迁移 20 从未 commit/apply，改动安全）。
- 迁移 20–21 均待云上 deploy（云上写操作需用户确认）。

## 2026-08-06（补）— 交接复查：AGENTS.md 补更、迁移 20 规整、docs-sync 门禁脚本落地

### 背景
MVP 交接复查发现两类文档失真：AGENTS.md 自 P1B-2（1e859df，08-03）后未随收口更新；索引存在幻影条目。

### 修复内容
- **AGENTS.md 补更至 MVP 现状**：apps（api 50+ 端点全谱系 / web 四块前端 / agent-worker / science-worker）、packages（13 包，search/ui 仍占位）、infra（迁移 1–20、sandbox 镜像）、Overview 加 MVP 状态、文档分类表补 docs/security/。
- **沙箱迁移规整**：`packages/database/migrations/13,14`（游离于 prisma 流程外）→ 收编为 `infra/migrations/20260806020000_sandbox_jobs/`（幂等写法：IF NOT EXISTS / duplicate_object 捕获 / seed 存在性守卫，云上无论是否手工建过表均可安全 deploy）+ rollback.sql；原文件标 DEPRECATED 留存。
- **docs-sync 门禁脚本**：`scripts/docs/check-docs-sync.mjs`（检查 A 索引路径存在性 / B docs 目录反向登记 / C AGENTS 迁移数一致性），挂入根 `lint` 第三段（CI 自动覆盖）+ `audit:docs-sync` 独立入口。
- **脚本首跑检出并已修**：P1D-7 handoff 幻影登记（索引删行）、docs/proposals/ 目录缺失（补 .gitkeep）、AGENTS 迁移数漂移（1–19 → 1–20）。
- **P1E 补充索引勘误**：p1e-1/2 设计文档条目为幻影（已标注移除）；迁移路径登记错误（已改为实际路径）。

### 遗留
- 迁移 20 尚未云上 deploy（云上写操作需用户确认）。
- 若云上曾手工执行过 13/14 号 SQL，`migrate deploy` 因幂等写法可直接通过。

## 2026-08-06 — 🎉 MVP (Phase 0-1E) 全部完成！P1E-8 沙箱威胁模型与逃逸基线测试交付

### ✅ Phase 1E 轻量科学可视化完成

| 任务 | 状态 | 提交 | 详情 |
|------|------|------|------|
| P1E-1 | ✅ | dc04c04 | Visualization Planner 子 Agent |
| P1E-2 | ✅ | 1b6aa17 | Python AST 策略检查器（白名单模块+黑名单函数） |
| P1E-3 | ✅ | adffb60, 6c50561 | 沙箱基础镜像（Python 3.11 + 科学计算库） |
| P1E-4 | ✅ | ac8e362 | Sandbox Controller 与隔离 Docker 网络 |
| P1E-5 | ✅ | a6f6f88 | Sandbox Jobs API 与三维配额系统 |
| P1E-6 | ✅ | ddb21f2 | 可视化结果展示与 IndexedDB 临时存储 |
| P1E-7 | ✅ | 2ba9965, 9a41364 | 自然语言修改脚本与 diff 展示 + 自动任务切换 |
| P1E-8 | ✅ | 52ff62e | 沙箱威胁模型文档与逃逸基线测试 |

### P1E-8 交付物

**安全文档**（3 个，~2800 行）：
1. **[sandbox-threat-model.md](security/sandbox-threat-model.md)** (942 行)
   - STRIDE 威胁模型：6 大威胁类型（Spoofing/Tampering/Repudiation/Information Disclosure/DoS/Privilege Escalation）
   - 5 类具体攻击场景：网络突破/容器逃逸/资源耗尽/策略绕过/数据泄露
   - 多层防御（7 层）+ 残留风险评估（高/中/低）
   - 缓解路线图：P0 生产前必做 / P1 短期改进 / P2 中期改进
   - 事件响应流程：容器逃逸/DoS 检测与响应

2. **[sandbox-security-statement.md](security/sandbox-security-statement.md)** (469 行)
   - 安全承诺：6 大安全措施（网络隔离/资源限制/文件系统/权限/生命周期/审计）
   - 16 项基线测试：网络 3 + 资源 3 + 文件系统 2 + 逃逸 4 + 策略绕过 4
   - 用户责任与禁止行为
   - 法律免责声明（待法律团队审核）
   - 漏洞报告流程（负责任披露 + 90 天保密期）

3. **[production-security-checklist.md](security/production-security-checklist.md)** (661 行)
   - P0 生产前必做（5 大类）：独立 ECS/镜像扫描/监控告警/安全测试/法律审核
   - P1 短期改进：AST 引擎/并发限制/事件响应/CVE 监控
   - P2 中期改进：gVisor/AppArmor/外部日志归档/定期审查
   - 检查清单记录表 + 风险接受签字确认

**基线测试扩展**：
- [sandbox-escape.test.ts](../apps/science-worker/test/sandbox-escape.test.ts) (230 行)
  - 容器逃逸组（4 项）：Docker socket/特权提升/capabilities/设备节点
  - 策略绕过组（4 项）：动态导入/Base64/字符串拼接/pickle 反序列化
  - 防御验证：综合安全约束验证

**文档更新**：
- README.md: 添加安全文档入口（🔒 安全文档部分）

### 🏆 MVP 里程碑

**已完成 Phase**：
- ✅ Phase 0: 现有系统审计
- ✅ Phase 1A: 平台底座（Auth/Workspace/RBAC/配额/审计/CI/CD）
- ✅ Phase 1B: SDF 与版本（Schema/编辑器/存储/版本引擎/Diff/可见性）
- ✅ Phase 1C: 协作（Branch/Issue/PR/Review/作者组/许可/通知）
- ✅ Phase 1D: Hermes 与发布（AI Gateway/异步任务/Extractor/审核/申诉/审批/发布/公开页）
- ✅ Phase 1E: 轻量科学可视化（Planner/AST 检查/沙箱/作业 API/展示/修改/威胁模型）

**统计数据**：
- 总提交数：100+ commits
- 数据库迁移：19 个 migrations
- API 端点：50+ endpoints
- 测试覆盖：99/99 云上集成测试
- 文档：20+ 设计文档，10+ 计划文档

### ⏳ Next Steps

**生产前必做（P0）**：
- [ ] 独立 ECS 部署（沙箱与数据库物理隔离，§23 风险 5）
- [ ] 法律团队审核免责声明（责任限制/管辖法律条款）
- [ ] 第三方渗透测试
- [ ] 所有安全测试在 Docker 环境验证（16 项基线测试）
- [ ] 容器镜像安全扫描（Trivy/Clair 集成 CI）
- [ ] 监控告警配置（作业失败率/Docker daemon/审计日志）

**Phase 2 占位（不在 MVP 范围）**：
- Spec §19 功能清单：高级协作/高级可视化/企业版功能

---

## 2026-08-04 — P1D-8 发布事务与状态机推进完成：迁移 18 + /publications，云上 99/99，task-master 5.8 done

### ✅ Completed
| 任务 | 详情 |
|---|---|
| design gate | 五决策：迁移 18 / 三重前置 / status+publish 端点 / parentVersion 链 / 幂等+不可变 |
| migration 18 | VersionStatus 枚举扩展（8 态 §4.1）+ Version.parentVersionId + rollback |
| domain publish/ | transitionVersionStatus（§4.1 状态机表 + 终态禁变更）+ publishVersion（AI 审核 passed + 许可齐全 + R3 确认 + assignPublicId 内联 + Publication UTC 时间戳/哈希/免责声明 + version.published 事件 + 审计只追加 + 幂等） |
| API | POST /versions/:id/status + POST /versions/:id/publish |
| 测试 | domain 单测 7 新增（275 总全绿）+ 集成 2 新增；**云上集成 99/99**（新增 P1D-8 2 + 既有 97）；迁移 18 applied |
| task-master 5.8 | done |

### Key Decisions / 坑
- **三重前置（§2.3-4）**：AI 审核 passed（P1D-5）+ 许可齐全（§6.3）+ R3 确认（§9.4）缺一拒绝
- **内容哈希（§6.2）**：coreJson + entries 共同参与（computeContentSha256 只算 entries，空 entries 版本哈希相同 → 改 corePart+entryPart）
- **ID 分配内联**：外层事务已开，避免 assignPublicId 嵌套事务（P1C-5 坑复用）
- **§6.2 免责声明**：LEGAL_DISCLAIMER 固定文案（不承诺专利/著作权/司法存证）
- **关键语义修正**：P1B-4 createCommit 原「latestVersion published → 拒绝」**过度严格**——§2.2-3 允许新 commit 产生增量版本（不原地修改）；移除拒绝，已公开不可变由发布管线保证
- **坑**：`/** */` 注释 Prisma 非法；删 published 检查后 latestVersion 变量仍被下游 diff 用（需保留声明）

### ⏳ Next Steps
- [x] ~~P1D-8 发布事务~~ 完成（2026-08-04）：迁移 18 + /publications，云上 99/99，5.8 done
- [ ] **P1D-9（task-master 5.9）**：公开 RO 页面与必显信息（§4.3 十标签 + 必显信息 + 免责声明 + public 可索引/private 拒绝 + SSR + /research/OSR/v/N）
- [ ] parked：P1A-3 终审项、P1A-5 deferred ①、/admin TOTP 上线路障、SDF Schema 债务（0.2.0）、病毒扫描实装（P1B-后续）、Version 发布状态机（P1B-后续）

---

## 2026-08-04 — P1D-1 AI Gateway 统一路由与调用日志完成：ai-gateway 包，云上 86/86，task-master 5.1 done

### ✅ Completed
| 任务 | 详情 |
|---|---|
| design gate | 五决策：fetch 直连 / 配置化回退 / audit 日志脱敏 / 手写 schema 守卫 / 流式占位 |
| ai-gateway 包 | provider.ts（Provider 接口 + OpenAiCompatProvider fetch 直连）+ gateway.ts（AiGateway：路由/回退/调用日志/completeStructured/stream）+ errors.ts |
| config | ApiEnv.ai（enabled/baseUrl/apiKey/primaryModel/fallbackModels，§24 占位） |
| 测试 | ai-gateway 单测 9 新增（9/9 绿）+ 集成 2 新增；**云上集成 86/86**（新增 P1D-1 2 + 既有 84） |
| task-master 5.1 | done |

### Key Decisions / 坑
- **fetch 直连（Q1）**：OpenAI 兼容 /chat/completions，零 SDK 依赖 + 可 mock；60s 超时
- **回退（Q2）**：providers 列表，primary 失败逐级回退 + fallbackReason 记录；全败 → ALL_PROVIDERS_FAILED
- **调用日志（Q3）**：deps.audit（action='ai.gateway.call'，字段：provider/model/inputTokens/outputTokens/latencyMs/error/fallbackReason）+ **脱敏**（只记元数据，绝不记 prompt/密钥，§17）
- **结构化（Q4）**：completeStructured + 手写 SchemaGuard + 重试上限 2
- **流式（Q5）**：stream() 接口占位（STREAM_NOT_IMPLEMENTED，5.3 实装）
- **坑**：apps/api 需加 @openscience/ai-gateway 依赖（集成测试 import 失败）；`_opts`/`_message` 不被 eslint 忽略 → void

### ⏳ Next Steps
- [x] ~~P1D-1 AI Gateway~~ 完成（2026-08-04）：ai-gateway 包，云上 86/86，5.1 done
- [ ] **P1D-2（task-master 5.2）**：Hermes 会话与异步任务通道（AgentSession/AgentTask + 队列 + SSE 进度）
- [ ] parked：P1A-3 终审项、P1A-5 deferred ①、/admin TOTP 上线路障、SDF Schema 债务（0.2.0）、病毒扫描实装（P1B-后续）、Version 发布状态机（P1B-后续）

---

## 2026-08-04 — P1D-2 Hermes 会话与异步任务通道完成：迁移 15 + agent-worker，云上 88/88，task-master 5.2 done

### ✅ Completed
| 任务 | 详情 |
|---|---|
| design gate | 五决策：三表迁移 / Redis List 队列 / 轮询进度 / worker handler 注册表 / 配额校验 |
| migration 15 | agent_sessions/agent_tasks/tool_approvals + AgentTaskStatus 枚举 + rollback |
| domain agent/ | createAgentSession/submitAgentTask（幂等键 + AI Credit 配额 §9.1）/getAgentTask/listAgentSessions/markTaskProgress（状态机 + 终态幂等 skip） |
| agent-worker | pollOnce（BRPOPLPUSH Redis 队列 + handler 注册表 + markTaskProgress）+ 主循环 |
| API | POST/GET /agent/sessions + POST /agent/tasks + GET /agent/tasks/:id |
| 测试 | domain 单测 5 新增（243 总全绿）+ 集成 2 新增；**云上集成 88/88**（新增 P1D-2 2 + 既有 86）；迁移 15 applied |
| task-master 5.2 | done |

### Key Decisions / 坑
- **队列（Q2）**：Redis List BRPOPLPUSH + processing 队列（崩溃恢复）；agent-worker poll 消费
- **消费者幂等（§16）**：任务状态机 pending→running→succeeded 单向前进；succeeded 后重放 → skip（不重复副作用）
- **进度（Q3）**：轮询 API（DB 进度，断线恢复天然）；SSE 5.3 增强
- **配额（Q5，§9.1）**：submitAgentTask 时 getBalance(ai_credit) ≤ 0 → INSUFFICIENT_CREDIT 409
- **坑**：Redis 队列跨运行持久化 → 陈旧任务 id poll 消费（findUnique null）→ beforeAll/afterAll 清 agent:queue；ai-gateway audit record 需 await（fire-and-forget 竞态 → 测试 undefined）；domain 需 ioredis type dep

### ⏳ Next Steps
- [x] ~~P1D-2 异步任务通道~~ 完成（2026-08-04）：迁移 15 + agent-worker，云上 88/88，5.2 done
- [ ] **P1D-3（task-master 5.3）**：SDF Extractor 建议式提取与确认写入（§9.2 + §5.4）
- [ ] parked：P1A-3 终审项、P1A-5 deferred ①、/admin TOTP 上线路障、SDF Schema 债务（0.2.0）、病毒扫描实装（P1B-后续）、Version 发布状态机（P1B-后续）

---

## 2026-08-04 — P1D-3 SDF Extractor 建议式提取完成：worker handler + 编辑器通路，云上 90/90，task-master 5.3 done

### ✅ Completed
| 任务 | 详情 |
|---|---|
| design gate | 五决策：worker sdf.extract handler / 建议存任务 result / 复用 P1B-8 草稿确认 / 轮询进度 / 按钮触发 |
| agent-worker extractor.ts | sdfCoreGuard（六字段 + schemaVersion const 校验 §5.1/§5.3）+ extractHandler（completeStructured + 不写 SDF §9.2） |
| worker 重构 | createHandlers(gateway) + createPollOnce（handler 注册表 + 注入 gateway） |
| 前端 | lib/api submitExtractTask/getAgentTask + lib/suggestions coreToSuggestions（逐字段 diff §5.4）+ SuggestionsPanel「AI 提取」按钮 + 进度条 + 轮询 |
| 测试 | agent-worker 单测 4 + web 3 新增（32 总）；**云上集成 90/90**（新增 P1D-3 2 + 既有 88） |
| task-master 5.3 | done |

### Key Decisions / 坑
- **提取不写 SDF（§9.2）**：extractHandler 只产出 core 建议，用户确认后经前端 updateSdf 落库
- **Schema 校验（§9.3）**：sdfCoreGuard 对齐 sdf-schema coreSchema（schemaVersion const '0.1.0' + 六字段 string）
- **确认写入（§5.4）**：coreToSuggestions → SuggestionsPanel 逐字段 apply → 草稿（P1B-8）→ updateSdf
- **R1 挂接**：整批批准升级 P1D-4
- **坑**：createPollOnce 重构破坏 agent.integration（pollOnce 直 import → createPollOnce）；`while(true)` no-constant-condition 不报但 eslint-disable unused 报

### ⏳ Next Steps
- [x] ~~P1D-3 SDF Extractor~~ 完成（2026-08-04）：worker + 编辑器通路，云上 90/90，5.3 done
- [ ] **P1D-4（task-master 5.4）**：R0-R4 分级审批与统一确认交互（§9.4）
- [ ] parked：P1A-3 终审项、P1A-5 deferred ①、/admin TOTP 上线路障、SDF Schema 债务（0.2.0）、病毒扫描实装（P1B-后续）、Version 发布状态机（P1B-后续）

---

## 2026-08-04 — P1D-4 R0-R4 分级审批与统一确认交互完成：approval domain + /agent/approvals，云上 92/92，task-master 5.4 done

### ✅ Completed
| 任务 | 详情 |
|---|---|
| design gate | 五决策：approvalLevel 纯函数 / ToolApproval 状态机含撤销 / buildConfirmation 五要素 / owner 权限 / 挂接登记 |
| 迁移 | 无（ToolApproval 表 P1D-2 迁移 15 已建） |
| domain approval/ | approvalLevel（R0-R4 映射 + 未知→R3 安全默认）+ buildConfirmation（§9.4 五要素 i18n）+ createApproval（R0 自动 + 同批去重）/approveApproval/rejectApproval/revokeApproval（状态机 + owner 校验 + 审计）/listPendingApprovals |
| API | GET /agent/approvals/pending + POST /:id/{approve,reject,revoke} |
| 测试 | domain 单测 10 新增（253 总全绿）+ 集成 2 新增；**云上集成 92/92**（新增 P1D-4 2 + 既有 90） |
| task-master 5.4 | done |

### Key Decisions / 坑
- **分级（Q1，§9.4）**：R0 读自动 / R1 草稿批量 / R2 协作任务内 / R3 Merge·发布·作者·许可·可见性 / R4 删除·所有权·密钥；未知 → R3
- **五要素（Q3）**：what/scope/reversible/estCost/estTime（buildConfirmation i18n 模板，中文优先）
- **同批去重（§9.4）**：同 task+scope approved → 返回既有不重复弹窗
- **撤销（§2.5-7）**：approved → revoked（状态机含）
- **坑**：approvalLevel 返回 number 需 as ApprovalLevel 断言；fake toolApproval update 需模仿 Prisma undefined 忽略（否则 scope 被覆盖）

### ⏳ Next Steps
- [x] ~~P1D-4 R0-R4 审批~~ 完成（2026-08-04）：approval domain，云上 92/92，5.4 done
- [ ] **P1D-5（task-master 5.5）**：发布审核硬阻断检查管线（§11.1 七类硬阻断 + AIReview 实体）
- [ ] parked：P1A-3 终审项、P1A-5 deferred ①、/admin TOTP 上线路障、SDF Schema 债务（0.2.0）、病毒扫描实装（P1B-后续）、Version 发布状态机（P1B-后续）

---

## 2026-08-04 — P1D-5 发布审核硬阻断检查管线完成：迁移 16 + 七类硬阻断，云上 94/94，task-master 5.5 done

### ✅ Completed
| 任务 | 详情 |
|---|---|
| design gate | 五决策：迁移 16 / 恶意代码扩展名黑名单 / Notification 事件 / 成员触发 / POST+GET review |
| migration 16 | ai_reviews（versionId @unique + status + hardBlocks/warnings Json）+ rollback |
| domain review/blocking.ts | 纯函数：checkCoreCompleteness（§5.1 六字段）/checkMaliciousArtifact（§11.1 危险扩展名+MIME）/checkSensitiveContent（§17 身份证/密钥/令牌）/checkProhibitedContent |
| domain review/publish-review.ts | runPublicationReview（七类 + AIReview upsert + 事件 + 审计）+ getPublicationReview（§11.3 稳定记录） |
| API | POST/GET /versions/:versionId/review |
| 测试 | domain 单测 8 新增（261 总全绿）+ 集成 2 新增；**云上集成 94/94**（新增 P1D-5 2 + 既有 92）；迁移 16 applied |
| task-master 5.5 | done |

### Key Decisions / 坑
- **七类硬阻断（§11.1）**：缺字段（版本 manifest core）/ 恶意代码 / 隐私泄露 / 违法内容 / 权限无法确认（非创建者）/ 缺许可 / manifest 缺失
- **AIReview（§15）**：versionId 唯一 + upsert 幂等 + 稳定可引用（§11.3 申诉）
- **事件（§16）**：ai_review.completed Notification
- **Safety Reviewer 不替代人工（§9.2）**：登记
- **坑**：core 应读**版本 manifest coreJson**（§7.2.3 快照）而非 sdfDocument（commit 不更新 sdfDocument）；fake version.findUnique 需 manifest include；entries 空 = 纯文本版本合法（仅校验 coreJson 存在）

### ⏳ Next Steps
- [x] ~~P1D-5 发布审核硬阻断~~ 完成（2026-08-04）：迁移 16 + 七类，云上 94/94，5.5 done
- [ ] **P1D-6（task-master 5.6）**：发布审核警告层与结构化审核报告（§11.2 七类警告 + 证据位置 + 不确定性）
- [ ] parked：P1A-3 终审项、P1A-5 deferred ①、/admin TOTP 上线路障、SDF Schema 债务（0.2.0）、病毒扫描实装（P1B-后续）、Version 发布状态机（P1B-后续）

---

## 2026-08-04 — P1D-6 发布审核警告层与结构化审核报告完成：review.analyze handler，云上 95/95，task-master 5.6 done

### ✅ Completed
| 任务 | 详情 |
|---|---|
| design gate | 五决策：AiWarning Schema / worker handler / AIReview.warnings 存储 / 不阻断 / 异步入队 |
| agent-worker reviewer.ts | AiWarningGuard（§11.2 七类 + evidence/uncertainty/suggestion 校验）+ reviewAnalyzeHandler（completeStructured + saveWarnings） |
| domain | saveWarnings（AIReview.warnings upsert 独立 status）+ getPublicationReview 返回 warnings |
| API | POST /versions/:id/review 同步硬阻断 + 异步入队 review.analyze |
| 测试 | worker 单测 4 新增（8 总）+ 集成 1 新增；**云上集成 95/95**（新增 P1D-6 1 + 既有 94） |
| task-master 5.6 | done |

### Key Decisions / 坑
- **§11.2 七类警告**：method_logic/statistical/figure_spec/data_consistency/reproducibility/missing_citation/overreach
- **结构化报告**：evidence（证据位置）+ uncertainty（不确定性）必须，**无单一分数**；prompt 约束不裁定对错/不伪造来源（§9.2）
- **不阻断（§11.2）**：warnings 更新不动 status（含警告版本仍可发布）
- **触发（Q5）**：POST /versions/:id/review 同步硬阻断 + 异步入队 analyze（不阻塞响应）
- **坑**：saveWarnings 需轻量 deps（AgentDeps 无 storage）；路由异步入队任务在测试队列里 → poll 需逐项消费直至目标任务完成

### ⏳ Next Steps
- [x] ~~P1D-6 警告层~~ 完成（2026-08-04）：review.analyze handler，云上 95/95，5.6 done
- [ ] **P1D-7（task-master 5.7）**：审核申诉流程与 Moderator 队列（§11.3 稳定记录 + Appeal + 人工处理审计）
- [ ] parked：P1A-3 终审项、P1A-5 deferred ①、/admin TOTP 上线路障、SDF Schema 债务（0.2.0）、病毒扫描实装（P1B-后续）、Version 发布状态机（P1B-后续）

---

---
## 2026-08-04 — P1B-10 SDF 标准导出包生成与校验完成：export API + 脱库校验，云上 58/58，task-master 3.10 done

### ✅ Completed
| 任务 | 详情 |
|---|---|
| design gate | 五决策：zip/附件归位/archiver/成员可导出/paper.md 汇编 |
| domain export/ | manifest.ts（§5.3 序列化 + contentHash）+ packager.ts（buildExportPackage 重建 §5.2 目录树 + classifyArtifact）+ validate.ts（脱库校验 §5.3 MUST） |
| API | GET /versions/:id/export（archiver zip 流 + Content-Disposition） |
| 测试 | domain export 9 + api 集成 3 = 12 新增；本地门禁全绿；**云上集成 58/58**（新增 P1B-10 3 + 既有 55） |
| task-master 3.10 | done + details |

### Key Decisions / 坑
- **五决策**：zip（archiver）；附件按扩展名归位 figures/code/artifacts；成员可导出 + public 公开；paper.md 六字段汇编
- **§2.2.1** SDF 数据库表达 + 可导出文件包；**§5.3 MUST** 不依赖平台 DB 可读
- **§5.3 contentHash** = P1B-6 computeContentSha256 排序聚合
- archiver CJS 函数 vs @types 类 → createRequire(__dirname)；validate 返回 { ok } 非 { valid }；manifest.objectId 需 OSR ID（测试先 assignPublicId）

### ⏳ Next Steps
- [x] ~~P1B-10 导出包~~ 完成（2026-08-04）：export API + 云上 58/58，3.10 done
- [ ] **P1B-11（task-master 3.11）**：待任务清单
- [ ] parked：P1A-3 终审项、P1A-5 deferred ①、/admin TOTP 上线路障、SDF Schema 债务（0.2.0）、病毒扫描实装（P1B-后续）、Version 发布状态机（P1B-后续）、真实 AI 提取（Phase 1D SDF Extractor）、experiments/code 附件归位填充（Phase 1D）

---
## 2026-08-04 — P1B-9 移动端分步/抽屉编辑器与可访问性完成：Drawer + 虚拟化 + WCAG AA，next build 通过，task-master 3.9 done

### ✅ Completed
| 任务 | 详情 |
|---|---|
| design gate | 五决策：自写 Drawer/顶栏 tab/XHR 进度/窗口虚拟化/自写 focus trap |
| Drawer.tsx | 自写抽屉（aria-modal + focus trap + Esc + 焦点还原，§18.3） |
| MobileTabs + EditorLayout | 顶栏 tab（大纲/编辑/面板）+ 响应式（桌面三栏 / 移动单栏 + 抽屉，§5.4/§18.2 不删功能） |
| VersionList | 窗口虚拟化（pageVersions 纯函数 + IntersectionObserver 滚动加载，§18.3） |
| ArtifactUploader | XHR onprogress 进度条 + 失败重试（§18.3 可恢复） |
| WCAG AA | :focus-visible 焦点环 + nav/main/aside 语义化 + aria-label + role="alert" + 键盘导航 |
| 测试 | web 17（mobile pageVersions 4 新增）；next build 通过；本地门禁全绿 |
| task-master 3.9 | done + details |

### Key Decisions / 坑
- **五决策**：自写 Drawer（无 headlessui）；顶栏 tab + 抽屉（§5.4 不删功能）；XHR 真实进度（fetch 无原生）；窗口虚拟化（无 react-window）；自写 focus trap
- **§18.2** 移动端三栏改分步/抽屉不删功能；**§18.3** 键盘/焦点/语义化/对比度/虚拟化/进度
- fetch 上传无进度 → XHR onprogress（api.ts uploadArtifact 死代码删除）
- pageVersions 抽纯函数供单测（组件 state 难测）

### ⏳ Next Steps
- [x] ~~P1B-9 移动端 + 可访问性~~ 完成（2026-08-04）：Drawer + 虚拟化 + WCAG AA，3.9 done
- [ ] **P1B-10（task-master 3.10）**：待任务清单
- [ ] parked：P1A-3 终审项、P1A-5 deferred ①、/admin TOTP 上线路障、SDF Schema 债务（0.2.0）、病毒扫描实装（P1B-后续）、Version 发布状态机（P1B-后续）、真实 AI 提取（Phase 1D SDF Extractor）、E2E 浏览器测试（Phase 1D）

---
## 2026-08-04 — P1B-8 三栏 SDF 编辑器桌面端完成：apps/web 编辑器 + 建议确认 + 版本导航，next build 通过，task-master 3.8 done

### ✅ Completed
| 任务 | 详情 |
|---|---|
| design gate | 五决策：Markdown/react-markdown + next-intl + useReducer + localStorage 草稿 + 预置建议 |
| web 基础设施 | lib/api.ts（fetch 封装对接现有 API）+ lib/editor-state.ts（reducer + 草稿）+ lib/suggestions.ts（建议状态机） |
| 三栏布局 | EditorLayout（240+300px）+ OutlinePanel（六字段大纲 + 版本导航）+ CoreEditor（Markdown 六字段 + 预览）+ SuggestionsPanel（建议 diff 卡片）+ ArtifactUploader（P1B-3 管线） |
| 主页面 | app/research-objects/[id]/edit：草稿恢复横幅 + 错误面板 + 保存/提交 + 版本 diff 导航 |
| i18n | messages/zh.json + en.json（§2.5.5 中文优先，文案全走 useTranslations） |
| 测试 | web 13（reducer 4 + 草稿 4 + 建议 4 + 合同 1）；next build 通过；本地门禁全绿 |
| task-master 3.8 | done + details |

### Key Decisions / 坑
- **五决策**：Markdown（§5.4 Markdown 先行）；next-intl（§2.5.5 中文优先）；useReducer 草稿；localStorage（§18.3 自动保存）；预置建议（Phase 1D extractor 接同通路）
- **§5.4 MUST 建议确认**：应用 → 写草稿（不直接写 SDF）→ 保存 PATCH 落库
- **§18.3 错误提示**：重试/保存草稿/问题定位
- page 组件相对路径 4 层；knip web project 加 components/lib glob；localStorage node 测试 mock

### ⏳ Next Steps
- [x] ~~P1B-8 编辑器~~ 完成（2026-08-04）：apps/web 三栏 + next build，3.8 done
- [ ] **P1B-9（task-master 3.9）**：待任务清单
- [ ] parked：P1A-3 终审项、P1A-5 deferred ①、/admin TOTP 上线路障、SDF Schema 债务（0.2.0）、病毒扫描实装（P1B-后续）、Version 发布状态机（P1B-后续）、真实 AI 提取（Phase 1D SDF Extractor）

---
## 2026-08-04 — P1B-7 RO 可见性模型与 API 权限强制完成：迁移 11 + 三态矩阵 + 扩大审批记录，云上 55/55，task-master 3.7 done

### ✅ Completed
| 任务 | 详情 |
|---|---|
| design gate | 五决策：VisibilityGrant 表/扩大阻断+请求/public 可索引/匿名 public/变更幂等 |
| migration 11 | visibility_grants（ro+grantee 唯一）+ visibility_requests（from/to_visibility + status）+ rollback |
| domain | visibility/：errors + access（canAccessRo 三态矩阵 §4.2 + requireRoAccess 越权 404）+ requests（requestVisibilityChange 缩小应用/扩大阻断+请求/幂等 + grantVisibility） |
| API | GET /research-objects/:id 改 canAccessRo + POST /:id/visibility（扩大 202/缩小 200）+ POST /:id/visibility-grants；error-map VisibilityError（REQUEST_PENDING=409） |
| 读操作改造 | getResearchObject/getSdfDocument 用 requireRoAccess（invite_only grant 可读） |
| 测试 | domain visibility 10 + api 集成 5 = 15 新增；本地门禁全绿；**云上集成 55/55**（新增 P1B-7 5 + 既有 50） |
| task-master 3.7 | done + details |

### Key Decisions / 坑
- **五决策**：invite_only 用 VisibilityGrant（§4.2 指定账户）；扩大可见性立即阻断 + VisibilityRequest(pending)（§4.2 显式审批，审批流 Phase 1D）；public 可索引；/research/* 仅 public 匿名；变更幂等
- **§3.3 API 层强制**：所有资源路由统一走可见性判定，禁仅前端隐藏
- **§17 越权防护**：跨 Workspace/invite_only 未 grant/绕过前端 → 404
- GET 路由 canAccessRo + domain requireMembership 双层冲突 → domain 读操作改 requireRoAccess
- 测试断言 /空间不存在/ → /研究对象不存在/（VisibilityError）

### ⏳ Next Steps
- [x] ~~P1B-7 可见性~~ 完成（2026-08-04）：迁移 11 + 云上 55/55，3.7 done
- [ ] **P1B-8（task-master 3.8）**：待任务清单
- [ ] parked：P1A-3 终审项、P1A-5 deferred ①、/admin TOTP 上线路障、SDF Schema 债务（0.2.0）、病毒扫描实装（P1B-8）、Version 发布状态机（P1B-后续）、大文件分片（P1B-后续）、AI diff 摘要（Phase 1D）

---
## 2026-08-04 — P1B-6 标识层与时间戳服务完成：packages/identity + 迁移 10 + /research 公开 URL，云上 50/50，task-master 3.6 done

### ✅ Completed
| 任务 | 详情 |
|---|---|
| design gate | 五决策：UUID v7 手写/publicId 发布时分配/公开 ID 全局递增/公开 URL 仅 public/内容哈希排序聚合 |
| packages/identity | uuid7（RFC 9562 手写）+ public-id（OSR-YYYY-NNNNNN 生成/解析 + 版本 ID -vN + 稳定 URL） |
| migration 10 | research_objects.public_id + versions.public_version_id（unique）+ identifiers/publications 表（legal_disclaimer 预留 §6.2）+ rollback |
| config | publicIdPrefix env（PUBLIC_ID_PREFIX 缺省 OSR，§24 配置项禁写死） |
| domain | assignPublicId（发布时分配 + updateMany 并发安全 + ID 永不复用 §6.1）+ computeContentSha256（§6.2 哈希聚合） |
| API | GET /research/:publicId + /research/:publicId/v/:versionNo（匿名 public 可见，private 404） |
| 测试 | identity 11 + domain 6 + api 集成 5 = 22 新增；本地门禁全绿；**云上集成 50/50**（新增 P1B-6 5 + 既有 45） |
| task-master 3.6 | done + details |

### Key Decisions / 坑
- **五决策**：UUID v7（§6.1 内部主键，可排序）；publicId 发布时分配（P1B-7 触发）；OSR-YYYY-NNNNNN（年 + 全局 seq，前缀配置化）；/research/* 仅 public 匿名；contentSha256 排序聚合
- **ID 永不复用**（§6.1）：assignPublicId 同 RO 复用，updateMany where publicId=null 并发安全
- **时间戳**（§6.2）：Publication 只追加 + legal_disclaimer 字段预留
- fake Prisma 需同步 identifier count/create；research 路由多余 import 移除

### ⏳ Next Steps
- [x] ~~P1B-6 标识层~~ 完成（2026-08-04）：packages/identity + 云上 50/50，3.6 done
- [ ] **P1B-7（task-master 3.7）**：Version 发布状态机（draft→published，§4.1、§2.3.4）
- [ ] parked：P1A-3 终审项、P1A-5 deferred ①、/admin TOTP 上线路障、SDF Schema 债务（0.2.0）、病毒扫描实装（P1B-8）、大文件分片（P1B-后续）、AI diff 摘要（Phase 1D）

---
## 2026-08-04 — P1B-5 多类型确定性 Diff 服务完成：packages/diff 九类 diff + comparison API，云上 45/45，task-master 3.5 done

### ✅ Completed
| 任务 | 详情 |
|---|---|
| design gate | 五决策：不引 diff 库（LCS）/大二进制 1MB/CSV 行 diff/作者引用 input 传入/成员鉴权 |
| packages/diff | types（DiffType 九类）+ lines（LCS 行 diff）+ text-code/sdf/authors-citations/file/table/license + computeDiff 聚合 |
| domain | compareVersions（读两 Manifest + Blob size → computeDiff，不读对象内容 §7.2.6） |
| API | GET /versions/:from/comparison?to=:to |
| 测试 | diff 22 + domain 4 + api 集成 4 = 30 新增；本地门禁全绿；**云上集成 45/45**（新增 P1B-5 4 + 既有 41） |
| task-master 3.5 | done + details |

### Key Decisions / 坑
- **五决策**：§7.3 九类 diff 全部落地（文本/SDF 字段 RFC 6902/结论/作者/引用/文件增删哈希/表格/代码/许可证可见性）；§7.2.6 大二进制 >1MB 仅元数据（metadata_only）；确定性 diff 是事实来源，AI 摘要 Phase 1D
- **§7.1 差异区分**：DiffType 枚举区分文字/结构化/代码/数据/图表/结论
- LCS hunk 公共行不单独成 hunk（flush 只增删时触发）
- loadBlobSizes 误写 fromManifest.map（应为 entries.map）
- computeDiff 的 diffCode Phase 1D 接 Blob 内容后启用

### ⏳ Next Steps
- [x] ~~P1B-5 Diff 服务~~ 完成（2026-08-04）：packages/diff 九类 + 云上 45/45，3.5 done
- [ ] **P1B-6（task-master 3.6）**：待任务清单（读 task-master 3.6）
- [ ] parked：P1A-3 终审项、P1A-5 deferred ①、/admin TOTP 上线路障、SDF Schema 债务（0.2.0）、病毒扫描实装（P1B-8）、Version 发布状态机（P1B-7）、大文件分片上传（P1B-后续）、AI diff 摘要（Phase 1D）

---
## 2026-08-04 — P1B-4 Commit/Manifest 版本引擎完成：迁移 9 + /commits /versions API，云上 41/41，task-master 3.4 done

### ✅ Completed
| 任务 | 详情 |
|---|---|
| design gate | 五决策：ChangeSet 单 op / 初始 core 基准 / Version 仅 draft / Branch 表建 default main / artifact diff 自动算 |
| migration 9 | branches/commits/changesets/versions(version_no + VersionStatus)/version_manifests/manifest_entries 六表 + rollback |
| versioning 包 | patch.ts（fast-json-patch@3.1.1 applySdfPatch/diffSdfCore/validatePatch）+ manifest.ts（rebuildCore/buildSnapshot）；补 main/types + test |
| domain | commit/：errors + createCommit（乐观锁/幂等/公开不可变/Manifest 生成）/getVersion/rebuildVersion（blob sha256 校验） |
| API | POST /research-objects/:id/commits（Idempotency-Key）+ GET /versions/:id + /rebuild；error-map CommitError |
| 测试 | versioning 13 + domain commit 9 + api 集成 6 = 28 新增；本地门禁全绿；**云上集成 41/41**（新增 P1B-4 6 + 既有 35） |
| task-master 3.4 | done + details |

### Key Decisions / 坑
- **五决策**：ChangeSet 存单 op（§7.2.5 RFC 6902 apply 链）；初始 core = SdfDocument.coreJson 基准；Version 仅 draft（P1B-7 发布）；Branch 表建 default main（Phase 1C 扩展）；artifact 传完整集合 diff 自动算增删改（§7.2.4 复用 Blob）
- **公开不可变**（§2.2.3）：最新版本 published → commit 409 VERSION_PUBLISHED
- fake researchObject 缺 update 方法（只 updateMany，createCommit 用 update）
- Buffer.toWeb 不可 for-await 迭代（fake getObject 改 Readable.from）
- Operation[] → Prisma InputJsonValue 需 as unknown as 双转换

### ⏳ Next Steps
- [x] ~~P1B-4 版本引擎~~ 完成（2026-08-04）：迁移 9 + 云上 41/41，3.4 done
- [ ] **P1B-5（task-master 3.5）**：多类型确定性 Diff 服务（§7.3 九类：文本/SDF 字段/结论/作者/引用/文件增删哈希/表格/代码/许可证可见性，§7.2.6 大二进制仅元数据 diff）
- [ ] parked：P1A-3 终审项、P1A-5 deferred ①、/admin TOTP 上线路障、SDF Schema 债务（0.2.0）、病毒扫描实装（P1B-8）、Version 发布状态机（P1B-7）、大文件分片上传（P1B-后续）

---
## 2026-08-04 — P1B-3 Blob 内容寻址存储 + 上传管线完成：迁移 8 + /artifacts API，云上 35/35，task-master 3.3 done

### ✅ Completed
| 任务 | 详情 |
|---|---|
| design gate | 五决策：Blob 存储键分段 / logicalPath 非唯一 / MIME 失败允许上传 / file-type dynamic import / 配额只读不扣费 |
| migration 8 | blobs（sha256 主键 + storage_key + size）+ artifacts（logical_path/mime_type/size/blob_sha256/uploaded_by/workspace_id）+ rollback |
| Prisma | Blob + Artifact model + User/Workspace 关联 |
| storage | blob.ts：putBlob 去重（§7.1）/getBlob/headBlob/deleteBlob/getBlobStorageKey（分段键）；补 package.json main/types（P1A-2 漏，本任务暴露） |
| domain | artifact/：errors/mime（file-type@22 dynamic import）/quota（复用 resolvePolicy）/scan（占位）/artifacts（createArtifact 管线 + getArtifact） |
| API | /artifacts/upload POST（multipart）+ /artifacts/:id/download GET；error-map FILE_TOO_LARGE=413/MALICIOUS_FILE=451；app.ts storage 注入（缺省不注册） |
| config | api-env 加 storage（S3_* env） |
| 测试 | storage 9 + domain 11 + api 集成 6 = 26 新增；本地门禁全绿；**云上集成 35/35**（新增 P1B-3 6 + 既有 29） |
| task-master 3.3 | done + details |

### Key Decisions / 坑
- **五决策**：Blob 存储键 `blobs/<h2>/<h4>/<sha256>`；Artifact.logicalPath 非唯一（P1B-4 Manifest 去重）；MIME 失败允许上传（mimeType=null + 审计）；file-type ESM-only 用 dynamic import（全仓 esnext 破坏 CJS）；配额只读不扣费（P1B-6 记账）
- **detectMimeType 消费 Readable 流 → putBlob 再读空流 size=0**（集成测试抓到，改先统一转 Buffer）
- **MinIO 对象持久化跨测试运行** → afterAll 需删对象（DB 清行不够），否则 alreadyExists 误命中
- **限流测试跨运行残留（P1A-8 存量 flaky）**：rl key 窗口 3600s，前置清 key 修
- storage package.json 缺 main/types（P1A-2 从未被消费，P1B-3 首次暴露）
- cloud-sync 需 .cloud-sync-env（从 .env 中文键生成，本机临时重建）

### ⏳ Next Steps
- [x] ~~P1B-3 Blob 存储~~ 完成（2026-08-04）：迁移 8 + 云上 35/35，3.3 done
- [ ] **P1B-4（task-master 3.4）**：版本引擎 + Version Manifest 引用 Artifact（§16、§7.2.3）
- [ ] parked：P1A-3 终审项、P1A-5 deferred ①、/admin TOTP 上线路障、SDF Schema 债务（0.2.0）、病毒扫描实装（P1B-8）、大文件分片（P1B-5）

---
## 2026-08-03 — P1B-2 RO/SDF 数据模型完成：迁移 7 + API 骨架，云上集成 26/26，task-master 3.2 done

### ✅ Completed
| 任务 | 详情 |
|---|---|
| design gate | 三决策：UUID v4 沿用（v7 归 P1B-6）、SDFNode 固定六型枚举、visibility 本任务建（private 默认） |
| migration 7 | research_objects/sdf_documents/sdf_nodes + RoStatus 9 枚举/RoVisibility/SdfNodeType + rollback |
| Prisma | 三 model + Workspace/User 关系；RO.version 乐观锁字段（与 P1B-4 版本引擎复用） |
| domain | research-object/：types（常量）/errors/research-objects（create/get/update 乐观锁）/sdf（validateSdfCore 合同 + 乐观锁） |
| API | /research-objects POST/GET/PATCH + /sdf GET/PUT；error-map ResearchObjectError（CONCURRENT_UPDATE→409） |
| 测试 | domain 18 新增（创建原子/乐观锁 409/合同校验/越权 404）；本地门禁全绿；**云上集成 26/26**（新增 P1B-2 5 + 既有 21） |
| task-master 3.2 | done + details |

### Key Decisions / 坑
- **三决策**：UUID v4（一致性）；SDFNode 固定六型（对齐 SDF_CORE_FIELDS）；visibility 字段 P1B-2 建（P1B-7 只加强制不迁移）
- **RO.version = 乐观锁 = 版本引擎版本号**（§16 复用同一字段，P1B-4 推进）
- **sdf-schema P1B-1 漏 main/types**：消费方（domain）测试才发现，已补（P1B-1 只自测没暴露）
- domain 测试子目录相对路径坑（../src → ../../src）
- create RO 同事务建 RO + SDFDocument + 六 node（原子）+ 审计

### ⏳ Next Steps
- [x] ~~P1B-2 数据模型~~ 完成（2026-08-03）：迁移 7 + 云上 26/26，3.2 done
- [ ] **P1B-3（task-master 3.3）**：Blob 内容寻址存储 + 上传管线（SHA-256 键 + Artifact 元数据 + 分片/校验/MIME/病毒扫描，步骤 14）
- [ ] parked：P1A-3 终审项、P1A-5 deferred ①、/admin TOTP 上线路障、SDF Schema additionalProperties 债务（0.2.0）

---
## 2026-08-03 — P1B-1 SDF Schema 包完成：core + manifest JSON Schema + ajv 校验，task-master 3.1 done

### ✅ Completed
| 任务 | 详情 |
|---|---|
| design gate | 两决策 + 实证测试：手写 JSON Schema draft-07 + ajv（非 zod）；additionalProperties 宽容（技术债务） |
| core Schema | `core.ts`：六必填字段（§5.1）+ SDF_CORE_FIELDS 常量 + SdfCore 类型；`schemaVersion const 0.1.0` |
| manifest Schema | `manifest.ts`：§5.3 全字段 + objectId/versionId OSR pattern + visibility 三态 + licenses 三类 + SdfManifest 类型 |
| 校验 | `validate.ts`：ajv draft-07 + ajv-formats，模块级编译缓存，结构化错误；validateSdfCore/validateManifest |
| 测试 | core 6 + manifest 8 = 14，本地门禁全绿（build/typecheck/lint 0/audit 无新增/docs 0） |
| task-master 3.1 | done + details（决策/落点/坑） |

### Key Decisions / 坑
- **手写 JSON Schema + ajv**（§5.3 规范要求 JSON Schema 文件，§5.2 目录树 core.json 即数据文件；非 zod）
- **additionalProperties 宽容 = 技术债务**（实证三场景：空壳可选字段放行未定型数据、严格 false 误伤 draft_meta 等附加键、宽容兼容未来字段）——0.1.0 六字段 required 严格 + 附加键容忍；**0.2.0 可选字段定型时收紧 additionalProperties:false**（§5.3 语义化版本）
- **可选字段不预置**：§5.1 只给名字无结构，0.1.0 猜结构比没有更危险，升级版本时逐个加
- **ajv 默认不开 format** 需 ajv-formats（publishedAt date-time）；as const Schema 不能 cast JSONSchemaType
- 测试用 `SDF_CORE_FIELDS` 常量遍历断言缺字段（非硬编码六名）

### ⏳ Next Steps
- [x] ~~P1B-1 SDF Schema~~ 完成（2026-08-03）：14 测试，3.1 done
- [ ] **P1B-2（task-master 3.2）**：RO/SDFDocument/SDFNode 数据模型 + 迁移，/research-objects + /sdf API 骨架（步骤 2）
- [ ] parked：P1A-3 终审项、P1A-5 deferred ①、/admin TOTP 上线路障、**SDF Schema additionalProperties 债务（0.2.0 收紧）**

---
## 2026-08-03 — P1A-9 CI/CD 部署完成：生产栈上线 + 备份/恢复演练 + QQ SMTP，task-master 2.9 done

### ✅ Completed
| 任务 | 详情 |
|---|---|
| design gate + spec + plan | `docs/specs/2026-08-03-p1a-9-cicd-deploy-backup-design.md`（三决策 + QQ SMTP 偏离）、`docs/plans/2026-08-03-p1a-9-cicd-deploy-backup-plan.md`（9 任务 TDD） |
| Task 1-2 | SmtpMailer 实装（nodemailer QQ SMTP 真发）+ config mailerDriver/SMTP env + index.ts 生产启动阻塞解除（P1A-3 throw 移除） |
| Task 3 | `docker-compose.prod.yml`：data_net（postgres/redis 无端口映射，不绑公网）+ app_net（api 127.0.0.1:3001）双网卡，生产零默认值 |
| Task 4 | `.github/workflows/ci.yml`：GitHub Actions，build/typecheck/lint/test |
| Task 5-6 | `deploy.sh`（dry-run + --confirm 8 步链）+ `backup.sh`（pg_dump 保留 7 轮）+ backup-restore.md 四节 |
| 云上部署 | 生产栈 up（postgres/redis/api healthy）→ 迁移 6 applied（容器内跑）→ seed 8/8 → HTTPS 反代 + /admin basic_auth + 安全头 + 限流 429/Retry-After → 备份 24K + 恢复演练行数一致 + cron 0 3 → QQ SMTP 真发链路通 |
| task-master 2.9 | done + details（三决策/落点/坑） |

### Key Decisions / 坑
- **三决策**：GitHub Actions CI（免自建 runner）；仅 PostgreSQL dump（对象存储快照后置）；临时库恢复演练（不碰生产）
- **QQ SMTP 真发**（§3 偏离）：nodemailer 实装 SmtpMailer，MAILER_DRIVER=smtp 缺省，P1A-3「生产拒绝启动」阻塞解除；邮件真发不吞不丢
- **cert HTTP-01 被阿里云拦**（403）→ 改 **DNS-01**（Cloudflare API，CF_Token，绕开 80 端口）
- **Prisma alpine/musl 缺 openssl** → api image 用 node:22（debian），schema binaryTargets +linux-musl
- **安全基线生产接线缺口**：index.ts 此前没传 trustProxy/限流/helmet/CSRF/CORS（P1A-8 仅测试接线）→ 补全生产启用
- **invite/migrate 需容器内跑**（生产 postgres 无端口映射，宿主机 `postgres:5432` 解析不到）
- **api 生产绑 0.0.0.0**（容器内 nginx 反代可达），compose 限宿主 127.0.0.1 外部不可达
- **backup.sh 需 --env-file .env.prod**（compose 插值 POSTGRES_*）

### ⏳ Next Steps
- [x] ~~P1A-9 CI/CD~~ 完成（2026-08-03）：生产上线，2.9 done
- [ ] **Phase 1A 剩余收口**：deploy.sh 全自动 runbook 验证、CI 首跑确认（Actions 页面，本机不可见）
- [ ] **P1A-10+（1B 起）**：Research Object / 上传 / AI Gateway / 发布 等业务 Phase（task-master 3.x）
- [ ] parked：P1A-3 终审项、P1A-5 deferred ①、/admin TOTP 上线路障（ADR-003）

---
## 2026-08-03 — P1A-8 安全基线完成：限流/CSRF/CORS/helmet/trustProxy/nginx 强认证，云上集成 21/21 全绿

### ✅ Completed
| 任务 | 详情 |
|---|---|
| design gate + spec + plan | `docs/specs/2026-08-03-p1a-8-security-baseline-design.md`（逐节确认四决策）、`docs/plans/2026-08-03-p1a-8-security-baseline-plan.md`（8 任务 TDD） |
| Task 1 | `database/rate-limit.ts` Redis 固定窗口纯函数（INCR+EXPIRE 同 multi 原子，fail-open） |
| Task 2 | `config/api-env.ts` +4 env：allowedOrigins（逗号串→数组）/rateLimitEnabled/rateLimitLoginLimit/rateLimitLoginWindowSec |
| Task 3 | `api/security/rate-limit.ts` Fastify 封装（RATE_LIMIT_ROUTES 声明表=挂接点，429+Retry-After+审计 security.rate.limited） |
| Task 4 | `api/security/security.ts` CSRF 双提交（@fastify/csrf-protection，/csrf-token 端点）+ CORS 白名单（@fastify/cors）+ helmet 全套头；error-map FST_CSRF*→403 CSRF_INVALID |
| Task 5 | `app.ts` trustProxy 构造选项（生产 1/dev 0） |
| Task 6 | `infra/nginx/openscience.conf`（API 反代 + /admin basic_auth + XFF 透传）+ `ADR-003-admin-strong-auth`（nginx basic_auth 双层，TOTP 列上线路障）+ 部署 runbook 填充 |
| 本地门禁 | build/typecheck/lint(0)/单测 database 12+config 9+api 50/audit:knip 无新增 unused/audit:dep 0 errors/docs:lint 0 全绿 |
| 云上收口 | cloud-sync → install+全量 build → `test:integration` **21/21 全绿**（新增 security 4：限流 429+Retry-After+审计、CSRF 403/通过、helmet 头、trustProxy + 既有 17 回归）；task-master 2.8 置 done |

### Key Decisions / 坑
- **四决策**：限流手写 Redis 固定窗口（不引 @fastify/rate-limit）；CSRF @fastify/csrf-protection 双提交（HMAC 模式，cookie 存 secret + x-csrf-token 头）；安全头 @fastify/helmet（CSP default-src 'none'）；/admin nginx basic_auth + platform_admin + 审计双层（TOTP 上线路障，ADR-003）
- **trustProxy 是限流前置**：云上经 nginx，不信任代理则 req.ip 全 127.0.0.1 → 全站共享单桶；生产 trustProxy:1 + nginx 透传 XFF
- **@fastify/csrf-protection 错误名是 FastifyError 非 FST_CSRF***：error-map 须匹配 `code` 前缀而非 `name`
- **集成测试 Redis 桶隔离**（P1A-7 共享库教训 Redis 版）：server 端 key 空间全局共享，独立 redis client 不隔离限流桶 → 所有用例 trustProxy:true + 唯一 X-Forwarded-For → 独立桶（也验证 trustProxy 真实价值）
- **限流 fail-open**：Redis 不可用放行 + 审计 warning，不因限流依赖打挂服务

### ⏳ Next Steps
- [x] ~~P1A-8 安全基线~~ 完成（2026-08-03）：云上集成 21/21，2.8 done
- [x] ~~P1A-9 CI/CD~~ 完成（2026-08-03）：生产上线，2.9 done
- [ ] parked 不变：P1A-3 终审项、P1A-5 deferred ①；新增上线路障：**/admin TOTP 二次验证**（web 有 UI 后补，ADR-003）

---
## 2026-08-03 — P1A-7 配额/AI Credit 账务骨架本地完成：门禁全绿，云上集成待执行

### ✅ Completed
| 任务 | 详情 |
|---|---|
| design gate + spec + plan | `docs/specs/2026-08-03-p1a-7-quota-credits-design.md`（逐节确认：AI Credit 累积余额 B/行级 policy/流水统一账本/保守占位 seed）、`docs/plans/2026-08-03-p1a-7-quota-credits-plan.md`（9 任务 TDD） |
| Task 1 | migration 6 `20260803000000_quota_usage`（quota_policies + usage_ledger，UNIQUE scope+scopeKey+resource / idempotency_key）+ Prisma model（schema String 非 enum，对齐 SQL TEXT） |
| Task 2-5 | domain `src/usage/`：policies.ts（workspace→user_level→global 三层回退，未命中 null）、ledger.ts（只追加 SUM(delta)、recordEntry period 校验、topupCredit 同事务+审计）、grants.ts（月度授予纯函数+applyMonthlyGrants 幂等）、limits.ts（checkLimit 纯函数） |
| Task 6 | `scripts/seed-quota.mjs`（幂等 upsert，--dry-run/--confirm）+ `src/usage/seed-data.ts` 占位值集中一处；root package.json 加 `@openscience/domain` devDep（seed 脚本解析） |
| Task 7 | `/admin/quota-policies`（GET/PUT）、`/admin/credits`（POST，Idempotency-Key 防重）、`/admin/usage`（GET）；admin.ts 抽 `requirePlatformAdmin` 复用；usage 写操作同事务审计（quota.policy.upsert / quota.credit.topup） |
| Task 8 | `/usage` 用户侧聚合（user 级资源 user_level→global + workspace 级资源逐空间）+ `getUsageSnapshot`；error-map 加 UsageError 映射 |
| 本地门禁 | build/typecheck/lint(0)/单测 domain 83+api 39/audit:dep 0 errors/audit:knip 0 unused/audit:dup 31（+2 集成测试样板，容忍）/docs:lint 0 全绿 |
| 云上收口 | tar-over-ssh 同步（`scripts/cloud-sync.mjs` 固化，SSH 经 `ssh-run.sh`）→ install+全量 build → migration 6 applied → seed-quota 8/8（幂等重跑不增行）→ `test:integration` **17/17 全绿**（database 2 + storage 1 + api 14：workspaces 5 + admin 4 + auth 3 + usage 5）；云上残留 `.npmrc` 手工 rm（tar 无删除语义，用户确认）；task-master 2.7 置 done |

### Key Decisions / 坑
- **AI Credit 累积余额（用户选 B）**：余额 = ledger 全量 SUM(delta)；monthly_grant 每月 +N 不清零；policy(ai_credit) 语义 = 每月授予量非余额上限；不设 cap
- **行级 policy**：一资源一行，三层回退；未命中返回 null（无限制，不做 0 误判）
- **占位值不进 migration**：走 seed 脚本幂等 upsert，数值集中 `seed-data.ts`，§24 定案改一处
- **`usage_ledger.idempotency_key` UNIQUE** 支撑 admin topup 重试幂等（§16 幂等键）；P2002 → UsageError.DUPLICATE_IDEMPOTENCY_KEY → 409
- **fake prisma 扩展**：quotaPolicy/usageLedger/user.findMany/aggregate；user.findMany `notIn` 过滤初始实现 bug（`u.status === where.status` 恒 false）已修
- **knip 抓 unused export**：`getUsageByPeriod` 无消费方 → 从 index 移除导出（保留实现+测试，未来挂接）
- **Prisma unique where 对 nullable scopeKey** 期望 string → admin-usage.ts 显式 cast
- **Prisma upsert 复合唯一键不接受 nullable `scope_key`**：seed 脚本 + admin-usage.ts 原用 `upsert` 均抛 `Argument scopeKey must not be null` → 改 `findFirst` + `create/update`（保留 null 语义，spec §2.1 不变）
- **迁移 6 的 scope/kind 用 String 而非 Prisma enum**：对齐 SQL TEXT，app 层 zod 校验（z.enum）

### ⏳ Next Steps
- [x] ~~云上收口~~ 完成（2026-08-03）：migration 6 applied + seed 8/8 + 集成 17/17 全绿；task-master 2.7 done
- [ ] P1A-8：安全基线（限流、会话安全、管理后台强认证）
- [ ] parked 不变：P1A-3 终审项、P1A-5 deferred ①

---
## 2026-08-01 — P1A-6 统一错误/日志/配置/审计底座完成：云上集成 15/15 全绿，task-master 2.6 置 done

### ✅ Completed
| 任务 | 详情 |
|---|---|
| design gate + spec + plan | `docs/specs/2026-08-01-p1a-6-audit-observability-design.md`（四节逐节确认）、`docs/plans/2026-08-01-p1a-6-audit-observability-plan.md`（9 任务 TDD，SDD 执行）；design gate 确认两处偏离：/admin 真查询接口（原文"占位"）、authz.deny 入审计 |
| Task 1-4 | config 实装（api env 迁入 + `DEFAULT_DEV_*` 共源，`cd0d355`）→ observability pino 日志 + 双闸脱敏（`b984fa6`）→ 统一 ErrorBody + requestId 三方串联（`eec8981`）→ AuditLog 表（迁移 5 `20260801143000_audit_log` + rollback）+ prismaAuditSink（`7bbf043`） |
| Task 5-8 | domain 11 处 workspace 写操作同事务审计（`3729ac0`）→ auth 5 函数审计（login 成败均记、失败只记原因码，`dade692`）→ API 装配（loggerInstance/ctx/authz.deny，`7b4dd0f`）→ `/admin/audit-logs`（platform_admin 首个消费方，游标分页，`31d55bc`） |
| 终审 + fix wave | whole-branch review 2 Critical（实测复现）：sanitizeValue 无环保护（真 socket 请求即崩）+ Error 实例被掏空（500 丢栈）→ 一次 fix（WeakSet + Error 直通 + 真 HTTP 回归用例，`193e65a`）→ scoped re-review 3/3 ADDRESSED；deferred minor triage：fix-later ×3（session-guard 401 requestId / malformed cursor 400 / eslint-disable 清理），其余 ship-as-is |
| 云上收口 | tar-over-ssh 同步（含 3 个陈旧删除文件手工清理：env.ts×2 + dev-defaults.ts）→ install+全量 build → 迁移 5 applied → `test:integration` **15/15 全绿**（database 2 + storage 1 + api 12：workspaces 5 + admin 4 + auth 3） |
| task-master | 2.6 置 done（details 已记录两处偏离与架构落点）；Phase 1A 剩 2.7–2.9 |

### Key Decisions / 坑
- **AuditSink 接口放 observability 而非 domain**：domain → auth 依赖已存在（Mailer 类型），auth → domain 会成环；接口放叶子包 observability（type-only），实现 prismaAuditSink 放 database。新增依赖边 domain/auth→observability、database→observability/config，均无环
- **fastify 5 注入 pino 实例必须用 `loggerInstance`**：`Fastify({ logger: <实例> })` 启动即抛 `FST_ERR_LOG_INVALID_LOGGER_CONFIG`；测试全绿是因为测试从不传 logger——终审实测抓出，已加真 socket 回归用例（`logger-injection.test.ts`）
- **集成测试串行化（`fileParallelism: false`，`e8d69de`）**：api 集成文件共享同一 PG/Redis 且 afterAll 全表清理（每个文件假设独占干净库），3 文件并行时 admin 的 cleanup 抹掉 workspaces「并发双 accept」夹具（membership 被删 → 0 行），单文件跑全过、全量跑必挂；串行后稳定 15/15
- **tar-over-ssh 不带删除语义**：云上残留已被本分支删除的 `apps/api/src/env.ts` 等 3 文件致 build 失败；本次手工 rm 清理（用户批准），后续部署脚本需考虑 `rsync --delete` 或等价机制
- **knip 守门抓住残留依赖**：fix 后 api 不再直接 import pino（类型改 FastifyBaseLogger），`pino` 直接依赖变 unused → 移除（`90ddcbd`）

### ⏳ Next Steps
- [ ] P1A-7：配额/存储额度（task-master 2.7，先 design gate）
- [x] ~~parked：终审 deferred minor ×3~~ 已清（2026-08-01 遗留清理：session-guard 401 带 requestId、malformed cursor→400 + 2 用例、eslint-disable 清零 lint 0 warning；root `workspaces` 收敛为 apps/*+packages/*——`scripts/verify-workspace.mjs:35` 依赖该字段，P1A-2「冗余」判定有误，infra/* 为死配置已删）
- [x] ~~`.worktrees/p1a-1` 残留~~ 已清理（worktree remove + 分支删除，已合并 main 无丢失）
- [x] ~~云上 `/tmp/repro-invite.mjs`~~ 已不存在（此前运维清理已带走）
- [ ] parked：P1A-3 终审 parked 项（邀请码模偏差 99bit 熵、`PORT=''`→0、`void main()` 无 catch 等，归 P1A-3 范围后续处理）；P1A-5 deferred ①（WorkspaceRole 穷尽性校验，1B 扩展角色前补）③（spec §3 示例缺 deps，已随本次清理修正）

---

## 2026-08-01 — 出网通道选型定案（SSH 隧道胜）+ 监控面板上线（Netdata + vnStat）

### ✅ Completed
| 任务 | 详情 |
|---|---|
| 出网通道实测 | 直连基线：Docker Hub/HF 被墙、PyPI 极慢（12s）、GitHub/npm/MiniMax 正常；**SSH 反向隧道**（`ssh -R 7890` → 本机 v2ray）打通全部目标，吞吐 1.2–2.1MB/s 与直连持平；**Tailscale** 因本机 CGNAT 打洞失败纯走海外 DERP 中继（360ms+），实测吞吐仅 12–14KB/s，不成立 |
| 稳定性 soak | 15 轮 × 2min：**SSH 隧道 15/15**（gstatic 1.19–1.27s、docker hub 1.38–1.45s，方差极小）；**Tailscale 13/15**（2 次 >15s 超时，延迟 2.2–10.1s 抖动剧烈）。选型定案：SSH 隧道 |
| 监控面板上线 | `portainer.428312321.xyz/monitor/`（Netdata，274 charts 实时流式）+ `/traffic/`（vnStat 账单页，cron 每 5min 渲染）；basic_auth（账号 admin，凭据云上 `/etc/nginx/.htpasswd-monitor` 不入库）；Playwright 外网实测双面板通过 |
| 收尾七项 | `/nav/` 统一导航页（三入口互跳）；basic_auth 改 admin；`with-proxy` 兜底脚本（隧道失效回落直连，云上 `/usr/local/bin/`）；Tailscale 完全卸载（包/服务/repo/状态目录）；云上 /tmp 调试残留 + 本机测试截图清理；`.gitignore` 加 `.playwright-mcp/` |
| 隧道常驻化 | 本机 Windows 计划任务 `OpenScience-ProxyTunnel`（登录自启，vbs 隐藏窗口 → `proxy-tunnel.sh` 循环重连：15s 心跳/5s 重试/日志截断）；服务器杀会话实测 35s 内自愈；提交 `6ba730b`（监控+通道定案）`1bc62be`（隧道常驻化），均已 push origin/main |

### Key Decisions / 坑
- **Tailscale 与阿里云内网系统性冲突**：tailscaled up 劫持 `100.64.0.0/10` 路由（tailnet 段），阿里云 VPC 内部 DNS（100.100.2.136/138）恰在该段 → 全机 DNS 瘫痪（yum/apk/内网服务全挂），策略路由优先级高于 main 表 /32 例外。已 `tailscale down` 恢复；结论：此服务器不宜跑 tailscaled
- **dockerd 出网也要走隧道**：daemon.json 里 9 个 registry mirror 全部失效，直连 registry-1.docker.io 被墙 → dockerd systemd drop-in 代理（`127.0.0.1:7890`）+ restart dockerd（portainer restart=always 自恢复，dev 栈三容器无 restart 策略需手动 start）
- **nginx 子路径反代 Netdata 两坑**：① `proxy_pass` URI 带变量时 nginx 不自动追加 query string，必须 `$ndpath$is_args$args`（症状：registry hello 400 "need to set an action"）② Connection 头需 map 映射，空 Upgrade 时不得发 "Connection: upgrade"
- **服务器 nginx 仅 TLS 1.3**：Git Bash 自带 curl 握手必失败（exit 35），验证用浏览器/Playwright 或 `openssl s_client`
- AL4 无 vnstat 包（EPEL 不兼容）→ alpine 容器跑 vnstatd（apk 走 mirrors.aliyun.com），host 网络读网卡计数器，数据卷 `vnstatdb`

### ⏳ Next Steps
- [ ] P1A-6：审计日志（task-master 2.6，先 design gate）

---

## 2026-08-01 — P1A-5 RBAC 云上收口完成：集成测试 11/11 全绿，task-master 2.5 置 done

### ✅ Completed
| 任务 | 详情 |
|---|---|
| 终审 | whole-branch review（87e426b..f4caf06）：Ready to merge = Yes；无 Critical/Important；3 项 deferred minor triage 为非阻塞（fix later ×2 / ship as-is ×1）；终审复跑 domain 36/36 + api 34/34 |
| 提交与推送 | `f4caf06`（集成用例+文档+knip 修复）`f4ff738`（progress 修正），已 push origin/main；P1A-5 全部 6 commits 在库 |
| 云上收口 | tar-over-ssh 同步（排除 .env/.git/node_modules/dist 等）→ install → `migrate deploy`（迁移 4 `20260801010000_user_platform_role` applied）→ 全量 build → `test:integration` **11/11 全绿**（database 2 + storage 1 + api 8，含 RBAC 新 2 用例：viewer PATCH→403 含守卫先于 body 校验、非成员→404、无 session→401） |
| task-master | 2.5 置 done（details 已于本日早些时候同步修订）；Phase 1A 剩 2.6–2.9 |

### Key Decisions / 坑
- **云上集成测试前必须全量 build**：首轮 `test:integration` 3 用例 500/400 失败，根因是云上只 build 了 database（为 prisma generate），`packages/domain/dist` 停留在 07-31 不含 `can`——守卫 `import { can } from '@openscience/domain'` 解析到旧 dist 得 undefined，调用即 TypeError→500；通过的路由恰好都在 `can()` 之前短路（401/404）。教训：vitest 跑 TS 源，但跨包 import 解析到目标包 dist，云上/新环境必须先 `npx pnpm@9.15.0 build` 全量再跑集成测试；AGENTS.md 已同步修正
- 调试路径：先看失败面（挂 invite 的 3 个全挂、不挂的全过）→ repro 脚本验证裸 prisma 链路正常 → 定位 dist 过期；未改任何业务代码
- 云上遗留：`/tmp/repro-invite.mjs` 调试脚本待清理（rm 需 --confirm，下次云操作时顺手）

### ⏳ Next Steps
- [ ] 提交本次 progress/AGENTS 回填（需用户批准）并 push
- [ ] P1A-6：审计日志（task-master 2.6，先 design gate）——RBAC 守卫与 domain 已留 `// audit(2.6)` 挂接点
- [ ] parked：`.worktrees/p1a-1` 残留清理；P1A-3 终审 parked 项；终审 deferred minor ×3（角色穷尽性校验/eslint-disable/spec §3 示例缺 deps）

---

## 2026-08-01 — P1A-5 RBAC 本地完成（全门禁绿），集成测试留待云上

### ✅ Completed
| 任务 | 详情 |
|---|---|
| design gate + spec + plan | `docs/specs/2026-08-01-p1a-5-rbac-design.md`（四节已确认）、`docs/plans/2026-08-01-p1a-5-rbac-plan.md`（5 任务 TDD）均已批准并登记索引 |
| Task 1-4 实现与提交 | 迁移 4 `User.platformRole`（`d8365e9`）→ domain 动作×角色权限矩阵（`5e03493`）→ domain 角色检查收敛 `requireAction`（`ace9d04`）→ API 统一 preHandler 守卫（`f2dab74`） |
| Task 5 本地部分（未提交） | `apps/api/test/workspaces.integration.test.ts` 追加「P1A-5 RBAC 守卫（云上）」2 用例（viewer PATCH→403 含守卫先于 body 校验、非成员→404、无 session→401）；`vitest list` 确认收集、不本机运行（无 Docker） |
| 测试证据 | 全量门禁 exit 0：build / typecheck / lint（0 error，1 个已知 deferred warning）/ test 单测 **116/116**（database 4 + storage 10 + auth 32 + domain 36 + api 34）/ audit:knip / audit:dep（0 errors，11 orphan warnings 基线）/ audit:deps / audit:dup / docs:lint 0 issues |

### Key Decisions / 坑
- 权限判定落点从 task-master 2.5 原文「packages/auth」改为「packages/domain（workspace 模块）+ apps/api preHandler 守卫」，auth 包保持纯身份层——design gate 用户已确认的偏离，task-master 2.5 details 已同步修订（2026-08-01，追加 info）
- 守卫与 domain 双层各自查 membership（共源矩阵），双查开销已登记接受
- Task 4 遗留 1 项 plan-mandated Minor（`workspace-guard.test.ts` unused eslint-disable 警告）deferred 到终审统一处理
- knip 预存回归修复：`task-master-ai`（07-31 入 root devDependencies 供 `.mcp.json` MCP server 直连）被 audit:knip 判 unused 致 exit 1（基线 stash 验证与本次改动无关）；已在 `knip.json` root `ignoreDependencies` 补登，与 @prisma/client/prisma 同例，**knip.json 需纳入本次提交**

### ⏳ Next Steps
- [x] ~~终审（requesting-code-review）~~ 已完成（见 2026-08-01 收口条目）
- [x] ~~提交待用户批准：集成测试文件 + progress/index + spec/plan + knip.json~~ 已提交 `f4caf06`
- [x] ~~云上收口~~ 已完成，11/11 全绿（见 2026-08-01 收口条目）
- [x] ~~云上全绿后置 task-master 2.5 done~~ 已置 done

---

## 2026-07-31 — 阿里云收口完成：云上集成测试 9/9 全绿，2.2/2.3/2.4/2.10 置 done

### ✅ Completed
| 任务 | 详情 |
|---|---|
| 云上环境 | Alibaba Cloud Linux 4（148G/30G）；dnf 安装 `nodejs 22.23` + `docker-compose-plugin 2.26.1`；docker 已启动；代码 tar-over-ssh 同步至 `/opt/openscience`（排除 .env/.git/node_modules，密钥不上云） |
| SSH 打通 | 项目专用密钥 `~/.ssh/id_ed25519_xgs`（comment `openscience-xgs-aliyun`），经用户在控制台 Workbench 装公钥后连通；`~/.ssh/config` 加 Host 条目，`checkup.sh`/`ssh-run.sh` 直接可用；巡检通过 |
| Cloudflare DNS | `OpenScience.428312321.xyz` A → 阿里云公网 IP（DNS-only，即时生效，nslookup 验证） |
| 迁移 deploy | 3 个迁移（baseline_app_meta / auth_baseline / workspace_baseline）云上全部 applied |
| 集成测试 | 云上 `npx pnpm@9.15.0 test:integration` exit 0：**database 2/2**（PG SELECT 1 + 迁移落库 ≥3 + Redis ping/set/get/del）、**storage 1/1**（MinIO put/head/get/delete + sha256）、**api 6/6**（auth 3 + workspaces 3，含真实 PG 并发双 accept 竞态用例——P1A-3 终审建议已落实） |
| task-master | 2.2 / 2.3 / 2.4 / 2.10 全部置 done；Phase 1A 剩 2.5–2.9 |
| 提交 | `1efd327` feat: P1A-4 实现；`418e4c9` test: 云上集成测试修复与 database/storage 集成用例；工作树干净，未 push |
| VS Code MCP | 新建 `.vscode/mcp.json`（VS Code 格式 + `cmd /c npx` 包装）；**未提交**，待 key 轮换决定 |
| Portainer | 云上 `portainer/portainer-ce:lts` 容器运行中，仅绑 127.0.0.1:9443/8000（restart=always），访问走 SSH 隧道 |
| 密钥不入库 | `.mcp.json` 移出 git 跟踪（`git rm --cached`），`.gitignore` 补 `.mcp.json` + `.vscode/mcp.json`；本地文件保留，kimi-code/Cursor/VS Code 均不受影响（commit `chore: .mcp.json 含明文密钥移出 git 跟踪`） |
| VS Code MCP 修复 | npm 11.6.1 在 VS Code 环境跑 `npx --package` 报 `Cannot read properties of null (reading 'package')`；按 ADR-002 改为 `task-master-ai` 入 root devDependencies，`.vscode/mcp.json` 直连 `node node_modules/task-master-ai/dist/mcp-server.js`，绕过 npx/cmd 包装，已验证 server 正常启动 |
| SSH 隧道修复 | `~/.ssh/config` Host 条目补域名别名 `openscience.428312321.xyz`（原仅 IP，域名连接匹配不到 IdentityFile 导致 Permission denied）；域名直连 SSH 已验证 |
| Portainer 443 反代 | DNS `portainer.428312321.xyz` A 记录已建；云上 nginx 1.30.2 + acme.sh v3.1.3（gitee 镜像）+ cronie 续期守护；`infra/nginx/portainer.conf` 入库并部署 `/etc/nginx/conf.d/`；安全组放行 80/443 后 LE 证书已签发（standalone → install-cert 挂续期 reload）→ nginx enable --now；验证：80→301、443 200、/api/status 返回 v2.39.5。**面板入口：https://portainer.428312321.xyz（免 SSH 隧道）** |

### Key Decisions / 坑
- 代码修复（未提交，待批准）：① `auth.integration.test.ts` repoRoot 少退一级（`__dirname`=apps/api/test 需三级到仓根），本机无 Docker 从未运行故未暴露；② database/storage 补上`test:integration` 脚本悬空的实体文件（vitest.integration.config.ts + 真实集成用例）；③ auth 包移除悬空 `test:integration` 脚本（真实闭环由 api 套件覆盖）
- 首次递归 build 时 auth 先于 database 的 `prisma generate` 执行会报 `Invitation` 不存在——新环境 clone 后须先 build database（或全量重跑一次）；登记为已知坑
- 服务器不装宝塔：与本仓 compose + infra/scripts 管理路线冲突且扩大攻击面；用户已知情，后续如需可视化再议 Portainer
- 服务器密码在对话中明文出现过，建议用户在阿里云控制台轮换实例密码（SSH 已纯密钥）
- **安全问题（待用户处理）**：`.mcp.json` 硬编码的 MiniMax 代理 key 已随 `ce9da28` 提交并推送到 GitHub，处于泄露状态；建议轮换 key + 从 git 历史/跟踪中清除 + 此后 key 走本机环境变量。`.vscode/mcp.json` 因此暂缓提交

### ⏳ Next Steps
- [ ] 用户批准后提交：P1A-4 实现 + 云上集成测试修复（一个 commit 或拆两个）
- [ ] P1A-5：RBAC 权限矩阵（task-master 2.5，先 design gate）
- [ ] parked：`.worktrees/p1a-1` 残留清理；P1A-3 终审 parked 项（见 07-28 条目）

---

## 2026-07-31 — 阿里云收口启动：DNS 已通，SSH 待用户装公钥

### ✅ Completed
| 任务 | 详情 |
|---|---|
| 状态对齐 | 2026-07-28 P1A-3 handoff 已被 07-29 条目超越：P1A-3 已提交推送（`e4e3bc9`）、P1A-4 本地完成（单测 107/107 全绿）；P1A-2/3/4 共同待办只剩云上集成测试 |
| task-master 2.10 | 新增子任务「阿里云环境完善与云上集成测试收口（P1A-2/3/4）」，验收 = 三包集成测试全绿 + 2.2/2.3/2.4 置 done + DNS 生效 |
| Cloudflare DNS | `OpenScience.428312321.xyz` A 记录 → 阿里云公网 IP 已创建（zone `428312321.xyz` active，proxied=false DNS-only，TTL auto）；`nslookup` 已解析到正确 IP，即时生效 |

### Key Decisions / 坑
- DNS 走 Cloudflare API token（.env `CLOUDFLARE_API_TOKEN_428xyz`，脚本内引用未打印）；proxied=false 保留全端口可用（SSH 等），后续要 CDN/TLS 代理可再开
- SSH 卡点：服务器仅 publickey 认证（密码登录已禁，SSH_ASKPASS 也行不通）→ 已生成项目专用密钥 `~/.ssh/id_ed25519_xgs`（comment `openscience-xgs-aliyun`，无 passphrase 供 BatchMode 自动化）；需用户在阿里云控制台 Workbench/VNC 把新公钥装入 `/root/.ssh/authorized_keys`；known_hosts 主机密钥已 keyscan 录入，`~/.ssh/config` 已加 Host 条目（IdentityFile 指向新密钥，`ssh-run.sh`/`checkup.sh` 装完即可直接用）

### ⏳ Next Steps
- [ ] 用户安装新公钥（`id_ed25519_xgs.pub`）后：重跑 `checkup.sh` 巡检 → 云上起 dev 栈 → migrate deploy → 三包 `test:integration`（2.10 主体，云上写操作前逐项确认）
- [ ] 全绿后置 task-master 2.2/2.3/2.4/2.10 done，进 P1A-5 RBAC design gate

---

## 2026-07-29 — P1A-4 Workspace 本地完成（全门禁绿），集成测试留待阿里云

### ✅ Completed

| 任务 | 详情 |
|---|---|
| 依据文档 | spec：`docs/specs/2026-07-29-p1a-4-workspace-design.md`；plan：`docs/plans/2026-07-29-p1a-4-workspace-plan.md` |
| 迁移 3 | `infra/migrations/20260729010000_workspace_baseline`（三表：Workspace / Membership / WorkspaceInvitation + 部分唯一索引，附 rollback.sql；本机未 deploy，待云上执行） |
| packages/domain | 首个领域模块（workspace：personal 创建/CRUD/成员/转让/邀请状态机），32 单测全绿；三条不变量（personal 拒绝操作/last_owner/归档只读）均有用例 |
| packages/auth | `verifyEmail` 加可选 `onEmailVerified` 回调（同事务注入），2 回归用例全绿 |
| apps/api | `/workspaces` 15 端点（最小内联权限：非成员 404/越权 403）+ 错误映射 8 码 + 401，14 单测全绿；`index.ts` 生产接线 `onEmailVerified` |
| 云上集成测试 | `apps/api/test/workspaces.integration.test.ts` 已创建（3 用例：全流程/越权负向/并发双 accept），本机仅验证 vitest 收集与 tsc strict 类型，未运行（需 Docker，留待阿里云） |
| 测试证据 | 全量门禁 exit 0：build / typecheck / lint（ESLint + WORKSPACE_STRUCTURE_OK）/ test 单测 107/107（database 4 + storage 10 + auth 32 + domain 32 + api 29）/ audit:knip（零新增 hint）/ audit:dep（0 errors，11 orphan warnings，domain 已接线不再是 orphan）/ audit:deps / audit:dup / docs:lint 0 issues |

### Key Decisions / 坑

- Personal Workspace 经 `onEmailVerified` 回调注入创建（auth→domain 无运行时耦合，失败整体回滚）；生产与集成测试 buildApp 均须带该接线
- 错误处理平行于 AuthError：`WorkspaceError` + SCREAMING_SNAKE 8 码（对齐既有约定），api 侧 `WORKSPACE_ERROR_HTTP` Record 编译期强制全覆盖
- fake prisma 在 domain/api 两处刻意复制（跨包不能引测试目录，P1A-3 同款模式），`audit:dup` 报告按既定裁决接受，不抽共享测试包（YAGNI）
- 邀请预指派角色收窄为非 owner（zod `nonOwnerRoleSchema`），所有权只能经 transfer 产生；list 类查询逐行查关联（N+1 登记接受，1B 再改 include）
- lint 收尾修正 4 处（domain 测试未用导入 + 3 处 `any` 标注），纯类型/导入清理无逻辑变更
- task-master 2.4 按 test-gate 纪律保持 pending，云上集成测试全绿后才置 done

### ⏳ Next Steps

- [ ] 阿里云就绪后：`node packages/database/dist/migrate-cli.js deploy` + 三包（database/storage/api）`test:integration` 全绿，后置 task-master 2.2/2.3/2.4 done
- [ ] P1A-5：RBAC 权限矩阵（先 design gate）

---

## 2026-07-29 — P1A-4 Workspace design gate 通过（用户逐节确认）

### ✅ Completed

| 任务 | 详情 |
|---|---|
| P1A-3 提交状态核实 | P1A-3 已全部提交并推送：`e4e3bc9 feat: P1A-3 邀请码注册与邮箱验证 Auth`，main 与 origin/main 同步，工作树干净；上一份 handoff 的"未提交"风险已解除 |
| P1A-4 design spec | `docs/specs/2026-07-29-p1a-4-workspace-design.md`：三张新表（workspaces/memberships/workspace_invitations + rollback）、`packages/domain` 首个领域模块、`/workspaces` 15 端点、最小内联权限检查（成员→404/角色→403）、9 项错误码；用户逐节确认（数据模型/领域逻辑/API/错误与测试） |

### Key Decisions / 坑

- Personal Workspace 在**邮箱验证通过时**创建，与用户状态迁移同事务；auth→domain 依赖用回调注入（`verifyEmail` 加可选 `onEmailVerified`）
- 邀请机制：按邮箱邀请 + 显式 accept/decline；独立 `workspace_invitations` 表（不复用平台 invitations）；accept/decline 枚举面统一 404
- Membership 角色全量 6 档（owner/maintainer/author/contributor/reviewer/viewer）；personal 空间纯单人不可邀请
- 本任务只做最小内联权限检查，完整 RBAC 归 2.5；审计只留挂接点注释，接线归 2.6；不引入乐观锁（全部单资源短事务，spec §2 已记理由）
- task-master 2.4 按 test-gate 纪律保持 pending，云上集成测试全绿后才置 done

### ⏳ Next Steps

- [ ] 用户审阅书面 spec 后：writing-plans 出 P1A-4 实施计划
- [ ] 阿里云就绪后：migrate deploy + 三包（database/storage/api）集成测试，全绿后置 2.2/2.3/2.4 done
- [ ] spec/plan 文档提交（需用户逐次批准）

---

## 2026-07-28 — P1A-3 终审通过（fix wave 完成），本地阶段收尾

### ✅ Completed

| 任务 | 详情 |
|---|---|
| 终审 | 全范围 final review：无 Critical；1 Important（生产无真实 Mailer 时 outbox 静默吞邮件）+ 5 项 Minor fix-now；其余 6 项 parked |
| fix wave | 单次修复：`apps/api/src/index.ts` 生产启动守卫（无 Mailer 即 throw，plan/spec 已同步）；两处 fake `updateMany` 守卫修正（`??` 对 null 也触发致守卫恒真）；cookie sameSite/path 断言 + logout 无 cookie 用例；集成测试 afterAll 补 mailOutbox 清理 + 用例 3 标题修正；AGENTS.md 概览段对齐 |
| re-review | 6 项全 ADDRESSED；残留 1 项 plan 文档守卫写法不一致，controller 已同步；全门禁 exit 0，单测 59/59（58+logout 用例） |

### Key Decisions / 坑

- parked（后续）：邀请码模偏差（99 bit 熵）、env.test REDIS_URL 用例、`PORT=''`→0、`void main()` 无 catch、`--days Infinity`、verifyEmail 锁定/过期分支泄露待验证状态（register 409 本就是更大枚举面，登记接受）
- 终审建议：云上集成测试补一个真并发用例（两请求同码注册，断言恰好一个 201）——guarded updateMany 的真实竞态分支只有真实 PG 能走到
- SDD ledger：`.superpowers/sdd/2026-07-28-p1a-3-invitation-auth-plan/`（保留，云上续跑用）

### ⏳ Next Steps

- [ ] 用户批准后提交 P1A-3（plan Task 6 Step 11 检查点）
- [ ] 阿里云就绪后：P1A-2 + P1A-3 集成测试一并执行（migrate deploy → `test:integration` ×3 个包），全绿后置 task-master 2.2/2.3 done
- [ ] P1A-4：Workspace（task-master 2.4，先 design gate）

---

## 2026-07-28 — P1A-3 邀请码注册与邮箱验证本地完成，集成测试留待阿里云

### ✅ Completed

| 任务 | 详情 |
|---|---|
| 依据文档 | spec：`docs/specs/2026-07-28-p1a-3-invitation-auth-design.md`；plan：`docs/plans/2026-07-28-p1a-3-invitation-auth-plan.md` |
| 迁移 2 | `infra/migrations/20260728010000_auth_baseline`（四表：User / Invitation / EmailVerification / MailOutbox，附 rollback.sql；本机未 deploy，待云上执行） |
| packages/auth | 30 单测全绿：密码（argon2）、邀请码（含原子防并发核销）、邮箱验证码（6 位 + 限次 + 静默重发冷却）、session（Redis 7 天滑动过期）、DevOutboxMailer；登录未知邮箱路径加 DUMMY_PASSWORD_HASH 抹平计时侧信道 |
| apps/api | Fastify `/auth` 路由（register/verify-email/resend-verification/login/logout/me）+ env 校验 + 错误映射，14 单测全绿；`openscience_session` HttpOnly cookie |
| 邀请码 CLI | `scripts/invite.mjs`（create/list/revoke；root `npx pnpm@9.15.0 invite`）；无参演示 exit 64 + Usage（不需数据库） |
| 云上集成测试 | `apps/api/test/auth.integration.test.ts` + `vitest.integration.config.ts` 已创建，本机仅验证 vitest 收集（3 用例列出）与 tsc strict 类型检查通过，未运行（需 Docker，留待阿里云） |
| 测试证据 | 全量门禁 exit 0：build / typecheck / lint（ESLint + WORKSPACE_STRUCTURE_OK）/ test 单测 58/58（database 4 + storage 10 + auth 30 + api 14）/ audit:knip（仅占位 hint）/ audit:dep（0 errors，12 orphan warnings 占位基线）/ docs:lint 0 issues |

### Key Decisions / 坑

- Task 3 评审后三处安全加固已落地并反映在代码：① 邀请码核销改 guarded `updateMany` 原子操作防并发双核销；② resend 冷却改静默 202（消除 invited 状态枚举通道）；③ login 未知邮箱加 DUMMY_PASSWORD_HASH 抹平计时侧信道
- 集成测试用例 2/3 断言放宽（400/409 之一、登录 200）因用例间共享用户状态，强断言已由单测覆盖；云上可按需拆用户收紧
- 本机无 Docker（用户指示），迁移 2 未 deploy、集成测试未跑；task-master 2.3 按 test-gate 纪律保持 pending，不置 done

### ⏳ Next Steps

- [ ] 阿里云就绪后：云上 `node packages/database/dist/migrate-cli.js deploy` + `npx pnpm@9.15.0 --filter @openscience/api test:integration`，通过后置 task-master 2.3 done
- [ ] P1A-4：Workspace（task-master 2.4，先 design gate）

---

## 2026-07-28 — 基线提交 + 最小工具集落地

### ✅ Completed
| 任务 | 详情 |
|---|---|
| 基线提交 | `ce9da28`（chore: P1A-1 Monorepo 骨架 + P1A-2 数据基础基线提交，127 个文件；不含 .env / node_modules / dist） |
| 提交与推送 | 工具集提交 `79878c1`；`ce9da28`+`79878c1` 已推 origin/main（用户批准），工作树干净，git 单点丢失风险解除 |
| ESLint 9 | eslint 8→9 + `@eslint/js` + `typescript-eslint`；`eslint.config.cjs` 重写为 flat config（recommended + 4 处带注释窄域豁免：migrate-cli `require.resolve`、redis 空 error listener、.cjs 的 require、scripts Node 全局量）；`lint` = `eslint . && node scripts/verify-workspace.mjs`，exit 0 |
| knip | `knip.json`（pnpm workspaces 配置）；`audit:knip` exit 0，仅剩占位包预期 hint（test 目录预留、.prisma 生成物） |
| dependency-cruiser | `.dependency-cruiser.cjs`（no-circular / 禁跨包相对深引用 error，orphan warn）；`audit:dep` exit 0，0 errors / 13 orphan warnings（占位包入口，预期基线） |
| jscpd | `audit:dup` exit 0，0 clones（20 文件 / 2942 tokens，0.00%） |
| syncpack | `audit:deps`（v15 以 `syncpack lint` 取代已废弃 `list-mismatches`）exit 0，0 版本不一致；仅提示 root package.json 无 version 字段（private 包，无害） |
| markdownlint | `.markdownlint-cli2.jsonc`（保结构规则，豁免 MD013/060/058/022/032/034/029 排版风格，各附一行理由）；修 5 个文档 7 处明显问题（MD056 表格内管道符转义、EOF 多余空行、5 处围栏补语言、2 处围栏补空行）；`docs:lint` exit 0，19 文件 0 issues |
| 回归 | `build` / `typecheck` / `test` 全绿：单测 14/14（database 4 + storage 10） |

### Key Decisions / 坑
- syncpack v15 已废弃 `list-mismatches`，脚本用等价的 `syncpack lint`（报告中注明偏离）
- `@eslint/js` 须与 eslint 同主版本（^9 配 9.39.5），初次解析到 ^10 产生 peer 冲突已纠正
- knip 深层 peer warning（oxc-parser wasm 绑定）在 Windows x64 无害，走原生绑定
- 全程零 git mutation、零业务源码改动；完整证据见 `.superpowers/sdd/tooling-setup-report.md`

### ⏳ Next Steps
- [ ] P1A-3：邀请码注册与邮箱验证 Auth（task-master 2.3，先 design gate）
- [ ] 阿里云就绪后：云上 `npx pnpm@9.15.0 test:integration`（task-master 2.2），通过后置 done

---

## 2026-07-28 — P1A-2 终审通过（fix wave 完成），本地阶段收尾

### ✅ Completed
| 任务 | 详情 |
|---|---|
| 终审 | 全范围 final review（final-review-package.md）：无 Critical；1 Important（redis 无 error listener，plan 原文固有→用户裁决：修代码+同步 plan/design）+ 4 Minor fix-now；其余 parked |
| fix wave | 单次修复：`packages/database/src/redis.ts` 默认空 error listener（plan Task 2 Step 8 与 design §4 已同步修订）；`migrate-cli.ts` spawn 失败打印诊断；AGENTS.md infra/ 行与 `stack:logs` 补登；`.env.example` 补尾换行。验证：`@openscience/database` build/typecheck exit 0、单测 4/4、生产守卫演示仍 Refused |
| re-review | scoped re-review：5 项发现全部 ADDRESSED，无新破坏 |

### Key Decisions / 坑
- redis 语义变化：redis 不可用时不再打挂宿主进程，改为静默重试；消费方可自加 `client.on('error', ...)`（JSDoc 与 design 已注明）
- parked（后续处理）：生产缺 `DATABASE_URL` 静默回落 dev URL（建议 P1A-3 随 auth env 校验）；`S3_PORT` NaN 无校验；root `package.json` `workspaces` 字段冗余（P1A-1 遗产）；minio-init until 环无上限（既定设计）
- SDD ledger 保留在 `.superpowers/sdd/2026-07-28-p1a-2-data-foundation-plan/`，云上续跑 Task 4/5 时复用

### ⏳ Next Steps
- [ ] 阿里云就绪后：云上 `npx pnpm@9.15.0 test:integration`（Task 4/5），通过后置 task-master 2.2 done
- [ ] P1A-3：邀请码注册与邮箱验证 Auth（task-master 2.3，先 design gate，本地可做）

---

## 2026-07-28 — P1A-2 代码实现完成，集成测试留待阿里云

### ✅ Completed
| 任务 | 详情 |
|---|---|
| dev 栈 | `infra/compose/docker-compose.dev.yml`（postgres:16/redis:7/minio 固定 tag + minio-init 建 bucket）与 `stack:up\|down\|ps` 脚本已就位，端口仅 127.0.0.1；按用户指示本机未起栈 |
| packages/database | Prisma 5.22 + 基线迁移 `app_meta`（含 rollback.sql 补偿）；`createPrismaClient`/`createRedisClient`；迁移 runner 生产守卫 |
| packages/storage | StorageAdapter 接口 + MinIO 实现（put/get/head/delete + sha256 校验）；OSS 驱动预留抛 NotImplemented |
| 测试证据 | 静态门禁全绿：`npx pnpm@9.15.0 build`/`typecheck` exit 0，`verify:workspace` = `WORKSPACE_STRUCTURE_OK`；单测 14/14 过（database 4 + storage 10，vitest run 全 passed）；生产守卫演示 `NODE_ENV=production node packages/database/dist/migrate-cli.js reset-dev` exit 1，输出 `Refused: migrate command "reset-dev" is destructive and forbidden when NODE_ENV=production` |
| 集成测试 | 未在本机执行（需 Docker）；task-master 2.2 按 test-gate 纪律保持 pending，未置 done |

### Key Decisions / 坑
- 用户 2026-07-28 指示：本地机不做任何 Docker 相关执行，本地定位为架构设计 + 开发习惯优化；P1A-2 集成测试留待阿里云服务器就绪后在云上执行
- Prisma 仅前向迁移，回滚走每迁移附带的 rollback.sql 补偿路径（database-migration skill 第 2 条）
- 本机 `docker compose` 插件缺失，脚本 `docker compose ... || docker-compose ...` 兜底
- 开发凭据 compose 内联默认值为用户批准的开发态豁免；生产强制 env（2.9）

### ⏳ Next Steps
- [ ] P1A-2 集成测试（迁移 deploy/rollback/redeploy、redis ping、MinIO 全链路）：待阿里云就绪后在云上执行 `npx pnpm@9.15.0 test:integration`，通过后方可将 task-master 2.2 置 done
- [ ] P1A-3：邀请码注册与邮箱验证 Auth（task-master 2.3，先 design gate）

---

## 2026-07-28 — docs-sync 收尾并刷新 P1A-2 handoff

### ✅ Completed
| 任务 | 详情 |
|---|---|
| handoff 刷新 | `docs/handoff/2026-07-28-before-p1a-2-handoff.md` 已按 docs-sync 更新：补入 docs-sync skill 创建、handoff 入库规则、C 盘临时文件清理证据、当前 session skill 列表未刷新但文件可用的说明 |
| 规则确认 | 例行同步（project_index/progress/task-master/AGENTS/Memory）由 agent 主动完成；正式 handoff 在阶段边界/长 session/换 agent/换电脑/用户要求时写入 `docs/handoff/` |

### ⏳ Next Steps
- [ ] P1A-2：PostgreSQL + Redis + Storage Adapter（先 design gate）

---

## 2026-07-28 — handoff 入库到 docs/handoff

### ✅ Completed
| 任务 | 详情 |
|---|---|
| handoff 迁移 | P1A-2 前 handoff 已从 C 盘临时路径迁到项目内 `docs/handoff/2026-07-28-before-p1a-2-handoff.md`；临时文件已删除，后续 handoff 一律入库 |
| 规则更新 | `AGENTS.md` 文档分类新增 `docs/handoff/`；`.agents/skills/docs-sync/SKILL.md` 明确：例行同步 agent 主动做，正式 handoff 在阶段边界/换 agent/换电脑/用户要求时主动写，且必须存项目内 |

### ⏳ Next Steps
- [ ] P1A-2：PostgreSQL + Redis + Storage Adapter（先 design gate）

---

## 2026-07-28 — docs-sync skill + P1A-2 前 handoff

### ✅ Completed
| 任务 | 详情 |
|---|---|
| docs-sync skill | 新建 `.agents/skills/docs-sync/SKILL.md`：事实源顺序、必须同步时机、handoff 最小模板、不做的事（不手写 CLAUDE.md/不入密钥/不造第二份活文档）、自动化边界与 Red Flags；已登记 `AGENTS.md` 与 `project_index.md` |
| handoff | 已生成 P1A-2 前短 handoff：`C:/Users/Mac/AppData/Local/Temp/handoff-eM8h9E.md`；内容只指向事实源（AGENTS/Spec/ADR/audit/progress/index/task-master/Memory），不复制大段历史 |

### Key Decisions
- 文档管理采用“半自动”：agent 按 docs-sync 清单同步；`scripts/docs/check-docs-sync.mjs` 与 CI gate 后续再补，不用脚本替代人工判断
- `AGENTS.md` 仍是 canonical；`CLAUDE.md`/Cursor 规则不手写，确需多工具规则时再用 rulesync 并先写 ADR

### ⏳ Next Steps
- [ ] P1A-2：PostgreSQL + Redis + Storage Adapter（先 design gate，再实施 `infra/compose`、`packages/database`、`packages/storage`）

---

## 2026-07-28 — P1A-1 Monorepo 骨架落地并验证通过

### ✅ Completed
| 任务 | 详情 |
|---|---|
| 执行方式 | 方案 A 全量占位骨架；`.worktrees/p1a-1` 隔离执行，subagent-driven：5 个 task 均有 implementer + reviewer，终审 clean |
| 骨架内容 | root `package.json`/`pnpm-workspace.yaml`/`pnpm-lock.yaml`/`tsconfig.base.json`/`eslint.config.cjs`/`.npmrc`；`scripts/verify-workspace.mjs`；`apps/{web,api,agent-worker,science-worker,sandbox-controller}`；`packages/` 11 个占位包；`infra/{compose,nginx,sandbox,scripts,migrations}` 占位 |
| 验证证据 | worktree 内 `node scripts/verify-workspace.mjs` = `WORKSPACE_STRUCTURE_OK`；`npx pnpm@9.15.0 install/build/typecheck/lint` 全过；API 冒烟 `API_IMPORT_OK`；复制净骨架回主目录后再次 `WORKSPACE_STRUCTURE_OK` |
| 收尾 | 净骨架已复制到主目录（排除 node_modules/dist/.next/tsbuildinfo/src 编译残留）；`.gitignore` 已补 `dist/`、`.next/`、`*.tsbuildinfo`；task-master `2.1` 置 done（JSON 修复路径，`JSON_OK`） |

### Key Decisions / 坑
- 实施中必要最小修复：`tsconfig.base.json` 的 rootDir/outDir 改用 TS 5.5 `${configDir}`；web 增加 Next 必需 `app/layout.tsx` 与 `rootDir: "."`；终审确认非 scope creep
- 按约束全程未 `git add/commit/push`；worktree 分支只有 untracked 骨架，因此采用“复制净骨架到主目录”收尾
- worktree 内曾产生 `src/*.{js,d.ts,js.map}` 编译残留；未复制到主目录。首次提交前仍需检查并清理/忽略类似残留（终审 Important 项）

### ⏳ Next Steps
- [ ] P1A-2：PostgreSQL + Redis + Storage Adapter（`infra/compose`、`packages/database`、`packages/storage`、迁移 runner）
- [ ] 首次 git 提交前：确认无 `src/*.{js,d.ts,js.map}` 编译残留、无 node_modules/dist/.next 入库

---

## 2026-07-28 — task-master tasks.json 子任务数据修复

### ✅ Completed
| 任务 | 详情 |
|---|---|
| 备份 | 修复前创建 `.taskmaster/tasks/tasks.json.bak-20260728-parentid` 与 `.taskmaster/tasks/tasks.json.bak-20260728-subtask-ids` |
| parentId 修复 | 55 个子任务 `parentId: "undefined"` 已按父任务补齐，`JSON_OK` |
| 子任务 id 规范化 | 数值型子任务 id 统一转为字符串；发现并修复 `3.10/4.10` 被 JSON 数值吞零成 `3.1/4.1` 导致的重复 id；重复检查 `DUPLICATES []` |
| Phase 0 子任务状态 | 1.1–1.6、1.8、1.9 = done；1.7 = deferred（只读审计未运行测试/基准，避免 E2E 打生产）；任务 1 保持 done |

### Key Decisions / 坑
- task-master MCP `set_task_status` 对父任务可用，但对子任务持续报 `Failed to update task status`（修复 parentId/id 后仍复现）；本次按用户批准直接修 `tasks.json`，未动业务代码
- 后续用 task-master 扩子任务前，建议仍先跑一次小范围状态更新验证；若 MCP 子任务写入仍失败，继续以 JSON 校验 + 备份方式处理

### ⏳ Next Steps
- [ ] Phase 1A 首批：P1A-1 Monorepo 骨架 → P1A-2 PostgreSQL/Redis/Storage Adapter → P1A-3 邀请码注册/邮箱验证

---

## 2026-07-28 — Phase 0 门禁通过，ADR-001 Accepted

### ✅ Completed
| 任务 | 详情 |
|---|---|
| 用户确认 | 用户接受 `docs/CODEBASE_AUDIT.md` 与 `docs/decisions/ADR-001-target-architecture.md` |
| ADR-001 | 状态已从 Draft 改为 Accepted（2026-07-28 用户确认）；`project_index.md` 同步更新 |
| task-master | Phase 0 任务 1 已由 review 转 done；Phase 0 正式完成，允许进入 Phase 1A |

### Key Decisions
- 目标架构确定为：选择性抽取 Scholars Tea 高价值模块，按 Baseline v1.0 重建 OpenScience Monorepo 平台底座
- Phase 1A 输入边界固定：只做平台底座，不含 SDF/编辑器（1B）、协作（1C）、Hermes/发布（1D）、可视化沙箱（1E）和 §19 Phase 2 功能

### ⏳ Next Steps
- [ ] Phase 1A 首批：P1A-1 Monorepo 骨架 → P1A-2 PostgreSQL/Redis/Storage Adapter → P1A-3 邀请码注册/邮箱验证
- [ ] 另立安全任务（需用户批准执行）：Scholars Tea 凭据轮换与 git 跟踪清理

---

## 2026-07-28 — Phase 0 Scholars Tea 只读审计完成（待确认）

### ✅ Completed
| 任务 | 详情 |
|---|---|
| 审计执行 | 目标 `Z:/data/home/zju321/321/DHL/scholars_tea`（HEAD `74eb3f7`，工作区有大量未提交修改）；5 个并行只读子审计 + 高风险结论人工复核；未修改目标仓库、未读取 `.env`/`.env.postgres` 值、未启动服务/测试 |
| 产出 | `docs/CODEBASE_AUDIT.md`（目录/依赖/服务/数据地图，Hermes/AI/认证/上传/社区/WebSocket/模型路由定位，保留/局部重构/替换/待确认分类，风险登记册） |
| ADR-001 草案 | `docs/decisions/ADR-001-target-architecture.md`：选择性抽取 Scholars Tea，按 Baseline 重建 OpenScience 平台底座；AI Gateway 主模型 MiniMax-M3，回退配置化不写死 |
| task-master | 任务 1 已置 `review`，等待用户确认审计与 ADR-001 后进入 Phase 1A |

### Key Decisions / 风险
- Scholars Tea 可复用的是模块与经验，不是当前架构：认证/验证码流、service 层、统一 API 响应、`tool-call-guard`、RAG/引用校验/外部检索可抽取；上传、模型路由、socket 双写、迁移体系、部署脚本群必须重建
- 高危已核实：`.env.postgres`、`hermes-home/config.yaml`、`hermes/config.yaml`、`gateway_state.json`、`hermes-home/backup/*.bak` 被 git 跟踪；groups/upload 无鉴权；Prisma 空 baseline；SMS stub；E2E 直连生产地址
- pem 本地文件存在但本次 `git ls-files '*.pem'` 未确认跟踪；任何删除/清理都必须经用户批准

### ⏳ Next Steps
- [ ] 用户确认 `CODEBASE_AUDIT.md` 与 ADR-001；确认后 ADR-001 转 Accepted、任务 1 转 done
- [ ] 另立安全任务：Scholars Tea 凭据轮换与 git 跟踪清理（需用户批准后才执行）
- [ ] Phase 1A：展开 pnpm workspace/Auth/Workspace/RBAC/Prisma 基线迁移/Storage Adapter/CI 子任务

---

## 2026-07-28 — MiniMax-M3 基线修正 + ADR-002 工具可迁移性

### ✅ Completed
| 任务 | 详情 |
|---|---|
| MiniMax-M3 同步 | 用户确认首版主模型一直是 MiniMax-M3；已同步 baseline §2.4/§9.3/§24、MVP task design、architecture-guard skill、task-master tasks/drafts；回退策略不写死，交由 AI Gateway 配置/ADR |
| ADR-002 | 新建 `docs/decisions/ADR-002-agent-tooling-portability.md`：项目内安装、`npx`/`uvx` 优先、密钥不入库、生成物入库、不引入重叠任务事实源；代码审计/重构与文档自动维护工具分阶段候选 |
| AGENTS 规则 | 新增 Tooling Portability Rules，指向 ADR-002 |

### Key Decisions / 坑
- 回退/兜底模型未确认，任何文档/skill/task 不得写死；当前只确定主模型 MiniMax-M3
- 现阶段不安装新工具：`src/` 为空且无 root `package.json`；Phase 1A 初始化 pnpm workspace 时再把 markdownlint/dependency-cruiser/knip/jscpd/ast-grep/syncpack 纳入 devDependencies/scripts

### ⏳ Next Steps
- [ ] Phase 0：确认 Scholars Tea / AI Research Workshop 现有代码位置后执行只读审计（task-master 任务 1）
- [ ] Phase 1A：root `package.json`/pnpm workspace 建立后落地 `docs:lint`、`audit:*`、`docs:sync-check` scripts

---

## 2026-07-24 — T2 infra 脚本 + runbook 框架落地

### ✅ Completed
| 任务 | 详情 |
|---|---|
| infra 脚本框架 | 新建 `infra/scripts/{ssh-run,checkup,backup,deploy}.sh` + `infra/README.md` + `docs/runbooks/` 3 个四节骨架；已登记 project_index.md |
| T2 验证 | `bash -n infra/scripts/*.sh` 全过（SYNTAX_OK）；`backup.sh` 输出 NOT IMPLEMENTED 且 exit=64（符合预期）；`checkup.sh` 因本机 SSH 密钥未配置按设计报"请配置 SSH 密钥，本脚本不处理密码"（exit=255，属预期结果之一） |
| ssh-run.sh 修复 | 删除主机名后多余的 `--`（OpenSSH 会把它拼进远端命令导致远端 shell 报 invalid option） |

### Key Decisions / 坑
- .env 为 UTF-8，服务器键名为中文键 `公网ip`/`用户名`/`SSH端口`；脚本英文键（SERVER_*/SSH_*）优先 + 中文键兜底，刻意不读 `密码`/`Password`（BatchMode 仅密钥）
- 危险命令黑名单做单词边界匹配：`rm`/`systemctl stop` 无 --confirm 拦截（exit=65），`systemctl status`、`echo dormroom` 不误伤

### ⏳ Next Steps
- [ ] SSH 密钥配通后重跑 `checkup.sh`，把完整巡检输出记入本日志
- [ ] backup.sh / deploy.sh 及 3 个 runbook 内容待 Phase 1A（P1A-*）填充

---

## 2026-07-24 — task-master MiniMax parse-prd 实测通过

### ✅ Completed
| 任务 | 详情 |
|---|---|
| minimax_proxy 验证 | 代理 8471 端口链路正常：MiniMax-M2.7 响应正常，reasoning_split 生效（thinking 进 reasoning_content） |
| parse-prd 实测（CLI） | `task-master parse-prd .taskmaster/docs/prd.txt -o tasks-minimax-test.json -f` 成功生成 10 个任务（含依赖/优先级，结构合理）；Tokens 9969（in 2484 / out 7485） |
| .mcp.json key 修复 | OPENAI_COMPATIBLE_API_KEY 原为占位符 `${MINIMAX_API_KEY}`，进程环境无此变量 → MCP server 拿到空 key 报 401；已改为字面值（脚本写入未打印），**下次重启 session 后 MCP 路径生效** |

### Key Decisions / 坑
- `npx task-master-ai` 是 MCP server 不是 CLI；CLI 的 bin 名是 `task-master`（`npx --package=task-master-ai task-master ...`）
- parse-prd `-o` 输出文件必须预先存在（可先写空壳 `{"master":{"tasks":[]}}`）
- kimi-code 的 .mcp.json env 不做 .env 占位符解析（至少对未注入进程环境的变量如此），key 需写字面值

### ⏳ Next Steps
- [ ] 下次重启后验证 MCP 路径 parse-prd/expand（.mcp.json 字面值 key 生效）
- [ ] tasks-minimax-test.json 为测试产物，确认后由用户决定是否采用/清理

---

## 2026-07-24 — Memory 存储迁移 + git 推送打通

### ✅ Completed
| 任务 | 详情 |
|---|---|
| git push 打通 | 全权限 token（.env GITHUB_TOKEN_FULL_PERMISSION）推送 main 成功；原 GITHUB_TOKEN 确认为只读 |
| Memory 存储迁移 | .mcp.json 增加 MEMORY_FILE_PATH=.memory/memory.jsonl；重启 session 生效 |
| Memory 实体过滤 | 按用户要求只保留 3 个 XGS 实体（XGS项目环境配置 / task-master MiniMax 迁移 / XGS-Doc-Architecture）；其他项目 5 个实体留在原 npx 缓存存储，未动 |

### ⏳ Next Steps
- [ ] 重启 session 后验证 memory 从新路径加载（read_graph 应有 3 个 XGS 实体）

### Key Decisions
- server-memory 默认存储在包目录 dist/memory.jsonl（JSONL 格式）；迁移后随 git 备份
- git 推送方式：x-access-token + Basic extraHeader，token 按需从 .env grep 提取

---

## 2026-07-24 — 文档架构落地

### ✅ Completed
| 任务 | 详情 |
|---|---|
| 文档架构设计 | spec 获用户批准：docs/specs/2026-07-24-doc-architecture-design.md |
| 规则三件套 | AGENTS.md / project_index.md / progress.md 建立 |
| 并行产物登记 | Cursor session 产出的 Baseline v1.0（docs/OpenScience_Kimi_Development_Spec.md）登记为 source of truth，路径例外原地保留 |
| 旧方案处置 | 方案0723.docx 已被 Baseline v1.0 取代，用户确认放弃，不归档 |
| git 初始化 | 关联 GitHub 远端，初始提交 |

### ⏳ Next Steps
- [ ] 按 Baseline v1.0 审计现有代码（Scholars Tea / AI Research Workshop 可复用模块）
- [ ] task-master MiniMax-M2.7 全链路实测（memory 遗留待办）
- [ ] 平台产品文件架构（SDF/RO 存储）细节在 Baseline 框架内细化
- [ ] 服务器文档规范待服务器上线后补入 AGENTS.md

### Key Decisions
- 文档管理分层落地：工作区先行，服务器预留，产品架构随 Baseline 细化
- 规则载体三重保障：AGENTS.md（强制）+ Memory MCP（跨会话）+ project_index.md（活索引）
- `docs/OpenScience_Kimi_Development_Spec.md` 为需求基线，路径例外不移动（多 session 引用）
- 放弃旧方案0723，避免新旧需求互相干扰

---
## 2026-08-10 — Optical Editorial v3 Task 4 follow-up：文字局部光学交互补齐

### ✅ Completed

| Area | Evidence |
|---|---|
| 原型对齐 | 读取 `docs/user_ideas/8.10/OpenScience_Text_Distortion_Demo.html`，确认差异是文字层缺少 pointer-local mask / displacement / chromatic focus，而非仅点阵背景。 |
| 真实文字层 | `apps/web/components/brand/OpticalHeadline.tsx` 保留一个可选择、可访问的 DOM base layer，另加 `data-optical-text-distorted` 与 `data-optical-text-chromatic` 局部呈现层；朱红 marker 只保留一处。 |
| 运行时联动 | `apps/web/components/brand/OpticalField.tsx` 将焦点坐标、半径、位移、证据强度同步到 stage CSS variables，并驱动 `#os-local-distortion` SVG filter；reduced-motion 隐藏非必要层。 |
| 视觉测试 | `apps/web/test/landing-page.test.tsx` 新增真实 DOM / distortion layer / filter / hint 契约；landing + optical-field 11/11 通过，web typecheck 与 production build 通过。 |

### ⏳ Next Steps

- [ ] 在当前编译产物可用的浏览器验收环境重新截取 Landing 三视口，并检查 pointer move / press / leave / reduced-motion 状态；
- [ ] 继续 Task Master `optical-editorial-v3` Task 6：Public RO citable paper surface。

### Key Decisions

- 光学效果只影响文字副本和证据媒介，不把 Canvas 当作文字来源；SSR、选中、屏幕阅读器和索引仍依赖 base DOM。
- 不把 cyan 色散作为品牌焦点；它仅在指针局部以低透明度出现，唯一高权重焦点仍为 vermilion。

---
## 2026-08-10 — Optical Editorial v3 Task 6：Public RO 可引用纸面阅读完成

### ✅ Completed

| Area | Evidence |
|---|---|
| 纸面阅读层 | `PublicReadingSurface` 使用 760px 阅读列 + 280px metadata rail；标题、作者、长期 RO ID、版本 ID、许可证、Insight 和引用在深层导航前完成证明。 |
| 引用与来源 | 新增 `CitationRail` / `ProvenanceCaption`；明确区分 continuing object (`OSR-*`) 与 immutable version (`OSR-*-vN`)；六个 SDF 字段使用 `confirmed` / `empty` 文本状态。 |
| SSR 与路由 | `/research/:publicId` 和 `/research/:publicId/v/:versionNo` 在服务器获取现有 public API 数据并直接渲染阅读 surface，保留既有 metadata/visibility 合同。 |
| 打印与响应式 | print CSS 删除 deep navigation / copy chrome，但保留 citation 与 provenance；production browser gate 覆盖 1440×900、390×844、print，无横向溢出或运行时 console error。 |
| 验证 | Web 19 files / 127 tests；typecheck；production build；`shots:public` 均通过。截图：`apps/web/test/visual/out/public-reading-{1440x900,390x844,print}.png`。独立复审提出的 SSR transport、latest version、provenance、citation、i18n、mobile hierarchy 均已修正并重新验证。 |

### ⏳ Next Steps

- [ ] Task 7：Auth Research Identity，保留验证码注册、登录和 `safeReturnTo` 契约；
- [ ] Task 8：Mixed-material Evidence Intake 完整队列与真实上传状态。

### Key Decisions

- Public RO 不复用暗色 Workspace frame；长读正文使用 warm paper / editorial serif / academic captions。
- 稳定 RO URL 与版本 URL 都可引用，但文案与结构必须明确其“持续对象”与“不可变版本”的语义差异。

---
## 2026-08-10 — Optical Editorial 前端重构设计门禁完成

### ✅ Completed

| Task | Details |
|---|---|
| 参考资源审计 | 分析 `docs/user_ideas/8.10/` 的六张视觉参考图、Masterplan v2、Art Direction v3、设计系统图与实现资料；确认 v3 覆盖旧蓝紫宇宙视觉。 |
| 设计 grill-me | 用户逐项确认视觉宪法、三表面、双入口身份流、Hermes 角色、Evidence Intake、三联屏、Figma/浏览器职责、启动语料与动效语法。 |
| 新设计 spec | `docs/specs/2026-08-10-optical-editorial-rebaseline-design.md` 已写入，尚未开始代码实现。 |

### ⏳ Next Steps

- [ ] 用户审阅并确认新设计 spec；
- [ ] 进入 writing-plans，建立浏览器优先的 Phase 0/三联屏实现计划；
- [ ] 在服务器直接部署每个已验收垂直切片，保留上一镜像回滚。

### Key Decisions

- Art Direction v3 是视觉唯一真源；Masterplan v2 继续负责业务结构与交互语义。
- 首页以 `Science evolves.`/`科学，持续演化。` 光学混排为品牌记忆；个人工作区使用抽象深空间仪器感；Public RO 使用纸面阅读表面。
- Figma 管规则与状态，浏览器管真实光学媒介；不再用 Figma 静态图层冒充最终动态效果。
- 开发阶段无用户，视觉切片通过服务器真实环境后直接替换，不设长期 preview 双 UI。

---
## 2026-08-10 — Optical Editorial v3 实施计划与 Task Master 同步完成

### ✅ Completed

| Task | Details |
|---|---|
| 完整实施计划 | `docs/plans/2026-08-10-optical-editorial-frontend-plan.md` 拆为 15 个可验证垂直任务；旧 2026-08-08 计划标记 DEPRECATED。 |
| Task Master re-baseline | 新增 `optical-editorial-v3` tag：15 tasks、42 条依赖、0 invalid；`next` 正确返回 Task 1。旧 master Task 7/7.11/10/11/12 已 cancelled，防止误执行旧 Evolving RO/Figma-first/card-grid 方向。 |
| 解析故障处理 | `parse_prd` 300 秒超时且任务文件未变；按标准 tag JSON 写入并由 Task Master CLI `list`、`validate-dependencies`、`next` 三重验证。 |

### ⏳ Next Steps

- [ ] 执行 Task 1：从 `codex/researcher-ingestion` 建立 `codex/optical-editorial-v3` 独立工作树并带入设计/计划文档；
- [ ] 全量 test/build/docs gate 通过后开始 Task 2 社区依赖审计与 v3 foundations。

### Key Decisions

- 新计划覆盖所有已确认页面、功能和服务器验收，不把 Figma 或成功 build 单独视为完成。
- Task Master 使用独立 tag，旧 master 历史保留但不再作为前端执行真源。

---
## 2026-08-10 — Optical Editorial v3 Task 1 生产能力基线完成

### ✅ Completed

| Task | Details |
|---|---|
| 独立工作树 | `E:/Miscellaneous/XGS/.worktrees/optical-editorial-v3`，branch `codex/optical-editorial-v3`，基于 `cbcb60c` 并带入设计/计划提交 `71d0e19`、`a0f91c0`。 |
| 新环境构建顺序 | 首次 test 因缺少 `@openscience/versioning/dist` 与 Prisma Client 失败；确认是 fresh-worktree setup，不是产品回归。改为 database generate → full build → full test 后全绿。 |
| 基线证据 | Web 92/92、Domain 313/313、API 58/58、Agent Worker 24/24、Science Worker 29/29；其余 config/identity/observability/sdf/storage/versioning/ai-gateway/auth/database/diff 包均通过。Next production build 完成。 |

### ⏳ Next Steps

- [ ] Task Master `optical-editorial-v3` Task 2：调研社区 Optical Field/字体方案，建立 v3 foundations 与 ADR-005；
- [ ] 严格 TDD：token/foundation tests RED 后再修改生产 token。

### Key Decisions

- 新工作树固定初始化顺序为 `pnpm install → prisma generate → full build → full test`。
- 不把 CJS/Vite、ts-jest experimental 既有 warning 冒充失败，也不在本视觉任务顺手重构无关测试配置。

---
## 2026-08-10（Optical Editorial v3 Task 10 本地检查点）— ⏳ Research Index 完成，待 ECS seed/live gate

- **公开 Explore 合同**：新增匿名只读 `GET /explore`，仅返回 `public + published` RO；支持长度有界的 query、稳定 `publicId` cursor、limit、SDF field 与 artifact type 筛选，私有对象测试隔离。
- **纸面 Research Index**：`/explore` 从诚实空状态升级为编号式 editorial index；桌面/390px 搜索筛选、真实 Public RO link、无 Card、无横向溢出均通过。复看截图后移除整行默认链接下划线，并把 native beveled controls 收敛为规则线输入和自绘下拉提示。
- **可信启动语料**：登记 6 个完整 demonstration + 12 个轻量真实来源；许可证文件以 Git blob SHA 固定证据。完整记录仅存平台生成的 provenance Markdown，不复制或假称托管上游数据，且明确不代表上游作者投稿或科学复现。
- **可重复 seed**：`scripts/seed-demo-research.mjs` 默认 dry-run，`--confirm` 才写 PostgreSQL/对象存储；使用稳定 source idempotency key，不删除，catalog 身份不可登录。现有 schema 已足够，未创建 migration。
- **证据**：seed/corpus Node tests 6/6；Web 146/146；Domain 324/324；API 59/59；三包 typecheck；production build；Explore Playwright desktop/mobile 2/2。开发 E2E 仍记录既有 Google font 下载 fallback 与旧 collab dotted-key 警告，生产构建成功；后者继续归 Task 12。
- **下一步**：提交 Task 10 本地实现，按服务器优先原则部署；在 ECS 先 dry-run、备份/健康门禁后 `--confirm`，再验证 18 条公开索引、6 个 provenance artifact、筛选与公共 RO 页面，并以 replay 证明幂等后关闭 Task 10。
## 2026-08-10（Task 10 ECS 部署阻断修复）— ⏳ env-file 传播已修，待重放服务切换

- **现场证据**：生产备份 `BACKUP_OK`；源码同步、服务器全量 build、25 migrations 状态与 quota seed 均成功。服务切换在 Compose 解析阶段因 `deploy.sh` 的 `up` 命令遗漏 `--env-file /opt/openscience/.env.prod` 而退出；既有容器继续运行，无停机、无数据迁移、无 demo seed。
- **根因与修复**：同一脚本的 migrate/seed 已传 `--env-file`，仅 `up` 路径漏传。新增 `infra/scripts/deploy.test.mjs` RED 复现并修正单一命令；Node test 与 `bash -n` 通过。
- **下一步**：提交修复后同步新 release，使用 `--skip-build --skip-migrate` 重放已通过的后半程，再执行 demo seed dry-run/confirm/replay/live gate。
