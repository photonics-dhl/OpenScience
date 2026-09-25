# CURRENT Progress Window
> 当前交付位于 release/onchip-production-line；精确 HEAD、生产/回退、资产与下一步只见 [Hermes CURRENT](handoff/2026-09-10-hermes-web-image-handoff.md)。旧记录在 Git 历史，不能当下一动作。

## 用户目标
- 让未读论文的人通过六维内容和设计过的单/多图读懂真实论文的核心思想；论文原图、生图按叙事需要使用，视频稍后。三篇成品先交用户看，得到质量认可前不批量冷启动。
- Hermes 复用已审 PDF/SourceMap/Claim/Evidence 和按阶段注入的科学/视觉技能，Chat 负责出图及网页 5.6 Sol 正式像素判断；保存坏图、失败收据与原 PDF，不自动重发未知付费请求。
- 必要的定向测试、CI、真实路径核验必须做；避免与改动无关的重复全套测试。用户已授权内部额度，管理员不应受内部 AI Credit 阻断；供应商额度仍独立。

## 2026-09-24 — 三篇读者页
- 第一篇学术图已公开 [OSR-2026-000023/v/3](https://openscience.428312321.xyz/research/OSR-2026-000023/v/3)，第二篇编辑图已公开 [OSR-2026-000022/v/2](https://openscience.428312321.xyz/research/OSR-2026-000022/v/2)；各自旧版本仍在。
- 第三篇 v1 与获称赞的首图保留；新第二幕修正误导的发射箭头，真实 PNG 4e64c389 经网页 5.6 Sol 正式 accepted 与人工核图，和首图 approved copy 一起只选两图发布 [OSR-2026-000024/v/2](https://openscience.428312321.xyz/research/OSR-2026-000024/v/2)。匿名首页实际点入并切换轮播，核实六维、5 Claim/30 Evidence、两张 1280×720 图片加载；PDF 仍只对工作区成员开放下载。旧错图、阻断图和误判 accepted 收据保留私有。
- 三篇完成产品链路。用户明确称赞第三篇 scene0「光子准粒子」淡彩图，同时指出其他图仍有问题；整体科学叙事、美感与可理解性尚未获认可。第二篇学术/淡彩风格的标尺与多余因果问题候选保持私有 NO-GO，不能把“有图”算作三风格全部合格。
- 第一篇正从已审 v3 来源修订：私有 v10 草稿 eb8b3db7，复用 6 Claim/58 Evidence。新 PNG 31c/3f1/cb4/1cd/7d9/a38 均正式 blocked 或人工 NO-GO，未替换旧公开 v3；最新 aged-academia 图 a38 的暖纸墨线接近用户偏好，但正式审图拦下小箭头/验讫章感，人工另发现“空孔”被涂成黑盘。art-only 修订 abe8e1a0 已成功保存私有 draft，科学字段与 c935 相同；旧 encoding/narration 的“小印章”与新 art 禁令冲突，故未批准或生成下一张 PNG。用户仅认可旧 cb4 的风格，不代表物理正确。目录 277 编号手绘中 256 可供 auto 选，另有 Baoyu article 23、infographic 22；风格可选不等于成图合格。
- `auto` 风格链路仍复用 Hermes 的 science→art→render/审图阶段与现有手绘/Baoyu 资源。第三篇旧科学稿、手绘/板书/淡彩坏图被人工或正式审图拦下；59b861b5 的审图在原窗口无重发恢复为 blocked。方案 cd150093 保留已审科学字段，仅用无方向虚线括弧表示逻辑条件；新图 4e64c389 获正式审图 accepted、人工实看并发布。Bridge URL 等待修复已随生产 c0b55 部署，真实新任务 13 秒取得 URL 并成功；30 秒之后才出现 URL 的真实案例未观察。下一项应改善前两篇机制画面的焦点，不重复全文分析或按风格凑数。

## 当前工程状态
- 手工 PNG 审图未提交恢复、像素标签提示已通过定向测试/类型检查、独立 High、[CI 35893326942](https://github.com/photonics-dhl/OpenScience/actions/runs/35893326942)，部署并真实用于第三篇。当前生产身份与回退见 CURRENT。
- 管理员内部 AI Credit 一对一事务自动补账已在 Domain agent 提交/付费提取恢复部署；原扣减、幂等和审计保留，普通用户额度不变。[定向 CI 35902058149](https://github.com/photonics-dhl/OpenScience/actions/runs/35902058149) success、独立 High GO、生产 release 精确核对。扩展旧 agent/ingestion 文件 90 pass/18 fail（旧确认/重试夹具与条件），不称全套通过；生产零余额新任务尚未发生，留待下次正常任务看账本，不额外发模型探针。
- 本轮 bridge 等待、Guide 默认 `auto` 与对应 CI 范围更新经 17/17 定向测试、Worker typecheck、URL 35/120 秒模拟与单发送检查，[CI 35992870346](https://github.com/photonics-dhl/OpenScience/actions/runs/35992870346) success；生产 c0b55 / 回退 57373a79。新图的真实正常路径有完整 browser spool 和产品任务收据，未测试晚 URL 的真实上游时序。发布审核 passed/0 block，旧公开 v1 与私有候选均保留。
- 原 planner 对新增候选的 science/art 文本检查 `label N` 是否越过可见标签数组，避免已观察到的两次越界分镜进入出图；不改历史草稿读取路径。先写定向行为测试复现两处红，再修复为 8/8 pass，Worker typecheck exit0；[CI 36014342028](https://github.com/photonics-dhl/OpenScience/actions/runs/36014342028) success，尚未部署生产。
- 第一篇 abe8 草稿的“小印章”科学/艺术字段冲突仍未放行；同源修订 63e60709 于 art 阶段三次结构化输出失败，未产生方案或图片。现有 Hermes 技能与单幕 art 提示、Gateway 重试反馈已针对这次格式错误修复并推送 f64674d7，17/17 定向测试、Worker typecheck、独立 High GO；[CI 36116799049](https://github.com/photonics-dhl/OpenScience/actions/runs/36116799049) 运行中，生产未更新，真实任务效果待验证。不重跑全文分析或旧失败任务。
- 只读 [Hermes 研发观察台](proposals/2026-09-23-hermes-development-live.html) 展示目标、角色/技能、阶段产物，并逐图列出实际风格、能力链、画面效果和具体差额；本机派生 feed 是人工检查点，会标示过期，不是自动遥测。能力消费与尚未实现的原文疑点回读/跨任务学习见 [能力台账](runbooks/hermes-capability-registry.md)。

## 其他交付
- 期刊增强已随当前生产线集成并保留线上入口；真实授权刊物试用、版权来源与服务额度的准确状态见 [期刊 CURRENT](handoff/2026-09-15-journal-onboarding-handoff.md)，不以配图任务推断期刊已完成真实试用。
- Fig.2 重复 plan 与 d5087b03 悬空 draft 的处置、Fig.1 原字节展示被否定、旧 6Pro/unknown 任务的禁止重放范围见 Hermes CURRENT；不得批量删除历史资产。
