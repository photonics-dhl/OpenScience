# 架构与运维问题整改计划

用户要求执行原能力台账R01–R13的剩余修复；问题定义与关闭证据继续在原台账维护，本页只安排实施依赖。基线是canonical不可变提交95f8ccaac49c85c4ff457afc202999a9e665f288，复用既有architecture-maintenance工作树的新分支codex/architecture-remediation，保留已推ff1987ad及R08原补丁e4fd4a6b。

## 约束与写权

- 总控独占CURRENT/progress/index/registry，并串行协调生产窗口。本机依赖、安装、store修改、cleanup/archive/prune冻结保持；复用已有依赖与CI，不借修复新增治理平台或常驻服务。
- image当前独占生产及必要SSH，释放前全部取证离线；不发科研模型请求，不修改现有业务、收费、公开版本或已认可媒体。
- video独占agent.ts、presentation-asset.ts、video-task-admission.ts及其指定原测试；先不应用R08或改这些文件，交回后再按当时源码合入。其他owner的AGENTS/Skills/ADR保持。
- R01的具体失败是任意同机进程可连接世界可写socket读任务配置并调用付费completion；业务权限检查不能认证进程。只在现有bridge内补专属调用身份和首轮任务绑定，不另设模型网关。生产必须配对Worker与实际Native client，旧付费/未知状态保留。
- 代码、架构、并发、迁移及运维变更由独立gpt-6.1-sol High复核。每项报告源码、验证、部署、观察和未决分别成立；mock、healthy或源码提交不关闭真实运行缺口。

## 实施顺序与验收

1. R01：Native host-task/session、现有Python client/installer与原测试；无凭据不能读config或调模型/工具，首轮不能改Worker目标，合法SDK循环保持。仅synthetic请求验证，检查错误/日志不会带凭据。必须审查真实client交接和安装配对。
2. R04：原production-deploy-transaction、rollback/classifier脚本及原测试；普通不兼容回退必须核持久Native/paid/first-image状态，缺安全证据保留候选前向修复。兼容向前发布保持原路径，不强制无关停机，不造第二套发布守卫。
3. R13：先离线查API请求/上传/DTO/缓存的分配边界，窗口释放后仅取既有资源与OOM元数据；能建立因果才修峰值来源，必要时补现有日志/指标的有限无内容诊断，不盲改内存上限。验证实际导致问题的路径及不重复OOM。
4. R03/R05/R06/R11：复用backup/restore、monitor/prod compose和development manage脚本。准备双库/对象/必要恢复状态的完整备份与隔离验证、Netdata最小权限、扫描网分离和诊断服务按需策略。异机目标与实际采集需求未确定前保留可审查配置，不停服务、不删卷、不报灾难恢复完成。
5. R02/R07：native-agent-execution与已有Gateway/config工厂先定向取证；agent.ts交回后补所有fresh Native-only producer的收费前失败路径并收口双配置解释。历史marker缺失、原payer、paid/unknown与已完成恢复不得当成新提交许可。
6. R08：在video交回agent.ts后重用e4fd4a6b并与当前源码合并；补真实PG16游标/JSON/崩溃恢复验证，复用现有CI PG服务。旧Worker/API排空、持久状态与旧cleanup兼容未验证前不部署。
7. R09：只抽出共享context/hook leaf和嵌入publication panel，保持现有UI、callbacks和实际入口；用真实imports及已有UI回归验证环消除，不改设计。
8. R12：文件交回后沿Domain权限/CAS/Outbox实现停止后续执行、保留内容与paid/unknown的非破坏cancel；明确pending/running/completed及重启边界，不以Trash删除替代停止，不重收费或丢收据。

R10已完成，复用其CI、归档和双位置reader证据，不重复退役。Root最后收取独立审查，运行受影响检查，按现有台账回传关闭证据和未决；生产仍在可恢复的既有串行流程中操作。新文件索引及共享状态由总控同步。
