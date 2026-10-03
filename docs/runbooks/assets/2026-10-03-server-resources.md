# 服务器架构与资源快照

采样：2026-10-03 22:42:07（北京时间）。这是只读观察，不是实时仪表盘。应用 ef9e44d6aa09ee748e792b19005f831b564182f3，回滚 29de74f2e8f53765283a34055850c1f40122575c。

总内存 **30.07 GiB**；Linux可用 **9.12 GiB**；swap **4.00 GiB / 4.00 GiB**；根盘可用 **24.67 GiB / 147.27 GiB**。

容器工作集合计约17.28 GiB。Docker工作集、宿主systemd的cgroup占用、进程RSS和Linux可用内存口径不同，不能直接相加；配置上限也不是预留内存。本次无活跃Native Hermes或本地视频任务，任务峰值尚不在图中。

| 容器 | 作用 | 当前工作集 | 配置内存上限 | 腾出条件 |
|---|---|---:|---:|---|
| openscience-chatgpt-browser | 网页生图/历史审阅执行器 | 8.364GiB | 10.00 GiB | API真实生成→审核→入库通过、无在途/unknown旧任务后可停；保留profile/jobs/spool |
| openscience-development-langfuse-clickhouse-1 | 开发模型调用诊断 | 2.25GiB | 3.00 GiB | 可按需启停；先停采集器、保留checkpoint和全部数据卷 |
| openscience-prod-paper-analysis-1 | Docling PDF/OCR/公式 | 1.222GiB | 8.00 GiB | 保留；峰值不等于本次工作集 |
| openscience-prod-malware-scanner-1 | 上传病毒检测 | 951.8MiB | 3.00 GiB | 保留；峰值不等于本次工作集 |
| openscience-development-langfuse-web-1 | 开发模型调用诊断 | 785.4MiB | 2.00 GiB | 可按需启停；先停采集器、保留checkpoint和全部数据卷 |
| openscience-prod-api-1 | 接口/登录/权限 | 745MiB | 2.00 GiB | 保留；峰值不等于本次工作集 |
| openscience-prod-embedding-worker-1 | BGE-M3语义检索 | 669.9MiB | 6.00 GiB | 保留；峰值不等于本次工作集 |
| netdata | 资源监测 | 619.4MiB | 1.50 GiB | 保留监控/管理；可进一步精简配置 |
| openscience-development-langfuse-worker-1 | 开发模型调用诊断 | 485.4MiB | 1.50 GiB | 可按需启停；先停采集器、保留checkpoint和全部数据卷 |
| openscience-prod-object-storage-1 | SeaweedFS论文和媒体对象 | 253.4MiB | 3.00 GiB | 保留；峰值不等于本次工作集 |
| openscience-development-serena-serena-1 | Serena代码定位 | 194.7MiB | 3.00 GiB | 开发工具，可按需启停 |
| openscience-development-catalog-catalog-1 | Backstage开发目录 | 133.7MiB | 2.00 GiB | 开发工具，可按需启停 |
| openscience-prod-web-1 | 网站页面 | 117.6MiB | 1.00 GiB | 保留；峰值不等于本次工作集 |
| openscience-prod-agent-worker-1 | 单实例任务调度，4 lanes | 116.9MiB | 2.00 GiB | 保留；峰值不等于本次工作集 |
| openscience-prod-scansci-mcp-1 | 论文获取，含独立轻量浏览器 | 107MiB | 2.00 GiB | 保留；峰值不等于本次工作集 |
| openscience-prod-document-parser-1 | 无Secret/512MiB解析边界 | 99.54MiB | 0.50 GiB | 保留；峰值不等于本次工作集 |
| openscience-development-langfuse-minio-1 | 开发模型调用诊断 | 91.15MiB | 0.50 GiB | 可按需启停；先停采集器、保留checkpoint和全部数据卷 |
| openscience-prod-postgres-1 | 生产core/search数据库 | 66.2MiB | 2.00 GiB | 保留；峰值不等于本次工作集 |
| openscience-development-gateway-audit | Gateway只读元数据采集 | 44.05MiB | 0.25 GiB | 随Langfuse按需启停；不重放模型请求 |
| openscience-development-langfuse-postgres-1 | 开发模型调用诊断 | 37.08MiB | 0.50 GiB | 可按需启停；先停采集器、保留checkpoint和全部数据卷 |
| portainer | Docker管理 | 36.37MiB | 未设（显示宿主容量不代表限额） | 保留监控/管理；可进一步精简配置 |
| openscience-prod-redis-1 | 队列/缓存 | 8.297MiB | 0.50 GiB | 保留；峰值不等于本次工作集 |
| openscience-development-langfuse-redis-1 | 开发模型调用诊断 | 7.73MiB | 0.50 GiB | 可按需启停；先停采集器、保留checkpoint和全部数据卷 |
| vnstat | 流量统计 | 2.297MiB | 0.13 GiB | 保留监控/管理；可进一步精简配置 |

| 宿主服务 | 当前cgroup用量 | 状态 |
|---|---:|---|
| cloudflared.service | 36.9 MiB | running |
| containerd.service | 298.0 MiB | running |
| docker.service | 680.9 MiB | running |
| nginx.service | 27.5 MiB | running |
| openscience-chatgpt-browser-bridge.service | 29.4 MiB | running |
| openscience-codex-image.service | 43.2 MiB | running |
| squid.service | 45.7 MiB | running |

网站三服务约0.96 GiB；生产数据服务约0.32 GiB；解析/检索/获取约2.08 GiB；上传安全约0.93 GiB。

浏览器及桥接约8.39 GiB，开发诊断栈约3.99 GiB，合计约12.38 GiB可在满足消费者/状态条件后讨论释放。实际释放必须停用后复测，不能把此估算当已经释放，swap也不能当视频容量。

Qwen权重约4.21GiB，仅为候选磁盘清理；本次没有运行的Qwen容器。PDF/OCR与ScanSci仍被论文链路消费，生图API替换不能连带删除它们。Docker数据卷不清理。

| Docker存储类别 | 数量 / 活跃 | 当前 | Docker报告可回收 |
|---|---:|---:|---:|
| Images | 248 / 21 | 26.89GB | 8.861GB (32%) |
| Containers | 25 / 24 | 20.64MB | 0B (0%) |
| Local Volumes | 37 / 19 | 17.82GB | 0B (0%) |
| Build Cache | 67 / 0 | 2.07MB | 2.07MB |

“可回收”不等于可直接删除：运行/回滚、按需执行器和其他消费者仍需保护。旧release目录此前测得44.4GB；本轮整目录统计90秒超时，未把旧数伪装为新测量，也未重复扫描。
