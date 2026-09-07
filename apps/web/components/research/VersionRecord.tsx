'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { EvidenceSourceBody } from '@/components/public/EvidenceRail';
import { apiRequest, type ArtifactReference, type PublicEvidence, type PublicEvidenceSource, type SdfCore } from '@/lib/api';

type Evidence = Omit<PublicEvidence, 'artifact' | 'verified'> & { artifactId: string; extractionStatus: string; verifiedByUserId: string | null };
type Claim = { id: string; statement: string; assessment: string; provenance?: { field?: string } };
type Snapshot = { versionId: string; snapshot: { core: SdfCore; artifacts: Array<ArtifactReference & { mediaType?: string; blobSha256?: string }> } };
const fields = ['problem', 'insight', 'method', 'results', 'limitations', 'reproducibility'] as const;

export function VersionRecord({ researchObjectId, versionId, versionNo }: { researchObjectId: string; versionId: string; versionNo: number }) {
  const t = useTranslations('versionRecord');
  const fieldT = useTranslations('productSurfaces.fields');
  const assessmentT = useTranslations('public.claimReader.assessment');
  const versionT = useTranslations('productSurfaces.files');
  const [record, setRecord] = useState<{ version: Snapshot; claims: Claim[]; evidence: Evidence[] } | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<PublicEvidence | null>(null);
  const [source, setSource] = useState<PublicEvidenceSource | null>(null);
  const [loading, setLoading] = useState(false);
  const [sourceError, setSourceError] = useState(false);
  const scope = `/api/research-objects/${encodeURIComponent(researchObjectId)}/versions/${encodeURIComponent(versionId)}`;
  useEffect(() => {
    let active = true;
    void Promise.all([
      apiRequest<{ version: Snapshot }>(`/api/versions/${encodeURIComponent(versionId)}`),
      apiRequest<{ claims: Claim[] }>(`${scope}/claims`),
      apiRequest<{ evidence: Evidence[] }>(`${scope}/evidence`),
    ]).then(([snapshot, claims, evidence]) => {
      if (snapshot.version.versionId !== versionId) throw new Error(t('mismatch'));
      if (active) setRecord({ version: snapshot.version, claims: claims.claims, evidence: evidence.evidence });
    }).catch((cause: Error) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [scope, versionId, t]);
  useEffect(() => {
    if (!selected) return;
    let active = true;
    setSource(null); setLoading(true); setSourceError(false);
    void apiRequest<{ source: { text?: string } }>(`${scope}/evidence/${encodeURIComponent(selected.id)}/source`).then(({ source: resolved }) => {
      if (!active) return;
      if (resolved.text === undefined) { setSourceError(true); return; }
      const { page, ...locator } = selected.locator;
      setSource({ text: resolved.text, page: typeof page === 'number' ? page : null, region: null, locator, artifact: selected.artifact });
    }).catch(() => { if (active) setSourceError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selected, scope]);
  if (error) return <p role="alert">{error}</p>;
  if (!record) return <p role="status">{t('loading')}</p>;
  return <section className="mt-8 border-t border-os-rule-paper pt-5" data-selected-version={versionId}>
    <h2 className="mb-3 text-2xl">{versionT('snapshotVersion', { version: versionNo })}</h2>
    <p className="text-sm text-os-muted-paper">{t('reviewBoundary')}</p><p className="break-all text-sm">{versionId}</p>
    {fields.map((field) => <section key={field} className="mt-6"><h2 className="text-xl">{fieldT(field)}</h2><p className="mt-2 whitespace-pre-wrap">{record.version.snapshot.core[field] || t('missing')}</p>
      {(['insight', 'results'] as string[]).includes(field) && <a className="mt-2 inline-flex min-h-11 items-center text-os-vermilion-ink underline" href="#version-evidence">{t('checkEvidence')}</a>}
    </section>)}
    <section id="version-evidence" className="mt-8 border-y border-os-rule-paper py-5"><h2>{t('evidence')}</h2>
      {record.claims.length === 0 && <p>{t('noLocator')}</p>}
      {record.claims.map((claim) => <div key={claim.id} className="mt-4"><p>{claim.statement}</p><p className="text-sm text-os-muted-paper">{t('assessment', { assessment: assessmentT(claim.assessment) })}</p>
        {!record.evidence.some((item) => item.claimId === claim.id) && <p>{t('noLocator')}</p>}
        {record.evidence.filter((item) => item.claimId === claim.id).map((item) => {
          const artifact = record.version.snapshot.artifacts.find((entry) => entry.artifactId === item.artifactId);
          return <div key={item.id}><button className="min-h-11 text-left underline" onClick={() => setSelected({ ...item, verified: Boolean(item.verifiedByUserId), artifact: { logicalPath: artifact?.logicalPath ?? t('missing'), mediaType: artifact?.mediaType ?? '', contentHash: artifact?.blobSha256 ?? '' } })}>{t('openSource')}: {item.title}</button><span className="ml-3 text-sm">{item.verifiedByUserId ? t('verified') : t('pending')}</span>{!item.locator.page && <p className="text-sm">{t('noPage')}</p>}</div>;
        })}
      </div>)}
      {selected && <div className="mt-5 surface-evidence p-5 [&_.pub-source-record_dt]:text-os-muted-paper" aria-live="polite"><p>{t('noRegion')}</p><EvidenceSourceBody evidence={selected} source={source} loading={loading} error={sourceError} /></div>}
    </section>
    <h2 className="mt-6">{t('materials')}</h2>{record.version.snapshot.artifacts.map((item) => <p key={item.logicalPath}><a className="text-os-vermilion-ink underline" href={`/api/artifacts/${encodeURIComponent(item.artifactId)}/download`}>{item.logicalPath}</a></p>)}
  </section>;
}
