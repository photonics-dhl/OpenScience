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
- 容器通过 `/host/proc`、`/host/sys` 只读挂载采集宿主机指标，挂载 docker.sock 只读用于容器清单。
- vnStat 容器用 host 网络仅为读网卡计数器，不监听任何端口。
- 统计口径：宿主 `du` 必须加 `-x`。netdata 把宿主 `/` 只读挂到 `/host/root`，未加 `-x` 会递归进整个宿主
  文件系统，把 `/var/lib/docker` 从真实 38G 虚报为 67G（2026-09-17 实测）。
- `query_profiler_*` 属 *user-level* 设置，写进 ClickHouse config.d 会让容器启动失败
  （`Code: 137 UNKNOWN_ELEMENT_IN_CONFIG`），须置于 users.xml 的 `<profiles>`；开发栈改用表级 TTL。

