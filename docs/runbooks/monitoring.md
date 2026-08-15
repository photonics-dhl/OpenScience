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
| 稳定出网代理 | Squid（配置源 `infra/squid/openscience-egress.conf`） | 127.0.0.1:7891；优先 parent 7890，失效时 DIRECT |
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
4. 确认 `ss -ltnp` 仅显示 `127.0.0.1:7891`，不得出现 `0.0.0.0:7891` 或 `[::]:7891`。
5. 运行 `/usr/local/bin/check-egress-path`；在线隧道应报告 parent hierarchy。
6. 用独立测试实例把 parent 指向不可用端口，确认同一 probe 报 DIRECT；不得为演练停止真实隧道。
7. 两条路径均通过后，方可把 dockerd代理改为 `127.0.0.1:7891`。若需要重启 Docker，另开维护窗口确认，不能在本步骤顺带执行。

### 回滚步骤

1. dockerd 尚未切换时：`systemctl disable --now squid`，恢复原始 `/etc/squid/squid.conf`。
2. dockerd 已切换时：先恢复其 drop-in 到 `127.0.0.1:7890`，`systemctl daemon-reload`；若必须重启 Docker，按维护窗口执行并逐容器核验。
3. 保留 7890 SSH 隧道与计划任务，不卸载或重建 v2ray。

### 验证命令

- `check-egress-path` → `egress_http=204`，并输出 parent 或 DIRECT hierarchy。
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

## 安全说明

- Netdata 只绑 127.0.0.1，公网唯一入口是带 basic_auth 的 nginx 路径。
- 容器通过 `/host/proc`、`/host/sys` 只读挂载采集宿主机指标，挂载 docker.sock 只读用于容器清单。
- vnStat 容器用 host 网络仅为读网卡计数器，不监听任何端口。
