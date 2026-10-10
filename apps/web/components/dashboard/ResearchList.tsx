'use client';

import Link from 'next/link';
import { ArrowRight, MoreHorizontal, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useEffect, useState } from 'react';

import { Input } from '@/components/ui/input';
import { TrashActionButton } from '@/components/research/TrashActionButton';
import { ScientificText } from '@/components/content/ScientificText';
import { useSession } from '@/components/auth/SessionProvider';
import { apiRequest, getResearchObject, getPublicResearchVersion, listVersions, listPresentationAssets, presentationAssetContentUrl, listMyWorkspaces, searchResearchObjects, type PresentationAsset, type ResearchObjectSearchApi, type SdfCore, type VersionSummary, type WorkspaceApi } from '@/lib/api';
import styles from '@/app/dashboard/dashboard.module.css';

export interface DashboardResearch {
  id: string;
  publicId: string;
  title: string;
  versionNo: number;
  status: string;
  pendingCount: number;
}

export interface ResearchListProps {
  researchObjects: DashboardResearch[];
  onChanged?(): void;
}

type CurrentMedia = { id: string; url: string; label?: string; identity: string };
type CurrentSnapshot = { scope: string; title: string; core: SdfCore | Record<string, string>; version?: VersionSummary; media: CurrentMedia | null };
type VersionRecord = {
  objectId: string; versionId: string; citation?: { title?: string | null }; sdf: SdfCore;
  publicationNo?: number | null;
  media?: Array<{ id: string; kind: string; reader?: { order: number; title?: string; narration?: string } }>;
};

export function CurrentResearchCard({ research, ownerId }: { research: DashboardResearch; ownerId: string }) {
  const t = useTranslations('dashboard');
  const session = useSession();
  const authorized = session.status === 'authenticated' && session.user?.userId === ownerId;
  // This revision invalidates a read; it is never used as a committed/public version number.
  const { id: researchId, versionNo: revision } = research;
  const scope = JSON.stringify([ownerId, researchId, revision]);
  const [retry, setRetry] = useState(0);
  const [loaded, setLoaded] = useState<CurrentSnapshot | null>(null);
  const [failedScope, setFailedScope] = useState('');
  const [failedImage, setFailedImage] = useState('');

  useEffect(() => {
    if (!authorized) return;
    let active = true;
    const controller = new AbortController();
    setLoaded(null);
    setFailedScope('');
    void (async () => {
      try {
        const [{ researchObject: object }, { versions }] = await Promise.all([
          getResearchObject(researchId, { fresh: true }), listVersions(researchId, { fresh: true }),
        ]);
        if (!active) return;
        if (object.id !== researchId) throw new Error('Research scope changed');
        const version = [...versions].sort((left, right) => right.versionNo - left.versionNo)[0];
        let title = object.title;
        let core: SdfCore | Record<string, string> = object.sdf.core;
        let media: CurrentMedia | null = null;
        if (version && ['published', 'revised'].includes(version.status)) {
          if (!object.publicId || !version.publicationNo) throw new Error('Publication unavailable');
          const { research: publication } = await getPublicResearchVersion(object.publicId, version.publicationNo, controller.signal);
          const recordUrl = `/api/research-objects/${encodeURIComponent(researchId)}/versions/${encodeURIComponent(version.versionId)}/record`;
          if (publication.publicId !== object.publicId || publication.version.versionNo !== version.publicationNo || publication.recordUrl !== recordUrl
            || !['published', 'revised'].includes(publication.version.status)) throw new Error('Publication scope changed');
          title = publication.title;
          core = publication.version.core;
          const image = publication.presentationAssets.filter(asset => asset.kind === 'image' || asset.kind === 'chart')
            .sort((left, right) => (left.reader?.order ?? Number.MAX_SAFE_INTEGER) - (right.reader?.order ?? Number.MAX_SAFE_INTEGER))[0];
          if (image) media = { id: image.id, url: image.url, label: image.reader?.title, identity: `${version.versionId}:${image.id}:${image.contentHash}` };
        } else if (version) {
          const base = `/api/research-objects/${encodeURIComponent(researchId)}/versions/${encodeURIComponent(version.versionId)}`;
          const [{ record }, { assets }] = await Promise.all([
            apiRequest<{ record: VersionRecord }>(`${base}/record`, { signal: controller.signal }),
            listPresentationAssets(researchId, version.versionId, controller.signal),
          ]);
          if (record.objectId !== researchId || record.versionId !== version.versionId) throw new Error('Version scope changed');
          // Publication may settle between these reads; never turn its absent private projection into all approved media.
          if (record.publicationNo != null) throw new Error('Version was published; refresh its projection');
          title = record.citation?.title?.trim() || object.title;
          core = record.sdf;
          const recorded = record.media === undefined ? null : new Map(record.media.map(asset => [asset.id, asset]));
          const images = assets.filter((asset: PresentationAsset) => asset.researchObjectId === researchId && asset.versionId === version.versionId
            && asset.status === 'approved' && asset.kind === 'image' && !asset.paperOriginal
            && asset.generator !== 'OpenScience paper-original figure' && (!recorded || recorded.has(asset.id)));
          images.sort((left, right) => (recorded?.get(left.id)?.reader?.order ?? Number.MAX_SAFE_INTEGER)
            - (recorded?.get(right.id)?.reader?.order ?? Number.MAX_SAFE_INTEGER));
          const image = images[0];
          if (image) media = { id: image.id, url: presentationAssetContentUrl(researchId, version.versionId, image.id),
            label: recorded?.get(image.id)?.reader?.title, identity: `${version.versionId}:${image.id}:${image.contentHash}` };
        }
        if (active) setLoaded({ scope, title, core, version, media });
      } catch {
        if (active) setFailedScope(scope);
      }
    })();
    return () => { active = false; controller.abort(); };
  }, [authorized, ownerId, researchId, revision, scope, retry]);

  if (!authorized) return null;
  const current = loaded?.scope === scope ? loaded : null;
  const failed = failedScope === scope;
  const media = current?.media;
  const imageKey = media ? `${scope}:${media.identity}:${retry}` : '';
  const imageFailed = Boolean(media && failedImage === imageKey);
  const imageLabel = media?.label || t('current.imageTitle');
  const imageUrl = media ? `${media.url}${retry ? `${media.url.includes('?') ? '&' : '?'}attempt=${retry}` : ''}` : '';
  const summary = current?.core.insight?.trim() || current?.core.problem?.trim();
  const isPublic = current?.version && ['published', 'revised'].includes(current.version.status);

  return <article className={styles.currentResearch} aria-labelledby="current-research-title" data-current-research={researchId} data-hermes-protected="true" data-media-state={failed || imageFailed ? 'failed' : !current ? 'loading' : media ? 'ready' : 'empty'}>
    <div className={styles.currentCopy}>
      <p className={styles.currentKicker}>{t('continue.title')}</p>
      <h2 id="current-research-title" className={styles.currentTitle}>{current?.title || research.title}</h2>
      {summary ? <ScientificText as="p" className={styles.currentSummary} hideSourceMarkers>{summary}</ScientificText> : null}
      {current ? <p className={styles.currentMeta}>{current.version ? t(isPublic ? 'current.publicationVersion' : 'current.savedVersion', { version: isPublic ? current.version.publicationNo! : current.version.versionNo }) : t('continue.draftRevision')}</p> : null}
    </div>
    <div className={styles.currentMedia}>
      {failed || imageFailed ? <div className={styles.currentMediaState} role="status"><p>{t('current.mediaFailed')}</p><button type="button" onClick={() => setRetry(value => value + 1)}>{t('current.retry')}</button></div>
        : !current ? <div className={styles.currentMediaState} role="status" aria-busy="true"><span className={styles.currentMediaSkeleton} aria-hidden="true" /><p>{t('current.loading')}</p></div>
          : media ? <figure className={styles.currentFigure}>
            <a href={imageUrl} target="_blank" rel="noreferrer" aria-label={`${imageLabel} — ${t('current.openImage')}`}>
              <img key={imageKey} src={imageUrl} alt={imageLabel} loading="eager" onError={() => setFailedImage(imageKey)} />
              <span className={styles.currentImageLink}>{t('current.openImage')} ↗</span>
            </a>
          </figure> : <div className={styles.currentMediaState}><span className={styles.currentEmptyMark} aria-hidden="true">↗</span><p>{t('current.noImage')}</p></div>}
    </div>
    <Link className={styles.currentContinue} href={`/research-objects/${encodeURIComponent(researchId)}/edit`}>{t('current.open')}<ArrowRight size={18} aria-hidden="true" /></Link>
  </article>;
}

export function ResearchList({ researchObjects, onChanged }: ResearchListProps) {
  const t = useTranslations('dashboard');
  const [query, setQuery] = useState('');
  const [workspaces, setWorkspaces] = useState<WorkspaceApi[]>([]);
  const [workspaceId, setWorkspaceId] = useState('');
  const [workspaceError, setWorkspaceError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: ResearchObjectSearchApi; failed?: boolean }>();
  const normalizedQuery = query.trim();
  const queryKey = JSON.stringify([workspaceId, normalizedQuery, retry]);

  useEffect(() => {
    let active = true;
    setWorkspaceError(false);
    void listMyWorkspaces().then(rows => {
      if (!active) return;
      setWorkspaces(rows);
      setWorkspaceError(rows.length === 0);
      setWorkspaceId(current => rows.some(row => row.id === current)
        ? current : (rows.find(row => row.type === 'personal') ?? rows[0])?.id ?? '');
    }).catch(() => { if (active) setWorkspaceError(true); });
    return () => { active = false; };
  }, [retry]);

  useEffect(() => {
    if (!normalizedQuery || !workspaceId) return;
    setResult(undefined);
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void searchResearchObjects({ workspaceId, query: normalizedQuery }, controller.signal)
        .then(data => { if (!controller.signal.aborted) setResult({ key: queryKey, data }); })
        .catch(() => { if (!controller.signal.aborted) setResult({ key: queryKey, failed: true }); });
    }, 500);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [normalizedQuery, workspaceId, queryKey]);

  const currentResult = result?.key === queryKey ? result : undefined;
  const searchFailed = Boolean(normalizedQuery && (workspaceError || currentResult?.failed));
  const searching = Boolean(normalizedQuery && !searchFailed && !currentResult?.data);
  const visible: DashboardResearch[] = !normalizedQuery ? researchObjects
    : (currentResult?.data?.researchObjects ?? []).map(item => ({
      id: item.id, publicId: item.publicId ?? `DRAFT-${item.id.slice(0, 8)}`, title: item.title,
      versionNo: item.version, status: item.status, pendingCount: 0,
    }));

  return (
    <section
      className={styles.researchLibrary}
      aria-labelledby="research-list-title"
      data-hermes-protected="true"
      data-surface-state={searchFailed ? 'error' : searching ? 'loading' : visible.length === 0 ? 'empty' : 'ready'}
    >
      <div className={styles.libraryHeading}>
        <h2 id="research-list-title" className={styles.libraryTitle}>
          {t('research.title')}
        </h2>
        <div className={styles.searchControls}>
          {workspaces.length > 1 ? (
            <label className={styles.searchScope}>
              <span>{t('research.searchScope')}</span>
              <select className={styles.scopeSelect}
                value={workspaceId} onChange={event => setWorkspaceId(event.target.value)}>
                {workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
              </select>
            </label>
          ) : null}
          <label className={styles.searchField}>
            <span className="sr-only">{t('research.search')}</span>
            <Search className={styles.searchIcon} size={16} aria-hidden="true" />
            <Input
              className={styles.searchInput}
              type="search"
              placeholder={t('research.search')}
              value={query}
              maxLength={120}
              aria-describedby={normalizedQuery ? 'research-search-status' : undefined}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>
      </div>

      {normalizedQuery ? (
        <p id="research-search-status" role="status" className={styles.searchFeedback}>
          {searchFailed ? t('research.searchUnavailable')
            : searching ? t('research.searchLoading')
              : t(`research.searchMode.${currentResult!.data!.search.mode}`)}
          {searchFailed ? <button type="button" className={styles.textAction} onClick={() => setRetry(value => value + 1)}>{t('errors.retry')}</button> : null}
        </p>
      ) : null}
      {!searching && !searchFailed && visible.length === 0 ? (
        <p className={styles.libraryEmpty} role="status">
          {researchObjects.length === 0 ? t('research.empty') : t('research.noResults')}
        </p>
      ) : visible.length > 0 ? (
        <ul className={styles.researchEntries} aria-label={t('research.title')}>
          {visible.map((research) => (
            <li key={research.id} className={styles.researchEntry}>
              <Link
                href={`/research-objects/${encodeURIComponent(research.id)}/edit`}
                className={styles.researchLink}
              >
                <span className={styles.researchEntryCopy}>
                  <span className={styles.researchEntryTitle}>
                    {research.title}
                  </span>
                </span>
                <span data-reading-role="caption" className={styles.entryMeta}>
                  <span>{research.status === 'draft' ? t('research.draftRevision') : t(`research.status.${research.status}`)}</span>
                </span>
                <ArrowRight className={styles.entryArrow} size={18} aria-hidden="true" />
              </Link>
              <details className={styles.researchEntryAction}>
                <summary aria-label={t('research.actions', { title: research.title })}><MoreHorizontal size={18} aria-hidden="true" /></summary>
                <div>
                  <TrashActionButton kind="research_object" resourceId={research.id} title={research.title} published={!research.publicId.startsWith('DRAFT-')} onDone={() => {
                    setRetry(value => value + 1);
                    onChanged?.();
                  }} />
                </div>
              </details>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
