# OpenScience Phase 0 代码库审计：Scholars Tea

- 审计日期：2026-07-28
- 目标仓库：`Z:/data/home/zju321/321/DHL/scholars_tea`（下文简称 `<repo>`）
- 审计方式：只读扫描 + 5 个并行子审计域 + 关键结论人工复核；未修改、移动、删除任何文件；未读取/打印 `.env`、`.env.postgres` 内容；未启动服务、未运行测试（避免产生副作用）
- 当前 HEAD：`74eb3f7 docs(handoff): update for tech debt audit + Hermes architecture + dev readiness`
- 工作区状态：审计时存在大量未提交修改/删除（`git status --short` 见证据节），本报告描述的是“当前工作区 + git 跟踪状态”的事实

## 1. 执行摘要

Scholars Tea 不是空壳原型，而是一个已运行过的 Next.js 社区/AI Workshop 系统：有真实 API 路由、Prisma schema、Socket.io 实时服务、Python Hermes Gateway、PM2 部署配置和 CI。对 OpenScience 的价值主要是**可提取模块与反面教材**，不建议整体搬入新架构。

核心结论：

1. **可保留资产集中在**：认证/验证码流、`src/services/*` 服务层模式、统一 API 响应、Prisma 社区/学术资产模型、AI 工具调用安全闸、RAG/引用校验/外部论文检索等局部模块。
2. **必须替换或重构的集中在**：上传存储、Hermes 调用与模型路由、Socket.io 双写通道、迁移体系、部署脚本群、密钥管理。
3. **高危问题已进入 git 跟踪状态**：`.env.postgres`、`hermes-home/config.yaml`、`hermes/config.yaml`、`hermes-home/gateway_state.json`、`hermes-home/backup/*.bak` 被 `git ls-files` 确认跟踪；其中 Hermes 配置文件被子审计确认含明文 key（本报告不记录值）。
4. **最严重架构裂缝**：主应用 Prisma 与 socket server 裸 `pg` SQL 双轨访问同一数据库；schema 演进无法保证双侧同步。
5. **最严重数据迁移风险**：Prisma 迁移历史为空 baseline，真实表结构靠 `db push`；部署流水线也没有 `prisma migrate deploy`。

对 OpenScience 的建议路线：**选择性抽取 + 按 Baseline v1.0 重建平台底座**，不把 Scholars Tea 当前架构作为 MVP 架构直接继承。

## 2. 目录与运行地图

证据：`package.json`、`server/package.json`、`hermes-home/hermes-agent/package.json`、`ecosystem.config.js`、`docker-compose.yml`、`server/src/index.ts`、`scripts/embedding-server.py`。

顶层结构要点：

- `<repo>/src`：Next.js App Router 主应用；API 集中在 `src/app/api/v1/**`；服务层在 `src/services/*`。
- `<repo>/server`：独立 Socket.io 服务，ESM，`tsc` 构建到 `server/dist`。
- `<repo>/hermes-home/hermes-agent`：vendored Python Hermes Agent v0.9.0；运行时 home 在 `hermes-home/`。
- `<repo>/prisma`：PostgreSQL schema + 空 baseline migrations。
- `<repo>/scripts`：部署/seed/修复脚本，存在多版本蔓延。
- `<repo>/tests`、`scripts/test`：正式测试很少，一次性脚本很多。

运行拓扑：

```text
浏览器
  → Next.js (PM2 scholars-tea, port 3002)
  → Socket.io server (PM2 scholars-tea-socket, port 3001, 0.0.0.0)
  → Python embedding FastAPI/uvicorn (PM2 scholars-tea-embedding, port 9997)
PostgreSQL + pgvector: 本地 docker-compose 仅 postgres；生产更像源码/外部 PG + PM2
外部入口: frp 隧道（next.config.js / ecosystem 证据）
代理: PM2 baseEnv 统一 127.0.0.1:7890
```

包管理：root / server / hermes-agent 三个独立 `package.json`，无 workspace；root 使用 npm + `package-lock.json`。

## 3. 依赖地图

关键依赖与用途：

- 主栈：Next.js 14.2.35、React 18、TypeScript、Prisma 5.22、PostgreSQL/pgvector。
- 认证：`next-auth@4.24` + `@next-auth/prisma-adapter` 实际使用；`@auth/prisma-adapter` 并存但未用。
- 实时：`socket.io` / `socket.io-client`；socket server 另用 `pg` Pool、`jsonwebtoken`。
- AI：`src/lib/ai/*` 多 Provider 调用；`https-proxy-agent` + `node-fetch` + `undici` + 原生 fetch 并存。
- PDF：`pdfjs-dist` 前端渲染；`pdf2json` npm 依赖与 vendored `src/lib/utils/pdf2json/` 并存。
- UI：Radix、Tailwind、tiptap、pixi.js/Live2D。
- 测试：Vitest + RTL + Playwright，但正式用例很少。

## 4. 数据与存储地图

证据：`prisma/schema.prisma`、`src/lib/db/prisma.ts`、`server/src/db.ts`、`docker-compose.yml`、`src/app/api/v1/upload/route.ts`。

- 数据库：PostgreSQL 16 + pgvector；schema 约 30 个模型，覆盖 User/Auth、Institution/Group、Post/Comment/Vote、Publication/Citation、TeaParty、Workshop、Knowledge/RAG、Translation。
- 缓存：无 Redis；验证码限流/存储、翻译缓存都在 Postgres。
- 对象存储：无 MinIO/S3；上传写 `public/uploads/`。
- 向量：`Unsupported("vector")` 列不受 Prisma migrate 管控；embedding 有本地服务 9997 与 `@xenova/transformers` 双路径，实际生效路径待确认。

## 5. 指定模块定位与分类（Spec §25）

### 5.1 Hermes / Agent

证据：`src/app/api/v1/hermes/chat/route.ts`、`src/lib/ai/hermes-gateway-adapter.ts`、`src/lib/ai/tool-call-guard.ts`、`hermes-home/config.yaml`、`hermes-home/hermes-agent/`。

- 架构：Next.js → 本机 Python Hermes Gateway `127.0.0.1:8642`（OpenAI 兼容）→ Provider。
- 纯文本聊天只走 Gateway，无直连回退；Gateway 宕机即 AI 不可用。
- 亮点：`tool-call-guard.ts` 对白名单/黑名单 tool call 做拦截，保留价值高。
- 问题：Gateway client 逻辑至少三份重复；人格 prompt 多份；`hermes-home/config.yaml` 及备份/状态文件被 git 跟踪且含敏感配置。

分类：**局部重构/参考替换**。OpenScience 不直接继承 Python Hermes Gateway；参考其 toolsets/skills/审批思想，在 `packages/ai-gateway` 重建 Node 侧统一网关。

### 5.2 AI Workshop

证据：`src/app/api/v1/ai/chat/route.ts`、`src/lib/ai/agent-modes.ts`、`src/lib/ai/claude-service.ts`、`src/lib/ai/zai-service.ts`、`src/lib/ai/translation-service.ts`。

- 五模式 Workshop（论文生成/审稿/综述/分析/基金）默认 Hermes，失败回退直调链。
- 主回退链历史为 GLM 系列 → MiniMax → ZCHAT → DeepSeek；与 OpenScience 已确认的 MiniMax-M3 主模型不一致。
- `claude-service.ts` 名称误导，已非 Claude；ZAI 调用存在双实现。

分类：**局部重构**。保留模式编排与 prompt 资产，Provider 调用必须收口到新 AI Gateway，主模型改 MiniMax-M3。

### 5.3 认证

证据：`src/lib/auth/auth.ts`、`src/lib/auth/password.ts`、`src/lib/auth/verification-code.ts`、`src/app/api/v1/auth/*`。

- 优点：NextAuth v4 JWT + Credentials；邮箱/手机验证码；防枚举；60s 冷却；IP 限流；PBKDF2-SHA512 100k + timingSafeEqual。
- 问题：SMS sender 是纯 stub；JWT 30 天无法吊销，密码重置后旧 token 仍有效；`Session`/`VerificationToken` 在 JWT 策略下近似死表；`src/lib/auth/options.ts` 是死文件。

分类：**保留 + 局部重构**。OpenScience 可复用流程与防枚举/限流思想，但需改为可吊销 session/刷新机制、真实短信或下线 SMS、异步 KDF/更强参数策略。

### 5.4 上传

证据：`src/app/api/v1/upload/route.ts`、调用方 `MessageInput.tsx`、`ChatInput.tsx`、`PaperGenerationPanel.tsx`。

- 现状：multipart → 10MB → 写 `public/uploads/<uuid>.<ext>` → 返回 URL。
- 高危：无登录校验；`.html/.svg` 未有效拦截，存在同源存储型 XSS 风险；URL protocol 恒为 http 的 bug；注释自认生产应迁 MinIO/S3。

分类：**替换**。OpenScience 必须按 Baseline §13 使用 Storage Adapter、分片、校验和、MIME 检测、病毒扫描与配额。

### 5.5 社区（Posts/Comments/Groups/Top-Questions）

证据：`src/app/api/v1/posts/**`、`comments/**`、`groups/**`、`top-questions/**`、`src/services/*`。

- 服务层模式清晰，route 鉴权/参数 → service Prisma 数据访问。
- 高危：`groups` POST、`groups/[id]` PATCH/DELETE 无鉴权。
- 遗留：`TopQuestion`/`QuestionVote` schema 已无对应 API，现行 top-questions 基于 `Post.topTenVotes`。

分类：**保留领域语义，局部重构**。OpenScience MVP 不承接普通帖子/Top Questions（Phase 2），但 Publication/Citation/Group/Comment 的经验可用于 RO 评论、Issue、机构/工作组模型。

### 5.6 WebSocket / Tea Party

证据：`server/src/index.ts`、`server/src/handlers/*`、`server/src/middleware/auth.ts`、`src/hooks/useTeaPartySocket.ts`、`src/app/api/v1/auth/socket-token/route.ts`。

- 独立 Socket.io 进程，polling-only（frp 隧道限制），JWT 鉴权后查库。
- 高危/缺陷：socket token 签发与验证密钥源不一致且有硬编码兜底密钥；房间 join/message 存在 REST(Prisma/cuid) 与 socket（裸 SQL/randomUUID) 双写；`message:history` 用 cuid 字符串比较做游标，翻页错乱。

分类：**替换/延后**。Tea Party/实时群聊属 Baseline Phase 2，不进 MVP；若保留，需改为统一 DB 层、统一密钥源、单写路径。

### 5.7 模型路由

证据：`src/lib/ai/claude-service.ts`、`src/lib/ai/translation-service.ts`、`src/app/api/v1/hermes/chat/route.ts`、`src/lib/ai/rag-service.ts`。

- 现状：多条回退链分散在 chat、vision、translation、rag 中；Provider SDK/fetch 调用散落。
- OpenScience 要求：所有模型调用经统一 AI Gateway；主模型 MiniMax-M3；回退策略配置化，不写死。

分类：**替换**。保留 provider 适配经验与 tool-call-guard，路由实现重建。

## 6. 保留 / 局部重构 / 替换 / 待确认

| 模块/资产 | 分类 | 证据 | 对 OpenScience 的处理 |
|---|---|---|---|
| `src/services/{posts,comments,groups,top-questions,tea-party}` | 保留 | route→service 模式清晰 | 借鉴服务层边界；不照搬社区 Phase 2 功能 |
| 统一 API 响应 `src/lib/api/response.ts`、`error-codes.ts` | 保留 | 全路由统一封装 | 可迁移为 `packages/domain`/API 错误规范 |
| 认证验证码流 `verification-code.ts`、防枚举、限流 | 保留+局部重构 | `src/lib/auth/*` | 复用设计；补可吊销、真实 SMS/下线、异步 KDF |
| NextAuth JWT 主链路 | 局部重构 | `src/lib/auth/auth.ts` | MVP 可借鉴，正式上线前评估 session 可吊销与实名状态 |
| Prisma 社区/学术资产模型 | 保留+映射 | `prisma/schema.prisma` | 映射到 Workspace/RO/Issue/Comment/Citation，不直接继承 |
| `tool-call-guard.ts` | 保留 | AI 路由均接入 | 迁入 Hermes/AI Gateway 安全层 |
| `zai-service.ts`、`rag-service.ts`、`citation-verifier.ts`、`external-paper-search.ts` | 局部重构 | AI 域证据 | 作为 provider/检索/校验模块候选，接口改经 AI Gateway |
| 上传 `upload/route.ts` | 替换 | 无鉴权、本地盘、协议 bug | 按 Baseline Storage Adapter 重建 |
| Hermes Python Gateway 运行时 | 替换/参考 | `hermes-home/*` | 不进入 MVP 主路径；参考 toolsets/skills/审批 |
| Socket.io server 裸 SQL 双写 | 替换/延后 | `server/src/*` | Phase 2 再评估；MVP 不承接 Tea Party |
| Prisma 迁移体系 | 局部重构（高优先） | 空 baseline | 新系统必须基线快照 + 全部 migrate |
| 部署 `deploy.yml` + PM2 | 局部重构 | 手动 SSH + PM2 | 补 migrate、测试门禁、回滚；脚本群收敛 |
| vendored `src/lib/utils/pdf2json/`、重复 seed/fix/deploy 脚本 | 替换/归档 | 多版本证据 | 保留一份活版本，其余待用户批准归档 |
| `hermes/config.yaml` 是否实际加载、ZCHAT 中转模型有效性、`quality-review.ts` 是否死代码、embedding 双路径 | 待确认 | 子审计交叉证据 | 进入迁移前确认清单 |

## 7. 风险登记册

### Critical / High

1. **敏感配置进入 git**：`git ls-files` 确认 `.env.postgres`、`hermes-home/config.yaml`、`hermes/config.yaml`、`hermes-home/gateway_state.json`、`hermes-home/backup/*.bak` 被跟踪；子审计确认 Hermes 配置含明文 key。处理：轮换相关凭据；将运行态/密钥文件移出版本控制；评估 git 历史清理。注意：本审计未读取/打印任何值。
2. **鉴权缺口**：`groups` 写接口与 `upload` 接口无登录校验（`groups/route.ts`、`groups/[id]/route.ts`、`upload/route.ts`）。
3. **socket 密钥不一致**：签发端 `SOCKET_SECRET || NEXTAUTH_SECRET || 硬编码兜底`，验证端仅 `NEXTAUTH_SECRET`（`socket-token/route.ts`、`server/src/middleware/auth.ts`）。
4. **迁移体系失效**：`prisma/migrations/init_baseline/migration.sql` 为空 baseline；部署无 `prisma migrate deploy`。
5. **生产失效功能**：`sms-sender.ts` 永远返回 true，手机验证码通道在生产不可用。
6. **双 DB 栈**：Prisma 与 socket 裸 `pg` SQL 并行，schema 演进高风险。

### Medium

7. 存储型 XSS：上传未拦 `.html/.svg` 且同源静态服务。
8. E2E 直连生产地址（`tests/e2e/auth-flow.spec.ts`），有污染生产数据风险。
9. 密码重置不使旧 JWT 失效；JWT 30 天不可吊销。
10. SMTP 未配置时验证码明文进日志；IP 限流信任可伪造 `x-forwarded-for`。
11. 本地 embedding/向量维度变更无批量 reindex 迁移方案。
12. `tests/` 存在本地 pem 文件；本次 `git ls-files '*.pem'` 未确认其被跟踪，但仍应按敏感本地文件处理，删除需用户批准。

### Low / Hygiene

13. 死文件/死配置：`src/lib/auth/options.ts`、`src/lib/socket/` 空目录、`tests/unit` 死路径、`REDIS_URL` 无消费者。
14. 文档漂移：`.claude/rules/testing.md` 声称无测试框架；`AGENTS.md` TS 版本与 package.json 不一致。
15. CI `main` 分支触发可能为死配置（远程默认分支证据指向 develop）。

## 8. 对 OpenScience 的迁移含义

建议进入 Phase 1A 前确认以下原则：

1. **不整体继承**：Scholars Tea 作为模块供应库与风险样本，不作为 OpenScience 运行架构。
2. **先补救再复用**：认证/服务层/AI 安全闸可抽取；上传、模型路由、socket、迁移体系必须重建。
3. **数据模型映射而非拷贝**：User/Group/Publication/Citation/Comment 映射到 Workspace/RO/Issue/PR/Review/Citation；普通帖子、Top Questions、Tea Party 记录为 Phase 2。
4. **秘密 hygiene 是门禁**：在复用任何 Hermes 配置前，必须完成凭据轮换与 git 跟踪清理，否则不得把该仓库作为公开/协作模板。
5. **AI 路由按新基线**：MiniMax-M3 主模型；回退策略配置化；Provider SDK 只存在于 `packages/ai-gateway`。

## 9. 本次未做事项

- 未启动 Next/socket/embedding/Hermes 服务，未做基准性能测试。
- 未运行 vitest/Playwright（避免 E2E 打生产或产生写入）。
- 未读取 `.env`、`.env.postgres`、`.mcp.json` 的值；只核实 git 跟踪状态。
- 未对目标仓库做任何修改、删除、归档。

## 10. 证据命令

- `ls -la`（目标根目录结构）
- `git log -1 --oneline` → `74eb3f7 ...`
- `git status --short | head -40` → 存在大量未提交修改/删除
- `git ls-files -- .env .env.postgres .mcp.json 'tests/*.pem' '**/*.pem' hermes-home/config.yaml hermes/config.yaml hermes-home/gateway_state.json hermes-home/backup` → 确认 `.env.postgres`、Hermes 配置/state/backup 被跟踪；未输出 `.env`、`.mcp.json`、pem 跟踪记录
- 子审计域：依赖运行、API 服务、AI/Hermes、数据认证、测试部署文档（结论已并入本报告）
