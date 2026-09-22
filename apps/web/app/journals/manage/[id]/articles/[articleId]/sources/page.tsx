import { DashboardShell } from '@/components/shell/DashboardShell';
import { JournalSourceRightsMatrix } from '@/components/journals/JournalSourceRightsMatrix';
export default function JournalSourceRightsPage({ params }: { params: { id: string; articleId: string } }) { return <DashboardShell activeRoute="dashboard" skipLabel="跳到来源与授权" navigationLabel="论文来源与授权"><JournalSourceRightsMatrix journalId={params.id} articleId={params.articleId} /></DashboardShell>; }
