# Handoff — 2026-08-03 P1A-9 CI/CD 部署完成，Phase 1A 全链收口

- Current goal: Phase 1A 平台底座。P1A-9 已闭环（CI + 生产栈上线 + 备份/恢复演练 + QQ SMTP），**Phase 1A（task-master 2.x）全部完成**，下一任务 P1A-10（1B 起业务 Phase，task-master 3.x）。
- Done:
  - 三决策（design gate）：GitHub Actions CI、仅 PostgreSQL dump 备份、临时库恢复演练
  - **QQ SMTP 真发**（§3 偏离，用户确认）：nodemailer 实装 SmtpMailer，MAILER_DRIVER=smtp 缺省，P1A-3「生产拒绝启动」阻塞解除
  - CI：`.github/workflows/ci.yml`（build/typecheck/lint/test，push+PR main）
  - 生产 compose：`docker-compose.prod.yml`（data_net postgres/redis 无端口映射 + app_net api 127.0.0.1:3001，双网卡）
  - deploy.sh（dry-run+--confirm 8 步链）+ backup.sh（pg_dump 保留 7 轮）+ backup-restore.md 四节+演练日志
  - **云上生产上线**：生产栈 up → 迁移 6 applied（容器内跑）→ seed 8/8 → HTTPS 反代 + /admin basic_auth + 安全头（CSP/nosniff）+ 限流 429/Retry-After → 备份 24K + 恢复演练行数一致 + cron 0 3 → QQ SMTP 链路通（register→auth.register 审计）
  - schema binaryTargets +linux-musl；api 生产绑 0.0.0.0（compose 限宿主 127.0.0.1）
  - task-master 2.9 done + details
- Constraints: 同前（不读 .env；pnpm `npx pnpm@9.15.0`；本机不做 Docker；云上写操作/git mutation 逐次用户确认；云上集成测试前必须全量 build）。新增：**证书签 DNS-01**（Cloudflare API，HTTP-01 被阿里云 403 拦）；**invite/migrate/seed 需容器内跑**（生产 postgres 无端口映射，宿主机 `postgres:5432` 解析不到——用 `docker compose --env-file .env.prod exec -T api node ...`）；**`.cloud-sync-env` 每次云上同步后删除**。
- Open risks / parked:
  - CI 首跑待确认（Actions 页面，本机不可见）；deploy.sh 未全自动跑通（本机 dry-run 验证过，云上手工步骤执行）
  - 邮件真发未用真实邮箱验证（smoke@example.com 假地址，链路通但收件需真实 QQ 邮箱测试）
  - parked：P1A-3 终审项（邀请码 99bit 熵、`PORT=''`→0）、P1A-5 deferred ①、/admin TOTP 上线路障（ADR-003）
  - 对象存储快照/异地备份未做（数据量小，后置）；月度 Credit 授予 Cron 未接（applyMonthlyGrants 骨架就位）
- Next action: Phase 1A 收口确认（CI 首跑 + deploy.sh 全自动 runbook）→ **P1A-10+（1B 起）**：Research Object / 上传 / AI Gateway / 发布 等业务 Phase（task-master 3.x）。建议先 design gate 首个业务 Phase。
- Read first: `AGENTS.md` → 主 spec → `docs/progress.md` 置顶条目（P1A-9）→ `project_index.md` → task-master 任务 3.x → `docs/specs|plans/2026-08-03-p1a-9-*`
