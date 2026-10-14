# Runbook — 服务器监控面板（Netdata + vnStat）

> 2026-08-01 上线。**统一入口：`https://portainer.428312321.xyz/nav/`**（导航页）→
> `/monitor/`（实时面板）、`/traffic/`（流量账单），basic_auth 账号 `admin`，凭据独立于 Portainer 账号。

## 架构

| 组件 | 形态 | 位置 |
|---|---|---|
| 导航页 | 静态页（`infra/www/nav/index.html`） | `/var/www/nav/` |
| Netdata | 容器（compose project `openscience-monitor`） | 127.0.0.1:19999 |
| vnStat | 容器（alpine + vnstatd，host 网络，数据卷 `vnstatdb`） | 无端口，CLI 查询 |
| 账单页渲染 | 宿主机 cron 每 5 分钟跑 `/usr/local/bin/traffic-report.sh` | `/var/www/traffic/index.html` |
| 反代 | nginx `/nav/`、`/monitor/`、`/traffic/` 三个 location | `/etc/nginx/conf.d/portainer.conf` |
| 认证 | nginx basic_auth | `/etc/nginx/.htpasswd-monitor`（不入库） |
| 稳定出网代理 | Squid（配置源 `infra/squid/openscience-egress.conf`） | host `127.0.0.1:7891` + ScanSci-only internal retrieval gateway `172.24.0.1:7891`；ScanSci 仅 `.arxiv.org` 可进 parent，其他目标 DIRECT |
| 代理探测 | `/usr/local/bin/check-egress-path` | 输出 HTTP 状态与 Squid hierarchy |
| 公网入口 | ECS systemd `cloudflared` | Cloudflare Edge → Tunnel → loopback Nginx；独立于本机 7890 |

仓库侧源文件：`infra/compose/docker-compose.monitor.yml`、`infra/scripts/traffic-report.sh`、`infra/nginx/portainer.conf`。

## 监控权限收敛（源码候选；R05 仍待运行验收）

候选只挂 CPU/内存/磁盘 I/O/接口计数需要的 `/proc/{stat,meminfo,vmstat,diskstats,loadavg,uptime,net/dev}` 文件与 CPU sys metadata；不挂整棵 `/proc`、`/sys` 或主机根目录，不共享 PID。`/host/root` 改挂 root-owned、`0555`、同根文件系统的空目录 `/opt/monitor/root-filesystem`，只供容量 statvfs。原 `/:/host/root:ro` 会经 `/host/root/run/docker.sock` 留下 Docker API 别名，整棵 proc 又有 PID/root magic links；只移除显式 socket 并不足以收口，候选一并消除这些目录入口。既有 SMTP mount/配置卷保留，额外 `SYS_ADMIN/SYS_PTRACE` 与 unconfined 移除，改用 init。Docker/进程/容器 namespace 采集不在这次基础 charts 范围，容器管理沿已有 Portainer；不能从 YAML 推断图表仍正常。

[Netdata 官方 proc 输入](https://github.com/netdata/netdata/blob/master/src/collectors/proc.plugin/README.md)、[mountinfo reader](https://github.com/netdata/netdata/blob/master/src/collectors/proc.plugin/proc_self_mountinfo.c) 与 [diskspace collector](https://github.com/netdata/netdata/blob/master/src/collectors/diskspace.plugin/plugin_diskspace.c)（2026-10-14 核对）支持这个源码推论：reader 在 host-root mountinfo 不存在时回退到 `/host/proc/self/mountinfo`，按记录的 mount-point 调 statvfs。因此 `prepare-monitor-view.py` 只生成主机 `/` 的单条 mount metadata，将容量路径指向 `/host/root`；不把 kernel mountinfo 或主机文件树塞入探针目录。其图表标识可能从旧 `/` 改为 `/host/root`，stock `disk.space` 容量告警需实测继续注册和投递。

Root 启动仍保留：[官方 entrypoint](https://github.com/netdata/netdata/blob/master/packaging/docker/run.sh) 会初始化 `/etc/netdata` stock 配置、写容器 hostname 后再切用户；[官方 Docker 文档](https://learn.netdata.cloud/docs/netdata-agent/installation/docker) 不支持直接指定 `user:`。现有配置卷与 `/opt/monitor/msmtprc` root-owned `0600` 的 SMTP 访问边界也未完成非 root 迁移。本轮不猜实际镜像/卷 owner、运行身份或盲目 drop 全部默认 cap；精确 image 与 SMTP 访问仍待核。候选仍能读专门授权的 SMTP credential，不能说所有 Secret 不可读；它移除的是主机其他 runtime/socket 和根文件树入口，不另建 daemon/proxy。

### 前置检查与执行

1. 单独安排 monitor 重建窗口，保存已安装 Compose 与原镜像 ID/RepoDigest、卷名、告警配置权限；不显示 `/opt/monitor/msmtprc` 或 notification 文件。确认原镜像本地保留可回退。在既有 `/opt/monitor` 私有目录中，先通过项目 SSH 边界运行同版本 `python3 <release>/infra/scripts/prepare-monitor-view.py --confirm`，再 `--check`。它只创建/校验空容量目录与非敏感 metadata，不停服务；拒绝 symlink、非 root owner、组/世界可写目录、非空/异 device 探针与 metadata 漂移，不清文件或 chmod 已有目录来强制放行。探针不允许承载其他数据；每次重建先检查，主机 root mount 改变时需重新生成单条 metadata。Compose `create_host_path:false` 拒绝自动造缺失路径。
2. 只读 `docker image inspect <实际镜像ID> --format '{{json .RepoDigests}}'`，核对实际 RepoDigest 与本地缓存；不要猜 digest、用 image config ID 或发布 SHA 代替。2026-10-14 元数据调查取得 `netdata/netdata@sha256:689145f603fed0ca341b4d8a0fb9910cd9d8c0590b0530cd24ae1912a9c7f8f3`，候选 Compose 默认固定为它，未拉镜像或改生产。原 stable 可变标签不能确保重建沿用已检查的 collector/entrypoint，因此移除该默认回退；若维护时已有新的实测摘要，通过私有操作配置的 `NETDATA_IMAGE` 指定同一已保留 cached image，再重做其必要运行验收。固定摘要只证明镜像内容身份，不能代替卷内配置、SMTP、运行用户和图表观察。
3. 仅在核定相同 cached image 与权限配置后，沿既有 monitor Compose 重建 `netdata`，使用 `--pull never --no-deps`；保留三监控卷和 vnStat。不要使用 `down -v`。SMTP 安装在当前 image 的事实及镜像可回退须当次核对，不能随便切到干净上游 stable 后假定 msmtp 存在。

### 回滚步骤与验证

原 Compose/镜像值原位恢复，`up -d --pull never --no-deps netdata`，保留原卷与 SMTP 权限；回到原 full-root Compose 也回到原已知风险，不声称安全控制仍在。候选与回退分别核 CPU、RAM、根盘容量/剩余、eth0 流量 chart 时间戳与少量采样；比较探针 statvfs 的容量/可用块与主机 `/`，核新的 rootFS chart 上 stock 告警仍注册、SMTP mount 可访问、通知路由保持。候选实际 inspect 不得有 `/`/整棵 proc/sys、host PID、daemon socket mount；从容器确认 `/host/root/run/docker.sock`、`/host/root/var/run/docker.sock`、`/host/proc/1/root` 等别名不存在，不调用任何 Docker 写 API。真实测试发信属于已有运维授权内的单次必要投递，未授权不发；不以 healthy 代替图表/告警验收。最后从原导航点入 monitor，核匿名拒绝与认证后图表加载，不保存凭据或容器 env。实际 image/权限/指标文件绑定、图表、告警与认证未核前，R05 保持候选、未关闭。

## 扫描器与数据网络分离（R06，源码候选）

前置检查：安排单独网络重建维护窗口并查原部署/回退说明；保留旧 Compose/镜像/卷和当前 network inspect 元数据。确认无正在提交的上传或任务，API/Worker `app_net` 及既有 proxy 路径可达。只改 YAML 不会改变运行中网络。

执行：沿既有发布事务在该窗口重建网络，`data_net` 改 internal；API/Worker 新接 internal `scan_net`，ClamAV 仅接 `scan_net` 和专用 `scanner_update_net` 更新出口，不再接数据网。API/Worker 保留 app_net/provider 出口，parser/embedding/retrieval 网络保持原隔离。Compose 不能原位把现有 network 的 internal 属性切换；未经窗口不得常规 `up` 碰运气或手工 disconnect 活跃生产容器。

回滚：恢复此前精确 release/Compose 的网络定义，通过同一维护窗口重建旧网络，保留 DB/对象/ClamAV 数据卷，不删除业务数据或迁移账本；按原发布守卫重启并核最小产品路径。

验证：inspect 应显示 data/scan internal，scanner 只接 scan/update；以少量已有上传检查 API/Worker 到 3310 的扫描，核病毒库更新成功与实际日期。受控 scanner→Postgres/Redis/S3 连接应失败，API/Worker→数据/扫描成功；核既有 Gateway/proxy 可达但不为验证发起模型付费请求。无生产网络重建及上述实际观察证据前，R06 只记候选。

## 部署 / 重建步骤

1. 上传 compose：`scp infra/compose/docker-compose.monitor.yml` → `/opt/monitor/docker-compose.monitor.yml`
2. 起栈：`cd /opt/monitor && docker compose -f docker-compose.monitor.yml up -d`
3. 上传渲染脚本 → `/usr/local/bin/traffic-report.sh`（+x），cron 行在 `/etc/cron.d/traffic-report`
4. 上传 nginx conf → `/etc/nginx/conf.d/portainer.conf`，`nginx -t && systemctl reload nginx`
5. 验证：`curl -u monitor:<密码> https://portainer.428312321.xyz/traffic/`

注意：2026-08-12 实测服务器 TLS 1.2/1.3、OpenSSL 与 Chromium均正常；部分 Windows Schannel curl 在本机网络路径握手失败，不能把该客户端结果单独当作服务器宕机证据。

## ECS 出网代理部署

### 前置检查

1. `ss -ltnp | grep 127.0.0.1:7890`：SSH reverse forward 正在监听。
2. `curl -x http://127.0.0.1:7890 --max-time 8 https://www.gstatic.com/generate_204`：返回 204。
3. `curl --noproxy '*' --max-time 8 https://www.gstatic.com/generate_204`：阿里云直连 fallback 返回 204。

### 执行步骤

1. 安装发行版 Squid 7：`dnf install -y squid`。
2. 备份 `/etc/squid/squid.conf`，部署 `infra/squid/openscience-egress.conf`。
3. `squid -k parse` 通过后 `systemctl enable --now squid`。
4. 确认 `ss -ltnp` 只显示 `127.0.0.1:7891` 与 `172.24.0.1:7891`，不得出现 `0.0.0.0:7891`、`[::]:7891` 或其他接口。
5. 运行 `/usr/local/bin/check-egress-path`；在线隧道应报告 parent hierarchy。
6. 先由 `docker network inspect` 证明 retrieval network 为 `Internal=true`、subnet `172.24.0.0/24`、gateway `172.24.0.1`；再从该网络证明代理 TCP peer 为 `172.24.0.1:7891`、CONNECT 443 成功，并证明 HTTP、非 443、`127/8`、`10/8`、`100.64/10`、`169.254/16`、`100.100.100.200` 和 IPv6 私网/metadata 等目标全部被 Squid 拒绝，且 raw `1.1.1.1:443` 直连失败。容器必须仍无 host port。
7. 用独立测试实例把 parent 指向不可用端口，确认同一 probe 报 DIRECT；不得为演练停止真实隧道。
8. 三条路径均通过后，方可把 dockerd代理改为 `127.0.0.1:7891`。若需要重启 Docker，另开维护窗口确认，不能在本步骤顺带执行。

### 回滚步骤

1. dockerd 尚未切换时：`systemctl disable --now squid`，恢复原始 `/etc/squid/squid.conf`。
2. dockerd 已切换时：先恢复其 drop-in 到 `127.0.0.1:7890`，`systemctl daemon-reload`；若必须重启 Docker，按维护窗口执行并逐容器核验。
3. 保留 7890 SSH 隧道与计划任务，不卸载或重建 v2ray。

### 验证命令

- `check-egress-path` → `egress_http=204`，并输出 parent 或 DIRECT hierarchy；ScanSci 容器路径另需记录 internal IPAM、proxy TCP/CONNECT allow、受限目标 deny 与 raw direct deny 证据。
- `infra/scripts/checkup.sh` → Nginx/Docker active，生产容器无新增 restart。
- Chromium 连续 20 次访问 `https://openscience.428312321.xyz/` → 全部 HTTP 200。
- Nginx 最近请求无新增 499/5xx。

## 常用查询

- Tunnel：`systemctl status cloudflared cloudflared-watchdog.timer`；`curl -fsS http://127.0.0.1:49312/metrics | grep cloudflared_tunnel_ha_connections` 应为 3 或 4，Cloudflare API/控制台应显示 `openscience-prod` healthy。
- 公网入口：`curl -sSI https://openscience.428312321.xyz/` 应返回 200，并包含 `server: cloudflare` 与 `cf-ray`。

- 本月流量（账单口径，上行 tx 为计费方向）：
  `docker exec vnstat vnstat -i eth0 -m`
- 实时速率：Netdata 面板 → Network Interfaces → eth0

## 改 basic_auth 密码

```bash
printf 'monitor:%s\n' "$(openssl passwd -apr1 '<新密码>')" > /etc/nginx/.htpasswd-monitor
```

## 排障

- `/traffic/` 显示"暂不可用"：多为 vnstat 容器未起或刚起（数据库为空）。查 `docker ps`、`docker logs vnstat`；
  手动重渲染：`/usr/local/bin/traffic-report.sh`。
- `/monitor/` 502：Netdata 容器未起；`docker logs netdata`。
- `/monitor/` 显示 "Something went wrong"：多为反代把查询串丢了——`proxy_pass` 带变量时 nginx **不会**自动
  追加 query string，必须 `$ndpath$is_args$args`（本配置已含，勿回退）。
- vnStat 数据归零：数据在 docker 卷 `vnstatdb`，删卷才会丢；重建容器不丢。
- **拉镜像代理**：完成 ADR-005 切换后，dockerd 指向 Squid 7891；Squid优先 7890 隧道并在不可用时 DIRECT。切换前的旧状态仍是 dockerd直接指向 7890，断线时 pull 会失败。
- **OpenScience 手机端打不开**：先查公共 DNS 是否返回 Cloudflare anycast，而非 `115.29.208.1`；再查 `cloudflared` 是否 healthy。仅“域名 NS 在 Cloudflare”不能证明已使用 Tunnel。
- **Tunnel 502/530/1033 但源站健康**：查 HA metrics 与 `journalctl -u cloudflared`。若出现 QUIC `no recent network activity`，分别测试 TCP/UDP 7844；2026-08-15 实证为阿里云到部分 LAX Edge 不可达，生产已固定到三轮验证通过的 SJC IPv4/HTTP2 池。不要改 CNAME，也不要把 connector 迁到个人电脑。
- **HA 连接正常但公网失败**：原 watchdog 增加对同一 `PUBLIC_URL` 的源站判断，使用 `--resolve openscience.428312321.xyz:443:127.0.0.1 --noproxy '*'`，保持正常 TLS/SNI 校验。源站同样失败时保留隧道并记录 `origin unhealthy`；源站正常而公网失败才按原冷却规则恢复隧道。HA 少于原下限仍沿原恢复路径。源站检查失败不是源站健康证据，不关闭 TLS 校验。
- **2026-09-28 02:05 UTC 事故**：四条 Edge 连接断开后自动恢复；同一时段 API 约 4 GiB V8 堆耗尽，内容管理接口对 206 项媒体分别读取约 30 MB 公开记录，形成重复分配。应用修复在单次请求共享引用闭包并限制并发，不改公开冻结记录或删除授权。此前一天五次 `HA=4/public502` 的隧道重启不能修复源站问题；具体发布与实际观察见 Hermes CURRENT。
- **watchdog 更新/回退**：保留 `/usr/local/sbin/openscience-cloudflared-watchdog` 的原内容、owner/mode，原子替换已提交脚本；原 timer 下一次运行生效，不重启 cloudflared。回退同样原子恢复备份，不改 timer/代理/账号。确认脚本版本、下一次 timer 结果与隧道 PID；不能把一次 HTTP 200 称为长期稳定。
- **Tailscale 与阿里云内网冲突（2026-08-01 实测）**：tailscaled up 会劫持 `100.64.0.0/10` 路由，
  而阿里云 VPC 内部 DNS（100.100.2.136/138）恰在该段 → 全机 DNS 瘫痪、yum/apk 不可用。
  当日已完全卸载（包/服务/repo/状态目录），不要再在这台服务器上安装 Tailscale。

## 告警投递（2026-09-17 补接，此前为静默）

**背景**：根盘曾达 112G/148G=80% 而无任何通知送达。实测三套已装工具均覆盖不到：Netdata 有内置
`disk_space_usage` 告警（warn >80%、crit >90% 且可用<5G）却**没有通知渠道**——`health_alarm_notify.conf`
不存在，镜像默认 `SEND_EMAIL="AUTO"` 需要容器内有 MTA，其余渠道默认 `YES` 但无 token；`/var/lib/netdata/health/`
为空即"求值后丢弃"的证据。Portainer 是手动面板；`openscience-private-cleanup.timer` 只管经授权的私有作业副本，
对 release/镜像/日志/卷无管辖范围。另 journald 原先无 size 上限（已设 `SystemMaxUse=500M`）。

**已建成链路**：

- 传输：`/opt/monitor/msmtprc`（0600，由服务器端脚本从 `/opt/openscience/.env.prod` 的
  `SMTP_HOST/PORT/USER/PASS` 生成；**含凭据，不得入 git、不得拷进任何 release 目录**）。端口 465 用
  `tls_starttls off`，其余 `on`。经 `/opt/monitor/docker-compose.monitor.yml` 以
  `- /opt/monitor/msmtprc:/etc/msmtprc:ro` 挂入 netdata 容器，重建容器后仍生效。
  容器内 `/usr/sbin/sendmail` 是 msmtp 的软链，故 netdata 邮件路径可用。
- 路由：`/var/lib/docker/volumes/openscience-monitor_netdataconfig/_data/health_alarm_notify.conf`
  （即容器内 `/etc/netdata/health_alarm_notify.conf`）设 `SEND_EMAIL="YES"`、`EMAIL_SENDER`（SMTP 账号）、
  `DEFAULT_RECIPIENT_EMAIL`，并把内置磁盘告警的 role `sysadmin` 显式路由到同一地址
  （`role_recipients_email[sysadmin]`）。**收件人配置在服务器端该文件内，不写入本仓库**（仓库公开，避免记录个人邮箱）。
- 验证：`docker exec netdata /usr/libexec/netdata/plugins.d/alarm-notify.sh test` 已实发三封
  （WARNING/CRITICAL/CLEAR）并回 `sent email to ...`、exit 0；`msmtp --serverinfo` 亦通过（仅连接与认证，不发信）。
- 保留期：netdata 原为镜像默认 3 层×1024MiB（约 3GB，tier0 存 14 天）。已在
  `openscience-monitor_netdataconfig` 卷的 `netdata.conf` 写 `[db] storage tiers = 1`、
  `dbengine tier 0 retention size = 512MiB`、`dbengine tier 0 retention time = 7d`。
  **dbengine 不会立即缩容**，按上限逐步回收。

### 已知限制：本镜像不读取用户 `health.d`（2026-09-17 实测）

想加一条"剩余空间绝对值"告警时发现：在 `/etc/netdata/health.d/`（即 netdataconfig 卷）放自定义告警
**不会生效**。四次实测：写入后 restart 未注册；把告警简化到最小形式（去掉 `chart labels` 与 `calc`）仍未注册；
用 `netdata -W reload-health` 重载失败（该选项不存在，重载 health 的信号是 **USR2**）；在 `netdata.conf`
显式写 `[health] enabled = yes` 与 `[directories] health config = /etc/netdata/health.d` 后仍为 0 条注册。
确证：netdata 日志加载 stock 配置时路径固定为 `file=/usr/lib/netdata/conf.d/health.d/...`（stock 侧 131 个配置
正常生效），`/var/log/netdata/error.log` 为空、无解析报错——即**用户 health.d 根本未被读取**。
该实验文件已删除，`netdata.conf` 恢复为仅保留期配置。

后果：只能使用 stock 阈值（`disks.conf` 的 `disk_space_usage`：warn >80%；crit >90% **且** 可用 <5G）。
在 148G 盘上 crit 实际不可达，**80% warn 是可行动的那一档，而它现在会真正发信**。
若要绝对空间告警或更早阈值，需换用非 user-health.d 的机制（例如让 `disk-cache-maintenance` 自身带阈值检查），
不要在 `health.d` 上重复投入。

### 定期缓存维护（2026-09-17 起）

`openscience-disk-cache-maintenance.timer` 每日运行 `disk-cache-maintenance.sh`：回收 docker build cache、
dangling 镜像与超限 journal，并**只读报告**历史 release 的数量与体积。它**不**回收历史 release
（`production-release-retention.mjs` 按要求绑定发布事务、不作独立清理入口；历史清理仍需用户授权并留收据，
流程见 [deployment runbook](deployment.md)）。

受控安装／漂移检查（版本源头是仓库，服务器是安装副本）：

```bash
# 只读：报告本地版本化文件的 sha256 与服务端已安装文件的 sha256，并列出 timer 状态
XGS_CONFIG_ROOT=/e/Miscellaneous/XGS \
  bash .worktrees/onchip-video-release/infra/scripts/install-disk-cache-maintenance.sh

# 部署：备份到 /var/lib/openscience/*.pre-deploy，bash -n + systemd-analyze verify 后才 enable，
#       随后 SHA-256 读回比对，不一致即 DRIFT_DETECTED 并 exit 70
XGS_CONFIG_ROOT=/e/Miscellaneous/XGS \
  bash .worktrees/onchip-video-release/infra/scripts/install-disk-cache-maintenance.sh --confirm
```

排查运行：`systemctl list-timers openscience-disk-cache-maintenance.timer`、
`journalctl -u openscience-disk-cache-maintenance.service -n 30`。

## 安全说明

- Netdata 只绑 127.0.0.1，公网唯一入口是带 basic_auth 的 nginx 路径。
- 当前旧部署的 socket/PID/capability 权限是历史运行事实；上方候选使用单文件指标与空 rootFS 探针，移除 full-root/proc/socket 别名。部署与真实观察以 CURRENT 为准。
- vnStat 容器用 host 网络仅为读网卡计数器，不监听任何端口。
- 历史统计口径：宿主 `du` 必须加 `-x`。旧 netdata 把宿主 `/` 只读挂到 `/host/root`，未加 `-x` 会递归进整个宿主
  文件系统，把 `/var/lib/docker` 从真实 38G 虚报为 67G（2026-09-17 实测）。
- `query_profiler_*` 属 *user-level* 设置，写进 ClickHouse config.d 会让容器启动失败
  （`Code: 137 UNKNOWN_ELEMENT_IN_CONFIG`），须置于 users.xml 的 `<profiles>`；开发栈改用表级 TTL。
