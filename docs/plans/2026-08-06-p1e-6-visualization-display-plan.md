# P1E-6 可视化结果展示与 IndexedDB 临时存储实现计划

**任务**: P1E-6 可视化结果展示与 IndexedDB 临时存储  
**制定者**: Claude Opus 4.8  
**创建日期**: 2026-08-06  
**前置**: P1E-5 (Sandbox Jobs API)  
**参考**: [2026-08-06-p1e-6-visualization-display-design.md](../specs/2026-08-06-p1e-6-visualization-display-design.md)

---

## 1. 实施步骤

### 1.1 IndexedDB 封装实现

**落点**: `apps/web/lib/indexeddb/sandbox-cache.ts`

**新建文件**:

```typescript
const DB_NAME = 'openscience_sandbox_cache';
const DB_VERSION = 1;
const STORE_NAME = 'jobResults';
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CachedJobResult {
  jobId: string;
  workspaceId: string;
  script: string;
  status: 'completed' | 'failed' | 'timeout';
  result: {
    success: boolean;
    stdout?: string;
    stderr?: string;
    timeout?: boolean;
    runtimeSeconds: number;
  };
  artifacts: Array<{
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    blob: Blob;
  }>;
  environment: {
    pythonVersion: string;
    packages: string[];
  };
  metadata: {
    visualizationType?: 'plot' | 'simulation' | 'diagram';
    description?: string;
    tags: string[];
  };
  createdAt: number;
  expiresAt: number;
}

// 核心函数：
// - openDB(): Promise<IDBDatabase>
// - putJobResult(data): Promise<void>
// - getJobResult(jobId): Promise<CachedJobResult | null>
// - deleteExpired(): Promise<void>
// - deleteJob(jobId): Promise<void>
// - cleanupOldest(): Promise<void>  // QuotaExceededError 处理
```

**关键点**:
1. onupgradeneeded 创建 object store + 2 个 index（by-expires, by-workspace）
2. putJobResult 时自动触发 deleteExpired() 清理过期数据
3. getJobResult 读取时检查 expiresAt，过期返回 null 并异步删除

---

### 1.2 API Client 扩展

**落点**: `apps/web/lib/api.ts`

**新增接口和函数**:

```typescript
// ===== P1E-6：沙箱任务查询与产物下载 =====

export interface SandboxJobView {
  id: string;
  workspaceId: string;
  script: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout';
  result: {
    success: boolean;
    stdout?: string;
    stderr?: string;
    timeout?: boolean;
    runtimeSeconds: number;
  } | null;
  artifacts: Array<{
    id: string;
    filename: string;
    mimeType: string;
    size: number;
  }>;
  createdAt: string;
  completedAt?: string;
}

/** 查询沙箱任务状态（P1E-5 已实现 GET /sandbox-jobs/:id）。 */
export async function getSandboxJob(jobId: string): Promise<{ job: SandboxJobView }> {
  return request(`/api/sandbox-jobs/${jobId}`);
}

/** 下载沙箱产物（P1E-5 已实现 GET /sandbox-jobs/:id/artifacts/:artifactId）。 */
export async function downloadArtifact(jobId: string, artifactId: string): Promise<Blob> {
  const res = await fetch(`/api/sandbox-jobs/${jobId}/artifacts/${artifactId}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    throw new ApiClientError('DOWNLOAD_FAILED', `下载失败 ${res.status}`, res.status);
  }
  return res.blob();
}

/** 轮询任务直到完成（最多 35 秒，§10.3 沙箱 30s + 5s 缓冲）。 */
export async function pollSandboxJob(jobId: string, maxWaitMs = 35000): Promise<SandboxJobView> {
  const startTime = Date.now();
  const pollInterval = 500; // 500ms

  while (Date.now() - startTime < maxWaitMs) {
    const { job } = await getSandboxJob(jobId);
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'timeout') {
      return job;
    }
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error('任务轮询超时');
}
```

---

### 1.3 React 组件实现

**落点**: `apps/web/components/sandbox/VisualizationResult.tsx`

**新建文件**（客户端组件，'use client'）:

```typescript
'use client';

import { useState, useEffect } from 'react';
import type { SandboxJobView } from '@/lib/api';
import { getSandboxJob, downloadArtifact, pollSandboxJob } from '@/lib/api';
import { getJobResult, putJobResult } from '@/lib/indexeddb/sandbox-cache';

interface Props {
  jobId: string;
  workspaceId: string;
  onClose?: () => void;
}

export default function VisualizationResult({ jobId, workspaceId, onClose }: Props) {
  const [job, setJob] = useState<SandboxJobView | null>(null);
  const [artifacts, setArtifacts] = useState<Array<{ id: string; blob: Blob; filename: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadJob() {
      try {
        // 1. 尝试从 IndexedDB 读取
        const cached = await getJobResult(jobId);
        if (cached) {
          // ... 恢复 UI 状态
          return;
        }

        // 2. 轮询任务直到完成
        const completedJob = await pollSandboxJob(jobId);
        setJob(completedJob);

        // 3. 下载所有产物
        const blobs = await Promise.all(
          completedJob.artifacts.map(async (a) => ({
            id: a.id,
            filename: a.filename,
            blob: await downloadArtifact(jobId, a.id),
          }))
        );
        setArtifacts(blobs);

        // 4. 缓存到 IndexedDB
        await putJobResult({
          jobId: completedJob.id,
          workspaceId: completedJob.workspaceId,
          script: completedJob.script,
          status: completedJob.status as 'completed' | 'failed' | 'timeout',
          result: completedJob.result!,
          artifacts: blobs.map((b, i) => ({
            id: b.id,
            filename: b.filename,
            mimeType: completedJob.artifacts[i].mimeType,
            size: completedJob.artifacts[i].size,
            blob: b.blob,
          })),
          environment: {
            pythonVersion: '3.11',
            packages: ['numpy', 'matplotlib', 'scipy'],
          },
          metadata: { tags: ['示意图'] },
        });

        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载失败');
        setLoading(false);
      }
    }

    loadJob();
  }, [jobId, workspaceId]);

  function handleDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ... 渲染逻辑：图片 + 脚本 + 环境 + 保存按钮
}
```

**UI 结构**:
- 头部：标题 + 关闭按钮
- 状态栏：status badge + 运行时间
- 产物区：图片 + "保存到本设备"按钮
- 折叠面板：Python 脚本、运行环境、执行日志

---

### 1.4 样式文件

**落点**: `apps/web/components/sandbox/VisualizationResult.module.css` 或全局 CSS

```css
.visualization-result {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 1rem;
  max-width: 800px;
  margin: 0 auto;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.status {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
}

.badge {
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.875rem;
}

.badge.completed { background: #d4edda; color: #155724; }
.badge.failed { background: #f8d7da; color: #721c24; }
.badge.timeout { background: #fff3cd; color: #856404; }

.artifacts {
  margin-bottom: 1rem;
}

.artifact {
  margin-bottom: 1rem;
}

.artifact img {
  max-width: 100%;
  border: 1px solid #ddd;
  border-radius: 4px;
  margin-bottom: 0.5rem;
}

.artifact button {
  width: 100%;
  padding: 0.5rem;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.artifact button:hover {
  background: #0056b3;
}

.script, .environment, .logs {
  margin-bottom: 1rem;
}

.script pre, .logs pre {
  background: #f5f5f5;
  padding: 1rem;
  border-radius: 4px;
  overflow-x: auto;
}

.stderr {
  color: #d32f2f;
}
```

---

## 2. 测试策略

### 2.1 单元测试（apps/web/lib/indexeddb/sandbox-cache.test.ts）

使用 Vitest + fake-indexeddb 模拟 IndexedDB:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { putJobResult, getJobResult, deleteExpired, deleteJob } from './sandbox-cache';
import 'fake-indexeddb/auto'; // 模拟 IndexedDB

describe('sandbox-cache', () => {
  beforeEach(async () => {
    // 清空数据库
    const dbs = await indexedDB.databases();
    for (const db of dbs) {
      if (db.name) indexedDB.deleteDatabase(db.name);
    }
  });

  it('应该写入并读取缓存', async () => {
    const data = {
      jobId: 'job-123',
      workspaceId: 'ws-1',
      script: 'print("hello")',
      status: 'completed' as const,
      result: { success: true, runtimeSeconds: 1.5 },
      artifacts: [],
      environment: { pythonVersion: '3.11', packages: [] },
      metadata: { tags: [] },
    };

    await putJobResult(data);
    const cached = await getJobResult('job-123');

    expect(cached).not.toBeNull();
    expect(cached?.jobId).toBe('job-123');
    expect(cached?.script).toBe('print("hello")');
  });

  it('应该自动清理过期数据', async () => {
    const data = {
      jobId: 'job-old',
      workspaceId: 'ws-1',
      script: 'print("old")',
      status: 'completed' as const,
      result: { success: true, runtimeSeconds: 1 },
      artifacts: [],
      environment: { pythonVersion: '3.11', packages: [] },
      metadata: { tags: [] },
    };

    await putJobResult(data);
    
    // 手动修改 expiresAt 为过去时间
    // ... (需要直接操作 IndexedDB)

    const cached = await getJobResult('job-old');
    expect(cached).toBeNull(); // 过期返回 null
  });

  it('应该删除指定任务', async () => {
    const data = {
      jobId: 'job-del',
      workspaceId: 'ws-1',
      script: 'print("del")',
      status: 'completed' as const,
      result: { success: true, runtimeSeconds: 1 },
      artifacts: [],
      environment: { pythonVersion: '3.11', packages: [] },
      metadata: { tags: [] },
    };

    await putJobResult(data);
    await deleteJob('job-del');

    const cached = await getJobResult('job-del');
    expect(cached).toBeNull();
  });
});
```

### 2.2 集成测试（手动）

1. **场景 1**: 首次加载任务，轮询 + 下载 + 缓存
   - 打开 DevTools → Application → IndexedDB → openscience_sandbox_cache
   - 验证 jobResults store 中有新条目
   - 验证 expiresAt = createdAt + 24h

2. **场景 2**: 刷新页面，从缓存加载
   - 刷新页面，验证不发送 API 请求
   - 验证图片立即显示（无加载延迟）

3. **场景 3**: 保存到本设备
   - 点击"保存到本设备"按钮
   - 验证浏览器下载 PNG 文件

4. **场景 4**: 24 小时后过期
   - 手动修改 IndexedDB 中 expiresAt 为过去时间
   - 刷新页面，验证重新请求 API

---

## 3. 本地开发与验证

```bash
# 1. 安装依赖
cd apps/web
pnpm add fake-indexeddb --save-dev

# 2. 创建 IndexedDB 封装
mkdir -p lib/indexeddb
touch lib/indexeddb/sandbox-cache.ts
touch lib/indexeddb/sandbox-cache.test.ts

# 3. 扩展 API client
vi lib/api.ts  # 新增 getSandboxJob、downloadArtifact、pollSandboxJob

# 4. 创建 React 组件
mkdir -p components/sandbox
touch components/sandbox/VisualizationResult.tsx
touch components/sandbox/VisualizationResult.module.css

# 5. 运行单元测试
pnpm test lib/indexeddb/sandbox-cache.test.ts

# 6. 启动开发服务器
pnpm dev

# 7. 浏览器验证
# - 打开 http://localhost:3000（测试页面）
# - DevTools → Application → IndexedDB
```

---

## 4. 云端部署

P1E-6 纯前端功能，无需云端部署步骤。只需确保 P1E-5 API 已部署。

---

## 5. 验收标准

- [ ] IndexedDB `openscience_sandbox_cache` 数据库创建成功
- [ ] `putJobResult` 写入成功，数据可查询
- [ ] `getJobResult` 读取缓存，过期条目返回 null
- [ ] `deleteExpired` 清理过期数据
- [ ] API client: `getSandboxJob`、`downloadArtifact`、`pollSandboxJob` 实现
- [ ] React 组件: 展示图片 + 脚本 + 环境 + 保存按钮
- [ ] 保存到本设备：点击下载 PNG 文件成功
- [ ] 轮询超时（35 秒）抛出错误并显示
- [ ] 单元测试全绿（3 个场景）
- [ ] 浏览器 DevTools 可见 IndexedDB 数据

---

## 6. 后续任务

- **P1E-7**: 自然语言修改脚本与 diff 展示（§10.4 重新检查 + 新容器）
- **P1E-8**: 沙箱威胁模型文档与逃逸基线测试
- **P1F**: 保存到个人笔记功能（需笔记数据模型）

---

**计划确认**: 本计划对齐 Spec §10.2 输出格式、§10.4 修改重新生成。IndexedDB 24 小时 TTL 满足临时存储需求（§15 SandboxArtifact 注释）。实施完成后提交 GitHub 并更新 task-master。
