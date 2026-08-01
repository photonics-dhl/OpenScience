# Handoff — 2026-08-01 运维底座补充：出网通道 + 监控面板（P1A-6 前）

- Current goal: 不变——Phase 1A 平台底座，下一任务仍是 P1A-6 审计日志（task-master 2.6，先 design gate）。本文件只补充 2026-08-01 下午的运维层变更，主交接仍为 `2026-08-01-p1a-5-cloud-done-handoff.md`。
- Done:
  - 出网通道选型实测定案：**SSH 反向隧道**（服务器 127.0.0.1:7890 → 本机 v2ray）；soak 15/15 全通、吞吐≈直连。Tailscale 方案否决：DERP 中继 12KB/s，且劫持 `100.64.0.0/10` 撞阿里云 VPC 内部 DNS 致全机 DNS 瘫痪，**已完全卸载，勿再装**（AGENTS.md 有禁令）
  - 隧道常驻化：本机 Windows 计划任务 `OpenScience-ProxyTunnel`（登录自启 + 断线 5s 重连，实测 35s 自愈），源文件 `infra/scripts/proxy-tunnel.{sh,vbs}`
  - 监控面板：`https://portainer.428312321.xyz/nav/` 统一入口 → `/traffic/`（vnStat 账单，中文）+ `/monitor/`（Netdata 实时，仅英文）；basic_auth 账号 admin（密码用户自设，凭据云上 `/etc/nginx/.htpasswd-monitor`，不入库）
  - 兜底：`with-proxy <cmd>`（云上 `/usr/local/bin/`）隧道失效自动回落直连；dockerd 代理在 daemon 层（drop-in），隧道断则 pull 失败属预期
  - 提交：`6ba730b`（监控+通道定案）`1bc62be`（隧道常驻化），已 push origin/main
- Constraints: dockerd 拉镜像必须隧道活着；服务器 nginx 仅 TLS 1.3（Git Bash curl 必失败，用浏览器验证）；云上写操作仍需用户逐次确认；其余约束同主 handoff
- Open risks:
  - 隧道依赖本机开机 + v2ray 运行；本机关机则服务器代理失效（with-proxy 自动回落，docker pull 会失败——先恢复本机）
  - vnStat 数据从 2026-08-01 13:00 起累计，此前流量无记录
  - Netdata 首次打开点 "Skip and use the dashboard anonymously" 跳过 Cloud 登录
  - 工作区仍有既有未跟踪/修改项（`.npmrc` 删除、`npx_stderr.txt`、`.memory/`），非本次范围，未动
- Next action: P1A-6 审计日志（task-master 2.6）：brainstorming → design spec（用户逐节确认）→ writing-plans
- Read first: `AGENTS.md` → 主 handoff（2026-08-01-p1a-5）→ `docs/runbooks/monitoring.md` → `docs/progress.md` 置顶条目 → `project_index.md`
