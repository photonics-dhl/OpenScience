'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import type { PublicClaim, PublicEvidence } from '../../lib/api';
import { EvidenceDisclosure } from './EvidenceDisclosure';

function ClaimCard({
  claim,
  allEvidence,
  allClaims,
  depth,
  onInspect,
}: {
  claim: PublicClaim;
  allEvidence: PublicEvidence[];
  allClaims: PublicClaim[];
  depth: number;
  onInspect: (evidence: PublicEvidence) => void;
}) {
  const t = useTranslations('public.claimReader');
  return (
    <article
      className={`pub-claim pub-claim-${claim.kind}`}
      data-claim-id={claim.id}
      data-parent-claim-id={claim.parentClaimId ?? undefined}
      data-claim-kind={claim.kind}
      style={{ '--claim-depth': depth } as React.CSSProperties}
    >
      <header className="pub-claim-header">
        <span>{t(`kind.${claim.kind}`)}</span>
        <span data-claim-assessment={claim.assessment}>{t(`assessment.${claim.assessment}`)}</span>
      </header>
      <h3>{claim.statement}</h3>
      {(claim.conditions.length > 0 || claim.limitations.length > 0) && (
        <div className="pub-claim-boundaries">
          {claim.conditions.length > 0 && <section><h4>{t('conditions')}</h4><ul>{claim.conditions.map((item) => <li key={item}>{item}</li>)}</ul></section>}
          {claim.limitations.length > 0 && <section><h4>{t('limitations')}</h4><ul>{claim.limitations.map((item) => <li key={item}>{item}</li>)}</ul></section>}
        </div>
      )}
      <EvidenceDisclosure evidence={allEvidence.filter((item) => item.claimId === claim.id)} onInspect={onInspect} />
      {allClaims.filter((child) => child.parentClaimId === claim.id).map((child) => (
        <ClaimCard
          key={child.id}
          claim={child}
          allEvidence={allEvidence}
          allClaims={allClaims}
          depth={depth + 1}
          onInspect={onInspect}
        />
      ))}
    </article>
  );
}

export function ClaimNarrative({
  claims,
  evidence,
  onInspect,
}: {
  claims: PublicClaim[];
  evidence: PublicEvidence[];
  onInspect: (evidence: PublicEvidence) => void;
}) {
  const t = useTranslations('public.claimReader');
  const roots = claims.filter((claim) => !claim.parentClaimId || !claims.some((candidate) => candidate.id === claim.parentClaimId));
  return (
    <section className="pub-claim-narrative" data-claim-narrative="true" aria-labelledby="public-claims-heading">
      <div className="pub-section-intro">
        <p className="pub-kicker">{t('kicker')}</p>
        <h2 id="public-claims-heading">{t('title')}</h2>
        <p>{t('description')}</p>
      </div>
      {roots.length === 0 ? <p>{t('empty')}</p> : roots.map((claim) => (
        <ClaimCard
          key={claim.id}
          claim={claim}
          allEvidence={evidence}
          allClaims={claims}
          depth={0}
          onInspect={onInspect}
        />
      ))}
    </section>
  );
}
