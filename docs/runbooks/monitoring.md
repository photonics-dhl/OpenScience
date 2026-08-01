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
| 代理兜底 | `/usr/local/bin/with-proxy <cmd>`（源文件 `infra/scripts/with-proxy.sh`） | 隧道失效自动回落直连 |

仓库侧源文件：`infra/compose/docker-compose.monitor.yml`、`infra/scripts/traffic-report.sh`、`infra/nginx/portainer.conf`。

## 部署 / 重建步骤

1. 上传 compose：`scp infra/compose/docker-compose.monitor.yml` → `/opt/monitor/docker-compose.monitor.yml`
2. 起栈：`cd /opt/monitor && docker compose -f docker-compose.monitor.yml up -d`
3. 上传渲染脚本 → `/usr/local/bin/traffic-report.sh`（+x），cron 行在 `/etc/cron.d/traffic-report`
4. 上传 nginx conf → `/etc/nginx/conf.d/portainer.conf`，`nginx -t && systemctl reload nginx`
5. 验证：`curl -u monitor:<密码> https://portainer.428312321.xyz/traffic/`

注意：服务器 nginx 仅 TLS 1.3；Git Bash 自带 curl 握手会失败（exit 35），用浏览器或 `openssl s_client` 验证。

## 常用查询

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
- **拉镜像必须走隧道**：dockerd 代理 drop-in 在 `/etc/systemd/system/docker.service.d/http-proxy.conf`
  （指向 127.0.0.1:7890，即本机 v2ray 反向隧道）；隧道断开时 pull 会失败，先恢复隧道再拉。
- **Tailscale 与阿里云内网冲突（2026-08-01 实测）**：tailscaled up 会劫持 `100.64.0.0/10` 路由，
  而阿里云 VPC 内部 DNS（100.100.2.136/138）恰在该段 → 全机 DNS 瘫痪、yum/apk 不可用。
  当日已完全卸载（包/服务/repo/状态目录），不要再在这台服务器上安装 Tailscale。

## 安全说明

- Netdata 只绑 127.0.0.1，公网唯一入口是带 basic_auth 的 nginx 路径。
- 容器通过 `/host/proc`、`/host/sys` 只读挂载采集宿主机指标，挂载 docker.sock 只读用于容器清单。
- vnStat 容器用 host 网络仅为读网卡计数器，不监听任何端口。
