import Link from 'next/link';
import { PublicShell } from '@/components/shell/PublicShell';
import SiteHeader, { PublicProductAccess } from '@/components/landing/SiteHeader';
import { JournalDirectory } from '@/components/journals/JournalDirectory';
import { JournalAdminLink } from '@/components/journals/JournalAdminLink';
import { getServerPublicJournals } from '@/lib/public-server-api';
import type { JournalSummary } from '@/lib/journal-api';

export default async function JournalsPage() {
  let initial: JournalSummary[] = [];
  let nextCursor: string | null = null;
  try { const page = await getServerPublicJournals(); initial = page.items; nextCursor = page.nextCursor; }
  catch { /* The directory handles a failed client refresh. */ }
  return <PublicShell mainClassName="craft-journal craft-journal-public" tone="paper" skipLabel="跳到内容" navigationLabel="主导航" wrapHeaderActionsOnMobile headerActions={<SiteHeader active="journals" context="public-product" tone="paper" />} headerUtilities={<PublicProductAccess />}>
    <section>
      <header className="journal-directory-heading">
        <p className="text-sm text-os-muted-paper">OpenScience · 期刊</p>
        <h1>期刊目录</h1>
        <p className="text-os-muted-paper">按研究领域浏览期刊，阅读论文与编辑部审核的研究解读。</p>
      </header>
      <JournalDirectory initial={initial} initialNextCursor={nextCursor} />
      <nav className="journal-account-tools" aria-label="期刊账户工具">
        <Link href="/journals/apply">申请期刊入驻 →</Link>
        <JournalAdminLink />
      </nav>
    </section>
  </PublicShell>;
}
