'use client';
import { getPublicResearchVersion, ApiClientError } from '../../lib/api';
import { LEGAL_DISCLAIMER_DEFAULT, LICENSE_NAMES } from '../../lib/constants';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { TabNavigation, ComingSoonTab, type TabId } from './TabNavigation';

type PublicResearch = Awaited<ReturnType<typeof getPublicResearchVersion>>['research'];

function ErrorState({ status }: { status: 404 | 429 | 'other' }) {
  const t = useTranslations('public');
  if (status === 404) {
    return (
      <main className="pub-page">
        <h1>{t('notFound.title')}</h1>
        <p>{t('notFound.body')}</p>
      </main>
    );
  }
  if (status === 429) {
    return (
      <main className="pub-page">
        <h1>{t('rateLimited.title')}</h1>
        <p>{t('rateLimited.body')}</p>
      </main>
    );
  }
  return (
    <main className="pub-page">
      <h1>{t('unavailable.title')}</h1>
      <p>{t('unavailable.body')}</p>
    </main>
  );
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const t = useTranslations('public');
  const [copied, setCopied] = useState(false);
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

function OverviewTab({ research }: { research: PublicResearch }) {
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

export default function PublicVersionPage({ publicId, versionNo }: { publicId: string; versionNo: number }) {
  const t = useTranslations('public');
  const [research, setResearch] = useState<PublicResearch | null>(null);
  const [error, setError] = useState<404 | 429 | 'other' | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  useEffect(() => {
    getPublicResearchVersion(publicId, versionNo)
      .then((res) => setResearch(res.research))
      .catch((err) => {
        if (err instanceof ApiClientError) {
          if (err.status === 404) return setError(404);
          if (err.status === 429) return setError(429);
        }
        console.error('[PublicVersionPage] Fetch error:', err);
        setError('other');
      });
  }, [publicId, versionNo]);

  if (error) return <ErrorState status={error} />;
  if (!research) return <main className="pub-page"><p>{t('loading')}</p></main>;

  return (
    <main className="pub-page-tabbed">
      <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === 'overview' && <OverviewTab research={research} />}
      {activeTab !== 'overview' && <ComingSoonTab tabName={t(`tab.${activeTab}`)} />}
    </main>
  );
}
