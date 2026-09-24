# CURRENT Progress Window
> 当前交付位于 release/onchip-production-line；精确 HEAD、生产/回退、资产与下一步只见 [Hermes CURRENT](handoff/2026-09-10-hermes-web-image-handoff.md)。旧记录在 Git 历史，不能当下一动作。

## 用户目标
- 让未读论文的人通过六维内容和设计过的单/多图读懂真实论文的核心思想；论文原图、生图按叙事需要使用，视频稍后。三篇成品先交用户看，得到质量认可前不批量冷启动。
- Hermes 复用已审 PDF/SourceMap/Claim/Evidence 和按阶段注入的科学/视觉技能，Chat 负责出图及网页 5.6 Sol 正式像素判断；保存坏图、失败收据与原 PDF，不自动重发未知付费请求。
- 必要的定向测试、CI、真实路径核验必须做；避免与改动无关的重复全套测试。用户已授权内部额度，管理员不应受内部 AI Credit 阻断；供应商额度仍独立。

## 2026-09-24 — 三篇读者页
- 第一篇学术图已公开 [OSR-2026-000023/v/3](https://openscience.428312321.xyz/research/OSR-2026-000023/v/3)，第二篇编辑图已公开 [OSR-2026-000022/v/2](https://openscience.428312321.xyz/research/OSR-2026-000022/v/2)；各自旧版本仍在。
- 第三篇两幕淡彩图均取自同一批准分镜：scene0 原 PNG 的未提交审图故障经新 review-only 入口恢复，5.6 Sol accepted 的副本获批；scene1 新 PNG 纠正旧图 “MOED” 为 “MQED”，正式审图 accepted、人工实看后获批。[OSR-2026-000024/v/1](https://openscience.428312321.xyz/research/OSR-2026-000024/v/1) 已公开，匿名页核实六维、5 Claim/30 Evidence、两张 1280×720 图片轮播和 PDF 不公开下载。旧错图及误判 accepted 收据保留私有，不伪称审图零误差。
- 三篇完成产品链路。用户明确称赞第三篇 scene0「光子准粒子」淡彩图，同时指出其他图仍有问题；整体科学叙事、美感与可理解性尚未获认可。第二篇学术/淡彩风格的标尺与多余因果问题候选保持私有 NO-GO，不能把“有图”算作三风格全部合格。
- 叙事优先的 `auto` 风格链路已在 fd612048 发布：science 不读风格目录，art 从可用手绘与 Baoyu 索引择一，render/正式审图只用选定资源；独立 `styleId` 修复经定向测试、High、CI 35957257382、真实任务实证。第三篇私有第二幕先选 Baoyu article:scientific、后选手绘 #175，均生成真实 PNG；正式像素审图分别因大公式喧宾夺主、电子/分叉断开和折线暗示未据物理关系而 blocked。新科学分镜 1d154c10 虽获模型 accepted，人工发现点积/频率解释错误，未生图；原配图技能 v10 补定向指导，加载 6/6 和 Worker typecheck 通过，待 CI/发布/真实任务。风格可选不等于叙事合格；旧公开图不改。

## 当前工程状态
- 手工 PNG 审图未提交恢复、像素标签提示已通过定向测试/类型检查、独立 High、[CI 35893326942](https://github.com/photonics-dhl/OpenScience/actions/runs/35893326942)，部署并真实用于第三篇。当前生产身份与回退见 CURRENT。
- 管理员内部 AI Credit 一对一事务自动补账已在 Domain agent 提交/付费提取恢复部署；原扣减、幂等和审计保留，普通用户额度不变。[定向 CI 35902058149](https://github.com/photonics-dhl/OpenScience/actions/runs/35902058149) success、独立 High GO、生产 release 精确核对。扩展旧 agent/ingestion 文件 90 pass/18 fail（旧确认/重试夹具与条件），不称全套通过；生产零余额新任务尚未发生，留待下次正常任务看账本，不额外发模型探针。
- 只读 [Hermes 研发观察台](proposals/2026-09-23-hermes-development-live.html) 展示目标、角色/技能、阶段产物，并逐图列出实际风格、能力链、画面效果和具体差额；本机派生 feed 是人工检查点，会标示过期，不是自动遥测。能力消费与尚未实现的原文疑点回读/跨任务学习见 [能力台账](runbooks/hermes-capability-registry.md)。

## 其他交付
- 期刊增强已随当前生产线集成并保留线上入口；真实授权刊物试用、版权来源与服务额度的准确状态见 [期刊 CURRENT](handoff/2026-09-15-journal-onboarding-handoff.md)，不以配图任务推断期刊已完成真实试用。
- Fig.2 重复 plan 与 d5087b03 悬空 draft 的处置、Fig.1 原字节展示被否定、旧 6Pro/unknown 任务的禁止重放范围见 Hermes CURRENT；不得批量删除历史资产。
