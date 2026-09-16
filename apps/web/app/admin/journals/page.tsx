import { DashboardShell } from '@/components/shell/DashboardShell';
import { JournalAdminConsole } from '@/components/journals/JournalAdminConsole';
import { getTranslations } from 'next-intl/server';

export default async function AdminJournalsPage() {
  const t = await getTranslations('journalAdmin');
  return <DashboardShell activeRoute="journalAdmin" skipLabel="跳到内容" navigationLabel={t('platform')}><header className="border-b border-os-rule-paper pb-6"><p className="text-sm text-os-muted-paper">{t('platform')}</p><h1 className="mt-2 text-4xl font-normal">{t('heading')}</h1></header><JournalAdminConsole /></DashboardShell>;
}
