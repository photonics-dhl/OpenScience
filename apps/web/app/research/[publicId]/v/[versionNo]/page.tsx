import PublicVersionPage from '../../../../../components/public/PublicVersionPage';
import { getPublicResearchVersion } from '../../../../../lib/api';
import type { Metadata } from 'next';

/** P1D-9：公开版本页（§6.1 /research/OSR-YYYY-NNNNNN/v/N，SSR 可索引 §4.3）。 */

export async function generateMetadata({ params }: { params: { publicId: string; versionNo: string } }): Promise<Metadata> {
  const versionNo = Number(params.versionNo);
  if (!Number.isInteger(versionNo) || versionNo < 1) {
    return { title: '无效版本号 | OpenScience', robots: 'noindex' };
  }
  try {
    const res = await getPublicResearchVersion(params.publicId, versionNo);
    const r = res.research;
    const authors = r.authors.map((a) => a.displayName).join(', ');
    return {
      title: `${r.title} v${versionNo} | OpenScience`,
      description: r.version.core.problem?.substring(0, 160) ?? '',
      openGraph: {
        title: `${r.title} v${versionNo}`,
        description: r.version.core.problem?.substring(0, 160) ?? '',
        type: 'article',
        authors: authors ? [authors] : [],
        publishedTime: r.version.publishedAt ?? undefined,
      },
      robots: r.visibility === 'public' ? 'index, follow' : 'noindex, nofollow',
    };
  } catch {
    return { title: '未找到 | OpenScience', robots: 'noindex' };
  }
}

export default async function Page({ params }: { params: { publicId: string; versionNo: string } }) {
  const versionNo = Number(params.versionNo);
  if (!Number.isInteger(versionNo) || versionNo < 1) {
    return <main className="pub-page"><h1>无效版本号</h1></main>;
  }
  return <PublicVersionPage publicId={params.publicId} versionNo={versionNo} />;
}
