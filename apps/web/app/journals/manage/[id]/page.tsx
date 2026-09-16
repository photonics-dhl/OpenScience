import { DashboardShell } from '@/components/shell/DashboardShell';
import { JournalManagementWorkbench } from '@/components/journals/JournalManagementWorkbench';

export default function JournalManagePage({ params }: { params: { id: string } }) {
  return <DashboardShell activeRoute="dashboard" skipLabel="跳到内容" navigationLabel="工作台导航"><JournalManagementWorkbench journalId={params.id} /></DashboardShell>;
}
