# 服务器架构与资源复核

内存与容器采样：2026-10-04 09:27:02；磁盘定向复核：09:33–09:37（北京时间）。生产身份与CURRENT一致；完整只读元数据在 `tmp/ops-readiness-20261004/`。

架构PNG/SVG仍是2026-10-03 22:42的历史快照；本表为最新复核。配置上限不是预留内存，Docker工作集、RSS、systemd cgroup与Linux可用内存不能相加。

总内存 **30.07 GiB**；Linux可用 **8.48 GiB**；swap使用 **3.999/4.00 GiB**，接近满。

公网首页HEAD返回HTTP200；Web/API/Worker/Postgres/SeaweedFS均running/healthy、RestartCount=0。此观察不代替登录和科研产品旅程验收。

| 容器 | 作用 | 工作集 | 内存上限 | 腾出条件 |
|---|---|---:|---:|---|
| openscience-chatgpt-browser | 网页生图/历史审阅 | 8.95GiB | 10.00 GiB | API真实生成→审核→入库通过且旧任务排空后可停；保留profile/jobs/spool |
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

网站三服务合计0.99 GiB；浏览器8.95 GiB；全部development容器4.51 GiB。后两项是有条件可释放的占用，尚未释放；生图API尚未完成真实验收。

浏览器memory.events的oom_kill=4与前次相同，属于历史累计，不证明今早新增OOM。当前核心应用容器oom_kill=0。浏览器及Docling仍各有约1.5 GiB旧页在swap；swap不作为视频任务容量。Qwen未运行，12 GiB是本地Qwen语音执行上限，不是云MiniMax/H3请求需要的内存。

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

根文件系统ext4容量147.27 GiB；09:37使用117.06 GiB、可用24.01 GiB、df显示83%。09:33短暂显示84%，变化不足0.1 GiB。相对00:19占用少约0.11 GiB，没有证据表明今早暴涨。只有一块150 GiB磁盘；inode使用30%，无未挂载的大容量数据盘。约6.2 GiB为df总量减used/available的文件系统保留差额，不是隐藏业务文件。

| 类别 | 最新占用 | 说明 |
|---|---:|---|
| 发布目录 | 87个；当前体积未取得 | 之前实测44.4GB是历史值；本次低优先级整树du在100秒截止，未伪装为新值；旧清理未执行 |
| Docker镜像 | 27.11GB，254个/21活跃 | Docker报告8.861GB可回收；运行、回滚和按需执行器仍需保护 |
| Docker数据卷 | 16.91GB，37个/19活跃 | 下表是其中的主要组成，不能重复相加；数据卷不清理 |
| Docker容器可写层 | 20.64MB | 不是大头 |
| Docker构建缓存 | 230kB | 不是大头；现有维护timer已触发 |
| /opt/openscience-models | 5.160GB | Qwen/Docling等共享模型；另有卷内BGE，不包含在此项 |
| /var/backups/openscience | 3.896GB | 数据库集合及967对象备份；同机器，非灾备 |
| 浏览器文件目录 | 2.292GB | 登录与任务资料保留 |
| /var/log | 0.619GB | journald约507.1M；不是空间大头 |
| 容器stdout/stderr日志 | 0.084GB | 此项不含卷内应用日志；生产json-file尚无显式max-size/max-file |
| 根设备已删除但打开的普通文件 | 4.28MB | /proc扫描完成；只涵盖根设备，不包含overlay/tmpfs |
| 应急swap文件 | 4GiB | 已配置，不回收 |

Docker详细卷报告25秒超时后停止。选定卷直接du均完成；没有重跑全盘扫描。各统计时刻略有不同，目录/镜像/卷及硬链接口径有重叠，不能用相加结果代替df。

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
| 单机资源保护 | 核心容器上限、Redis384MiB/noeviction和4GiB持久swap已落实；浏览器/诊断仍重，Portainer未限，峰值资源未完全解决 |
| 数据备份 | DB每日定时仍执行，最新03:00集合存在；967对象已逻辑导出及逐文件验证。对象定时尚未启用，当前全量隔离恢复未通过验收 |
| 异机副本 | 用户尚无外部存储；真实备份加密/传输/恢复未执行，已有crypto暂停要求继续有效 |
| 磁盘保留策略 | 再生缓存维护timer有效；旧release准备已取消、未删除，87目录仍在；不能声称只保留两版 |
| 监控告警 | Netdata与邮件投递有历史成功记录；独立于本机的可用性、备份失败和欠费告警未完成验收 |
| 测试环境/扩容 | 独立隔离测试站与后台多副本去重尚未完成；现有worker保持单实例，不直接复制 |
| 账号依赖/论文质量 | Synclip应用接线已部署但真实API生图未验收；论文链有仍未解决的真实科学/工具响应问题，不以healthy代替质量 |

本轮只读：未删除数据卷、发布目录、模型、日志或视频，未重启、调用模型或进行备份/恢复。后续磁盘整改优先复用既有保留机制核对消费者后清理旧release及镜像；开发历史数据保留/迁出与BGE模型共享分别处理。
