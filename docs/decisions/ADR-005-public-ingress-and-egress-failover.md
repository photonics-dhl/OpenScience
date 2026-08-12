# ADR-005 公网入站与 ECS 出网故障切换边界

- 状态：Accepted
- 日期：2026-08-12
- 关联：`docs/handoff/2026-08-01-ops-monitoring-proxy-handoff.md`、`infra/scripts/proxy-tunnel.sh`、`infra/squid/openscience-egress.conf`

## 背景

OpenScience 公网入口必须在开发电脑关机、休眠、换网或 v2ray 重启时继续可用。同时，ECS 安装依赖、访问外部 API 和拉取镜像应优先使用已有 SSH 反向隧道，以减少阿里云出网流量，并在隧道不可用时回落直连。

2026-08-12 复核表明，公网 Nginx、Web 容器和 Chromium访问持续健康；特定 Windows Schannel 客户端的 TLS 握手失败发生在客户端/网络路径，不能通过重启生产服务解决。现有 `with-proxy` 已为普通命令提供回落，但 dockerd 静态指向 7890，隧道中断时无法拉取镜像。

## 决策

1. **入站独立。** 公网访客入口不得依赖本机 7890 或个人工作站。2026-08-12 起，具体公网入口由 ADR-006 的 ECS 常驻 Cloudflare Tunnel 承载；本 ADR 继续约束 ECS 出网故障切换。
2. **稳定出网入口。** ECS 上由 Squid 7 提供仅回环监听的 `127.0.0.1:7891`。所有需要统一代理策略的客户端指向 7891。
3. **隧道优先、直连回落。** Squid 把 `127.0.0.1:7890` 设为首选 parent；parent不可用时允许 DIRECT。7890 继续由现有 SSH reverse forward 提供。
4. **切换前实测。** 必须分别取得 `FIRSTUP_PARENT/127.0.0.1`（或等价 parent hierarchy）和 `DIRECT/...` 证据后，才允许切换 dockerd。
5. **开发隔离。** Optical visual prototype 在独立 worktree/no-index route 中迭代；用户视觉验收前不得同步或部署到生产 Hero。

## 后果

- 本机在线时 ECS 出网优先走家庭代理；本机离线时普通出网与 Docker pull 可直连，不需要重启 Docker。
- 阿里云 ECS 仍承载应用回源；公网边缘入口改由 ADR-006 的 Cloudflare Tunnel 承载。SSH 反向隧道仍不是 CDN、负载均衡或入站故障切换。
- Squid 成为 ECS 出网控制面，必须仅监听 loopback，并纳入巡检和回滚。

## 不采用

- 不把公网域名指向个人电脑或 SSH 隧道：这会把个人设备变成生产单点故障。
- 不通过隧道断线后修改 dockerd 配置并重启 Docker：会把出网故障扩大为应用停机。
- 不恢复 Tailscale：已验证会劫持阿里云 VPC DNS 网段。
