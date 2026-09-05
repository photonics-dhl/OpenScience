'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { PresentationWorkbench, type PresentationTaskState } from '@/components/presentation/PresentationWorkbench';
import { ResearchWorkspaceNav } from '@/components/research/ResearchWorkspaceNav';
import { DashboardShell } from '@/components/shell/DashboardShell';
import {
  ApiClientError,
  createPresentationClaim,
  generatePresentationChart,
  getPresentationTask,
  getResearchObject,
  listMyWorkspaces,
  listPresentationAssets,
  listVersionClaims,
  listVersions,
  transitionPresentationAsset,
  type PresentationAsset,
  type PresentationClaim,
  type VersionSummary,
  type WorkspaceApi,
} from '@/lib/api';

const WRITER_ROLES = new Set(['owner', 'maintainer', 'author', 'contributor']);
const TASK_POLL_ATTEMPTS = 90;
const TASK_POLL_INTERVAL_MS = 2_000;

interface ActiveScope {
  key: string;
  epoch: number;
  controller: AbortController;
}

interface ScopeLoadState {
  key: string;
  status: 'idle' | 'loading' | 'loaded' | 'failed';
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function hasAmbiguousWriteOutcome(error: unknown): boolean {
  return !(error instanceof ApiClientError)
    || error.status === 0
    || error.status === 408
    || error.status === 429
    || error.status >= 500;
}

function isRecoverableTaskRead(error: unknown): boolean {
  return !(error instanceof ApiClientError)
    || error.status === 0
    || error.status === 408
    || error.status === 429
    || error.status >= 500;
}

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = window.setTimeout(done, ms);
    function done() {
      signal.removeEventListener('abort', aborted);
      resolve();
    }
    function aborted() {
      window.clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }
    signal.addEventListener('abort', aborted, { once: true });
  });
}

function scopedUrl(roId: string, versionId: string, taskId?: string): string {
  const query = new URLSearchParams({ version: versionId });
  if (taskId) query.set('task', taskId);
  return `/research-objects/${encodeURIComponent(roId)}/presentation?${query.toString()}`;
}

export default function PresentationPage({ params }: { params: { id: string } }) {
  const t = useTranslations('presentation');
  const router = useRouter();
  const search = useSearchParams();
  const requestedVersionId = search.get('version') ?? '';
  const taskId = search.get('task') ?? '';
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [workspace, setWorkspace] = useState<WorkspaceApi | null>(null);
  const [loadedResearchObjectId, setLoadedResearchObjectId] = useState('');
  const [claims, setClaims] = useState<PresentationClaim[]>([]);
  const [assets, setAssets] = useState<PresentationAsset[]>([]);
  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [scopeLoad, setScopeLoad] = useState<ScopeLoadState>({ key: '', status: 'idle' });
  const [loadNonce, setLoadNonce] = useState(0);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [taskState, setTaskState] = useState<PresentationTaskState | null>(null);
  const [resumeNonce, setResumeNonce] = useState(0);
  const scopeRef = useRef<ActiveScope>({ key: '', epoch: 0, controller: new AbortController() });
  const renderedScopeKey = useRef('');
  const bootstrapEpoch = useRef(0);
  const generationIntent = useRef<{ signature: string; key: string } | null>(null);
  const claimIntent = useRef<{ signature: string; id: string } | null>(null);

  const version = useMemo(
    () => loadedResearchObjectId === params.id
      ? requestedVersionId
        ? versions.find((item) => item.versionId === requestedVersionId) ?? null
        : versions[0] ?? null
      : null,
    [loadedResearchObjectId, params.id, requestedVersionId, versions],
  );
  const versionId = version?.versionId ?? '';
  const invalidRequestedVersion = loadedResearchObjectId === params.id
    && requestedVersionId.length > 0
    && versions.length > 0
    && !versions.some((item) => item.versionId === requestedVersionId);
  const scopeKey = versionId ? `${params.id}:${versionId}` : '';
  const scopeReady = scopeLoad.key === scopeKey && scopeLoad.status === 'loaded';
  const scopeLoading = scopeLoad.key !== scopeKey || scopeLoad.status === 'idle' || scopeLoad.status === 'loading';
  const scopeLoadFailed = scopeLoad.key === scopeKey && scopeLoad.status === 'failed';
  renderedScopeKey.current = scopeKey;
  const role = workspace?.role ?? '';
  const canWrite = Boolean(version && version.status === 'draft' && workspace?.status === 'active' && WRITER_ROLES.has(role));

  function scopeIsCurrent(scope: ActiveScope): boolean {
    return !scope.controller.signal.aborted
      && renderedScopeKey.current === scope.key
      && scopeRef.current.key === scope.key
      && scopeRef.current.epoch === scope.epoch;
  }

  useEffect(() => {
    const epoch = ++bootstrapEpoch.current;
    setBootstrapLoading(true);
    setLoadedResearchObjectId('');
    setWorkspace(null);
    setError('');
    void Promise.all([getResearchObject(params.id), listVersions(params.id), listMyWorkspaces()]).then(([research, history, workspaces]) => {
      if (bootstrapEpoch.current !== epoch) return;
      setVersions(history.versions);
      setWorkspace(workspaces.find((item) => item.id === research.researchObject.workspaceId) ?? null);
      setLoadedResearchObjectId(params.id);
    }).catch((cause) => {
      if (bootstrapEpoch.current !== epoch) return;
      setError(cause instanceof Error ? cause.message : t('loadError'));
    }).finally(() => {
      if (bootstrapEpoch.current === epoch) setBootstrapLoading(false);
    });
    return () => { bootstrapEpoch.current += 1; };
  }, [params.id, t]);

  useEffect(() => {
    if (bootstrapLoading || !version) return;
    if (!requestedVersionId) router.replace(scopedUrl(params.id, version.versionId));
  }, [bootstrapLoading, params.id, requestedVersionId, router, version]);

  useEffect(() => {
    scopeRef.current.controller.abort();
    generationIntent.current = null;
    claimIntent.current = null;
    setTaskState(null);
    setWorking(false);
    setError('');
    setClaims([]);
    setAssets([]);
    setScopeLoad({ key: scopeKey, status: scopeKey ? 'loading' : 'idle' });
    if (!scopeKey || !versionId) return;

    const scope: ActiveScope = { key: scopeKey, epoch: scopeRef.current.epoch + 1, controller: new AbortController() };
    scopeRef.current = scope;
    void Promise.all([
      listVersionClaims(params.id, versionId, scope.controller.signal),
      listPresentationAssets(params.id, versionId, scope.controller.signal),
    ]).then(([claimResult, assetResult]) => {
      if (!scopeIsCurrent(scope)) return;
      setClaims(claimResult.claims);
      setAssets(assetResult.assets);
      setScopeLoad({ key: scope.key, status: 'loaded' });
    }).catch((cause) => {
      if (!scopeIsCurrent(scope) || isAbort(cause)) return;
      setError(cause instanceof Error ? cause.message : t('loadError'));
      setScopeLoad({ key: scope.key, status: 'failed' });
    });
    return () => scope.controller.abort();
  }, [loadNonce, params.id, scopeKey, t, versionId]);

  useEffect(() => {
    if (!taskId || !versionId || !scopeReady) return;
    const scope = scopeRef.current;
    if (!scopeIsCurrent(scope)) return;
    const controller = new AbortController();
    const abortFromScope = () => controller.abort();
    scope.controller.signal.addEventListener('abort', abortFromScope, { once: true });
    setWorking(true);
    setError('');
    setTaskState({ status: 'pending', progress: 0, paused: false });

    void (async () => {
      try {
        for (let attempt = 0; attempt < TASK_POLL_ATTEMPTS; attempt += 1) {
          const current = (await getPresentationTask(params.id, versionId, taskId, controller.signal)).task;
          if (!scopeIsCurrent(scope) || controller.signal.aborted) return;
          setTaskState({ status: current.status, progress: current.progress, paused: false });
          if (current.status === 'succeeded') {
            const refreshed = await listPresentationAssets(params.id, versionId, controller.signal);
            if (!scopeIsCurrent(scope) || controller.signal.aborted) return;
            setAssets(refreshed.assets);
            setTaskState(null);
            setWorking(false);
            router.replace(scopedUrl(params.id, versionId));
            return;
          }
          if (current.status === 'failed') {
            setError(current.error ?? t('generationFailed'));
            setTaskState({ status: 'failed', progress: current.progress, paused: false });
            setWorking(false);
            return;
          }
          await abortableDelay(TASK_POLL_INTERVAL_MS, controller.signal);
        }
        if (scopeIsCurrent(scope) && !controller.signal.aborted) {
          setTaskState((current) => ({ status: current?.status ?? 'running', progress: current?.progress ?? 0, paused: true }));
          setWorking(false);
        }
      } catch (cause) {
        if (!scopeIsCurrent(scope) || controller.signal.aborted || isAbort(cause)) return;
        setError(cause instanceof ApiClientError ? cause.message : cause instanceof Error ? cause.message : t('generationFailed'));
        if (isRecoverableTaskRead(cause)) {
          setTaskState((current) => ({ status: current?.status ?? 'running', progress: current?.progress ?? 0, paused: true }));
        }
        setWorking(false);
      }
    })();

    return () => {
      scope.controller.signal.removeEventListener('abort', abortFromScope);
      controller.abort();
    };
  }, [params.id, resumeNonce, router, scopeKey, scopeReady, t, taskId, versionId]);

  async function createClaim(statement: string): Promise<boolean> {
    if (!version || !canWrite || !scopeReady) return false;
    const scope = scopeRef.current;
    if (!scopeIsCurrent(scope)) return false;
    const signature = `${scope.key}:${statement}`;
    if (claimIntent.current?.signature !== signature) claimIntent.current = { signature, id: crypto.randomUUID() };
    const intent = claimIntent.current;
    setWorking(true);
    setError('');
    try {
      const result = await createPresentationClaim(params.id, version.versionId, { id: intent.id, statement }, scope.controller.signal);
      if (!scopeIsCurrent(scope)) return false;
      claimIntent.current = null;
      setClaims((current) => current.some((item) => item.id === result.claim.id) ? current : [...current, result.claim]);
      return true;
    } catch (cause) {
      if (!scopeIsCurrent(scope) || isAbort(cause)) return false;
      if (!hasAmbiguousWriteOutcome(cause)) claimIntent.current = null;
      setError(cause instanceof ApiClientError ? cause.message : t('claimSaveFailed'));
      return false;
    } finally {
      if (scopeIsCurrent(scope)) setWorking(false);
    }
  }

  async function generate(sourceClaimIds: string[]) {
    if (!version || !canWrite || !scopeReady) return;
    const scope = scopeRef.current;
    if (!scopeIsCurrent(scope)) return;
    const signature = `${scope.key}:${[...sourceClaimIds].sort().join(',')}`;
    if (generationIntent.current?.signature !== signature) generationIntent.current = { signature, key: crypto.randomUUID() };
    const intent = generationIntent.current;
    setWorking(true);
    setError('');
    try {
      const { task } = await generatePresentationChart(params.id, version.versionId, sourceClaimIds, intent.key, scope.controller.signal);
      if (!scopeIsCurrent(scope)) return;
      generationIntent.current = null;
      setTaskState({ status: task.status, progress: task.progress, paused: false });
      router.push(scopedUrl(params.id, version.versionId, task.id));
    } catch (cause) {
      if (!scopeIsCurrent(scope) || isAbort(cause)) return;
      if (!hasAmbiguousWriteOutcome(cause)) generationIntent.current = null;
      setError(cause instanceof ApiClientError ? cause.message : t('generationStartFailed'));
      setWorking(false);
    }
  }

  async function transition(asset: PresentationAsset, status: 'approved' | 'rejected') {
    if (!version || !canWrite || !scopeReady) return;
    const scope = scopeRef.current;
    if (!scopeIsCurrent(scope)) return;
    setWorking(true);
    setError('');
    try {
      const result = await transitionPresentationAsset(params.id, version.versionId, asset.id, status, asset.updatedAt, scope.controller.signal);
      if (!scopeIsCurrent(scope)) return;
      setAssets((current) => current.map((item) => item.id === asset.id ? { ...item, ...result.asset, sourceClaimIds: item.sourceClaimIds } : item));
    } catch (cause) {
      if (!scopeIsCurrent(scope) || isAbort(cause)) return;
      if (cause instanceof ApiClientError && cause.status === 409) {
        try {
          const refreshed = await listPresentationAssets(params.id, version.versionId, scope.controller.signal);
          if (!scopeIsCurrent(scope)) return;
          setAssets(refreshed.assets);
        } catch (refreshCause) {
          if (!scopeIsCurrent(scope) || isAbort(refreshCause)) return;
          setError(refreshCause instanceof Error ? refreshCause.message : t('transitionFailed'));
          return;
        }
      }
      setError(cause instanceof ApiClientError ? cause.message : cause instanceof Error ? cause.message : t('transitionFailed'));
    } finally {
      if (scopeIsCurrent(scope)) setWorking(false);
    }
  }

  function readonlyReason(): string {
    if (!version) return '';
    if (version.status !== 'draft') return t(`readonlyVersion.${version.status}`);
    if (workspace?.status !== 'active') return t('readonlyWorkspace');
    return t('readonlyRole');
  }

  if (bootstrapLoading) {
    return <DashboardShell activeRoute="create" navigationLabel={t('navigation')} skipLabel={t('skip')}><p className="p-8 text-os-muted-paper" role="status">{t('loading')}</p></DashboardShell>;
  }

  return (
    <DashboardShell activeRoute="create" mainClassName="p-0" navigationLabel={t('navigation')} skipLabel={t('skip')}>
      <div className="overflow-x-auto border-b border-os-rule-paper"><ResearchWorkspaceNav active="presentation" objectId={params.id} /></div>
      {invalidRequestedVersion ? (
        <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
          <p className="border-l-2 border-state-danger pl-4 text-state-danger" role="alert">{t('invalidVersion')}</p>
          <label className="mt-6 flex min-h-11 max-w-sm items-center gap-3 text-sm font-semibold">
            {t('selectAvailableVersion')}
            <select className="min-h-11 min-w-0 flex-1 rounded-control border border-os-rule-paper bg-transparent px-3" defaultValue="" onChange={(event) => { if (event.target.value) router.push(scopedUrl(params.id, event.target.value)); }}>
              <option value="" disabled>{t('chooseVersion')}</option>
              {versions.map((item) => <option key={item.versionId} value={item.versionId}>{t('versionOption', { number: item.versionNo, status: t(`versionStatus.${item.status}`) })}</option>)}
            </select>
          </label>
        </div>
      ) : error && !version ? <p className="m-8 border-l-2 border-state-danger pl-4 text-state-danger" role="alert">{error}</p> : version ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-os-rule-paper px-4 py-3 sm:px-8 lg:px-12">
            <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
              {t('version')}
              <select
                className="min-h-11 min-w-0 rounded-control border border-os-rule-paper bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion-ink"
                value={version.versionId}
                onChange={(event) => router.push(scopedUrl(params.id, event.target.value))}
              >
                {versions.map((item) => <option key={item.versionId} value={item.versionId}>{t('versionOption', { number: item.versionNo, status: t(`versionStatus.${item.status}`) })}</option>)}
              </select>
            </label>
            <a className="inline-flex min-h-11 items-center text-sm font-semibold text-os-vermilion-ink underline" href={`/research-objects/${encodeURIComponent(params.id)}/edit`}>{t('openEditor')}</a>
          </div>
          <PresentationWorkbench
            key={version.versionId}
            researchObjectId={params.id}
            claims={claims}
            assets={assets}
            version={version}
            canWrite={canWrite}
            readonlyReason={readonlyReason()}
            loading={scopeLoading}
            loadFailed={scopeLoadFailed}
            task={taskState}
            onCreateClaim={createClaim}
            onGenerate={(ids) => void generate(ids)}
            onResumeTask={() => setResumeNonce((current) => current + 1)}
            onRetryData={() => setLoadNonce((current) => current + 1)}
            onTransition={(assetItem, status) => void transition(assetItem, status)}
            working={working}
            error={error}
          />
        </>
      ) : (
        <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
          <p className="text-os-muted-paper">{t('noVersion')}</p>
          <div className="mt-5 flex flex-wrap gap-4">
            <a className="inline-flex min-h-11 items-center font-semibold text-os-vermilion-ink underline" href={`/research-objects/${encodeURIComponent(params.id)}/edit`}>{t('openEditor')}</a>
            <a className="inline-flex min-h-11 items-center font-semibold text-os-vermilion-ink underline" href={`/research-objects/${encodeURIComponent(params.id)}/versions`}>{t('openVersions')}</a>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
