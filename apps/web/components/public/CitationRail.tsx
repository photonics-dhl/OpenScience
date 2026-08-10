'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { CopyButton } from './ProvenanceCaption';

export function CitationRail({ publicId, versionId, objectCitation, versionCitation }: { publicId: string; versionId: string; objectCitation: string; versionCitation: string }) {
  const t = useTranslations('public');
  return (
    <aside className="pub-reading-rail" data-public-metadata-rail="true" aria-label={t('citationRail')}>
      <section data-public-identity="true">
        <p className="pub-rail-label">{t('identity')}</p>
        <code>{publicId}</code>
        <p className="pub-rail-muted">{t('continuingObject')}</p>
      </section>
      <section data-citation-kind="object">
        <p className="pub-rail-label">{t('objectCitation')}</p>
        <code>{objectCitation}</code>
        <p className="pub-rail-muted">/research/{publicId}</p>
        <div className="pub-rail-actions"><CopyButton text={objectCitation} label={t('copyObjectCitation')} /></div>
      </section>
      <section data-citation-kind="version" data-print-landmark="citation">
        <p className="pub-rail-label">{t('versionCitation')}</p>
        <code>{versionCitation}</code>
        <p className="pub-rail-muted">/research/{publicId}/v/{versionId.split('-v').at(-1)}</p>
        <div className="pub-rail-actions"><CopyButton text={versionCitation} label={t('copyCitation')} /></div>
      </section>
    </aside>
  );
}
