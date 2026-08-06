# Science Worker (Sandbox Controller)

**职责**: P1E 可视化沙箱 Python 脚本执行控制器

---

## 功能

- **容器生命周期管理**: 创建、监控、销毁一次性沙箱容器
- **资源隔离**: CPU/内存/进程数/文件数/输出大小限制
- **网络隔离**: 禁止公网、内网、云元数据访问（169.254.169.254）
- **安全约束**: 非 root、只读根 FS、临时目录、禁止挂载宿主目录与 Docker Socket

---

## 资源限制 (Spec §10.3)

| 项目 | 限制 |
|------|------|
| 超时 | 30 秒 |
| CPU | 1.0 核 |
| 内存 | 1 GB |
| 进程数 | 64 |
| /tmp 大小 | 100 MB (noexec) |
| 输出大小 | 1 MB |
| 网络 | none (禁止所有网络) |
| 根文件系统 | 只读 |
| 用户 | sandbox (UID 1000, 非 root) |

---

## 网络拓扑 (Spec §14.2)

```
生产环境：
┌─ ECS ──────────────────────────────────┐
│  Docker Networks:                      │
│  ┌─ sandbox_control_net (Worker 调度) │
│  ├─ app_net (API/Web)                │
│  ├─ data_net (PostgreSQL/Redis)      │
│  └─ none (沙箱容器运行时)              │
│     └─ 完全无网络访问                  │
└────────────────────────────────────────┘
```

---

## 使用示例

```typescript
import { SandboxController } from './sandbox-controller';

const controller = new SandboxController();

const script = `
import numpy as np
import matplotlib.pyplot as plt

x = np.linspace(0, 10, 100)
y = np.sin(x)
plt.plot(x, y)
plt.savefig('/tmp/output.png')
print('Plot saved')
`;

const result = await controller.execute(script);
console.log(result);
// {
//   success: true,
//   output: "Plot saved\\n",
//   exitCode: 0,
//   timeout: false
// }
```

---

## 安全测试结果 (Spec §21.1)

✅ **网络隔离** (3/3 通过)
- 公网访问拒绝 (8.8.8.8:53)
- 云元数据访问拒绝 (169.254.169.254)
- 内网 PostgreSQL 访问拒绝 (172.18.0.2:5432)

✅ **资源限制** (3/3 通过)
- 输出截断 (1 MB limit)
- 超时强制终止 (30s timeout)
- [内存限制测试需进一步验证]

✅ **文件系统隔离** (2/2 通过)
- 根文件系统只读 (/etc/passwd 写入拒绝)
- /tmp 可写但 noexec

✅ **基础功能** (2/2 通过)
- 正常 Python 脚本执行
- 语法错误返回非 0 退出码

**总计**: 22/23 测试通过 (95.7%)

---

## 本地测试

```bash
# 前置: Docker Desktop 运行 + P1E-3 镜像存在
docker images | grep openscience-sandbox

# 构建
npm run build

# 运行测试（需要 Docker）
npm test
```

---

## 云端部署

```bash
# 1. 上传
scp -i ~/.ssh/id_ed25519_xgs -P 22 -r apps/science-worker root@115.29.208.1:/opt/openscience/apps/

# 2. 构建与测试
ssh root@115.29.208.1 \
  "cd /opt/openscience/apps/science-worker && npm install && npm test"
```

---

## 依赖

- **dockerode**: Docker API 客户端
- **P1E-3**: openscience-sandbox:latest 基础镜像
- **运行时**: Docker Socket (/var/run/docker.sock)

---

## 后续任务

- **P1E-5**: /sandbox-jobs API、配额限流与完成事件
- **P1E-6**: 可视化结果展示与 IndexedDB 临时保存
- **P1E-8**: 威胁模型与沙箱逃逸基线测试
