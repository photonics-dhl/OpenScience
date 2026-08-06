# P1E-4 Sandbox Controller 实现计划

**任务**: P1E-4 Sandbox Controller 与隔离 Docker 网络  
**制定者**: Claude Opus 4.8  
**创建日期**: 2026-08-06  
**前置**: P1E-3 (沙箱基础镜像 openscience-sandbox:latest 已就绪)  
**参考**: [2026-08-06-p1e-4-sandbox-controller-design.md](../specs/2026-08-06-p1e-4-sandbox-controller-design.md)

---

## 1. 实施步骤

### 1.1 安装 dockerode 依赖

```bash
cd apps/science-worker
pnpm add dockerode
pnpm add -D @types/dockerode
```

### 1.2 实现 sandbox-controller.ts

**落点**: `apps/science-worker/src/sandbox-controller.ts`

```typescript
import Docker from 'dockerode';

export interface SandboxConfig {
  image: string;
  timeout: number;
  memoryLimit: number;
  cpuLimit: number;
  maxOutputSize: number;
}

export interface SandboxResult {
  success: boolean;
  output?: string;
  error?: string;
  exitCode?: number;
  timeout?: boolean;
}

export class SandboxController {
  private docker: Docker;
  private config: SandboxConfig;

  constructor(config?: Partial<SandboxConfig>) {
    this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
    this.config = {
      image: 'openscience-sandbox:latest',
      timeout: 30_000,
      memoryLimit: 1024 * 1024 * 1024,
      cpuLimit: 1_000_000_000,
      maxOutputSize: 1024 * 1024,
      ...config
    };
  }

  async execute(script: string): Promise<SandboxResult> {
    // 实现见设计文档 §3.2
  }

  private createContainerConfig(script: string) {
    // 实现见设计文档 §3.1
  }

  private async collectOutput(container: Docker.Container): Promise<string> {
    // 实现见设计文档 §3.3
  }
}
```

### 1.3 实现数据模型迁移

**落点**: `packages/database/migrations/13-sandbox-jobs.sql`

```sql
-- §4 数据模型
CREATE TYPE sandbox_job_status AS ENUM (
  'pending', 'running', 'completed', 'failed', 'timeout', 'cancelled'
);

CREATE TABLE sandbox_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  user_id UUID NOT NULL REFERENCES users(id),
  script TEXT NOT NULL,
  status sandbox_job_status NOT NULL DEFAULT 'pending',
  result JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE sandbox_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES sandbox_jobs(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  data BYTEA NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sandbox_jobs_workspace ON sandbox_jobs(workspace_id);
CREATE INDEX idx_sandbox_jobs_user ON sandbox_jobs(user_id);
CREATE INDEX idx_sandbox_artifacts_job ON sandbox_artifacts(job_id);
```

### 1.4 实现安全测试套件

**落点**: `apps/science-worker/test/sandbox-security.test.ts`

8 项安全测试（设计文档 §5）：
1. 公网访问拒绝
2. 云元数据访问拒绝
3. 内网 PostgreSQL 访问拒绝
4. 内存限制 OOM
5. 输出截断
6. 超时被杀
7. 根文件系统只读
8. /tmp 可写但 noexec

### 1.5 更新 docker-compose.prod.yml

**落点**: `docker-compose.prod.yml`

```yaml
networks:
  sandbox_control_net:
    driver: bridge
    ipam:
      config:
        - subnet: 172.19.0.0/24

services:
  science-worker:
    build:
      context: .
      dockerfile: apps/science-worker/Dockerfile
    networks:
      - app_net
      - sandbox_control_net
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    environment:
      DOCKER_SOCKET_PATH: /var/run/docker.sock
      DATABASE_URL: ${DATABASE_URL}
```

### 1.6 实现集成测试

**落点**: `apps/science-worker/test/sandbox-controller.integration.test.ts`

测试场景：
- 正常执行：提交脚本 → 容器运行 → 收集输出 → 销毁容器
- 超时场景：30s 超时 → 容器被杀 → 返回 timeout=true
- 错误场景：Python 语法错误 → exitCode 非 0 → 错误输出

### 1.7 文档

**落点**: `apps/science-worker/README.md`

- 职责说明
- 资源限制清单
- 网络隔离拓扑
- 本地测试方法
- 安全测试结果

---

## 2. 本地开发与测试

### 2.1 前置条件

- Docker Desktop 运行（Win/Mac）或 Docker Engine（Linux）
- P1E-3 镜像存在：`docker images | grep openscience-sandbox`

### 2.2 本地测试流程

```bash
# 1. 构建 science-worker
cd apps/science-worker
pnpm build

# 2. 运行单元测试（不需要 Docker）
pnpm test

# 3. 运行集成测试（需要 Docker）
pnpm test:integration

# 4. 运行安全测试
pnpm test sandbox-security.test.ts
```

### 2.3 云端部署验证

```bash
# 1. 上传
scp -i ~/.ssh/id_ed25519_xgs -P 22 -r apps/science-worker root@115.29.208.1:/opt/openscience/apps/

# 2. 构建与测试
ssh -i ~/.ssh/id_ed25519_xgs -p 22 root@115.29.208.1 \
  "cd /opt/openscience/apps/science-worker && pnpm install && pnpm build && pnpm test:integration"
```

---

## 3. 验收标准 (Spec §21.2 步骤 16)

- [ ] 容器按限制运行并到期销毁
- [ ] 容器内尝试访问数据库网段、公网、云元数据地址全部失败
- [ ] 超时/内存/输出截断生效
- [ ] 集成测试全绿
- [ ] 8 项安全测试全绿

---

## 4. 实施注意事项

### 4.1 Windows 本地开发限制

- Docker Desktop 默认使用 npipe，dockerode 需配置 `socketPath: '//./pipe/docker_engine'`
- Windows 路径转换：`/var/run/docker.sock` → `//./pipe/docker_engine`

### 4.2 云端生产部署

- Docker Socket 只读挂载：`/var/run/docker.sock:/var/run/docker.sock:ro`
- 独立 Docker Network: `sandbox_control_net`
- 沙箱容器 `--network none`（不加入 data_net）

### 4.3 风险跟踪

- **单 ECS 风险**: 沙箱与数据库同机（§23 风险 5）
- **缓解措施**: Docker 网络分段 + --network none
- **迁移计划**: 生产开放前独立 ECS（§24 待确认）

---

## 5. 后续任务

- **P1E-5**: /sandbox-jobs API、配额限流与完成事件
- **P1E-6**: 可视化结果展示与 IndexedDB 临时保存
- **P1E-8**: 威胁模型与沙箱逃逸基线测试

---

**计划确认**: 本计划对齐 Spec §10.3 全部限制、§14.2 网络拓扑、§21.1 安全测试层。实施完成后提交 GitHub 并更新 task-master。
