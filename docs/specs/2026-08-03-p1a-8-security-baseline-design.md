# P1A-8 安全基线（限流、会话安全、管理后台强认证）— Design Spec

- 日期：2026-08-03
- 关联：task-master 2.8；Spec（Baseline v1.0）§17（安全与隐私 MUST）、§21.1（安全测试层）
- 状态：design gate 逐节已确认（2026-08-03）；下步 writing-plans
- 依赖：2.3（auth 会话）、2.6（审计/错误统一 ErrorBody）

## 0. 范围

落实 Spec §17 安全 MUST 中属平台底座的部分：

- **限流中间件**（Redis，登录先行；发布/上传/AI/搜索/沙箱挂接点预留）
- **Session/Cookie 复核**（HttpOnly/Secure/SameSite——现状已达标，本任务固化 + 测试）
- **CSRF 防护**（双提交 token）
- **CORS 白名单**（生产仅允许配置域）
- **CSP 与安全响应头**（集中配置）
- **管理后台（/admin）更强认证**（nginx basic_auth 一层，方案记 ADR）

不做：上传恶意扫描（1B）、公开前敏感扫描（1D）、Sandbox 威胁模型（1E）——均属后续 Phase，本任务只留限流挂接点；TOTP/独立二次验证 UI（web 空壳无法交付，列上线路障，ADR 记录）。

**无新数据库迁移**：全部 Redis 中间件 + Fastify 中间层配置。依赖 +3（@fastify/cors、@fastify/csrf-protection、@fastify/helmet，均 fastify 官方插件）。

## 1. 现状盘点（探底结论）

| 项 | 现状 | 缺口 |
|---|---|---|
| Session | Redis 存储 `sess:{token}`，7d TTL + 滑动续期（P1A-3，`packages/auth/src/session.ts`） | 无 |
| Cookie | httpOnly + sameSite=lax + secure(env) + signed（P1A-3，`apps/api/src/routes/auth.ts`） | 无 |
| Redis client | `createRedisClient`（`packages/database/src/redis.ts`）即用 | 无 |
| 限流 | — | **全空** |
| CSRF | — | **全空**（sameSite=lax 已兜底跨站 POST，但基线 MUST 要求显式配置） |
| CORS | — | **全空**（app.ts L28 注释已留挂载点） |
| CSP/安全头 | — | **全空** |
| /admin 强认证 | platform_admin 角色守卫（P1A-5）+ 审计（P1A-6） | **无传输层额外认证层** |
| 代理信任 | Fastify 无 trustProxy → 云上经 nginx 时 `req.ip` 全为 127.0.0.1 | **限流前置阻塞项** |

## 2. 前置：`trustProxy` 与代理头

云上部署经 nginx 反代，Fastify 不信任代理则所有 `req.ip` 同值（127.0.0.1），限流退化为全站共享单桶——一个 IP 触发全站 429。

**决策**：Fastify `trustProxy: 1`，信任一层代理。nginx 侧必须透传 `X-Forwarded-For`/`X-Forwarded-Proto`（portainer.conf 已有先例，api 反代沿用）。

风险：信任代理后 `req.ip` 可被客户端伪造（除非 nginx `set_real_ip_from` + `real_ip_header` 覆盖）。缓解：nginx 统一覆盖 XFF（现有 `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`），Fastify 侧只读最终值。dev 直连无代理，trustProxy 不改变行为。

## 3. 限流（Redis 固定窗口，手写）

**决策（已确认）**：手写 Redis 固定窗口，不引 @fastify/rate-limit。~30 行纯函数 + 薄 Fastify 封装，契合项目手写纯函数 + knip 纪律；固定窗口边界毛刺可接受。

### 3.1 核心（`packages/database/src/rate-limit.ts`，纯函数 + Redis）

```ts
// key = rl:{ip}:{route}:{window}，window = floor(nowSec / windowSec)
export async function rateLimitHit(redis: Redis, opts: {
  ip: string; route: string; windowSec: number; limit: number;
}): Promise<{ allowed: boolean; remaining: number; resetInSec: number }> {
  const key = `rl:${opts.ip}:${opts.route}:${Math.floor(Date.now() / 1000 / opts.windowSec)}`;
  // INCR + EXPIRE 原子（MULTI/EXEC），防并发竞态；EXPIRE 幂等防窗口翻转后 key 永存
  const n = await redis.multi().incr(key).expire(key, opts.windowSec).exec();
  const count = n[0][1] as number;
  return {
    allowed: count <= opts.limit,
    remaining: Math.max(0, opts.limit - count),
    resetInSec: opts.windowSec - (Math.floor(Date.now() / 1000) % opts.windowSec),
  };
}
```

- 固定窗口：window 翻转自动生成新 key，旧 key 靠 EXPIRE 回收，无后台清理任务
- Redis 不可用（P1A-2 已挂空 error listener）→ 捕获异常**放行**（fail-open，避免限流依赖把服务整体打挂；审计 warning）
- 429 响应：`Retry-After: resetInSec` 头 + 统一 ErrorBody（code `RATE_LIMITED`）

### 3.2 Fastify 封装（`apps/api/src/security/rate-limit.ts`）

`registerRateLimit(app, opts)`：

- 路由 → 档位映射表（声明式，`RATE_LIMIT_ROUTES`）：登录先行
- `preHandler` 校验 → 超限回 429 + Retry-After
- 超限记审计（action `security.rate.limited`，AuditSink，同 requestId/ip 惯例）

### 3.3 初始档位（保守，env 可调）

| 路由 | 限 | 窗口 | 说明 |
|---|---|---|---|
| `POST /auth/login` | 5 | 1min | 登录爆破主防线 |
| `POST /auth/register` | 5 | 10min | 注册滥用 |
| `POST /auth/resend-code` | 3 | 5min | 配合现有 RESEND_COOLDOWN |
| `POST /auth/verify-email` | 10 | 5min | 验证码爆破（sha256 落库 + 限流双保险） |
| 发布/上传/AI/搜索/沙箱 | — | — | **挂接点预留**，各 Phase 按 `RATE_LIMIT_ROUTES` 表加行即可 |

env：`RATE_LIMIT_*` 可覆盖（dev 默认宽松，生产默认上述档位）。

### 3.4 挂接点说明

`RATE_LIMIT_ROUTES` 声明式路由→档位表。1B（发布/上传）、1D（搜索）、1E（沙箱）、AI 调用各 Phase 接入时**只加表行 + 依赖档位**，中间件零改动。

## 4. CSRF（@fastify/csrf-protection 双提交）

**决策（已确认）**：官方插件 @fastify/csrf-protection，session-free 双提交模式。

- 注册插件（session-free）：签发 `csrf_token` cookie（httpOnly false——前端需读值回传；sameSite=lax）
- 写操作 preHandler：校验 `x-csrf-token` 请求头 == cookie 值，不匹配回 403
- sameSite=lax 已挡跨站 POST 携带 cookie，双提交为纵深防御
- 豁免：`/auth/*` 公开读接口不校验（token 校验 CSRF 本身无意义）；限流已罩登录路径

```ts
await app.register(csrfProtection, {
  cookieOpts: { httpOnly: false, sameSite: 'lax', secure, path: '/' },
  getToken: (req) => req.headers['x-csrf-token'] as string | undefined,
});
app.addHook('preHandler', (req, reply, done) => {
  if (isWriteRoute(req)) app.csrfProtection(req, reply, done);
  else done();
});
```

`isWriteRoute`：POST/PUT/PATCH/DELETE 且非公开豁免路径。

## 5. CORS（@fastify/cors 白名单）

**env**：`ALLOWED_ORIGINS`（逗号分隔）。生产仅白名单域；dev 缺省同源（不跨域，CORS 不必要）。

```ts
await app.register(cors, {
  origin: env.allowedOrigins.length ? env.allowedOrigins : false, // false = 同源策略
  credentials: true, // 会话 cookie 跨域需显式允许
  allowedHeaders: ['content-type', 'x-csrf-token', 'idempotency-key'],
});
```

Cookie 跨域：`credentials: true` 必须 + 白名单精确匹配 origin（禁 `*`）。session cookie 已设 SameSite=lax，跨站场景本就不带，CORS 白名单管浏览器同站跨子域/API 前置。

## 6. 安全响应头（@fastify/helmet）

**决策（已确认）**：官方插件 @fastify/helmet，集中配置。

```ts
await app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],          // API 纯 JSON，无外链
      frameAncestors: ["'none'"],      // 禁 iframe 嵌入（点击劫持）
    },
  },
  hsts: env.nodeEnv === 'production' ? { maxAge: 31536000 } : false, // 本地 http 无 HSTS
  crossOriginResourcePolicy: false,    // API 纯 JSON，无需 CORP
});
```

- 默认含 X-Content-Type-Options: nosniff、X-Frame-Options、Referrer-Policy 等全套
- CSP 对 JSON API 安全（default-src 'none'）；web 空壳（前端）上线前再细化 CSP（本任务不改 web）
- 本地测试断言头存在 + 关键值

## 7. /admin 更强认证（nginx basic_auth + ADR）

**决策（已确认）**：nginx `auth_basic` 一层 + 现有 platform_admin 角色 + 全审计。**TOTP 二次验证列为上线路障**（web 空壳无法交付 QR 设置流）。

- nginx：`/admin/` location 加 `auth_basic` + `auth_basic_user_file /etc/nginx/.htpasswd-admin`（复用 /monitor/ `.htpasswd-monitor` 手法，2026-08-01 先例）
- 凭据文件云上生成（`htpasswd` 命令），**不入库**（同 .htpasswd-monitor 惯例）
- 应用层：现有 requirePlatformAdmin 不动（platform_admin 角色 + P1A-6 全审计仍生效）
- 双层：传输层（nginx basic_auth 挡住未授权访问 /admin 路径）+ 应用层（platform_admin 角色 + 审计）
- **ADR**：新增 `ADR-003-admin-strong-auth.md`，记录：方案 = nginx basic_auth + platform_admin + 审计；TOTP 为上线前 MUST（web 有 UI 后补二次验证流）

nginx 配置放 `infra/nginx/api.conf`（新文件，仿 portainer.conf 结构；api 域 `OpenScience.428312321.xyz` 部署时启用）。

## 8. 配置与 env 变更（`packages/config/src/api-env.ts`）

新增 ApiEnv 字段：

| env | dev 默认 | 生产必需 | 说明 |
|---|---|---|---|
| `ALLOWED_ORIGINS` | `''`（同源） | 白名单逗号串 | CORS origin |
| `RATE_LIMIT_ENABLED` | `true` | `true` | 限流总开关（集成测试可关） |
| `RATE_LIMIT_LOGIN_LIMIT` | 5 | 5 | /auth/login 窗口限额（env 可调） |
| `RATE_LIMIT_LOGIN_WINDOW_SEC` | 60 | 60 | /auth/login 窗口秒 |

不新增：COOKIE_SECRET、SECURE_COOKIES 已有。信任代理 `trustProxy` 随 nodeEnv（生产开）而非 env 字段。

## 9. 测试（Spec §21.1 安全测试层）

- **单元**（packages/database）：`rateLimitHit` 窗口内限值、窗口翻转重置、INCR/EXPIRE 原子、Redis 不可用 fail-open（mock 抛错）
- **单元**（apps/api，测试注入无 Redis）：限流中间件路由→档位映射；CSRF 缺失/不匹配 → 403；helmet 头断言（X-Content-Type-Options、CSP default-src、frame-ancestors）
- **集成**（云上，先全量 build）：真 Redis 登录连续超限 → 429 + Retry-After + 恢复（窗口过期再放行）；CSRF 写请求无 token → 403、带 token → 通过；安全头在真实响应存在；限流记审计行
- 本机：`test` + `typecheck` + lint 全绿；`audit:knip` 无未用导出（rateLimitHit 有消费方）

## 10. 边界（明确不做）

- 不上传/敏感扫描/Sandbox 威胁模型（1B/1D/1E，只留限流挂接点）
- 不做 TOTP UI（上线路障，ADR 记录）
- 不碰 web 空壳 CSP（前端上线前细化）
- 不引入独立限流/防爆破库（手写固定窗口足够本阶段）
- 不改 Session/Cookie 既有正确行为（只固化 + 测试断言）
- 不新增迁移
