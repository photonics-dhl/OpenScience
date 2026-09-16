'use client';

import { useTranslations } from 'next-intl';
import type { PublicClaim, PublicEvidence } from '../../lib/api';
import { EvidenceDisclosure } from './EvidenceDisclosure';
import { ScientificMarkdown } from '../content/ScientificMarkdown';
import { ScientificText, scientificTextExcerpt } from '../content/ScientificText';
import { claimReadingBody, claimReadingField, claimReadingSections, claimReadingTitle, readingFields } from './evidence-display';
import styles from './PublicReadingProduct.module.css';

function ClaimCard({
  claim,
  allEvidence,
  onInspect,
}: {
  claim: PublicClaim;
  allEvidence: PublicEvidence[];
  onInspect: (evidence: PublicEvidence) => void;
}) {
  const t = useTranslations('public.claimReader');
  const body = claimReadingBody(claim.statement);
  const evidence = allEvidence.filter(item => item.claimId === claim.id);
  const { sections, remaining } = claimReadingSections(claim.statement, evidence);
  const title = claimReadingTitle(body) || scientificTextExcerpt(body.split('\n\n')[0], 120) || t('fullArgument');
  const Container = sections.length > 1 ? 'article' : 'details';
  return (
    <Container
      className={styles.claimEntry}
      data-claim-id={claim.id}
      data-parent-claim-id={claim.parentClaimId ?? undefined}
    >
      {sections.length === 1 && <summary className={styles.claimSummary}>
        <ScientificText as="span" hideSourceMarkers>{title}</ScientificText>
        <span className={styles.entryMeta}>{t('evidenceCount', { count: evidence.length })}</span>
      </summary>}
      <div className={styles.claimContent}>
      {sections.map((section, index) => sections.length === 1 ? <div key={index}>
        <div className={styles.claimBody}><ScientificMarkdown body={section.body} hideSourceMarkers /></div>
        <EvidenceDisclosure evidence={section.evidence} onInspect={onInspect} />
      </div> : <details key={index} className={styles.readingSection} data-reading-section="true">
        <summary><ScientificText as="span" hideSourceMarkers>{section.title || t('argumentOverview')}</ScientificText><span className={styles.entryMeta}>{t('evidenceCount', { count: section.evidence.length })}</span></summary>
        <div className={styles.claimBody}><ScientificMarkdown body={section.body} hideSourceMarkers /></div>
        <EvidenceDisclosure evidence={section.evidence} onInspect={onInspect} />
      </details>)}
      {(claim.conditions.length > 0 || claim.limitations.length > 0) && (
        <details className={styles.boundariesDisclosure}><summary>{t('conditionsAndLimits')}</summary><div className="pub-claim-boundaries">
          {claim.conditions.length > 0 && <section><h4>{t('conditions')}</h4><ul>{claim.conditions.map((item) => <li key={item}><ScientificText as="span" hideSourceMarkers>{item}</ScientificText></li>)}</ul></section>}
          {claim.limitations.length > 0 && <section><h4>{t('limitations')}</h4><ul>{claim.limitations.map((item) => <li key={item}><ScientificText as="span" hideSourceMarkers>{item}</ScientificText></li>)}</ul></section>}
        </div></details>
      )}
      {remaining.length > 0 && <section className={styles.remainingEvidence}><h4>{t('additionalSources')}</h4><EvidenceDisclosure evidence={remaining} onInspect={onInspect} /></section>}
      </div>
    </Container>
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
  const fields = useTranslations('productSurfaces.fields');
  const groups = [...readingFields, undefined].map(field => ({ field, claims: claims.filter(claim => claimReadingField(claim, evidence) === field) })).filter(group => group.claims.length > 0);
  return (
    <details className={`pub-claim-narrative ${styles.claimNarrative}`} data-claim-narrative="true">
      <summary className={styles.claimNarrativeSummary}><h2>{t('title')}</h2></summary>
      <div className={styles.claimNarrativeBody}>
      <div className={styles.sectionIntro}>
        <p>{t('description')}</p>
      </div>
      {claims.length === 0 ? <p>{t('empty')}</p> : groups.map(group => {
        const content = group.claims.map(claim => <ClaimCard key={claim.id} claim={claim} allEvidence={evidence} onInspect={onInspect} />);
        if (!group.field) return <section key="other" className={styles.claimField}>{content}</section>;
        const count = evidence.filter(item => group.claims.some(claim => claim.id === item.claimId)).length;
        return <details key={group.field} className={styles.claimField} data-reading-field={group.field}>
          <summary><span>{fields(group.field)}</span><span className={styles.entryMeta}>{t('evidenceCount', { count })}</span></summary>
          {content}
        </details>;
      })}
      </div>
    </details>
  );
}
