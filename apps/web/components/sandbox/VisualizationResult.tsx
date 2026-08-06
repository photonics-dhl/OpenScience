'use client';

import { useState, useEffect } from 'react';
import type { SandboxJobView } from '@/lib/api';
import { downloadArtifact, pollSandboxJob } from '@/lib/api';
import { getJobResult, putJobResult } from '@/lib/indexeddb/sandbox-cache';
import ScriptModifier from './ScriptModifier';

interface Props {
  jobId: string;
  workspaceId: string;
  onClose?: () => void;
}

export default function VisualizationResult({ jobId, workspaceId, onClose }: Props) {
  const [currentJobId, setCurrentJobId] = useState(jobId);
  const [job, setJob] = useState<SandboxJobView | null>(null);
  const [artifacts, setArtifacts] = useState<Array<{ id: string; blob: Blob; filename: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModifier, setShowModifier] = useState(false);

  useEffect(() => {
    async function loadJob() {
      try {
        setLoading(true);
        setError(null);

        // 1. 尝试从 IndexedDB 读取
        const cached = await getJobResult(currentJobId);
        if (cached) {
          setJob({
            id: cached.jobId,
            workspaceId: cached.workspaceId,
            script: cached.script,
            status: cached.status,
            result: cached.result,
            artifacts: cached.artifacts.map((a) => ({
              id: a.id,
              filename: a.filename,
              mimeType: a.mimeType,
              size: a.size,
            })),
            createdAt: new Date(cached.createdAt).toISOString(),
          });
          setArtifacts(cached.artifacts.map((a) => ({ id: a.id, blob: a.blob, filename: a.filename })));
          setLoading(false);
          return;
        }

        // 2. 轮询任务直到完成
        const completedJob = await pollSandboxJob(currentJobId);
        setJob(completedJob);

        // 3. 下载所有产物
        const blobs = await Promise.all(
          completedJob.artifacts.map(async (a) => ({
            id: a.id,
            filename: a.filename,
            blob: await downloadArtifact(currentJobId, a.id),
          }))
        );
        setArtifacts(blobs);

        // 4. 缓存到 IndexedDB
        if (completedJob.result) {
          await putJobResult({
            jobId: completedJob.id,
            workspaceId: completedJob.workspaceId,
            script: completedJob.script,
            status: completedJob.status as 'completed' | 'failed' | 'timeout',
            result: completedJob.result,
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
        }

        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载失败');
        setLoading(false);
      }
    }

    loadJob();
  }, [currentJobId, workspaceId]);

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
        {onClose && (
          <button onClick={onClose} className="close-btn">
            关闭
          </button>
        )}
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
              <button onClick={() => handleDownload(artifact.blob, artifact.filename)} className="download-btn">
                保存到本设备
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Python 脚本 */}
      <details className="script">
        <summary>查看 Python 脚本</summary>
        <pre>
          <code>{job.script}</code>
        </pre>
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

      {/* 底部操作区 */}
      {!loading && job.status === 'completed' && (
        <div className="result-actions">
          <button onClick={() => setShowModifier(true)} className="modify-btn">
            修改脚本
          </button>
        </div>
      )}

      {/* 修改对话框 */}
      {showModifier && (
        <ScriptModifier
          jobId={currentJobId}
          workspaceId={workspaceId}
          currentScript={job.script}
          onClose={() => setShowModifier(false)}
          onModifyComplete={(newJobId) => {
            setShowModifier(false);
            // 切换到新任务
            setCurrentJobId(newJobId);
          }}
        />
      )}
    </div>
  );
}

