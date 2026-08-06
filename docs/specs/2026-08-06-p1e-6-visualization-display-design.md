# P1E-6 可视化结果展示与 IndexedDB 临时存储设计

**任务**: P1E-6 可视化结果展示与 IndexedDB 临时存储  
**设计者**: Claude Opus 4.8  
**创建日期**: 2026-08-06  
**前置**: P1E-5 (Sandbox Jobs API)  
**参考规格**: Spec §10.2、§10.4

---

## 1. 目标

实现用户在阅读笔记/研究资料时，通过 Hermes 对话生成 Python 可视化的交互流程，包括：

1. **前端展示**：自然语言解释 + 数学模型 + Python 脚本 + 参数表 + PNG/SVG 可视化图片 + 标签（示意图/定量仿真）+ 运行环境 + 保存动作
2. **IndexedDB 临时存储**：24 小时 TTL 的沙箱产物本地缓存，避免重复请求后端
3. **用户动作**：保存到本设备（下载）、保存到个人笔记（后续 P1F）

### 1.1 用户场景（Spec §10.1）

用户在阅读笔记时，对"电磁场近场衰减"概念不清楚。Hermes 分析问题后：

1. 生成自然语言解释："近场区域电场强度按距离三次方衰减"
2. 给出数学模型：`E(r) = E0 * (λ/2πr)^3`
3. 生成 Python 脚本并调用 `/sandbox-jobs` API 执行
4. 返回 PNG 图片 + 标签（示意图）
5. 用户点击"保存到本设备" → 下载 PNG
6. 用户点击"重新生成" → Hermes 重新调用 API

---

## 2. 架构设计

### 2.1 组件分层

```text
┌─────────────────────────────────────────────────────┐
│ apps/web/components/sandbox/VisualizationResult.tsx │  React 组件
│  - 展示图片、脚本、参数表、环境信息                 │
│  - 保存到本设备（下载）                             │
│  - 保存到笔记（P1F TODO）                           │
└─────────────────────────────────────────────────────┘
                        │
                        ↓
┌─────────────────────────────────────────────────────┐
│ apps/web/lib/indexeddb/sandbox-cache.ts              │  IndexedDB 封装
│  - putJobResult(jobId, data, ttl)                    │
│  - getJobResult(jobId): Promise<CachedResult | null> │
│  - deleteExpired(): Promise<void>                    │
│  - deleteJob(jobId): Promise<void>                   │
└─────────────────────────────────────────────────────┘
                        │
                        ↓
┌─────────────────────────────────────────────────────┐
│ apps/web/lib/api.ts                                  │  API client
│  + getSandboxJob(jobId): Promise<SandboxJobView>    │
│  + downloadArtifact(jobId, artifactId): Promise<Blob>│
└─────────────────────────────────────────────────────┘
                        │
                        ↓
┌─────────────────────────────────────────────────────┐
│ apps/api/src/routes/sandbox-jobs.ts                 │  P1E-5 已实现
│  GET /sandbox-jobs/:id                               │
│  GET /sandbox-jobs/:id/artifacts/:artifactId         │
└─────────────────────────────────────────────────────┘
```

### 2.2 数据流

```text
用户提问 "如何理解近场衰减？"
    ↓
Hermes 生成 Python 脚本 + 调用 POST /sandbox-jobs
    ↓
P1E-5 API 返回 { id: "job-123", status: "pending" }
    ↓
前端轮询 GET /sandbox-jobs/job-123 (status: "running" → "completed")
    ↓
前端调用 GET /sandbox-jobs/job-123 获取完整 job + artifacts 列表
    ↓
前端调用 GET /sandbox-jobs/job-123/artifacts/artifact-456 下载 PNG
    ↓
IndexedDB 缓存: { jobId, artifactBlob, createdAt: Date.now(), ttl: 24h }
    ↓
React 组件展示: 图片 + 脚本 + 环境 + 保存按钮
    ↓
用户点击"保存到本设备" → downloadBlob(artifactBlob, "visualization.png")
```

---

## 3. IndexedDB Schema

### 3.1 Database: `openscience_sandbox_cache`

**Version**: 1

### 3.2 Object Store: `jobResults`

```typescript
interface CachedJobResult {
  jobId: string;              // Primary key
  workspaceId: string;        // 用于清理过期数据时的工作区隔离
  script: string;             // Python 脚本
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
    blob: Blob;               // 二进制数据（PNG/SVG）
  }>;
  environment: {
    pythonVersion: string;    // "3.11"
    packages: string[];       // ["numpy==1.26.2", "matplotlib==3.8.2"]
  };
  metadata: {
    visualizationType?: 'plot' | 'simulation' | 'diagram';
    description?: string;
    tags: string[];           // ["示意图"] | ["定量仿真"]
  };
  createdAt: number;          // Date.now()
  expiresAt: number;          // createdAt + 24h
}
```

**Indexes**:
- `by-expires`: `expiresAt` (用于定期清理过期数据)
- `by-workspace`: `workspaceId` (用于按工作区清理)

### 3.3 TTL 策略

- **默认 TTL**: 24 小时（86400000 ms）
- **清理时机**:
  1. 页面加载时调用 `deleteExpired()`
  2. 每次 `putJobResult` 时触发清理（防止无限增长）
- **超过存储配额**:
  - 浏览器默认 IndexedDB 配额约 50% 可用磁盘空间（Chrome）
  - 超配额时，浏览器自动触发 QuotaExceededError
  - 清理策略：删除最早的 20% 条目，再重试写入

---

## 4. API Client 扩展

### 4.1 新增端点封装（apps/web/lib/api.ts）

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

/** 查询沙箱任务状态（P1E-5 已实现，P1E-6 复用）。 */
export async function getSandboxJob(jobId: string): Promise<{ job: SandboxJobView }> {
  return request(`/api/sandbox-jobs/${jobId}`);
}

/** 下载沙箱产物（P1E-5 已实现，P1E-6 复用）。 */
export async function downloadArtifact(jobId: string, artifactId: string): Promise<Blob> {
  const res = await fetch(`/api/sandbox-jobs/${jobId}/artifacts/${artifactId}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    throw new ApiClientError('DOWNLOAD_FAILED', `下载失败 ${res.status}`, res.status);
  }
  return res.blob();
}

/** 轮询任务直到完成（最多 30 秒，§10.3 超时）。 */
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

## 5. IndexedDB 封装

### 5.1 实现（apps/web/lib/indexeddb/sandbox-cache.ts）

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

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'jobId' });
        store.createIndex('by-expires', 'expiresAt', { unique: false });
        store.createIndex('by-workspace', 'workspaceId', { unique: false });
      }
    };
  });
}

export async function putJobResult(data: Omit<CachedJobResult, 'createdAt' | 'expiresAt'>): Promise<void> {
  const db = await openDB();
  const now = Date.now();
  const entry: CachedJobResult = {
    ...data,
    createdAt: now,
    expiresAt: now + TTL_MS,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(entry);
    
    request.onsuccess = () => {
      // 触发清理过期数据
      deleteExpired().catch(console.warn);
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getJobResult(jobId: string): Promise<CachedJobResult | null> {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(jobId);
    
    request.onsuccess = () => {
      const result = request.result as CachedJobResult | undefined;
      
      // 检查是否过期
      if (result && result.expiresAt < Date.now()) {
        // 异步删除过期条目
        deleteJob(jobId).catch(console.warn);
        resolve(null);
      } else {
        resolve(result ?? null);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

export async function deleteExpired(): Promise<void> {
  const db = await openDB();
  const now = Date.now();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('by-expires');
    const request = index.openCursor(IDBKeyRange.upperBound(now));
    
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result as IDBCursorWithValue | null;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };
    request.onerror = () => reject(request.error);
  });
}

export async function deleteJob(jobId: string): Promise<void> {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(jobId);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/** QuotaExceededError 处理：删除最早的 20% 条目。 */
async function cleanupOldest(): Promise<void> {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    
    request.onsuccess = () => {
      const all = request.result as CachedJobResult[];
      const sorted = all.sort((a, b) => a.createdAt - b.createdAt);
      const toDelete = sorted.slice(0, Math.ceil(all.length * 0.2));
      
      toDelete.forEach(item => store.delete(item.jobId));
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}
```

---

## 6. React 组件

### 6.1 VisualizationResult 组件（apps/web/components/sandbox/VisualizationResult.tsx）

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
          setJob({
            id: cached.jobId,
            workspaceId: cached.workspaceId,
            script: cached.script,
            status: cached.status,
            result: cached.result,
            artifacts: cached.artifacts.map(a => ({ id: a.id, filename: a.filename, mimeType: a.mimeType, size: a.size })),
            createdAt: new Date(cached.createdAt).toISOString(),
          });
          setArtifacts(cached.artifacts.map(a => ({ id: a.id, blob: a.blob, filename: a.filename })));
          setLoading(false);
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
          metadata: {
            tags: ['示意图'],
          },
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

  if (loading) {
    return <div className="loading">加载中...</div>;
  }

  if (error) {
    return <div className="error">错误: {error}</div>;
  }

  if (!job) {
    return <div className="error">任务未找到</div>;
  }

  return (
    <div className="visualization-result">
      <div className="header">
        <h3>可视化结果</h3>
        {onClose && <button onClick={onClose}>关闭</button>}
      </div>

      {/* 状态 */}
      <div className="status">
        <span className={`badge ${job.status}`}>{job.status}</span>
        {job.result && <span>运行时间: {job.result.runtimeSeconds}s</span>}
      </div>

      {/* 产物展示 */}
      {artifacts.length > 0 && (
        <div className="artifacts">
          {artifacts.map((artifact) => (
            <div key={artifact.id} className="artifact">
              <img src={URL.createObjectURL(artifact.blob)} alt={artifact.filename} />
              <button onClick={() => handleDownload(artifact.blob, artifact.filename)}>
                保存到本设备
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Python 脚本 */}
      <details className="script">
        <summary>查看 Python 脚本</summary>
        <pre><code>{job.script}</code></pre>
      </details>

      {/* 运行环境 */}
      <details className="environment">
        <summary>运行环境</summary>
        <ul>
          <li>Python: 3.11</li>
          <li>numpy, matplotlib, scipy</li>
        </ul>
      </details>

      {/* 输出日志 */}
      {job.result && (job.result.stdout || job.result.stderr) && (
        <details className="logs">
          <summary>执行日志</summary>
          {job.result.stdout && <pre className="stdout">{job.result.stdout}</pre>}
          {job.result.stderr && <pre className="stderr">{job.result.stderr}</pre>}
        </details>
      )}
    </div>
  );
}
```

---

## 7. 验收条件

- [ ] IndexedDB `openscience_sandbox_cache` 数据库创建成功
- [ ] `putJobResult` 写入成功，24 小时后自动过期
- [ ] `getJobResult` 读取缓存，过期条目返回 null
- [ ] `deleteExpired` 清理过期数据
- [ ] API client: `getSandboxJob`、`downloadArtifact`、`pollSandboxJob` 实现
- [ ] React 组件: 展示图片 + 脚本 + 环境 + 保存按钮
- [ ] 保存到本设备：点击下载 PNG 文件
- [ ] 轮询超时（35 秒）抛出错误
- [ ] 浏览器 DevTools → Application → IndexedDB 可见缓存数据

---

## 8. 后续任务

- **P1E-7**: 自然语言修改脚本与 diff 展示（§10.4 重新检查 + 新容器）
- **P1F**: 保存到个人笔记功能（需要笔记数据模型）

---

**设计确认**: 本设计对齐 Spec §10.2 输出格式、§10.4 修改重新生成。IndexedDB 24 小时 TTL 满足临时存储需求（§15 SandboxArtifact 注释）。
