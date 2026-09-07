'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { EvidenceSourceBody } from '@/components/public/EvidenceRail';
import { apiRequest, type ArtifactReference, type PublicEvidence, type PublicEvidenceSource, type SdfCore } from '@/lib/api';

type Evidence = Omit<PublicEvidence, 'artifact'> & { artifactId: string; extractionStatus: string };
type Claim = { id: string; statement: string; assessment: string; provenance?: { field?: string } };
type FrozenRecord = { objectId: string; versionId: string; recordState: 'recorded' | 'not_recorded'; sdf: SdfCore; manifest: Array<ArtifactReference & { mediaType?: string; blobSha256?: string }>; claims: Claim[]; evidence: Evidence[] };
const fields = ['problem', 'insight', 'method', 'results', 'limitations', 'reproducibility'] as const;

export function VersionRecord({ researchObjectId, versionId, versionNo }: { researchObjectId: string; versionId: string; versionNo: number }) {
  const t = useTranslations('versionRecord');
  const fieldT = useTranslations('productSurfaces.fields');
  const assessmentT = useTranslations('public.claimReader.assessment');
  const versionT = useTranslations('productSurfaces.files');
  const [record, setRecord] = useState<FrozenRecord | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<PublicEvidence | null>(null);
  const [source, setSource] = useState<PublicEvidenceSource | null>(null);
  const [loading, setLoading] = useState(false);
  const [sourceError, setSourceError] = useState(false);
  const scope = `/api/research-objects/${encodeURIComponent(researchObjectId)}/versions/${encodeURIComponent(versionId)}`;
  useEffect(() => {
    let active = true;
    void apiRequest<{ record: FrozenRecord }>(`${scope}/record`).then(({ record: frozen }) => {
      if (frozen.versionId !== versionId || frozen.objectId !== researchObjectId) throw new Error(t('mismatch'));
      if (active) setRecord(frozen);
    }).catch((cause: Error) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [scope, versionId, researchObjectId, t]);
  useEffect(() => {
    if (!selected) return;
    let active = true;
    setSource(null); setLoading(true); setSourceError(false);
    void apiRequest<{ source: { text: string | null; page: number | null; region: PublicEvidenceSource['region'] } }>(`${scope}/record/evidence/${encodeURIComponent(selected.id)}/source`).then(({ source: resolved }) => {
      if (!active) return;
      if (resolved.text === null) { setSourceError(true); return; }
      const locator = { ...selected.locator };
      delete locator.page;
      setSource({ text: resolved.text, page: resolved.page, region: resolved.region, locator, artifact: selected.artifact });
    }).catch(() => { if (active) setSourceError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selected, scope]);
  if (error) return <p role="alert">{error}</p>;
  if (!record) return <p role="status">{t('loading')}</p>;
  return <section className="mt-8 border-t border-os-rule-paper pt-5" data-selected-version={versionId}>
    <h2 className="mb-3 text-2xl">{versionT('snapshotVersion', { version: versionNo })}</h2>
    <p className="text-sm text-os-muted-paper">{t(record.recordState === 'recorded' ? 'reviewBoundary' : 'legacy')}</p>
    <p><a className="text-os-vermilion-ink underline" href={`${scope}/record`}>{t('api')}</a> · <a className="text-os-vermilion-ink underline" href={`${scope}/record/export`}>{t('export')}</a> · <a className="text-os-vermilion-ink underline" href="/api/research-record/openapi">OpenAPI</a></p><p className="break-all text-sm">{versionId}</p>
    {fields.map((field) => <section key={field} className="mt-6"><h2 className="text-xl">{fieldT(field)}</h2><p className="mt-2 whitespace-pre-wrap">{record.sdf[field] || t('missing')}</p>
      {(['insight', 'results'] as string[]).includes(field) && <a className="mt-2 inline-flex min-h-11 items-center text-os-vermilion-ink underline" href="#version-evidence">{t('checkEvidence')}</a>}
    </section>)}
    <section id="version-evidence" className="mt-8 border-y border-os-rule-paper py-5"><h2>{t('evidence')}</h2>
      {record.claims.length === 0 && <p>{t('noLocator')}</p>}
      {record.claims.map((claim) => <div key={claim.id} className="mt-4"><p>{claim.statement}</p><p className="text-sm text-os-muted-paper">{t('assessment', { assessment: assessmentT(claim.assessment) })}</p>
        {!record.evidence.some((item) => item.claimId === claim.id) && <p>{t('noLocator')}</p>}
        {record.evidence.filter((item) => item.claimId === claim.id).map((item) => {
          const artifact = record.manifest.find((entry) => entry.artifactId === item.artifactId);
          return <div key={item.id}><button className="min-h-11 text-left underline" onClick={() => setSelected({ ...item, verified: item.verified, artifact: { logicalPath: artifact?.logicalPath ?? t('missing'), mediaType: artifact?.mediaType ?? '', contentHash: artifact?.blobSha256 ?? '' } })}>{t('openSource')}: {item.title}</button><span className="ml-3 text-sm">{item.verified ? t('verified') : t('pending')}</span>{!item.locator.page && <p className="text-sm">{t('noPage')}</p>}</div>;
        })}
      </div>)}
      {selected && <div className="mt-5 surface-evidence p-5 [&_.pub-source-record_dt]:text-os-muted-paper" aria-live="polite">{!source?.region && <p>{t('noRegion')}</p>}<EvidenceSourceBody evidence={selected} source={source} loading={loading} error={sourceError} /></div>}
    </section>
    <h2 className="mt-6">{t('materials')}</h2>{record.manifest.map((item) => <p key={item.logicalPath}><a className="text-os-vermilion-ink underline" href={`/api/artifacts/${encodeURIComponent(item.artifactId)}/download`}>{item.logicalPath}</a></p>)}
  </section>;
}
