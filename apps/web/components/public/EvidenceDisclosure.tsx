'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import type { PublicEvidence } from '../../lib/api';
import {
  readLocalEvidenceDefaultCollapsed,
  subscribeEvidenceReadingPreference,
  writeLocalEvidenceDefaultCollapsed,
} from '../../lib/evidence-reading-preference';

export function EvidenceDisclosure({
  evidence,
  onInspect,
}: {
  evidence: PublicEvidence[];
  onInspect: (evidence: PublicEvidence) => void;
}) {
  const t = useTranslations('public.claimReader');
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    setCollapsed(readLocalEvidenceDefaultCollapsed());
    return subscribeEvidenceReadingPreference(setCollapsed);
  }, []);

  const toggle = () => {
    setCollapsed((current) => {
      const next = !current;
      writeLocalEvidenceDefaultCollapsed(next);
      return next;
    });
  };

  if (evidence.length === 0) return <p className="pub-evidence-empty">{t('noEvidence')}</p>;

  return (
    <section className={`pub-evidence-disclosure${collapsed ? ' is-collapsed' : ''}`} data-evidence-collapse-state={collapsed ? 'collapsed' : 'expanded'}>
      <div className="pub-evidence-heading">
        <h4>{t('evidenceCount', { count: evidence.length })}</h4>
        <button type="button" className="pub-text-button" aria-expanded={!collapsed} onClick={toggle}>
          {collapsed ? t('expandEvidence') : t('collapseEvidence')}
        </button>
      </div>
      <div className="pub-evidence-transcript" data-evidence-transcript="true" data-print-evidence="true">
        {evidence.map((item) => (
          <article className="pub-evidence-item" data-evidence-relation={item.relation} key={item.id}>
            <button type="button" className="pub-evidence-select" onClick={() => onInspect(item)}>
              <span className="pub-evidence-relation">{t(`relation.${item.relation}`)}</span>
              <strong>{item.title}</strong>
              {item.exactQuote && <q>{item.exactQuote}</q>}
              <span className="pub-evidence-locator">
                {item.artifact.logicalPath}
                {typeof item.locator.page === 'number' ? ` · ${t('page', { page: item.locator.page })}` : ''}
              </span>
              <span className="pub-evidence-open">{t('inspectSource')}</span>
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
