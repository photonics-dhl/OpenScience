'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { ResearchSurfaceShell, ResearchSurfaceStateShell } from '@/components/research/ResearchSurfaceShell';
import { ScientificText } from '@/components/content/ScientificText';
import { apiRequest, ApiClientError, getResearchIngestion, getResearchObject, listVersions, listPresentationAssets, presentationAssetContentUrl, type PresentationAsset, type ResearchIngestion, type ResearchObjectSummary, type SdfCore, type VersionSummary, type WorkspaceGuidePayload } from '@/lib/api';
import styles from './overview.module.css';

type ReaderMedia = { id: string; kind: string; reader?: { order: number; title?: string; narration?: string } };
type OverviewMedia = PresentationAsset & Pick<ReaderMedia, 'reader'>;
type Loaded = { object: ResearchObjectSummary & { sdf: { core: SdfCore } }; mediaVersion?: VersionSummary; assets: OverviewMedia[]; mediaFailed: boolean; mediaLoading: boolean };
const fields = ['problem', 'insight', 'method', 'results', 'limitations', 'reproducibility'] as const;
const targets: Record<typeof fields[number], WorkspaceGuidePayload['target']> = { problem: 'sdf-problem', insight: 'sdf-insight', method: 'sdf-method', results: 'sdf-results', limitations: 'sdf-limitations', reproducibility: 'sdf-evidence' };

function OverviewAsset({ asset, objectId }: { asset: OverviewMedia; objectId: string }) {
  const t = useTranslations('productSurfaces.overview');
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const title = asset.reader?.title || t(asset.kind === 'video' ? 'videoTitle' : 'imageTitle');
  const src = `${presentationAssetContentUrl(objectId, asset.versionId, asset.id)}${attempt ? `?attempt=${attempt}` : ''}`;
  return <figure data-overview-asset={asset.id}>
    {failed ? <div role="status"><p>{t('mediaFailed')}</p><button type="button" onClick={() => { setAttempt(value => value + 1); setFailed(false); }}>{t('retry')}</button></div>
      : asset.kind === 'video' ? <video controls playsInline preload="metadata" aria-label={title} src={src} onError={() => setFailed(true)} />
      : <img src={src} alt={title} loading="lazy" onError={() => setFailed(true)} />}
    <figcaption><ScientificText as="strong" hideSourceMarkers>{title}</ScientificText>{asset.reader?.narration ? <ScientificText as="p" className={styles.mediaNarration} hideSourceMarkers>{asset.reader.narration}</ScientificText> : null}</figcaption>
  </figure>;
}

export default function ResearchOverviewPage({ params }: { params: { id: string } }) {
  const query = useSearchParams();
  const versionId = query.get('version') || '';
  return <ResearchOverview key={`${params.id}:${versionId}`} params={params} requestedVersionId={versionId} />;
}

function ResearchOverview({ params, requestedVersionId }: { params: { id: string }; requestedVersionId: string }) {
  const t = useTranslations('productSurfaces');
  const recordText = useTranslations('versionRecord');
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<{ id: string; cause: Error } | null>(null);
  const [ingestion, setIngestion] = useState<{ id: string; status: 'loading' | 'ready' | 'failed'; value: ResearchIngestion | null }>({ id: params.id, status: 'loading', value: null });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoaded(null); setError(null); setIngestion({ id: params.id, status: 'loading', value: null });
    void getResearchIngestion(params.id)
      .then((value) => { if (active && value.researchObjectId === params.id) setIngestion({ id: params.id, status: 'ready', value }); })
      .catch(() => { if (active) setIngestion({ id: params.id, status: 'failed', value: null }); });
    void (async () => {
      try {
        const [{ researchObject: object }, { versions }] = await Promise.all([getResearchObject(params.id), listVersions(params.id)]);
        if (!active) return;
        const version = requestedVersionId ? versions.find(item => item.versionId === requestedVersionId)
          : [...versions].sort((a, b) => b.versionNo - a.versionNo)[0];
        if (requestedVersionId && !version) throw new Error(recordText('mismatch'));
        const record = version ? (await apiRequest<{ record: { objectId: string; versionId: string; citation?: { title?: string | null }; sdf: SdfCore; media?: ReaderMedia[] } }>(
          `/api/research-objects/${encodeURIComponent(params.id)}/versions/${encodeURIComponent(version.versionId)}/record`, { signal: controller.signal },
        )).record : null;
        if (record && (record.objectId !== params.id || record.versionId !== version?.versionId)) throw new Error(recordText('mismatch'));
        if (!active) return;
        const recordedTitle = record?.citation?.title;
        const scopedObject = record ? { ...object, title: typeof recordedTitle === 'string' && recordedTitle.trim() ? recordedTitle : object.title, sdf: { core: record.sdf } } : object;
        setLoaded({ object: scopedObject, mediaVersion: version, assets: [], mediaFailed: false, mediaLoading: Boolean(version) });
        let assets: OverviewMedia[] = [];
        let mediaFailed = false;
        if (version) {
          try {
            const response = await listPresentationAssets(object.id, version.versionId, controller.signal);
            const frozenMedia = record?.media ? new Map(record.media.map(asset => [asset.id, asset])) : null;
            assets = response.assets.filter(asset => asset.researchObjectId === object.id && asset.versionId === version.versionId
              && asset.status === 'approved' && (asset.kind === 'image' || asset.kind === 'video')
              && (!frozenMedia || frozenMedia.has(asset.id)))
              .map(asset => ({ ...asset, ...(frozenMedia?.get(asset.id)?.reader ? { reader: frozenMedia.get(asset.id)!.reader } : {}) }))
              .sort((left, right) => (left.reader?.order ?? Number.MAX_SAFE_INTEGER) - (right.reader?.order ?? Number.MAX_SAFE_INTEGER));
          } catch { mediaFailed = true; }
        }
        if (active) setLoaded({ object: scopedObject, mediaVersion: version, assets, mediaFailed, mediaLoading: false });
      } catch (cause) { if (active) setError({ id: params.id, cause: cause instanceof Error ? cause : new Error(t('state.errorTitle')) }); }
    })();
    return () => { active = false; controller.abort(); };
  }, [params.id, requestedVersionId, retry, t, recordText]);
  if (error?.id === params.id) return <ResearchSurfaceStateShell active="overview" detail={error.cause.message} kind={error.cause instanceof ApiClientError && error.cause.status === 403 ? 'forbidden' : 'error'} objectId={params.id} title={t(error.cause instanceof ApiClientError && error.cause.status === 403 ? 'state.forbiddenTitle' : 'state.errorTitle')} />;
  if (!loaded || loaded.object.id !== params.id) return <ResearchSurfaceStateShell active="overview" detail={t('state.loadingBody')} kind="loading" objectId={params.id} title={t('overview.title')} />;
  const { object, assets, mediaVersion, mediaFailed, mediaLoading } = loaded;
  const entries = fields.filter(field => object.sdf.core[field]?.trim());
  const root = `/research-objects/${encodeURIComponent(object.id)}`;
  const versionQuery = mediaVersion ? `?version=${encodeURIComponent(mediaVersion.versionId)}` : '';
  const scopedIngestion = ingestion.id === object.id ? ingestion : { id: object.id, status: 'loading' as const, value: null };
  const ingestionTasks = scopedIngestion.value?.tasks ?? [];
  const hasIngestionTask = scopedIngestion.status === 'ready' && ingestionTasks.length > 0;
  const ingestionHref = ingestionTasks.length === 1
    ? `${root}/hermes?task=${encodeURIComponent(ingestionTasks[0].id)}`
    : `${root}/hermes`;
  const media = <section className={styles.media} aria-label={t('overview.media')}>
          <h2>{t('overview.media')}</h2>
          {assets.map(asset => <OverviewAsset key={`${asset.versionId}:${asset.id}`} asset={asset} objectId={object.id} />)}
          {assets.length === 0 && !mediaFailed && !mediaLoading ? <p>{t('overview.noMedia')}</p> : null}
          {mediaLoading ? <p role="status">{t('state.loadingBody')}</p> : null}
          {mediaFailed ? <div role="status"><p>{t('overview.mediaFailed')}</p><button type="button" onClick={() => setRetry(value => value + 1)}>{t('overview.retry')}</button></div> : null}
        </section>;
  return <ResearchSurfaceShell key={object.id} active="overview" object={object} className={styles.surface} rail={<div className={styles.rail}><span className={styles.companionLabel}>HERMES</span><h2>{t('overview.companionTitle')}</h2><p>{t('overview.companionBody')}</p></div>}>
    {openAssistant => <article className={styles.article} data-research-overview={object.id}>
      <header className={styles.header}><p>{t('overview.kicker')}</p><h1>{object.title}</h1><div className={styles.actions}><Link href={entries.length ? `${root}/edit` : hasIngestionTask ? ingestionHref : scopedIngestion.status === 'ready' ? `${root}/files` : `${root}/hermes`}>{t(entries.length ? 'overview.continue' : hasIngestionTask ? 'overview.continueIngestion' : scopedIngestion.status === 'ready' ? 'overview.upload' : 'overview.openHermes')}</Link><button type="button" data-testid="overview-hermes" onClick={() => openAssistant(null)}><img src="/hermes/wanko-static.png" alt="" />Hermes</button></div></header>
      {entries.length === 0 ? <section className={styles.start} data-surface-state={hasIngestionTask ? 'actionable' : scopedIngestion.status}><span className={styles.startMark} aria-hidden="true">01</span><h2>{t(hasIngestionTask ? 'overview.ingestionTitle' : scopedIngestion.status === 'loading' ? 'overview.ingestionLoadingTitle' : scopedIngestion.status === 'failed' ? 'overview.ingestionUnknownTitle' : 'overview.emptyTitle')}</h2><p>{t(hasIngestionTask ? 'overview.ingestionBody' : scopedIngestion.status === 'loading' ? 'overview.ingestionLoadingBody' : scopedIngestion.status === 'failed' ? 'overview.ingestionUnknownBody' : 'overview.emptyBody')}</p>{hasIngestionTask ? <Link className={styles.startAssistant} href={ingestionHref}>{t('overview.continueIngestion')} →</Link> : scopedIngestion.status === 'ready' ? <button type="button" className={styles.startAssistant} onClick={() => openAssistant(null)}>{t('overview.ask')} →</button> : <Link className={styles.startAssistant} href={`${root}/hermes`}>{t('overview.openHermes')} →</Link>}<div className={styles.steps}><Link href={`${root}/edit`}><span>02</span><strong>{t('overview.stepOne')}</strong><p>{t('overview.stepOneBody')}</p></Link><Link href={`${root}/presentation`}><span>03</span><strong>{t('overview.stepTwo')}</strong><p>{t('overview.stepTwoBody')}</p></Link></div></section> : null}
      {entries.length === 0 && (assets.length > 0 || mediaFailed || mediaLoading) ? media : null}
      {entries.map((field, index) => <section key={field} id={`overview-${field}`} className={styles.section} data-hermes-protected="true">
        <h2>{t(`fields.${field}`)}</h2><ScientificText hideSourceMarkers as="p" className={styles.narrative}>{object.sdf.core[field]}</ScientificText>
        <button type="button" className={styles.discuss} data-testid={`overview-discuss-${field}`} onClick={() => openAssistant(targets[field])}><img src="/hermes/wanko-static.png" alt="" />{t('overview.discuss')}</button>
        {index === Math.min(1, entries.length - 1) ? media : null}
      </section>)}
      <details className={styles.evidence}>
        <summary>{t('overview.sources')}</summary>
        {mediaVersion ? <p>{t('overview.mediaVersion', { number: mediaVersion.versionNo })}</p> : null}
        <p>{t('overview.notEvidence')}</p>
        <p>{t('overview.sourceBody')}</p>
        <Link href={`${root}/files`}>{t('overview.openSources')}</Link>
        <Link href={`${root}/versions`}>{t('overview.inspect')}</Link>
        <Link href={`${root}/presentation${versionQuery}`}>{t('overview.manageMedia')} →</Link>
      </details>
    </article>}
  </ResearchSurfaceShell>;
}
