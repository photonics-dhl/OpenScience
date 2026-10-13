# Hermes / 论文视觉叙事 CURRENT
> 交付基线是 `.worktrees/onchip-video-release` / `release/onchip-production-line`；root `main` 仅导航。本页是三线唯一活跃状态，历史细节留在 Git。

## 目标与边界
- 依据开发规格：真实 NousResearch Hermes 先理解全文、提炼 Claims/Evidence，再规划视觉叙事并交 Synclip；论文是事实来源，不以 Codex 手稿代替科学能力。
- 目标仍是 2–3 篇真实论文的凝练、用户确认、配图与公开展示；三篇整体验收、普通用户旅程、完整视频、整站审美尚未完成。
- 用户已要求继续有价值的并行开发；idle 不等于完成，但不得用无关检查填充。保留 PDF/SourceMap、认可图片、公开标识、sealed 记录、原失败/费用/receipt/oncekey；未知 paid/started CP 不重放，不因容量或 idle 扩预算、安装、重启或切换主 Gateway/Native M3。
- 用户当前只授权继续代码、测试、独立 High 与提交；Synclip Provider、真实论文图片/视频生成及部署仍待明确授权。API-only，`gpt-image-2.5` 为主，只有结构化明确模型不可用才能一次降级 `gpt-image-2`；截图已确认供应商列有2.5，真实 PNG/科学质量仍待受控执行验收。视频运行准入关闭，不能据通用错误断言供应商拒权。
- UI 聊天另获用户直接授权先制作整页 Guide 设计效果图供审阅：沿研究生命周期、四类角色/入口、真实截图配2–3条说明，桌面左目录/手机顶部折叠目录；效果图认可前不实现新版 Guide。此设计产物授权不扩展到 Synclip 真实论文生成。

## 研究生命周期角色与入口
- **研究者**：现有 `/guide` 上传材料 → `/dashboard` 进入私有 RO 核对六字段与来源 → RO `edit?stage=media` / `presentation?version=:version` 查看分镜与媒体 → 显式公开。新版设计为 P04研究桌面→P05独立创建页，待效果图认可，不能冒称已经替换当前入口。复用已有授权与审核守卫，不新增逐幕批准关卡；直接视频/试听提交仍受 Domain 的 platform_admin 限制，入口存在不等于普通用户已可用。
- **Hermes**：从 RO 助手承接已授权任务，复用 PDF/OCR、SourceMap、Claims/Evidence、配图与 Skill，理解全文后形成分镜、原旁白、来源绑定动作和镜头；商业模型执行画面表达。科学与像素审核沿既有任务链，缺依据或执行失败保留私有草稿，不由 Codex 手稿替代。
- **读者**：`/explore` → 固定公开研究版本，阅读成片、图文与原文来源；不能读取私有任务、音频试听或失败回执。来源可核验不等于平台证明论文结论或视频质量。
- **期刊/协作者**：期刊目录 `/journals` → 有权限的 `journals/manage/:id/articles/:articleId` 接续共用论文与媒体链；协作者经 RO `collab`/版本入口按成员权限讨论与修订私有工作稿。公开修改形成新版本或勘误；业务权限不授予 Hermes 运维或 Provider Key 权限。角色入口证据：`apps/web/lib/guide-page-copy.ts` 与现有 RO/期刊路由。

## 视频恢复前置条件与验收顺序
- **运行阻塞**：10-13只读快照为 `adminModelsEnabled=false`、无 audio、缺 `.ready`、`openscience-synclip-video.timer` disabled/inactive。这是本地准入关闭，不证明 Key 无供应商权限；现有应用/Worker readiness 注入已核对，未验证当前应用/broker 的完整配对和真实产物。
- **权限证据纠正**：此前目录命令只返回 `SYNCLIP_AUDIO_CATALOG_FAILED/EXECUTION_FAILED`；`broker.mjs:main` 在读配置/认证/GET 前要求 uid=0、gid=1000，通用错误不能定位到权限。历史 `tmp/session-coordination-20261008/synclip-voices-59a-{receipt,stdout}.json` 为10-10经 setpriv 返回77音色、exit0、生成请求0，证明当时目录可读；不是当前 Audio 生成、余额或 LTX Admin 资格证明。未来获准查询时先核运行身份；当前不调用目录 Provider。
- **路线与授权**：真实论文视频目标保留，当前暂停 Provider/生成/部署的用户边界优先。后续需核服务器 Key 的 `/v1/video-admin` LTX资格及预算；external-narration/试听另需 Audio资格、中文 voice/speed及有限预算，凭据不入聊天。已保存权威 `native-first` 全幕native可不要求独立TTS，但普通整篇run的 `getHermesVideoCapability` 仍读默认 narration readiness，不自动转换旧任务或宣称声音合格。
- **配置目标与执行责任**：总控准备精确已推送、CI/High通过且应用/Native/broker兼容的SHA、回退与旧任务兼容证据；用户/服务器操作负责人明确授权该配置/安装/启用范围后，运维沿原 `infra/synclip-video/install.sh --defer-timer` 和 existing previous恢复流程执行。保留固定spool与共享Key路径、`ltx23/ltx23fast`、720p、`synclip-receipt`、v2；资格成立才显式启用admin。只读证据补齐不自动授权变更，也不擅自采用残留候选配置。
- **最小验收顺序**：①匹配运行身份、source-id、应用release、环境开关与inbox rw/results ro；②按所选路线核目录/权限/预算，并确认无需重发的旧付费任务；③授权切换后timer enabled/active，results目录root:1000/2750、`.ready` root:1000/640、更新时间≤60秒、model/v2/accepting匹配；external须合法narration，试听另须audioAccepting与正预算；④从站内RO/Hermes入口继续同版本私有制作，记录真实task/attempt/receipt、模型、声轨模式与费用，科学、旁白准确性/自然度、画面运动/清晰度和完整播放逐项观察；⑤用户决定公开。当前不提交；错误、未知付费结果、失配或过期心跳即停止且保留原任务。不新增短片批准后才能做整片的人工关卡。
- **证据入口**：`packages/ai-gateway/src/synclip-video-readiness.ts:{readSynclipVideoReady,createNativeVideoReadinessReader}`、`packages/domain/src/agent/research-run.ts:getHermesVideoCapability`、`infra/synclip-video/broker.mjs:{main,synclipAudioCatalogFailure,requireSupportedPlan}`；操作/恢复沿[既有视频计划的installer四节](../plans/2026-09-05-hermes-presentation-assets-plan.md)、[部署手册](../runbooks/deployment.md)和[能力台账](../runbooks/hermes-capability-registry.md)，不新增工具、配置平台或付费探针。

## 总控与并行分工
- 总控 `01a1197c-7a1e-7631-b1c1-2d09b587be9a` 单写 CURRENT/progress/index，负责收取已审差异、集成与对应 CI；发布仍暂停。openscience ACTIVE，已改为实际 UI 聊天与最新授权边界。交接须含范围/基线/写权/完成证据/最小验收，发送成功不等于已执行；模型失败先保留续点再用≥gpt-6.1-sol接续，不重复已完成工作。
| Session / ID | 当前责任、状态与下一动作 | 工作树 / branch |
|---|---|---|
| 生图 / `01a0e831-be19-7813-8379-58313178ff26` | API-only主模型/回退/恢复及c7d回归已提交；结果页持久模型提示20be2c62已High GO并提交，21/21与typecheck/ESLint通过。只读前置已证实目标RO的版本均已发布且无draft、目标scene已有approved图片；须由用户决定后续私有修订范围与执行预算，再重新绑定新版本对象。暂停真实提交，不能复用旧失败run或旧指南任务充作授权。 | canonical / `release/onchip-production-line` |
| 视频 / `01a0e851-4d6c-7221-9559-b8c56a3413fe` | 视频代码/fixture已High GO并通过Media；纠正目录权限推断的证据交总控收口。c7d新增回归已由gpt-6.1-sol High独立复核GO（P0/P1/P2=0），五文件Web提示也已独立High GO（P0/P1/P2=0），交总控提交/CI；不重审旧链、不写共享文档、不启服务。真实视频阻塞见上节。 | canonical只读审查；旧视频树保留证据 |
| UI / `01a12fc3-b66e-7090-b95e-b7dccfa6ccb8`（替代旧01a0f118） | 按该聊天用户最新决定制作完整Guide概念图供审阅；固定左目录/移动折叠目录、生命周期与四角色入口。旧Guide代码已有High GO和23/23，不代表新版设计获认可；撤回旧代码收尾派单；首稿用户反馈同图重复、文字杂乱且无重点，已交精简候选P03-guide-focused-20261013.png：一张UI示意/一张案例图、一次展开一个阶段。新布局/文案仍待认可，不写产品代码。 | `E:/Miscellaneous/XGS/.worktrees/research-product-craft`，设计产物放ignored tmp |

## 当前 Git / CI / 运行事实
- canonical `release/onchip-production-line`：生产连续性修复 `d60d2ad1` 已独立 High GO（P0/P1/P2=0）；API回归提交 `c7d455d8542c2fb00ff024c59930c0f0ef2abb59` 无生产代码变更，36/36与54/54，日志 `tmp/synclip-admission-{node,gateway}-20261013.log`。视频线独立High已对该新增差异GO（P0/P1/P2=0）；旧 Media CI不证明后续新Web提示或新版Guide已验收。Web提示提交 `20be2c623bed33886a79935dd91a9356cf378f36` 已独立High GO（P0/P1/P2=0）；实际HEAD/status以Git为准。新增21/21、typecheck/ESLint通过，完整两文件38通过/10失败与c7d基线同名同错，日志 `tmp/synclip-model-notice-{focused,tests,baseline,typecheck,lint}.log`；实际浏览器刷新/布局未验收。无Synclip Provider/真实PNG/部署。
- UI runs `38268914069`, `38270923462`, `38274577962` and `38277069403`: browser-entry (hermes-dashboard/auth-dashboard/research-continuation/hermes-workspace-stage) and each web build passed; `skill-path` failed only at the two stale non-UI queue-recovery assertions. Those fixtures were refreshed in `af42e5e2`, and the subsequent exact Media run `38280757897` passed all jobs. No deploy, install or model call.
- Video exact CI `38280757897` for merge head `2e1a28de` completed successfully: skill-path and all four browser-entry jobs passed. The two stale queue-recovery fixture failures are closed; Journal/search evidence remains as previously recorded, with no production-code failure attributed to the merged UI/video code.
- Image admission/floor/reader and beta-gate alignment are merged and High-reviewed; complete producer/floor and real PNG quality remain open. The API submission contract is merged; no Synclip task has been created and API receipt/PNG/scientific review remain open. Media `38288353198`'s four shared native-video parent failures are addressed by `613db2c8` plus `1a22f83c`; exact Media `38291046457` is green. No deployment until the API result, human PNG/scientific gates and receipt evidence close.

- GitHub协作目标仍为 `origin/frontend/nanqing`，从canonical提交正常快进推送；不推main、不强推、不部署。已正常快进推送460c8bd031869ad0890696ff3e534a097e57fe43；对应Video 38376163034、Journal 38376163057成功；Media 38376162983四个browser-entry成功，skill-path仍在执行（源码含20be2c62），旧CI成功不能代替新提交。后续纯文档回执不代表新的生产发布。

## 生图受控提交的实际前置（10-13 17:26–17:28只读）
- RO `aa450f1e-fafc-46d8-a072-d935e01b0544` 最新v2 `9f570ec9-f115-4d83-890d-08f978e4c5d6` 已published；draft=0、活动任务=0。approved parent `cd150093-2a59-45fb-a3dd-1be4dc9bb773` 的sceneIndex=0来源Claim `6fd965d7-77f9-478e-9075-32b010a8c607`，已有approved图片 `4e64c389-32ed-45b8-b9d0-0fa1dca96dfa`。不能在已发布版本重生成或改旧图；已向用户确认是否创建私有修订稿（仅准备，不生图）；答复前不新增业务版本。若选择私有修订，须沿既有产品流程并按真实继承结果重新绑定新version/parent/Claim。
- 旧writing-draft `4237cbcf-8371-4222-bc53-4f6eb45b2111` 实为9-23 workspace.guide，grounded_with_unresolved_review且无versionId/assetId，不能作为新approved分镜证明。旧run `b3eee57a-8a08-4867-9281-cb5b950affbf` failed、maxAgentTasks=46不是剩余额度；ai_credit合计0/管理员规则不代表新付费授权，截图“6”计价单位仍未确定。原始脱敏回执 `tmp/synclip-aa450-{current-admission,parent}-read.json`；仅读应用元数据，无Provider/DB写/生成/部署。

## Open deliverables and gates
- 生图：Web现已消费持久generatorVersion显示实际模型，原因字段不足时不臆测降级原因；总控收取对应精确CI，已通过后端回归无需重放。下一步确认一次私有gpt-image-2.5验证的既有来源/授权/费用/任务恢复前提，获得用户明确执行许可才提交。保留Hermes草稿、原论文/已认图片/未知paid CP；不重做Hermes、不换论文、不扩预算。真实PNG、科学质量与公开许可分别验收。
- Video: CI `38280757897` / Media `38291046457` green; execution remains blocked. Follow the video prerequisites above: first resolve the catalogue command's local identity/phase and current account qualification, then obtain scoped server-operation authorization and verify application/broker pairing before private production. Do not treat the generic failure as a proven permission denial or bypass readiness; this documentation pass has made no server/Provider call.
- UI：既有写反馈/逐场景入口已High GO合入c258da85/b82594d8/b06a8fab；共享旧queue-recovery夹具由af42e5e2修复，后续Media通过。Guide旧实现b34db919已有独立High与23/23，当前候选位于UI树 `tmp/ui-art-20261008/product-page-planning-20261011/review-candidates/P03-guide-focused-20261013.png`，已交用户审阅；同目录full-page旧稿因同图重复/文字杂乱被退回，不算认可。参考原A版/Figma/P04/P07/P15，局部界面和科研图均为设计示意，不是线上截图或科学资产。等用户认可再按已确定范围实现；实际站内旅程和整站审美验收仍开放。
- No deployment until the relevant code, exact CI, High review, and real-product/media quality gates close. Human review of paper visuals remains a separate acceptance gate.

## Historical pointers
- Full image/video/UI receipts, exact CI logs, releases, failures, protected assets and old next-actions remain in Git history (not active instructions). Read this file, project index, progress window and `node scripts/read-current-management-context.mjs` first.
- Taskmaster `currentTag=multistyle-research-illustration`; 1/4/5 remain in progress; 2/3 atomic items done only. Existing capability registry and Native plan remain applicable.
