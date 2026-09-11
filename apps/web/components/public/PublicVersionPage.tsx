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
import styles from './PublicReadingProduct.module.css';

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
  const directPresentation = research.presentationAssets.filter((asset) => asset.kind === 'image' || asset.kind === 'chart' || asset.kind === 'video');
  const supplementaryMedia = research.presentationAssets.filter((asset) => !directPresentation.some((presentation) => presentation.id === asset.id));
  const [selectedEvidence, setSelectedEvidence] = React.useState<PublicEvidence | null>(null);
  const [evidenceSource, setEvidenceSource] = React.useState<PublicEvidenceSource | null>(null);
  const [sourceLoading, setSourceLoading] = React.useState(false);
  const [sourceError, setSourceError] = React.useState(false);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const lastEvidenceTrigger = React.useRef<HTMLElement | null>(null);
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
    setSelectedEvidence(null);
    setEvidenceSource(null);
    setSourceError(false);
    setSourceLoading(false);
    setSheetOpen(false);
  }, [research.publicId, version.versionNo]);

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
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches) {
      lastEvidenceTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setSheetOpen(true);
    }
  };

  return (
    <div className={`pub-reading-surface research-product ${styles.surface}`} data-public-reading-surface="true" data-has-evidence={Boolean(selectedEvidence)}>
      <div className="pub-reading-layout">
        <article className="pub-reading-column" data-public-reading-column="true">
          <header className={`pub-reading-identity ${styles.identity}`} data-public-identity="true">
            <p className="pub-kicker">{t('researchObject')}</p>
            <h1>{research.title}</h1>
            <p className={styles.sourceLine}>{research.publicId} · {version.publicVersionId}</p>
            <div className={`pub-author-line ${styles.authorLine}`}>
              {research.authors.map((author) => <span key={`${author.displayName}-${author.sortOrder}`} data-corresponding-author={author.isCorresponding ? 'true' : undefined}>
                {author.displayName}{author.affiliation ? `, ${author.affiliation}` : ''} · {author.identityStatus}{author.isCorresponding ? ` · ${t('correspondingAuthor')}` : ''}
              </span>)}
            </div>
          </header>

          <section className={`pub-reading-summary ${styles.contribution}`} aria-labelledby="public-summary-heading">
            <p id="public-summary-heading" className="whitespace-pre-wrap" data-reading-role="body">{version.core.insight || version.core.problem || t('none')}</p>
          </section>

          <PresentationAssetGallery assets={directPresentation} leading />

          <section className={`pub-reading-sdf ${styles.fields}`} aria-labelledby="public-sdf-heading">
            <div className={styles.sectionTitle}><h2 id="public-sdf-heading">{t('coreFields')}</h2></div>
            {PUBLIC_SDF_NODES.map(([key, label]) => {
              const value = version.core[key];
              return <section key={key} className={key === 'limitations' ? styles.limitation : undefined} data-sdf-node={key} data-sdf-state={value ? 'confirmed' : 'empty'}>
                <h3>{t(label)}</h3><p className="whitespace-pre-wrap" data-reading-role="reading">{value || t('none')}</p>
              </section>;
            })}
          </section>

          <PresentationAssetGallery assets={supplementaryMedia} />
          <details className="pub-reading-details">
            <summary>{t('claimReader.title')}</summary>
            <ClaimNarrative claims={research.claims} evidence={research.evidence} onInspect={inspectEvidence} />
          </details>

          <details className="pub-reading-details pub-reading-license" data-public-license="true">
            <summary>{t('license')}</summary>
            <div className="pub-license-line">
              {Object.entries(research.licenses).map(([type, id]) => <p key={type}><span>{t(`licenseType.${type}`)}</span>{LICENSE_NAMES[id] || id}</p>)}
            </div>
          </details>
          <details className="pub-reading-details pub-reading-citation" data-public-citation="true" data-print-landmark="citation">
            <summary>{t('citation')}</summary>
            <CitationRail publicId={research.publicId} versionId={version.publicVersionId} objectCitation={objectCitation} versionCitation={research.citation} />
            {research.recordUrl && <p className="pub-record-links"><a href={research.recordUrl}>Research API</a> · <a href="/api/research-record/openapi">OpenAPI</a></p>}
            <ProvenanceCaption label={t('versionId')} value={version.publicVersionId} landmark="provenance" />
            <ProvenanceCaption label={t('publishedAt')} value={publishedAt} landmark="provenance" />
            <ProvenanceCaption label={t('versionHash')} value={hashShort} landmark="provenance" />
          </details>
          {research.aiReview && <details className="pub-reading-details pub-reading-review" data-ai-review={research.aiReview.status}>
            <summary>{t('aiReview')}</summary><p>{t('status')}: {research.aiReview.status === 'passed' ? t('passed') : research.aiReview.status}</p>
          </details>}
          {research.history.length > 0 && <details className="pub-reading-history pub-reading-details" data-public-version-history="true">
            <summary>{t('history.title')}</summary>
            <ol>{research.history.map((item) => <li key={item.publicVersionId}>
              <a href={item.url}>{item.publicVersionId}</a>
              <span>{item.publishedAt.slice(0, 10)} · {item.contentSha256.slice(0, 8)}…{item.contentSha256.slice(-8)}</span>
            </li>)}</ol>
          </details>}
          {research.artifactPaths.length > 0 && <details className="pub-reading-artifacts pub-reading-details" data-print-landmark="provenance">
            <summary>{t('artifactProvenance')}</summary>
            {research.artifactPaths.map((artifact) => <ProvenanceCaption key={`${artifact.logicalPath}-${artifact.blobSha256}`} label={artifact.logicalPath} value={`${artifact.blobSha256.slice(0, 8)}…${artifact.blobSha256.slice(-8)}`} landmark="provenance" />)}
          </details>}
          <details className="pub-disclaimer" data-print-landmark="provenance"><summary>{t('legalDisclaimer')}</summary><p>{disclaimer}</p></details>
        </article>
        {selectedEvidence && <div className="pub-reading-sidecar"><EvidenceRail evidence={selectedEvidence} source={evidenceSource} loading={sourceLoading} error={sourceError} /></div>}
      </div>
      <EvidenceSheet open={sheetOpen} onOpenChange={setSheetOpen} onReturnFocus={() => lastEvidenceTrigger.current?.focus()} evidence={selectedEvidence} source={evidenceSource} loading={sourceLoading} error={sourceError} />
    </div>
  );
}
