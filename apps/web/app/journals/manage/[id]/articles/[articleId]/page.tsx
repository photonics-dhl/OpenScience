import { DashboardShell } from '@/components/shell/DashboardShell';
import { JournalArticleWorkbench } from '@/components/journals/JournalArticleWorkbench';

export default function JournalArticlePage({ params }: { params: { id: string; articleId: string } }) {
  return <DashboardShell activeRoute="dashboard" skipLabel="跳到内容" navigationLabel="期刊论文工作台"><JournalArticleWorkbench journalId={params.id} articleId={params.articleId} /></DashboardShell>;
}
