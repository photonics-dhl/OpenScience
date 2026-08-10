# Runbook: 部署（Deployment）

> 状态：部分填充（P1A-8 补 API 反代 + /admin basic_auth 部署步骤；CI/CD 自动化归 2.9 填充 deploy.sh）。
> 格式遵循 `.agents/skills/infra-runbook/SKILL.md` 四节强制要求。
> 部署属 Spec §20.5"询问"级操作：执行前需用户确认，必须走 `infra/scripts/deploy.sh` + CI/CD，禁止手工改服务器代码。

## 1. 前置检查

- [ ] 目标 release ref 已 CI 绿灯（lint/typecheck/unit/build）
- [ ] 云上集成测试已全绿（`test:integration`，跑前全量 `build`）
- [ ] `agent-worker` 解析服务已包含在生产 compose，且 parser 依赖可在服务器 release 目录解析
- [ ] `object-storage` 使用固定版本/摘要，仅在 `data_net`，`seaweed-data` 命名卷存在
- [ ] `.env.prod` 已有 `S3_ACCESS_KEY`、`S3_SECRET_KEY`、`S3_BUCKET`；只检查变量名存在，不输出值
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

生产应用源码与构建产物以 bind mount 进入长期运行容器。`docker compose up -d` 在 Compose 配置未变化时不会切换 Node 进程，因此 `deploy.sh` 会在栈收敛后显式重启 `api web agent-worker`；PostgreSQL、Redis 与对象存储不在该重启集合中。禁止以仅同步文件或仅执行 `up -d` 作为发布完成证据，必须继续完成内部 live route 探针。

### 2.4 初始化生产对象存储（首次）

```bash
# 1) 可恢复备份 Secret 文件；不输出任何值
cp -a /opt/openscience/.env.prod \
  "/opt/openscience/.env.prod.pre-s3-$(date +%Y%m%d-%H%M%S)"

# 2) 缺失时在服务器生成凭据；umask 保证新文件/追加内容仅 owner 可读
umask 077
grep -q '^S3_ACCESS_KEY=' /opt/openscience/.env.prod || \
  printf 'S3_ACCESS_KEY=%s\n' "$(openssl rand -hex 16)" >> /opt/openscience/.env.prod
grep -q '^S3_SECRET_KEY=' /opt/openscience/.env.prod || \
  printf 'S3_SECRET_KEY=%s\n' "$(openssl rand -hex 32)" >> /opt/openscience/.env.prod
grep -q '^S3_BUCKET=' /opt/openscience/.env.prod || \
  printf 'S3_BUCKET=openscience-prod\n' >> /opt/openscience/.env.prod
chmod 600 /opt/openscience/.env.prod

# 3) 经既有代理隧道拉镜像，再验证 compose；命令不得回显 resolved env
with-proxy docker pull chrislusf/seaweedfs:4.41
docker compose --env-file /opt/openscience/.env.prod \
  -f /opt/openscience/infra/compose/docker-compose.prod.yml config --quiet
```

回滚：恢复刚创建的 `.env.prod.pre-s3-*`，切回上一 release compose；`seaweed-data` 卷保留，未经用户明确批准不得删除。

### 2.5 API 反代配置（首次上线或变更时）

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

### 2.6 启动 API（systemd 或 nohup）

```bash
# 服务单元（见 infra/ 说明）；env 从服务器 Secret 注入，不入库
ssh-run.sh "systemctl restart openscience-api"
```

### 2.7 验证对象存储与 Hermes worker

```bash
ssh-run.sh "cd /opt/openscience && docker compose --env-file /opt/openscience/.env.prod -f infra/compose/docker-compose.prod.yml ps api web agent-worker object-storage postgres redis"
ssh-run.sh "cd /opt/openscience && docker compose --env-file /opt/openscience/.env.prod -f infra/compose/docker-compose.prod.yml logs --tail=100 agent-worker"
```

预期：`object-storage` 与 API 为 `healthy`，`agent-worker` 为 `Up`；worker 日志出现启动行，不出现模块、Prisma、Redis 或 Storage 连接错误。

## 3. 回滚步骤

- 代码回滚：`node scripts/cloud-sync.mjs` 同步旧 release ref，重新 install + build，重启服务；对象卷保留。
- nginx 回滚：恢复上一版 `openscience.conf`（`cp` 备份），`nginx -t && systemctl reload nginx`。
- 迁移回滚：`node packages/database/dist/migrate-cli.js status` 确认；破坏性迁移先备份（`docs/runbooks/backup-restore.md`）。
- 判定：`checkup.sh` 复跑 + API 健康检查（见 §4）。

## 4. 验证命令

- API 健康：compose healthcheck 以 `/auth/me` 的 401 为健康；`curl -sI https://OpenScience.428312321.xyz/auth/me` → 401（未登录，服务在）
- /admin 强认证：`curl -sI -u <admin-user> https://OpenScience.428312321.xyz/admin/` → basic_auth 放行后 401（API 层判未登录）或 200/403
- 安全响应头：`curl -sI https://OpenScience.428312321.xyz/auth/me` → 含 `X-Content-Type-Options: nosniff`、CSP `default-src 'none'`
- 限流：连续打 `/auth/login` 5+ 次 → 429 + `Retry-After`
- 巡检复跑：`infra/scripts/checkup.sh` 无新增告警
- 对象存储：运行 adapter put/head/get smoke，输出仅 pass/fail；不得输出凭据、object 内容或 endpoint 值。
- worker 验证：按 §2.7 执行，确认 parser 依赖在服务器可加载；图片 OCR 服务未通过独立验收前不得解除生产门禁。

## 5. Latest Optical Editorial Acceptance (2026-08-11)

- Release ref: `f5bb6e7`; rollback ref: `53d5cbf`.
- Before deployment: database backup passed at 232K with 7/7 retention slots.
- Source verification: remote and local SHA-256 for `apps/web/components/brand/OpticalField.tsx` match after deployment; the pre-deploy remote hash matched the rollback ref.
- Deployment command used the isolated worktree as `XGS_SOURCE_ROOT` and the main repository as `XGS_CONFIG_ROOT`; no `.env`, credentials, screenshots or agent state were synchronized.
- On Windows, invoke `C:/Program Files/Git/bin/bash.exe` explicitly. The system `bash.exe` resolves to WSL in this environment and cannot translate the project SSH-key path.
- Services after activation: API, PostgreSQL, Redis, object storage and malware scanner healthy; Web and agent worker running; no fatal/uncaught/module/connection-refused worker log in the 15-minute acceptance window.
- Public probes: Landing, Explore, Ultrafast Science Collection and the canonical demo Public RO return 200; unauthenticated `/auth/me` returns 401.
- Real-browser flow: sign-in, Dashboard, seven RO product surfaces, three-format Intake, async `needs_review`, Hermes confirmation, version creation and Publish-ready surface passed. The synthetic acceptance object must not be publicly published.

Current infrastructure uses pinned base/worker images with bind-mounted application code. Until a dedicated immutable-image migration is implemented, the verified Git ref plus remote source hash is the rollback anchor; do not describe the Web/API deployment as a per-release immutable image.
