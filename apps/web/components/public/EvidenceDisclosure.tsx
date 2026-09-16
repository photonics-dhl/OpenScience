'use client';

import { useTranslations } from 'next-intl';
import type { PublicEvidence } from '../../lib/api';
import { ScientificText } from '../content/ScientificText';
import { ScientificMarkdown } from '../content/ScientificMarkdown';
import { evidenceReadingTitle, groupEvidenceBySource } from './evidence-display';
import styles from './PublicReadingProduct.module.css';

export function EvidenceDisclosure({
  evidence,
  onInspect,
}: {
  evidence: PublicEvidence[];
  onInspect: (evidence: PublicEvidence) => void;
}) {
  const t = useTranslations('public.claimReader');
  if (evidence.length === 0) return null;

  return (
    <details className={styles.evidenceDisclosure}>
      <summary>{t('evidenceCount', { count: evidence.length })}</summary>
      <div data-evidence-transcript="true" data-print-evidence="true">
        {groupEvidenceBySource(evidence).map((group) => (
          <section className={styles.evidenceGroup} key={group.items[0].id}>
            <header><span>{group.file}</span><span>{group.page === null ? t('passage') : t('page', { page: group.page })} · {t('passageCount', { count: group.items.length })}</span></header>
            {group.items.map((item, index) => (
              <details className={styles.evidenceEntry} data-evidence-id={item.id} data-evidence-relation={item.relation} key={item.id}>
                <summary><ScientificText as="span" hideSourceMarkers>{evidenceReadingTitle(item) || t('passageNumber', { number: index + 1 })}</ScientificText><span className={styles.entryMeta}>{t(`relation.${item.relation}`)}</span></summary>
                <div className={styles.evidencePassage}>
                  {item.exactQuote && <blockquote><ScientificMarkdown body={item.exactQuote} /></blockquote>}
                  <button type="button" className="pub-text-button pub-evidence-open" onClick={() => onInspect(item)}>{t('inspectSource')}</button>
                </div>
              </details>
            ))}
          </section>
        ))}
      </div>
    </details>
  );
}
