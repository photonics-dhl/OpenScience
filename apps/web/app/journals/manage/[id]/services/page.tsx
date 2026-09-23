import { DashboardShell } from '@/components/shell/DashboardShell';
import { JournalServices } from '@/components/journals/JournalServices';
export default function JournalServicesPage({ params }: { params: { id: string } }) { return <DashboardShell activeRoute="dashboard" skipLabel="跳到服务与额度" navigationLabel="期刊服务"><JournalServices journalId={params.id} /></DashboardShell>; }
