'use client';

import Link from 'next/link';
import * as React from 'react';
import { ApiClientError } from '@/lib/api';
import { createJournalFeedback, listJournalFeedback, respondJournalFeedback, type JournalFeedbackItem } from '@/lib/journal-api';

const fieldClass = 'w-full border border-os-rule-paper bg-transparent p-3';
const statusLabels = { open: '待处理', resolved: '已处理', declined: '未采纳' };

export function JournalFeedback({ journalId, articleId, versionNo, returnTo, editorial = false }: {
  journalId: string; articleId?: string; versionNo?: number; returnTo?: string; editorial?: boolean;
}) {
  const [items, setItems] = React.useState<JournalFeedbackItem[]>([]);
  const [content, setContent] = React.useState('');
  const [replies, setReplies] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [needsLogin, setNeedsLogin] = React.useState(false);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const request = React.useRef<{ key: string; content: string } | null>(null);

  function failure(error: unknown) {
    setNeedsLogin(error instanceof ApiClientError && error.status === 401);
    setMessage(error instanceof ApiClientError && error.status === 401 ? '请登录后提交或查看反馈；已输入的内容仍保留。' : error instanceof Error ? error.message : '操作失败，请重试。');
  }

  async function load(next?: string) {
    setBusy(true);
    try {
      const result = await listJournalFeedback(journalId, next);
      setItems((current) => next ? [...current, ...result.items] : result.items);
      setCursor(result.nextCursor ?? null); setNeedsLogin(false);
      setMessage(result.items.length ? '' : '暂无反馈。');
    } catch (error) { failure(error); }
    finally { setBusy(false); }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!articleId || !versionNo || !content.trim() || busy) return;
    const normalized = content.trim();
    if (!request.current || request.current.content !== normalized) request.current = { key: crypto.randomUUID(), content: normalized };
    setBusy(true);
    try {
      const result = await createJournalFeedback(journalId, articleId, { versionNo, content: normalized, requestKey: request.current.key });
      setItems((current) => [result.feedback, ...current.filter((item) => item.id !== result.feedback.id)]);
      setContent(''); request.current = null; setNeedsLogin(false); setMessage('反馈已提交给编辑部，处理说明会显示在此处。');
    } catch (error) { failure(error); }
    finally { setBusy(false); }
  }

  async function respond(item: JournalFeedbackItem, status: 'resolved' | 'declined') {
    const response = replies[item.id]?.trim();
    if (!response) { setMessage('请填写处理说明或未采纳的原因。'); return; }
    setBusy(true);
    try {
      const result = await respondJournalFeedback(journalId, item.id, { expectedStatus: item.status, status, response });
      setItems((current) => current.map((old) => old.id === item.id ? result.feedback : old));
      setMessage('处理说明已保存；论文内容如需更正，仍须修订和复审。');
    } catch (error) { failure(error); }
    finally { setBusy(false); }
  }

  return <section className="mt-6 border-t border-os-rule-paper pt-6" aria-label={editorial ? '读者纠错反馈' : '反馈解读错误'}>
    <h2 className="text-xl font-normal">{editorial ? '读者纠错反馈' : '反馈解读错误'}</h2>
    <p className="text-sm text-os-muted-paper">反馈与处理说明仅供提交者和本刊编辑查看。反馈不会自动修改已发表内容。</p>
    {!editorial && articleId && versionNo ? <form onSubmit={(event) => void submit(event)} className="mt-4 grid gap-3">
      <label className="grid gap-2 text-sm">对解读 v{versionNo} 的反馈<textarea required maxLength={5000} rows={3} value={content} onChange={(event) => setContent(event.target.value)} className={fieldClass} placeholder="请指出具体表述、错误原因及可核对的原文位置。" /></label>
      <button disabled={busy || !content.trim()} className="min-h-10 justify-self-start border border-os-rule-paper px-4 text-sm disabled:opacity-50">提交纠错反馈</button>
    </form> : null}
    <button disabled={busy} className="mt-4 min-h-10 border border-os-rule-paper px-4 text-sm disabled:opacity-50" onClick={() => void load()}>{editorial ? '加载反馈工单' : '查看我的反馈与处理说明'}</button>
    {items.map((item) => <article className="mt-4 border border-os-rule-paper p-4" key={item.id}>
      <p className="text-sm text-os-muted-paper">解读 v{item.versionNo} · {statusLabels[item.status]} · {item.createdAt.slice(0, 10)}</p>
      {editorial ? <Link className="text-sm underline" href={`/journals/manage/${journalId}/articles/${item.articleId}`}>打开对应论文</Link> : null}
      <p className="whitespace-pre-wrap break-words">{item.content}</p>
      {item.response ? <p className="whitespace-pre-wrap break-words">编辑部处理说明：{item.response}</p> : null}
      {editorial && item.status === 'open' ? <div className="mt-3 grid gap-3">
        <label className="grid gap-2 text-sm">处理说明<textarea maxLength={5000} value={replies[item.id] ?? ''} onChange={(event) => setReplies((current) => ({ ...current, [item.id]: event.target.value }))} className={fieldClass} /></label>
        <div className="flex flex-wrap gap-3"><button disabled={busy} className="min-h-10 border border-os-rule-paper px-3 text-sm" onClick={() => void respond(item, 'resolved')}>标记已处理</button><button disabled={busy} className="min-h-10 border border-os-rule-paper px-3 text-sm" onClick={() => void respond(item, 'declined')}>记录未采纳原因</button></div>
      </div> : null}
    </article>)}
    {cursor ? <button disabled={busy} className="mt-3 underline" onClick={() => void load(cursor)}>更多反馈</button> : null}
    {message ? <p className="mt-3 text-sm" role="status">{message}</p> : null}
    {needsLogin ? <Link className="mt-2 inline-block underline" href={`/auth/login?returnTo=${encodeURIComponent(returnTo ?? `/journals/manage/${journalId}`)}`}>前往登录</Link> : null}
  </section>;
}
