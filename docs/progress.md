# OpenScience 进度（CURRENT window）

> 最新同步：2026-09-06 +08。生产4d39808，rollback f144eb7；Codex controller3d518af、demo9848411独立。后续文档提交不改变生产。

## PR103 release checks in progress

- Candidate c8c8cfe: model receives trusted selected-passage target; Worker11/11 passed. CI34031711111 build/typecheck/lint/unit passed, release browser104/110; remaining failures being repaired before merge. ECS candidate fullbuild/parser16 passed, production unchanged.
- New overview asset endpoint fixture and duplicate header link repaired, overview3/3 passed. Dashboard menu rail corrected; detached geometry fixed with actual rectangle checks; final overview/menu9/9 passed. Final SHA requires fresh CI/parser/deploy/public evidence.

## Real overview / contextual Hermes candidate

- 正式概览改为完整研究叙述，不再三行截断；保留原神狗与Drawer，段落入口使用现有target并绑定当前RO。桌面无任务续接/研究列表转概览，待审继续直接去任务。
- 展示仅含最新已提交版本approved image/video，标明版本及当前正文可能含后续编辑；原始证据独立入口。媒体不阻塞正文；内容失败可重试。
- 纠错：ResearchObject.version是乐观锁编辑计数，提交后会加1，不能等同Version.versionNo；asset.label为presentation_not_evidence标记，不能作为图标题。已按域实现修正并测试，禁止恢复先前错误假设。
- 全仓build、web typecheck/scoped ESLint、相关单元30/30、构建后production-mode浏览器15/15通过；涵盖概览/媒体重试/目标RO与段落、真实审核续接和Wanko。开发模式一次旧续接用例停留loading，构建后完整重跑通过；不隐去初次失败。
- 本地候选未部署；ECS release-id/public/loopback均4d39808。8317已停供重新构建；恢复预览前需启动Next start。待发布验收，不要把浏览器fixture视为真实论文生成证据。

## Companion identity and first dashboard slice

- 用户基本认可A样稿，明确阿拉丁神狗必须作为产品记忆与陪伴助手保留。样稿复用原Wanko/神灯Live2D及静态回退，头像入口一致；单活动模型、安静模式、系统减少动效和确认静止。3项样稿浏览器用例通过。
- 正式dashboard已接入局部展示层候选：灰白/深青、继续/开始/待办/文献/研究列表；原数据读取、权限、恢复、轮询及全局HermesDockAnchor/Drawer均保留，不搬样稿模拟逻辑进入生产。
- 服务器只读巡检正常；release-id/loopback/public均4d39808，生产未变。候选仍在codex/product-workflow-design未提交，发布与后续RO整合未完成。
- 回归发现旧auth-dashboard缺失source.retrieve恢复mock、旧注册payload及静态Hermes断言，已按现有契约更新；最终账号/桌面浏览器14/14、相关单元36/36、continuation/保护区域2/2通过；手机端中英文截图与Live2D ready通过。最终样稿3/3验证同一canvas在打开/安静/恢复时保持，避免重新加载。

## A palette research journey prototype

- 用户确认A配色与D2NN三态样稿；研究桌面→RO概览→Hermes已在隔离本地路由实现。开始入口仅选样例；预览/应用/撤销为固定本地示例，无真实研究写入。
- 复用已验收机制图与动画视频；图像/视频明确属于后续解释材料。移开图上按钮，避免遮住科学标签；原始论文DOI可展开。
- 独立审查修复旧预览失效、页面焦点及关闭助手后返回历史；验证：web typecheck、scoped ESLint、文档同步/lint及桌面1440/手机390连贯浏览器用例2/2通过；截图在apps/web/test/visual/out/research-journey。样稿尚未部署，整站实际流程联调待视觉验收。
- 本地预览 http://127.0.0.1:8317/_visual/research-journey?view=desk ，Next dev会话38875。本地branch codex/product-workflow-design，HEAD b7b2909；生产仍4d39808 / rollback f144eb7。

## Selective colleague integration — merged and deployed

- 用户确认论文→Hermes→RO→可视化→审核发布→阅读讨论主线，并授权选择性合并；页面职责现已确认，整站实施待样稿验收。
- 适配30fabce登录显隐/恢复/真实错误本地化与b0741eb资料dirty/save/discard；修复翻译命名空间、ACCOUNT_NOT_ACTIVE语义、并发丢稿、不同字段覆盖和身份字段耦合。冲突需明确保留或撤销。
- 独立High审查通过；全仓build/typecheck/lint/tests、最终web build/14账号浏览器用例、CI34022708530通过。PR102已合并4d39808并部署，rollback f144eb7。服务器parser16/core36/search2/BGE/ScanSci/健康/retention通过。
- 公网中英1440/390登录4项、真实账号1440/390资料撤销2项通过，profileWrites0/sessionClosed=true。初次SSH断线后确认旧release/无journal/锁释放再重试；补齐遗漏的parser报告后完成发布。浏览器即时断言改为等待React状态后通过。
- 证据：忽略目录science-video/selective-{deploy-final,parser,public,checkup-final}.log及selective-public-evidence.json。整体布局问题尚未宣称解决；后续已确认统一RO工作区组织。

## 2026-09-06 收尾调查与讨论入口

- 已fetch核对HEAD/origin-main8369524，生产f144eb7/rollback b23102b；独立demo9848411，controller3d518af。修正索引/计划旧版本摘要。
- 服务器按有界缓存维护回收753.4MB，cache1.005GB、可用98623787008bytes；13运行容器和应用/回滚/TTS/PyTorch/demo镜像保留，公网/loopback200、出网204。模型与暂停下载未动。
- 36个tracked page.tsx中22产品路由、14视觉评审源文件；8入口和3公开RO桌面/移动截图。私有页面本轮仅代码审查；公开9tab占位、媒体位置/技术文案、E2E内容混入Explore、注册过长、一个公开RO移动溢出3px已登记。
- 同事两分支实测21冲突，PR78已吸收核心方向；新6个UX提交有可取细节但含真实错误码分类问题，未合并。设计参考两篇均读到；未安装能力。
- 调查详见CURRENT plan末尾closeout-20260906；后续grill-me已确认旅程/页面职责，并获准制作A配色样稿。未启动整体联调、改版、应用部署或新生成任务。

## Repeated-image delivery repair — server restored

- User rejected the previous generic evaluation video:4/5 scenes reused the panorama and scientific animations were absent. Format/decoding success was not visual acceptance. Restore reviewed D2NN animation and retain generic mode only as illustrated-storyboard preview.
- Added tracked exact-input preparation, explicit renderMode and distinct-scene/motion regression.23focused/full workspace tests and High review passed. ECS demo9848411 restored:41.292s/2.53MB/39.06s render; five scenes/playback/seek/Range206/390px passed; original4inputs compare equal. PR101 merged; CI34019708441 passed. Original accepted voice retained.

## Generic renderer development — 2026-09-06

- Added bounded file-driven3–6scene renderer using existing Canvas/Chromium/FFmpeg and continuous audio mux. Source manifest is rendering data, not RO approval. API/tasks/TTS integration remains next.
- Startup verified production/public f144eb7 and rollback b23102b;50G used/92G available, containers/public200/egress204 healthy. Prior main CI34016486547 completed successfully.
- Renderer049e544 passed independent review,20media/full workspace tests and isolated ECS render:41.292s,8.08MB,37.95s render, full decode/fastStart and unchanged source WAV. PR100 merged, CI34018403393 passed. App/public demo unchanged; no new TTS/image call. See runbook/handoff for evidence and remaining speech alignment/approved-asset/task integration.

## Global Hermes presentation actions — deployed and accepted

- PR98接通全局Hermes分镜创建/修订/配图确认，复用已有RO版本/Claim/权限/任务/草稿页面。成功和版本切换清除准备状态；不明确的提交在当前抽屉内保留同一请求。无新接口、迁移、依赖或模型安装。
- PR99修正未定义ink-paper颜色令牌：真实截图暴露浅色文字/透明按钮，回归先红后绿；使用现有ink配色。最终服务器中文确认卡、按钮实际颜色和中英文1440/390布局通过。
- 真实任务0f50d797-4340-4ce8-9307-1268ea5610a5在b23102b创建：6幕/3条来源/原分镜保留/独立draft，1次执行/0重试/1Credit/1生成审计。M3 13.374秒，1540输入/924输出token；实际美元成本字段为空。f144eb7只读复验新增任务0，账号退出通过。
- 本地全仓build/typecheck/lint/test通过；web514、展示浏览器15、Hermes回归14；配色补修browser3及独立审查通过。PR98及其main CI通过；PR99 CI34015765809通过，重复main CI34016486547在记录时仍运行。
- 最终服务器精确build/parser16/运行依赖/迁移状态/BGE/ScanSci/容器健康/公网200/出网204/retention通过；无待迁移、无残留部署事务。完整证据见CURRENT handoff及忽略目录global-hermes-*。

## Existing foundations and limits

- 已有PDF上传保留原件、RO Claims、概念图、分镜与审稿流程；method/results/reproducibility自动提取仍有缺口。当前分镜输入是所选Claims及条件/限制，不是完整Evidence/SourceMap自动理解。
- Codex管理员验证生图仍可通过现有Gateway/Worker使用，受PC/v2ray与账号额度约束；不是面向普通用户的通用Codex执行服务。已有图像4661e80a仍为draft，未重复调用图像模型。
- 独立D2NN demo保留机制插图与连续Serena v4音轨；未新增图片、视频或TTS调用。CPU生图模型安装仍由用户暂停，继续复用Chromium/FFmpeg/PyTorch/Qwen/Codex。
- 跨浏览器/跨RO的不明确请求恢复未实现；来源失效或撤权仍由服务端重验。生成资产须人工审核，不是论文原始证据。

## Next

- A方向已基本验收，原神狗身份已恢复；下一段推进真实RO/助手页面，并在完整build/release验收后部署。任意RO视频/全文提取仍是待议能力，不直接实施。
- 唯一CURRENT交接：docs/handoff/2026-08-16-hermes-2d-pet-handoff.md。根目录main仍为b9616cb且用户文件未动，不得与origin/main或生产混淆。保留既有前端分支定期巡检，不重复建自动化。
