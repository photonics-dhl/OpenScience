# Journal workbench CURRENT

## Goal and source

- 2026-10-08 用户最新明确要求：先回滚线上到 `45a577a3`，按提供的完整期刊需求重新开发，再推送 `photonics-dhl/OpenScience` 的 `frontend/nanqing` 并部署。
- 需求以 [期刊设计 2026-10-08 重做范围](../specs/2026-09-15-journal-onboarding-design.md) 为准；本文件仅记录执行状态，不缩小交付范围。
- 开发继续保留最新协作代码，不 reset 分支、不强推、不改 main、不覆盖他人更新。工作 clone 位于本任务 `work/OpenScience`。
- 其他产品未完成事项仍见 [Hermes CURRENT](2026-09-10-hermes-web-image-handoff.md)，期刊回滚不撤销其需求或已存资产。

## Version and production checkpoint

- branch=`frontend/nanqing`；重做实现及数据库回归修复已正常推送；精确候选以实际 Git HEAD 为准，尚未新部署。未重置协作分支或修改 main。
- 2026-10-08 显式回滚完成：active=`45a577a3a8f6bca78a063e7478fba131c5efb375`；rollback=`42fe1a974fb62e5a868d3a4f1da812065cb148b1`。未回退数据库。
- 原 FD9 生产锁、任务排空、Nginx 写门禁、durable journal、CAS、retention prepare/complete 全部通过，脚本 exit0，所有生产服务 healthy。公网 `/__release` 返回目标完整 SHA。
- Native 从 42fe 安装时的 `previous/` 恢复 `784c6b25342c29bdc5c2db193258d34dfafd4e64` runtime/catalogue，与旧 API/Worker 匹配；timer 恢复 active。
- 视频 v2 保留 `adminModelsEnabled=false` / `accepting=false`，未退回 v1；历史 paid/unknown 收据、素材、数据库和公开版本未改。
- 私有恢复证据：`/opt/openscience/observations/journal-explicit-rollback-42fe1a974fb62e5a868d3a4f1da812065cb148b1-to-45a577a3a8f6bca78a063e7478fba131c5efb375/`；脚本 SHA256 `75f18950b37357e0f5b359be977ca4333db68f9018f55384f7a0bbcb9165bd29`。
- 唯一等待人工核源的 run 创建于 2026-10-05，profile=`visual-narrative-v1`，source_ingestion succeeded；两应用间相关协议无差异。回滚不修改或重新提交该 run。

## Rebuild work

| 交付项 | 当前事实与剩余工作 |
|---|---|
| 目录、公开主页、草稿箱 | 已完成目录、全量筛选、原始 DOI/固定解读版本、独立公开与入驻、草稿归档及单刊直达管理；目录主标题精确 Browse all journals，真实期刊浏览器流程已过。 |
| 共用文件与 Native Hermes | 已接共用 ArtifactUploader、RO 文件版本、ingestion、Native 结果与原子确认；不再启动第二次 journal-text 生成。隔离 PostgreSQL 已验证原生候选到私有确认、重放不重复扣费和旧公开版本不变。 |
| 发布后重新编辑 | High 审查发现旧 source-upload/授权变更会限制旧公开版本；采用独立私有 working RO 与持久绑定，出版 RO 保持不变。新权限仅约束新稿，显式撤权另走原受控动作。 |
| 权限与费用 | 上传先保管、显式授权后才进入共享管线；期刊 scoped source/revision/hash/actor/run 绑定及每次外发核权。共用任务使用期刊 grant，不扣个人额度，同锁限制并发；有效结果消费一次、未知 paid 保留、免费恢复不另扣。存储额度、到期授权与故障恢复已独立 High GO。 |
| 编辑及审批 | 五区连续页面、六字段编辑器、图卡/FAQ、私有确认与独立审批发布已接；统一 AI 授权，证据来源必填，历史到期时间隐藏且保留。修复新增材料错误发送expiresAt:null的真实API合同；期刊桌面/375px和素材授权完整流程已过，待线上观察。 |
| 推送与部署 | 5008136c 的 Journal push `37812016797`/PR `37812024605` 和 video `37812024600` 全过；media push `37812016805`/PR `37812024417` 在68项导航阶段达到总20min取消。正在独立分组保留全部浏览器用例并修复共享创建页的旧定位，不延长用例超时。 |

## Checks and release constraints

- 基线 e431 的 CI：Journal `37782272375` 后端/单测/Web build 通过，浏览器 1/2 失败；video `37782272323` 成功，media `37782272316` cancelled。这些不能当新候选验收。
- 旧 42fe 发布四 CI、构建收敛与站内浏览证据为历史，保存在 Git 前版和 `/opt/openscience/observations/journal-20261008-42fe1a974fb62e5a868d3a4f1da812065cb148b1/`，不能证明本次完整重做完成。
- 最新协作候选的视频付费前 readiness P1 已修：新收费动作先检查真实 host 新鲜状态；不影响已付结果恢复。定向 Domain 211/211、API 24/24 已过，最终精确 SHA CI 尚待。
- 本机 Web build exit0（日志 `tmp/check-logs/1791475440758-8ca01aa2-24e2-4363-976f-705ad3087771.log`）；Web期刊37/37、路由21/21。GitHub隔离PostgreSQL中迁移51及期刊Domain72例、API边界均通过；本机Docker不可用，没有借用生产DB测试。
- 旧授权到期兼容 API 8/8 已通过；期刊 Domain 59/59、Worker 6/6（数据库用例未在本机执行）。旧 snapshot 根据保留材料指纹追溯期限；若历史材料已删除无法恢复旧期限，不伪造该事实。未知 paid 预留不盲释放。
- 新发布编排候选 `tmp/deploy-journal-rebuild.candidate.sh` SHA256 `a2ed3061a1b3df57f36979d3a1f518ed0d5fd472d5024485a83ad6a3ed6dcfca` 已独立 High 条件 GO：先完成双库备份、精确 CI、运行快照收敛，再 Native配对和原 canonical 迁移发布；保留当前关闭的视频host，Native安装后临时disabled，成功配对后恢复原enabled/active，候选失败保持disabled。尚未执行新部署。
- 2026-10-09 原双库备份 exit0，core157M/search14M、sets7/7，绑定线上45；私有证据在 observations/journal-20261008-d9eba2c6bfbd6e9c79b7acb92ee5781ebec32ec4/backup.{log,exit}。最终部署只能使用最终精确SHA自身的收敛快照。
- 5008136c服务器三轮构建exit0、first/second运行快照一致；发布脚本已上传其私有观察目录但未执行。后续修复提交须重新物化并取得自己SHA的运行快照，不能部署已被替代候选。
- 使用既有 .env/SSH，配置仅机械复用、不打印密钥；必要 additive 迁移按原备份和 migration CLI，不 reset 数据。
- 精确已推 SHA、干净发布树、线上祖先及 rollback 校验、原 lock/journal/public identity/自动回滚守卫不可绕过；Native/视频资源配对后再开放写入。
- 测试与部署不授权审批真实期刊、重发未知付费任务或公开新科研结果。验收用隔离数据和最小已授权真实站内路径；科研质量仍需实际产物及用户确认。

- 2026-10-09 08:44 CST重新fetch发现远端已到58695a25；保留全部协作生产代码，auth-dashboard采用远端完整fixture，4个导航spec移到独立CI矩阵并保留所有截图/trace，research-continuation仅补新版空表单断言。本机该单条运行无终态已停止，交精确CI验证。生产仍45/rollback42，无事务标记。

## Next action

合并远端最新协作代码并完成导航CI修复，再完成精确最终 CI、服务器构建收敛、前向发布和桌面/窄屏真实入口观察；最后同步精确线上版本。回滚及重做实现已完成，整项仍待新部署交付。
