# Runbook: Cloudflare Tunnel 公网入口

> 状态：已部署并经中国移动实机验证（2026-08-12）。部署属于 Spec §20.5“询问”级操作，必须先取得用户确认。

## 1. 前置检查

- [ ] Cloudflare API token 为 active，且具备 Zone DNS Edit 与 Cloudflare Tunnel Edit。
- [ ] `openscience.428312321.xyz` 当前 DNS 记录类型、内容、代理状态和记录 ID 已保留为回滚证据。
- [ ] ECS `nginx`、Web/API 回源健康；`curl --resolve ...:443:127.0.0.1` 返回 200 且证书校验为 0。
- [ ] ECS 可访问 `region1.v2.argotunnel.com:7844`；磁盘空间与 systemd 正常。
- [ ] Tunnel token 只通过 stdin/Secret 文件传输，不出现在终端、日志、仓库或进程参数。

## 2. 执行步骤

1. 通过 Cloudflare API 创建远程管理 Tunnel `openscience-prod`。
2. 配置唯一公开主机名 `openscience.428312321.xyz`，回源为 `https://127.0.0.1:443`，并设置：
   - `originServerName: openscience.428312321.xyz`
   - `httpHostHeader: openscience.428312321.xyz`
   - 末尾 catch-all `http_status:404`
3. 在 ECS 安装官方 `cloudflared`，将 token 写入 `/etc/cloudflared/tunnel-token`（root:root，`0600`）。
4. 安装 `cloudflared.service`：开机启动、失败 5 秒重启、使用 `--token-file`，不把 token 放入 unit 或命令行。
5. 等待 Cloudflare API 报告 Tunnel `healthy` 且至少有两个边缘连接。
6. 原位把 DNS 记录切换为 `<tunnel-id>.cfargotunnel.com`、`proxied=true`；不得在 Tunnel 健康前切换。

## 3. 回滚步骤

1. 若公网验证失败，立刻将同一 DNS 记录恢复为：`A → 115.29.208.1`、`proxied=false`、TTL Auto。
2. 确认公共解析重新返回 `115.29.208.1`，并验证 Nginx 本地回源仍为 200。
3. 将 `cloudflared.service` 停止并禁用；保留服务、Secret 和 Tunnel 对象供根因复盘，不删除文件或远端对象。
4. 在 `docs/progress.md` 记录失败发生在哪个边界以及完整回滚验证。

## 4. 验证命令

- Cloudflare API：Tunnel 状态为 `healthy`，连接数不少于 2。
- DNS：公共 A/AAAA 返回 Cloudflare anycast 地址，不再暴露 `115.29.208.1`；记录为 proxied Tunnel CNAME。
- HTTP：响应包含 `cf-ray`；首页与静态资源连续请求均为 200。
- Origin：`curl --resolve openscience.428312321.xyz:443:127.0.0.1 ...` 仍为 200，Nginx 日志包含 Cloudflare 回源请求。
- 生命周期：`systemctl is-enabled/is-active cloudflared` 均成功；重启服务后 Tunnel 自动恢复 healthy。
- 实机：中国移动手机通过 `https://openscience.428312321.xyz/` 成功打开。
- 产品路由：Tunnel变更后的 Nginx 必须保留 `/api/` 前缀剥离与 `/auth/login`、`/auth/register` 页面精确分流；运行 `node --test infra/nginx/openscience.test.mjs`。
