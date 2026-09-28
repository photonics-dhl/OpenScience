# CURRENT：期刊增强已集成，已有使用记录与未解决解析失败

## Goal / version tuple

- 用户要求实现来源版权矩阵、AI 加工优先级、服务包额度三个功能，并已明确授权推送 hongliang 仓库及部署服务器供本人试用。
- 原功能分支 codex/journal-onboarding 已推送至 Nanqing96/openscience 与 photonics-dhl/OpenScience：96e5e0c626ac44427e2e92684e104e4e5d4b0dfd。
- 当前交付分支为 `release/onchip-production-line`；生产/回退的唯一实时锚点见 [Hermes CURRENT](2026-09-10-hermes-web-image-handoff.md)。`codex/journal-server-20260922` 与 e05ca61c/c085b157 是 09-22 首次集成发布的历史身份，不再作为最新生产或下次部署基线。
- 2026-09-22 20:10左右（Asia/Shanghai）首次 canonical deployment exit0；当时服务器/公网 release 与事务标记验证属于历史证据。2026-09-28 21:31 从实际容器挂载和发布目录确认 Domain 增强实现及来源矩阵、加工队列、服务页构建文件仍存在，未据此宣称登录后界面或业务流程通过。
- [PR #109](https://github.com/photonics-dhl/OpenScience/pull/109) 已于 2026-09-23 01:25:50 UTC 合入共享交付分支，merge `a6a27ef543f3217a94b02ed4ee281e01e8e1e4a4`；原 e05 与合并提交均为当前生产祖先。本轮通过 GitHub 与 Git 核实，旧等待确认/合并事项失效。
- 用户无法暂停其他发布；已保留生产更新至c085的所有代码，使用共享部署锁、精确active比较和回退事务完成发布，没有强推或覆盖并发版本。

## Done

- 来源与版权矩阵：逐项操作权限、核验依据、许可/到期历史、主来源真实内容绑定、来源修改后的重新确认；辅助材料不能借权放行主来源。
- 新上传先私有暂存，确认对应文件授权后解析；授权到期/撤销限制期刊与通用公开读取，原论文书目身份保留。
- AI加工队列：可解释评分、重点/延期、阻断原因、预计额度及用户明确入队。
- 服务包额度页：Free/Starter/Pro/Premium/Custom人工服务申请、有效额度/预占/到期/账本；成功草稿1篇扣1额度，失败/取消释放预占，不自动收费或开通。
- 保留生产英文申请、回执、补件/误拒重开、管理员审核入口、固定出版记录、反馈、媒体及科研任务恢复；本次无新增迁移/依赖，保留生产core49迁移。

## Evidence / scope

- 2026-09-28 只读生产元数据：1 个 active 期刊（主页未公开）、1 篇私有 draft 文章、1 个 `source_parse` 任务 failed（09-23 创建、09-24 更新）、2 个 submitted 服务申请、0 条期刊发布记录。它们证明已有使用记录，不证明合法来源试点或质量验收通过；没有读取正文/联系人、审批或重试。收据为 ignored `tmp/production-task-metadata-20260928.json`，解析根因本轮未调查。
- 原96e分支历史回归：Domain574、API117、Web471+Node5、Worker4、真实Chromium2场景；不能替代当前集成版本的结果。
- 已部署e05自动CI：后端/Web构建、Domain39、API23（2条browser在独立阶段执行）、Worker4、Web7、真实Chromium桌面/375px手机2场景全部通过；使用隔离PostgreSQL与合成材料。
- 最终文档/业务CI：047dcbe8的[run35726751672](https://github.com/photonics-dhl/OpenScience/actions/runs/35726751672)整体success，包含上述全部业务/构建/真实浏览器阶段及docs-sync/Markdown检查。该提交相对已部署e05仅为文档与格式配置变化；本条结果记录无需重部署或重复触发CI。
- e05服务器：两轮全应用构建运行闭包指纹一致；Parser契约/runner81项、发布脚本23项、语料导出1项通过。
- 同SHA正式hermes-parser-13-3-v3报告通过：16例中13完成、损坏PDF/公式PDF/空PNG精确复核；26次结构化fake，外部/禁止调用0，falseReady0。公式保持真实equation与native版本证明；这不代表真实模型科学质量验收。
- 严格canonical部署全部完成：报告/源/镜像一致，BGE真实向量、ScanSci工具/存储/OA/Worker、Parser及API/Web/Worker健康、nginx、公网精确版本和发布事务清理通过。未使用no-tests。
- 服务器双库备份成功：core83M、search5.5M，保留7/7轮；未下载业务数据或打印凭据。
- 旧211e报告仍保留：其部署因只先构建Worker、重复安装和全构建改变运行闭包而在切换前停止。新e05先完成相同安装/全构建、证明指纹稳定后生成新报告；未覆盖旧报告或放宽守卫。
- 生产页面已观察：公开期刊目录→申请入驻正常；当前浏览器匿名，管理页加载后正确跳转登录并携带returnTo=/journals/manage。三项私有页面的生产实际操作尚未观察，需用户登录已加入的真实期刊；没有创建假刊或代为批准入驻。
- 发布及验收原始日志：本任务work/journal-deploy-e05ca61c.log、journal-parser-acceptance-e05ca61c.log、journal-deployment-verified-e05ca61c.log；用户交付报告位于outputs/journal-deployment-report.md。

## Constraints / open risks

- Topic Hub、机器访问分析、在线支付、多刊共享额度和小数计费未实现，属于后续范围。
- 链接登记不自动下载；排序不代表科学质量、潜在引用或付费排名；真实解析/模型与商业方案需要用户用合法来源试点。
- 期刊增强已在共享生产祖先链；后续发布须延续当前生产源及动态授权语义，不按旧交接重新集成或回退。已有失败解析与待处理服务申请仍未闭环。
- 使用矩阵后不可直接回退到忽略动态授权的旧应用；已被其他科研恢复任务消费的收据/来源/媒体也必须保留，必要时优先前向修复。

## Next action

1. 先查已有 `source_parse` 失败任务的原收据及来源授权状态，再判断可恢复路径；保留原文章/任务，不按“尚无期刊”创建演示数据或直接重跑。
2. 收取实际使用问题，保留来源、权限、额度和科学复核守卫修正；登录/成员身份与真实内容效果保持未确认，不伪造验收。
3. 两项 submitted 服务申请保留实际审批边界，不代为批准；真实来源试用与登录后完整操作路径仍待观察，第二批另行推进。
