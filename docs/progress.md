# CURRENT Progress Window
> 当前交付位于 release/onchip-production-line；精确 HEAD、生产/回退、资产与下一步只见 [Hermes CURRENT](handoff/2026-09-10-hermes-web-image-handoff.md)。旧记录在 Git 历史，不能当下一动作。

## 用户目标
- 让未读论文的人通过六维内容和设计过的单/多图读懂真实论文的核心思想；论文原图、生图按叙事需要使用，视频稍后。三篇成品先交用户看，得到质量认可前不批量冷启动。
- Hermes 复用已审 PDF/SourceMap/Claim/Evidence 和按阶段注入的科学/视觉技能，Chat 负责出图及网页 5.6 Sol 正式像素判断；保存坏图、失败收据与原 PDF，不自动重发未知付费请求。
- 必要的定向测试、CI、真实路径核验必须做；避免与改动无关的重复全套测试。用户已授权内部额度，管理员不应受内部 AI Credit 阻断；供应商额度仍独立。

## 2026-09-28 — 稳定性上线与原来源纠正
- 用户已将开源生图第二通道暂缓，保留调研；本轮只汇报现有 Hermes→Chat 卡点并同步范围，没有新增模型请求、测试或部署。实际阻断与后续动作见 CURRENT。
- 单图请求与普通两主体限制已确认冲突：最小机制需三条来源，沿 Domain 原四项结构修复，72/72 定向通过；缺失的坐标表经原 Evidence 流程人工核对补入私有稿。配图不再消费全文六字段/观察编号协议，科学规则和全文审阅保持；13/13 加载、2/2 disclosure、Worker typecheck 通过。组合 High 和修正文档格式后的完整 CI 通过，已正常发布；同指令真实任务 b6135bca 已失败：16k纯thinking耗尽，32k主请求超时且上游结果未知，原备用key2返回401；没有新分镜或PNG。只读配置/账本确认备用两次历史调用也401、无成功记录；不是Chat网页登录故障。追加对照未执行，先核供应商侧终态与鉴权，实际下一步见CURRENT。

- 用户否定第二篇 v4 的坐标/物理叙事。原文复核确认 x 光传播、y 电场/狭缝、z 电子；20 nm 间隙与 77 nm 场宽属于不同方向，CdS 为纳米线截面。旧“正碰”Claim 也须科学修订，不能只换颜色或据旧 accepted 放行。
- 图片旁保留/删除（原软删除与公开历史保护）、内容列表内存放大修复、源站失败不误重启 Tunnel 已随 `1c04aaeb` 上线；定向测试、独立 High、媒体 CI 通过。真实桌面看见 33 张逐图动作，删除框选择保留后数量不变；468 项内容加载成功，API 观察约 1.274→1.333 GiB、重启 0，旧公开 v4 图片仍加载。watchdog 原 timer 新代码实跑 success、HA=4；这是定向观察，不能证明长期无故障。
- Hermes 原技能与同源 SourceMap 补接已部署；新来源 pp13/14 实际保留 1885/3051 字表格。二次复审分段复用与一次恢复修复已通过回归/typecheck、独立 High、媒体 CI 并随 `44fabdc4` 发布。原页面恢复同一任务成功，72.4 秒内 34 个相关响应全 200、自动显示结果；真实 v5 两次模型调用约 199 秒，六字段仍原样 accepted，未证明科学审校改善。坐标段完整送达，但经典辐射定义相邻段 P00073 未被现有来源选择器纳入；不能声称完整回读附录。
- 已按原文在既有审阅页人工收窄可复现性断言，保存新私有版本 `771ff7f3`；新私有旧 Claim 后继 `1dcd87ab` 通过原 `updateClaim` 纠正正碰为近垂直，来源谱系和八条 Evidence 保持。明确记为专家审校，不冒充 Hermes 自动效果。现沿原来源→Claim 审核推进机制图，旧公开版本不变；实际进度见 CURRENT。
- 两条新 Claim/21 段证据已在原页面确认；自动分镜被 `2*c*` 与 `2c` 的数值格式误判拦下，尚无新 PNG。原比较器已做六行最小修复，保持数量/单位/量名/独立来源绑定；66/66 定向测试、Worker typecheck、真实来源离线回放、独立 High 通过。媒体 CI 通过并随 df59 部署。随后单图 57d39ec8 在 16k/32k adaptive thinking 均耗尽且无正文，尚未生成新图；已零模型调用重建相同请求，定位约束/来源与接口边界，不能把程序修复算作真实图通过。
- 开源第二通道评估已完成；当前 16 核、约 30 GiB、无 GPU 的业务机不适合承载 Qwen-Image-2.1。官方权重为研究许可，商业采用需单独授权；Apache-2.0 的 Z-Image-Turbo 可作独立 GPU 候选。未下载候选生图权重、购买算力或切换供应商；详见索引报告。

## 2026-09-28 — 第二篇手绘叙事图固定 v4（历史误判）

> 后续用户复核推翻本节的科学叙事通过判断：坐标/机制表达错误，参考穿缝图的 CdS 材质和数值还需修正；当前纠正、502 根因和图片管理改动见 CURRENT。下列正式/人工 GO 是当时收据，不代表用户认可或正确性结论。
- 生产 `5b4f7a1e` / rollback `44230e80`：[媒体 CI 36327366358](https://github.com/photonics-dhl/OpenScience/actions/runs/36327366358) success、51/51 定向测试、Worker typecheck、独立 High；原数值守卫只补同一错误的字段定位。真实第二篇 v13 的同源科学方案 `98fdab13` 获来源/独立 High GO；art-only 两次保持科学字段，只修“左右同序”和“虚线交叉”。新 Chat 真图 `e68ab9d2` hash `4d3d6b1c…` 正式 5.6 Sol accepted、原 PNG 实看与独立 High GO。
- 只选 `e68ab9d2` 发布[第二篇固定 v4](https://openscience.428312321.xyz/research/OSR-2026-000022/v/4)；许可与发布审查 passed/0 hardBlocks。匿名首页实点 1280×720 新图、六维/7 Claim/27 Evidence，PDF `workspace_member`，旧 v3 HTTP 200；用户终评待收。
- 图 `449e391b` 的 PNG 已保存，审图附件两次超时且提示词未提交；仅审图 `d9cee01e` 复用原字节。定向上传随后约 10 秒完成，长期根因不明。闲置产品页阻塞 CDP，精确重开该页恢复并保留会话。

## 2026-09-27 — 画面叙事守卫与重媒体草稿提交
- `a8b3ba9e` 真图的稀疏公式横幅忠实于源分镜 `fa846164`，暴露科学方案本身没有用可见符号讲清关系。原配图 Skill v16 在 science/末审要求机制关系能从画面读取，允许确以数学表达式为主题的图。54/54 定向测试、Worker typecheck、独立 High、[媒体 CI 36316251147](https://github.com/photonics-dhl/OpenScience/actions/runs/36316251147) 通过并部署；效果须看新真实方案，不能把审图 accepted 当读者认可。
- 第二篇公开 v3 的 68 项媒体使正常私有版本提交超过 Prisma 默认 5 秒并 P2028 回滚。28db 延长原 Serializable 事务到 30 秒，未删草稿/坏图或改审批语义；11/11 提交测试、Domain typecheck、独立 High、[媒体 CI 36319639855](https://github.com/photonics-dhl/OpenScience/actions/runs/36319639855) 通过，已部署。真实幂等提交约 10.4 秒，生成私有 v13，7 Claim/27 Evidence 与 49 个非分镜媒体完整继承；公开 v3 不变。额外 Domain 全套 99 项旧夹具/断言失败，不作本次发布通过证据。
- 新 v16 科学方案 `10a5b4bd`、`bb990846` 均被原守卫拒收、无图；44230e80 只给唯一来源量名的重试提示，50/50 定向测试、Worker typecheck、独立 High、[媒体 CI 36324367593](https://github.com/photonics-dhl/OpenScience/actions/runs/36324367593) 通过并发布。新真实任务 `2f935b27` 已沿用原文 `FWHM_T 19 as`，却先有标签引用越界，后两轮在旁白、编码、标签保留无来源裸 `1`，仍无新分镜/图片。随后 5b 在原拒收反馈中定位字段而不改守卫，51/51 定向测试、Worker typecheck、独立 High、CI 和生产发布完成；新真实任务与固定 v4 结果见上及 CURRENT。

## 2026-09-27 — 美术预算修正与第二篇固定公开
- 原 `b4437411` 的艺术字段连同已固定科学描述两次超过 4000 字完整 brief 上限（4333/4165）。Worker 在原 art 请求中给出每幕剩余字数，auto 风格预留内部 marker；不增加模型阶段、门禁或科学截断。混合原图/自动风格索引经独立 High NO-GO 后修复，48/48 定向测试、Worker typecheck、独立 High GO、[媒体 CI 36314197321](https://github.com/photonics-dhl/OpenScience/actions/runs/36314197321) success；干净 `354de481` 应用生产事务完成，公网 `/__release` 精确一致，第二篇 v3 仍 HTTP 200。真实 Hermes 对预算的遵循尚待下一个有实际叙事需求的任务观察，不为验证额外生图。生产/回退精确 SHA 与未完成项见 CURRENT。
- 第二篇最终同源画面方案 `31b5987a`：`96ae6380` 真图 `03e66b71` 的上下 θ 箭头与电子线共线被正式像素审图 blocked，art-only `1d4400f7` 因 science/画法冲突被末审拒绝；首次科学重规划 `b4437411` 因 auto 风格字段/brief 超长结构化失败，固定水彩、缩短输入后 `31b5987a` 科学/美术一致并经独立 High GO。新图 `9def3e16` 真 Chat PNG hash `329ead21…`、5.6 Sol 正式 accepted、原图人工与独立 High GO，已批准。私有 v13 与公开 v2 六维正文相同、许可承接、发布审查 passed/零 hard block，仅选新图发布[第二篇固定 v3](https://openscience.428312321.xyz/research/OSR-2026-000022/v/3)。匿名首页实点 v3 1280×720、六维/7 Claim/27 Evidence、PDF 仍 `workspace_member`；旧 v2 保留。用户最终审美反馈待收。
- `7e7f3eca` 修 Chat 图片菜单可见但短暂 `aria-disabled` 的误点击；定向无费界面演练、语法/文档检查、独立 High 与[媒体 CI 36306819117](https://github.com/photonics-dhl/OpenScience/actions/runs/36306819117)通过，干净 SHA 生产事务/回退 `93ee9e36`/公网 release/同 SHA provider 安装完成，私有旧 provider 已备份。独立 `a8b3ba9e` 真正完成 Chat PNG→产品 draft→5.6 Sol 像素审图 accepted；原始 PNG SHA256 `30e9c9f6…` 人工实看认为仅是稀疏公式横幅，未放行。Hermes 同源重规划 `95b64364` 因无来源裸数字 7 结构化拒收；`6248b43d` 因非等距符号/七标签/无因果箭头被独立 High NO-GO；`242c34fe` 进一步压缩后缺可见时间关系；`96ae6380` 四标签可见 z/θ→t、远场条件/虚拟边界、独立 High GO 已批准，单张真图任务 `03e66b71` 运行中。公开 v2 不变。
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

## 工程索引

- 历史工程验证留在 Git、[能力台账](runbooks/hermes-capability-registry.md)与对应 CI；当前 release/回退、真实图文结果和未结项以 [Hermes CURRENT](handoff/2026-09-10-hermes-web-image-handoff.md) 为准。研发观察台是人工更新快照。

## 其他交付
- 期刊增强已随当前生产线集成并保留线上入口；真实授权刊物试用、版权来源与服务额度的准确状态见 [期刊 CURRENT](handoff/2026-09-15-journal-onboarding-handoff.md)，不以配图任务推断期刊已完成真实试用。
- Fig.2 重复 plan 与 d5087b03 悬空 draft 的处置、Fig.1 原字节展示被否定、旧 6Pro/unknown 任务的禁止重放范围见 Hermes CURRENT；不得批量删除历史资产。
