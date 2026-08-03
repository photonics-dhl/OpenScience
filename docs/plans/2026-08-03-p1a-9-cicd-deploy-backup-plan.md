# P1A-9 CI/CD 与阿里云 ECS 部署及备份 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建 CI 流水线 + 单 ECS 生产部署 + 每日备份/恢复演练。生产 mailer 用 QQ SMTP 真发（§3，nodemailer 实装 SmtpMailer）。

**Architecture:** `.github/workflows/ci.yml`（GitHub Actions）+ `infra/compose/docker-compose.prod.yml`（data_net/app_net 分段）+ `infra/scripts/deploy.sh`/`backup.sh` 填充 + `packages/auth` SmtpMailer 实装 + `packages/config` SMTP env。

**Tech Stack:** GitHub Actions / docker compose 网络分段 / nodemailer / pg_dump / vitest 2 / pnpm workspace（一律 `npx pnpm@9.15.0`）。

**Spec:** `docs/specs/2026-08-03-p1a-9-cicd-deploy-backup-design.md`（design gate 逐节已确认 2026-08-03）
**状态：** 草稿（待执行）

## Global Constraints

- pnpm 一律 `npx pnpm@9.15.0 <cmd>`；不全局安装。
- 本机不做 Docker；集成测试（`*.integration.test.ts`）只在云上跑，且跑前必须云上全量 `build`（AGENTS.md 坑）。
- 所有 git mutation（add/commit/push）逐次用户批准；云上写操作逐次用户确认。
- 不读/打印 `.env`；`.env.example` 只比对 key 名。
- 备份文件与真实用户数据不得拉入本地上下文（Spec §20.1-9）；backup.sh 不向 stdout 输出备份内容。
- 部署/迁移属 Spec §20.5 询问级：deploy.sh 默认 dry-run，`--confirm` 才执行。
- ECS 规格/带宽 §24 待确认：脚本端口/路径/保留轮数全参数化不写死。
- 每个 Task 完成后跑对应包 `test` + 根 `typecheck`；Task 9 跑全量门禁。

---

### Task 1: SmtpMailer 实装（QQ SMTP 真发）

**Files:**
- Modify: `packages/auth/src/mailer.ts`（SmtpMailer 用 nodemailer createTransport 真发）
- Modify: `packages/auth/package.json`（+ nodemailer）
- Create: `packages/auth/test/mailer.test.ts`（SmtpMailer 配置校验 + DevOutboxMailer 回归）

**Interfaces:**
- Produces: `SmtpMailer` 真发（env: SMTP_HOST/PORT/USER/PASS）；`DevOutboxMailer` 不变
- Consumes: nodemailer + config env

- [ ] **Step 1: 失败测试**
  SmtpMailer 缺 SMTP env → throw（快速失败）；有 env → createTransport 配置正确（mock sendMail）；DevOutboxMailer 写 mail_outbox 表回归。
- [ ] **Step 2: 实装**
  nodemailer createTransport（secure: port 465）；send 真实投递；构造校验 env 缺失抛错。
- [ ] **Step 3: 装依赖**
  `--filter @openscience/auth add nodemailer`（正式 dependencies）。

**Verify:** `--filter @openscience/auth test` 全绿 + 根 `typecheck`。

---

### Task 2: config SMTP env + MAILER_DRIVER

**Files:**
- Modify: `packages/config/src/api-env.ts`（+ mailerDriver/SMTP_HOST/PORT/USER/PASS）
- Modify: `packages/config/test/api-env.test.ts`
- Modify: `apps/api/src/index.ts`（生产 throw 块改 mailer driver 选择 + SMTP 缺失快速失败）

**Interfaces:**
- Produces: `ApiEnv.mailerDriver`（'smtp'|'outbox'，dev 缺省 outbox，生产缺省 smtp）+ SMTP env；index.ts 用 driver 选 mailer
- Consumes: 无（纯解析 + 启动组装）

- [ ] **Step 1: 失败测试**
  dev 缺省 outbox（无 SMTP env 不炸）；生产缺 SMTP_HOST → throw；MAILER_DRIVER=smtp 显式；MAILER_DRIVER=outbox 忽略 SMTP。
- [ ] **Step 2: 实装**
  api-env 解析 + 校验；index.ts 移除生产 throw，按 driver 选 `new SmtpMailer()` / `new DevOutboxMailer(prisma)`；生产 smtp 缺 env 快速失败。

**Verify:** `--filter @openscience/config test` + `--filter @openscience/api test` 全绿 + 根 `typecheck`。

---

### Task 3: 生产 compose（网络分段 §14.2）

**Files:**
- Create: `infra/compose/docker-compose.prod.yml`

**Interfaces:**
- Produces: postgres+redis（data_net，无 ports 映射）+ api（app_net+data_net，暴露 127.0.0.1:3001）+ env_file 注入 + healthcheck
- Consumes: 无（compose 定义）

- [ ] **Step 1: 写 compose**
  对齐 dev 栈镜像（postgres:16-alpine/redis:7-alpine/node:22-alpine）；api 服务 command `node dist/index.js`，工作目录 /opt/openscience/apps/api；env_file 指向 `/opt/openscience/.env.prod`（云上生成）；healthcheck api 打 /auth/me 期望 401。
- [ ] **Step 2: 本地语法校验**
  `docker compose -f docker-compose.prod.yml config` 输出有效（本机无 Docker 则云上校验，需确认）。

**Verify:** compose config 有效 + healthcheck 定义正确。

---

### Task 4: CI workflow（GitHub Actions）

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: push/PR 触发，build/typecheck/lint/test 单 job
- Consumes: pnpm/action-setup@v4 + setup-node@v4

- [ ] **Step 1: 写 workflow**
  checkout → pnpm 9.15.0 → node 22 cache pnpm → install --frozen-lockfile → build/typecheck/lint/test。
- [ ] **Step 2: 本地校验**
  语法人工审（本机无 Actions runner）；首次 push 需用户批准 GitHub 侧启用。

**Verify:** workflow 首跑全绿（push 后看 Actions 页面）。

---

### Task 5: deploy.sh 填充

**Files:**
- Modify: `infra/scripts/deploy.sh`
- Modify: `docs/runbooks/deployment.md`（deploy.sh 用法同步）

**Interfaces:**
- Produces: `deploy.sh [--confirm] [--skip-build] [--skip-migrate] <release-ref>`；默认 dry-run 打印计划
- Consumes: cloud-sync 逻辑 + ssh-run 模式（read_env 从 .env 取连接）

- [ ] **Step 1: 骨架**
  release-ref 校验、dry-run 模式（打印计划不执行）、--confirm 放行、env 读取（复用 ssh-run read_env 思路）。
- [ ] **Step 2: 步骤链**
  同步（tar-over-ssh）→ install+全量 build → migrate deploy → seed-quota --confirm → compose up 生产栈 → nginx openscience.conf 部署 + htpasswd（首次）→ 验证（curl /auth/me 401、/admin basic_auth）。
- [ ] **Step 3: 参数化**
  端口/路径/备份保留轮数全变量；ECS 规格 §24 不写死。

**Verify:** 本地 `deploy.sh --dry-run <ref>` 打印完整计划不执行；docs:lint 过。

---

### Task 6: backup.sh + cron

**Files:**
- Modify: `infra/scripts/backup.sh`
- Create: `docs/runbooks/backup-restore.md`（四节 + 演练日志）

**Interfaces:**
- Produces: `backup.sh [--db] [--confirm]`：pg_dump → /var/backups/openscience + 保留 KEEP 轮（参数化）；输出仅 BACKUP_OK + 清单
- Consumes: compose prod postgres 容器 + pg_dump

- [ ] **Step 1: 写 backup.sh**
  compose exec -T postgres pg_dump → 远端 dump 文件；保留轮转（ls -t | tail -n +K+1 | xargs rm，黑名单命中 --confirm）；不输出备份内容。
- [ ] **Step 2: runbook 填充**
  四节（前置/执行/回滚/验证）+ 演练日志模板。
- [ ] **Step 3: cron 注册（云上，用户确认）**
  host cron `0 3 * * *` backup.sh --db。

**Verify:** 云上跑一次 backup.sh 产出 dump + 文件存在 + 不向 stdout 泄露内容（用户确认）。

---

### Task 7: 生产 api 部署（云上）

**Files:**
- Modify: 无（云上操作）
- 前置：Task 3 compose + Task 5 deploy.sh 就位

**Interfaces:**
- Produces: 生产栈 up（postgres/redis/api），nginx 反代 + /admin basic_auth 生效
- Consumes: deploy.sh + openscience.conf + .env.prod（云上生成）

- [ ] **Step 1: 云上生成 .env.prod**
  从本机 .env 拷贝 DB/redis/cookie/SMTP 键（脚本读值写远端，不打印）；无 dev 默认值。
- [ ] **Step 2: deploy.sh --confirm**
  全链路（同步→build→迁移→seed→compose up→nginx）。
- [ ] **Step 3: 验证**
  curl https://OpenScience.428312321.xyz/auth/me → 401；/admin/ basic_auth 提示；安全头存在；注册→收 QQ 邮件→验证码流（邮件真发证据）。

**Verify:** 生产 API 可访问 + 邮件真发 + nginx 强认证生效（用户确认后执行）。

---

### Task 8: 备份/恢复演练（云上）

**Files:**
- Modify: `docs/runbooks/backup-restore.md`（演练记录）

**Interfaces:**
- Produces: 一次真实恢复演练证据（dump 导入临时库 → 行数对比 → 清理）
- Consumes: Task 6 backup.sh 产物 + docker run postgres 临时容器

- [ ] **Step 1: 备份产物确认**
  云上 backup.sh 最近 dump 存在 + 大小非零。
- [ ] **Step 2: 临时库恢复**
  docker run postgres:16-alpine 临时容器 → psql 导入 dump → SELECT count(*) 关键表 vs 生产 → 清理容器。
- [ ] **Step 3: 记录**
  backup-restore.md 演练日志（日期/命令/结果）。

**Verify:** dump 可导入 + 行数一致 + 演练记录（用户确认后执行）。

---

### Task 9: 全量门禁 + 收口

- [ ] **Step 1: 根命令全绿** — `npx pnpm@9.15.0 build` + `typecheck` + `lint`（0 warning）+ 全部单测。
- [ ] **Step 2: 卫生审计** — `audit:knip`（nodemailer 有消费方）、`audit:dep`、`audit:dup`、`docs:lint`。
- [ ] **Step 3: CI 验证** — push workflow 首跑全绿（Actions 页面）。
- [ ] **Step 4: task-master 2.9 置 done**（details 记偏离/架构落点）。
- [ ] **Step 5: 收口** — 更新 `docs/progress.md` 置顶、`project_index.md`（登记 spec/plan/compose/ci）、AGENTS.md（新命令/依赖）、写 handoff。
