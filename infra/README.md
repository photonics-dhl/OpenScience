# infra/ — 基础设施脚本与运维入口

单 ECS 阶段（阿里云，4核8G，Alibaba Cloud Linux，root 运维）的服务器管理脚本。
规范见 `.agents/skills/infra-runbook/SKILL.md`，runbook 见 `docs/runbooks/`。

## 脚本清单

| 脚本 | 用途 | 状态 |
|---|---|---|
| `scripts/ssh-run.sh` | 远程执行单条命令的**唯一入口**（BatchMode 密钥认证、危险命令黑名单需 `--confirm`） | 可用 |
| `scripts/checkup.sh` | 只读巡检：磁盘/内存/负载/Docker/服务状态/TLS 证书 | 可用 |
| `scripts/backup.sh` | 数据库/对象存储每日备份 | 骨架，Phase 1A 填充（P1A-*） |
| `scripts/deploy.sh` | 部署脚本 | 骨架，Phase 1A 填充（P1A-*） |
| `scripts/deploy-cloudflare-tunnel.ps1` | 幂等部署 ECS 常驻 Tunnel、固定健康 Edge 池并安装 watchdog | 已部署验证（2026-08-15） |
| `scripts/cloudflared-watchdog.sh` | 每分钟依据 HA metrics + 公网状态恢复 Tunnel，180 秒冷却 | 已部署验证（2026-08-15） |
| `systemd/cloudflared*.{service,timer}` | Tunnel 与 watchdog 的版本化 systemd 单元 | 已部署验证（2026-08-15） |

## 用法

```bash
# 只读巡检
bash infra/scripts/checkup.sh

# 远程单条命令（只读类直接执行）
bash infra/scripts/ssh-run.sh "df -h"

# 危险命令（rm|mv|dd|mkfs|shutdown|reboot|systemctl stop|disable）需显式确认
bash infra/scripts/ssh-run.sh --confirm "systemctl stop nginx"
```

服务器连接信息从项目根 `.env` 读取（英文键 `SERVER_HOST/SERVER_USER/SERVER_PORT` 优先，
中文键 `公网ip/用户名/SSH端口` 兜底）。**任何脚本都不会打印 .env 的键值。**

## 安全约束

- **只读默认**：巡检与日常查看只走 `ssh-run.sh` / `checkup.sh`；写操作命中黑名单必须 `--confirm`，且属 Spec §20.5"询问"级操作，需用户确认。
- **密钥认证唯一**：`BatchMode=yes`，脚本不处理密码；未配置密钥时报错"请配置 SSH 密钥"。
- **凭据不外泄**：凭据仅在脚本运行时从 `.env` 读取，绝不 echo/写日志。
- **备份不入上下文**（Spec §20.1-9）：备份文件与真实用户数据不得拉入本地 Kimi/Agent 上下文。
- **部署走脚本**（Spec §20.5）：禁止手工在服务器上改代码；不给 Agent 通用服务器写权限。

## 迁移路径

产品 Monorepo（Spec §14.1）建成后，本目录整体迁至 Monorepo 的 `infra/`，
`docs/runbooks/` 随迁移同步归位，迁移时更新 `project_index.md` 与本 README。

## Dev 栈（P1A-2）

- 一键起栈：`npx pnpm@9.15.0 stack:up`（postgres:5432 / redis:6379 / minio:9000+9001，均仅绑 127.0.0.1）。
- compose 文件：`infra/compose/docker-compose.dev.yml`；脚本自动在 `docker compose` 与 `docker-compose` 之间兜底。
- 凭据策略：compose 内联的 `*_dev` 默认值仅用于本机一次性开发数据，属用户批准的开发态豁免；生产部署（2.9）一律强制 env、无默认值。真实密钥仍只来自 `.env`/服务器 Secret。
- MinIO Console：http://127.0.0.1:9001（minioadmin / openscience_minio_dev），dev bucket `openscience-dev` 由 minio-init 自动创建。
