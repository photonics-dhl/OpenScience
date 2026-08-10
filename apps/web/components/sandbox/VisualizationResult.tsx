'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('productSurfaces');
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
    return <div className="border-l border-os-rule-dark py-10 pl-5 text-sm text-os-muted-dark" data-surface-state="loading">{t('state.loadingBody')}</div>;
  }

  if (error) {
    return <div className="border-l-2 border-os-vermilion py-4 pl-4 text-sm text-os-paper" data-surface-state="error" role="alert">{error}</div>;
  }

  if (!job) {
    return <div className="border-l border-os-rule-dark py-10 pl-5 text-sm text-os-muted-dark" data-surface-state="empty">{t('sandbox.notFound')}</div>;
  }

  return (
    <div className="border-t border-os-rule-dark pt-6" data-sandbox-result="true">
      <div className="flex items-center justify-between gap-4">
        <h3 className="font-editorial text-3xl font-normal text-os-paper">{t('sandbox.result')}</h3>
        {onClose && (
            <button onClick={onClose} className="min-h-9 rounded-panel border border-os-rule-dark px-3 text-xs text-os-paper">
            {t('sandbox.close')}
          </button>
        )}
      </div>

      {/* 状态 */}
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-os-muted-dark">
        <span className="border border-os-rule-dark px-2 py-1 font-data uppercase">{job.status}</span>
        {job.result && <span>{t('sandbox.runtime')}: {job.result.runtimeSeconds}s</span>}
      </div>

      {/* 产物展示 */}
      {artifacts.length > 0 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {artifacts.map((artifact) => (
            <div key={artifact.id} className="border border-os-rule-dark p-3">
              <img className="h-auto w-full" src={URL.createObjectURL(artifact.blob)} alt={artifact.filename} />
              <button onClick={() => handleDownload(artifact.blob, artifact.filename)} className="mt-3 min-h-9 rounded-panel border border-os-rule-dark px-3 text-xs text-os-paper">
                {t('sandbox.download')}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Python 脚本 */}
      <details className="mt-6 border-y border-os-rule-dark py-4 text-sm">
        <summary className="cursor-pointer text-os-paper">{t('sandbox.viewScript')}</summary>
        <pre>
          <code>{job.script}</code>
        </pre>
      </details>

      {/* 运行环境 */}
      <details className="border-b border-os-rule-dark py-4 text-sm">
        <summary className="cursor-pointer text-os-paper">{t('sandbox.environment')}</summary>
        <ul>
          <li className="mt-3 text-os-muted-dark">Python: 3.11</li>
          <li className="text-os-muted-dark">numpy, matplotlib, scipy</li>
        </ul>
      </details>

      {/* 输出日志 */}
      {job.result && (job.result.stdout || job.result.stderr) && (
        <details className="border-b border-os-rule-dark py-4 text-sm">
          <summary className="cursor-pointer text-os-paper">{t('sandbox.logs')}</summary>
          {job.result.stdout && <pre className="stdout">{job.result.stdout}</pre>}
          {job.result.stderr && <pre className="stderr">{job.result.stderr}</pre>}
        </details>
      )}

      {/* 底部操作区 */}
      {!loading && job.status === 'completed' && (
        <div className="mt-6">
          <button onClick={() => setShowModifier(true)} className="min-h-10 rounded-panel bg-os-paper px-4 text-sm font-semibold text-os-black-0">
            {t('sandbox.modify')}
          </button>
        </div>
      )}

      {/* 修改对话框 */}
      {showModifier && (
        <ScriptModifier
          jobId={currentJobId}
          workspaceId={workspaceId}
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

