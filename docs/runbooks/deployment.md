# Runbook: 部署（Deployment）

> 状态：部分填充（P1A-8 补 API 反代 + /admin basic_auth 部署步骤；CI/CD 自动化归 2.9 填充 deploy.sh）。
> 格式遵循 `.agents/skills/infra-runbook/SKILL.md` 四节强制要求。
> 部署属 Spec §20.5"询问"级操作：执行前需用户确认，必须走 `infra/scripts/deploy.sh` + CI/CD，禁止手工改服务器代码。

## 1. 前置检查

- [ ] 目标 release ref 已 CI 绿灯（lint/typecheck/unit/build）
- [ ] 云上集成测试已全绿（`test:integration`，跑前全量 `build`）
- [ ] `agent-worker` 解析服务已包含在生产 compose，且 parser 依赖可在服务器 release 目录解析
- [ ] 巡检基线 `infra/scripts/checkup.sh` 无告警
- [ ] 备份确认（`docs/runbooks/backup-restore.md`）
- [ ] P1A-8 追加：API 反代 `infra/nginx/openscience.conf` 的 SSL 证书已签发（`~/.acme.sh`）

## 2. 执行步骤

### 2.1 同步代码（`scripts/cloud-sync.mjs`）

```bash
node scripts/cloud-sync.mjs
# tar-over-ssh 同步到 /opt/openscience；排除 .env/.git/node_modules/dist
# 隔离 worktree 部署时设置 XGS_CONFIG_ROOT=/e/Miscellaneous/XGS，服务器配置与 release 源码分离。
# 干净 release 预部署时设置 XGS_REMOTE_ROOT=/opt/openscience-next，先在 staging 目录 build 再切换。
```

### 2.2 安装依赖 + 全量构建（云上）

```bash
ssh-run.sh "cd /opt/openscience && npx pnpm@9.15.0 install && npx pnpm@9.15.0 build"
# 跨包 import 解析到目标包 dist，必须全量 build（AGENTS.md 坑）
```

### 2.3 迁移部署 + seed（如需）

```bash
ssh-run.sh "cd /opt/openscience && node packages/database/dist/migrate-cli.js deploy"
ssh-run.sh "cd /opt/openscience && node scripts/seed-quota.mjs --confirm"   # P1A-7 配额占位值
```

生产栈数据库没有宿主端口映射，实际执行必须通过 API 容器，并从服务器 `.env.prod` 注入容器内 `DATABASE_URL`；`infra/scripts/deploy.sh` 已封装该路径。

### 2.4 API 反代配置（首次上线或变更时）

```bash
# 1) 上传 nginx 配置到 /etc/nginx/conf.d/openscience.conf（经 ssh-run.sh 或 scp）
# 2) 签发证书——用 DNS-01（Cloudflare API），HTTP-01 被阿里云 403 拦（2026-08-03 实证）：
#    export CF_Token=<token> CF_Zone_ID=<zone-id>
#    ~/.acme.sh/acme.sh --issue -d OpenScience.428312321.xyz --dns dns_cf --server letsencrypt
#    ~/.acme.sh/acme.sh --install-cert -d OpenScience.428312321.xyz \
#      --key-file /etc/nginx/ssl/openscience/key.pem \
#      --fullchain-file /etc/nginx/ssl/openscience/fullchain.pem \
#      --reloadcmd "systemctl reload nginx"
# 3) /admin 强认证凭据（P1A-8，ADR-003）：
#    htpasswd -bc /etc/nginx/.htpasswd-admin <admin-user> '<强密码>'
#    chmod 640 /etc/nginx/.htpasswd-admin && chown root:nginx /etc/nginx/.htpasswd-admin
# 4) 配置生效：
#    nginx -t && systemctl reload nginx
```

### 2.5 启动 API（systemd 或 nohup）

```bash
# 服务单元（见 infra/ 说明）；env 从服务器 Secret 注入，不入库
ssh-run.sh "systemctl restart openscience-api"
```

### 2.6 验证 Hermes worker

```bash
ssh-run.sh "cd /opt/openscience && docker compose --env-file /opt/openscience/.env.prod -f infra/compose/docker-compose.prod.yml ps api web agent-worker postgres redis"
ssh-run.sh "cd /opt/openscience && docker compose --env-file /opt/openscience/.env.prod -f infra/compose/docker-compose.prod.yml logs --tail=100 agent-worker"
```

预期：`agent-worker` 为 `Up`，日志出现启动行，不出现 `Cannot find module`、Prisma schema 或 Redis 连接错误。

## 3. 回滚步骤

- 代码回滚：`node scripts/cloud-sync.mjs` 同步旧 release ref，重新 install + build，重启服务。
- nginx 回滚：恢复上一版 `openscience.conf`（`cp` 备份），`nginx -t && systemctl reload nginx`。
- 迁移回滚：`node packages/database/dist/migrate-cli.js status` 确认；破坏性迁移先备份（`docs/runbooks/backup-restore.md`）。
- 判定：`checkup.sh` 复跑 + API 健康检查（见 §4）。

## 4. 验证命令

- API 健康：compose healthcheck 以 `/auth/me` 的 401 为健康；`curl -sI https://OpenScience.428312321.xyz/auth/me` → 401（未登录，服务在）
- /admin 强认证：`curl -sI -u <admin-user> https://OpenScience.428312321.xyz/admin/` → basic_auth 放行后 401（API 层判未登录）或 200/403
- 安全响应头：`curl -sI https://OpenScience.428312321.xyz/auth/me` → 含 `X-Content-Type-Options: nosniff`、CSP `default-src 'none'`
- 限流：连续打 `/auth/login` 5+ 次 → 429 + `Retry-After`
- 巡检复跑：`infra/scripts/checkup.sh` 无新增告警
- worker 验证：按 §2.6 执行，确认 parser 依赖在服务器可加载；图片 OCR 服务未通过独立验收前不得解除生产门禁。
