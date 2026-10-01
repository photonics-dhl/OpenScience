'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { appendMaterials } from '@/lib/research-materials';
import { ArtifactRow } from '@/components/research/ArtifactRow';
import { ArtifactViewer } from '@/components/research/ArtifactViewer';
import { HermesAnchor } from '@/components/hermes/HermesAnchor';
import { prepareProtectedXhr, startIngestionBatch, type ArtifactReference, type IngestionTaskSummary } from '../../lib/api';

interface UploadJob {
  logicalPath: string;
  progress: number; // 0-100
  state: 'uploading' | 'done' | 'error';
  kind: 'attachment' | 'ingestion';
  artifactId?: string;
  taskId?: string;
  idempotencyKey?: string;
  error?: string;
}

const MANUSCRIPT_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'pptx', 'tex', 'zip', 'md', 'markdown', 'html', 'htm', 'xlsx']);
const ARTIFACT_ACCEPT = '.pdf,.doc,.docx,.pptx,.tex,.zip,.md,.markdown,.html,.htm,.png,.jpg,.jpeg,.webp,.svg,.csv,.tsv,.xlsx,.json,.yaml,.yml,.ipynb,.py,.r';

/** 附件上传（P1B-3 管线，XHR 进度条 + 失败重试，§18.3 可恢复进度）。 */
export default function ArtifactUploader({
  workspaceId,
  researchObjectId,
  artifacts,
  onArtifactsChange,
  onIngestionStarted,
}: {
  workspaceId: string;
  researchObjectId: string;
  artifacts: ArtifactReference[];
  onArtifactsChange: (artifacts: ArtifactReference[]) => void;
  onIngestionStarted?: (task: IngestionTaskSummary) => void;
}) {
  const t = useTranslations('editor');
  const commonT = useTranslations('common');
  const intakeT = useTranslations('ingestion.intake');
  const fileRef = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const currentArtifacts = useRef(artifacts);
  currentArtifacts.current = artifacts;
  const uploadedFiles = useRef(new Map<string, File>());
  const uploadPending = jobs.some((job) => job.state === 'uploading');

  async function upload(file: File, retryKey?: string) {
    const logicalPath = file.name;
    uploadedFiles.current.set(logicalPath, file);
    const extension = logicalPath.split('.').pop()?.toLowerCase() ?? '';
    const manuscript = MANUSCRIPT_EXTENSIONS.has(extension);
    const idempotencyKey = manuscript ? retryKey ?? `evidence:${researchObjectId}:${crypto.randomUUID()}` : undefined;
    const nextJob: UploadJob = { logicalPath, progress: 0, state: 'uploading', kind: manuscript ? 'ingestion' : 'attachment', idempotencyKey };
    setJobs((prev) => [...prev.filter((job) => job.logicalPath !== logicalPath), nextJob]);

    if (manuscript) {
      try {
        const result = await startIngestionBatch(researchObjectId, [file], idempotencyKey!, (progress) => {
          setJobs((prev) => prev.map((job) => job.logicalPath === logicalPath ? { ...job, progress } : job));
        });
        const task = result.tasks[0];
        if (!task) throw new Error(t('ingestionTaskMissing'));
        setJobs((prev) => prev.map((job) => job.logicalPath === logicalPath ? { ...job, state: 'done', progress: 100, artifactId: task.artifactId, taskId: task.id } : job));
        onIngestionStarted?.(task);
      } catch (cause) {
        setJobs((prev) => prev.map((job) => job.logicalPath === logicalPath ? { ...job, state: 'error', error: cause instanceof Error ? cause.message : t('uploadFailed') } : job));
      }
      return;
    }

    const xhr = new XMLHttpRequest();

    try {
      await prepareProtectedXhr(xhr, 'POST', '/api/artifacts/upload');
    } catch {
      setJobs((prev) => prev.map((job) => (job.logicalPath === logicalPath ? { ...job, state: 'error' } : job)));
      return;
    }
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        setJobs((prev) => prev.map((j) => (j.logicalPath === logicalPath ? { ...j, progress: pct } : j)));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const res = JSON.parse(xhr.responseText) as { artifact: { artifactId: string } };
        setJobs((prev) => prev.map((j) => (j.logicalPath === logicalPath ? { ...j, state: 'done', progress: 100, artifactId: res.artifact.artifactId } : j)));
        const next = appendMaterials(currentArtifacts.current, [{ logicalPath, artifactId: res.artifact.artifactId }]);
        currentArtifacts.current = next;
        onArtifactsChange(next);
      } else {
        setJobs((prev) => prev.map((j) => (j.logicalPath === logicalPath ? { ...j, state: 'error' } : j)));
      }
    };
    xhr.onerror = () => {
      setJobs((prev) => prev.map((j) => (j.logicalPath === logicalPath ? { ...j, state: 'error' } : j)));
    };
    const form = new FormData();
    form.append('workspaceId', workspaceId);
    form.append('logicalPath', logicalPath);
    form.append('file', file, file.name);
    xhr.send(form);
  }

  function retry(job: UploadJob) {
    const file = uploadedFiles.current.get(job.logicalPath);
    if (file) void upload(file, job.idempotencyKey);
  }

  return (
    <HermesAnchor id="source-import">
    <section className="mt-8 border-t border-os-rule-paper pt-5" id="artifacts" aria-busy={uploadPending}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="m-0 text-lg font-semibold text-os-ink">{t('artifacts')}</h2>
        <label className={`inline-flex min-h-11 items-center rounded-control border border-os-rule-paper px-4 text-sm font-medium text-os-vermilion-ink transition-colors duration-150 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-os-vermilion-ink motion-reduce:transition-none ${uploadPending ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-os-paper-strong'}`}>
          {t('uploadArtifact')}
          <input
            ref={fileRef}
            className="sr-only"
            type="file"
            accept={ARTIFACT_ACCEPT}
            disabled={uploadPending}
            data-testid="artifact-input"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.currentTarget.value = ''; }}
            aria-label={t('uploadArtifact')}
          />
        </label>
      </div>
      <details className="mt-3 text-sm leading-6 text-os-muted-paper">
        <summary className="min-h-11 w-fit cursor-pointer py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-os-vermilion-ink">{intakeT('allFormats')}</summary>
        <p className="mt-1 max-w-2xl">{t('ingestionUploadNotice')}</p>
      </details>
      <div className="mt-4">
        {jobs.map((job) => (
          <div key={job.logicalPath}>
            <ArtifactRow action={job.artifactId ? <ArtifactViewer artifactId={job.artifactId} logicalPath={job.logicalPath} /> : undefined} name={job.logicalPath} status={t(`artifactStatus.${job.state}`)} meta={job.taskId ? t('ingestionQueued') : job.artifactId ? t('artifactStored') : undefined} />
            {job.state === 'uploading' && (
              <div className="h-1 bg-os-rule-paper" role="progressbar" aria-label={job.logicalPath} aria-valuenow={job.progress} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full bg-os-vermilion-ink" style={{ width: `${job.progress}%` }} />
              </div>
            )}
            {job.state === 'error' && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-os-rule-paper py-2 text-sm">
                <span className="min-w-0 flex-1 break-words text-state-danger" role="alert">{job.error ?? t('uploadFailed')}</span>
                <button type="button" className="min-h-11 rounded-control border border-os-rule-paper bg-transparent px-4 text-os-vermilion-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-os-vermilion-ink" onClick={() => retry(job)}>{commonT('retry')}</button>
              </div>
            )}
          </div>
        ))}
        {artifacts.filter((a) => !jobs.some((j) => j.artifactId === a.artifactId)).map((a) => (
          <ArtifactRow action={<ArtifactViewer artifactId={a.artifactId} logicalPath={a.logicalPath} />} key={a.artifactId} name={a.logicalPath} status={t('artifactStatus.ready')} meta={t('artifactStored')} />
        ))}
      </div>
    </section>
    </HermesAnchor>
  );
}
