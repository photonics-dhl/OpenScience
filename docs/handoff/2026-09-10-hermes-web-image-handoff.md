# Hermes / 论文视觉叙事 CURRENT
> 唯一交付树 `E:/Miscellaneous/XGS/.worktrees/onchip-video-release`，`release/onchip-production-line`；根 `main` 只作导航。历史与禁止重放事项见 [09-18 交接](2026-09-18-figure3-image-and-cleanup-handoff.md)。

## 目标与决定
- 未读论文的人应从六维正文和按需设计的单/多图看懂论文贡献、机制和边界；原论文图、生图按叙事作用选，视频尚未开始。学术、编辑、淡彩与手绘/Baoyu 风格资源都不是固定配额或质量证明。用户称赞第三篇 scene0 淡彩图，但尚未认可三篇整体。
- 复用 Hermes 已审 PDF/SourceMap/六维/Claim/Evidence → 科学分镜 → 美术选择 → Chat 网页生图 → Hermes 来源组织和 Chat 网页 5.6 Sol 正式像素审图 → 人工核真实像素 → 指定图片发布固定版本 → 匿名读者页观察。不能重造全文分析器、自动切 provider、重发 unknown；保留原 PDF、已认可图、旧公开和失败收据。用户已授权额度与完成任务；管理员内部补账不改变普通用户及供应商真实配额。
- 代码/Skill 路由改动需定向测试和 CI，真实图文质量需真实任务；避免无关全套测试。发布来源必须为干净、已推送 SHA；文档提交不部署。服务器只用 `infra/scripts/ssh-run.sh`，不读或打印 Secret。

## 当前锚点
- 生产/交付 HEAD `8337ab474f5b59f8a8b013587aa35574486ec8fd` / rollback `ffb5363d02df610843d9ea24c2066c0cd59dd354`；可见 profile 选择及中文标签索引修复经 46/46、Worker typecheck、runner 语法/真实 DOM、独立 High GO、[CI 36290324334](https://github.com/photonics-dhl/OpenScience/actions/runs/36290324334) success；定向部署 exit0、公网 `/__release` 精确一致。a737 起沿既有 Gateway 拒收回调写私有数值字段/来源摘要；原配图 skill v14、多幕 auto wrapper、正式像素审图沿用，不宣称全链验收。
- 上一版 `78d` 正式审图材料性提示经 14 项定向测试、Worker typecheck、独立 High 和 [CI 36158058855](https://github.com/photonics-dhl/OpenScience/actions/runs/36158058855) success。`eae487ce` 修复 release retention 输入上限后，官方保留事务清理精确 122 个非活动旧 release；当时磁盘使用率 47%、余 76 GiB，不能凭旧快照断言实时容量。
- `openscience-chatgpt-browser` 登录态仍可用。2026-09-26 任务 `0317c9c4` 在 `browser_attach` 因单个无响应 Chat 图库标签超时，spool 的 `not-submitted`/`EXECUTION_FAILED` 证明 prompt 未提交；确认无任务归属后只关闭该标签，Playwright 恢复，下一独立任务成功。未重启共享浏览器；上游偶发卡页并未根治。原任务不可再用普通 retry 重发，产品 guard 已阻止。

## 三篇真实论文 / Taskmaster
| 论文 / 任务 | 已见产品事实 | 下一差额 |
|---|---|---|
| 第一篇机制图 / 1、5 | RO `9067a2d5`，六维/6 Claim/58 Evidence；[公开 v3](https://openscience.428312321.xyz/research/OSR-2026-000023/v/3) 原图与 [公开 v4](https://openscience.428312321.xyz/research/OSR-2026-000023/v/4) 均保留，v4 配文只描述布局。新私有 v11 `3c6fc44f` 同源复用 SDF/Claim/Evidence；十标签 `b98c4735`→四标签 `2164dacd`，其图 `21fefb6a` 正式 accepted 但独立 High NO-GO；科学修订 `6c384954` 配文直述近场无独立实验/数值核对，其图 `0fdd4e30` 被修复后正式审图 blocked（近孔楔形尾迹）。art-only `93507dd7` 保持科学字段相同，只收拢纹理并拉开远场；新图 `65ffbfee` hash `54484359…` 正式 5.6 Sol accepted、原始 PNG 人工实看、独立 High GO；只选此图发布 [公开 v5](https://openscience.428312321.xyz/research/OSR-2026-000023/v/5)。匿名首页实点 1280×720 图、六维/6 Claim/58 Evidence 与完整配文，v4 仍 200，PDF `workspace_member`、无匿名下载。 | v5 技术与叙事复核通过，用户最终审美/可理解性反馈仍待收；保留 v11 失败图/收据及旧公开，不自动批量冷启动。 |
| 第二篇编辑图 / 2、5 | RO `c896802c`，7 Claim/27 Evidence；正式 approved 图 `6233e663` 仍在 [公开 v2](https://openscience.428312321.xyz/research/OSR-2026-000022/v/2)，偏设备说明，未一眼讲清“空间局域→短时间脉冲”。同源私有 v13 `fdd7ef10`；科学方案 `3d2115fe` accepted/High GO。真图 `1bf46ec9`、`51e95ec3`、`25117b5d` 均经正式像素审图 blocked，人工实看：离孔带/蓝点、带起点过远/电子线断裂、电子线穿过实体/带低于路径。仅调美术已证实不足。Hermes 改科学画面编码：首稿 `aad8f462` 正式 accepted 但独立 High NO-GO；修正版 `ff11bbcf` 同 Claim/证据、机制/β/虚拟 19 as 边界齐全，正式 accepted/独立 High GO/已批准。其出图任务 `69f08f5f` 在 `image_mode_confirm` 失败，spool 有精确 not-submitted 证明、无 prompt/PNG。 | 修复 Chat 模式确认后从已批准方案重新出图；通过正式像素审图、人工核图、发布审查才指定选图发布新固定版并匿名实点。公开 v2、旧图及失败收据保留。 |
| 第三篇淡彩双幕 / 3、5 | RO `aa450f1e`，[公开 v2](https://openscience.428312321.xyz/research/OSR-2026-000024/v/2) 明确选获用户称赞首图的 approved copy `7eb1b7ee` 与新第二幕 `4e64c389`；后者正式 accepted/人工核图。匿名首页点击、轮播两张 1280×720、六维/5 Claim/30 Evidence 和 PDF 非公开下载均实测，旧 v1 保留。 | 单图称赞不等于整篇科学叙事/审美验收；保留误判 accepted 的旧 “MOED” 私有图，不能自动发布。 |
| 能力与历史 / 4 | 生产 ac79 的原 science/art/review 消费配图 skill v14；第一篇真图验证正式审图空间语义修复。第二篇 v14/多幕 wrapper 已能保存两幕，但原末审漏检“结果数值未绑 subject 原文”；数值守卫现能拒收，尚未让 M3 自修。未建新模型或分析阶段。 | 原文疑点定向回读、跨任务经验检索、定量几何核验尚未完成，见[能力台账](../runbooks/hermes-capability-registry.md)。Fig.2 重复 plan 与悬空 `d5087b03` copy 未清理，先按原只读影响面与授权边界处理；Fig.1 原字节展示已被否定。 |

## 当前执行与保护
- 生产仍 `8337ab47`/回退 `ffb5363d`；候选 `73453c42` 已推送：安装器在变更前执行隔离 ffmpeg 校验，正确/误配镜像退出码 0/127，独立 High GO、[CI 36292745105](https://github.com/photonics-dhl/OpenScience/actions/runs/36292745105) success；原自有配图 Skill v15 增加同一连通关系反复审图失败时回到科学画面编码，不增模型阶段，6/6 定向测试、Worker typecheck、独立 High GO、[CI 36294020004](https://github.com/photonics-dhl/OpenScience/actions/runs/36294020004) success。二者尚未安装/部署。`1bf46ec9` 的原 PNG 只复用规范化并导入，无重发 Chat，正式 blocked；备份/收据保留。
- `69f08f5f` 请求 15,081 JSON bytes <16 KiB；服务 job 的 `operator-error.json` 为 `image_mode_confirm/IMAGE_MODE_NOT_READY`，result `EXECUTION_FAILED` 与相同 promptHash 的 `not-submitted.json`，无 submitted/conversation/result PNG。无 Chat 消耗；当前浏览器空白页实际选中模式显示同表单唯一 `Remove Create image` 按钮，旧原生 pill 缺席。候选 runner 增唯一按钮识别与提交前同页限一次 reload/重选，`node --check`、独立 High GO；尚待不付费演练、CI、部署与同方案真图验证。不能把代码检查称为链路成功。
- 第一篇 v4 返工历史：`974b3a0d` 真图和 `c203c68e` 真图均正式 blocked，分别有短竖连接和双签同轴带来的误读；`0317c9c4` 零提交技术失败保留，独立 `7f497502` 真图才获 accepted。旧 `31c/3f1/cb4/1cd/7d9/a38` 错图与收据继续私有，不删除。
- v11 历史媒体 copy 的来源/字节/Claim/Evidence 验证可保留批准状态，但**不会把新分镜叙述绑定到旧图**；不能用旧图片 copy 或手改公开页面伪装新叙事。新公开需本版新分镜、新图、正式审图、人工实看、现有发布审查及匿名页核验；公开内容修改用新公开版本或明确勘误。
- [研发观察台](../proposals/2026-09-23-hermes-development-live.html) 的 ignored `tmp/hermes-development-live-feed.js` 是人工更新快照，非自动遥测。交付树和根 main 每轮结束 `git status --porcelain` 为空，提交推送，`git worktree prune/list`；新图、日志和脚本留 ignored `tmp/`，不入库。
