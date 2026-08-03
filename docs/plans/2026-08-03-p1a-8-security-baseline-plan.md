# P1A-8 安全基线（限流、会话安全、管理后台强认证）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落实 Spec §17 安全 MUST 属平台底座部分：Redis 固定窗口限流（登录先行 + 挂接点）、CSRF 双提交、CORS 白名单、helmet 安全头、/admin nginx basic_auth 强认证（ADR 记录，TOTP 列上线路障）。无新迁移。

**Architecture:** 新增 `packages/database/src/rate-limit.ts`（纯函数 + Redis 固定窗口），`apps/api` 加 `src/security/`（限流封装 + CSRF/CORS/helmet 集中注册），`packages/config` 加 env 字段，`infra/nginx/api.conf` + `ADR-003`。不新增包。

**Tech Stack:** Fastify 5.10 / ioredis 5 / @fastify/cors + csrf-protection + helmet / vitest 2 / pnpm workspace（一律 `npx pnpm@9.15.0`）。

**Spec:** `docs/specs/2026-08-03-p1a-8-security-baseline-design.md`（design gate 逐节已确认 2026-08-03）
**状态：** 草稿（待执行）

## Global Constraints

- pnpm 一律 `npx pnpm@9.15.0 <cmd>`；不全局安装。
- 本机不做 Docker；集成测试（`*.integration.test.ts`）只在云上跑，且跑前必须云上全量 `build`（AGENTS.md 坑）。
- 所有 git mutation（add/commit/push）逐次用户批准；云上写操作逐次用户确认。
- 不读/打印 `.env`；`.env.example` 只比对 key 名。
- 无新迁移；`infra/migrations/` 不动。
- 审计写与业务写同一 `$transaction`；sink throw 则业务回滚。
- 限流 fail-open（Redis 不可用放行 + 审计 warning），不因限流依赖打挂服务。
- 每个 Task 完成后跑对应包 `test` + 根 `typecheck`；Task 8 跑全量门禁。
- 新依赖（cors/csrf-protection/helmet）必须入 `apps/api/package.json` 正式 dependencies（非 dev）。

---

### Task 1: `packages/database/src/rate-limit.ts` — Redis 固定窗口纯函数

**Files:**
- Create: `packages/database/src/rate-limit.ts`
- Create: `packages/database/test/rate-limit.test.ts`
- Modify: `packages/database/src/index.ts`（导出）

**Interfaces:**
- Produces: `rateLimitHit(redis, { ip, route, windowSec, limit }) → { allowed, remaining, resetInSec }`
- Consumes: `ioredis`（`multi().incr().expire().exec()` 原子）

- [ ] **Step 1: 失败测试**
  窗口内计数递增；第 N+1 次超限 `allowed:false`；窗口翻转重置（key 含 window bucket）；`resetInSec` 正确；Redis `exec` 抛错 → fail-open（`allowed:true`，不 throw）。
- [ ] **Step 2: 实装**
  纯函数 + Redis 原子 INCR/EXPIRE；异常捕获 fail-open。

**Verify:** `npx pnpm@9.15.0 --filter @openscience/database test` 全绿 + 根 `typecheck`。

---

### Task 2: env 扩展（`packages/config`）

**Files:**
- Modify: `packages/config/src/api-env.ts`（+ `allowedOrigins`、`rateLimitEnabled`、`rateLimitLoginLimit`、`rateLimitLoginWindowSec`）
- Modify: `packages/config/src/index.ts`（类型导出如有）
- Modify: `packages/config/test/api-env.test.ts`（如有；对齐 P1A-6 测试惯例）

**Interfaces:**
- Produces: `ApiEnv` 新增字段；`ALLOWED_ORIGINS` 逗号串解析为数组
- Consumes: 无（纯解析）

- [ ] **Step 1: 失败测试**
  dev 默认（空 origin → 同源；RATE_LIMIT_ENABLED 缺省 true；login 5/60）；`ALLOWED_ORIGINS="https://a.com,https://b.com"` → 数组；生产缺必需（沿用既有快速失败模式）。
- [ ] **Step 2: 实装**
  解析 + 默认值 + 生产校验。

**Verify:** `--filter @openscience/config test` 全绿 + 根 `typecheck`。

---

### Task 3: `apps/api/src/security/rate-limit.ts` — Fastify 限流封装

**Files:**
- Create: `apps/api/src/security/rate-limit.ts`（`RATE_LIMIT_ROUTES` 声明表 + `registerRateLimit` preHandler + 429 Retry-After + 审计）
- Create: `apps/api/test/security/rate-limit.test.ts`（注入 fake Redis + fake audit）
- Modify: `apps/api/src/error-map.ts`（`RATE_LIMITED` → 429 映射）

**Interfaces:**
- Produces: `registerRateLimit(app, deps, env)`；`RATE_LIMIT_ROUTES` 导出（挂接点）
- Consumes: `rateLimitHit` + `AuthDeps.audit?` + 统一 ErrorBody

- [ ] **Step 1: 失败测试**
  login 超 5 次 → 429 + Retry-After；窗口内放行；限流触发记审计 `security.rate.limited`；RATE_LIMIT_ENABLED=false 全放行（集成测试用）。
- [ ] **Step 2: 实装**
  声明表 + preHandler 校验；超限记审计（requestId/ip 惯例）；429 统一 ErrorBody。

**Verify:** `--filter @openscience/api test` 全绿 + 根 `typecheck`。

---

### Task 4: `apps/api/src/security/` — CSRF + CORS + helmet 集中注册

**Files:**
- Create: `apps/api/src/security/security.ts`（`registerSecurity(app, deps, env)`：csrfProtection 双提交 + cors 白名单 + helmet）
- Create: `apps/api/test/security/security.test.ts`（CSRF 缺失/不匹配 403、安全头断言、CORS 白名单行为）
- Modify: `apps/api/src/app.ts`（注册 security + rate-limit，替换 L28 注释挂载点）
- Modify: `apps/api/package.json`（+ `@fastify/cors`、`@fastify/csrf-protection`、`@fastify/helmet`）

**Interfaces:**
- Produces: 写路由 CSRF 校验；CORS origin 白名单；helmet 全套安全头
- Consumes: `ApiEnv.allowedOrigins`、`secureCookies`、`nodeEnv`

- [ ] **Step 1: 失败测试**
  POST 无 `x-csrf-token` → 403；token 不匹配 → 403；匹配 → 通过；安全响应头存在（X-Content-Type-Options: nosniff、CSP default-src 'none'、frame-ancestors）；CORS 白名单 origin 放行/拒绝。
- [ ] **Step 2: 实装**
  集中注册 + 写路由 preHandler 校验；`isWriteRoute` 豁免公开读路径。

**Verify:** `--filter @openscience/api test` 全绿 + 根 `typecheck`。

---

### Task 5: `trustProxy` 与 app.ts 接线

**Files:**
- Modify: `apps/api/src/app.ts`（`trustProxy: env.nodeEnv === 'production' ? 1 : false`）
- Modify: `apps/api/test/app.test.ts` 或现有 app 相关测试（trustProxy 值断言）

**Interfaces:**
- Produces: 生产信任一层代理（nginx XFF 生效，`req.ip` 正确）
- Consumes: `ApiEnv.nodeEnv`

- [ ] **Step 1: 失败测试**
  `buildApp` 生产 nodeEnv → `app.server` trust proxy 开启（`req.ip` 取 XFF）；dev → 不信任。
- [ ] **Step 2: 实装**
  Fastify 构造选项。

**Verify:** `--filter @openscience/api test` 全绿 + 根 `typecheck`。

---

### Task 6: `/admin` 强认证 — nginx basic_auth + ADR

**Files:**
- Create: `infra/nginx/api.conf`（仿 portainer.conf；`/admin/` location basic_auth，`/etc/nginx/.htpasswd-admin`；含部署注释）
- Create: `docs/decisions/ADR-003-admin-strong-auth.md`（方案记录 + TOTP 上线路障）
- Modify: `docs/runbooks/deployment.md`（补充 api.conf 部署 + htpasswd 生成步骤，四节骨架填充对应节）

**Interfaces:**
- Produces: nginx 层 /admin 强认证配置 + 决策记录
- Consumes: 无（纯 infra/文档）

- [ ] **Step 1: 写 api.conf**
  仿 portainer.conf 结构；`/admin/` 前缀 basic_auth + 其余路径透传；注释含 htpasswd 生成命令与部署顺序。
- [ ] **Step 2: 写 ADR-003**
  方案：nginx basic_auth + platform_admin + 审计双层；TOTP = 上线前 MUST（web 有 UI 后补）；凭据不入库。
- [ ] **Step 3: 更新部署 runbook**
  api.conf 上传、htpasswd 生成、nginx -t + reload、验证步骤。

**Verify:** 本地 nginx 配置语法人工审（本机无 nginx）；ADR 格式对齐 ADR-001/002；docs:lint 通过。

---

### Task 7: 集成测试（云上）

**Files:**
- Create: `apps/api/test/security.integration.test.ts`（真 Redis + 真 PG：限流触发/恢复、CSRF、安全头、审计行）
- Modify: `apps/api/vitest.integration.config.ts`（如需要 fileParallelism 串行，对齐 P1A-7 教训）

**Interfaces:**
- Produces: 云上安全基线集成证据
- Consumes: buildApp + 真 PG/Redis

- [ ] **Step 1: 限流集成**
  login 连续超限 → 429 + Retry-After；等窗口（或调小 window）恢复放行；限流审计行存在。
- [ ] **Step 2: CSRF + 安全头**
  写请求无 token → 403；带 token → 通过；真实响应头存在（nosniff/CSP）。
- [ ] **Step 3: 串行**
  对齐 P1A-7 `fileParallelism:false` 教训（共享 Redis key 互扰），确认 integration config 串行。

**Verify:** 云上全量 `build` 后 `test:integration` 全绿（含既有 17 + 新增）。

---

### Task 8: 全量门禁 + 收口

- [ ] **Step 1: 根命令全绿** — `npx pnpm@9.15.0 build` + `typecheck` + `lint`（0 warning）+ 全部单测。
- [ ] **Step 2: 卫生审计** — `audit:knip`（rateLimitHit 有消费方）、`audit:dep`（无循环）、`audit:dup`、`docs:lint`（ADR/spec/plan）。
- [ ] **Step 3: 云上集成** — 全量 build 后 `test:integration`（含新增 security）；nginx api.conf 部署需用户确认（改云上 nginx 配置）。
- [ ] **Step 4: task-master 2.8 置 done**（details 记偏离/架构落点/ADR 链接）。
- [ ] **Step 5: 收口** — 更新 `docs/progress.md` 置顶、`project_index.md`（登记 spec/plan/ADR-003/api.conf）、AGENTS.md（新命令/依赖）、写 handoff。
