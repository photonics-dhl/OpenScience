# Hermes / 论文视觉叙事 CURRENT
> 唯一交付树 E:/Miscellaneous/XGS/.worktrees/onchip-video-release，branch release/onchip-production-line；根 main 只作导航。旧交接与失败收据见 [09-18 历史记录](2026-09-18-figure3-image-and-cleanup-handoff.md)，不得按旧 next action 重放。

## 目标与用户决定
- 需求基线 §18.2 与 [视觉叙事方案](../proposals/2026-09-21-visual-narrative-review.html)：未读论文者应从六维内容和按需设计的图看懂核心思想、机制与关键点；原论文图不是默认成品，视频尚未开始。2026-09-24 用户明确称赞第三篇 scene0「光子准粒子」淡彩图，同时指出其他图仍有问题；这是单图反馈，不代表整篇或三篇整体认可。最新纠正：学术/编辑/淡彩仅是既有样本，不能成为风格限制或三类验收配额；先把论文讲好，再从可用技能选择适合画面的艺术语言。
- 三篇真实论文走 PDF → Hermes 全文/SourceMap/六维/Claim/Evidence → 科学分镜与艺术设计 → Chat 生图 → Hermes 技能组织证据 + Chat 网页 5.6 Sol 正式像素审图 → 读者页与固定公开版本。不重造全文分析器，不以 accepted、发布或本页状态代替用户最终质量认可。
- 用户已授权完成任务和内部额度；2026-09-24 明确管理员不应被内部 AI Credit 挡住。保留逐任务审计、普通用户额度和 Chat 账号/供应商真实配额；不自动切 provider，不重发 unknown。必要定向测试/CI 应做，避免重复全套测试。

## Git、部署与当前边界
- 当前应用生产/rollback：c0b55a84560afd17c6be839d68c7940f98389c52 / 57373a798a99460c459203163231c9a70c5fe3b6；canonical branch release/onchip-production-line。[CI 35992870346](https://github.com/photonics-dhl/OpenScience/actions/runs/35992870346) success；应用部署 exit0，.release-id=c0b55，浏览器 provider bundle 与不可变 release 字节一致。--no-tests 跳过无关 Parser/ScanSci/embedding/auth 探针，不冒称通过；后续文档提交不需要部署。
- 服务器操作只经 infra/scripts/ssh-run.sh；不读/打印 Secret。新功能必要定向测试/CI 和真实产品路径要跑，旧全套用例不能冒充门禁。交付树及根 main 收尾 status --porcelain 为空，提交推送并 worktree prune/list；文档提交不部署。
- 浏览器桥复用 openscience-chatgpt-browser 的已登录网页/CDP；2026-09-24 曾在 22 页、约 6.49/8 GiB 时 CDP 无响应，核对无活动任务后仅重启该浏览器容器，登录与页面恢复。此为一次有证据恢复，未证明上游内存根因已修；不要无证重启或盲重发。旧 CODEX_SOL_IMAGE_REVIEW_ENABLED=false，正式像素判断走 Chat 网页 5.6 Sol，非 Codex CLI 登录。

## 三篇实际交付
| 论文 / Taskmaster | 产品结果与下一差额 |
|---|---|
| 第一篇机制图 / 1、5 | RO 9067a2d5，6 维/6 Claim/58 Evidence；旧方案 5226fcf5 与正式 6Pro accepted 图 8bbcfd9b（hash 778815c8…）仍在[公开 OSR-2026-000023/v/3](https://openscience.428312321.xyz/research/OSR-2026-000023/v/3)。从 v3 恢复私有 v10 草稿 eb8b3db7，同源复用六维/Claim/Evidence；新图 31c、3f1、cb4、1cd、7d9、a38 均正式 blocked 或人工 NO-GO。用户只认可旧 cb4 的暖纸墨线风格，不认可物理含义；aged-academia 概念分镜 c935 科学字段与六标签已核对/approved，真实图 a38（hash 723e8aef…）正式 blocked（6845543c…）且人工发现黑色实心圆误作孔。art-only 修订 abe8e1a0 已成功保存为私有 draft，但旧 encoding/narration 的“小印章”与新 art 的“禁止印章”冲突；同源修订任务 63e60709 在 art 阶段三次结构化输出失败，未保存新方案或 PNG。旧公开与原 PDF 保留。 |
| 第二篇编辑图 / 2、5 | RO c896802c，7 Claim/27 Evidence；批准方案 9a1b1a31，原图 cebcef87 仍 draft；5.6 Sol 正式 review-only 副本 6233e663，hash bbfaf594…，已 approved 并只选此图；[公开 OSR-2026-000022/v/2](https://openscience.428312321.xyz/research/OSR-2026-000022/v/2)，匿名实见图与六维，旧 v1 保留。学术/淡彩候选的标尺/多余因果错误仍 NO-GO，不混入公开；用户最终反馈待收。 |
| 第三篇淡彩双幕 / 3、5 | RO aa450f1e，公开旧 v1 与获用户称赞的第一幕保留。私有 Version 9f570ec9 的首图 approved copy 7eb1b7ee（原 e550137f，hash d64ea84b…）与新第二幕 4e64c389（hash 6b5b5223…）被明确选入 [公开 OSR-2026-000024/v/2](https://openscience.428312321.xyz/research/OSR-2026-000024/v/2)。新图方案 cd150093 的科学字段与批准 92548f87 一致；正式网页 5.6 Sol 像素审图 accepted（responseHash 299c1431…）、人工实看无误导发射箭头后 approved。原私有稿三类许可沿用 v1，发布硬审 0 block；匿名首页实际点入 v2，六维/5 Claim/30 Evidence、两图轮播各 1280×720、PDF workspace_member 无下载 URL。整篇叙事与其他图仍待用户评价/改进。 |
| 管理/学习 / 4 | 新图恢复门与审阅收据已接原产品任务；Hermes 科学/表现技能有实际按阶段消费，但按疑点回读全文与跨任务经验检索仍未完成。只读 [研发观察台](../proposals/2026-09-23-hermes-development-live.html) 的 ignored tmp/feed 为人工检查点，非自动遥测。 |
| Fig.3 / reuse 历史 | 9f7 恢复图获用户认可；Fig.1 原字节展示已被否定，不能冒称叙事完成。Fig.2 的 d5087b03 悬空 copy、重复 draft/approved 影响与处置仍须保留原件并按用户先前要求处理，不批量删除他人资产。 |

## 新恢复与质量证据
- 第一篇返工不重跑 Hermes 全文分析。初稿 548a/7817 的倏逝→传播暗示、坐标矛盾未放行；PNG 31c28c38 多余偶极标注、3f119a5c 假波长变化、cb4a2b51 闭合传播符号不清、1cd83d20 厚横带/正面孔透视矛盾，均保持私有。art-only 1b977 科学字段逐项等于 7633，斜视薄屏/椭圆孔图 7d92c8a6（hash 2b5e2094…）正式 blocked（8b7eed6a…）：扇形传播束、强弱梯度和粉蓝混色暗示局域转传播。可用编号手绘 277/256 auto，另 Baoyu article 23、infographic 22；旧 cb4 aged-academia 仅作风格参照。概念初稿 d8 的 labels 共11却引用 label 11；简短修订 6c 压到6项有效编号，art-only e9 误写“间距渐宽”未放行，修正 c935 科学字段不变/approved。真实 a38bda22（hash 723e8aef…）正式 blocked（6845543c…）：箭头及认证章误导，人工另发现主孔涂成黑盘。art-only abe8e1a0 已于 2026-09-24T14:36:11Z 成功，私有 draft hash 771fff2f…，科学字段与 c935 相同；但 encoding/narration 保留“小印章”，composition/treatment 却要求无印章。先在原分镜科学语义不变的前提下统一视觉标记，再出新图；不重发未知任务。原 planner `label N` 越界校验 8/8 定向测试及 Worker typecheck 通过，[CI 36014342028](https://github.com/photonics-dhl/OpenScience/actions/runs/36014342028) success；此提交尚未部署，原资产读取路径未改。
- 2026-09-25 同源科学字段修订任务 63e60709 到达 art 阶段，三次返回缺少顶层 `scenes` 或非对象结构，最终 `结构化输出超过重试上限`；task failed/result 空，无新方案/PNG，不重放该任务。现有 Hermes 配图技能将“小印章”等可替换装饰形状归 art，把理论核对含义留 science，并要求审阅跨字段一致；单幕显式风格 art 初始、持久化拒绝和 Gateway 重试均明确 `scenes` wrapper，未增加分析器或模型阶段。提交 f64674d7 已推送，17/17 定向测试与 Worker typecheck 通过、独立 High GO；[相关 CI](https://github.com/photonics-dhl/OpenScience/actions/runs/36116799049) 仍在运行，尚未部署或验证真实任务。原 planner `label N` 越界校验 8/8 与 [CI 36014342028](https://github.com/photonics-dhl/OpenScience/actions/runs/36014342028) success，此代码亦尚未部署。
- `auto` 风格修复 fd612048 已发布：独立 `styleId`、程序写内部标记并排除 21 个不可用手绘条目；定向 12 测试、Worker typecheck、独立 High 与 CI 35957257382 通过。私有稿 9f570ec9 保留已获称赞的第一幕；旧 4d96bbb8 失败任务不重放。真实新方案 6b3fd9c9 从可用目录选 Baoyu article:scientific、审阅 accepted，图片 a707446c 实际生成但正式像素审图 blocked：大公式压过机制主线。art-only 修订 af5c963c 选手绘 #037，人工发现水平电子箭头变斜、无据具体角度，未批准。修订 24b25c09 选手绘 #175，科学字段与原方案逐字段一致，批准后图片 31b180f7 生成；正式像素审图 blocked，实看确认电子与分叉断开、匹配支路折线及公式仍抢焦点。两个 PNG 均仅私有 draft；自动风格选择/生成已实证，画面质量未过关。
- 14089584 增加手工 PNG 在正式审图前明确失败且 spool 证明 not_submitted 时的同图 review-only 恢复；Domain 与 worker 复验原 hash、父分镜、prompt、管理员及来源，原失败任务与旧图不删除。定向 Domain/Worker 测试、类型检查、独立 High GO；上述第三篇 scene0 为真实恢复并 approved。
- 旧同父 scene1 68215708 及其 review-only copy ebf597b6 保持私有 draft：图上 “MOED” 错字虽被正式模型误判 accepted，人工实看拦下。新 scene1 已改正并真实审图。Prompt 加逐字缩写/公式检查仍不能保证模型不误判；任何公开前须保留实际像素核对。
- 第二篇三风格实际检验：编辑图通过正式审图并公开；学术和淡彩 v1/v2 的 20 nm 标尺偏心、77→777 nm 或额外因果箭头等候选保持私有 NO-GO。提示词不能代替确定性定量绘制/像素审阅。
- 2026-09-24 管理员内部额度已部署：Domain agent 提交与 ingestion 付费恢复在 Serializable 事务内读当前 platform_admin，为每个原 -1 消费追加幂等 +1 adjust，余额净不减，原扣减/恢复收据与操作审计仍在；非管理员零额度继续拒绝。定向两例、Domain typecheck、独立 High GO 及 CI 35902058149 通过；扩展跑旧 agent+ingestion 文件 90 pass/18 fail（旧确认/重试夹具与条件），不声称全套通过。本次无生产零余额新任务，不把代码/CI 证据冒充该场景实际运行；后续正常管理员任务核对真实账本。

## 保留与下一动作
- 保护原 PDF、已公开旧版本、用户认可图、失败/blocked/unknown 任务和原字节；旧 6Pro 额度拒绝和 unknown 生图不可重放。新生图要有确定未提交或新用户授权的独立任务；不因 Chat bridge 故障自动换 provider。
- 下一步基于用户对第三篇 scene0 的肯定和其余图的问题，逐图改进第一篇机制关系与第二篇脉冲形成的阅读主线；风格是手段，不设置三类白名单。旧方案 1d154c10/c8f6ada6、旧 PNG a707/31b/d225/59b 均保留私有失败证据，未入新公开。59b 的原网页审图在一小时 grace 内经锁/身份/字节/单轮核对无重发恢复为 blocked（responseHash 610345ea…）；仅在原 art 阶段修掉其误导箭头形成 cd150，真实新图 4e64 正式 accepted 与人工核图后发布。桥接规范 URL 等待从 30 秒改为最多 120 秒且保留 broker 前 60 秒余量，定向时序模拟、单提交校验和真实新任务正常完成（URL 13 秒出现）；晚于 30 秒到达的真实案例尚未实测。Worker Guide 默认 `auto` 文字与旧中英文冲突已对齐，17/17 定向测试、typecheck 与 CI success。保留原文疑点回读/跨任务经验、定量几何核验及 Fig.2 历史处置。
