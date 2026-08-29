'use client';
import * as React from 'react';
import { getPublicEvidenceSource, getPublicResearchVersion, getReadingPreference, type PublicEvidence, type PublicEvidenceSource } from '../../lib/api';
import { writeLocalEvidenceDefaultCollapsed } from '../../lib/evidence-reading-preference';
import { LEGAL_DISCLAIMER_DEFAULT, LICENSE_NAMES } from '../../lib/constants';
import { useTranslations } from 'next-intl';
import { TabNavigation, ComingSoonTab, type TabId } from './TabNavigation';
import { CitationRail } from './CitationRail';
import { ProvenanceCaption } from './ProvenanceCaption';
import { ClaimNarrative } from './ClaimNarrative';
import { EvidenceRail } from './EvidenceRail';
import { EvidenceSheet } from './EvidenceSheet';
import { PresentationAssetGallery } from './PresentationAssetGallery';

type PublicResearch = Awaited<ReturnType<typeof getPublicResearchVersion>>['research'];

function CopyButton({ text, label }: { text: string; label?: string }) {
  const t = useTranslations('public');
  const [copied, setCopied] = React.useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} className="copy-btn" title={label ?? t('copy')}>
      {copied ? t('copied') : t('copy')}
    </button>
  );
}

/**
 * @deprecated Compatibility export for downstream embeds migrating to PublicReadingSurface.
 */
export function LegacyOverviewTab({ research }: { research: PublicResearch }) {
  const t = useTranslations('public');
  const r = research;
  const disclaimer = r.version.legalDisclaimer || LEGAL_DISCLAIMER_DEFAULT;
  const hashShort = r.version.contentSha256
    ? `${r.version.contentSha256.substring(0, 8)}...${r.version.contentSha256.substring(56)}`
    : t('unpublished');

  return (
    <article className="pub-article">
      <header className="pub-header">
        <h1>{r.title}</h1>
        <p className="pub-version-id">{r.version.publicVersionId}</p>

        <section className="pub-authors">
          <h2>{t('authors')}</h2>
          {r.authors.map((a, i) => (
            <div key={i} className="pub-author">
              <span className="pub-author-name">
                {a.displayName}
                {a.isCorresponding && <sup title={t('correspondingAuthor')}> ✉</sup>}
              </span>
              {a.affiliation && <span className="pub-author-affiliation">{a.affiliation}</span>}
              <span className="pub-author-status">({a.identityStatus})</span>
            </div>
          ))}
        </section>

        {r.contributions.length > 0 && (
          <section className="pub-contributions">
            <h3>{t('contributions')}</h3>
            <ul>
              {r.contributions.map((c, i) => (
                <li key={i}>
                  {c.displayName}: {c.creditRole}
                </li>
              ))}
            </ul>
          </section>
        )}
      </header>

      <section className="pub-section">
        <h2>{t('abstract')}</h2>
        <p>{r.version.core.problem || t('none')}</p>
      </section>

      <section className="pub-section">
        <h2>{t('coreFields')}</h2>
        <dl>
          <dt>{t('insight')}</dt>
          <dd>{r.version.core.insight || t('none')}</dd>
          <dt>{t('method')}</dt>
          <dd>{r.version.core.method || t('none')}</dd>
          <dt>{t('results')}</dt>
          <dd>{r.version.core.results || t('none')}</dd>
          <dt>{t('limitations')}</dt>
          <dd>{r.version.core.limitations || t('none')}</dd>
          <dt>{t('reproducibility')}</dt>
          <dd>{r.version.core.reproducibility || t('none')}</dd>
        </dl>
      </section>

      <section className="pub-section">
        <h2>{t('license')}</h2>
        <ul className="pub-licenses">
          {Object.entries(r.licenses).map(([type, id]) => (
            <li key={type}>
              <strong>
                {type === 'text' ? t('licenseType.text') : type === 'code' ? t('licenseType.code') : t('licenseType.data')}:
              </strong>{' '}
              {LICENSE_NAMES[id] || id}
            </li>
          ))}
        </ul>
      </section>

      <section className="pub-section">
        <h2>{t('versionInfo')}</h2>
        <dl>
          <dt>Unique ID</dt>
          <dd>{r.publicId}</dd>
          <dt>{t('versionId')}</dt>
          <dd>{r.version.publicVersionId}</dd>
          <dt>{t('publishedAt')}</dt>
          <dd>{r.version.publishedAt ? new Date(r.version.publishedAt).toUTCString() : t('unpublished')}</dd>
          <dt>{t('versionHash')}</dt>
          <dd className="pub-hash">
            <code>{hashShort}</code>
            {r.version.contentSha256 && <CopyButton text={r.version.contentSha256} label={t('copyFullHash')} />}
          </dd>
        </dl>
      </section>

      <section className="pub-section pub-citation">
        <h2>{t('citation')}</h2>
        <div className="pub-citation-box">
          <code>{r.citation}</code>
          <CopyButton text={r.citation} label={t('copyCitation')} />
        </div>
      </section>

      {r.aiReview && (
        <aside className="pub-ai-review">
          <h3>{t('aiReview')}</h3>
          <p>
            {t('status')}:{' '}
            <span
              className={`pub-badge ${
                r.aiReview.status === 'passed'
                  ? 'pub-badge-success'
                  : r.aiReview.status === 'failed'
                    ? 'pub-badge-rejected'
                    : 'pub-badge-warn'
              }`}
            >
              {r.aiReview.status === 'passed' ? t('passed') : r.aiReview.status}
            </span>
          </p>
          {r.aiReview.hardBlocks && typeof r.aiReview.hardBlocks === 'object' && (
            <details>
              <summary>{t('hardBlocks', { count: Object.keys(r.aiReview.hardBlocks as object).length })}</summary>
              <pre>{JSON.stringify(r.aiReview.hardBlocks, null, 2)}</pre>
            </details>
          )}
          {r.aiReview.warnings && Array.isArray(r.aiReview.warnings) && r.aiReview.warnings.length > 0 && (
            <details>
              <summary>{t('warnings', { count: (r.aiReview.warnings as unknown[]).length })}</summary>
              <pre>{JSON.stringify(r.aiReview.warnings, null, 2)}</pre>
            </details>
          )}
        </aside>
      )}

      <footer className="pub-disclaimer">
        <h3>{t('legalDisclaimer')}</h3>
        <p>{disclaimer}</p>
      </footer>
    </article>
  );
}

const PUBLIC_SDF_NODES = [
  ['problem', 'problem'],
  ['insight', 'insight'],
  ['method', 'method'],
  ['results', 'results'],
  ['limitations', 'limitations'],
  ['reproducibility', 'reproducibility'],
] as const;

export function PublicReadingSurface({ research, activeTab = 'overview', onTabChange = () => undefined }: { research: PublicResearch; activeTab?: TabId; onTabChange?: (tab: TabId) => void }) {
  const t = useTranslations('public');
  const version = research.version;
  const [selectedEvidence, setSelectedEvidence] = React.useState<PublicEvidence | null>(null);
  const [evidenceSource, setEvidenceSource] = React.useState<PublicEvidenceSource | null>(null);
  const [sourceLoading, setSourceLoading] = React.useState(false);
  const [sourceError, setSourceError] = React.useState(false);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const disclaimer = version.legalDisclaimer || t('legalDisclaimerDefault');
  const objectCitation = research.citation.replace(version.publicVersionId, research.publicId);
  const publishedAt = version.publishedAt?.slice(0, 10) ?? t('unpublished');
  const hashShort = version.contentSha256 ? `${version.contentSha256.slice(0, 8)}…${version.contentSha256.slice(-8)}` : t('unpublished');

  React.useEffect(() => {
    void getReadingPreference()
      .then((preference) => writeLocalEvidenceDefaultCollapsed(preference.evidenceDefaultCollapsed))
      .catch(() => undefined);
  }, []);

  React.useEffect(() => {
    if (!selectedEvidence) return;
    let active = true;
    setSourceLoading(true);
    setSourceError(false);
    setEvidenceSource(null);
    getPublicEvidenceSource(research.publicId, version.versionNo, selectedEvidence.id)
      .then((source) => { if (active) setEvidenceSource(source); })
      .catch(() => { if (active) setSourceError(true); })
      .finally(() => { if (active) setSourceLoading(false); });
    return () => { active = false; };
  }, [research.publicId, selectedEvidence, version.versionNo]);

  const inspectEvidence = (evidence: PublicEvidence) => {
    setSelectedEvidence(evidence);
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches) setSheetOpen(true);
  };

  return (
    <div className="pub-reading-surface" data-public-reading-surface="true">
      <div className="pub-reading-layout">
        <article className="pub-reading-column" data-public-reading-column="true">
          <header className="pub-reading-identity" data-public-identity="true">
            <p className="pub-kicker">{t('researchObject')}</p>
            <h1>{research.title}</h1>
            <p className="pub-version-id">{research.publicId} · {version.publicVersionId}</p>
            <div className="pub-author-line">
              {research.authors.map((author) => <span key={`${author.displayName}-${author.sortOrder}`} data-corresponding-author={author.isCorresponding ? 'true' : undefined}>
                {author.displayName}{author.affiliation ? `, ${author.affiliation}` : ''} · {author.identityStatus}{author.isCorresponding ? ` · ${t('correspondingAuthor')}` : ''}
              </span>)}
            </div>
            <div className="pub-license-line" data-public-license="true">
              <span>{t('license')}</span>
              <span>{Object.entries(research.licenses).map(([type, id]) => `${t(`licenseType.${type}`)}: ${LICENSE_NAMES[id] || id}`).join(' · ')}</span>
            </div>
          </header>

          <section className="pub-reading-insight" data-reading-role="body" data-sdf-node="insight" data-sdf-state={version.core.insight ? 'confirmed' : 'empty'}>
            <p className="pub-kicker">{t('insight')}</p>
            <p>{version.core.insight || t('none')}</p>
          </section>

          <ClaimNarrative claims={research.claims} evidence={research.evidence} onInspect={inspectEvidence} />

          <section className="pub-reading-abstract" aria-labelledby="public-abstract-heading">
            <h2 id="public-abstract-heading">{t('abstract')}</h2>
            <p data-reading-role="body">{version.core.problem || t('none')}</p>
          </section>

          <section className="pub-reading-sdf" aria-labelledby="public-sdf-heading">
            <h2 id="public-sdf-heading">{t('coreFields')}</h2>
            {PUBLIC_SDF_NODES.filter(([key]) => key !== 'insight').map(([key, label]) => {
              const value = version.core[key];
              return <section key={key} data-sdf-node={key} data-sdf-state={value ? 'confirmed' : 'empty'}>
                <h3>{t(label)}</h3><p data-reading-role="reading">{value || t('none')}</p>
              </section>;
            })}
          </section>

          <section className="pub-reading-citation" data-public-citation="true" data-print-landmark="citation">
            <h2>{t('citation')}</h2>
            <p>{research.citation}</p>
            <ProvenanceCaption label={t('versionId')} value={version.publicVersionId} landmark="provenance" />
            <ProvenanceCaption label={t('publishedAt')} value={publishedAt} landmark="provenance" />
            <ProvenanceCaption label={t('versionHash')} value={hashShort} landmark="provenance" />
          </section>
          {research.aiReview && <section className="pub-reading-review" data-ai-review={research.aiReview.status}>
            <h2>{t('aiReview')}</h2><p>{t('status')}: {research.aiReview.status === 'passed' ? t('passed') : research.aiReview.status}</p>
          </section>}
          {research.history.length > 0 && <section className="pub-reading-history" data-public-version-history="true">
            <h2>{t('history.title')}</h2>
            <ol>{research.history.map((item) => <li key={item.publicVersionId}>
              <a href={item.url}>{item.publicVersionId}</a>
              <span>{item.publishedAt.slice(0, 10)} · {item.contentSha256.slice(0, 8)}…{item.contentSha256.slice(-8)}</span>
            </li>)}</ol>
          </section>}
          {research.artifactPaths.length > 0 && <section className="pub-reading-artifacts" data-print-landmark="provenance">
            <h2>{t('artifactProvenance')}</h2>
            {research.artifactPaths.map((artifact) => <ProvenanceCaption key={`${artifact.logicalPath}-${artifact.blobSha256}`} label={artifact.logicalPath} value={`${artifact.blobSha256.slice(0, 8)}…${artifact.blobSha256.slice(-8)}`} landmark="provenance" />)}
          </section>}
          <PresentationAssetGallery assets={research.presentationAssets} />
          <footer className="pub-disclaimer" data-print-landmark="provenance"><h3>{t('legalDisclaimer')}</h3><p>{disclaimer}</p></footer>
        </article>
        <div className="pub-reading-sidecar">
          <EvidenceRail evidence={selectedEvidence} source={evidenceSource} loading={sourceLoading} error={sourceError} />
          <CitationRail publicId={research.publicId} versionId={version.publicVersionId} objectCitation={objectCitation} versionCitation={research.citation} />
        </div>
      </div>
      <EvidenceSheet open={sheetOpen} onOpenChange={setSheetOpen} evidence={selectedEvidence} source={evidenceSource} loading={sourceLoading} error={sourceError} />
      <div data-public-deep-navigation="true" className="pub-reading-tabs"><TabNavigation activeTab={activeTab} onTabChange={onTabChange} /></div>
      {activeTab !== 'overview' && <ComingSoonTab tabName={t(`tab.${activeTab}`)} />}
    </div>
  );
}
