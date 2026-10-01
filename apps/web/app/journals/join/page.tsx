import Link from 'next/link';
import { PublicShell } from '@/components/shell/PublicShell';
import SiteHeader, { PublicProductAccess } from '@/components/landing/SiteHeader';

export default function JournalJoinPage() {
  return <PublicShell mainClassName="craft-journal craft-journal-public craft-journal-invitation" tone="paper" skipLabel="跳到内容" navigationLabel="主导航" wrapHeaderActionsOnMobile headerActions={<SiteHeader active="journals" context="public-product" tone="paper" />} headerUtilities={<PublicProductAccess />}>
    <section>
      <Link className="journal-back-link" href="/journals">← 期刊目录</Link>
      <p className="mt-6 text-sm text-os-muted-paper">期刊入驻</p>
      <h1>让期刊的研究被读懂</h1>
      <p className="mt-6 text-os-muted-paper">建立期刊主页与论文目录，和编辑部一起维护研究的公开入口。</p>
      <div className="journal-invitation-details">
        <h2>从目录到研究解读</h2>
        <p>从有明确来源和授权的论文材料出发，生成结构化解读，由编辑审核后公开。</p>
        <p className="text-os-muted-paper">基础入驻免费。批量加工、材料整理和持续运营按服务申请开通。</p>
      </div>
      <Link href="/journals/apply" className="journal-primary-link">开始申请 →</Link>
    </section>
  </PublicShell>;
}
