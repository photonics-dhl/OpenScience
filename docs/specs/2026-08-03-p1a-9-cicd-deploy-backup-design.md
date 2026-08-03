# P1A-9 CI/CD 与阿里云 ECS 部署及备份 — Design Spec

- 日期：2026-08-03
- 关联：task-master 2.9；Spec（Baseline v1.0）§14.2（单 ECS 拓扑/网络分段）、§17（每日备份与恢复演练）、§20.4-5（部署走脚本/询问级）、§21.1（恢复测试层）
- 状态：design gate 逐节已确认（2026-08-03）；下步 writing-plans
- 依赖：2.2（数据底座）、2.6（审计/错误底座）、2.8（nginx 反代配置 + /admin 强认证）

## 0. 范围

建 CI 流水线 + 单 ECS 生产部署 + 每日备份/恢复演练：

- **CI**：GitHub Actions，build/typecheck/lint/最小单测（push/PR 触发）
- **生产 compose**（`infra/compose/docker-compose.prod.yml`）：网络分段对齐 §14.2，api 容器部署，数据服务不绑公网
- **SmtpMailer 实装**：QQ SMTP 真发（nodemailer），生产 api 可启动（P1A-3 生产 throw 阻塞解除）
- **deploy.sh 填充**：同步→build→迁移→seed→compose up→nginx 反代部署（含 P1A-8 openscience.conf + htpasswd）；默认 dry-run 需 --confirm
- **backup.sh 填充 + 备份/恢复演练**：每日 pg_dump + 保留策略；一次真实恢复演练（临时库验证）
- **生产启动 mailer 决策**：MAILER_DRIVER 选驱动（§24 未定前 outbox 捕获）

不做：web/worker 容器部署（空壳）；对象存储快照（数据量小，MinIO 仅 dev 栈）；异地备份（无灾难恢复需求）；ECS 规格/带宽定案（§24 待确认，脚本参数化不写死）。

## 1. CI 流水线（GitHub Actions）

**决策（已确认）**：GitHub Actions，仓库已有 remote（photonics-dhl/OpenScience）。

`.github/workflows/ci.yml`：
- 触发：push + PR（main）
- 单 job（当前单开发者，无矩阵需求）：
  1. checkout + pnpm/action-setup@v4（9.15.0）+ setup-node@v4（node 22, cache pnpm）
  2. `install --frozen-lockfile`
  3. `build` → `typecheck` → `lint` → `test`（单测）
- 集成测试不进 CI（需 PG/Redis，云上跑，保持现状）
- 首次 push workflow 需用户批准（GitHub 侧首次 Actions 启用）

## 2. 生产 compose（网络分段 §14.2）

新 `infra/compose/docker-compose.prod.yml`：

```text
data_net   : postgres + redis（不绑公网端口，仅内部）
app_net    : api（暴露 127.0.0.1:3001 到 host，nginx 反代）
```

- **postgres/redis 无 ports 映射**（仅 data_net 内部互联），满足「数据库不得绑定公网地址」
- **api 服务**：`build` 不在此文件（代码经 deploy.sh 同步）；image = `node:22-alpine`，command = `node dist/index.js`，env 从 `env_file` 读（SERVER Secret，云上生成，不入库）
- 网络：`networks: data_net`（仅 data）+ `app_net`（api）；api 双网卡（app_net + data_net）
- healthcheck：api 打 `/auth/me` 期望 401；postgres/redis pg_isready/ping
- **生产零默认值**：postgres/redis 密码、cookie secret、DB URL 全从 env_file/环境，无内联默认（dev 栈 `*_dev` 豁免不延续）
- minio 不进生产 compose（dev 栈已跑，真实对象存储 §24/后续 Phase）

## 3. 生产 mailer：QQ SMTP 真发（P1A-3 偏离，已确认）

现状：`apps/api/src/index.ts` 在 `nodeEnv === 'production'` 直接 throw（§24 邮件服务商未定）。这阻塞生产部署——compose 起 api 立刻退出。

**决策（用户确认）**：`.env` 已有 QQ 邮箱 SMTP 配置（`SMTP_HOST`/`SMTP_PORT=465`/`SMTP_USER`/`授权码`），**生产用 QQ SMTP 真发邮件**，不再 outbox 兜底。

- **SmtpMailer 实装**（`packages/auth/src/mailer.ts`）：nodemailer 驱动，`createTransport` QQ SMTP（host/port/secure/auth），`send` 真实投递
- 依赖：`packages/auth` + `nodemailer`
- `MAILER_DRIVER` env 选驱动，缺省 **`smtp`**：

```ts
const mailer = env.mailerDriver === 'outbox' ? new DevOutboxMailer(prisma) : new SmtpMailer();
```

- `smtp`（缺省）：真发，env 读 SMTP_HOST/PORT/USER/授权码
  - `outbox`：保留 dev/测试通道（写 mail_outbox 表）
- config `api-env.ts` + `mailerDriver` 字段 + SMTP env（SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS）
- 移除 index.ts 生产 throw 块（改 driver 选择 + SMTP 配置缺失快速失败）
- 生产 SMTP 凭据从 env_file 注入（云上生成，不入库）

**设计意图保持**：邮件真发 = 不吞不丢。QQ SMTP 作为 §24 定案前的最小可用通道；将来换服务商只改 SMTP env + 驱动。

## 4. deploy.sh 填充

`infra/scripts/deploy.sh [--confirm] [--skip-build|--skip-migrate] <release-ref>`：

默认 **dry-run**（打印计划，不执行）；`--confirm` 才执行（§20.5 询问级）。

```text
1. 前置：git rev-parse 校验 release-ref 存在；checkup.sh 巡检基线
2. 同步：cloud-sync 逻辑（tar-over-ssh → /opt/openscience）
3. 构建：install + 全量 build（AGENTS.md 坑）
4. 迁移：migrate-cli deploy + status 验证
5. seed：seed-quota --confirm（幂等）
6. 生产栈：docker compose -f docker-compose.prod.yml up -d（+ 首次 down 迁移）
7. nginx：openscience.conf 部署（cp + nginx -t + reload）+ htpasswd-admin 生成（首次）
8. 验证：curl /auth/me 401、/admin basic_auth、健康检查
```

- 参数化：ECS 规格/带宽 §24 未定 → 端口/路径/备份保留轮数全变量，不写死
- env 读取复用 ssh-run.sh 的 `read_env` 模式（从 .env 取 host/user/port/key，不打印）
- 危险命令（rm/compose down）命中黑名单需 --confirm（复用 ssh-run.sh is_dangerous 思路）

## 5. backup.sh + 备份/恢复演练

### 5.1 backup.sh 填充

`infra/scripts/backup.sh [--db] [--confirm]`（**决策：仅 PostgreSQL dump**）：

```bash
DUMP_DIR=/var/backups/openscience
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U $DB_USER -d $DB_NAME > "$DUMP_DIR/db-$(date +%F).sql"
# 保留 7 轮（参数化 KEEP_BACKUPS）
ls -t "$DUMP_DIR"/db-*.sql | tail -n +$((KEEP+1)) | xargs -r rm
```

- 备份内容不向 stdout 输出（Spec §20.1-9，不拉入 Agent 上下文）
- 输出仅 `BACKUP_OK <size>` + 文件清单
- cron 每日：`0 3 * * *`（host cron，非容器内）

### 5.2 恢复演练（决策：临时库验证）

一次真实演练（执行时用户确认）：
1. 取最近 backup.sh 产物
2. `docker run postgres:16-alpine` 临时容器起空库
3. psql 导入 dump
4. 对比关键表行数 vs 生产（`SELECT count(*)`）
5. 清理临时容器
6. 记录到 `docs/runbooks/backup-restore.md` 演练日志（§21.1 恢复测试层）

### 5.3 backup-restore.md 填充

四节（前置/执行/回滚/验证）+ 演练日志。§17「每日备份 + 定期恢复演练」证据。

## 6. 配置与 env 变更

| env | dev 默认 | 生产必需 | 说明 |
|---|---|---|---|
| `MAILER_DRIVER` | `smtp` | `smtp` | mailer 驱动（smtp 真发 / outbox dev 捕获） |
| `SMTP_HOST` | `''` | `smtp.qq.com` | QQ SMTP 主机 |
| `SMTP_PORT` | `''` | `465` | QQ SMTP 端口（SSL） |
| `SMTP_USER` | `''` | QQ 邮箱地址 | SMTP 用户名 |
| `SMTP_PASS` | `''` | QQ 授权码 | SMTP 授权码（非登录密码） |
| 生产 compose env_file | — | 云上生成 | DB URL/redis/cookie secret/端口 + SMTP，不入库 |

dev 缺省 `outbox`（无 SMTP env 时回落 DevOutboxMailer，不阻塞本地开发/测试）；生产缺 SMTP env 快速失败。

## 7. 测试（Spec §21.1）

- **CI**：workflow 首次运行全绿（build/typecheck/lint/test）
- **deploy.sh**：`--dry-run` 打印计划不执行（本地验证）
- **备份恢复**：一次真实恢复演练，dump 可导入临时库且行数一致（记录证据）
- **生产启动**：MAILER_DRIVER=smtp 生产 env 下 api 可启动 + QQ SMTP 真发验证（云上）
- 本机：`test` + `typecheck` + lint 全绿；docs:lint

## 8. 边界（明确不做）

- 不部署 web/worker 容器（空壳，后续 Phase）
- 不做对象存储快照/异地备份（数据量小，无灾难需求）
- ECS 规格/带宽不定案（§24 待确认，脚本参数化）
- 集成测试不进 CI（需真实 PG/Redis，云上跑）
- 不做 CI 镜像构建/推 registry（单 ECS 直 build，YAGNI）
- 不改 dev 栈
