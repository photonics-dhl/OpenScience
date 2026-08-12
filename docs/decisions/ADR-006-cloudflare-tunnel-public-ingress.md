# ADR-006 Cloudflare Tunnel 公网入口

- 状态：Accepted
- 日期：2026-08-12
- 关联：`docs/decisions/ADR-005-public-ingress-and-egress-failover.md`、`docs/runbooks/cloudflare-tunnel.md`

## 背景

`openscience.428312321.xyz` 的权威 DNS 托管在 Cloudflare，但此前记录实际为 `A → 115.29.208.1`、`proxied=false`，并未使用 Cloudflare Tunnel。域名未备案且直接解析到阿里云中国内地 ECS；中国移动实机访问只到达 HTTP 301，随后 HTTPS 握手未进入 Nginx。ECS 本地回源与其他公网客户端同时保持健康，故障边界位于大陆直连域名的 TLS/SNI 入站路径。

## 决策

1. `openscience.428312321.xyz` 使用独立、远程管理的 Cloudflare Tunnel 作为公网入口。
2. `cloudflared` 常驻阿里云 ECS，以 systemd 开机启动、异常自动重连；连接由 ECS 直接出站到 Cloudflare，不依赖个人电脑或 SSH 7890 隧道。
3. Tunnel 回源到 ECS 现有 Nginx HTTPS 入口，保留 Nginx 的路由、认证、安全头和访问日志；不直接绕过 Nginx 访问 Web/API 容器。
4. DNS 原位从 DNS-only ECS A 记录切换为 proxied Tunnel CNAME。切换前记录精确回滚值；Tunnel 健康后才切 DNS。
5. Tunnel token 仅存服务器 root-only Secret 文件，权限 `0600`；不得进入仓库、命令行日志或 systemd unit 参数。
6. 阿里云公网 IP/80/443 暂时保留为运维回滚路径，但未备案域名的 ECS 直连不属于可用性承诺。长期应完成 ICP 备案或限制源站入站面。

## 后果

- 手机访客连接 Cloudflare 边缘，再由 ECS 的 outbound-only Tunnel 回源，避免未备案域名直接暴露到阿里云大陆入站 TLS 路径。
- 生产入站不再依赖开发电脑；本机 7890 仍只用于 ADR-005 定义的 ECS 普通出网优先路径。
- Cloudflare 和 ECS 上的 `cloudflared` 成为新增依赖，必须纳入状态、连接数、重连和 DNS 巡检。

## 不采用

- 不把 cloudflared 运行在个人电脑：会重新引入关机、休眠和换网单点故障。
- 不把 Tunnel 回源直接指向 Web 容器：会绕过 Nginx 的 API 路由和安全策略。
- 不将 DNS-only ECS 直连视为未备案场景下的自动 fallback：运营商或云平台可能在 TLS 建连前阻断。
