import SiteHeader from '@/components/landing/SiteHeader';
import { PublicShell } from '@/components/shell/PublicShell';
import { JournalApplicationReceipt } from '@/components/journals/JournalApplicationReceipt';

export default function JournalApplicationReceiptPage({ params }: { params: { applicationId: string } }) {
  return <PublicShell tone="paper" skipLabel="跳到内容" navigationLabel="主导航" wrapHeaderActionsOnMobile headerActions={<SiteHeader active="journals" context="public-product" tone="paper" />}><div className="mx-auto max-w-3xl px-5 py-10 sm:px-8"><JournalApplicationReceipt applicationId={params.applicationId} /></div></PublicShell>;
}
