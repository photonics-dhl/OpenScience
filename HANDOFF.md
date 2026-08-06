# Session Handoff - 2026-08-06

## 当前状态
P1E Phase 进度: 3/8 任务完成，P1E-5 设计完成待实施

## 已完成工作

### P1E-3: 沙箱基础镜像（云端验证完成）
- **修复**: Aliyun PyPI 镜像源 (infra/sandbox/Dockerfile)
- **修复**: docker cp 替代 volume mount (infra/sandbox/test-sandbox.sh)
- **验证**: 云端 5/5 测试通过
- **Commit**: 6c50561

### P1E-4: Sandbox Controller（22/23 测试通过）
- **实现**: apps/science-worker/src/sandbox-controller.ts (219行)
- **安全约束**: 
  - 30s 超时、1GB 内存、1.0 CPU、64 进程限制
  - 只读根文件系统、tmpfs /tmp noexec
  - network=none 隔离
  - CapDrop ALL + no-new-privileges
- **数据模型**: packages/database/migrations/13-sandbox-jobs.sql
- **测试**: apps/science-worker/test/sandbox-security.test.ts (22/23通过)
- **文档**: 设计/计划/README 完整
- **Commits**: ac8e362, df9a897

### P1E-5: Sandbox Jobs API（设计完成）
- **设计文档**: docs/specs/2026-08-06-p1e-5-sandbox-jobs-api-design.md
  - API 端点: POST/GET /sandbox-jobs, GET /sandbox-jobs/:id/artifacts/:artifactId
  - 配额设计: python_tasks_per_month, python_concurrent_tasks, python_runtime_seconds_per_month
  - 限流: 10 req/min for POST /sandbox-jobs
  - 事件: sandbox_job.completed 触发审计与计费
  - 安全: RBAC + resource ownership + 敏感内容过滤
- **实施计划**: docs/plans/2026-08-06-p1e-5-sandbox-jobs-api-plan.md
  - Domain 层: packages/domain/src/sandbox/{jobs,quota,events}.ts
  - API 层: apps/api/src/routes/sandbox-jobs.ts
  - 配额 seed: 9 条策略 (3类型 × 3等级)
  - 集成测试: 6 个场景
- **Commit**: 35877c9

## 下一步工作

### P1E-5 实施（大型任务）
**优先级**: 立即

**实施步骤**:
1. **Domain 层** (packages/domain/src/sandbox/)
   - jobs.ts: createSandboxJob, getSandboxJob, listSandboxJobsByWorkspace
   - quota.ts: checkPythonTaskQuota (三级 fallback)
   - events.ts: onSandboxJobCompleted (审计 + usage)

2. **API 层** (apps/api/src/routes/sandbox-jobs.ts)
   - POST /sandbox-jobs: 幂等性 + 配额检查 + 异步执行
   - GET /sandbox-jobs/:id: RBAC + resource ownership
   - GET /sandbox-jobs/:id/artifacts/:artifactId: 二进制流式传输

3. **限流配置** (apps/api/src/lib/rate-limit.ts)
   - 新增 '/sandbox-jobs': { points: 10, duration: 60 }

4. **配额 Seed** (packages/database/seeds/)
   - 9 条策略: free (3/1/900), pro (50/3/9000), team (200/10/36000)

5. **集成测试** (apps/api/test/sandbox-jobs.integration.test.ts)
   - 6 个场景: 创建/查询/配额超限/并发超限/限流/ownership

6. **云端部署**
   ```bash
   ssh xgs
   cd /root/OpenScience
   git pull
   pnpm install
   cd apps/api
   pnpm db:seed
   pm2 restart api
   pnpm test:integration -- sandbox-jobs
   ```

7. **Task-Master 更新**
   ```bash
   # 本地
   mcp__task-master-ai__set_task_status id=17 status=done
   ```

### 剩余任务
- **P1E-6**: 可视化结果展示 + IndexedDB 临时存储
- **P1E-7**: 自然语言脚本修改 + diff 显示
- **P1E-8**: 沙箱威胁模型文档 + 逃逸基线测试

## 关键约束

### 云端环境
- **SSH**: 115.29.208.1:22, 密钥 ~/.ssh/id_ed25519_xgs
- **原则**: 所有服务在服务器运行，本机不做任何运行包括 Docker 相关测试
- **测试**: 始终在云端执行

### 代码风格
- TypeScript strict mode
- 错误优先处理 (try-catch + 审计日志)
- RBAC + resource ownership 双重检查
- 幂等性保证 (Idempotency-Key)

### 集成依赖
- P1A-6: 审计日志 (recordAuditLog)
- P1A-7: 配额系统 (checkQuota, recordUsage)
- P1A-8: 限流系统 (rate-limit.ts)
- P1E-4: Sandbox Controller (SandboxController.execute)

## 决策记录

1. **配额设计**: 三级 fallback (workspace → user_level → global) 避免硬编码
2. **限流规则**: POST 10 req/min，GET 不限（读操作低风险）
3. **事件机制**: sandbox_job.completed 触发审计 + usage，解耦异步处理
4. **测试隔离**: 集成测试使用独立 workspace，避免配额污染

## 技术栈
- Fastify (API)
- Dockerode (容器编排)
- PostgreSQL (数据持久化)
- PM2 (进程管理)
- Jest (测试)

---

**新会话启动清单**:
1. 读取本文件
2. 读取 CLAUDE.md (全局偏好)
3. 读取 docs/specs/2026-08-06-p1e-5-sandbox-jobs-api-design.md
4. 读取 docs/plans/2026-08-06-p1e-5-sandbox-jobs-api-plan.md
5. 按实施步骤 1-7 执行
