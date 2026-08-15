# Runbook: Cloudflare Tunnel 公网入口

> 状态：已部署并经中国移动实机验证（2026-08-12）；2026-08-15 完成 7844 部分路由事故修复。部署属于 Spec §20.5“询问”级操作，必须先取得用户确认。

## 1. 前置检查

- [ ] Cloudflare API token 为 active，且具备 Zone DNS Edit 与 Cloudflare Tunnel Edit。
- [ ] `openscience.428312321.xyz` 当前 DNS 记录类型、内容、代理状态和记录 ID 已保留为回滚证据。
- [ ] ECS `nginx`、Web/API 回源健康；`curl --resolve ...:443:127.0.0.1` 返回 200 且证书校验为 0。
- [ ] ECS 可访问 Cloudflare Tunnel TCP/7844；不得只测 API 443。当前生产池为经三轮 TLS 验证的 SJC `198.41.219.1-10:7844`。
- [ ] Tunnel token 只通过 stdin/Secret 文件传输，不出现在终端、日志、仓库或进程参数。

## 2. 执行步骤

1. 通过 Cloudflare API 创建远程管理 Tunnel `openscience-prod`。
2. 配置唯一公开主机名 `openscience.428312321.xyz`，回源为 `https://127.0.0.1:443`，并设置：
   - `originServerName: openscience.428312321.xyz`
   - `httpHostHeader: openscience.428312321.xyz`
   - 末尾 catch-all `http_status:404`
3. 在 ECS 安装官方 `cloudflared`，将 token 写入 `/etc/cloudflared/tunnel-token`（root:root，`0600`）。
4. 从 `infra/systemd/cloudflared.service` 安装 unit：固定 IPv4/HTTP2 与验证过的 Edge 池，开机启动、失败 5 秒重启、使用 `--token-file`，不把 token 放入 unit 或命令行。
5. 安装 `infra/scripts/cloudflared-watchdog.sh` 与 `infra/systemd/cloudflared-watchdog.{service,timer}`；指标只监听 `127.0.0.1:49312`，timer 每分钟检查 HA 与公网状态，重启冷却为 180 秒。
6. 等待 metrics 与 Cloudflare API 均报告 Tunnel healthy，HA 不少于 3；公网必须为 200/304。
7. 原位把 DNS 记录切换为 `<tunnel-id>.cfargotunnel.com`、`proxied=true`；不得在 Tunnel 健康前切换。

## 3. 回滚步骤

1. connector 配置回归时，先停用 `cloudflared-watchdog.timer`，把事故前 unit 备份恢复到 `/etc/systemd/system/cloudflared.service`，执行 `daemon-reload` 与 restart。
2. 验证旧 unit、loopback Nginx 与应用状态；保留服务、Secret、候选和 Tunnel 对象供根因复盘，不删除文件或远端对象。
3. 只有 Tunnel 长时间完全不可恢复时才考虑 DNS 回退。`A → 115.29.208.1` 会受阿里云未备案域名 ICP 拦截，不能再假设它是稳定回滚入口。
4. 在 `docs/progress.md` 记录失败发生在哪个边界以及完整回滚验证。

## 4. 验证命令

- Metrics：`curl -fsS http://127.0.0.1:49312/metrics | grep cloudflared_tunnel_ha_connections` 应为 3 或 4。
- Cloudflare API：Tunnel 状态为 `healthy`，连接数不少于 3。
- DNS：公共 A/AAAA 返回 Cloudflare anycast 地址，不再暴露 `115.29.208.1`；记录为 proxied Tunnel CNAME。
- HTTP：响应包含 `cf-ray`；首页与静态资源连续请求均为 200。
- Origin：`curl --resolve openscience.428312321.xyz:443:127.0.0.1 ...` 仍为 200，Nginx 日志包含 Cloudflare 回源请求。
- 生命周期：`cloudflared` 与 `cloudflared-watchdog.timer` 的 enabled/active 均成功；跨越一个 timer 周期后健康 connector PID 不应变化。
- 实机：中国移动手机通过 `https://openscience.428312321.xyz/` 成功打开。
- 产品路由：Tunnel变更后的 Nginx 必须保留 `/api/` 前缀剥离与 `/auth/login`、`/auth/register` 页面精确分流；运行 `node --test infra/nginx/openscience.test.mjs`。
- 配置合同：运行 `node --test infra/scripts/cloudflared-resilience.test.mjs`，并执行 `bash -n infra/scripts/cloudflared-watchdog.sh`。
