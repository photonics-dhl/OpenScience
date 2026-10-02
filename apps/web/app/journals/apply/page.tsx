import Link from 'next/link';
import { PublicShell } from '@/components/shell/PublicShell';
import SiteHeader, { PublicProductAccess } from '@/components/landing/SiteHeader';
import { JournalApplicationForm } from '@/components/journals/JournalApplicationForm';

export default function ApplyJournalPage() {
  return <PublicShell mainClassName="craft-journal craft-journal-form" tone="paper" skipLabel="跳到内容" navigationLabel="主导航" wrapHeaderActionsOnMobile headerActions={<SiteHeader active="journals" context="public-product" tone="paper" />} headerUtilities={<PublicProductAccess />}>
    <section>
      <Link className="journal-back-link" href="/journals">← 返回期刊目录</Link>
      <header className="journal-work-heading mt-6">
        <p className="text-sm text-os-muted-paper">期刊入驻</p>
        <h1>申请建立期刊主页</h1>
        <p className="text-os-muted-paper">填写期刊与编辑部联系信息，提交身份核验后建立主页。基础主页和目录维护免费；批量加工、材料整理与持续运营可另行申请服务。</p>
      </header>
      <JournalApplicationForm />
    </section>
  </PublicShell>;
}
