# Hermes / 论文视觉叙事 CURRENT
> 唯一交付树 `E:/Miscellaneous/XGS/.worktrees/onchip-video-release`，`release/onchip-production-line`；根 `main` 只作导航。历史与禁止重放事项见 [09-18 交接](2026-09-18-figure3-image-and-cleanup-handoff.md)。

## 目标与决定
- 未读论文的人应从六维正文和按需设计的单/多图看懂论文贡献、机制和边界；原论文图、生图按叙事作用选，视频尚未开始。学术、编辑、淡彩与手绘/Baoyu 风格资源都不是固定配额或质量证明。用户称赞第三篇 scene0 淡彩图，但尚未认可三篇整体。
- 复用 Hermes 已审 PDF/SourceMap/六维/Claim/Evidence → 科学分镜 → 美术选择 → Chat 网页生图 → Hermes 来源组织和 Chat 网页 5.6 Sol 正式像素审图 → 人工核真实像素 → 指定图片发布固定版本 → 匿名读者页观察。不能重造全文分析器、自动切 provider、重发 unknown；保留原 PDF、已认可图、旧公开和失败收据。用户已授权额度与完成任务；管理员内部补账不改变普通用户及供应商真实配额。
- 代码/Skill 路由改动需定向测试和 CI，真实图文质量需真实任务；避免无关全套测试。发布来源必须为干净、已推送 SHA；文档提交不部署。服务器只用 `infra/scripts/ssh-run.sh`，不读或打印 Secret。

## 当前锚点
- 生产/交付 HEAD `93ee9e36fb855d0b37bb838f65ebe7e807b687d9` / rollback `c29e830519fa63f4a8cb014b98454cee5c7a0bdf`；[媒体 CI 36303474662](https://github.com/photonics-dhl/OpenScience/actions/runs/36303474662) success，干净 SHA 物化、私有日志完成 `--no-tests --skip-migrate` 生产事务，公网 release 精确核对、journal 清除。Chat provider 同 SHA 安装，旧 provider 私有备份在 `observations/provider-upgrade-93ee9e36-20260927`。Parser/ScanSci/embedding 功能探针按范围跳过，不宣称整站验收。
- 上一版 `78d` 正式审图材料性提示经 14 项定向测试、Worker typecheck、独立 High 和 [CI 36158058855](https://github.com/photonics-dhl/OpenScience/actions/runs/36158058855) success。`eae487ce` 修复 release retention 输入上限后，官方保留事务清理精确 122 个非活动旧 release；当时磁盘使用率 47%、余 76 GiB，不能凭旧快照断言实时容量。
- `openscience-chatgpt-browser` 登录态仍可用。2026-09-26 任务 `0317c9c4` 在 `browser_attach` 因单个无响应 Chat 图库标签超时，spool 的 `not-submitted`/`EXECUTION_FAILED` 证明 prompt 未提交；确认无任务归属后只关闭该标签，Playwright 恢复，下一独立任务成功。未重启共享浏览器；上游偶发卡页并未根治。原任务不可再用普通 retry 重发，产品 guard 已阻止。

## 三篇真实论文 / Taskmaster
| 论文 / 任务 | 已见产品事实 | 下一差额 |
|---|---|---|
| 第一篇机制图 / 1、5 | RO `9067a2d5`，六维/6 Claim/58 Evidence；[公开 v3](https://openscience.428312321.xyz/research/OSR-2026-000023/v/3) 原图与 [公开 v4](https://openscience.428312321.xyz/research/OSR-2026-000023/v/4) 均保留，v4 配文只描述布局。新私有 v11 `3c6fc44f` 同源复用 SDF/Claim/Evidence；十标签 `b98c4735`→四标签 `2164dacd`，其图 `21fefb6a` 正式 accepted 但独立 High NO-GO；科学修订 `6c384954` 配文直述近场无独立实验/数值核对，其图 `0fdd4e30` 被修复后正式审图 blocked（近孔楔形尾迹）。art-only `93507dd7` 保持科学字段相同，只收拢纹理并拉开远场；新图 `65ffbfee` hash `54484359…` 正式 5.6 Sol accepted、原始 PNG 人工实看、独立 High GO；只选此图发布 [公开 v5](https://openscience.428312321.xyz/research/OSR-2026-000023/v/5)。匿名首页实点 1280×720 图、六维/6 Claim/58 Evidence 与完整配文，v4 仍 200，PDF `workspace_member`、无匿名下载。 | v5 技术与叙事复核通过，用户最终审美/可理解性反馈仍待收；保留 v11 失败图/收据及旧公开，不自动批量冷启动。 |
| 第二篇编辑图 / 2、5 | RO `c896802c`，7 Claim/27 Evidence；[公开 v2](https://openscience.428312321.xyz/research/OSR-2026-000022/v/2) 不变。私有 v13 `fdd7ef10` 同源；三张几何错图 `1bf46ec9`/`51e95ec3`/`25117b5d` 正式 blocked。`22178361` 原 PNG 的 review-only `7655f64e` 正式 blocked（标点），人工拒发空 n(z)。Hermes 同源科学画面方案 `206df294` 经独立 High 修正积分测度/计数/楔形与近直轨迹，art-only `c108c45f` 保持科学字段全等并批准；图 `3be6a359` 经桥真实提交、PNG/审图成功运行，但正式 blocked：扇形散射符号不一致，人工看原图也认为画面偏稀疏。art-only `a9440918` 因色带覆盖整条电子线被 High NO-GO；再修 `fa846164` 保持科学字段全等、有限带/同模板排布、已批准。其图任务 `813202a9` 在图片模式确认前精确 not-submitted。 | 修菜单短暂禁用时的误点击，独立重发 `fa846164` 真图；像素审图、人工核图通过后才发布固定版/匿名实点。坏图与全部收据保留。 |
| 第三篇淡彩双幕 / 3、5 | RO `aa450f1e`，[公开 v2](https://openscience.428312321.xyz/research/OSR-2026-000024/v/2) 明确选获用户称赞首图的 approved copy `7eb1b7ee` 与新第二幕 `4e64c389`；后者正式 accepted/人工核图。匿名首页点击、轮播两张 1280×720、六维/5 Claim/30 Evidence 和 PDF 非公开下载均实测，旧 v1 保留。 | 单图称赞不等于整篇科学叙事/审美验收；保留误判 accepted 的旧 “MOED” 私有图，不能自动发布。 |
| 能力与历史 / 4 | 原 science/art/review 现消费配图 Skill v15；真实任务已见三张精确几何错图和同源概念图空 n(z)，说明技能安装/选择不能替代画面叙事与像素判断。未建全文分析器/新模型阶段；数值与原文守卫仍在，模型自修尚未证明。 | 原文疑点定向回读、跨任务经验检索、定量几何核验及 Fig.2 重复 plan/悬空 `d5087b03` copy 仍待按边界处理，见[能力台账](../runbooks/hermes-capability-registry.md)；Fig.1 原字节展示已被否定。 |

## 当前执行与保护
- 配图 Skill v15 和 ffmpeg renderer 前置校验已在 6b09 部署；该发布首次前台 SSH 中断后的锁内恢复、私有旧 journal 与成功重试证据仍在 `observations/recovery-6b09b7ae-20260927` / `deploy-6b09b7ae-retry-20260927.log`。c29 已修审图上传菜单副标题失配：旧 exact 0、新唯一前缀 1，真实 filechooser 属性保持；独立 High/CI/安装后，原 PNG 只审图任务 `7655f64e` 完成并保留相同 hash `6dd2c570…`，未重发生成。5.6 Sol 只拦标点、放过空白 n(z)，故以人工叙事判断拒发；正式 accepted/blocked 不等于用户质量认可。
- 93ee 的 runner 修复了菜单水合恢复已选模式导致的 `f2f123a9` 假失败；真实 `3be6a359` 经 Chat 出图、保存并由 5.6 Sol 正式 blocked，证明该分支可完整运行。后续 `813202a9` 又在 `image_mode_confirm` 精确未提交；空白页复现 `Create image` span 可见但祖先短暂 `aria-disabled=true`，约 5 秒后才启用；Playwright 对该 span 的 `isEnabled()` 仍返回 true。当前候选在唯一选项可见之外显式检查禁用祖先、等待可用后点击，保留当前 form 已选模式/空 prompt/owned page/提交前复核/一次重载；真实禁用→启用观测、无费选择演练、语法/独立 High GO，待 CI/安装/新任务。
- 第一篇 v4 返工历史：`974b3a0d` 真图和 `c203c68e` 真图均正式 blocked，分别有短竖连接和双签同轴带来的误读；`0317c9c4` 零提交技术失败保留，独立 `7f497502` 真图才获 accepted。旧 `31c/3f1/cb4/1cd/7d9/a38` 错图与收据继续私有，不删除。
- v11 历史媒体 copy 的来源/字节/Claim/Evidence 验证可保留批准状态，但**不会把新分镜叙述绑定到旧图**；不能用旧图片 copy 或手改公开页面伪装新叙事。新公开需本版新分镜、新图、正式审图、人工实看、现有发布审查及匿名页核验；公开内容修改用新公开版本或明确勘误。
- [研发观察台](../proposals/2026-09-23-hermes-development-live.html) 的 ignored `tmp/hermes-development-live-feed.js` 是人工更新快照，非自动遥测。交付树和根 main 每轮结束 `git status --porcelain` 为空，提交推送，`git worktree prune/list`；新图、日志和脚本留 ignored `tmp/`，不入库。
