# Handoff — 2026-08-15 Cloudflare Tunnel egress incident

- Current goal: 保持 OpenScience 公网入口独立于个人电脑，并观察固定 SJC IPv4/HTTP2 Edge 池在阿里云杭州出口上的稳定性。
- Done:
  - 排除 CNAME、Tunnel token/ingress、Nginx、Web/API 与主机防火墙；确认故障是 XGS ECS 到部分 Cloudflare 7844 Edge 的路由不可达与自动选址失效。
  - 与 Ultron 线上 connector 对照，使用当前 XGS 版本在两条可达 Edge 上完成真实公网 200 证明；SJC `198.41.219.1-10` 三轮 TLS 探测均为 3/3。
  - 部署 `infra/systemd/cloudflared.service`、watchdog service/timer 与 `infra/scripts/cloudflared-watchdog.sh`；当前 HA=4、公网=200。
  - 公网 HEAD 12/12 为 200；跨 timer 周期 PID 不变。metrics 未就绪时重复 `0` 的 watchdog 缺陷已按 RED→GREEN 修复，门禁 4/4。
- Constraints: 不依赖个人电脑 replica；不改 Tunnel CNAME；token 继续只在 ECS root-only 文件；不删除 `/var/lib/openscience/incident-20260815/` 事故证据。
- Open risks: `--edge` 是针对当前阿里云→Cloudflare 部分路由异常的固定池措施；应持续观察 Edge 可达性，恢复自动选址前必须先做多轮 7844 与公网 soak。直接 proxied A 会被阿里云 ICP 页面拦截，不是可靠备援。
- Next action: 24 小时内检查 HA metrics、watchdog journal 与公网 5xx；若始终 HA≥3 且无重启，维持当前配置并记录观察结果。
- Read first: `AGENTS.md` → `docs/OpenScience_Kimi_Development_Spec.md` → `docs/decisions/ADR-006-cloudflare-tunnel-public-ingress.md` → `docs/progress.md` → `project_index.md` → 本 handoff。
