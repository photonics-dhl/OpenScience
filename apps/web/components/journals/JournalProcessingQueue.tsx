'use client';

import Link from 'next/link';
import * as React from 'react';
import { createJournalProcessingJob, listJournalProcessingPriorities, updateJournalPriorityOverride, type JournalProcessingPriorityItem, type JournalRecommendedAction } from '@/lib/journal-api';

const actions: Record<JournalRecommendedAction, string> = { process_now: '建议优先加工', process_after_confirmation: '编辑确认后加工', request_more_sources: '建议补充来源', rights_review_required: '先核验授权', metadata_only: '当前仅展示书目', blocked: '当前不可加工' };
const dimensions: Record<string, string> = { recency: '发表时间', academicCentrality: '学术中心性', showcaseValue: '展示价值', topicMatch: '主题匹配' };
const buttonClass = 'border border-os-rule-paper px-3 py-2 disabled:opacity-50';

export function JournalProcessingQueue({ journalId }: { journalId: string }) {
  const [items, setItems] = React.useState<JournalProcessingPriorityItem[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState('');
  const [loadError, setLoadError] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const inFlight = React.useRef(false);
  const requestKeys = React.useRef(new Map<string, string>());
  const load = React.useCallback(async (next?: string) => {
    setLoading(true); setLoadError('');
    try {
      const result = await listJournalProcessingPriorities(journalId, { cursor: next, limit: 20 });
      setItems((current) => next ? [...current, ...result.items.filter((row) => !current.some((old) => old.article.id === row.article.id))] : result.items);
      setCursor(result.nextCursor);
    } catch (cause) { setLoadError(cause instanceof Error ? cause.message : '无法加载加工优先级。'); }
    finally { setLoading(false); }
  }, [journalId]);
  React.useEffect(() => { void load(); }, [load]);
  async function update(row: JournalProcessingPriorityItem, score: number, deferredUntil: string | null) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage('');
    try {
      await updateJournalPriorityOverride(journalId, row.article.id, { editorPriorityScore: score, deferredUntil, reason: deferredUntil ? '编辑延后处理' : '编辑更新加工优先级' });
      await load();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : '更新优先级失败。'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function enqueue(row: JournalProcessingPriorityItem) {
    if (inFlight.current || !window.confirm(`确认将“${row.article.title}”加入 AI 加工队列？预计消耗 ${row.priority.estimatedCreditCost} 个 AI 草稿额度。`)) return;
    inFlight.current = true; setBusy(true); setMessage('');
    const key = `${row.article.id}:${row.article.revision}`;
    const requestKey = requestKeys.current.get(key) ?? crypto.randomUUID();
    requestKeys.current.set(key, requestKey);
    try {
      await createJournalProcessingJob(journalId, row.article.id, { revision: row.article.revision, language: 'zh', requestKey, manualConfirmation: true });
      requestKeys.current.delete(key);
      await load(); setMessage('已提交加工队列。额度以服务端账本为准。');
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : '无法加入加工队列。'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <div className="grid min-w-0 gap-6">
    <header className="border-b border-os-rule-paper pb-5">
      <Link className="text-sm" href={`/journals/manage/${journalId}`}>← 返回期刊工作台</Link>
      <h1 className="mt-5 text-3xl font-normal">加工优先级</h1>
      <p>评分用于安排加工顺序；不代表论文质量或引用潜力。提交作业会预占额度，并再次核验来源与授权。</p>
      <Link className="mt-2 inline-block underline" href={`/journals/manage/${journalId}/services`}>查看服务与可用额度</Link>
    </header>
    {loading ? <p aria-live="polite">正在加载加工优先级…</p> : !items.length && !loadError ? <p>暂无论文。可先在期刊工作台导入或录入论文。</p> : null}
    {loadError ? <div role="alert"><p>{loadError}</p><button className={buttonClass} disabled={loading || busy} onClick={() => void load()}>重试加载</button></div> : null}
    {items.map(({ article, priority }) => {
      const row = { article, priority };
      const deferred = priority.deferredUntil && new Date(priority.deferredUntil).getTime() > Date.now() ? priority.deferredUntil : null;
      const disabled = busy || loading;
      return <article className="min-w-0 border border-os-rule-paper p-4" key={article.id}>
        <p>{priority.priorityLevel === 'blocked' ? '受阻' : priority.priorityLevel} · {priority.totalScore}/100 · {actions[priority.recommendedAction]}</p>
        <Link className="break-words text-xl" href={`/journals/manage/${journalId}/articles/${article.id}`}>{article.title}</Link>
        <p className="mt-2 text-sm">预计消耗 {priority.estimatedCreditCost} 个 AI 草稿额度{deferred ? ` · 延后至 ${new Date(deferred).toLocaleString('zh-CN')}` : ''}</p>
        {priority.reasons.length ? <ul className="my-2 grid gap-1 text-sm">{priority.reasons.map((reason, index) => <li className="break-words" key={index}>{reason}</li>)}</ul> : null}
        <details className="my-3 text-sm"><summary>评分依据与缺失信息</summary>
          <p>来源完整度 {priority.sourceCompletenessScore} · 授权清晰度 {priority.rightsClarityScore} · 发表时间 {priority.recencyScore} · 解析状态 {priority.parseSuccessScore} · 编辑权重 {priority.editorPriorityScore} · 主题匹配 {priority.topicMatchScore} · 学术中心性 {priority.academicCentralityScore} · 展示价值 {priority.showcaseValueScore}</p>
          {priority.unknownDimensions.length ? <p>尚无可靠数据：{priority.unknownDimensions.map((name) => dimensions[name] ?? name).join('、')}。缺失项不推测补分。</p> : null}
        </details>
        <Link className="text-sm underline" href={`/journals/manage/${journalId}/articles/${article.id}/sources`}>检查来源与版权矩阵</Link>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className={buttonClass} disabled={disabled} onClick={() => void update(row, priority.editorPriorityScore > 0 ? 0 : 10, deferred)}>{priority.editorPriorityScore > 0 ? '取消重点' : '标记重点'}</button>
          <button className={buttonClass} disabled={disabled} onClick={() => void update(row, priority.editorPriorityScore, deferred ? null : new Date(Date.now() + 604800000).toISOString())}>{deferred ? '恢复处理' : '延后 7 天'}</button>
          <button className={buttonClass} disabled={disabled || priority.priorityLevel === 'blocked' || !!deferred} onClick={() => void enqueue(row)}>确认并入队</button>
        </div>
      </article>;
    })}
    {cursor ? <button className={buttonClass} disabled={loading || busy} onClick={() => void load(cursor)}>加载更多论文</button> : null}
    {message ? <div role="status"><p>{message}</p><button className={buttonClass} disabled={loading || busy} onClick={() => { setMessage(''); void load(); }}>刷新列表</button></div> : null}
  </div>;
}
