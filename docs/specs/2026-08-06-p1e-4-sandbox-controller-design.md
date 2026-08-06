# P1E-4 Sandbox Controller 与隔离 Docker 网络设计文档

**任务**: 实现 Sandbox Controller 与隔离 Docker 网络  
**设计者**: Claude Opus 4.8  
**创建日期**: 2026-08-06  
**依赖**: P1E-3 (Sandbox Base Image)  
**参考规格**: Spec §10.3、§14.1、§14.2、§15、§17、§21.1

---

## 1. 目标

实现 `apps/science-worker` 中的 Sandbox Controller 服务，调度临时执行容器并落实全部资源与网络隔离限制。

### 1.1 核心职责

- **容器生命周期管理**: 创建、监控、销毁一次性沙箱容器
- **资源隔离**: CPU/内存/进程数/文件数/输出大小限制
- **网络隔离**: 禁止公网、内网、云元数据访问（169.254.169.254）
- **安全约束**: 非 root、只读根 FS、临时目录、禁止挂载宿主目录与 Docker Socket
- **执行管理**: 30 秒超时、执行完成立即销毁容器

### 1.2 验收标准 (Spec §21.2 步骤 16)

- 容器按限制运行并到期销毁
- 容器内尝试访问数据库网段、公网、云元数据地址全部失败
- 超时/内存/输出截断生效

---

## 2. 架构决策

### 2.1 技术栈

| 组件 | 选型 | 理由 |
|------|------|------|
| 容器编排库 | dockerode | Node.js 生态标准 Docker API 客户端 |
| 网络隔离 | Docker Network (sandbox_control_net) | 单 ECS 阶段独立网络段 |
| 超时控制 | AbortController + container.wait() | 原生异步超时机制 |
| 输出收集 | container.logs() stream | 实时收集 stdout/stderr |

### 2.2 网络拓扑 (Spec §14.2)

```
生产环境网络分段:
┌────────────────────────────────────────────────────────────┐
│ ECS (172.18.130.203)                                        │
│                                                             │
│  ┌─────────────────┐   ┌───────────────────────────────┐  │
│  │ nginx (公网)     │   │ Docker Networks               │  │
│  │ 115.29.208.1:80 │──▶│                              │  │
│  └─────────────────┘   │  app_net (api/web/worker)    │  │
│                        │  ├─ API       (内网 RO)       │  │
│                        │  ├─ Web       (内网 RO)       │  │
│                        │  └─ Worker    (内网 RO)       │  │
│                        │                              │  │
│                        │  data_net (database/redis)   │  │
│                        │  ├─ PostgreSQL (无公网绑定)   │  │
│                        │  └─ Redis     (无公网绑定)   │  │
│                        │                              │  │
│                        │  sandbox_control_net         │  │
│                        │  └─ Worker    (调度侧)       │  │
│                        │                              │  │
│                        │  none (沙箱容器运行时)        │  │
│                        │  └─ Sandbox Containers       │  │
│                        │     (--network none)        │  │
│                        └───────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

**关键隔离**:
- `sandbox_control_net`: Worker 需访问 Docker Socket，但沙箱容器不加入此网络
- `--network none`: 沙箱容器运行时完全无网络（不加入 data_net、app_net、sandbox_control_net）
- 数据库不绑定公网（已在 P1A-9 落实）

---

## 3. 实现规格

### 3.1 容器运行参数 (Spec §10.3 全部)

```typescript
// dockerode ContainerCreateOptions
const containerConfig = {
  Image: 'openscience-sandbox:latest',
  Cmd: ['python3', '-c', script],
  
  // 资源限制
  HostConfig: {
    Memory: 1024 * 1024 * 1024,        // 1 GB (§10.3 单核 CPU、1 GB 内存)
    MemorySwap: 1024 * 1024 * 1024,    // 禁止 swap
    NanoCpus: 1_000_000_000,            // 1.0 CPU
    PidsLimit: 64,                      // 进程数上限 (§10.3 进程数上限)
    
    // 文件系统隔离
    ReadonlyRootfs: true,               // 只读根 FS (§10.3 只读根 FS)
    Tmpfs: {
      '/tmp': 'size=100m,noexec'        // 临时目录 100MB 上限 (§10.3 临时目录、文件数上限)
    },
    
    // 网络隔离
    NetworkMode: 'none',                // 禁止网络 (§10.3 禁止公网/内网/云元数据)
    
    // 安全约束
    CapDrop: ['ALL'],                   // 移除所有 capabilities
    SecurityOpt: ['no-new-privileges'], // 禁止提权
    
    // 禁止挂载 (§10.3 禁止挂载宿主目录与 Docker Socket)
    Binds: [],                          // 空绑定列表
    Mounts: []                          // 空挂载列表
  },
  
  // 用户 (§10.3 非 root)
  User: 'sandbox',                      // UID 1000 (P1E-3 Dockerfile)
  
  // 环境变量 (§10.3 不注入数据库凭据)
  Env: [
    'PYTHONUNBUFFERED=1',
    'MPLBACKEND=Agg'
  ]
};
```

### 3.2 超时控制 (§10.3 30 秒超时)

```typescript
async function runSandboxScript(script: string): Promise<SandboxResult> {
  const container = await docker.createContainer(containerConfig);
  
  try {
    await container.start();
    
    // 30 秒超时
    const timeout = 30_000;
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
      container.kill().catch(() => {});
    }, timeout);
    
    const result = await Promise.race([
      container.wait({ abortSignal: abortController.signal }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), timeout)
      )
    ]);
    
    clearTimeout(timeoutId);
    
    // 收集输出 (§10.3 输出大小上限)
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail: 10000  // 防止无限输出
    });
    
    return { success: true, output: logs.toString('utf8').slice(0, 1024 * 1024) };  // 1MB 上限
  } finally {
    // §10.3 执行完成立即销毁容器
    await container.remove({ force: true }).catch(() => {});
  }
}
```

### 3.3 输出收集与大小限制

- **实时收集**: `container.logs()` stream
- **大小上限**: 1 MB (§10.3 输出大小上限)
- **行数截断**: `tail: 10000`
- **字符编码**: UTF-8

---

## 4. 数据模型 (Spec §15)

### 4.1 SandboxJob

```prisma
model SandboxJob {
  id            String   @id @default(uuid())
  workspaceId   String
  userId        String
  script        String   @db.Text
  status        SandboxJobStatus
  result        Json?
  createdAt     DateTime @default(now())
  completedAt   DateTime?
  
  workspace     Workspace @relation(...)
  user          User      @relation(...)
  artifacts     SandboxArtifact[]
}

enum SandboxJobStatus {
  pending
  running
  completed
  failed
  timeout
  cancelled
}
```

### 4.2 SandboxArtifact

```prisma
model SandboxArtifact {
  id          String      @id @default(uuid())
  jobId       String
  filename    String
  mimeType    String
  size        Int
  data        Bytes       // 临时存储（24 小时 TTL，P1E-6 IndexedDB）
  createdAt   DateTime    @default(now())
  
  job         SandboxJob  @relation(...)
}
```

---

## 5. 安全测试 (Spec §21.1 安全测试层)

### 5.1 网络隔离测试

```python
# 测试 1: 公网访问拒绝
import socket
socket.create_connection(('8.8.8.8', 53), timeout=5)  # 预期失败

# 测试 2: 云元数据访问拒绝
import urllib.request
urllib.request.urlopen('http://169.254.169.254/latest/meta-data/', timeout=5)  # 预期失败

# 测试 3: 内网 data_net 访问拒绝
socket.create_connection(('172.18.0.2', 5432), timeout=5)  # PostgreSQL，预期失败
```

### 5.2 资源限制测试

```python
# 测试 4: 内存限制
import numpy as np
huge_array = np.zeros((1024, 1024, 1024), dtype=np.float64)  # 8 GB，预期 OOM 被杀

# 测试 5: 输出截断
for i in range(100000):
    print('x' * 10000)  # 预期输出被截断到 1 MB

# 测试 6: 超时
import time
time.sleep(60)  # 预期 30 秒后被杀
```

### 5.3 文件系统隔离测试

```python
# 测试 7: 根文件系统只读
with open('/etc/passwd', 'a') as f:
    f.write('hack')  # 预期失败

# 测试 8: /tmp 可写但 noexec
with open('/tmp/test.txt', 'w') as f:
    f.write('ok')  # 预期成功
import subprocess
subprocess.run(['/tmp/test.sh'])  # 预期失败（noexec）
```

---

## 6. 部署配置

### 6.1 docker-compose.prod.yml 更新

```yaml
networks:
  sandbox_control_net:
    driver: bridge
    ipam:
      config:
        - subnet: 172.19.0.0/24

services:
  science-worker:
    networks:
      - app_net
      - sandbox_control_net  # Worker 需访问 Docker Socket
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro  # 只读挂载
    environment:
      DOCKER_SOCKET_PATH: /var/run/docker.sock
```

### 6.2 安全组规则 (无变更)

- 80/443 公网入站（已配置）
- 22 受限运维入口（已配置）
- 数据库不绑定公网（P1A-9 已落实）

---

## 7. 风险跟踪 (Spec §23、§24)

### 7.1 单 ECS 风险

| 风险 | 缓解措施 | 迁移计划 |
|------|---------|---------|
| 沙箱与数据库同机 | Docker 网络分段 + --network none | 独立 ECS (§23 风险 5) |
| 沙箱逃逸可能性 | Capabilities drop + no-new-privileges + 只读根 FS | P1E-8 威胁模型与基线测试 |
| 资源竞争 | 严格资源限制 (1 CPU / 1 GB) | 独立 ECS + 配额限流 (P1E-5) |

### 7.2 待确认项 (§24)

- 生产开放前独立 ECS 规格与带宽
- 沙箱逃逸责任限制与法律免责声明文案

---

## 8. 实现检查清单

- [ ] apps/science-worker/src/sandbox-controller.ts
- [ ] dockerode 依赖安装
- [ ] 容器运行参数对齐 §10.3 全部 9 项
- [ ] 30 秒超时与自动销毁
- [ ] 输出大小 1 MB 上限
- [ ] docker-compose.prod.yml 添加 sandbox_control_net
- [ ] 8 项安全测试（网络隔离 3 + 资源限制 3 + 文件系统 2）
- [ ] 集成测试：任务提交→容器运行→销毁→结果返回
- [ ] 文档：apps/science-worker/README.md

---

**设计确认**: 本设计对齐 Spec §10.3 全部限制、§14.2 网络拓扑、§21.1 安全测试层。生产开放前需独立 ECS 迁移（§23 风险 5）。
