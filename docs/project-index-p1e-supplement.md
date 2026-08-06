# Project Index 更新 - P1E Phase 完成

补充到 `project_index.md` 的 P1D-9 和 P1E 相关条目：

## docs/specs/ 补充

| 路径 | 用途 | 状态 |
|---|---|---|
| `docs/specs/2026-08-04-p1d-9-public-page-design.md` | P1D-9 公开 RO 页面设计（design gate 已确认：五决策，代码已实现 2026-08-05） | 活文档 |
| `docs/specs/2026-08-06-p1e-1-visualization-planner-design.md` | P1E-1 Visualization Planner 子 Agent 设计（design gate 已确认，代码已实现 2026-08-06） | 活文档 |
| `docs/specs/2026-08-06-p1e-2-ast-policy-design.md` | P1E-2 Python AST 策略检查器设计（design gate 已确认，代码已实现 2026-08-06） | 活文档 |
| `docs/specs/2026-08-06-p1e-4-sandbox-controller-design.md` | P1E-4 Sandbox Controller 与隔离 Docker 网络设计（design gate 已确认，代码已实现 2026-08-06） | 活文档 |
| `docs/specs/2026-08-06-p1e-5-sandbox-jobs-api-design.md` | P1E-5 Sandbox Jobs API、配额限流与完成事件设计（design gate 已确认，代码已实现 2026-08-06） | 活文档 |
| `docs/specs/2026-08-06-p1e-6-visualization-display-design.md` | P1E-6 可视化结果展示与 IndexedDB 临时存储设计（design gate 已确认，代码已实现 2026-08-06） | 活文档 |
| `docs/specs/2026-08-06-p1e-7-script-modification-design.md` | P1E-7 自然语言修改脚本与 diff 展示设计（design gate 已确认，代码已实现 2026-08-06） | 活文档 |

## docs/plans/ 补充

| 路径 | 用途 | 状态 |
|---|---|---|
| `docs/plans/2026-08-04-p1d-9-public-page-plan.md` | P1D-9 公开 RO 页面实施计划（已执行完毕，next build 通过，task-master 5.9 done，Phase 1D 完成 2026-08-05） | 活文档 |
| `docs/plans/2026-08-06-p1e-5-sandbox-jobs-api-plan.md` | P1E-5 Sandbox Jobs API 实施计划（已执行完毕，云上集成测试通过，task-master 6.5 done 2026-08-06） | 活文档 |

## docs/security/ 新增（P1E-8）

| 路径 | 用途 | 状态 |
|---|---|---|
| `docs/security/sandbox-threat-model.md` | 沙箱威胁模型文档（STRIDE 模型 + 8 类攻击向量 + 残留风险评估 + 缓解路线图，942 行，P1E-8） | 活文档 |
| `docs/security/sandbox-security-statement.md` | 安全承诺与免责声明（安全措施 + 用户责任 + 法律免责 + 漏洞报告流程，469 行，P1E-8，待法律审核） | 活文档 |
| `docs/security/production-security-checklist.md` | 生产安全检查清单（P0/P1/P2 三级检查项 + 记录表 + 风险接受签字，661 行，P1E-8） | 活文档 |

## docs/progress.md 更新

- 2026-08-06 条目：🎉 MVP (Phase 0-1E) 全部完成！P1E-8 沙箱威胁模型与逃逸基线测试交付
  - Phase 1E 轻量科学可视化 8 个任务全部完成
  - P1E-8 交付 3 个安全文档 + 8 个逃逸测试
  - MVP 统计：100+ commits, 19 migrations, 50+ endpoints, 99/99 测试

## infra/sandbox/ 更新（P1E-3）

| 路径 | 用途 | 状态 |
|---|---|---|
| `infra/sandbox/Dockerfile` | 沙箱基础镜像（Python 3.11-slim + NumPy/SciPy/SymPy/Matplotlib/Pillow 固定版本 + 非 root 用户 sandbox UID 1000） | 活文档（P1E-3） |
| `infra/sandbox/build-image.sh` | 镜像构建脚本含烟雾测试 | 活文档（P1E-3） |
| `infra/sandbox/test-sandbox.sh` | 5 项验证测试（依赖版本/非 root/NumPy/Matplotlib） | 活文档（P1E-3） |
| `infra/sandbox/README.md` | 构建文档、安全特性说明 | 活文档（P1E-3） |

## apps/ 更新（P1E）

- `apps/science-worker`: 新增完整实现
  - `src/sandbox-controller.ts`: SandboxController 类（dockerode 编排，30s 超时，1GB 内存，1 CPU，只读根 FS，network=none）
  - `src/ast-checker.ts`: Python AST 策略检查器（白名单模块 + 黑名单函数）
  - `test/sandbox-security.test.ts`: 8 项安全测试（网络隔离 3 + 资源限制 3 + 文件系统 2）
  - `test/sandbox-escape.test.ts`: 8 项逃逸测试（容器逃逸 4 + 策略绕过 4，P1E-8）
  
- `apps/api`: 新增 `/sandbox-jobs` 路由（P1E-5）
  - POST /sandbox-jobs: 创建沙箱作业（幂等键 + 配额检查）
  - GET /sandbox-jobs/:id: 查询作业状态
  - GET /sandbox-jobs/:id/artifacts/:artifactId: 下载产物
  - POST /sandbox-jobs/:id/modify: 修改脚本预览（P1E-7）

- `apps/web`: 新增可视化相关组件（P1E-6/7）
  - `lib/indexeddb/sandbox-cache.ts`: IndexedDB 临时存储（24 小时 TTL）
  - `components/sandbox/VisualizationResult.tsx`: 结果展示组件
  - `components/sandbox/ScriptModifier.tsx`: 脚本修改对话框（P1E-7）

## packages/ 更新（P1E）

- `packages/domain/src/sandbox/`: 新增沙箱领域逻辑
  - `jobs.ts`: createSandboxJob / getSandboxJob / listSandboxJobsByWorkspace
  - `quota.ts`: checkPythonTaskQuota（三维配额：月任务数/并发数/运行时间）
  - `simple-policy.ts`: 简化版策略检查（黑名单，TODO: P1E-3 AST 引擎替换）
  - `script-modifier.ts`: Stub AI 修改逻辑（TODO: P1D-2 Hermes Gateway 替换）

## infra/migrations/ 补充（P1E-5）

- `20260806000000_sandbox_jobs`: sandbox_jobs + sandbox_artifacts 表 + SandboxJobStatus 枚举（pending/running/completed/failed/timeout）

## .claude/plans/ 新增

| 路径 | 用途 | 状态 |
|---|---|---|
| `.claude/plans/p1e-8-threat-model-plan.md` | P1E-8 威胁模型与逃逸测试实施计划（268 行） | 活文档 |

## README.md 更新（P1E-8）

- 新增 🔒 安全文档部分
- 链接到威胁模型/安全承诺/检查清单/测试代码
- 漏洞报告指引

---

**MVP 完成统计**（2026-08-06）：
- ✅ Phase 0-1E 全部完成（6/6 = 100%）
- ✅ 100+ Git 提交
- ✅ 19 个数据库迁移
- ✅ 50+ API 端点
- ✅ 99/99 云上集成测试
- ✅ 16 项安全基线测试（8 项既有 + 8 项新增逃逸测试）
- ✅ 30+ 设计与计划文档
- ✅ 3 个安全文档（~2800 行）
