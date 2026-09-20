# 2026-09-18 交接：Fig. 3 出图卡在 chatgpt-web 桥 + 本轮调试产物清理

> 上游上下文：[CURRENT handoff](2026-09-10-hermes-web-image-handoff.md)（滚动状态与交付差额）、[docs/progress.md](../progress.md)（2026-09-18 各条目）、[能力台账](../runbooks/hermes-capability-registry.md)。本文件只记录本次会话实际发生的事、留存的证据、未结债务和下一步，不复制它们的表格。

## 2026-09-20 续作：三类风格链路候选与本机 Codex Web GPT 核查

- 用户对恢复的 Fig. 3 回复「没有问题」，随后将目标明确为多风格兼容和稳定运行；选择先完善学术、编辑封面、淡彩三类。本次认可不自动审批/发布资产，不把全部风格或长期稳定性标完成。Fig. 2 五项清理仍未授权。
- 本机代码候选在本节所属提交保存，**未部署、未构建、未运行测试/预检/CI、未发模型或新生图请求**。用户随后转向检查已安装的 `miuuyy/codex-chatgpt-web`，服务器生产 release/rollback/provider 配置沿用 A 恢复后的状态。
- 已查明待修断点：逐图 style 只进 art 请求但末审/render 回到全局 style；art 场景不足时静默补 technical、多出时截断；科学标签 ASCII 转译有损；figurePlan 全 skip 或输出合计超过 6 场景会在模型调用后必败；scene 标题仅提示、不校验图 ID 对应。候选复用现有 figurePlan provenance、有限结构化纠错及既有风格加载，不新增模型阶段。
- 风格候选已补上述五点：`storyboardSceneStyles` 消费原 provenance，`illustration-styles.ts` 共用多风格参考合并，render 的所选风格摘录提前避免被 1500 字符尾部裁掉。**剩余已知债务**：Hermes 自然语言 art-only 的 `workspace-guide.ts` 仍强制 base.style、Web DTO 仍旧三值枚举；含 paperOriginal 的 art-only 仍受原 source support 限制。本轮未扩这些入口；不得宣称零技术债或整个产品换风格已完成，后续发布前先收口这些入口。八文件候选独立 High 静态复核未见新增阻断或明显编译错误；未构建/未运行，不代表线上完成。
- Broker 候选：renderer 缺失时撤销 `.ready` 且不领取新任务；downloaded 后标准化失败记 uncertain；同任务目录/完整 PNG 可复用，pending 输出验证后发布，一次额外本地标准化使用私有标记限制重复处理；收据先保存副本再原子覆盖。独立 High 指出的 receipt 缺席崩溃窗口及 execute 返回字节后 deadline 竞态已修并静态复核无新阻断；尚无运行证据，原 grace 时限/旧任务身份/沙箱保持，历史 failed 不自动恢复。
- 本机只读事实：安装并运行 **Codex Web GPT 5.0.8**；`launcher-state.json` 为 automatic、autoStart/keepRunningOnClose=true、experimentalBiggerContext/experimentalSkillAttachments=false、browserSmokePassed=false、mcpGuideStep=0。`.codex-chatgpt-web/config.json` 不存在，当前 Codex `config.toml` 未见 `openai_base_url`；当前会话没有该工具或 Web 模型入口，不能称 Full harness 已接通。
- 既有脱敏事件：16:24/16:27/16:29 为 ERR_CONNECTION_TIMED_OUT；**16:33:11 browser.authenticated** 证明启动器已记登录成功，旧超时不等于当前登录失败。未读取 Cookie/浏览器存储/Secret，未做 doctor、smoke 或 MCP 实际发送。
- 项目文档说明该软件通过 loopback Responses 路由把 ChatGPT Web 放入 Codex 模型选择器；Full harness 的 MCP 方向是 ChatGPT → 当前 Codex 工具，而非在原生 Codex 中增加普通 ask_chatgpt 工具。配置尚缺模型路由和 Full harness 引导；具体选主模型或委派方式需按用户选择接入，不能擅自切模型/改全局路由/重启当前任务。原 README 已只读保存到 ignored `tmp/codex-chatgpt-web-review/README.zh-CN.md`。
- 适用边界：上游 5.0.8 文档明确**不支持 ChatGPT 网页会话中的生图完成/回收**；原生 Image Gen 仅转发，不提供额外生图额度。因此可用于分析/审查/编码协作，不能直接取代 XGS 服务器生图桥。稳定用法优先单任务单 Web 会话、原请求续取、不双重控制同页，不因超时或限额重发/切号。多账号仍只讨论，未接入。
- 用户随后明确希望最大限度利用并询问 Full 模式：建议 **Full harness + Automatic**，原生/Web 混合委派先沿上游 Compatibility V1；初始只保留一个活跃 Web 工作单元，Bigger Context 保持关闭，不改现行 Codex 主模型或审批。接入顺序为启动器模型安装 → 私密配置同账号 Tunnel → ChatGPT Developer Mode 中新建精确 `Codex Native2` → 完成接通 → 在合适检查点重启 Codex加载目录。尚未执行这些配置、下载或模型验证。
- 参考真实使用反馈：[#599](https://github.com/miuuyy/codex-chatgpt-web/issues/599) 的 Windows 用户报告显式 provider 兼容方案有效，但仍是候选分支、不能自动套到本机；[#561](https://github.com/miuuyy/codex-chatgpt-web/issues/561) 报告 Windows 5.0.8 压缩后续接失败；[#594](https://github.com/miuuyy/codex-chatgpt-web/issues/594) 报告选定与实际解析模型不符。三者均为用户报告、未在本机复现，不把安装成功/登录成功称为长期稳定。
- 参考：[README](https://github.com/miuuyy/codex-chatgpt-web/blob/v5.0.8/README.md)、[架构](https://github.com/miuuyy/codex-chatgpt-web/blob/v5.0.8/docs/architecture.md)、[故障排除](https://github.com/miuuyy/codex-chatgpt-web/blob/v5.0.8/TROUBLESHOOTING.md)。启动器/配置修改须按实际接入方式继续；不按上游默认清单触发本项目已禁止的测试。

## 2026-09-20 A 恢复已完成（此前执行状态）

- 用户选择 A：恢复已有图，不新增生图、不清 Fig. 2。独立 High 静态审阅恢复脚本与原任务重试链路 GO；未运行测试/预检/CI。
- 标准化依赖已恢复：原 `apps/media-demo/Dockerfile`、生产源 `7bf8c5e5`、已有 Node/scansci 基础镜像；Debian 源下载缓慢后中止本次 build container，仅将临时构建文件源主机替换为项目既有 Aliyun mirror，保留 apt 签名验证。新 renderer=`sha256:4a30b091d4bdeb7dd7670a01521d30d7b32694e1f3b34977a2aa26e91669559f`，tag `openscience-media-demo:recovery-20260920`。image broker 的原 config-6a65dc7b 只更新 rendererImage，provider/bundle/浏览器会话不变；应用 release/rollback 仍为下节值，没有发布科研应用代码。
- 锁内恢复：`/opt/openscience-chatgpt-browser/recovery-20260920-9f7ff671/recover.mjs` 校验唯一 task/hash/request/source/submitted/downloaded/原图，沿原无网络、非root、readonly、512MiB ffmpeg 参数输出 **1280×720 / 486,042 bytes**。原 spool failure 硬链保留为 `spool/results/9f7ff671-bf9e-4062-a3df-8236f7431975/result.failed-before-recovery-20260920.json`；原 request/deadline/PNG 不变。Gateway 原 `resumeFromCompletedResult` 已读回对应 PNG/hash，才发原 API retry。
- 产品实际结果：原 task `9f7ff671` **succeeded / 100 / retryCount=1 / executionAttempt=2**；同 ID image 资产 **draft**，generator=`OpenScience Hermes scene image / chatgpt-web`，parent=`8141b5fd` scene0，contentHash=`9b4984df523714a5c1ed690566ef2fd4aa6682d446a3f9f0f76cb3c39f260611`，promptHash 保持 `c5329a4b…`。completedProviderRecovery 跳过 prompt planning/generateImage，新增模型请求 0。未审批/公开。
- 实际产品路径：已登录页面「研究详情 → 图解与视频」，恢复后再次「概览 → 图解与视频」，当前私有 version=`e77dc3c7`，目标卡片题为「Fig. 3: 圆孔横截面上的 Bethe 等效偶极源与角谱形状因子」、待审阅，目标 img complete=true / naturalWidth=1280 / naturalHeight=720。截图 `/jobs/fig3-recovered-product-20260920.png`，原 API 操作收据 `/jobs/fig3-product-recovery-20260920.json`；本机图/截图均在 ignored tmp。已看图只证明可显示，不代表科学或审美通过。
- 前置与顺序：此为**已执行一次性操作，不重跑**。源/收据完整、现有 image-runner flock 排他 → 隔离标准化 → 先写 PNG 后原子写 succeeded → 原 provider 读完成结果 → 原用户 API retry → 实际站内查看。恢复脚本/构建日志/镜像源变体/receipt/config.before.json 均保留在上述 recovery 目录；没有创建新模型请求、修改 deadline 或重开 Chat。
- 回退边界：原始 PNG 和 failed 收据保留；不要把成功收据改回 failed 或重置 retryCount。配置备份只用于审计/有依赖的回退，旧 renderer 已缺失，不能盲目恢复旧配置。若图质量不合格，仍按既有待审/拒绝流程处理，不自动重画。按需 renderer 没有常驻容器，须保留新镜像。
- 剩余：用户本轮已认可此图；Fig. 2 五项周期清理仍待明确同意，真实论文图 reuse 尚无真数据交付，多风格/批量差额保持 CURRENT。下节只读取证为恢复前历史，不再代表当前任务状态。

## 2026-09-20 只读取证更正（优先于下文 9/18 历史结论）

- Git：接手 HEAD `02c19579`，与 origin 跟踪引用相同；相对生产只有五份文档差异。服务器读回 release `7bf8c5e5d2df33df21e77716aa5e7173deaffa75` / rollback `561d738bb10a4926ac0e5c46356d90749557c5d1`；本轮不部署。
- **“Fig. 3 从未生成真实 PNG”已被新证据否定，产品交付仍未完成。** DB task `9f7ff671-bf9e-4062-a3df-8236f7431975` 的 payload 绑定 plan `8141b5fd-fd47-4c8e-b9f3-4b6558009095` scene0。桥根目录 `/opt/openscience-chatgpt-browser/` 下 `jobs/<task>/submitted.json` 记录 9/18 **12:30:03.050Z** 提交；`jobs/<task>/result.json` 在 **12:31:07.080Z** 记录 downloaded、1448×1086、1,071,490 bytes、scientificReview=pending。`jobs/<task>/output/image.png` 与 `private/<task>/browser-result.png` 字节相同且 PNG 头/尺寸匹配；未进行科学或审美审图。
- `private/<task>/normalized/` 为空；`spool/results/<task>/result.json` 于 **12:31:07.145Z** 写 failed/EXECUTION_FAILED，DB task failed、同 ID 图资产 0 行。故最后一次失败在**浏览器下载之后、标准化输出之前**，不是提交前失败，也不是完全没有原始图。对外 result 与内部 downloaded 必须分开判断。
- 运行桥 bundle `6a65dc7be5a83258887d9b193630dc1a2a3698f1` 的 `finalizeWebImage` 在保存 browser-result.png 后创建 normalized 并调用隔离 ffmpeg。当前配置 rendererImage=`sha256:1c47a579ceb608f244878b41888eee50bda1135ff325cb7b49de3a275ee2013d`，`docker image inspect` 返回 No such image。这是当前恢复阻塞/历史故障候选；历史 journal 仅保存 failed，未保留 Docker/ffmpeg 错误，不能证明 9/18 当时镜像就缺失，亦未运行容器复现。
- 容器日志在 12:30:02.307Z、12:30:03.973Z 有 WebGL1 blocklisted，12:31:07.071Z 有 dbus 错误；其后同任务下载收据与 PNG 已存在。只能确认时间相近，不能把它们判为阻断出图的根因。此次证据只覆盖末次任务，不替前两次失败下结论；历史 39% 是 spool 失败比例，不能解释为模型未出图率或纯偶发抖动。
- Fig. 2 五项 `6439150a`/`ee9bcfb6`(draft)、`6043bebb`/`75b34c88`(approved)、`d5087b03`(draft image) 都未软删除，属于私有 draft `e77dc3c7`。每项 1 条 Claim 关联、0 条 Hermes research step 外键引用、1 份私有 research_record 快照引用、0 份公开 publication 快照引用。前三个 plan hash 同为 `9b43357558e2`，第四为 `449ce484fa7d`，不能说四个逐字相同。copy 的 parent 为 `75b34c88`，paperOriginal.sourceAssetId=`929bd95d` 已无资产行。
- 产品影响依据 DB + 静态代码：listPresentationAssets 包含该版本未删除资产；ResearchPresentation 消费该列表，HermesMediaReview 筛出 draft，故私有素材列表包含五项、待审列表包含三项；未实际点击 UI，不声称已观察屏幕展示。建议用户同意后通过现有可恢复清理机制处理整个周期，并处理私有快照/Claim/父子依赖，不直接硬删五行。未改资产或任务。
- 待用户选择：**优先恢复已有原始图**（不重发模型，先处理标准化依赖，导入后仍需审图）；或显式指定 fallback 新生成（新增额度且不保证质量）；或真实论文图上传 reuse（无生图额度，需真实原图，不能替代 editorial 重绘交付）。不建议原样第四次重发。已超过自动恢复宽限，不能直接重跑旧恢复/清理脚本。
- 本轮只有只读服务器日志/收据/SQL/镜像元数据与文档同步；未测试、预检、CI、构建、启动、安装、重试生图或切 provider。下文三连失败及“没有 PNG”保留为历史记录，以本节纠正为准。

## 0. 30 秒结论

- **plan 段真的跑通了**：`8141b5fd-…`（interactive_html）**approved**，figurePlan `{"figures":[{"id":"Fig. 3","styleId":"editorial","decision":"re-render"}]}`，scene0 标题 `Fig. 3: 圆孔横截面上的 Bethe 等效偶极源与角谱形状因子`（真 MiniMax 输出 + chat-review 通过）。这是「figurePlan → 逐图规划」在当前生产 release 上的真实证据。
- **image 段第三次失败**：把该 plan 的 scene0 交给 chatgpt-web 桥出图，任务 `9f7ff671-…` `failed / image generation failed`（桥返回 `EXECUTION_FAILED`）。**至今没有任何一次真实的 chatgpt-web PNG 产出**对应这个 plan；最后一次真实桥出图成功是 2026-09-17 02:28 的 `ac455b2f-…`（spool `result.png` 590,049 字节）。
- **本轮清理留下了两处必须处理的后果**：①`docs/progress.md`（2026-09-18 paper-original 条目）与能力台账第 128 行**仍引用三个已被我删除的占位资产**（`929bd95d` / `6088f11b` / `03a160aa`）；②`d5087b03-…`（paper-original copy，draft）的 provenance 指向的源资产 `929bd95d` 已被删除 → **悬空引用**。文档漂移已在本轮原处加注更正，DB 残留留给下一轮决定（见 §4）。
- 生产 release = **`7bf8c5e5`**，rollback = **`561d738b`**；canonical HEAD = **`2a174fc6`**（**纯文档提交，未部署**）。

## 1. Git / 部署锚点（本轮实测读回）

| 项 | 值 | 证据 |
|---|---|---|
| 交付树 | `E:/Miscellaneous/XGS/.worktrees/onchip-video-release`，branch `release/onchip-production-line` | `git status --porcelain` 空、`HEAD == origin` |
| 交付 HEAD | 本交接首次提交 `6126dd06c867f50a1149a86932781ed6918379f1`（其后仅锚点小修正，用 `git log -- docs/handoff/2026-09-18-figure3-image-and-cleanup-handoff.md` 看最终提交）；接手时上一个提交 `2a174fc6a1e9a44eb57f25de3125859e8b0655cd` | `git log --oneline -1`、`git status --porcelain` 空 |
| 生产 release | `7bf8c5e5d2df33df21e77716aa5e7173deaffa75` | `cat /opt/openscience/.release-id` |
| 生产 rollback | `561d738bb10a4926ac0e5c46356d90749557c5d1` | `cat /opt/openscience/.rollback-id` |
| 故障标记/事务 | `.release-failed` absent、`.deploy-transaction.json` absent | 同次 ssh 读回 |
| 容器 | web/agent-worker/api/scansci-mcp/document-parser/embedding-worker 均 Up 45h（healthy 除 web）；dev 栈 + `openscience-chatgpt-browser` Up 4 天 | `docker ps` |
| 根 main | `acd13a71` 干净；worktree 仅「根 + 交付树」 | `git worktree list` |

> 注意：HEAD 比生产多一个**纯文档**提交，属正常；`2a174fc6` 不需要部署，也不要把「HEAD 已推进」误读成「生产已更新」。

## 2. 本轮时间线（生产 DB 实测，2026-09-18，均为我的调试提交）

| 时间 (UTC) | 对象 | 结果 |
|---|---|---|
| 06:42 | task `27dff586` `presentation.figure-audit` | succeeded（`Fig. 1 → re-render` 真决策，session `4eaa4e8d`） |
| 06:57 | `5f6d391b` plan | succeeded → approved，hash `fd310137`，scene0 `Fig. 1: 屏—孔偶极源…`（**保留**） |
| 08:13 | `77b3f559` image | `paper_original_figure`、approved、hash `a1299ed3`、**69 字节占位 PNG**（**保留**，但是占位） |
| 08:14–08:17 | task `b9095526` / `5afaf7f6` / `bcc516bc` / `e2599002` | failed，错误 `结构化输出超过重试上限`（**修 `MAX_STRUCTURED_RETRIES` 之前的复现记录**，行仍在） |
| 09:58–10:13 | `6439150a`(draft) `ee9bcfb6`(draft) `6043bebb`(approved) `75b34c88`(approved) plan + `d5087b03` copy image + task `03a160aa` | 全部 succeeded；figurePlan `{"figures":[{"id":"Fig. 2","decision":"reuse"}]}`；`d5087b03` = `paper-original figure copy`、draft、hash `8952318f`（**占位链路演练**） |
| 12:14 | `8141b5fd` plan（task 12:14:37 succeeded） | approved，hash `9395f576`，Fig. 3 / editorial / re-render（**保留，真证据**） |
| 12:29 | task `9f7ff671` scene image | **failed** `image generation failed`（桥 `EXECUTION_FAILED`），仅剩这一行作为第 3 次尝试的收据 |

**本轮清理（用户授权：只清我自己造的废物）**：删除资产/任务 `929bd95d`（paper-original 源占位）、`6088f11b`（占位 plan）、`03a160aa`（占位 copy 图）+ 失败任务 `6088f11b`/`627e7b48`/`7c654505` + 其 `presentation_asset_claims` 与 spool 残留。**读回验证：`929bd95d%`/`6088f11b%`/`03a160aa%` 现存 0 行。**

## 3. 真实证据 vs 占位证据（务必区分）

- **真实**：`8141b5fd`（Fig. 3 plan，approved、真 LLM + chat-review 通过）、`5f6d391b`（Fig. 1 plan，approved）、`27dff586`（真 figure-audit 决策）、`ac455b2f`（**最后一次真实 chatgpt-web 出图**，2026-09-17 02:28，approved、590,049 字节）。
- **占位**：`77b3f559`（69 字节 PNG）、`d5087b03`（68 字节源图的拷贝）。**paper-original 链路从未流过一张真实论文图**——只验证了管道，不构成科学或审美交付。
- **已删除因而失效的引用**：`progress.md` 2026-09-18「paper-original reuse 链路全链路端到端打通」一节原先以 `929bd95d`/`6088f11b`/`03a160aa` 为证据，这三行现已不存在；能力台账第 128 行同样引用它们。两处已加注更正（见 §5 已完成项），**但没有替代的实测行**——重跑或改用真实论文图才能补回这条证据。

## 4. 未结事项（按优先级；每条含位置 / 后果 / 下一步）

1. **Fig. 3 没有真图**：plan `8141b5fd` approved 但三次桥尝试全 `EXECUTION_FAILED`。后果：原目标「生成描述文献的图片」在本篇上仍为 0 交付。下一步（择一，须用户定）：(a) 只读取证再判断（见 2）；(b) 用户同意后再发**一次**；或 (c) 换路径（显式 fallback provider / Codex CLI 备用 / 真实论文图上传）。
2. **桥失败根因未定，且有重复模式**：`progress.md` 2026-09-18 记过另一次 figurePlan-aware prompt 三连败（promptHash `1c221dc86e…`），本轮 Fig. 3 又是三连败；能力台账记的桥累计失败率约 39%（69 个 `result.json`：35 成功/27 失败/7 不确定，**本轮未重测**），容器日志此前出现 `WebGL1 blocklist` 与 dbus 报错。后果：把「偶发抖动」当结论会掩盖可能的确定性诱因。下一步：**只读取证**——拉 `openscience-chatgpt-browser` 在 12:2x 前后的日志与对应 spool 收件箱，确认失败发生在「提交 prompt 前」还是「导出图片阶段」，并看是否与 WebGL 报错时间相关；不要先花钱重试。
3. **真实论文图没进过 paper-original 路径**：栈内**没有** PDF 取图工具（`xgs-pdf-tools.sh` / `xgs-extract-fig*.sh` / `xgs-install-pymupdf*.sh` 的结论：worker/parser 内无 `pdftoppm`/`pymupdf`/`pdfimages`，apt/pip 装不上）。下一步：(a) 用已实现的 `POST /research-objects/:id/versions/:vid/paper-figures` 由用户上传真实 Fig. 3 图，走完一条**真数据**的 reuse 链（便宜、不烧桥额度）；或 (b) 另立需求做 PDF 取图。**不要**用手绘/截图冒充自动能力。
4. **DB 残留（本轮清理的尾巴，需用户拍板）**：`d5087b03` draft copy（源资产已删 → 悬空）+ Fig. 2 reuse 周期的 `6439150a`/`ee9bcfb6`（draft）与 `6043bebb`/`75b34c88`（**approved**）。后果：同一内容（hash `9b43357558e2`/`449ce484fa7d`）重复成对存在，产品面上可能显示无意义草稿。下一步：**整周期一起处置**（要删就删干净并同步文档；要留就写明它是占位演练证据）。`6043bebb`/`75b34c88` 是 approved 资产，删除会改变产品可见状态 → 必须用户明确同意。
5. **8:14–8:17 四条失败 task**（`结构化输出超过重试上限`）：它们是 `561d738b` 修 `MAX_STRUCTURED_RETRIES` 的复现证据；若要求「板上不留调试行」，可删，但请先确认不需要该证据。
6. **`transliterateMathToAscii` 从未被成功出图验证**（`f03bd97c` 引入，本轮桥全败）。后果：不能声称 Unicode 数学字符问题已解决。下一步：与 2 的取证结论一起判断。
7. **原目标的交付差额仍在**：多风格配图中只有淡彩 `aa41a018` 获用户认可；学术机制图、编辑封面仍在 [CURRENT 产品目标与交付差额](2026-09-10-hermes-web-image-handoff.md#illustration-delivery) 表中未完成。

## 5. 本轮已完成的文档同步

- 新文件即本交接（提交 `6126dd06`）；[CURRENT handoff](2026-09-10-hermes-web-image-handoff.md) 顶部与 Git 段已把生产 release/rollback 从 `fa66e89e`/`d3a0da3f` 更正为 `7bf8c5e5`/`561d738b`，并加了指向本文件的入口。
- `docs/progress.md` 2026-09-18 paper-original 条目加注「所引三个资产已作为占位调试产物清除，链路证据需用真实论文图重建」；能力台账第 128 行同步加注。
- 新增只读取证脚本（`tmp/verify-scripts/`，已被忽略）：`xgs-handoff-inventory.sql`、`xgs-handoff-provenance.sql`。

## 6. 禁止 / 注意

- **不要**重跑一次性恢复/清理脚本（`tmp/goal-*.ps1`、`xgs-cleanup-my-waste.cjs`、`xgs-spool-clean-*.sh` 等）；不要盲重发付费出图。
- **不要**删除他人资产、公开 v1、已认可淡彩图、真实论文与证据；删除前先确认归属并同步文档。
- 用户当前**禁止测试/预检/CI 与全套验收**；只允许针对已知故障的最小必要定向验证，并在做之前说明范围与风险。
- 本机不跑构建/Docker/迁移；服务器只读元数据、必要时最小定向操作。
- 不读取/打印 secret；ssh 只走 `infra/scripts/ssh-run.sh`（Windows 用 `C:/Program Files/Git/bin/bash.exe`）。
- 文档提交不需要部署；生产当前 release `7bf8c5e5` 与本轮代码无关。

## 7. 新会话启动 prompt（可直接复制）

```text
接手 OpenScience（XGS）「论文配图」交付。工作树：E:/Miscellaneous/XGS/.worktrees/onchip-video-release（branch release/onchip-production-line）。
启动顺序：读 AGENTS.md（根 + 交付树）→ project_index.md → docs/progress.md 顶部条目 → docs/handoff/2026-09-10-hermes-web-image-handoff.md（CURRENT）→ 本次交接 docs/handoff/2026-09-18-figure3-image-and-cleanup-handoff.md（含未结事项与禁止动作）。
先核对 git worktree list / HEAD / git status，确认交付树干净（生产 release=7bf8c5e5、rollback=561d738b；HEAD 只比生产多出文档提交，不需要部署）。

现状（已实测，不要重新调查）：Fig. 3 的分镜 plan 8141b5fd（figurePlan=Fig.3/editorial/re-render）已 approved；把它的 scene0 交给 chatgpt-web 桥出图已连续三次 EXECUTION_FAILED（最后一次 task 9f7ff671，2026-09-18 12:29），至今没有该 plan 的真实 PNG；最后一次真实桥出图成功是 2026-09-17 的 ac455b2f。paper-original reuse 链路只跑过占位图，真实论文图从未进过该链路。

本轮任务（按此顺序，先做只读取证再决定是否花钱）：
1. 只读取证 chatgpt-web 桥：拉 openscience-chatgpt-browser 在 2026-09-18 12:2x 前后的日志与对应 spool inbox/result，确认 EXECUTION_FAILED 发生在提交 prompt 前还是图片导出阶段，并核对是否与日志中的 WebGL1 blocklist / dbus 报错时间相关。不要先重试付费请求。
2. 基于取证结论给我 2–3 个可选处置（例如：再发一次、启用显式 fallback provider、改走真实论文图上传路径），标明各自的额度/风险成本，由我选择——不要自动切换 provider 或消耗额度。
3. 顺带处理未结事项 4（Fig. 2 reuse 周期的重复 plan + 悬空 d5087b03 draft 拷贝）：先只读列出它们的影响面（是否出现在产品面），给处置建议，等我同意再动。

约束：禁止测试/预检/CI/全套验收（用户已明确纠正）；只允许针对上述已知故障的最小必要定向验证，做前说明范围；不删除他人资产与已认可图片；不打印任何 secret；文档提交不需要部署；每轮收尾交付树与根 main 的 git status --porcelain 必须为空，有改动就提交并推送。
先只读汇报第 1 步结论和你的建议，再问我选哪条路。
```
