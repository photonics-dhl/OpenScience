'use client';

import Link from 'next/link';
import * as React from 'react';
import { z } from 'zod';
import {
  assignJournalReviewer, cancelJournalJob, createAiDraft, getJournalArticle,
  getJournalDashboard, listJournalMembers, publishJournalArticle,
  restrictJournalArticle, reviewJournalArticle, updateJournalArticle,
  uploadJournalSourceFile, type JournalArticle, type JournalMember, type JournalRole,
  type JournalDraft,
} from '@/lib/journal-api';

const FILE_LIMIT = 50 * 1024 * 1024;
const FILE_TYPES = ['pdf', 'docx', 'txt', 'md'];
const coreLabels = { problem: '研究问题', insight: '核心洞见', method: '方法', results: '结果', limitations: '局限', reproducibility: '可复现性' } as const;
const stateOf = (job: JournalArticle['jobs'][number]) => job.state ?? job.status ?? 'unknown';

export function journalArticlePermissions(role: JournalRole) {
  return {
    edit: role !== 'reviewer',
    assign: role === 'owner' || role === 'admin',
    review: role === 'owner' || role === 'admin' || role === 'reviewer',
    publish: role === 'owner' || role === 'admin',
  };
}

function DraftDetails({ draft, readOnly, onChange }: { draft: JournalDraft; readOnly: boolean; onChange: (draft: JournalDraft) => void }) {
  const evidenceFields = (evidence: { quote: string; locator: string }, update: (next: { quote: string; locator: string }) => void) => <div className="grid gap-2 sm:grid-cols-2"><label className="grid gap-1 text-sm">原文证据<textarea readOnly={readOnly} value={evidence.quote} onChange={(event) => update({ ...evidence, quote: event.target.value })} className="border border-os-rule-paper bg-transparent p-2" /></label><label className="grid gap-1 text-sm">定位<textarea readOnly={readOnly} value={evidence.locator} onChange={(event) => update({ ...evidence, locator: event.target.value })} className="border border-os-rule-paper bg-transparent p-2" /></label></div>;
  return <>
    <label className="mt-3 grid gap-2 text-sm">摘要<textarea readOnly={readOnly} rows={4} value={draft.summary} onChange={(event) => onChange({ ...draft, summary: event.target.value })} className="border border-os-rule-paper bg-transparent p-3" /></label>
    <div className="mt-4 grid gap-3">{(Object.keys(coreLabels) as Array<keyof typeof coreLabels>).map((key) => <label className="grid gap-1 text-sm" key={key}>{coreLabels[key]}<textarea readOnly={readOnly} rows={2} value={draft.core[key] || ''} onChange={(event) => onChange({ ...draft, core: { ...draft.core, [key]: event.target.value } })} className="border border-os-rule-paper bg-transparent p-2" /></label>)}</div>
    <section className="mt-6"><h3 className="text-lg font-normal">主张与证据</h3>{draft.claims.map((claim, index) => <article className="mt-3 border border-os-rule-paper p-3" key={index}>{!readOnly ? <div className="mb-3 flex flex-wrap gap-3"><label className="text-sm">研究类别<select className="ml-2 border bg-transparent p-1" value={claim.kind} onChange={(event) => onChange({ ...draft, claims: draft.claims.map((item, itemIndex) => itemIndex === index ? { ...item, kind: event.target.value as JournalDraft['claims'][number]['kind'] } : item) })}><option value="experimental">实验</option><option value="simulation">模拟</option><option value="theoretical">理论</option><option value="review">综述</option><option value="other">其他</option></select></label><button className="text-sm underline" onClick={() => onChange({ ...draft, claims: draft.claims.filter((_, itemIndex) => itemIndex !== index) })}>移除主张</button></div> : null}<label className="grid gap-1 text-sm">主张<textarea readOnly={readOnly} value={claim.text} onChange={(event) => onChange({ ...draft, claims: draft.claims.map((item, itemIndex) => itemIndex === index ? { ...item, text: event.target.value } : item) })} className="border border-os-rule-paper bg-transparent p-2" /></label>{evidenceFields(claim.evidence, (evidence) => onChange({ ...draft, claims: draft.claims.map((item, itemIndex) => itemIndex === index ? { ...item, evidence } : item) }))}</article>)}{!readOnly ? <button className="mt-2 border border-os-rule-paper px-3 py-2 text-sm" onClick={() => onChange({ ...draft, claims: [...draft.claims, { text: '', kind: 'other', evidence: { quote: '', locator: '' } }] })}>添加主张</button> : null}</section>
    <section className="mt-6"><h3 className="text-lg font-normal">图卡</h3>{draft.figures.map((figure, index) => <article className="mt-3 border border-os-rule-paper p-3" key={index}>{!readOnly ? <button className="mb-3 text-sm underline" onClick={() => onChange({ ...draft, figures: draft.figures.filter((_, itemIndex) => itemIndex !== index) })}>移除图卡</button> : null}<div className="grid gap-2 sm:grid-cols-3"><label className="grid gap-1 text-sm">图号<input readOnly={readOnly} value={figure.label} onChange={(event) => onChange({ ...draft, figures: draft.figures.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) })} className="border border-os-rule-paper bg-transparent p-2" /></label><label className="grid gap-1 text-sm">用途<textarea readOnly={readOnly} value={figure.purpose} onChange={(event) => onChange({ ...draft, figures: draft.figures.map((item, itemIndex) => itemIndex === index ? { ...item, purpose: event.target.value } : item) })} className="border border-os-rule-paper bg-transparent p-2" /></label><label className="grid gap-1 text-sm">发现<textarea readOnly={readOnly} value={figure.finding} onChange={(event) => onChange({ ...draft, figures: draft.figures.map((item, itemIndex) => itemIndex === index ? { ...item, finding: event.target.value } : item) })} className="border border-os-rule-paper bg-transparent p-2" /></label></div>{evidenceFields(figure.evidence, (evidence) => onChange({ ...draft, figures: draft.figures.map((item, itemIndex) => itemIndex === index ? { ...item, evidence } : item) }))}</article>)}{!readOnly ? <button className="mt-2 border border-os-rule-paper px-3 py-2 text-sm" onClick={() => onChange({ ...draft, figures: [...draft.figures, { label: '', purpose: '', finding: '', evidence: { quote: '', locator: '' } }] })}>添加图卡</button> : null}</section>
    <section className="mt-6"><h3 className="text-lg font-normal">FAQ</h3>{draft.faq.map((faq, index) => <article className="mt-3 border border-os-rule-paper p-3" key={index}>{!readOnly ? <button className="mb-3 text-sm underline" onClick={() => onChange({ ...draft, faq: draft.faq.filter((_, itemIndex) => itemIndex !== index) })}>移除问答</button> : null}<label className="grid gap-1 text-sm">问题<input readOnly={readOnly} value={faq.question} onChange={(event) => onChange({ ...draft, faq: draft.faq.map((item, itemIndex) => itemIndex === index ? { ...item, question: event.target.value } : item) })} className="border border-os-rule-paper bg-transparent p-2" /></label><label className="grid gap-1 text-sm">回答<textarea readOnly={readOnly} value={faq.answer} onChange={(event) => onChange({ ...draft, faq: draft.faq.map((item, itemIndex) => itemIndex === index ? { ...item, answer: event.target.value } : item) })} className="border border-os-rule-paper bg-transparent p-2" /></label>{evidenceFields(faq.evidence, (evidence) => onChange({ ...draft, faq: draft.faq.map((item, itemIndex) => itemIndex === index ? { ...item, evidence } : item) }))}</article>)}{!readOnly && draft.faq.length < 5 ? <button className="mt-2 border border-os-rule-paper px-3 py-2 text-sm" onClick={() => onChange({ ...draft, faq: [...draft.faq, { question: '', answer: '', evidence: { quote: '', locator: '' } }] })}>添加 FAQ</button> : null}</section>
  </>;
}

const comparisonEvidence = z.object({ quote: z.string(), locator: z.string() });
const comparisonSchema = z.object({
  summary: z.string(), scope: z.enum(['abstract', 'fulltext']), language: z.enum(['zh', 'en']),
  core: z.object({ problem: z.string(), insight: z.string(), method: z.string(), results: z.string(), limitations: z.string(), reproducibility: z.string() }),
  claims: z.array(z.object({ text: z.string(), kind: z.enum(['experimental', 'simulation', 'theoretical', 'review', 'other']), evidence: comparisonEvidence })),
  figures: z.array(z.object({ label: z.string(), purpose: z.string(), finding: z.string(), evidence: comparisonEvidence })),
  faq: z.array(z.object({ question: z.string(), answer: z.string(), evidence: comparisonEvidence })),
});

export function JournalArticleWorkbench({ journalId, articleId }: { journalId: string; articleId: string }) {
  const [article, setArticle] = React.useState<JournalArticle | null>(null);
  const [role, setRole] = React.useState<JournalRole | null>(null);
  const [members, setMembers] = React.useState<JournalMember[]>([]);
  const [reviewerId, setReviewerId] = React.useState('');
  const [reviewNote, setReviewNote] = React.useState('');
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [dirty, setDirty] = React.useState(false);
  const dirtyRef = React.useRef(false);
  const savedArticle = React.useRef<JournalArticle | null>(null);
  const [remoteDraft, setRemoteDraft] = React.useState<JournalDraft | null>(null);
  function editArticle(value: JournalArticle) { dirtyRef.current = true; setDirty(true); setArticle(value); }

  const load = React.useCallback(async () => {
    try {
      const [articleResult, dashboard] = await Promise.all([getJournalArticle(journalId, articleId), getJournalDashboard(journalId)]);
      savedArticle.current = articleResult.article; dirtyRef.current = false; setDirty(false); setRemoteDraft(null); setArticle(articleResult.article);
      setRole(dashboard.membership.role);
      if (journalArticlePermissions(dashboard.membership.role).assign) {
        const result = await listJournalMembers(journalId);
        setMembers(result.items.filter((member) => ['owner', 'admin', 'reviewer'].includes(member.role)));
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : '无法加载论文'); }
  }, [articleId, journalId]);

  React.useEffect(() => { void load(); }, [load]);
  const parsing = article?.jobs.some((job) => job.kind === 'source_parse' && ['staging', 'pending', 'running'].includes(stateOf(job))) ?? false;
  const processing = article?.jobs.some((job) => ['staging', 'pending', 'running'].includes(stateOf(job))) ?? false;
  React.useEffect(() => {
    if (!processing) return;
    let active = true;
    const timer = window.setInterval(() => {
      void getJournalArticle(journalId, articleId).then(({ article: fresh }) => {
        if (!active) return;
        if (dirtyRef.current) {
          setArticle((current) => current ? { ...current, jobs: fresh.jobs } : current);
          if (fresh.revision !== savedArticle.current?.revision) {
            setRemoteDraft(fresh.draft); setMessage('服务器已有新修订。你的未保存修改仍保留，请比较后再加载最新修订。');
          }
        } else { savedArticle.current = fresh; setArticle(fresh); }
      }).catch((error) => { if (active) setMessage(error instanceof Error ? error.message : '无法更新作业状态'); });
    }, 2000);
    return () => { active = false; window.clearInterval(timer); };
  }, [articleId, journalId, processing]);
  if (!article || !role) return <p aria-live="polite">{message || '正在加载论文…'}</p>;
  const permissions = journalArticlePermissions(role);
  const comparison = article.jobs.find((job) => job.comparisonDraft)?.comparisonDraft;
  const parsedComparison = comparisonSchema.safeParse(comparison);
  const canGenerate = permissions.edit && article.source.kind !== 'metadata' && Boolean(article.source.text.trim()) && article.rights.internalProcessing && article.rights.derivativeGeneration && article.rights.externalProcessing && Boolean(article.rights.license.trim() && article.rights.evidence.trim()) && !processing;

  async function save() {
    if (!article) return null;
    setBusy(true);
    try {
      const result = await updateJournalArticle(journalId, articleId, {
        revision: article.revision, directoryVisible: article.directoryVisible,
        ...(JSON.stringify(article.metadata) !== JSON.stringify(savedArticle.current?.metadata) ? { metadata: article.metadata } : {}),
        ...(JSON.stringify(article.source) !== JSON.stringify(savedArticle.current?.source) ? { source: article.source } : {}),
        ...(JSON.stringify(article.rights) !== JSON.stringify(savedArticle.current?.rights) ? { rights: article.rights } : {}),
        ...(article.draft && JSON.stringify(article.draft) !== JSON.stringify(savedArticle.current?.draft) ? { draft: article.draft } : {}),
      });
      savedArticle.current = result.article; dirtyRef.current = false; setDirty(false); setRemoteDraft(null); setArticle(result.article);
      setMessage('已保存。来源或解读内容变更后，需要重新审核。');
      return result.article;
    } catch (error) { setMessage(error instanceof Error ? error.message : '保存失败'); return null; }
    finally { setBusy(false); }
  }

  async function upload() {
    if (!article || !file) { setMessage('请先选择 PDF、DOCX、TXT 或 Markdown 文件。'); return; }
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!FILE_TYPES.includes(extension) || file.size > FILE_LIMIT) { setMessage('支持 PDF、DOCX、TXT 和 Markdown，单文件上限 50 MB。'); return; }
    if (!article.rights.internalProcessing || !article.rights.evidence.trim()) { setMessage('上传前请勾选内部加工许可，并填写授权或核验依据。'); return; }
    setBusy(true);
    try {
      const saved = await updateJournalArticle(journalId, articleId, { revision: article.revision, rights: article.rights, directoryVisible: article.directoryVisible });
      await uploadJournalSourceFile(journalId, articleId, { revision: saved.article.revision, requestKey: crypto.randomUUID(), file });
      setFile(null);
      setMessage('来源文件已上传，正在免费解析。解析完成并出现来源文本后即可生成 AI 解读。');
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : '来源文件上传失败'); }
    finally { setBusy(false); }
  }

  async function createDraft(retryOf?: string) {
    if (!article || !window.confirm('本次生成将预占 1 篇额度，成功保存草稿后结算；失败自动释放。确认继续？')) return;
    setBusy(true);
    try {
      const saved = await save(); if (!saved) return; setBusy(true);
      await createAiDraft(journalId, articleId, { revision: saved.revision, language: 'zh', requestKey: crypto.randomUUID(), ...(retryOf ? { retryOf } : {}) });
      setMessage('当前来源与授权已保存，AI 解读任务已进入队列。'); await load();
    }
    catch (error) { setMessage(error instanceof Error ? error.message : '无法创建任务'); }
    finally { setBusy(false); }
  }

  async function review(decision: 'submit' | 'approve' | 'request_changes') {
    if (!article) return;
    setBusy(true);
    try { await reviewJournalArticle(journalId, articleId, { revision: article.revision, decision, note: reviewNote }); setReviewNote(''); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : '审核操作失败'); }
    finally { setBusy(false); }
  }

  async function assign() {
    if (!article || !reviewerId) { setMessage('请选择审稿人。'); return; }
    setBusy(true);
    try { const result = await assignJournalReviewer(journalId, articleId, { revision: article.revision, reviewerId }); setArticle({ ...article, ...result.article }); setMessage('已指派审稿人，并刷新当前修订。'); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : '无法指派审稿人'); }
    finally { setBusy(false); }
  }

  async function publish() {
    if (!article || dirty || !window.confirm('确认由人工审核后公开当前固定版本？公开后读者和工具可访问该版本。')) return;
    setBusy(true);
    try { const result = await publishJournalArticle(journalId, articleId, { revision: article.revision, requestKey: crypto.randomUUID() }); setMessage(`已发布固定版本 v${result.release.versionNo}。`); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : '发布失败'); }
    finally { setBusy(false); }
  }

  async function changeVisibility(state: 'restricted' | 'withdrawn') {
    if (dirty || busy) return;
    const reason = window.prompt(state === 'withdrawn' ? '请填写撤回原因；公开解读将不可访问，论文目录保留状态记录。' : '请填写限制公开的原因：');
    if (!reason?.trim()) return;
    setBusy(true);
    try { await restrictJournalArticle(journalId, articleId, { state, reason: reason.trim() }); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : '操作失败'); }
    finally { setBusy(false); }
  }

  async function cancel(jobId: string) {
    setBusy(true);
    try {
      await cancelJournalJob(journalId, jobId);
      const { article: fresh } = await getJournalArticle(journalId, articleId);
      if (dirtyRef.current) setArticle((current) => current ? { ...current, jobs: fresh.jobs } : current);
      else { savedArticle.current = fresh; setArticle(fresh); }
      setMessage('作业已取消，未保存的编辑内容仍保留。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '取消失败'); }
    finally { setBusy(false); }
  }

  return <article className="mx-auto max-w-4xl">
    <Link className="text-sm text-os-muted-paper" href={`/journals/manage/${journalId}`}>← 返回期刊工作台</Link>
    <header className="mt-6 border-b border-os-rule-paper pb-6">
      <p className="text-sm text-os-muted-paper">{article.source.kind} · {article.reviewState} · 修订 {article.revision} · {role}</p>
      <h1 className="mt-2 text-3xl font-normal">{article.metadata.title}</h1>
      <p className="text-os-muted-paper">原始 DOI：{article.metadata.doi || '暂无 DOI'} · {article.metadata.authors.join('，')}</p>
      <a className="text-sm underline" href={article.metadata.originalUrl}>查看原文</a>
    </header>

    <section className="mt-7">
      <h2 className="text-xl font-normal">来源与授权</h2>
      {permissions.edit ? <>
        <label className="mt-3 grid gap-2 text-sm">处理范围<select value={article.source.kind} onChange={(event) => editArticle({ ...article, source: { ...article.source, kind: event.target.value as JournalArticle['source']['kind'] } })} className="min-h-10 border border-os-rule-paper bg-transparent px-3"><option value="metadata">仅元数据</option><option value="abstract">摘要</option><option value="fulltext">完整正文</option></select></label>
        <label className="mt-3 grid gap-2 text-sm">来源文本<textarea rows={5} value={article.source.text} onChange={(event) => editArticle({ ...article, source: { ...article.source, text: event.target.value } })} className="border border-os-rule-paper bg-transparent p-3" /></label>
        <div className="mt-4 border border-os-rule-paper p-4"><label className="grid gap-2 text-sm">上传来源文件（PDF、DOCX、TXT、MD；不超过 50 MB）<input type="file" accept=".pdf,.docx,.txt,.md" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label><button disabled={busy || !file} className="mt-3 border border-os-rule-paper px-3 py-2 text-sm disabled:opacity-50" onClick={() => void upload()}>保存授权并上传解析</button>{parsing ? <p className="mt-2 text-sm" role="status">来源解析中；解析免费，不消耗 AI 生成额度。</p> : null}</div>
        <label className="mt-3 flex gap-2 text-sm"><input type="checkbox" checked={article.directoryVisible} onChange={(event) => editArticle({ ...article, directoryVisible: event.target.checked })} />在期刊目录中显示</label>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">{(['internalProcessing', 'derivativeGeneration', 'publicSource', 'publicDerivative', 'externalProcessing'] as const).map((key) => <label className="flex gap-2 text-sm" key={key}><input type="checkbox" checked={article.rights[key]} onChange={(event) => editArticle({ ...article, rights: { ...article.rights, [key]: event.target.checked } })} />{({ internalProcessing: '允许内部加工', derivativeGeneration: '允许生成衍生解读', publicSource: '允许公开来源文本', publicDerivative: '允许公开衍生解读', externalProcessing: '允许发送至外部 AI 服务' })[key]}</label>)}</div>
        <label className="mt-3 grid gap-2 text-sm">许可<input value={article.rights.license} onChange={(event) => editArticle({ ...article, rights: { ...article.rights, license: event.target.value } })} className="min-h-10 border border-os-rule-paper bg-transparent px-3" /></label>
        <label className="mt-3 grid gap-2 text-sm">授权或核验依据<textarea rows={3} value={article.rights.evidence} onChange={(event) => editArticle({ ...article, rights: { ...article.rights, evidence: event.target.value } })} className="border border-os-rule-paper bg-transparent p-3" /></label>
      </> : <div className="mt-3 border border-os-rule-paper p-4 text-sm"><p>只读来源：{article.source.label}</p><p className="whitespace-pre-wrap">{article.source.text}</p></div>}
    </section>

    <section className="mt-8 border-t border-os-rule-paper pt-6">
      <h2 className="text-xl font-normal">AI 解读与编辑审核</h2><p className="text-sm text-os-muted-paper">当前范围：{article.source.kind}。仅在解析得到来源文本后才能生成。</p>
      {article.draft ? <DraftDetails draft={article.draft} readOnly={!permissions.edit} onChange={(draft) => editArticle({ ...article, draft })} /> : permissions.edit ? <button disabled={!canGenerate || busy} className="mt-4 min-h-10 border border-os-rule-paper px-4 text-sm disabled:opacity-50" onClick={() => void createDraft()}>生成 AI 解读草稿</button> : <p className="mt-3 text-sm">尚无可审核草稿。</p>}
      {permissions.edit && article.draft ? <button disabled={!canGenerate || busy} className="mt-4 min-h-10 border border-os-rule-paper px-4 text-sm disabled:opacity-50" onClick={() => void createDraft()}>重新生成草稿（1 篇额度）</button> : null}
      {permissions.assign ? <div className="mt-6 flex flex-wrap items-end gap-2 border-t border-os-rule-paper pt-4"><label className="grid gap-1 text-sm">指派审稿人<select aria-label="指派审稿人" value={reviewerId} onChange={(event) => setReviewerId(event.target.value)} className="min-h-10 border border-os-rule-paper bg-transparent px-3"><option value="">请选择</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.displayName || member.email}（{member.role}）</option>)}</select></label><button disabled={busy || dirty || !reviewerId} className="min-h-10 border border-os-rule-paper px-4 text-sm disabled:opacity-50" onClick={() => void assign()}>确认指派</button></div> : null}
      {(permissions.edit || permissions.review) && article.draft ? <label className="mt-5 grid gap-2 text-sm">审核意见<textarea rows={3} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} className="border border-os-rule-paper bg-transparent p-3" /></label> : null}
<p className="mt-3 text-sm" role="status">{dirty ? '有未保存修改，请先保存再审核或发布。' : ''}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        {permissions.edit ? <><button disabled={busy} className="min-h-10 border border-os-rule-paper px-4 text-sm" onClick={() => void save()}>保存修订</button><button disabled={busy || dirty || !article.draft} className="min-h-10 border border-os-rule-paper px-4 text-sm disabled:opacity-50" onClick={() => void review('submit')}>提交审核</button></> : null}
        {permissions.review ? <><button disabled={busy || dirty || article.reviewState !== 'submitted'} className="min-h-10 border border-os-rule-paper px-4 text-sm disabled:opacity-50" onClick={() => void review('approve')}>批准当前修订</button><button disabled={busy || dirty || article.reviewState !== 'submitted'} className="min-h-10 border border-os-rule-paper px-4 text-sm disabled:opacity-50" onClick={() => void review('request_changes')}>要求修改</button></> : null}
        {permissions.publish ? <><button disabled={busy || dirty || article.reviewState !== 'approved'} className="min-h-10 bg-accent-primary-strong px-4 text-sm font-semibold text-os-black-0 disabled:opacity-50" onClick={() => void publish()}>人工确认并发布</button><button disabled={busy || dirty} className="min-h-10 border border-os-rule-paper px-4 text-sm disabled:opacity-50" onClick={() => void changeVisibility('restricted')}>限制公开</button><button disabled={busy || dirty} className="min-h-10 border border-os-rule-paper px-4 text-sm disabled:opacity-50" onClick={() => void changeVisibility('withdrawn')}>撤回解读</button></> : null}
      </div>
      {article.jobs.map((job) => <p className="mt-2 text-sm" key={job.id}>作业 {job.kind ?? job.id}: {stateOf(job)} {permissions.edit && ['staging', 'pending', 'running'].includes(stateOf(job)) ? <button disabled={busy} className="ml-2 underline disabled:opacity-50" onClick={() => void cancel(job.id)}>取消</button> : null}{permissions.edit && job.kind === 'generate' && ['failed', 'cancelled'].includes(stateOf(job)) ? <button disabled={busy || dirty || !canGenerate} className="ml-3 underline disabled:opacity-50" onClick={() => void createDraft(job.id)}>重试此作业</button> : null}</p>)}
      {permissions.edit && comparison ? <details className="mt-5 border border-os-rule-paper p-4"><summary>查看未覆盖当前修订的生成结果</summary><p className="text-sm text-os-muted-paper">结果未写入当前草稿。采用前请核对来源；格式不完整时可复制有效段落手动合并。</p><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(comparison, null, 2)}</pre>{parsedComparison.success ? <button className="mt-3 border border-os-rule-paper px-3 py-2 text-sm" onClick={() => editArticle({ ...article, draft: parsedComparison.data })}>采用为待保存草稿</button> : null}</details> : null}
    </section>
    {remoteDraft ? <details className="mt-5 border border-os-rule-paper p-4"><summary>比较服务器的新草稿</summary><DraftDetails draft={remoteDraft} readOnly onChange={() => undefined} /><button className="mt-3 border px-3 py-2" onClick={() => { if (window.confirm('加载最新修订将放弃当前未保存修改，请先复制保留需要的内容。确认继续？')) void load(); }}>加载最新修订</button></details> : null}
    {message ? <p className="mt-5" role="status">{message}</p> : null}
  </article>;
}
