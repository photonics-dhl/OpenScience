'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { ApiClientError } from '@/lib/api';
import { listMyJournals, type JournalSummary } from '@/lib/journal-api';
import { DashboardShell } from '@/components/shell/DashboardShell';

export default function MyJournalsPage() {
  const router = useRouter();
  const [items, setItems] = React.useState<JournalSummary[]>([]);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const load = React.useCallback(async () => {
    setLoading(true); setError('');
    try { setItems((await listMyJournals()).items); }
    catch (cause) {
      if (cause instanceof ApiClientError && cause.status === 401) router.replace('/auth/login?returnTo=%2Fjournals%2Fmanage');
      else setError(cause instanceof Error ? cause.message : '无法加载我的期刊');
    } finally { setLoading(false); }
  }, [router]);
  React.useEffect(() => { void load(); }, [load]);

  return <DashboardShell mainClassName="craft-journal craft-journal-manage" activeRoute="dashboard" skipLabel="跳到内容" navigationLabel="我的期刊">
    <header className="journal-work-heading">
      <h1>我的期刊</h1>
      <p className="text-os-muted-paper">选择期刊，继续目录维护与编辑工作。</p>
    </header>
    {loading ? <p className="mt-8" role="status">正在加载我的期刊…</p> : null}
    {error ? <div className="mt-6" role="alert"><p>{error}</p><button type="button" className="border border-os-rule-paper px-4" disabled={loading} onClick={() => void load()}>重试加载</button></div> : null}
    {!loading && !error && !items.length ? <p className="mt-8 text-os-muted-paper">尚未加入期刊。<Link className="journal-back-link" href="/journals/apply">申请期刊入驻</Link></p> : null}
    {items.length ? <ul className="journal-managed-list" aria-busy={loading}>{items.map((item) => <li key={item.id}>
      <Link href={'/journals/manage/' + item.id}>
        <div><h2>{item.nameEn || item.nameZh}</h2><p className="text-os-muted-paper">{item.subjects.join(' · ')}</p></div>
        <span className="journal-list-action">编辑工作台 →</span>
      </Link>
    </li>)}</ul> : null}
  </DashboardShell>;
}
