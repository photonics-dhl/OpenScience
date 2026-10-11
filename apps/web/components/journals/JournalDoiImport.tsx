'use client';
import Link from 'next/link';
import * as React from 'react';
import { importJournalDois, previewJournalDois, type JournalImportPreview } from '@/lib/journal-api';
export function JournalDoiImport({ journalId, onImported }: { journalId: string; onImported: () => Promise<void> }) {
  const [text, setText] = React.useState(''); const [preview, setPreview] = React.useState<JournalImportPreview[]>([]);
  const [busy, setBusy] = React.useState(false); const [message, setMessage] = React.useState(''); const inFlight = React.useRef(false);
  async function run(confirm: boolean) {
    if (inFlight.current) return;
    const values = confirm ? preview.filter((item) => item.status === 'ready').map((item) => item.input) : [...new Set(text.split(/[\s,，]+/).map((value) => value.trim()).filter(Boolean))];
    if (!values.length || values.length > 50) { setMessage('请输入 1–50 个 DOI，每行一个。'); return; }
    inFlight.current = true; setBusy(true); setMessage('');
    try {
      if (!confirm) { const result = await previewJournalDois(journalId, values); setPreview(result.items); setMessage('请核对题名、作者、原刊和日期，再确认导入。'); }
      else {
        const result = await importJournalDois(journalId, values); const old = new Map(preview.map((item) => [item.input, item]));
        const final: JournalImportPreview[] = result.items.map((item) => ({ ...item, metadata: old.get(item.input)?.metadata }));
        const failed = final.filter((item) => item.status === 'failed'); setPreview(final); setText(failed.map((item) => item.input).join('\n'));
        setMessage(`已导入 ${final.filter((item) => item.status === 'imported').length} 篇；${failed.length} 条失败项可重试。未自动运行 AI 或发布解读。`); await onImported();
      }
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'DOI 导入失败，请重试。'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  const control = 'min-h-11 border border-os-rule-paper px-4 text-sm disabled:opacity-50';
  return <details className="border-y border-os-rule-paper py-5"><summary className="cursor-pointer text-lg">导入论文 DOI</summary><p className="mt-3 text-sm text-os-muted-paper">每行一个，最多 50 条。先核对本刊归属，导入后进入草稿流程，不会自动运行 AI 或发布解读。</p>
    <label className="sr-only" htmlFor="journal-dois">论文 DOI</label><textarea id="journal-dois" disabled={busy} value={text} rows={3} placeholder="10.xxxx/example" className="mt-3 w-full border border-os-rule-paper bg-transparent p-3" onChange={(event) => { setText(event.target.value); setPreview([]); }} />
    <div className="mt-3 flex flex-wrap gap-3"><button type="button" disabled={busy} className={control} onClick={() => void run(false)}>{busy ? '处理中…' : '预览核对结果'}</button>{preview.some((item) => item.status === 'ready') ? <button type="button" disabled={busy} className={control} onClick={() => void run(true)}>确认导入草稿</button> : null}</div>
    {preview.length ? <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">DOI / 状态</th><th className="p-2">题名与作者</th><th className="p-2">原刊与日期</th></tr></thead><tbody>{preview.map((item) => <tr key={item.input} className="border-t border-os-rule-paper"><td className="break-all p-2">{item.input}<br />{({ ready: '可导入', imported: '已导入', duplicate: '已存在', failed: '失败' })[item.status]}{item.error ? `：${item.error}` : ''}{item.articleId ? <><br /><Link href={`/journals/manage/${journalId}/articles/${item.articleId}`}>查看论文草稿</Link></> : null}</td><td className="p-2">{item.metadata?.title ?? '—'}<br />{item.metadata?.authors.join('，')}</td><td className="p-2">{item.metadata?.journalTitle ?? '—'}<br />{item.metadata?.publishedDate ?? '—'}</td></tr>)}</tbody></table></div> : null}
    {message ? <p className="mt-4 text-sm" role="status">{message}</p> : null}</details>;
}
