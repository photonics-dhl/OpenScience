'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ScientificText } from '@/components/content/ScientificText';
import { apiRequest, type ArtifactReference, type SdfCore } from '@/lib/api';

type FrozenRecord = { objectId: string; versionId: string; recordState: 'recorded' | 'not_recorded'; sdf: SdfCore; manifest: Array<ArtifactReference & { mediaType?: string; blobSha256?: string }> };
const fields = ['problem', 'insight', 'method', 'results', 'limitations', 'reproducibility'] as const;

export function VersionRecord({ researchObjectId, versionId, title, onReadyChange }: { researchObjectId: string; versionId: string; title: string; onReadyChange?(ready: boolean): void }) {
  const t = useTranslations('versionRecord');
  const fieldT = useTranslations('productSurfaces.fields');
  const [record, setRecord] = useState<FrozenRecord | null>(null);
  const [error, setError] = useState('');
  const scope = `/api/research-objects/${encodeURIComponent(researchObjectId)}/versions/${encodeURIComponent(versionId)}`;
  useEffect(() => {
    let active = true;
    setRecord(null); setError(''); onReadyChange?.(false);
    void apiRequest<{ record: FrozenRecord }>(`${scope}/record`).then(({ record: frozen }) => {
      if (frozen.versionId !== versionId || frozen.objectId !== researchObjectId) throw new Error(t('mismatch'));
      if (active) { setRecord(frozen); onReadyChange?.(true); }
    }).catch((cause: Error) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [scope, versionId, researchObjectId, t, onReadyChange]);
  if (error) return <p role="alert">{error}</p>;
  if (!record) return <p role="status">{t('loading')}</p>;
  return <section className="mt-8 border-t border-os-rule-paper pt-5" data-selected-version={versionId}>
    <ScientificText hideSourceMarkers as="h2" className="mb-3 text-2xl">{title}</ScientificText>
    {record.recordState === 'not_recorded' && <p className="text-sm text-os-muted-paper">{t('legacy')}</p>}
    <p><a className="text-os-vermilion-ink underline" href={`${scope}/record/export`}>{t('export')}</a></p>
    {fields.map((field) => <section key={field} className="mt-6"><h2 className="text-xl">{fieldT(field)}</h2><ScientificText hideSourceMarkers as="p" className="mt-2 whitespace-pre-wrap">{record.sdf[field] || t('missing')}</ScientificText>
    </section>)}
    <h2 className="mt-6">{t('materials')}</h2>{record.manifest.map((item) => <p key={item.logicalPath}><a className="text-os-vermilion-ink underline" href={`/api/artifacts/${encodeURIComponent(item.artifactId)}/download`}>{item.logicalPath}</a></p>)}
  </section>;
}
