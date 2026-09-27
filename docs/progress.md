# CURRENT Progress Window
> 当前交付位于 release/onchip-production-line；精确 HEAD、生产/回退、资产与下一步只见 [Hermes CURRENT](handoff/2026-09-10-hermes-web-image-handoff.md)。旧记录在 Git 历史，不能当下一动作。

## 用户目标
- 让未读论文的人通过六维内容和设计过的单/多图读懂真实论文的核心思想；论文原图、生图按叙事需要使用，视频稍后。三篇成品先交用户看，得到质量认可前不批量冷启动。
- Hermes 复用已审 PDF/SourceMap/Claim/Evidence 和按阶段注入的科学/视觉技能，Chat 负责出图及网页 5.6 Sol 正式像素判断；保存坏图、失败收据与原 PDF，不自动重发未知付费请求。
- 必要的定向测试、CI、真实路径核验必须做；避免与改动无关的重复全套测试。用户已授权内部额度，管理员不应受内部 AI Credit 阻断；供应商额度仍独立。

## 2026-09-27 — 美术预算修正与第二篇固定公开
- 原 `b4437411` 的艺术字段连同已固定科学描述两次超过 4000 字完整 brief 上限（4333/4165）。Worker 在原 art 请求中给出每幕剩余字数，auto 风格预留内部 marker；不增加模型阶段、门禁或科学截断。混合原图/自动风格索引经独立 High NO-GO 后修复，48/48 定向测试、Worker typecheck、独立 High GO、[媒体 CI 36314197321](https://github.com/photonics-dhl/OpenScience/actions/runs/36314197321) success；干净 `354de481` 应用生产事务完成，公网 `/__release` 精确一致，第二篇 v3 仍 HTTP 200。真实 Hermes 对预算的遵循尚待下一个有实际叙事需求的任务观察，不为验证额外生图。生产/回退精确 SHA 与未完成项见 CURRENT。
- 第二篇最终同源画面方案 `31b5987a`：`96ae6380` 真图 `03e66b71` 的上下 θ 箭头与电子线共线被正式像素审图 blocked，art-only `1d4400f7` 因 science/画法冲突被末审拒绝；首次科学重规划 `b4437411` 因 auto 风格字段/brief 超长结构化失败，固定水彩、缩短输入后 `31b5987a` 科学/美术一致并经独立 High GO。新图 `9def3e16` 真 Chat PNG hash `329ead21…`、5.6 Sol 正式 accepted、原图人工与独立 High GO，已批准。私有 v13 与公开 v2 六维正文相同、许可承接、发布审查 passed/零 hard block，仅选新图发布[第二篇固定 v3](https://openscience.428312321.xyz/research/OSR-2026-000022/v/3)。匿名首页实点 v3 1280×720、六维/7 Claim/27 Evidence、PDF 仍 `workspace_member`；旧 v2 保留。用户最终审美反馈待收。
- `7e7f3eca` 修 Chat 图片菜单可见但短暂 `aria-disabled` 的误点击；定向无费界面演练、语法/文档检查、独立 High 与[媒体 CI 36306819117](https://github.com/photonics-dhl/OpenScience/actions/runs/36306819117)通过，干净 SHA 生产事务/回退 `93ee9e36`/公网 release/同 SHA provider 安装完成，私有旧 provider 已备份。独立 `a8b3ba9e` 真正完成 Chat PNG→产品 draft→5.6 Sol 像素审图 accepted；原始 PNG SHA256 `30e9c9f6…` 人工实看认为仅是稀疏公式横幅，未放行。Hermes 同源重规划 `95b64364` 因无来源裸数字 7 结构化拒收；`6248b43d` 因非等距符号/七标签/无因果箭头被独立 High NO-GO；`242c34fe` 进一步压缩后缺可见时间关系；`96ae6380` 四标签可见 z/θ→t、远场条件/虚拟边界、独立 High GO 已批准，单张真图任务 `03e66b71` 运行中。公开 v2 不变。
- 生产 93ee9e36/回退 c29e8305，[媒体 CI 36303474662](https://github.com/photonics-dhl/OpenScience/actions/runs/36303474662) success、同 SHA Chat provider 已安装。新 `3be6a359` 真图完整跑通 Chat PNG/规范化/5.6 Sol 正式像素审图，但正式 blocked：散射扇形大小/射线数/疏密不同，原图人工实看亦偏稀疏。art-only `a9440918` 因色带覆盖电子整段轨迹被独立 High 拦下；`fa846164` 科学字段全等、中央有限带及同模板扇形方案获批准。新图 `813202a9` 在模式确认前精确未提交；空白 Chat 页复现图片菜单短暂 `aria-disabled=true`，旧 runner 误点禁用 span 后只等待结果。候选改为等真实可用再点，真实 DOM、受控 span、无费选择、语法与独立 High GO；待 CI/安装/独立新图。公开 v2 不变。
- 当前生产 c29e8305/回退 6b09，[媒体 CI 36300011047](https://github.com/photonics-dhl/OpenScience/actions/runs/36300011047) success、同 SHA Chat provider 已安装。已保存概念图 `22178361` 走 review-only `7655f64e`，原 hash 相同，5.6 Sol 正式 blocked 仅因标点；人工拒发空 n(z)。Hermes 同源重构经独立 High 逐项修正，art-only `c108c45f` 保持科学字段全等并批准。其图任务 `f2f123a9` 在 Chat 图片模式前精确 not-submitted；空白页抓到菜单水合恢复已选状态使全页出现两处 `Create image`，runner 候选改为检查当前 form 已选标记，语法/High GO，待 CI、安装和独立新图。公开 v2 不变。
- `8337ab47` 的可见 profile 选择与中文标签索引修复经 46/46、Worker typecheck、独立 High、[CI 36290324334](https://github.com/photonics-dhl/OpenScience/actions/runs/36290324334) success，定向部署且公网 `/__release` 一致；回退 ffb。第二篇 v13 的同源科学修订 `3d2115fe` 正式 accepted/独立 High GO/批准。旧图 `5dc700aa` 确定未提交 Chat，失败证据保留。
- 第二篇 v13 三张精确几何真图 `1bf46ec9`、`51e95ec3`、`25117b5d` 均正式 blocked；Hermes 同源概念编码 `ff11bbcf` accepted/High GO/批准。`69f08f5f` 确定未提交，桥接器图片模式修复经无费演练、独立 High、[CI 36295221466](https://github.com/photonics-dhl/OpenScience/actions/runs/36295221466) success；生产 6b09 已构建/部署，私有日志重试在首次 SSH 中断与锁内旧态恢复后成功，provider 同 SHA 安装且 renderer 校验通过。新 `22178361` 真实 Chat 提交、PNG/规范化/draft 成功；正式审图附件菜单旧 exact 文案失配，review-spool 确定未提交。新图人工实看 n(z) 空括号，不可发布。review-runner 候选改唯一上传按钮前缀，真实空白页 locator/filechooser 验证、语法、High GO；待 CI/安装、原 PNG 审图续接并返工画面。公开 v2 不变。

## 2026-09-26 — 第一篇真实新图与叙事配文返工
- 第一篇私有 v10 经已审 Hermes 同源分镜 `9bf1a712`、真实 Chat PNG `7f497502`、正式 5.6 Sol accepted、人工原始像素核对，沿已有审核/指定选图流程发布 [OSR-2026-000023/v/4](https://openscience.428312321.xyz/research/OSR-2026-000023/v/4)。匿名首页点入实见 1280×720 图片、六维/6 Claim/58 Evidence；旧 v3 仍可读，PDF 仍仅工作区成员可下载。v4 的 reader 配文主要描述布局，科学解释不足，故不宣称最终叙事质量通过。
- 原 `openscience-research-illustration` skill 升为 v12，科学阶段要求 `narration` 面向读者讲论文支持的关系/条件，原审阅阶段阻断布局说明式配文；原 `installed-media-skills.ts` 路由未变。6 项定向测试、[CI 36165405964](https://github.com/photonics-dhl/OpenScience/actions/runs/36165405964) success；应用 `945788a5` 曾部署。从 v4 恢复新私有 v11，六维/Claim/Evidence 同源复用；Hermes 十标签分镜 `b98c4735` → 四标签 `2164dacd`。Chat 真图 `21fefb6a`（hash `4b989596…`）正式网页 5.6 Sol accepted，但原始 PNG 经独立 High 判 NO-GO：上方近场纹理像第二束传播波、配文未直说独立验证缺口。旧图私有；科学修订 `6c384954` 已批准，配文改为直述近场未获独立数值/实验核对。
- skill v13 与原正式像素审图提示的空间语义修复通过 17 项定向测试、Worker typecheck、独立 High、[CI 36170285819](https://github.com/photonics-dhl/OpenScience/actions/runs/36170285819) success，生产 `91ab1628` 定向部署 exit0，回退 `945788a5`。6c 真实图 `0fdd4e30`（hash `f909e763…`）被新正式审图 blocked：孔旁墨点沿右侧形成楔形尾迹；art-only 方案 `93507dd7` 已批准，标题/读者配文/科学字段/证据约束逐项与 6c 相同，只把纹理压回孔缘四向窄环、加大远场间隔。新 Chat 真图 `65ffbfee` hash `54484359…` 正式 5.6 Sol accepted、人工看原始 PNG、独立 High GO。批准同版图、发布审查 passed/0 hardBlocks，独选此图发布 [OSR-2026-000023/v/5](https://openscience.428312321.xyz/research/OSR-2026-000023/v/5)；匿名首页实点 1280×720 图，公开 API 精确核完整标题/配文、六维/6 Claim/58 Evidence，旧 v4 仍 200、PDF `workspace_member` 无匿名下载。用户最终审美/可理解性反馈待收。
- 此前 `0317c9c4` 生图在 prompt 提交前被一个无任务归属的 Chat 图库标签卡住；精确关闭该标签后独立任务可成功，旧失败/未提交证据仍保留。偶发卡页尚未有永久修复；不自动重发 unknown 或切 provider。

## 2026-09-26 — 第二篇叙事升级与技能收敛
- 第二篇自公开 v2 同源恢复私有 v13，复用六维与 7 Claim/27 Evidence。早期多幕和单幕方案暴露标签过密、无来源数字、brief 超长等问题；错误资产未公开。可复现的校验、Skill 消费与历史 CI 证据保留在 Git 历史及[能力台账](runbooks/hermes-capability-registry.md)，当前结果与下一步以 Hermes CURRENT 为准。

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
