# CURRENT：期刊增强已部署，等待真实期刊试用

## Goal / version tuple

- 用户要求实现来源版权矩阵、AI 加工优先级、服务包额度三个功能，并已明确授权推送 hongliang 仓库及部署服务器供本人试用。
- 原功能分支 codex/journal-onboarding 已推送至 Nanqing96/openscience 与 photonics-dhl/OpenScience：96e5e0c626ac44427e2e92684e104e4e5d4b0dfd。
- 生产集成分支 codex/journal-server-20260922；本次已部署 release=e05ca61c461a9dbe7d50f8406b0218d3350b65b2，rollback=c085b157964c9798205de1364352bfbe51021cef。收尾文档提交不触发重部署，分支 HEAD 以 Git 为准。
- 2026-09-22 20:10左右（Asia/Shanghai）canonical deployment exit0；独立读回服务器与公网 /__release 均等于上述release，transaction/failure标记均不存在。
- [PR #109](https://github.com/photonics-dhl/OpenScience/pull/109) 尚未合并。独立分支已推送；自动审批拒绝未经具体确认直接更新共享release分支，等待用户确认或合作开发者审阅合并。
- 用户无法暂停其他发布；已保留生产更新至c085的所有代码，使用共享部署锁、精确active比较和回退事务完成发布，没有强推或覆盖并发版本。

## Done

- 来源与版权矩阵：逐项操作权限、核验依据、许可/到期历史、主来源真实内容绑定、来源修改后的重新确认；辅助材料不能借权放行主来源。
- 新上传先私有暂存，确认对应文件授权后解析；授权到期/撤销限制期刊与通用公开读取，原论文书目身份保留。
- AI加工队列：可解释评分、重点/延期、阻断原因、预计额度及用户明确入队。
- 服务包额度页：Free/Starter/Pro/Premium/Custom人工服务申请、有效额度/预占/到期/账本；成功草稿1篇扣1额度，失败/取消释放预占，不自动收费或开通。
- 保留生产英文申请、回执、补件/误拒重开、管理员审核入口、固定出版记录、反馈、媒体及科研任务恢复；本次无新增迁移/依赖，保留生产core49迁移。

## Evidence / scope

- 原96e分支历史回归：Domain574、API117、Web471+Node5、Worker4、真实Chromium2场景；不能替代当前集成版本的结果。
- 已部署e05自动CI：后端/Web构建、Domain39、API23（2条browser在独立阶段执行）、Worker4、Web7、真实Chromium桌面/375px手机2场景全部通过；使用隔离PostgreSQL与合成材料。
- e05自动CI仅文档登记失败；db19已通过docs-sync8项和索引审计。后续Markdown格式检查的历史告示/占位符/表格/空行问题已按实际约定收口，最终CI结果按GitHub运行记录，不把业务阶段通过冒称整项CI通过。
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
- 当前共享生产分支尚未合入期刊PR；合作开发者后续发布应先整合本PR，避免将已上线功能回退掉。
- 使用矩阵后不可直接回退到忽略动态授权的旧应用；已被其他科研恢复任务消费的收据/来源/媒体也必须保留，必要时优先前向修复。

## Next action

1. 用户登录 /journals/manage，进入已核验期刊，试用来源矩阵、加工队列和服务额度；没有期刊时先完成真实入驻流程。
2. 收取实际使用问题，保留来源、权限、额度和科学复核守卫修正；登录/成员身份与真实内容效果保持未确认，不伪造验收。
3. 经用户授权或合作开发者审阅将PR109合入共享生产分支；第二批另行推进。
