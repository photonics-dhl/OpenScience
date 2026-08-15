'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ApiClientError, confirmIngestionTask, getIngestionTask, type IngestionTaskDetail, type SdfCore } from '@/lib/api';

const fields: Array<keyof SdfCore> = ['problem', 'insight', 'method', 'results', 'limitations', 'reproducibility'];
const emptyCore = (): SdfCore => ({ schemaVersion: '0.1.0', problem: '', insight: '', method: '', results: '', limitations: '', reproducibility: '' });

export default function HermesReviewPage() {
  const params = useSearchParams();
  const taskId = params.get('task') ?? '';
  const [detail, setDetail] = useState<IngestionTaskDetail | null>(null);
  const [core, setCore] = useState<SdfCore>(emptyCore);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!taskId) return;
    getIngestionTask(taskId).then((value) => {
      setDetail(value);
      const proposed = (value.task.result as { core?: SdfCore } | null)?.core;
      if (proposed) setCore({ ...emptyCore(), ...proposed });
    }).catch((cause) => setError(cause instanceof Error ? cause.message : '无法加载 Hermes 建议'));
  }, [taskId]);

  const complete = useMemo(() => fields.every((field) => core[field].trim().length > 0), [core]);
  async function confirm() {
    if (!detail || !complete) return;
    setSaving(true); setError('');
    try { await confirmIngestionTask(taskId, { version: detail.version, core }); setSaved(true); setDetail({ ...detail, task: { ...detail.task, state: 'confirmed' } }); }
    catch (cause) { setError(cause instanceof ApiClientError ? cause.message : '确认失败，请刷新后重试'); }
    finally { setSaving(false); }
  }

  if (!taskId) return <main className="min-h-screen bg-workbench-bg p-8 text-workbench-text">缺少任务标识。</main>;
  return <main className="min-h-screen bg-workbench-bg px-4 py-8 text-workbench-text sm:px-8">
    <div className="mx-auto max-w-5xl">
      <Link href="/dashboard" className="text-sm text-accent-primary hover:underline">← 返回 Dashboard</Link>
      <header className="mt-8 max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-primary">Hermes / Evidence review</p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight">确认你的研究结构</h1>
        <p className="mt-3 text-sm leading-6 text-workbench-muted">Hermes 只提出建议，不替你写入。请逐项检查六个 SDF 字段；确认后会生成新的可追踪版本。</p>
      </header>
      {error && <p className="mt-6 rounded-control border border-red-300/30 bg-red-400/10 p-4 text-sm text-red-200" role="alert">{error}</p>}
      {!detail ? <p className="mt-10 text-sm text-workbench-muted">正在读取材料与建议…</p> : <>
        <section className="mt-8 grid gap-4 md:grid-cols-2">
          {fields.map((field) => <label key={field} className="rounded-card border border-white/10 bg-workbench-surface p-5"><span className="text-xs font-semibold uppercase tracking-[0.14em] text-workbench-muted">{field}</span><textarea value={core[field]} onChange={(event) => setCore({ ...core, [field]: event.target.value })} rows={5} className="mt-3 w-full resize-y rounded-control border border-white/10 bg-workbench-bg p-3 text-sm leading-6 text-workbench-text outline-none focus:border-accent-primary" /></label>)}
        </section>
        <footer className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-card border border-white/10 bg-workbench-surface p-5"><p className="text-sm text-workbench-muted">{saved ? '已确认并写入新版本。' : complete ? '六项内容已填写，可以确认。' : '请补齐所有字段后确认。'}</p><button type="button" disabled={!complete || saving || saved} onClick={confirm} className="rounded-control bg-accent-primary px-5 py-3 text-sm font-semibold text-os-black-0 disabled:cursor-not-allowed disabled:opacity-40">{saving ? '正在写入…' : saved ? '已确认' : '确认并创建版本'}</button></footer>
      </>}
    </div>
  </main>;
}
