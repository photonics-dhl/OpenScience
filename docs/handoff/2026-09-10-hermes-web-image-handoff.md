# Hermes / 论文视觉叙事 CURRENT
> 唯一交付树 `E:/Miscellaneous/XGS/.worktrees/onchip-video-release`，`release/onchip-production-line`；根 `main` 只作导航。历史与禁止重放事项见 [09-18 交接](2026-09-18-figure3-image-and-cleanup-handoff.md)。

## 目标与决定
- 未读论文的人应从六维正文和按需设计的单/多图看懂论文贡献、机制和边界；原论文图、生图按叙事作用选，视频尚未开始。学术、编辑、淡彩与手绘/Baoyu 风格资源都不是固定配额或质量证明。用户称赞第三篇 scene0 淡彩图，但尚未认可三篇整体。
- 复用 Hermes 已审 PDF/SourceMap/六维/Claim/Evidence → 科学分镜 → 美术选择 → Chat 网页生图 → Hermes 来源组织和 Chat 网页 5.6 Sol 正式像素审图 → 人工核真实像素 → 指定图片发布固定版本 → 匿名读者页观察。不能重造全文分析器、自动切 provider、重发 unknown；保留原 PDF、已认可图、旧公开和失败收据。用户已授权额度与完成任务；管理员内部补账不改变普通用户及供应商真实配额。
- 代码/Skill 路由改动需定向测试和 CI，真实图文质量需真实任务；避免无关全套测试。发布来源必须为干净、已推送 SHA；文档提交不部署。服务器只用 `infra/scripts/ssh-run.sh`，不读或打印 Secret。

## 当前锚点
- 生产应用 `354de48158be42f66ba3bc8e78f7d36d765d231a` / rollback `7e7f3ecaded867b7817faf8aa6b61724d711ff6f`；交付分支源码提交 `354de481`，其后文档提交的精确 HEAD 以 `git rev-parse HEAD` 为准，不需重部署。[媒体 CI 36314197321](https://github.com/photonics-dhl/OpenScience/actions/runs/36314197321) success；干净已推 SHA 物化、私有日志 `observations/deploy-354de481-20260927.log` 完成 `--no-tests --skip-migrate` 生产事务，公网 `/__release` 精确一致、第二篇公开 v3 HTTP 200、journal 清除。Parser/ScanSci/embedding 与 auth/admin 功能探针按范围跳过，不宣称整站验收。Chat provider 保持 `7e7f3eca`（本次仅应用 Worker 改动），原备份仍在 `observations/provider-upgrade-7e7f3eca-20260927`。
- 上一版 `78d` 正式审图材料性提示经 14 项定向测试、Worker typecheck、独立 High 和 [CI 36158058855](https://github.com/photonics-dhl/OpenScience/actions/runs/36158058855) success。`eae487ce` 修复 release retention 输入上限后，官方保留事务清理精确 122 个非活动旧 release；当时磁盘使用率 47%、余 76 GiB，不能凭旧快照断言实时容量。
- `openscience-chatgpt-browser` 登录态仍可用。2026-09-26 任务 `0317c9c4` 在 `browser_attach` 因单个无响应 Chat 图库标签超时，spool 的 `not-submitted`/`EXECUTION_FAILED` 证明 prompt 未提交；确认无任务归属后只关闭该标签，Playwright 恢复，下一独立任务成功。未重启共享浏览器；上游偶发卡页并未根治。原任务不可再用普通 retry 重发，产品 guard 已阻止。

## 三篇真实论文 / Taskmaster
| 论文 / 任务 | 已见产品事实 | 下一差额 |
|---|---|---|
| 第一篇机制图 / 1、5 | RO `9067a2d5`，六维/6 Claim/58 Evidence；[公开 v3](https://openscience.428312321.xyz/research/OSR-2026-000023/v/3) 原图与 [公开 v4](https://openscience.428312321.xyz/research/OSR-2026-000023/v/4) 均保留，v4 配文只描述布局。新私有 v11 `3c6fc44f` 同源复用 SDF/Claim/Evidence；十标签 `b98c4735`→四标签 `2164dacd`，其图 `21fefb6a` 正式 accepted 但独立 High NO-GO；科学修订 `6c384954` 配文直述近场无独立实验/数值核对，其图 `0fdd4e30` 被修复后正式审图 blocked（近孔楔形尾迹）。art-only `93507dd7` 保持科学字段相同，只收拢纹理并拉开远场；新图 `65ffbfee` hash `54484359…` 正式 5.6 Sol accepted、原始 PNG 人工实看、独立 High GO；只选此图发布 [公开 v5](https://openscience.428312321.xyz/research/OSR-2026-000023/v/5)。匿名首页实点 1280×720 图、六维/6 Claim/58 Evidence 与完整配文，v4 仍 200，PDF `workspace_member`、无匿名下载。 | v5 技术与叙事复核通过，用户最终审美/可理解性反馈仍待收；保留 v11 失败图/收据及旧公开，不自动批量冷启动。 |
| 第二篇编辑图 / 2、5 | RO `c896802c`，7 Claim/27 Evidence；[旧公开 v2](https://openscience.428312321.xyz/research/OSR-2026-000022/v/2) 保留。私有 v13 `fdd7ef10` 同源；早期几何错图、空 n(z)、扇形不一致图均私有保留。7e7f 修桥后 `a8b3ba9e` 真图/5.6 Sol accepted 但人工拒发稀疏公式横幅；Hermes 同源重规划 `95b64364` 结构化拒收裸数字、`6248b43d` 独立 High NO-GO、`242c34fe` 缺可见映射说明，`96ae6380` 四标签/远场模型条件通过 High。其图 `03e66b71` 正式 blocked 上下 θ 箭头与电子线共线；art-only `1d4400f7` 被末审正确阻断科学字段冲突；固定水彩同源科学修订 `31b5987a` 独立 High GO，真图 `9def3e16` hash `329ead21…` 正式 5.6 Sol accepted、原 PNG 实看、独立 High GO，已批准。私有版与 v2 六维正文相同，许可承接、发布审查 passed，只选该图发布[固定 v3](https://openscience.428312321.xyz/research/OSR-2026-000022/v/3)；匿名首页实点，1280×720 图、六维/7 Claim/27 Evidence、旧 v2 200、PDF `workspace_member` 均核对。 | v3 技术与叙事复核通过，用户最终审美/可理解性反馈仍待收；失败图与收据保留。 |
| 第三篇淡彩双幕 / 3、5 | RO `aa450f1e`，[公开 v2](https://openscience.428312321.xyz/research/OSR-2026-000024/v/2) 明确选获用户称赞首图的 approved copy `7eb1b7ee` 与新第二幕 `4e64c389`；后者正式 accepted/人工核图。匿名首页点击、轮播两张 1280×720、六维/5 Claim/30 Evidence 和 PDF 非公开下载均实测，旧 v1 保留。 | 单图称赞不等于整篇科学叙事/审美验收；保留误判 accepted 的旧 “MOED” 私有图，不能自动发布。 |
| 能力与历史 / 4 | 原 science/art/review 现消费配图 Skill v15；真实任务已见三张精确几何错图和同源概念图空 n(z)，说明技能安装/选择不能替代画面叙事与像素判断。未建全文分析器/新模型阶段；数值与原文守卫仍在，模型自修尚未证明。 | 原文疑点定向回读、跨任务经验检索、定量几何核验及 Fig.2 重复 plan/悬空 `d5087b03` copy 仍待按边界处理，见[能力台账](../runbooks/hermes-capability-registry.md)；Fig.1 原字节展示已被否定。 |

## 当前执行与保护
- 配图 Skill v15 和 ffmpeg renderer 前置校验已在 6b09 部署；该发布首次前台 SSH 中断后的锁内恢复、私有旧 journal 与成功重试证据仍在 `observations/recovery-6b09b7ae-20260927` / `deploy-6b09b7ae-retry-20260927.log`。c29 已修审图上传菜单副标题失配：旧 exact 0、新唯一前缀 1，真实 filechooser 属性保持；独立 High/CI/安装后，原 PNG 只审图任务 `7655f64e` 完成并保留相同 hash `6dd2c570…`，未重发生成。5.6 Sol 只拦标点、放过空白 n(z)，故以人工叙事判断拒发；正式 accepted/blocked 不等于用户质量认可。
- 93ee 修复菜单水合恢复已选模式；7e7f 再修 `Create image` span 可见但祖先短暂 `aria-disabled=true` 的误点击，保留当前 form 已选模式/空 prompt/owned page/提交前复核/一次重载。真实禁用→启用、无费选择、语法/独立 High 与 CI 通过；正式独立图 `a8b3ba9e` 已证明 Chat 提交、原 PNG、产品 draft 和 5.6 Sol 审图连续成功。形式审图 accepted 仍漏掉图像叙事薄弱，人审拒发。第二篇重新在原 Skill/Claim/Evidence 上编码故事，未叠新全文分析器或自动 provider fallback。
- `b4437411` 艺术阶段在科学内容已固定后两次输出 4333/4165 字，超过原 4000 字整份 brief 上限。354d 仅在原 art 请求给每幕传剩余美术字数（按 `describeIllustrationBrief` 计算，auto 风格预留 marker），原科学字段与最终验证不变；混合 paper-original/自动风格索引经独立 High 指出并修复，48/48 定向测试、Worker typecheck、独立 High GO、媒体 CI 和生产发布通过。真实 Hermes 遵守预算的效果尚未由新任务观察；不为填证据重复生成已公开图。技能 v15 的安装、注入与图像质量仍分开判断。
- 第一篇 v4 返工历史：`974b3a0d` 真图和 `c203c68e` 真图均正式 blocked，分别有短竖连接和双签同轴带来的误读；`0317c9c4` 零提交技术失败保留，独立 `7f497502` 真图才获 accepted。旧 `31c/3f1/cb4/1cd/7d9/a38` 错图与收据继续私有，不删除。
- v11 历史媒体 copy 的来源/字节/Claim/Evidence 验证可保留批准状态，但**不会把新分镜叙述绑定到旧图**；不能用旧图片 copy 或手改公开页面伪装新叙事。新公开需本版新分镜、新图、正式审图、人工实看、现有发布审查及匿名页核验；公开内容修改用新公开版本或明确勘误。
- [研发观察台](../proposals/2026-09-23-hermes-development-live.html) 的 ignored `tmp/hermes-development-live-feed.js` 是人工更新快照，非自动遥测。交付树和根 main 每轮结束 `git status --porcelain` 为空，提交推送，`git worktree prune/list`；新图、日志和脚本留 ignored `tmp/`，不入库。
