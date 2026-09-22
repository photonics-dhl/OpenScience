# CURRENT Progress Window

> 本页只提供当前状态入口，不复制执行日志。精确 branch/HEAD/release/rollback、证据、未决项和下一动作以对应 CURRENT handoff 为准；旧进展可从 Git 历史查阅。

## 用户目标

- 完成 2–3 篇真实论文的 Hermes 全文理解、六维凝练、科学与视觉审阅、读者页和固定公开版本；在用户认可质量前不批量冷启动。
- 保留真实论文、已有公开版本、用户认可图片、原始证据和审阅历史；模型或构建成功不等同科学质量、审美认可或完整交付。
- 将期刊第一批来源版权矩阵、加工优先级和服务额度增强安全合入当前生产线，部署后供用户用真实获授权刊物和论文试用。

## 2026-09-22 — Hermes 当前状态

- 第一篇已完成公开 v3，旧 v1/v2 保留；最终用户质量认可仍待确认。
- 后两篇新稿 M3 accepted、六张 PNG 已保存；六次 6Pro 审阅在提交前技术失败，另两张出图结果 unknown。原 PDF、六维及旧图保留，不重发 unknown；已存图仍有科学和叙事问题，accepted 不等于质量认可。
- 跨 broker 共用页面的问题已定位；自有页面隔离、正式 issues 到 art 接线及仅恢复已有 PNG 审阅的候选已 High GO，准确部署范围与下一动作见 [Hermes CURRENT](handoff/2026-09-10-hermes-web-image-handoff.md)。独立浏览器执行器的部署不能由应用源码合入推定完成。
- 第三篇恢复按钮曾因默认5秒事务在5.574秒超时而完整回滚，未创建新任务；生产 c085b157 将原 Serializable 事务延长至30秒，权限、源身份、幂等与仅P2034重试保持。后续真实审阅结果仍以 Hermes CURRENT 为准。
- 用户允许更换账号，但尚未找到第二份可直接切换的登录，当前登录保留。后两篇 reader、新公开版本及最终用户认可仍未完成。
- 既有淡彩图和真实 Fig.3 认可结果继续保护；被否定的 Fig.1 展示、旧失败候选和未知提交不得冒充交付成功或擅自重放。

## 2026-09-22 — 期刊增强当前状态

- 独立候选从现行生产线集成来源矩阵、动态授权到期保护、加工排序和人工服务方案；不新增迁移，不覆盖生产已有英文申请、补件重开、反馈与审批契约。
- 三项增强已完成服务器严格发布并核对公网版本；准确release/rollback、PR、CI、备份和观察边界见 [期刊 CURRENT](handoff/2026-09-15-journal-onboarding-handoff.md)。真实刊内操作待用户登录试用。
- 真实试用必须使用有代表权的刊物和合法来源；不创建假期刊、不代为审批或公开真实论文。

## 当前边界与入口

- 当前执行约束见 `AGENTS.md`；测试、构建、服务器操作和部署只按用户最新授权执行。
- 能力接线、已知断点和实际消费方见 [Hermes 能力台账](runbooks/hermes-capability-registry.md)。
- 本机浏览器代理的独立配置、依赖与回滚见 [本机能力记录](runbooks/hermes-capability-registry.md#local-browser-proxy)，不等同业务部署。
- 服务器部署、备份和监控分别见 [deployment](runbooks/deployment.md)、[backup-restore](runbooks/backup-restore.md) 与 [monitoring](runbooks/monitoring.md)。
- 历史进展不在默认读取路径继续累积；需要取证时使用 Git 历史及 CURRENT 中已登记的原始记录。
