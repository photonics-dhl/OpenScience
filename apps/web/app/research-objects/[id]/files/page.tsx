'use client';

import { PackageCheck } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { LiteratureAcquisitionDisclosure } from '@/components/dashboard/LiteratureAcquisition';
import ArtifactUploader from '@/components/editor/ArtifactUploader';
import { ArtifactRow } from '@/components/research/ArtifactRow';
import { ArtifactViewer } from '@/components/research/ArtifactViewer';
import { ResearchSurfaceShell, ResearchSurfaceStateShell } from '@/components/research/ResearchSurfaceShell';
import { ApiClientError, createCommit, getResearchObject, type ArtifactReference, type ResearchObjectSummary, type SdfCore } from '@/lib/api';
import { appendMaterials, loadAttachmentDraft, loadResearchMaterials } from '@/lib/research-materials';
import styles from './files.module.css';
import { PaperDoiAssociation } from './PaperDoiAssociation';

type FilesResearchObject = ResearchObjectSummary & { sdf: { core: SdfCore } };

export function ResearchObjectFilesLiteratureEntry({ researchObjectId }: { researchObjectId: string }) {
  const router = useRouter();
  return <LiteratureAcquisitionDisclosure instanceId="ro-files-literature" onAuthenticationRequired={() => router.replace(`/auth/login?returnTo=${encodeURIComponent(`/research-objects/${researchObjectId}/files`)}`)} target={{ kind: 'research_object', researchObjectId }} tone="paper" />;
}

export function ResearchObjectFilesContent({ object }: { object: FilesResearchObject }) {
  const t = useTranslations('productSurfaces');
  const commonT = useTranslations('common');
  const taskStatus = useTranslations('ingestion.status');
  const router = useRouter();
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
    void loadAttachmentDraft(object.id).then(({ researchObject, materials }) => {
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

  return <ResearchSurfaceShell active="files" object={currentObject} rail={<div><p className="text-sm font-medium text-os-ink">{t('files.provenance')}</p><p className="mt-3 text-sm leading-6 text-os-muted-paper">{t('files.provenanceBody')}</p></div>}>
    <div className={styles.materials}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>{t('files.kicker')}</p>
        <h1>{t('files.title')}</h1>
        <p className={styles.description}>{t('files.body')}</p>
      </header>
      {!restored && !error && <p className={styles.feedback} role="status">{t('state.loadingBody')}</p>}
      <PaperDoiAssociation object={currentObject} onSaved={(doi, version) => { setCurrentObject((current) => ({ ...current, originalDoi: doi, version })); setRevision((value) => value + 1); }} />
      {restored && (restored.artifacts.length > 0 || restored.ingestion.tasks.length > 0) ? <section className={styles.savedMaterials} aria-labelledby="saved-materials-title">
        <h2 id="saved-materials-title">{t('files.savedMaterials')}</h2>
        {restored.artifacts.map((artifact) => <ArtifactRow action={<ArtifactViewer artifactId={artifact.artifactId} logicalPath={artifact.logicalPath} />} key={artifact.artifactId} name={artifact.logicalPath} />)}
        {restored.ingestion.tasks.map((task) => <ArtifactRow key={task.id}
          name={<Link className={styles.materialLink} href={`/research-objects/${encodeURIComponent(object.id)}/edit?ingestionTask=${encodeURIComponent(task.id)}`}>{task.logicalPath}</Link>}
          status={taskStatus(task.state)}
          action={task.confirmation ? <Link className={styles.textAction} href={`/research-objects/${encodeURIComponent(object.id)}/versions?version=${encodeURIComponent(task.confirmation.versionId)}`}>{t('files.confirmedDraft')}</Link> : undefined}
        />)}
      </section> : null}
      <fieldset className={styles.uploadArea} disabled={saving} aria-busy={saving}>
        <ArtifactUploader artifacts={artifacts} onArtifactsChange={(next) => { setArtifacts(next); setCommitted(false); }} onIngestionStarted={(task) => {
          setRevision((value) => value + 1);
          router.push(`/research-objects/${encodeURIComponent(object.id)}/edit?ingestionTask=${encodeURIComponent(task.id)}`);
        }} researchObjectId={object.id} workspaceId={object.workspaceId} />
        {artifacts.length > 0 ? <section className={styles.commitArea}>
          <label className={styles.commitLabel}>{t('files.commitMessage')}<input className={styles.commitInput} onChange={(event) => setMessage(event.target.value)} value={message} /></label>
          <button type="button" className={styles.saveAction} disabled={saving || !restored} onClick={attach}><PackageCheck aria-hidden="true" size={16} />{saving ? t('files.attaching') : t('files.attach')}</button>
        </section> : null}
      </fieldset>
      {error ? <div className={styles.error}>
        <p role="alert">{error.message}</p>
        {!restored ? <button className={styles.textAction} type="button" onClick={() => { setError(null); setRevision(value => value + 1); }}>{commonT('retry')}</button> : null}
      </div> : artifacts.length === 0 && restored ? <p className={styles.feedback} role={committed ? 'status' : undefined} data-surface-state={committed ? 'saved' : 'empty'}>{committed ? t('files.committed') : restored.artifacts.length || restored.ingestion.tasks.length ? t('files.addMore') : t('files.empty')}</p> : null}
      <div className={styles.acquisition}><ResearchObjectFilesLiteratureEntry researchObjectId={object.id} /></div>
    </div>
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
