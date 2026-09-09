'use client';

import { PackageCheck } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { LiteratureAcquisitionDisclosure } from '@/components/dashboard/LiteratureAcquisition';
import ArtifactUploader from '@/components/editor/ArtifactUploader';
import { ResearchSurfaceShell, ResearchSurfaceStateShell } from '@/components/research/ResearchSurfaceShell';
import { ApiClientError, createCommit, getResearchObject, type ArtifactReference, type ResearchObjectSummary, type SdfCore } from '@/lib/api';
import { appendMaterials, loadAttachmentDraft, loadResearchMaterials } from '@/lib/research-materials';

type FilesResearchObject = ResearchObjectSummary & { sdf: { core: SdfCore } };

export function ResearchObjectFilesLiteratureEntry({ researchObjectId }: { researchObjectId: string }) {
  const router = useRouter();
  return <LiteratureAcquisitionDisclosure instanceId="ro-files-literature" onAuthenticationRequired={() => router.replace(`/auth/login?returnTo=${encodeURIComponent(`/research-objects/${researchObjectId}/files`)}`)} target={{ kind: 'research_object', researchObjectId }} tone="dark" />;
}

export function ResearchObjectFilesContent({ object }: { object: FilesResearchObject }) {
  const t = useTranslations('productSurfaces');
  const taskStatus = useTranslations('ingestion.status');
  const [artifacts, setArtifacts] = useState<ArtifactReference[]>([]);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [restored, setRestored] = useState<Awaited<ReturnType<typeof loadResearchMaterials>> | null>(null);
  const [currentObject, setCurrentObject] = useState(object);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setRestored(null);
    const draft = revision === 0
      ? loadResearchMaterials(object.id).then((materials) => ({ researchObject: object, materials }))
      : loadAttachmentDraft(object.id);
    void draft.then(({ researchObject, materials }) => {
      if (!active) return;
      setCurrentObject(researchObject);
      setRestored(materials);
    }).catch((cause: Error) => { if (active) setError(cause); });
    return () => { active = false; };
  }, [object.id, revision]);

  async function attach() {
    if (artifacts.length === 0 || !restored || saving) return;
    setSaving(true);
    setError(null);
    try {
      await createCommit(object.id, { message: message.trim() || t('files.defaultCommit'), version: currentObject.version, sdfCore: currentObject.sdf.core, artifacts: appendMaterials(restored.artifacts, artifacts) });
      setCommitted(true);
      setArtifacts([]);
      setRevision((value) => value + 1);
    } catch (cause) {
      setError(cause as Error);
    } finally {
      setSaving(false);
    }
  }

  return <ResearchSurfaceShell active="files" object={currentObject} rail={<div><p className="font-data text-[10px] uppercase tracking-[0.14em] text-os-muted-dark">{t('files.provenance')}</p><p className="mt-4 text-sm leading-6 text-os-muted-dark">{t('files.provenanceBody')}</p></div>}>
    <header><p className="font-data text-[10px] uppercase tracking-[0.16em] text-os-vermilion">{t('files.kicker')}</p><h1 className="mt-3 font-editorial text-5xl font-normal text-os-paper">{t('files.title')}</h1><p className="mt-4 max-w-2xl text-sm leading-6 text-os-muted-dark">{t('files.body')}</p></header>
    <div className="mt-7">
      <ResearchObjectFilesLiteratureEntry researchObjectId={object.id} />
    </div>
    {!restored && !error && <p role="status">{t('state.loadingBody')}</p>}
    {restored && <section className="mt-7 border-y border-os-rule-dark py-4" aria-label={t('files.savedMaterials')}>
      <h2 className="text-lg">{t('files.savedMaterials')}</h2>
      {restored.artifacts.map((artifact) => <p className="mt-3 break-all" key={artifact.logicalPath}><a className="text-os-vermilion-ink underline" href={`/api/artifacts/${encodeURIComponent(artifact.artifactId)}/download`}>{artifact.logicalPath}</a></p>)}
      {restored.ingestion.tasks.map((task) => <div className="mt-3" key={task.id}><Link className="underline" href={`/research-objects/${encodeURIComponent(object.id)}/hermes?task=${encodeURIComponent(task.id)}`}>{task.logicalPath}</Link><span className="ml-3">{taskStatus(task.state)}</span>{task.confirmation && <Link className="ml-3 underline" href={`/research-objects/${encodeURIComponent(object.id)}/versions?version=${encodeURIComponent(task.confirmation.versionId)}`}>{t('files.snapshotVersion', { version: task.confirmation.versionNo })}</Link>}</div>)}
    </section>}
    <ArtifactUploader artifacts={artifacts} onArtifactsChange={(next) => { setArtifacts(next); setCommitted(false); }} workspaceId={object.workspaceId} />
    {artifacts.length === 0 ? <div className="mt-8 border-l border-os-rule-dark pl-5" data-surface-state="empty"><p className="text-sm text-os-muted-dark">{committed ? t('files.committed') : restored?.artifacts.length || restored?.ingestion.tasks.length ? t('files.addMore') : t('files.empty')}</p></div> : <section className="mt-8 border-t border-os-rule-dark pt-6"><label className="block text-xs text-os-muted-dark">{t('files.commitMessage')}<input className="mt-2 min-h-11 w-full border border-os-rule-dark bg-os-black-1 px-3 text-sm text-os-paper outline-none focus:border-os-paper" onChange={(event) => setMessage(event.target.value)} value={message} /></label><button className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-panel bg-os-paper px-4 text-sm font-semibold text-os-black-0 disabled:opacity-40" disabled={saving || !restored} onClick={attach}><PackageCheck className="h-4 w-4" />{saving ? t('files.attaching') : t('files.attach')}</button></section>}
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
