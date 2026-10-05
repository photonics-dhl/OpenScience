# 服务器架构与资源复核

内存与容器采样：2026-10-04 09:27:02；磁盘清理前复核09:33–09:37，清理后复核11:03–11:07；网页浏览器下线后复核2026-10-05 17:43（北京时间）。发布身份以CURRENT为准；完整元数据在 `tmp/ops-readiness-20261004/` 与 `tmp/ops-readiness-20261005-browser-*.json`。

架构PNG/SVG仍是2026-10-03 22:42的历史快照；本表内存仍为09:27采样，本轮按用户要求暂缓内存调整。配置上限不是预留内存，Docker工作集、RSS、systemd cgroup与Linux可用内存不能相加。

此前总内存 **30.07 GiB**、Linux可用 **8.48 GiB**、swap使用 **3.999/4.00 GiB**；下线网页浏览器后17:43复核总内存 **30.07 GiB**、可用 **17.85 GiB**、swap使用 **2.77/4.00 GiB**。

公网首页HEAD返回HTTP200；Web/API/Worker/Postgres/SeaweedFS均running/healthy、RestartCount=0。此观察不代替登录和科研产品旅程验收。

| 容器 | 作用 | 工作集 | 内存上限 | 腾出条件 |
|---|---|---:|---:|---|
| openscience-chatgpt-browser | 网页生图/历史审阅 | 9.377GiB（下线前）→0 | 10.00 GiB | 2026-10-05已停止并移除容器；bridge与image/review timer disabled，profile登录态已删除；历史jobs/spool保留 |
| openscience-development-langfuse-clickhouse-1 | 开发模型调用诊断 | 2.76GiB | 3.00 GiB | 完成当前诊断后按需启停；保留全部数据卷 |
| openscience-prod-paper-analysis-1 | Docling PDF/OCR/公式 | 1.108GiB | 8.00 GiB | 保留 |
| openscience-prod-malware-scanner-1 | 上传病毒检测 | 898.1MiB | 3.00 GiB | 保留 |
| openscience-development-langfuse-web-1 | 开发模型调用诊断 | 794.1MiB | 2.00 GiB | 完成当前诊断后按需启停；保留全部数据卷 |
| openscience-prod-api-1 | 接口/登录/权限 | 701.3MiB | 2.00 GiB | 保留 |
| openscience-prod-embedding-worker-1 | BGE-M3检索 | 667.9MiB | 6.00 GiB | 保留 |
| netdata | 资源监测 | 625.3MiB | 1.50 GiB | 保留监控/管理 |
| openscience-development-langfuse-worker-1 | 开发模型调用诊断 | 482.6MiB | 1.50 GiB | 完成当前诊断后按需启停；保留全部数据卷 |
| openscience-prod-object-storage-1 | SeaweedFS论文与媒体对象 | 324.7MiB | 3.00 GiB | 保留 |
| openscience-prod-agent-worker-1 | 单实例任务调度，4 lanes | 190.6MiB | 2.00 GiB | 保留 |
| openscience-development-serena-serena-1 | Serena代码定位 | 190MiB | 3.00 GiB | 按需启停，核对当前消费者 |
| openscience-prod-postgres-1 | 生产数据库 | 146.4MiB | 2.00 GiB | 保留 |
| openscience-development-catalog-catalog-1 | Backstage开发目录 | 145.5MiB | 2.00 GiB | 按需启停，核对当前消费者 |
| openscience-prod-web-1 | 网站页面 | 126MiB | 1.00 GiB | 保留 |
| openscience-prod-document-parser-1 | 无Secret解析边界 | 119.3MiB | 0.50 GiB | 保留 |
| openscience-prod-scansci-mcp-1 | 论文获取/轻量浏览器 | 102.9MiB | 2.00 GiB | 保留 |
| openscience-development-langfuse-minio-1 | 开发模型调用诊断 | 100.6MiB | 0.50 GiB | 完成当前诊断后按需启停；保留全部数据卷 |
| openscience-development-gateway-audit | Gateway采集 | 41.28MiB | 0.25 GiB | 按需启停，核对当前消费者 |
| portainer | Docker管理 | 32.62MiB | 未设（宿主容量不是上限） | 保留监控/管理 |
| openscience-development-langfuse-postgres-1 | 开发模型调用诊断 | 32.49MiB | 0.50 GiB | 完成当前诊断后按需启停；保留全部数据卷 |
| openscience-development-langfuse-redis-1 | 开发模型调用诊断 | 7.27MiB | 0.50 GiB | 完成当前诊断后按需启停；保留全部数据卷 |
| openscience-prod-redis-1 | 队列/缓存 | 4.301MiB | 0.50 GiB | 保留 |
| vnstat | 流量统计 | 1.078MiB | 0.12 GiB | 保留监控/管理 |

网站三服务合计0.99 GiB；下线前浏览器容器9.377 GiB；全部development容器4.51 GiB。2026-10-05 Synclip `gpt-image-2` 首次真实任务已成功并保存私有PNG，随后完成网页浏览器容器、bridge、两个网页任务timer和登录态下线；ScanSci的论文解析Xvfb独立保留。

浏览器memory.events的oom_kill=4是下线前历史累计，不证明本轮新增OOM。当前核心应用容器oom_kill=0；浏览器进程已清零，ScanSci Xvfb仍属于论文解析能力。swap不作为视频任务容量。Qwen未运行，12 GiB是本地Qwen语音执行上限，不是云MiniMax/H3请求需要的内存。

## 主要进程（RSS排序）

| PID | 进程名 | RSS |
|---:|---|---:|
| 1304438 | chrome | 5.276 GiB |
| 4014320 | clickhouse-serv | 1.956 GiB |
| 50266 | docling-serve | 1.041 GiB |
| 2136784 | clamd | 0.877 GiB |
| 3529955 | next-server (v1 | 0.790 GiB |
| 2753988 | node | 0.730 GiB |
| 2746005 | python | 0.652 GiB |
| 4192421 | netdata | 0.500 GiB |
| 3529930 | MainThread | 0.496 GiB |
| 381006 | dockerd | 0.368 GiB |
| 2136683 | weed | 0.328 GiB |
| 2754160 | node | 0.198 GiB |

只输出comm，不读取命令参数。进程RSS与容器工作集口径不同。

## 磁盘核算

根文件系统ext4容量147.27 GiB；09:37使用117.06 GiB、可用24.01 GiB、df显示83%（09:33短暂84%）。清理完成后11:03使用75.02 GiB、可用66.05 GiB、54%，使用量减少42.04 GiB。只有一块150 GiB磁盘；清理前inode使用30%，无未挂载的大容量数据盘。约6.2 GiB为文件系统保留差额，不是隐藏业务文件。

根因：2026-09-14正常发布为保护旧源码消费者改成空schema2保留计划，旧目录及带SHA标签的镜像全部保留；日常缓存timer不处理这些目标，10-04凌晨维护仅回收10MiB，却观察到86目录/44G。每次发布继续累积，属于此前提出的发布保留策略问题。

10:47–10:56一次受锁保护的既有retention事务完成：删除85个非当前/回滚应用目录、300个指定旧镜像标签、73个旧capability sidecar；只剩当前与回滚两个应用目录、对应8个capability标签。unit退出0、receipt complete、pending/tombstone均清除，部署锁已释放。镜像层共享，300标签不等于300份完整镜像；df总空间变化不能只用Docker镜像统计解释。

| 类别 | 最新占用 | 说明 |
|---|---:|---|
| 发布目录 | 87→2个 | 当前＋一个回滚；未重跑整树du，不能把历史体积当当前值 |
| Docker镜像 | 27.11→25.36GB，254→29个/21活跃 | 11:06 system df报告7.113GB可回收，其中仍有回滚/按需运行依赖，未做全局prune |
| Docker数据卷 | 17.15GB，system df 37个/19活跃 | volume ls列38个，CreatedAt均早于清理；不同报告口径不当删除证据；卷均不在清理范围 |
| Docker容器可写层 | 20.66MB | 25个容器，24运行；不是大头 |
| Docker构建缓存 | 230kB | 不是大头；现有维护timer已触发 |
| /opt/openscience-models | 5.160GB | Qwen/Docling等共享模型；另有卷内BGE，不包含在此项 |
| /var/backups/openscience | 3.896GB | 数据库集合及967对象备份；同机器，非灾备 |
| 浏览器文件目录 | 1.281GB（登录态删除后） | 历史jobs/spool/review-spool/downloads保留；profile登录态已删除 |
| /var/log | 0.619GB | journald约507.1M；不是空间大头 |
| 容器stdout/stderr日志 | 0.084GB | 此项不含卷内应用日志；生产json-file尚无显式max-size/max-file |
| 根设备已删除但打开的普通文件 | 4.28MB | /proc扫描完成；只涵盖根设备，不包含overlay/tmpfs |
| 应急swap文件 | 4GiB | 已配置，不回收 |

清理前选定卷直接du均完成；下表沿用该采样，不冒称清理后重新测量。清理后simple df首次25秒超时保留，第二次45秒有界调用成功，stderr0。没有重跑全盘扫描。各统计时刻略有不同，目录/镜像/卷及硬链接口径有重叠，不能用相加结果代替df。

| Docker卷内部组成 | 实际分配 | 保留原因 |
|---|---:|---|
| 论文/媒体对象 | 3.396GB | 数据/模型/监控卷，禁止直接删除 |
| 生产数据库 | 0.264GB | 数据/模型/监控卷，禁止直接删除 |
| BGE模型 | 4.587GB | 数据/模型/监控卷，禁止直接删除 |
| 开发ClickHouse数据 | 6.568GB | 数据/模型/监控卷，禁止直接删除 |
| 开发ClickHouse日志 | 0.044GB | 数据/模型/监控卷，禁止直接删除 |
| Netdata历史指标 | 1.709GB | 数据/模型/监控卷，禁止直接删除 |
| Netdata元数据 | 0.000GB | 数据/模型/监控卷，禁止直接删除 |

## 之前整改的实际状态

| 问题 | 当前状态 |
|---|---|
| 单机资源保护 | 核心容器上限、Redis384MiB/noeviction和4GiB持久swap已落实；网页浏览器链路已下线并释放约9.4GiB，开发诊断栈仍可按需启停，Portainer未限 |
| 数据备份 | DB每日定时仍执行，最新03:00集合存在；967对象已逻辑导出及逐文件验证。对象定时尚未启用，当前全量隔离恢复未通过验收 |
| 异机副本 | 用户尚无外部存储；真实备份加密/传输/恢复未执行，已有crypto暂停要求继续有效 |
| 磁盘保留策略 | 已完成85目录/300旧标签/73 sidecar清理。恢复正常发布prune-unused1，RED→GREEN、High GO、精确CI37172325083 success；随后正常部署exit0且PREPARE/COMPLETE成功，11:13实读发布目录仍精确两版、pending/journal/failed均无，持续策略已首次线上观察 |
| 监控告警 | Netdata与邮件投递有历史成功记录；独立于本机的可用性、备份失败和欠费告警未完成验收 |
| 测试环境/扩容 | 独立隔离测试站与后台多副本去重尚未完成；现有worker保持单实例，不直接复制 |
| 账号依赖/论文质量 | 网页ChatGPT账号链路已停用并删除登录态；Synclip首次真实API生图已成功保存私有PNG但尚未公开，论文链仍有科学/工具响应问题，不以healthy代替质量 |

清理后核心五容器healthy、RestartCount0/OOMfalse，生产cgroup oom_kill前后均0，首页HEAD200。2026-10-05浏览器容器已移除，bridge与两个网页任务timer为inactive/disabled，profile目录已删除；历史jobs/spool/review-spool/results/downloads、上传论文、已认可媒体、备份、模型和paid记录保留。Synclip私有PNG及其任务/receipt保留；ScanSci解析Xvfb未删除。

手动H3执行入口已从旧应用目录脱离，20文件/216317B Gateway复用复制到既有独立video bundle，稳定入口 `/opt/openscience-video/cloud`。旧应用源码删除后实际Node导入再次通过，0付费请求；原Native运行包和catalogue未替换。额外探测的历史Codex配置runtime路径不存在，未在此前六个闭合目录扫描内、也未被retention触及；不能据此宣称本次误删或Codex真实生成已验收。独立High收尾复核及具体元数据见post-cleanup.json、post-inventory.json、docker-df-after.json。

长期做法：发布成功后自动保留两版，失败保留可恢复事务并告警；数据/模型/浏览器状态与发布目录分离，已装执行器按自身依赖维护。日常缓存维护继续复用现有timer，不能代替release/tag保留。生产容器日志轮转、开发历史数据保留/迁出仍需单独落实，不能以本次释放42GiB宣称所有增长源已消失。

11:13下一次正常发布后根盘仍54%，可用66.23GiB；正常发布的PREPARE/COMPLETE及部署exit0由生图发布owner确认，目录仅新发布与前一版，不再保留原旧回滚目录。Native同源配对也已完成，API/Worker运行时及目录ID一致、原资源上限保持、核心7服务running/OOMfalse、timer enabled/active、2目录/0tombstone/pending及FD9释放后验通过；实际应用/Native身份只在CURRENT记录，配对收据见tmp/hermes-cleanup-20261003/native-review-runtime-after.json；11:03的25容器身份比较是本次清盘边界，不冒称新部署后容器完全未变。证据normal-publish-metadata.json及发布owner的正常部署收据。
