# Handoff — Hermes Wanko Live2D Companion

## Current truth

- **2026-08-23 最新状态覆盖下方历史阻塞叙述**：用户确认形象设计完成。唯一母版 `wanko_genie_v09.cmo3` SHA-256 `BA111D4E...1121ADD` 保持未改；非覆盖 `wanko_genie_v09_exportprep.cmo3` 只承担旧 atlas 兼容与 runtime 导出。
- SDK 4.0 bundle 已输出到外部 `runtime-v09-export-20260823/` 并进入仓库 `apps/web/public/hermes/live2d/wanko/`；model3 的 moc/physics/display-info/两张 RGBA texture 与 12 个 motion 引用闭合。两张 texture 均已把 `alpha=0` 的 RGB 确定性归零，逐像素门禁和 bundle verifier GREEN。
- 用户已明确授权永久删除；C 盘同目录 42 个旧顶层迭代已逐项删除并复核 `Remaining 0`，不可恢复。最终 v09 母版/exportprep/runtime/motions、v09 hat/smoke、批准灯源与最终证据仍保留。
- 仓库 v09 浏览器集成已删除造成蓝金碎片的旧 Pixi procedural navigator，stage 只保留单一 Cubism model/canvas；同时修复 Core error→retry、系统 reduced-motion、首屏双初始化、主动 context release 误报与产品 E2E 漂移。fresh 真实截图、26 动作、性能和 aggregate release gate GREEN。生产仍是 `06072c1`，下一硬门是排除未跟踪 historical carrier、完成 release review/commit 与 operator 按 ADR-010 明确记录适用许可；确认前禁止公网写。
- 用户最新要求烟雾像参考图一样以高密度实体托起 Wanko，而非透明薄雾：隐藏原碗像素但保留 `B_BOWL_01`/`PARAM_BOWL_SWING` 为不可见共享根；最小结构仍为 6 个 smoke ArtMesh + 4 个 Warp Deformer，固定 rear/core → body → front veil/rim → paws。前层目标改为包覆下腹约 `28–35%`、内部近实色且仅边缘羽化，canonical Wanko 不得变成烟尾。
- Task 17.1 已 GREEN：只读 browser runtime isolation 证明 `D_BODY_01/02` 为独立 native paw meshes（orders `25/26`），位于 `D_BOWL_01`（order `24`）之上；v05 既有证据保留 bowl root/`PARAM_BOWL_SWING` 共享运动关系。当前 v09 未保存 Add-PSD 状态未被触碰。
- v07 真 RGBA 母版及完整合成已获用户通过。Task17.3 v01 因模糊 U 形气囊/right-extrema 遮脸失败；v02 保留纹理但有水平腹部切线；限定 mask-only v03 已消除硬切，六层共享坐标/alpha/coverage/24 格接触表与独立 Sol High 均通过，材料性问题 0。便捷副本已放到 `wanko_genie_v09.cmo3` 同级的 `wanko_genie_v09_smoke_v03*`，哈希与审计原件一致。当前唯一动作仍是用户签核接触表；尚无用户批准的六层 checkpoint、v10、参数或 runtime，签核前不得 Cubism。

- 用户已确认停止修改当前丑陋茶壶，先由 Codex 独立重画 lamp-only Photoshop vector/shape 源美术。新硬门：低矮横向阿拉丁神灯、深靛蓝釉面/克制金边、细长上扬嘴、开放 S/C 把手；壶身 `0.82–0.92x` Wanko、总跨距 `<=1.20x`、总高 `28–32%`。先交付 light/dark × `512/288/160` 灯体单独预览；不许用 Wanko/烟/辉光/品牌掩盖轮廓，用户未通过前不得导入 Cubism。
- 用户已通过 lamp-only 候选 `C:/Users/Mac/.codex/generated_images/01a01f25-fdbf-7f20-a4d4-5a3523c32909/exec-24f1bfe9-14e1-4a70-86e2-66bf6dcadcad.png` 及唯一品牌候选 `brand-study-v03/sdf-brand-reference-topology-v03.svg`：较粗壶嘴输入流→竖向深色开放中心→三条不回汇扇形路线→每支两个蓝白圆点→仅中支连接单一橙色结果。机械合同、主线程 light/dark `512/288/160` 实图与 Sol High 对照参考图复审均 GREEN/APPROVE；签核不等于 PSD/Cubism/生产验收。
- 签核后的扁平灯自动切分已在两次 Sol High 有界实验后停止：`layered-source-v01` 因 guide 尾/脚和硬切失败；v02 提前裁切/下沉后仍在壶嘴/把手后产生矩形脏 alpha，opening 以下仍有 `1046` 个 guide 像素，manifest 均为 `FAILED_VISUAL_STOP / NOT_PRODUCTION_TRUE_SPLIT`。旧 Photoshop 6 文档 IDs `138/187/236/287/337/386`、同名、Saved=false、active386 前后未变，Cubism 未触碰。禁止 v03 自动切分；下一决策是完整通过灯纹理作为 model atlas + Cubism ArtMesh/单独前沿遮挡，或重新人工绘制真正分层美术。
- 用户已选择方案 A：完整通过灯纹理作为单一 model atlas，由 Cubism 多 ArtMesh、draw order、mask/deformer 和独立 front-rim 建立物理关系；不再自动切 PNG。预检发现 v08 已存在并保留，只允许无覆盖创建 `wanko_genie_v09.cmo3`，先交付 neutral Editor 几何截图，用户/High 未通过前不得绑定更多参数或导出 runtime。
- Cubism 5.3 官方路径要求 PSD 才能向既有模型新增 ArtMesh；任意 PNG/JPG 只能作 Guide Image，atlas PNG replacement 也不适用于新 2079×756 灯图。lossless transport PSD 的 solo lamp 已精确通过 source alpha/pixel 门，无竖纹；当前唯一阻塞是启动时“试用期剩余 42 天”模态框无法可靠自动聚焦。v09 不存在，需用户手动点击“继续使用”并保持 Editor 打开后再继续。
- Photoshop PathItem 架构已在第三次诊断后停止。集合清理表面通过，正式 v03 单次执行也产出 5 层 PSD，但 PNG 实测为不透明 RGB/整张深色画布：`makeSelection()` 未形成预期 bounds，`selection.fill()` 填满整层，non-empty 结构门为假阳性。v03 PSD/PNG 仅保留失败证据，不得进入 Cubism；禁止第四次同架构补丁。原 6 个未保存标签/active/Saved 保持，Cubism SHA 未变。下一步需用户重新选择专业源美术路径。
- 旧 SDF 图案候选分别为 7、5 个蓝节点；v01 虽满足 exact-six 也被否决为不好看，v02 因星种/月牙/回汇误读被否决；全部失效。当前只能从待签核 v03 继续，品牌语义已纠正为开放中心扇出三条不回汇路线、每支两圆点、仅中支连接橙色 diff 结果，禁止恢复旧点阵或靠整灯生成抽样决定拓扑。

- `wanko_genie_v07.cmo3` 仅是干净 Save As 检查点（4,276,660 bytes / SHA `8260F0EC...A841`），不是新几何：九个 `GENIE_*` 仍挂 `お椀の回転 [お椀]`，但没有移动/缩放/顶点编辑，neutral Editor 截图不存在。v06 仍为原 SHA `423242F3...EE94`。External API 不支持 ArtMesh geometry，当前 GUI 自动化又不能可靠证明顶点命中与保存目标，故已硬停；禁止把 v07 冒充成果或继续盲发 GUI 坐标。下一步先建立可审计 Editor 控制路径，或由用户完成一个明确手工几何步骤后复核。
- 官方文档与本地模型证据已纠正实施语义：Cubism 可见源本来就会成为 texture atlas/ArtMesh；“原生”指同一 `.moc3` 内的 mesh/deformer/draw-order/parameter，而不是无纹理。现有 `D_BOWL_00/01/02` + `B_BOWL_01` 与 `canonical-native-bowl.png` 已证明正确 rear bowl → Wanko → front rim → hands 包裹。此前失败根因是用 no-bowl 的完整椭圆 Wanko 与完整灯上下拼接。下一动作必须从原生 bowl 状态直接工作，只替换/新增分离 lamp ArtMeshes 并保持 canonical body/UV；不再做完整 composition raster，不把 Wanko 下身画成烟尾。先交付一张 neutral Editor 几何截图，未通过不得继续。
- 用户已允许 PSD/texture atlas 作为模型内部源美术，runtime PNG/SVG/Pixi 灯体仍禁止。`composition-v01`–`v05` 均为不合格 Photoshop studies，未导入 Cubism。v05 局部 alpha 已干净，但主线程与独立 Sol High 一致 REJECT：完整椭圆 Wanko 与写实概念灯上下拼接，画风/材质不统一，灯口无 rear/body/front-rim 包裹，下腹直切，小尺寸品牌故事与壶嘴/把手坍缩。永久停止裁切概念 raster 再拼 canonical Wanko；下一动作只允许用 canonical bowl 的线稿、材质和遮挡结构重绘统一卡通风格的模型内部源 PSD，不得复用概念图像素。
- Cubism External API 没有缺失的“单独授权按钮”：22033/Editor 正常，`ExternalApp_user.xml` 中四个记录均 authenticated。旧 probe 的真实缺陷是没有保存并复用 `RegisterPlugin` Token，且成功后仍保留全局 timeout；稳定 Token 复测已取得 `APPROVED=true`、v06 model UID 与 31 parameters。API 可读写参数，但官方函数列表不支持 ArtMesh 顶点/几何编辑。
- `source-art-v8/` 的 11 层透明 RGBA 只是一轮未导入的 High 视觉检查点；主线程已因仍像扁平茶壶/图标而否决。不得把它导入、不得称其为改善，也不得恢复“另画一盏灯贴到 Wanko 上”的路径。下一方案必须直接以 canonical bowl 的 ArtMesh/纹理风格/父变形器为骨架，先过静态视觉截图，再做参数与 runtime gate。
- 后续 Task 16.2 silhouette v05 同样 NO-GO：虽使用真实 canonical Wanko 并只做 light/dark 512/288/160 轮廓门，但灯体仍像锅/茶壶，灯嘴和闭合杯柄违反阿拉丁神灯约束。连续程序化视觉失败已触发架构停止门；不得再派发同类 SVG/GUI 微调。Cubism 仅用于绑定/变形，必须先取得用户批准的专业分层源美术，才允许继续 PSD→ArtMesh→参数流程。
- 唯一 CURRENT 视觉入口是 `docs/specs/2026-08-19-hermes-wanko-live2d-design.md` §10。用户选择方案 1「原生碗结构蜕变」：Wanko 是主体精灵，miniature 神灯约占总高 32%、宽 ≤ Wanko 身宽 1.25x；低椭圆壶身、窄金口、上扬细壶嘴、开放 S 把手。禁止运行时 PNG/SVG/Pixi 灯体、烟尾或 poster。
- 原生 bowl capture 证明需要复用模型内 rear opening → Wanko → front rim → hands 的 draw order。现有 atlas 没有神灯壶嘴/把手/品牌美术；保留 canonical Wanko `texture_00` pixels/UV，新增 model-owned `texture_01`，不是 DOM/runtime 拼贴。
- 同一模型新增六个隔离参数：compact/vapor/story/trail X/Y/diff；`PARAM_BOWL_SWING` 仅可审慎复用。12 个 stock motions 都写 lid/yuge/effect，因此新状态 ArtMesh 不得依赖这些旧参数，运行时还须证明状态参数在 motion evaluation 后生效。Codex Pet 只作行为参考，Workspace 继续拥有 travel/drag/collision。
- ECS release `06072c1fd3eb30148daec8d4c4a8572fa3bdacc8`，rollback `8ecf96c193e0010329cdf3330819063d1ad7958d`；27/27 migrations current，公网 release identity 与服务健康已独立核验。
- 公网 blank-RO gate 用真实管理员、真实 MiniMax、零网络拦截完成。私有证据 RO `ad35cac3-cbd9-4a2a-9a00-9762fcc15e91` 保留：1 task、5 个 locator-backed 字段、Results missing、0 unsupported claim，edit-accept/accept/reject/save/reload/commit version 2 全部通过。
- Hermes 在该流程发布 `idle / travel / working / review`，review/approval 保持静止，自动 footprint 不遮挡字段、diff 或主操作；视觉证据只在 ignored `apps/web/test/visual/out/hermes-blank-ro/`。
- 真实 gate 暴露并已修复 draft SDF 400：draft 必须保留 schemaVersion + 六字段结构，但允许明确 unresolved 的空字段；非 draft 继续执行完整非空 core 校验。
- 公网部署 Wanko 前必须登记 Sample/Free Material 条款接受和 Live2D AI/chatbot SDK publication 判定；本地技术验证不等于许可完成。
- Sol High 确认 source variant 是唯一条件可行路线；existing bowl + procedural append 与 floating plume 均应停止。此前 runtime foundation 的 focused `24/24`、18-route build 和 native gate 只可复用为工程基线，不代表新模型视觉已实现。
- Cubism Editor `5.3.03` PRO Trial 已安装。受保护 `wanko_genie_v03.cmo3` 保持 4,257,511 bytes / SHA `702B56F5...C2D1E`；最新可恢复检查点为 `wanko_genie_v05.cmo3`，4,258,067 bytes / SHA `82042FBB...68CCE`。九个 `GENIE_*` ArtMesh 已逐项挂到原生 `お椀の回転 [お椀]`，并实测继承 `PARAM_BOWL_SWING`；这只完成父子关系，不是视觉验收或 runtime export。
- 操作事故边界：一次自动化焦点错误把 v02 保存为 4,376,949 bytes / SHA `997D00B9...0721D`；原始字节仍由 v01（3,954,855 bytes / SHA `07EE5F...1649`）完整保留，v03/v05 未覆盖，因此没有唯一源丢失。禁止未经用户批准覆盖或删除 v02；v04 也只保留为失败证据。
- 用户已批准并完成非覆盖恢复：事故 v02 只读保留；`wanko_genie_v02_restored_07EE5F56.cmo3` 与项目原件/v01 的长度及 SHA 完全一致。项目原件、v01–v05、restored 均为 NTFS ReadOnly，只有 v06 可写且其语义尚待 Sol High 验证。后续 Cubism 有状态 GUI 保存/恢复任务类不得再由 Medium 独立执行。
- Sol High 已只读打开/关闭 v06，哈希 `423242F3...EE94` 前后不变且未创建 v07；视觉仍是灯体过大、Wanko 上身受压。因 External API 未监听且 GUI 菜单捕获不可靠，v06 仍不是语义检查点；继续前必须先建立稳定、可复核的单标签 API/GUI 控制通道。
- External API `22033` permission 已由用户显式授权。API 1.0.1 实测总参数 31；六个 `PARAM_LAMP_*` 定义准确，`VAPOR`/`STORY` 各有 `0,1` keyform 并能原生改变 ArtMesh opacity。其余 `COMPACT`、`TRAIL_X/Y`、`DIFF` 尚未绑定；DIFF 还需从 story ArtMesh 拆开，禁止把参数存在冒充动作完成。
- `wanko_genie_v03_export_model_objects.csv` 证明 `D_BODY_00` draw order 400、`GENIE_FRONT_SHELL` 500；当前白色下身露出不是 draw-order 值太低。native bowl parent 已在 v05 补齐，剩余根因是 front-shell 几何覆盖不足；禁止继续盲调 order。

## Version tuple

- Branch / technical release candidate: `codex/hermes-wanko-live2d` / `f327136befbc6c12109afe10672a3a5f2ad7bc36`（本次 docs release record commit 位于其后）
- Remote candidate: `origin/codex/readable-hermes-guidance`（release record commit 在其后）
- Local main: `c60ffdd16b85ea8f0d8b047493fa03a4c0230c05`
- ECS release / rollback: `c97926ab4188d5d5fc7a6e58e0333d20a600c692` / `06072c1fd3eb30148daec8d4c4a8572fa3bdacc8`
- Current branch PR: none

## Constraints

- 不读取/记录 `.env`、Secret 或真实用户内容；不使用本机 Docker，不删除用户文件或私有验收 RO。
- 生产最终标准是公网 ECS；本地门禁只作 preflight。新云写仍需单独确认。
- 草稿空字段不等于模型填充：Hermes 必须披露 missing evidence，只有用户显式接受的文本可保存。
- ECS Parser 继续保持 `network=none`、非 root、只读 rootfs、512MiB/64 PID 与 bounded IPC。

## Next action

1. 42 个已授权的 C 盘旧顶层迭代已永久删除并复核 `Remaining 0`；v09 keep list 与仓库候选均保留，勿再次清理。
2. 用户已接受许可条款、批准清理旧仓库资产，并明确把当前服务器使用归为开发阶段、指示不等待 publication-plan 分类；ADR-010 已记录 development exception，不得把它改写成正式 publication licence 已验证。
3. ECS deployment/acceptance 已完成；后续只需用户在真实登录工作区做最终视觉确认。当前 release `c97926a`，rollback `06072c1`。

Read first：`AGENTS.md` → 本 handoff → 2026-08-19 Wanko CURRENT design/plan → `docs/progress.md`；`project_index.md` 只用 `rg` 定向查 CURRENT 行。
