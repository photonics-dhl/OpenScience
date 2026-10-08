'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { ApiClientError } from '@/lib/api';
import { getJournalDashboard, type JournalDashboard } from '@/lib/journal-api';
import { deleteWorkingDraft, listWorkbenchArticles, restoreWorkingDraft, type WorkbenchArticle } from '@/lib/journal-workbench-api';
import { canDeleteDraft, isProcessing, matchesWorkbenchView, WORKBENCH_VIEWS, type WorkbenchView } from '@/lib/journal-workbench-model';
import { JournalDoiImport } from './JournalDoiImport';
import { JournalGovernance } from './JournalGovernance';
import { JournalFeedback } from './JournalFeedback';
export { shouldOfferHomepageActivation } from '@/lib/journal-workbench-model';
const labels: Record<WorkbenchView, string> = { drafts: '草稿箱', processing: '处理中', review: '待审核', completed: '已完成处理', published: '已公开解读', archived: '已删除草稿' };
const control = 'inline-flex min-h-11 items-center border border-os-rule-paper px-4 text-sm text-os-ink no-underline disabled:opacity-50';
export function JournalManagementWorkbench({ journalId }: { journalId: string }) {
  const router = useRouter(); const [data, setData] = React.useState<JournalDashboard | null>(null); const [articles, setArticles] = React.useState<WorkbenchArticle[]>([]);
  const [view, setView] = React.useState<WorkbenchView>('drafts'); const [term, setTerm] = React.useState(''); const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(true); const [error, setError] = React.useState(''); const [message, setMessage] = React.useState(''); const [busy, setBusy] = React.useState(false);
  const loadNumber = React.useRef(0); const inFlight = React.useRef(false); const controller = React.useRef<AbortController | null>(null);
  const load = React.useCallback(async () => {
    const request = ++loadNumber.current; controller.current?.abort(); const pending = new AbortController(); controller.current = pending; setLoading(true); setError('');
    try {
      const [dashboard, rows] = await Promise.all([getJournalDashboard(journalId), listWorkbenchArticles(journalId, pending.signal)]);
      if (request !== loadNumber.current) return; setData(dashboard); setArticles(rows);
      if (dashboard.membership.role === 'reviewer' && !new URLSearchParams(window.location.search).has('view')) setView('review');
    } catch (cause) {
      if (request !== loadNumber.current) return;
      if (cause instanceof ApiClientError && [401, 403, 404].includes(cause.status)) { setData(null); setArticles([]); if (cause.status === 401) router.replace(`/auth/login?returnTo=${encodeURIComponent(`/journals/manage/${journalId}`)}`); }
      setError(cause instanceof Error ? cause.message : '无法加载期刊工作台。');
    } finally { if (request === loadNumber.current) setLoading(false); }
  }, [journalId, router]);
  React.useEffect(() => { void load(); return () => { loadNumber.current += 1; controller.current?.abort(); }; }, [load]);
  React.useEffect(() => {
    function restore() { const value = new URLSearchParams(window.location.search).get('view') as WorkbenchView; setView(WORKBENCH_VIEWS.includes(value) ? value : 'drafts'); setPage(1); }
    restore(); window.addEventListener('popstate', restore); return () => window.removeEventListener('popstate', restore);
  }, []);
  function navigate(next: WorkbenchView) { setView(next); setPage(1); setTerm(''); const url = new URL(window.location.href); url.searchParams.set('view', next); window.history.pushState(null, '', url); }
  async function changeDraft(article: WorkbenchArticle, restore: boolean) {
    if (inFlight.current || loading || error || !data) return;
    if (!restore && !canDeleteDraft(article, data.membership.role)) return;
    const prompt = restore ? `恢复“${article.metadata.title}”的加工草稿？` : `删除“${article.metadata.title}”的加工草稿？论文记录、文件和历史记录会保留，可从“已删除草稿”恢复。`;
    if (!window.confirm(prompt)) return; inFlight.current = true; setBusy(true); setMessage('');
    try { await (restore ? restoreWorkingDraft : deleteWorkingDraft)(journalId, article.id, article.revision); await load(); setMessage(restore ? '草稿已恢复。' : '草稿已删除，论文文件和历史记录未删除。'); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : '操作失败，请刷新后重试。'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  if (error && !data) return <section role="alert"><p>{error}</p><button className={control} onClick={() => void load()}>重新加载</button></section>;
  if (!data) return <p className="py-10" role="status">正在加载期刊草稿与处理记录…</p>;
  const canEdit = ['owner', 'admin', 'editor'].includes(data.membership.role); const canManage = ['owner', 'admin'].includes(data.membership.role); const disabled = loading || busy || !!error;
  const rows = articles.filter((article) => matchesWorkbenchView(article, view) && [article.metadata.title, article.metadata.doi ?? ''].join(' ').toLocaleLowerCase().includes(term.trim().toLocaleLowerCase()));
  const pages = Math.max(1, Math.ceil(rows.length / 20)); const currentPage = Math.min(page, pages);
  return <div className="grid min-w-0 gap-7" aria-busy={loading}>
    {error ? <div role="alert"><p>{error} 当前显示的是上次加载结果，请重新加载后再操作。</p><button className={control} onClick={() => void load()}>重新加载</button></div> : null}{loading ? <p role="status">正在刷新工作台…</p> : null}
    <header className="border-b border-os-rule-paper pb-6"><Link href="/journals/manage" className="text-sm text-os-muted-paper">← 我的期刊</Link><h1 className="mt-4 break-words text-4xl font-normal">{data.journal.nameEn || data.journal.nameZh}</h1><p className="text-os-muted-paper">期刊工作台 · 准备材料、编辑解读、核验授权与审批发布。</p><nav className="mt-4 flex flex-wrap gap-4 text-sm" aria-label="期刊管理功能"><Link href={`/journals/${encodeURIComponent(data.journal.slug)}`}>查看期刊主页</Link>{canManage ? <Link href={`/journals/manage/${journalId}/services`}>服务包与额度</Link> : null}</nav></header>
    <div className="grid gap-px bg-os-rule-paper sm:grid-cols-2">{(['published', 'completed'] as const).map((key) => <Link href={`?view=${key}`} key={key} className="bg-paper-bg p-5 text-os-ink no-underline" onClick={(event) => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); navigate(key); }}><span className="text-sm text-os-muted-paper">{labels[key]} →</span><span className="mt-3 block text-3xl">{articles.filter((article) => matchesWorkbenchView(article, key)).length}</span></Link>)}</div>
    {canEdit ? <fieldset className="min-w-0 border-0 p-0" disabled={disabled}><JournalDoiImport journalId={journalId} onImported={load} /></fieldset> : null}
    <section id="journal-worklist" aria-label={labels[view]}><nav aria-label="论文工作视图" className="flex flex-wrap gap-2">{WORKBENCH_VIEWS.filter((key) => key !== 'archived' || canEdit).map((key) => <button type="button" key={key} aria-pressed={view === key} className={`${control} ${view === key ? 'bg-os-ink text-paper-bg' : ''}`} disabled={loading || busy} onClick={() => navigate(key)}>{labels[key]}</button>)}</nav>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4"><h2 className="m-0 text-2xl font-normal">{labels[view]}</h2><label className="flex min-w-0 items-center gap-2 text-sm">查找论文<input className="min-h-11 min-w-0 max-w-full border border-os-rule-paper bg-transparent px-3" value={term} placeholder="题名或 DOI" onChange={(event) => { setTerm(event.target.value); setPage(1); }} /></label></div><p className="text-sm text-os-muted-paper">{rows.length} 篇{view === 'completed' ? ' · 按论文去重；完成处理不代表已公开' : view === 'drafts' ? ' · 准备好材料后再开始解读' : ''}</p>
      {!rows.length ? <p className="py-8 text-os-muted-paper">{view === 'drafts' ? '暂无加工草稿。可通过“导入论文 DOI”添加。' : '当前视图暂无论文。'}</p> : <div className="divide-y divide-os-rule-paper">{rows.slice((currentPage - 1) * 20, currentPage * 20).map((article) => <article key={article.id} className="py-5"><p className="m-0 text-xs text-os-muted-paper">{article.draftArchived ? '已删除草稿' : isProcessing(article) ? '处理中' : ({ draft: '草稿', submitted: '待审核', approved: '审核通过', changes_requested: '需要修改' } as Record<string, string>)[article.reviewState] || article.reviewState} · 修订 {article.revision}</p><h3 className="mt-2 break-words text-xl font-normal">{article.metadata.title}</h3><p className="break-all text-sm text-os-muted-paper">{article.metadata.doi ? `DOI ${article.metadata.doi}` : '历史无 DOI 记录'}{article.metadata.publishedDate ? ` · ${article.metadata.publishedDate}` : ''}</p><div className="mt-3 flex flex-wrap gap-3">{article.draftArchived ? canEdit ? <button className={control} disabled={disabled} onClick={() => void changeDraft(article, true)}>恢复草稿</button> : null : <><Link className={control} href={`/journals/manage/${journalId}/articles/${article.id}`}>{canEdit ? article.releases.length ? '重新编辑' : '继续编辑' : '查看并审核'}</Link>{canDeleteDraft(article, data.membership.role) ? <button className={control} disabled={disabled} onClick={() => void changeDraft(article, false)}>删除草稿</button> : null}</>}</div></article>)}</div>}
      {pages > 1 ? <nav aria-label="工作台论文分页" className="mt-5 flex items-center gap-4"><button className={control} disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>上一页</button><span>{currentPage} / {pages}</span><button className={control} disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>下一页</button></nav> : null}</section>
    {busy || message ? <p role="status">{busy ? '正在更新草稿…' : message}</p> : null}{canManage ? <fieldset className="min-w-0 border-0 p-0" disabled={disabled}><JournalGovernance data={data} reload={load} /></fieldset> : null}{canEdit ? <JournalFeedback journalId={journalId} editorial /> : null}
  </div>;
}
