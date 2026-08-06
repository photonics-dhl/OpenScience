'use client';
import { getPublicResearchVersion, ApiClientError } from '../../lib/api';
import { LEGAL_DISCLAIMER_DEFAULT, LICENSE_NAMES } from '../../lib/constants';
import { useEffect, useState } from 'react';
import { TabNavigation, ComingSoonTab, type TabId } from './TabNavigation';

type PublicResearch = Awaited<ReturnType<typeof getPublicResearchVersion>>['research'];

function ErrorState({ status }: { status: 404 | 429 | 'other' }) {
  if (status === 404) {
    return (
      <main className="pub-page">
        <h1>未找到</h1>
        <p>该公开版本不存在或不可访问。</p>
      </main>
    );
  }
  if (status === 429) {
    return (
      <main className="pub-page">
        <h1>请求过于频繁</h1>
        <p>请稍后重试。</p>
      </main>
    );
  }
  return (
    <main className="pub-page">
      <h1>暂时不可用</h1>
      <p>服务暂时出错，请稍后重试。</p>
    </main>
  );
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} className="copy-btn" title={label ?? '复制'}>
      {copied ? '✓ 已复制' : '复制'}
    </button>
  );
}

function OverviewTab({ research }: { research: PublicResearch }) {
  const r = research;
  const disclaimer = r.version.legalDisclaimer || LEGAL_DISCLAIMER_DEFAULT;
  const hashShort = r.version.contentSha256
    ? `${r.version.contentSha256.substring(0, 8)}...${r.version.contentSha256.substring(56)}`
    : '未发布';

  return (
    <article className="pub-article">
      <header className="pub-header">
        <h1>{r.title}</h1>
        <p className="pub-version-id">{r.version.publicVersionId}</p>

        <section className="pub-authors">
          <h2>作者</h2>
          {r.authors.map((a, i) => (
            <div key={i} className="pub-author">
              <span className="pub-author-name">
                {a.displayName}
                {a.isCorresponding && <sup title="通讯作者"> ✉</sup>}
              </span>
              {a.affiliation && <span className="pub-author-affiliation">{a.affiliation}</span>}
              <span className="pub-author-status">({a.identityStatus})</span>
            </div>
          ))}
        </section>

        {r.contributions.length > 0 && (
          <section className="pub-contributions">
            <h3>贡献</h3>
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
        <h2>摘要</h2>
        <p>{r.version.core.problem || '无'}</p>
      </section>

      <section className="pub-section">
        <h2>核心字段</h2>
        <dl>
          <dt>核心洞察</dt>
          <dd>{r.version.core.insight || '无'}</dd>
          <dt>方法</dt>
          <dd>{r.version.core.method || '无'}</dd>
          <dt>结果</dt>
          <dd>{r.version.core.results || '无'}</dd>
          <dt>局限性</dt>
          <dd>{r.version.core.limitations || '无'}</dd>
          <dt>可复现性</dt>
          <dd>{r.version.core.reproducibility || '无'}</dd>
        </dl>
      </section>

      <section className="pub-section">
        <h2>许可证</h2>
        <ul className="pub-licenses">
          {Object.entries(r.licenses).map(([type, id]) => (
            <li key={type}>
              <strong>{type === 'text' ? '文字' : type === 'code' ? '代码' : '数据'}:</strong>{' '}
              {LICENSE_NAMES[id] || id}
            </li>
          ))}
        </ul>
      </section>

      <section className="pub-section">
        <h2>版本信息</h2>
        <dl>
          <dt>Unique ID</dt>
          <dd>{r.publicId}</dd>
          <dt>版本 ID</dt>
          <dd>{r.version.publicVersionId}</dd>
          <dt>发布时间</dt>
          <dd>{r.version.publishedAt ? new Date(r.version.publishedAt).toUTCString() : '未发布'}</dd>
          <dt>版本哈希</dt>
          <dd className="pub-hash">
            <code>{hashShort}</code>
            {r.version.contentSha256 && <CopyButton text={r.version.contentSha256} label="复制完整哈希" />}
          </dd>
        </dl>
      </section>

      <section className="pub-section pub-citation">
        <h2>引用格式</h2>
        <div className="pub-citation-box">
          <code>{r.citation}</code>
          <CopyButton text={r.citation} label="复制引用" />
        </div>
      </section>

      {r.aiReview && (
        <aside className="pub-ai-review">
          <h3>AI 审核摘要</h3>
          <p>
            状态:{' '}
            <span
              className={`pub-badge ${
                r.aiReview.status === 'passed'
                  ? 'pub-badge-success'
                  : r.aiReview.status === 'failed'
                    ? 'pub-badge-rejected'
                    : 'pub-badge-warn'
              }`}
            >
              {r.aiReview.status === 'passed' ? '通过' : r.aiReview.status}
            </span>
          </p>
          {r.aiReview.hardBlocks && typeof r.aiReview.hardBlocks === 'object' && (
            <details>
              <summary>硬阻断项 ({Object.keys(r.aiReview.hardBlocks as object).length})</summary>
              <pre>{JSON.stringify(r.aiReview.hardBlocks, null, 2)}</pre>
            </details>
          )}
          {r.aiReview.warnings && Array.isArray(r.aiReview.warnings) && r.aiReview.warnings.length > 0 && (
            <details>
              <summary>警告项 ({(r.aiReview.warnings as unknown[]).length})</summary>
              <pre>{JSON.stringify(r.aiReview.warnings, null, 2)}</pre>
            </details>
          )}
        </aside>
      )}

      <footer className="pub-disclaimer">
        <h3>法律免责声明</h3>
        <p>{disclaimer}</p>
      </footer>
    </article>
  );
}

export default function PublicVersionPage({ publicId, versionNo }: { publicId: string; versionNo: number }) {
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
  if (!research) return <main className="pub-page"><p>加载中...</p></main>;

  const TAB_LABELS: Record<TabId, string> = {
    overview: 'Overview',
    manuscript: 'Manuscript',
    methods: 'Methods & Experiments',
    data: 'Data & Code',
    figures: 'Figures & Visualization',
    versions: 'Versions & Diff',
    issues: 'Issues',
    'pull-requests': 'Pull Requests',
    reviews: 'Reviews & Discussions',
    citations: 'Citations & Related Work',
  };

  return (
    <main className="pub-page-tabbed">
      <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === 'overview' && <OverviewTab research={research} />}
      {activeTab !== 'overview' && <ComingSoonTab tabName={TAB_LABELS[activeTab]} />}
    </main>
  );
}
