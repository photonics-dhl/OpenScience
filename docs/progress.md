# CURRENT Progress Window
> 当前交付位于 release/onchip-production-line；精确 HEAD、生产/回退、资产与下一步只见 [Hermes CURRENT](handoff/2026-09-10-hermes-web-image-handoff.md)。旧记录在 Git 历史，不能当下一动作。

## 用户目标
- 让未读论文的人通过六维内容和设计过的单/多图读懂真实论文的核心思想；论文原图、生图按叙事需要使用，视频稍后。三篇成品先交用户看，得到质量认可前不批量冷启动。
- Hermes 复用已审 PDF/SourceMap/Claim/Evidence 和按阶段注入的科学/视觉技能，Chat 负责出图及网页 5.6 Sol 正式像素判断；保存坏图、失败收据与原 PDF，不自动重发未知付费请求。
- 必要的定向测试、CI、真实路径核验必须做；避免与改动无关的重复全套测试。用户已授权内部额度，管理员不应受内部 AI Credit 阻断；供应商额度仍独立。

## 2026-09-26 — 第一篇真实新图与叙事配文返工
- 第一篇私有 v10 经已审 Hermes 同源分镜 `9bf1a712`、真实 Chat PNG `7f497502`、正式 5.6 Sol accepted、人工原始像素核对，沿已有审核/指定选图流程发布 [OSR-2026-000023/v/4](https://openscience.428312321.xyz/research/OSR-2026-000023/v/4)。匿名首页点入实见 1280×720 图片、六维/6 Claim/58 Evidence；旧 v3 仍可读，PDF 仍仅工作区成员可下载。v4 的 reader 配文主要描述布局，科学解释不足，故不宣称最终叙事质量通过。
- 原 `openscience-research-illustration` skill 升为 v12，科学阶段要求 `narration` 面向读者讲论文支持的关系/条件，原审阅阶段阻断布局说明式配文；原 `installed-media-skills.ts` 路由未变。6 项定向测试、[CI 36165405964](https://github.com/photonics-dhl/OpenScience/actions/runs/36165405964) success；应用 `945788a5` 曾部署。从 v4 恢复新私有 v11，六维/Claim/Evidence 同源复用；Hermes 十标签分镜 `b98c4735` → 四标签 `2164dacd`。Chat 真图 `21fefb6a`（hash `4b989596…`）正式网页 5.6 Sol accepted，但原始 PNG 经独立 High 判 NO-GO：上方近场纹理像第二束传播波、配文未直说独立验证缺口。旧图私有；科学修订 `6c384954` 已批准，配文改为直述近场未获独立数值/实验核对。
- skill v13 与原正式像素审图提示的空间语义修复通过 17 项定向测试、Worker typecheck、独立 High、[CI 36170285819](https://github.com/photonics-dhl/OpenScience/actions/runs/36170285819) success，生产 `91ab1628` 定向部署 exit0，回退 `945788a5`。6c 真实图 `0fdd4e30`（hash `f909e763…`）被新正式审图 blocked：孔旁墨点沿右侧形成楔形尾迹；art-only 方案 `93507dd7` 已批准，标题/读者配文/科学字段/证据约束逐项与 6c 相同，只把纹理压回孔缘四向窄环、加大远场间隔。新 Chat 真图 `65ffbfee` hash `54484359…` 正式 5.6 Sol accepted、人工看原始 PNG、独立 High GO。批准同版图、发布审查 passed/0 hardBlocks，独选此图发布 [OSR-2026-000023/v/5](https://openscience.428312321.xyz/research/OSR-2026-000023/v/5)；匿名首页实点 1280×720 图，公开 API 精确核完整标题/配文、六维/6 Claim/58 Evidence，旧 v4 仍 200、PDF `workspace_member` 无匿名下载。用户最终审美/可理解性反馈待收。
- 此前 `0317c9c4` 生图在 prompt 提交前被一个无任务归属的 Chat 图库标签卡住；精确关闭该标签后独立任务可成功，旧失败/未提交证据仍保留。偶发卡页尚未有永久修复；不自动重发 unknown 或切 provider。

## 2026-09-24 — 三篇读者页
- 第一篇学术图已公开 [OSR-2026-000023/v/3](https://openscience.428312321.xyz/research/OSR-2026-000023/v/3)，第二篇编辑图已公开 [OSR-2026-000022/v/2](https://openscience.428312321.xyz/research/OSR-2026-000022/v/2)；各自旧版本仍在。
- 第三篇 v1 与获称赞的首图保留；新第二幕修正误导的发射箭头，真实 PNG 4e64c389 经网页 5.6 Sol 正式 accepted 与人工核图，和首图 approved copy 一起只选两图发布 [OSR-2026-000024/v/2](https://openscience.428312321.xyz/research/OSR-2026-000024/v/2)。匿名首页实际点入并切换轮播，核实六维、5 Claim/30 Evidence、两张 1280×720 图片加载；PDF 仍只对工作区成员开放下载。旧错图、阻断图和误判 accepted 收据保留私有。
- 三篇完成产品链路。用户明确称赞第三篇 scene0「光子准粒子」淡彩图，同时指出其他图仍有问题；整体科学叙事、美感与可理解性尚未获认可。第二篇学术/淡彩风格的标尺与多余因果问题候选保持私有 NO-GO，不能把“有图”算作三风格全部合格。
- 第一篇正从已审 v3 来源修订：私有 v10 草稿 eb8b3db7，复用 6 Claim/58 Evidence。新 PNG 31c/3f1/cb4/1cd/7d9/a38 均正式 blocked 或人工 NO-GO，未替换旧公开 v3；a38 的暖纸墨线接近用户偏好，但正式审图拦下小箭头/验讫章感，人工另发现“空孔”被涂成黑盘。新同源科学方案 80673845 与 art-only 41e0df85→9df66c13 成功；最终方案科学字段保持一致、空孔与禁印章一致并获 approved。两次新图任务在 Chat 新页面提交 prompt 前失败，spool 均有未提交凭据，尚无新 PNG。目录 277 编号手绘中 256 可供 auto 选，另有 Baoyu article 23、infographic 22；风格可选不等于成图合格。
- `auto` 风格链路仍复用 Hermes 的 science→art→render/审图阶段与现有手绘/Baoyu 资源。第三篇旧科学稿、手绘/板书/淡彩坏图被人工或正式审图拦下；59b861b5 的审图在原窗口无重发恢复为 blocked。方案 cd150093 保留已审科学字段，仅用无方向虚线括弧表示逻辑条件；新图 4e64c389 获正式审图 accepted、人工实看并发布。Bridge URL 等待修复已随生产 c0b55 部署，真实新任务 13 秒取得 URL 并成功；30 秒之后才出现 URL 的真实案例未观察。下一项应改善前两篇机制画面的焦点，不重复全文分析或按风格凑数。

## 当前工程状态
- 手工 PNG 审图未提交恢复、像素标签提示已通过定向测试/类型检查、独立 High、[CI 35893326942](https://github.com/photonics-dhl/OpenScience/actions/runs/35893326942)，部署并真实用于第三篇。当前生产身份与回退见 CURRENT。
- 管理员内部 AI Credit 一对一事务自动补账已在 Domain agent 提交/付费提取恢复部署；原扣减、幂等和审计保留，普通用户额度不变。[定向 CI 35902058149](https://github.com/photonics-dhl/OpenScience/actions/runs/35902058149) success、独立 High GO、生产 release 精确核对。扩展旧 agent/ingestion 文件 90 pass/18 fail（旧确认/重试夹具与条件），不称全套通过；生产零余额新任务尚未发生，留待下次正常任务看账本，不额外发模型探针。
- 本轮 bridge 等待、Guide 默认 `auto` 与对应 CI 范围更新经 17/17 定向测试、Worker typecheck、URL 35/120 秒模拟与单发送检查，[CI 35992870346](https://github.com/photonics-dhl/OpenScience/actions/runs/35992870346) success；生产 c0b55 / 回退 57373a79。新图的真实正常路径有完整 browser spool 和产品任务收据，未测试晚 URL 的真实上游时序。发布审核 passed/0 block，旧公开 v1 与私有候选均保留。
- 原 planner 新增候选 `label N` 越界校验 8/8 定向测试、Worker typecheck 与 [CI 36014342028](https://github.com/photonics-dhl/OpenScience/actions/runs/36014342028) success；Hermes 单幕 art `scenes` 结构修复 17/17、Worker typecheck、独立 High 与 [CI 36116799049](https://github.com/photonics-dhl/OpenScience/actions/runs/36116799049) success。二者已随应用 d7678b97 部署，真实 806→41e→9df 方案成功，未重做全文分析。网页桥因 Chat 新 UI 旧选择器失效，两次生图均未提交；5b7822d0 兼容候选已推送，[CI 36123227015](https://github.com/photonics-dhl/OpenScience/actions/runs/36123227015) success，provider 未更新，新图/正式审图未验证。
- 只读 [Hermes 研发观察台](proposals/2026-09-23-hermes-development-live.html) 展示目标、角色/技能、阶段产物，并逐图列出实际风格、能力链、画面效果和具体差额；本机派生 feed 是人工检查点，会标示过期，不是自动遥测。能力消费与尚未实现的原文疑点回读/跨任务学习见 [能力台账](runbooks/hermes-capability-registry.md)。

## 其他交付
- 期刊增强已随当前生产线集成并保留线上入口；真实授权刊物试用、版权来源与服务额度的准确状态见 [期刊 CURRENT](handoff/2026-09-15-journal-onboarding-handoff.md)，不以配图任务推断期刊已完成真实试用。
- Fig.2 重复 plan 与 d5087b03 悬空 draft 的处置、Fig.1 原字节展示被否定、旧 6Pro/unknown 任务的禁止重放范围见 Hermes CURRENT；不得批量删除历史资产。
