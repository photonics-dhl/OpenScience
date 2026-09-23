# CURRENT Progress Window

> 本页只提供当前状态入口，不复制执行日志。精确 branch/HEAD/release/rollback、证据、未决项和下一动作以对应 CURRENT handoff 为准；旧进展可从 Git 历史查阅。

## 用户目标

- 完成 2–3 篇真实论文的 Hermes 全文理解、六维凝练、科学与视觉审阅、读者页和固定公开版本；在用户认可质量前不批量冷启动。
- 保留真实论文、已有公开版本、用户认可图片、原始证据和审阅历史；模型或构建成功不等同科学质量、审美认可或完整交付。
- 将期刊第一批来源版权矩阵、加工优先级和服务额度增强安全合入当前生产线，部署后供用户用真实获授权刊物和论文试用。

## 2026-09-23 — 三篇论文配图

- 像素审批门禁随09ad发布后阻止无正式收据的私有草稿获批；e7e独立CLI服务已停用且Worker开关false。Hermes现有skill/证据→Chat网页5.6Sol实际PNG审图已在24b3部署，空白新页无发送选择及[定向CI](https://github.com/photonics-dhl/OpenScience/actions/runs/35872438506)通过。第二篇目标PNG仍私有draft/无review copy；管理端1次内部额度因独立Nginx Basic Auth未登录而401，超时写入未发生，正式图片审查和公开未完成。准确状态见[CURRENT](handoff/2026-09-10-hermes-web-image-handoff.md)。
- 用户要求按当前任务细看目标、执行链、角色、能力、产物和效果；原只读 [Hermes 研发观察台](proposals/2026-09-23-hermes-development-live.html) 已原地新增当前任务模块。`find-skills` 本机和项目官方搜索 CLI 已存在，不重复安装。检索后将 K-Dense scientific-visualization 中适用的编码/可读性方法适配为 [科学视觉清晰度 skill](../.agents/skills/openscience-scientific-visual-clarity/SKILL.md)，只接原 Hermes science/plan，不增加正式末审来源预算、新模型阶段或生图 provider。独立High修复两项P2后PASS；326f已按既有流程部署，正常构建/启动，功能探针按用户要求跳过，真实消费与质量效果未观察；版本与后续以 [CURRENT](handoff/2026-09-10-hermes-web-image-handoff.md) 为准。
- 2026-09-23 用户明确必要测试/CI须运行、避免过度测试；交付树与根入口 AGENTS.md 已纠偏。项目适配的[手绘匹配](../.agents/skills/openscience-handdraw-router/SKILL.md)与[表现](../.agents/skills/openscience-handdraw-style/SKILL.md)只接原学术/编辑/淡彩的 art/render。v1 定向CI通过并随49b5部署；第二篇同一批准方案三张真实私有图中，编辑图内部5.6Sol GO，学术图标尺端点错、淡彩图77误写777 nm及无来源波瓣均NO-GO。已据此细化表现skill v2，本地5项定向测试、worker类型检查及[交付分支CI](https://github.com/photonics-dhl/OpenScience/actions/runs/35840121221)通过，e0cf已部署；两张v2真实重画又发现学术图标尺仍错、淡彩图虽修正77 nm却仍误放标尺并多出一条无来源箭头，独立5.6Sol均NO-GO。提示词无法保证精确几何，需确定性标尺/标签绘制或像素门禁；正式产品审阅和公开未完成，详见 [CURRENT](handoff/2026-09-10-hermes-web-image-handoff.md)。旧分镜fixture与主线CI lint债务独立登记。
- 新增 [Hermes 研发观察台](proposals/2026-09-23-hermes-development-live.html) 离线只读页面，区分各论文阶段进展、真实图片、内部咨询与正式审核；读取本机派生 feed 并提示过期，CURRENT 保持唯一状态来源。代理浏览器安全策略拒绝打开本机 file URL，页面尚无视觉运行观察，不冒称已部署。当前 skill 消费与固定摘录、原文回读、跨任务经验缺口见 [能力台账](runbooks/hermes-capability-registry.md)。
- 第一篇认可图继续保持公开 v3，旧版本保留。第二篇新 editorial 单幕分镜 9a1b 已批准、Chat 图 cebcef87 真实 PNG 私有 draft；第三篇 watercolor 分镜 c54 已批准、scene1 图 68215708 真实 PNG 私有 draft，scene0 复用旧父分镜 97f 的 d1ff4d86 图作内部观察。三图均经 5.6Sol High 内部像素咨询 GO；精确身份/哈希及未完成范围见 [Hermes CURRENT](handoff/2026-09-10-hermes-web-image-handoff.md)。
- 上一轮既有 PDF/六维/Claims/Evidence → Hermes 科学分镜 → Chat 生图路径未重做全文分析；当时未运行测试、预检或 CI。本轮测试政策与结果以上方 2026-09-23 新条目为准。Guide 的 art-only 路由曾遗漏结构化标签修改，已用普通修订取得新图，代码断点仍待修复。正式 5.6Sol 产品审图未接线，后两篇 reader、新公开版本和用户最终质量认可均未完成；用户最新要求先完成可读配图草稿。

## 2026-09-22 — Hermes 历史状态

- 第一篇已完成公开 v3，旧 v1/v2 保留；最终用户质量认可仍待确认。
- 后两篇新稿 M3 accepted、六张 PNG 已保存；原产品入口各创建3个续审任务，四项精确未提交、一项供应商前P2034、一项已提交只得Pro额度拒绝，均非有效科学像素审阅。另两张出图结果 unknown；原 PDF、六维及旧图保留，不重发 unknown；已存图仍有科学和叙事问题。
- 自有页面隔离、正式 issues 到 art、仅恢复已有 PNG 审阅及30秒事务修复已交付。显式选Pro、额度拒绝分类、P2034有界重试及最多第二段review-only续审已随合并期刊线上代码部署；第三篇恢复入口因终态error覆盖旧unknown step.error而消失，定向修复f5d已正常构建/启动，原页GET确认两篇均可恢复，旧Pro续审未点击。Chat provider仍为a6a27ef5，应用生产/回退见 [Hermes CURRENT](handoff/2026-09-10-hermes-web-image-handoff.md)。按用户要求跳过测试/预检/CI。用户改选5.6Sol审图，六张PNG的本机咨询均指出不能直接公开；产品内5.6Sol审图尚未接线。
- 用户不再等待第二Pro账号；9月11日所谓第二账号已是当前登录，当前Pro额度受限。后两篇 reader、新公开版本及最终用户认可仍未完成。
- 为得到科学正确的新草稿，站内Hermes第二篇a843、两幕133、单幕bc1均成功但Sol来源复核仍NO-GO；已提出把无证钟形曲线改为示意场带的最小修订，未批准/生图。第三篇a96规划失败且无结果；两幕307成功但Sol指出相位匹配误挂吸收路径，新的watercolor科学修订73e运行中。一次guide误入私有文字稿，未保存/发布。六张旧PNG保留，新PNG尚无。Sol正式产品审图尚需独立队列，旧6Pro续审与未知提交保持不重发。
- 既有淡彩图和真实 Fig.3 认可结果继续保护；被否定的 Fig.1 展示、旧失败候选和未知提交不得冒充交付成功或擅自重放。

## 2026-09-22 — 期刊增强当前状态

- e05已从现行生产线集成来源矩阵、动态授权到期保护、加工排序和人工服务方案；未新增迁移，生产已有英文申请、补件重开、反馈与审批契约保留。
- 三项增强已完成服务器严格发布并核对公网版本；准确release/rollback、PR、CI、备份和观察边界见 [期刊 CURRENT](handoff/2026-09-15-journal-onboarding-handoff.md)。真实刊内操作待用户登录试用。
- 真实试用必须使用有代表权的刊物和合法来源；不创建假期刊、不代为审批或公开真实论文。

## 当前边界与入口

- 当前执行约束见 `AGENTS.md`；测试、构建、服务器操作和部署只按用户最新授权执行。
- 能力接线、已知断点和实际消费方见 [Hermes 能力台账](runbooks/hermes-capability-registry.md)。
- 本机浏览器代理的独立配置、依赖与回滚见 [本机能力记录](runbooks/hermes-capability-registry.md#local-browser-proxy)，不等同业务部署。
- 服务器部署、备份和监控分别见 [deployment](runbooks/deployment.md)、[backup-restore](runbooks/backup-restore.md) 与 [monitoring](runbooks/monitoring.md)。
- 历史进展不在默认读取路径继续累积；需要取证时使用 Git 历史及 CURRENT 中已登记的原始记录。
