import { getPublicResearchVersion, ApiClientError } from '../../../lib/api';
import type { Metadata } from 'next';

/** P1D-9：RO 概览（最新版本，§6.1 稳定 URL）。 */

export async function generateMetadata({ params }: { params: { publicId: string } }): Promise<Metadata> {
  try {
    const res = await getPublicResearchVersion(params.publicId, 1);
    const r = res.research;
    const authors = r.authors.map((a) => a.displayName).join(', ');
    return {
      title: `${r.title} | OpenScience`,
      description: `${r.version.core.problem?.substring(0, 160) ?? ''}`,
      openGraph: {
        title: r.title,
        description: r.version.core.problem?.substring(0, 160) ?? '',
        type: 'article',
        authors: authors ? [authors] : [],
      },
      robots: r.visibility === 'public' ? 'index, follow' : 'noindex, nofollow',
    };
  } catch {
    return {
      title: '未找到 | OpenScience',
      robots: 'noindex',
    };
  }
}

export default async function Page({ params }: { params: { publicId: string } }) {
  try {
    const res = await getPublicResearchVersion(params.publicId, 1);
    const r = res.research;
    return (
      <main className="pub-page">
        <h1 className="pub-title">{r.title}</h1>
        <p className="pub-meta">
          <code>{r.publicId}</code> · {r.visibility}
        </p>
        <p><a href={`/research/${params.publicId}/v/1`}>查看版本 1</a></p>
        <footer className="pub-disclaimer">{r.version.legalDisclaimer ?? '此时间戳仅证明平台在相应时间接收并记录了该版本及其内容哈希，不构成专利优先权、著作权归属、科研正确性或司法存证保证。'}</footer>
      </main>
    );
  } catch (err) {
    console.error('[PublicOverview] Fetch error:', err);
    if (err instanceof ApiClientError && err.status === 429) {
      return (
        <main className="pub-page">
          <h1>请求过于频繁</h1>
          <p>请稍后重试。</p>
        </main>
      );
    }
    return (
      <main className="pub-page">
        <h1>未找到</h1>
        <p>该公开对象不存在或不可访问。</p>
      </main>
    );
  }
}
