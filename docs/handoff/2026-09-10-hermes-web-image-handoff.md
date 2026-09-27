# Hermes / 论文视觉叙事 CURRENT
> 唯一交付树 `E:/Miscellaneous/XGS/.worktrees/onchip-video-release`，`release/onchip-production-line`；根 `main` 只作导航。历史与禁止重放事项见 [09-18 交接](2026-09-18-figure3-image-and-cleanup-handoff.md)。

## 目标与决定
- 未读论文的人应从六维正文和按需设计的单/多图看懂论文贡献、机制和边界；原论文图、生图按叙事作用选，视频尚未开始。学术、编辑、淡彩与手绘/Baoyu 风格资源都不是固定配额或质量证明。用户称赞第三篇 scene0 淡彩图，但尚未认可三篇整体。
- 复用 Hermes 已审 PDF/SourceMap/六维/Claim/Evidence → 科学分镜 → 美术选择 → Chat 网页生图 → Hermes 来源组织和 Chat 网页 5.6 Sol 正式像素审图 → 人工核真实像素 → 指定图片发布固定版本 → 匿名读者页观察。不能重造全文分析器、自动切 provider、重发 unknown；保留原 PDF、已认可图、旧公开和失败收据。用户已授权额度与完成任务；管理员内部补账不改变普通用户及供应商真实配额。
- 代码/Skill 路由改动需定向测试和 CI，真实图文质量需真实任务；避免无关全套测试。发布来源必须为干净、已推送 SHA；文档提交不部署。服务器只用 `infra/scripts/ssh-run.sh`，不读或打印 Secret。

## 当前锚点
- 生产/交付 HEAD `6b09b7aee49d042ab3b26663cb5fe1a67e32aee6` / rollback `8337ab474f5b59f8a8b013587aa35574486ec8fd`；[媒体 CI 36295221466](https://github.com/photonics-dhl/OpenScience/actions/runs/36295221466) success，`--no-tests --skip-migrate` 服务器构建/部署完成，公网 `/__release` 精确一致。首次前台 SSH 断线留下 switching journal 和候选 embedding 容器；锁内按旧身份恢复、私有保存原 journal、官方 clear 后以私有日志重试成功。Parser/ScanSci/embedding 功能探针按范围跳过，未宣称整站验收。Chat provider 同 SHA 安装，renderer 隔离 ffmpeg 校验通过，image/review timers active；旧 provider 私有备份保留。
- 上一版 `78d` 正式审图材料性提示经 14 项定向测试、Worker typecheck、独立 High 和 [CI 36158058855](https://github.com/photonics-dhl/OpenScience/actions/runs/36158058855) success。`eae487ce` 修复 release retention 输入上限后，官方保留事务清理精确 122 个非活动旧 release；当时磁盘使用率 47%、余 76 GiB，不能凭旧快照断言实时容量。
- `openscience-chatgpt-browser` 登录态仍可用。2026-09-26 任务 `0317c9c4` 在 `browser_attach` 因单个无响应 Chat 图库标签超时，spool 的 `not-submitted`/`EXECUTION_FAILED` 证明 prompt 未提交；确认无任务归属后只关闭该标签，Playwright 恢复，下一独立任务成功。未重启共享浏览器；上游偶发卡页并未根治。原任务不可再用普通 retry 重发，产品 guard 已阻止。

## 三篇真实论文 / Taskmaster
| 论文 / 任务 | 已见产品事实 | 下一差额 |
|---|---|---|
| 第一篇机制图 / 1、5 | RO `9067a2d5`，六维/6 Claim/58 Evidence；[公开 v3](https://openscience.428312321.xyz/research/OSR-2026-000023/v/3) 原图与 [公开 v4](https://openscience.428312321.xyz/research/OSR-2026-000023/v/4) 均保留，v4 配文只描述布局。新私有 v11 `3c6fc44f` 同源复用 SDF/Claim/Evidence；十标签 `b98c4735`→四标签 `2164dacd`，其图 `21fefb6a` 正式 accepted 但独立 High NO-GO；科学修订 `6c384954` 配文直述近场无独立实验/数值核对，其图 `0fdd4e30` 被修复后正式审图 blocked（近孔楔形尾迹）。art-only `93507dd7` 保持科学字段相同，只收拢纹理并拉开远场；新图 `65ffbfee` hash `54484359…` 正式 5.6 Sol accepted、原始 PNG 人工实看、独立 High GO；只选此图发布 [公开 v5](https://openscience.428312321.xyz/research/OSR-2026-000023/v/5)。匿名首页实点 1280×720 图、六维/6 Claim/58 Evidence 与完整配文，v4 仍 200，PDF `workspace_member`、无匿名下载。 | v5 技术与叙事复核通过，用户最终审美/可理解性反馈仍待收；保留 v11 失败图/收据及旧公开，不自动批量冷启动。 |
| 第二篇编辑图 / 2、5 | RO `c896802c`，7 Claim/27 Evidence；[公开 v2](https://openscience.428312321.xyz/research/OSR-2026-000022/v/2) 原图偏设备说明。私有 v13 `fdd7ef10` 同源；真图 `1bf46ec9`、`51e95ec3`、`25117b5d` 连续正式 blocked，实看均有狭缝/路径/带的错位。Hermes 同源科学画面编码修正版 `ff11bbcf` 正式 accepted、独立 High GO、已批准。`69f08f5f` 因图片模式未确认而确定未提交；新版桥在新任务 `22178361` 真实提交 Chat、下载/规范化并保存原 PNG 与 draft hash `6dd2c570…`，但其 5.6 Sol 审图在附件选择前 `ATTACHMENT_INPUT_NOT_READY`、精确 not-submitted，任务 failed。人工实看：新图 n(z) 只剩空括号，未传达空间分布，不宜发布。 | 修审图附件菜单兼容并走现有“已保存 PNG 仅审图”入口取得正式收据；图形缺失需按科学叙事目标再修，获通过后才指定选图/发布固定版/匿名实点。公开 v2、旧图与收据保留。 |
| 第三篇淡彩双幕 / 3、5 | RO `aa450f1e`，[公开 v2](https://openscience.428312321.xyz/research/OSR-2026-000024/v/2) 明确选获用户称赞首图的 approved copy `7eb1b7ee` 与新第二幕 `4e64c389`；后者正式 accepted/人工核图。匿名首页点击、轮播两张 1280×720、六维/5 Claim/30 Evidence 和 PDF 非公开下载均实测，旧 v1 保留。 | 单图称赞不等于整篇科学叙事/审美验收；保留误判 accepted 的旧 “MOED” 私有图，不能自动发布。 |
| 能力与历史 / 4 | 原 science/art/review 现消费配图 Skill v15；真实任务已见三张精确几何错图和同源概念图空 n(z)，说明技能安装/选择不能替代画面叙事与像素判断。未建全文分析器/新模型阶段；数值与原文守卫仍在，模型自修尚未证明。 | 原文疑点定向回读、跨任务经验检索、定量几何核验及 Fig.2 重复 plan/悬空 `d5087b03` copy 仍待按边界处理，见[能力台账](../runbooks/hermes-capability-registry.md)；Fig.1 原字节展示已被否定。 |

## 当前执行与保护
- `73453c42` 的 renderer 前置校验/配图 Skill v15 已包含于 6b09 并部署；Skill 不增模型阶段。runner 模式修复经空白页无费“选模式→重载→重选”演练：两次唯一标记、空 prompt、发送禁用；`node --check`、独立 High GO、CI success，`22178361` 真任务已证实提交/PNG/规范化/导入。发布中断恢复证据在服务器私有 `observations/recovery-6b09b7ae-20260927`，重试日志在私有 `observations/deploy-6b09b7ae-retry-20260927.log`；旧 provider 备份在私有 `observations/provider-upgrade-6b09b7ae-20260927`。
- 审图故障取证：`22178361` 的 review-spool result 为 EXECUTION_FAILED，同 promptHash 的 not-submitted、无提交；job 两次 `attachments/ATTACHMENT_INPUT_NOT_READY`。空白 Chat 菜单按钮可见文案现为 `Add photos & files`＋`Upload from computer`，旧 exact 名称匹配 0，前缀匹配唯一 1，点后 filechooser 仍为 `Attach files` 且 accept=null。`review-runner.cjs` 候选仅放宽唯一上传按钮名称匹配，`node --check`、独立 High GO，待 CI/安装和已保存 PNG 的正式审图；不重生成这张图。
- 第一篇 v4 返工历史：`974b3a0d` 真图和 `c203c68e` 真图均正式 blocked，分别有短竖连接和双签同轴带来的误读；`0317c9c4` 零提交技术失败保留，独立 `7f497502` 真图才获 accepted。旧 `31c/3f1/cb4/1cd/7d9/a38` 错图与收据继续私有，不删除。
- v11 历史媒体 copy 的来源/字节/Claim/Evidence 验证可保留批准状态，但**不会把新分镜叙述绑定到旧图**；不能用旧图片 copy 或手改公开页面伪装新叙事。新公开需本版新分镜、新图、正式审图、人工实看、现有发布审查及匿名页核验；公开内容修改用新公开版本或明确勘误。
- [研发观察台](../proposals/2026-09-23-hermes-development-live.html) 的 ignored `tmp/hermes-development-live-feed.js` 是人工更新快照，非自动遥测。交付树和根 main 每轮结束 `git status --porcelain` 为空，提交推送，`git worktree prune/list`；新图、日志和脚本留 ignored `tmp/`，不入库。
