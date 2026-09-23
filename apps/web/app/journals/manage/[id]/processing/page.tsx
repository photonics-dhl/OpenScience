import { DashboardShell } from '@/components/shell/DashboardShell';
import { JournalProcessingQueue } from '@/components/journals/JournalProcessingQueue';
export default function JournalProcessingPage({ params }: { params: { id: string } }) { return <DashboardShell activeRoute="dashboard" skipLabel="跳到加工优先级" navigationLabel="期刊加工队列"><JournalProcessingQueue journalId={params.id} /></DashboardShell>; }
