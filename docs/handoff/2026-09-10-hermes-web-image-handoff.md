# Hermes / 论文视觉叙事 CURRENT
> 唯一交付树 E:/Miscellaneous/XGS/.worktrees/onchip-video-release，branch release/onchip-production-line；根 main 只作导航。旧交接与失败收据见 [09-18 历史记录](2026-09-18-figure3-image-and-cleanup-handoff.md)，不得按旧 next action 重放。

## 目标与用户决定
- 需求基线 §18.2 与 [视觉叙事方案](../proposals/2026-09-21-visual-narrative-review.html)：未读论文者应从六维内容和按需设计的图看懂核心思想、机制与关键点；原论文图不是默认成品，视频尚未开始。
- 三篇真实论文走 PDF → Hermes 全文/SourceMap/六维/Claim/Evidence → 科学分镜与艺术设计 → Chat 生图 → Hermes 技能组织证据 + Chat 网页 5.6 Sol 正式像素审图 → 读者页与固定公开版本。不重造全文分析器，不以 accepted、发布或本页状态代替用户最终质量认可。
- 用户已授权完成任务和内部额度；2026-09-24 明确管理员不应被内部 AI Credit 挡住。保留逐任务审计、普通用户额度和 Chat 账号/供应商真实配额；不自动切 provider，不重发 unknown。必要定向测试/CI 应做，避免重复全套测试。

## Git、部署与当前边界
- 当前应用生产/rollback：d463122cb5b66e8f494229ca9a895c91575fdf37 / 14089584c10bf9781db466b288d77c2f1daccfd8；canonical branch release/onchip-production-line，本页后续文档提交使 HEAD 比生产多文档，不需再次部署。精确 HEAD 由 git rev-parse HEAD 读取。[定向 CI 35902058149](https://github.com/photonics-dhl/OpenScience/actions/runs/35902058149) success、失败步骤 0；无迁移部署 exit0，服务器 .release-id 与公网 /__release 精确匹配。三篇公开链接各 200，第三篇匿名页读到两图/六维/受限 PDF；Parser、ScanSci、embedding 和 auth/admin 的无关功能探针按 --no-tests 跳过，不冒称通过。
- 服务器操作只经 infra/scripts/ssh-run.sh；不读/打印 Secret。新功能必要定向测试/CI 和真实产品路径要跑，旧全套用例不能冒充门禁。交付树及根 main 收尾 status --porcelain 为空，提交推送并 worktree prune/list；文档提交不部署。
- 浏览器桥复用 openscience-chatgpt-browser 的已登录网页/CDP；2026-09-24 曾在 22 页、约 6.49/8 GiB 时 CDP 无响应，核对无活动任务后仅重启该浏览器容器，登录与页面恢复。此为一次有证据恢复，未证明上游内存根因已修；不要无证重启或盲重发。旧 CODEX_SOL_IMAGE_REVIEW_ENABLED=false，正式像素判断走 Chat 网页 5.6 Sol，非 Codex CLI 登录。

## 三篇实际交付
| 论文 / Taskmaster | 产品结果与下一差额 |
|---|---|
| 第一篇学术图 / 1、5 | RO 9067a2d5，6 维/6 Claim/58 Evidence；方案 5226fcf5，正式 6Pro accepted 图 8bbcfd9b（hash 778815c8…）；[公开 OSR-2026-000023/v/3](https://openscience.428312321.xyz/research/OSR-2026-000023/v/3)。旧 v1/v2、PDF、已认可图保留；用户最终叙事/审美认可待反馈。 |
| 第二篇编辑图 / 2、5 | RO c896802c，7 Claim/27 Evidence；批准方案 9a1b1a31，原图 cebcef87 仍 draft；5.6 Sol 正式 review-only 副本 6233e663，hash bbfaf594…，已 approved 并只选此图；[公开 OSR-2026-000022/v/2](https://openscience.428312321.xyz/research/OSR-2026-000022/v/2)，匿名实见图与六维，旧 v1 保留。学术/淡彩候选的标尺/多余因果错误仍 NO-GO，不混入公开；用户最终反馈待收。 |
| 第三篇淡彩双幕 / 3、5 | RO aa450f1e，Version 9373f1e6，5 Claim/30 Evidence；批准同父分镜 c54dc291。scene0 生成 9a2a47ef 原任务审图未提交失败，凭 spool not_submitted 原 PNG 恢复为正式 5.6 Sol accepted 副本 e550137f（hash d64ea84b…），仅副本 approved。scene1 新任务 6f80639f（hash fd0d529c…）正式 accepted、已实看 “MQED”/公式并 approved；[公开 OSR-2026-000024/v/1](https://openscience.428312321.xyz/research/OSR-2026-000024/v/1)。匿名 200、六维/5 Claim/30 Evidence、两图轮播各 1280×720、PDF workspace_member 且无公开下载；用户最终反馈待收。 |
| 管理/学习 / 4 | 新图恢复门与审阅收据已接原产品任务；Hermes 科学/表现技能有实际按阶段消费，但按疑点回读全文与跨任务经验检索仍未完成。只读 [研发观察台](../proposals/2026-09-23-hermes-development-live.html) 的 ignored tmp/feed 为人工检查点，非自动遥测。 |
| Fig.3 / reuse 历史 | 9f7 恢复图获用户认可；Fig.1 原字节展示已被否定，不能冒称叙事完成。Fig.2 的 d5087b03 悬空 copy、重复 draft/approved 影响与处置仍须保留原件并按用户先前要求处理，不批量删除他人资产。 |

## 新恢复与质量证据
- 14089584 增加手工 PNG 在正式审图前明确失败且 spool 证明 not_submitted 时的同图 review-only 恢复；Domain 与 worker 复验原 hash、父分镜、prompt、管理员及来源，原失败任务与旧图不删除。定向 Domain/Worker 测试、类型检查、独立 High GO；上述第三篇 scene0 为真实恢复并 approved。
- 旧同父 scene1 68215708 及其 review-only copy ebf597b6 保持私有 draft：图上 “MOED” 错字虽被正式模型误判 accepted，人工实看拦下。新 scene1 已改正并真实审图。Prompt 加逐字缩写/公式检查仍不能保证模型不误判；任何公开前须保留实际像素核对。
- 第二篇三风格实际检验：编辑图通过正式审图并公开；学术和淡彩 v1/v2 的 20 nm 标尺偏心、77→777 nm 或额外因果箭头等候选保持私有 NO-GO。提示词不能代替确定性定量绘制/像素审阅。
- 2026-09-24 管理员内部额度已部署：Domain agent 提交与 ingestion 付费恢复在 Serializable 事务内读当前 platform_admin，为每个原 -1 消费追加幂等 +1 adjust，余额净不减，原扣减/恢复收据与操作审计仍在；非管理员零额度继续拒绝。定向两例、Domain typecheck、独立 High GO 及 CI 35902058149 通过；扩展跑旧 agent+ingestion 文件 90 pass/18 fail（旧确认/重试夹具与条件），不声称全套通过。本次无生产零余额新任务，不把代码/CI 证据冒充该场景实际运行；后续正常管理员任务核对真实账本。

## 保留与下一动作
- 保护原 PDF、已公开旧版本、用户认可图、失败/blocked/unknown 任务和原字节；旧 6Pro 额度拒绝和 unknown 生图不可重放。新生图要有确定未提交或新用户授权的独立任务；不因 Chat bridge 故障自动换 provider。
- 下一步请用户看三篇公开成品，对科学叙事、美感和未读者可理解性给具体反馈；需要修改时新建公开版本，不改旧快照。继续补按疑点回读/跨任务经验、定量图确定性标尺或像素核验，并按既有要求处理 Fig.2 重复 plan 与悬空 draft。管理员额度在下一次正常任务中核对真实一对一账本，不专门发模型探针。
