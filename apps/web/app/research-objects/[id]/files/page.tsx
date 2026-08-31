'use client';

import { PackageCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { LiteratureAcquisitionDisclosure } from '@/components/dashboard/LiteratureAcquisition';
import ArtifactUploader from '@/components/editor/ArtifactUploader';
import { ResearchSurfaceShell, ResearchSurfaceStateShell } from '@/components/research/ResearchSurfaceShell';
import { ApiClientError, createCommit, getResearchObject, type ArtifactReference, type ResearchObjectSummary, type SdfCore } from '@/lib/api';

type FilesResearchObject = ResearchObjectSummary & { sdf: { core: SdfCore } };

export function ResearchObjectFilesLiteratureEntry({ researchObjectId }: { researchObjectId: string }) {
  const router = useRouter();
  return <LiteratureAcquisitionDisclosure instanceId="ro-files-literature" onAuthenticationRequired={() => router.replace(`/auth/login?returnTo=${encodeURIComponent(`/research-objects/${researchObjectId}/files`)}`)} target={{ kind: 'research_object', researchObjectId }} tone="dark" />;
}

export function ResearchObjectFilesContent({ object }: { object: FilesResearchObject }) {
  const t = useTranslations('productSurfaces');
  const [artifacts, setArtifacts] = useState<ArtifactReference[]>([]);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function attach() {
    if (artifacts.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await createCommit(object.id, { message: message.trim() || t('files.defaultCommit'), version: object.version, sdfCore: object.sdf.core, artifacts });
      setCommitted(true);
      setArtifacts([]);
    } catch (cause) {
      setError(cause as Error);
    } finally {
      setSaving(false);
    }
  }

  return <ResearchSurfaceShell active="files" object={object} rail={<div><p className="font-data text-[10px] uppercase tracking-[0.14em] text-os-muted-dark">{t('files.provenance')}</p><p className="mt-4 text-sm leading-6 text-os-muted-dark">{t('files.provenanceBody')}</p></div>}>
    <header><p className="font-data text-[10px] uppercase tracking-[0.16em] text-os-vermilion">{t('files.kicker')}</p><h1 className="mt-3 font-editorial text-5xl font-normal text-os-paper">{t('files.title')}</h1><p className="mt-4 max-w-2xl text-sm leading-6 text-os-muted-dark">{t('files.body')}</p></header>
    <div className="mt-7">
      <ResearchObjectFilesLiteratureEntry researchObjectId={object.id} />
    </div>
    <ArtifactUploader artifacts={artifacts} onArtifactsChange={(next) => { setArtifacts(next); setCommitted(false); }} workspaceId={object.workspaceId} />
    {artifacts.length === 0 ? <div className="mt-8 border-l border-os-rule-dark pl-5" data-surface-state="empty"><p className="text-sm text-os-muted-dark">{committed ? t('files.committed') : t('files.empty')}</p></div> : <section className="mt-8 border-t border-os-rule-dark pt-6"><label className="block text-xs text-os-muted-dark">{t('files.commitMessage')}<input className="mt-2 min-h-11 w-full border border-os-rule-dark bg-os-black-1 px-3 text-sm text-os-paper outline-none focus:border-os-paper" onChange={(event) => setMessage(event.target.value)} value={message} /></label><button className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-panel bg-os-paper px-4 text-sm font-semibold text-os-black-0 disabled:opacity-40" disabled={saving} onClick={attach}><PackageCheck className="h-4 w-4" />{saving ? t('files.attaching') : t('files.attach')}</button></section>}
    {error && <p className="mt-6 text-sm text-os-vermilion" role="alert">{error.message}</p>}
  </ResearchSurfaceShell>;
}

export default function FilesPage({ params }: { params: { id: string } }) {
  const t = useTranslations('productSurfaces');
  const [object, setObject] = useState<FilesResearchObject | null>(null);
  const [error, setError] = useState<ApiClientError | Error | null>(null);
  useEffect(() => { void getResearchObject(params.id).then(({ researchObject }) => setObject(researchObject)).catch(setError); }, [params.id]);
  if (error) return <ResearchSurfaceStateShell active="files" detail={error.message} kind={error instanceof ApiClientError && error.status === 403 ? 'forbidden' : 'error'} objectId={params.id} title={t('state.errorTitle')} />;
  if (!object) return <ResearchSurfaceStateShell active="files" detail={t('state.loadingBody')} kind="loading" objectId={params.id} title={t('files.title')} />;
  return <ResearchObjectFilesContent object={object} />;
}
