'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { ApiClientError } from '@/lib/api';
import { JournalFeedback } from './JournalFeedback';
import {
  activateJournal, addJournalMember, createAiDraft, createManualJournalArticle, getJournalDashboard,
  importJournalDois, listJournalMembers, previewJournalDois, removeJournalMember, requestJournalService,
  transferJournalOwner, updateJournalHomepage, updateJournalMember,
  type JournalDashboard, type JournalImportPreview, type JournalMember,
} from '@/lib/journal-api';

const inputClass = 'min-h-10 border border-os-rule-paper bg-transparent px-3';
export const shouldOfferHomepageActivation = (journal: Pick<JournalDashboard['journal'], 'homepagePublished' | 'status'>) => !journal.homepagePublished && journal.status === 'active';

export function JournalManagementWorkbench({ journalId }: { journalId: string }) {
  const router = useRouter();
  const [data, setData] = React.useState<JournalDashboard | null>(null);
  const [error, setError] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [dois, setDois] = React.useState('');
  const [preview, setPreview] = React.useState<JournalImportPreview[]>([]);
  const [manual, setManual] = React.useState({ title: '', authors: '', publishedDate: '', originalUrl: '' });
  const [service, setService] = React.useState({ annualVolume: 10, language: 'zh', figureScale: 'standard', notes: '' });
  const [batchSelection, setBatchSelection] = React.useState<string[]>([]);
  const [batchResults, setBatchResults] = React.useState<Record<string, string>>({});
  const [batchBusy, setBatchBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    try { setData(await getJournalDashboard(journalId)); setError(''); }
    catch (cause) {
      if (cause instanceof ApiClientError && cause.status === 401) router.replace(`/auth/login?returnTo=${encodeURIComponent(`/journals/manage/${journalId}`)}`);
      else setError(cause instanceof Error ? cause.message : '无法加载期刊工作台。');
    }
  }, [journalId, router]);
  React.useEffect(() => { void load(); }, [load]);
  if (error) return <section role="alert"><p>{error}</p><button onClick={() => void load()}>重试</button></section>;
  if (!data) return <p aria-live="polite">正在加载期刊工作台…</p>;

  const canEdit = data.membership.role !== 'reviewer';
  const canManage = data.membership.role === 'owner' || data.membership.role === 'admin';
  const issns = [data.journal.pIssn, data.journal.eIssn].filter((value): value is string => Boolean(value));
  const activeJobs = new Set(data.jobs.filter((job) => ['staging', 'pending', 'running'].includes(job.state)).map((job) => job.articleId));
  const availableCredits = data.grants.reduce((sum, grant) => sum + (grant.expiresAt && new Date(grant.expiresAt).getTime() > Date.now() ? Math.max(0, grant.remaining - grant.reserved) : 0), 0);
  const selectedArticles = data.articles.filter((article) => batchSelection.includes(article.id));
  const needsMaterial = (article: JournalDashboard['articles'][number]) => article.contentState !== 'active' || article.source.kind === 'metadata' || !article.source.text.trim() || !article.rights.internalProcessing || !article.rights.derivativeGeneration || !article.rights.externalProcessing || !article.rights.license.trim() || !article.rights.evidence.trim();
  const sourceReady = selectedArticles.filter((article) => !needsMaterial(article) && !activeJobs.has(article.id));
  const batchPlan = {
    ready: sourceReady.slice(0, availableCredits),
    needsSource: selectedArticles.filter((article) => !activeJobs.has(article.id) && needsMaterial(article)),
    active: selectedArticles.filter((article) => activeJobs.has(article.id)),
    insufficient: sourceReady.slice(availableCredits),
  };

  async function previewDois() {
    const values = dois.split(/[\n,\s]+/).filter(Boolean);
    if (!values.length) return;
    try { const result = await previewJournalDois(journalId, values); setPreview(result.items); setMessage('预览完成。请核对题名、作者、原刊、日期和匹配状态后确认。'); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : '预览失败'); }
  }

  async function confirmImport() {
    const values = preview.filter((item) => item.status === 'ready').map((item) => item.input);
    if (!values.length) { setMessage('没有可确认导入的 DOI。'); return; }
    try {
      const result = await importJournalDois(journalId, values);
      const previous = new Map(preview.map((item) => [item.input, item]));
      const finalItems: JournalImportPreview[] = result.items.map((item) => ({ ...item, metadata: previous.get(item.input)?.metadata }));
      const failed = finalItems.filter((item) => item.status === 'failed');
      setPreview(finalItems); setDois(failed.map((item) => item.input).join('\n'));
      setMessage(`已导入 ${finalItems.filter((item) => item.status === 'imported').length} 条；${failed.length} 条保留在输入框，可单独重试。`); await load();
    }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : '导入失败'); }
  }

  async function addManual() {
    if (!manual.title.trim() || !manual.authors.trim() || !manual.originalUrl.trim()) { setMessage('无 DOI 论文需填写题名、作者和稳定原文地址。'); return; }
    try {
      await createManualJournalArticle(journalId, {
        title: manual.title.trim(), authors: manual.authors.split(/[,，\n]+/).map((value) => value.trim()).filter(Boolean),
        publishedDate: manual.publishedDate || undefined, journalTitle: data!.journal.nameEn || data!.journal.nameZh || undefined, issns,
        originalUrl: manual.originalUrl.trim(), doi: null,
      });
      setManual({ title: '', authors: '', publishedDate: '', originalUrl: '' }); setMessage('无 DOI 论文已加入待核对目录。'); await load();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : '无法添加论文'); }
  }

  async function requestService() {
    try { await requestJournalService(journalId, { ...service, services: ['AI 标准解读包'], requestKey: crypto.randomUUID() }); setMessage('服务申请已提交，平台确认后会更新状态与额度。'); await load(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : '服务申请失败'); }
  }

  async function submitBatch() {
    if (!batchPlan.ready.length) { setMessage('当前选择中没有可运行的论文。'); return; }
    if (!window.confirm(`确认对 ${batchPlan.ready.length} 篇论文生成标准解读？预计消耗 ${batchPlan.ready.length} 个额度。`)) return;
    const keys = new Map(batchPlan.ready.map((article) => [article.id, crypto.randomUUID()]));
    setBatchBusy(true);
    const results: Record<string, string> = {};
    try {
      for (let i = 0; i < batchPlan.ready.length; i += 4) {
        const group = batchPlan.ready.slice(i, i + 4);
        const settled = await Promise.allSettled(group.map((article) => createAiDraft(journalId, article.id, { revision: article.revision, language: 'zh', requestKey: keys.get(article.id)! })));
        group.forEach((article, index) => {
          const result = settled[index]!;
          results[article.id] = result.status === 'fulfilled' ? '已进入队列' : result.reason instanceof Error ? result.reason.message : '提交失败';
        });
        setBatchResults((current) => ({ ...current, ...results }));
      }
      setMessage('批量提交完成；每篇结果如下，失败项不会影响其他论文。'); await load();
    } finally { setBatchBusy(false); }
  }

  return <div className="grid gap-8">
    <header className="border-b border-os-rule-paper pb-6"><p className="text-sm text-os-muted-paper">我的期刊 · {data.membership.role}</p><h1 className="mt-2 text-4xl font-normal">{data.journal.nameEn || data.journal.nameZh}</h1><p className="text-os-muted-paper">管理目录、来源、解读审核与固定版本。</p></header>
    <div className="grid gap-px bg-os-rule-paper sm:grid-cols-3"><Metric label="公开解读" value={data.stats.published} /><Metric label="论文目录" value={data.stats.articles} /><Metric label="已完成处理" value={data.stats.jobsSucceeded} /></div>

    {canEdit ? <section className="border-y border-os-rule-paper py-6"><h2 className="text-xl font-normal">导入论文 DOI</h2><p className="text-sm text-os-muted-paper">每行一个 DOI，最多 50 条。先查询 Crossref 并核对本刊 ISSN，确认后才写入目录。</p><textarea value={dois} onChange={(event) => { setDois(event.target.value); setPreview([]); }} rows={3} className="mt-3 w-full border border-os-rule-paper bg-transparent p-3" placeholder="10.xxxx/example" /><button className="mt-3 min-h-10 border border-os-rule-paper px-4 text-sm" onClick={() => void previewDois()}>预览核对结果</button>
      {preview.length ? <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">DOI / 状态</th><th className="p-2">题名与作者</th><th className="p-2">原刊与日期</th></tr></thead><tbody>{preview.map((item) => <tr className="border-t border-os-rule-paper" key={item.input}><td className="p-2">{item.input}<br /><span className="text-os-muted-paper">{item.status}{item.error ? ` · ${item.error}` : ''}</span>{item.articleId ? <><br /><Link href={`/journals/manage/${journalId}/articles/${item.articleId}`}>打开论文</Link></> : null}</td><td className="p-2">{item.metadata?.title ?? '—'}<br /><span className="text-os-muted-paper">{item.metadata?.authors.join('，')}</span></td><td className="p-2">{item.metadata?.journalTitle ?? '—'}<br /><span className="text-os-muted-paper">{item.metadata?.publishedDate ?? '—'}</span></td></tr>)}</tbody></table>{preview.some((item) => item.status === 'ready') ? <button className="mt-3 min-h-10 bg-accent-primary-strong px-4 text-sm font-semibold text-os-black-0" onClick={() => void confirmImport()}>确认导入可用条目</button> : null}{preview.some((item) => item.status === 'failed') ? <button className="ml-2 mt-3 min-h-10 border border-os-rule-paper px-4 text-sm" onClick={() => { setDois(preview.filter((item) => item.status === 'failed').map((item) => item.input).join('\n')); setPreview([]); }}>只重试失败项</button> : null}</div> : null}
      <div className="mt-7 border-t border-os-rule-paper pt-5"><h3 className="text-lg font-normal">无 DOI 论文</h3><p className="text-sm text-os-muted-paper">刊名和 ISSN 自动使用当前期刊，用于服务端归属核对。</p><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm">原题名<input className={inputClass} value={manual.title} onChange={(event) => setManual({ ...manual, title: event.target.value })} /></label><label className="grid gap-1 text-sm">原作者（逗号分隔）<input className={inputClass} value={manual.authors} onChange={(event) => setManual({ ...manual, authors: event.target.value })} /></label><label className="grid gap-1 text-sm">原发表日期<input className={inputClass} placeholder="YYYY-MM-DD" value={manual.publishedDate} onChange={(event) => setManual({ ...manual, publishedDate: event.target.value })} /></label><label className="grid gap-1 text-sm">稳定原文地址<input type="url" className={inputClass} value={manual.originalUrl} onChange={(event) => setManual({ ...manual, originalUrl: event.target.value })} /></label></div><p className="text-sm">匹配期刊：{data.journal.nameEn || data.journal.nameZh} · ISSN {issns.join(' / ') || '待人工特殊审核'}</p><button className="border border-os-rule-paper px-3 py-2 text-sm" onClick={() => void addManual()}>加入待核对目录</button></div>
    </section> : null}

    <section><div className="flex justify-between"><h2 className="text-xl font-normal">{data.membership.role === 'reviewer' ? '分配给我的审核' : '论文与审核队列'}</h2><span className="text-sm text-os-muted-paper">{data.articles.length} 项</span></div>{!data.articles.length ? <p className="py-6 text-os-muted-paper">当前没有可处理论文。</p> : <div className="mt-3 divide-y divide-os-rule-paper">{data.articles.map((article) => <Link key={article.id} href={`/journals/manage/${journalId}/articles/${article.id}`} className="block py-4 no-underline"><p className="m-0 text-sm text-os-muted-paper">{article.reviewState} · {article.source.kind} · 修订 {article.revision}</p><h3 className="mt-1 text-lg font-normal text-os-ink">{article.metadata.title}</h3></Link>)}</div>}</section>

    {canEdit && data.articles.length ? <section className="border-t border-os-rule-paper pt-6"><h2 className="text-xl font-normal">批量生成 AI 标准包</h2><p className="text-sm text-os-muted-paper">最多选择 50 篇。预检不扣额度；确认后逐篇独立提交。</p><div className="divide-y divide-os-rule-paper">{data.articles.slice(0, 50).map((article) => <label className="flex items-start gap-3 py-3" key={article.id}><input type="checkbox" checked={batchSelection.includes(article.id)} onChange={(event) => setBatchSelection(event.target.checked ? [...batchSelection, article.id].slice(0, 50) : batchSelection.filter((id) => id !== article.id))} /><span><strong className="font-normal">{article.metadata.title}</strong>{batchResults[article.id] ? <small className="block text-os-muted-paper">{batchResults[article.id]}</small> : null}</span></label>)}</div>{batchSelection.length ? <div className="mt-3 border border-os-rule-paper p-4 text-sm"><p>可运行：{batchPlan.ready.length} · 需补来源或授权：{batchPlan.needsSource.length} · 已有作业：{batchPlan.active.length} · 额度不足：{batchPlan.insufficient.length}</p><p>可用额度：{availableCredits}；本次预计消耗：{batchPlan.ready.length}</p><button disabled={batchBusy || !batchPlan.ready.length} className="border border-os-rule-paper px-3 py-2 disabled:opacity-50" onClick={() => void submitBatch()}>确认并逐篇提交</button></div> : null}</section> : null}

    {canManage ? <section className="border-t border-os-rule-paper pt-6"><h2 className="text-xl font-normal">试用与专业服务</h2>{data.grants.map((grant) => <p className="text-sm text-os-muted-paper" key={grant.id}>额度剩余 {grant.remaining} / {grant.amount}，预占 {grant.reserved}，已用 {grant.consumed}，有效至 {grant.expiresAt ?? '—'}</p>)}<div className="grid gap-3 sm:grid-cols-3"><label className="grid gap-1 text-sm">年度篇数<input type="number" min={1} className={inputClass} value={service.annualVolume} onChange={(event) => setService({ ...service, annualVolume: Number(event.target.value) })} /></label><label className="grid gap-1 text-sm">语言<select className={inputClass} value={service.language} onChange={(event) => setService({ ...service, language: event.target.value })}><option value="zh">中文</option><option value="en">英文</option></select></label><label className="grid gap-1 text-sm">图卡规模<select className={inputClass} value={service.figureScale} onChange={(event) => setService({ ...service, figureScale: event.target.value })}><option value="standard">标准</option><option value="extended">扩展</option></select></label></div><label className="mt-3 grid gap-1 text-sm">备注<textarea className="border border-os-rule-paper bg-transparent p-3" value={service.notes} onChange={(event) => setService({ ...service, notes: event.target.value })} /></label><button className="mt-3 border border-os-rule-paper px-4 py-2 text-sm" onClick={() => void requestService()}>提交服务申请</button><div className="mt-4">{data.serviceRequests.map((request) => <p className="text-sm" key={request.id}>申请 {request.createdAt?.slice(0, 10)} · {request.status} · {request.annualVolume} 篇/年{request.reviewNotes ? ` · 平台回复：${request.reviewNotes}` : ''}</p>)}</div></section> : null}
    {canManage ? <JournalGovernance data={data} reload={load} /> : null}
    {canEdit ? <JournalFeedback journalId={journalId} editorial /> : null}
    {message ? <p role="status">{message}</p> : null}
  </div>;
}

function Metric({ label, value }: { label: string; value: number | null }) { return <div className="bg-paper-bg p-5"><p className="text-sm text-os-muted-paper">{label}</p><p className="text-3xl">{value ?? '—'}</p></div>; }

function JournalGovernance({ data, reload }: { data: JournalDashboard; reload: () => Promise<void> }) {
  const [members, setMembers] = React.useState<JournalMember[]>([]);
  const [email, setEmail] = React.useState('');
  const [description, setDescription] = React.useState(data.journal.description ?? '');
  const [newOwnerId, setNewOwnerId] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [message, setMessage] = React.useState('');
  const loadMembers = React.useCallback(() => listJournalMembers(data.journal.id).then((result) => setMembers(result.items)).catch((cause) => setMessage(cause instanceof Error ? cause.message : '无法加载成员')), [data.journal.id]);
  React.useEffect(() => { void loadMembers(); }, [loadMembers]);
  const owner = data.membership.role === 'owner';
  async function transfer() {
    if (!newOwnerId || !reason.trim()) { setMessage('请选择新负责人并填写转移原因。'); return; }
    const selected = members.find((member) => member.userId === newOwnerId);
    if (!window.confirm(`确认将负责人转移给 ${selected?.displayName || selected?.email}？期刊会立即进入重新核验状态。`)) return;
    try { await transferJournalOwner(data.journal.id, { newOwnerId, reason: reason.trim() }); setMessage('负责人已转移，期刊进入重新核验。'); await reload(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : '负责人转移失败'); }
  }
  return <section className="border-t border-os-rule-paper pt-6"><h2 className="text-xl font-normal">主页与成员</h2><label className="mt-3 grid gap-2 text-sm">期刊简介<textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} className="border border-os-rule-paper bg-transparent p-3" /></label><div className="mt-3 flex gap-2"><button className="border border-os-rule-paper px-3 py-2 text-sm" onClick={() => void updateJournalHomepage(data.journal.id, { revision: data.journal.revision ?? 0, description }).then(reload).catch((cause) => setMessage(cause instanceof Error ? cause.message : '主页保存失败'))}>保存主页</button>{shouldOfferHomepageActivation(data.journal) ? <button className="border border-os-rule-paper px-3 py-2 text-sm" onClick={() => void activateJournal(data.journal.id).then(reload).catch((cause) => setMessage(cause instanceof Error ? cause.message : '主页激活失败'))}>首次公开期刊主页</button> : null}</div>
    <div className="mt-7"><h3 className="text-lg font-normal">成员</h3><div className="flex gap-2"><input className={inputClass} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="已注册成员邮箱" /><button className="border border-os-rule-paper px-3 text-sm" onClick={() => void addJournalMember(data.journal.id, { email, role: 'editor' }).then(() => { setEmail(''); return loadMembers(); }).catch((cause) => setMessage(cause instanceof Error ? cause.message : '添加成员失败'))}>添加编辑</button></div>{members.map((member) => <div className="flex flex-wrap items-center gap-2 border-b border-os-rule-paper py-3" key={member.userId}><span className="min-w-48 text-sm">{member.displayName || member.email}</span><select value={member.role} disabled={member.role === 'owner'} onChange={(event) => void updateJournalMember(data.journal.id, member.userId, event.target.value as 'admin' | 'editor' | 'reviewer').then(loadMembers).catch((cause) => setMessage(cause instanceof Error ? cause.message : '角色更新失败'))} className="border border-os-rule-paper bg-transparent p-1 text-sm"><option value="admin">管理员</option><option value="editor">编辑</option><option value="reviewer">审稿人</option>{member.role === 'owner' ? <option value="owner">负责人</option> : null}</select>{member.role !== 'owner' ? <button className="text-sm text-os-vermilion-ink" onClick={() => void removeJournalMember(data.journal.id, member.userId).then(loadMembers).catch((cause) => setMessage(cause instanceof Error ? cause.message : '移除成员失败'))}>移除</button> : null}</div>)}</div>
    {owner ? <div className="mt-7 border border-os-vermilion-ink p-4"><h3 className="m-0 text-lg font-normal">转移负责人</h3><p className="text-sm">转移后当前负责人降为管理员，期刊进入重新核验；请确认新负责人身份与原因。</p><select aria-label="新负责人" className={inputClass} value={newOwnerId} onChange={(event) => setNewOwnerId(event.target.value)}><option value="">选择已加入成员</option>{members.filter((member) => member.role !== 'owner').map((member) => <option key={member.userId} value={member.userId}>{member.displayName || member.email}</option>)}</select><textarea className="mt-2 w-full border border-os-rule-paper bg-transparent p-3" placeholder="转移原因" value={reason} onChange={(event) => setReason(event.target.value)} /><button className="mt-2 border border-os-vermilion-ink px-3 py-2 text-sm" onClick={() => void transfer()}>确认转移并触发重新核验</button></div> : null}
    {message ? <p role="status">{message}</p> : null}
  </section>;
}
