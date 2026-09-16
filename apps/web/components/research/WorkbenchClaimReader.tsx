'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiRequest, type PublicClaim, type PublicEvidence, type PublicEvidenceSource, type SdfCore } from '@/lib/api';
import { ClaimNarrative } from '@/components/public/ClaimNarrative';
import { EvidenceSheet } from '@/components/public/EvidenceSheet';
import styles from '@/components/public/PublicReadingProduct.module.css';

export type ReadingRecord = {
  objectId: string;
  versionId: string;
  sdf: SdfCore;
  claims: PublicClaim[];
  evidence: Array<Omit<PublicEvidence, 'artifact' | 'exactQuote'> & { artifactId: string; contentHash: string }>;
  manifest: Array<{ artifactId: string; logicalPath: string; blobSha256: string; mimeType?: string | null }>;
};

/** Read the selected version's saved record, including when live claims have moved on. */
export function WorkbenchClaimReader({ record }: { record: ReadingRecord }) {
  const t = useTranslations('public.claimReader');
  const researchObjectId = record.objectId;
  const versionId = record.versionId;
  const [selected, setSelected] = useState<PublicEvidence | null>(null);
  const [source, setSource] = useState<PublicEvidenceSource | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const sourceRequest = useRef<AbortController | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const scope = `/api/research-objects/${encodeURIComponent(researchObjectId)}/versions/${encodeURIComponent(versionId)}/record`;

  useEffect(() => () => sourceRequest.current?.abort(), [scope]);

  const evidence: PublicEvidence[] = record.evidence.map(item => {
    const artifact = record.manifest.find(entry => entry.artifactId === item.artifactId && entry.blobSha256 === item.contentHash);
    return { ...item, exactQuote: null, artifact: { logicalPath: artifact?.logicalPath ?? t('sourceFile'), mediaType: artifact?.mimeType ?? '', contentHash: item.contentHash } };
  });

  async function inspectEvidence(item: PublicEvidence) {
    sourceRequest.current?.abort();
    const controller = new AbortController();
    sourceRequest.current = controller;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelected(item); setSource(null); setSourceLoading(true); setSourceError(false); setSourceOpen(true);
    try {
      const result = await apiRequest<{ source: { text: string | null; page: number | null; region: PublicEvidenceSource['region'] } }>(`${scope}/evidence/${encodeURIComponent(item.id)}/source`, { signal: controller.signal });
      if (typeof result.source.text !== 'string') throw new Error('Source unavailable');
      if (!controller.signal.aborted) setSource({ ...result.source, text: result.source.text, locator: item.locator, artifact: item.artifact });
    } catch { if (!controller.signal.aborted) setSourceError(true); }
    finally { if (!controller.signal.aborted) setSourceLoading(false); }
  }

  return <section className={styles.workbenchReader} data-version-claim-reader={versionId}>
    <ClaimNarrative claims={record.claims} evidence={evidence} onInspect={item => void inspectEvidence(item)} />
    <EvidenceSheet open={sourceOpen} onOpenChange={open => { setSourceOpen(open); if (!open) sourceRequest.current?.abort(); }} onReturnFocus={() => returnFocus.current?.focus()} evidence={selected} source={source} loading={sourceLoading} error={sourceError} />
  </section>;
}
