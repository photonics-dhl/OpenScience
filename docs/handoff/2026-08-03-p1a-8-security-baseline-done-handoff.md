# Handoff — 2026-08-03 P1A-8 安全基线完成，Phase 1A 剩 2.9

- Current goal: Phase 1A 平台底座。P1A-8 已全链路闭环（本地门禁 + 云上集成 21/21），下一任务 P1A-9 CI/CD 部署（task-master 2.9）。
- Done:
  - 四决策定案（design gate 逐节确认）：限流手写 Redis 固定窗口（不引库）、CSRF @fastify/csrf-protection 双提交、安全头 @fastify/helmet、/admin nginx basic_auth（ADR-003，TOTP 列上线路障）
  - database `rate-limit.ts`：INCR+EXPIRE 同 multi 原子固定窗口，fail-open（Redis 挂放行），单测 6
  - config `api-env.ts` +4 env：allowedOrigins（逗号→数组）/rateLimitEnabled/rateLimitLoginLimit/rateLimitLoginWindowSec
  - api `src/security/`：rate-limit.ts（RATE_LIMIT_ROUTES 声明表=发布/上传/AI/搜索/沙箱挂接点，429+Retry-After+审计 security.rate.limited）、security.ts（CSRF 双提交 + /csrf-token 端点、CORS 白名单、helmet 全套头）；error-map FST_CSRF*→403 CSRF_INVALID
  - app.ts trustProxy 构造选项（生产 1/dev 0）；依赖 +3 全 fastify 官方插件
  - infra/nginx/openscience.conf（API 反代 + /admin basic_auth + XFF 透传）+ ADR-003 + 部署 runbook 填充
  - 测试：本机单测 database 12 + config 9 + api 50；云上 `test:integration` 21/21（新增 security 4 + 既有 17）
  - 云上收口：cloud-sync → install+全量 build → 集成 21/21；task-master 2.8 done
- Constraints: 同前（不读 .env；pnpm `npx pnpm@9.15.0`；本机不做 Docker；云上写操作/git mutation 逐次用户确认；云上集成测试前必须全量 build）。新增：**`infra/nginx/openscience.conf` 已就位但未部署云上**（改 nginx 配置属写操作，留 2.9 deploy.sh 一并处理，含 htpasswd 生成）；**`.cloud-sync-env` 每次云上同步后删除**（临时文件含服务器凭据）。
- Open risks / parked:
  - 集成测试限流桶隔离：Redis server 端 key 空间全局共享，独立 client 不隔离；须 trustProxy + 唯一 X-Forwarded-For 独立桶（security.integration.test.ts 已固化此模式）
  - openscience.conf 未部署：云上 API 反代 + /admin basic_auth 待 2.9；TOTP 二次验证为**上线路障**（web 有 UI 后补，ADR-003）
  - 既有 parked：P1A-3 终审项（邀请码 99bit 熵、`PORT=''`→0 等）、P1A-5 deferred ①（WorkspaceRole 穷尽性校验）
- Next action: P1A-9 CI/CD 部署（task-master 2.9）：deploy.sh 填充（含 openscience.conf 部署 + htpasswd 生成 + nginx -t/reload）、cloud-sync 补删除语义（rsync --delete）、月度 Credit 授予 Cron 调度（applyMonthlyGrants 接线）→ design gate → spec → plan
- Read first: `AGENTS.md` → 主 spec → `docs/progress.md` 置顶条目（P1A-8）→ `project_index.md` → task-master 任务 2.9 → `docs/specs|plans/2026-08-03-p1a-8-*`
