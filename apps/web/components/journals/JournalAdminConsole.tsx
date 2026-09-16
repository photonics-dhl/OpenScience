'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { journalDisplayName } from '@openscience/domain/journal-form-contract';
import { apiRequest, ApiClientError } from '@/lib/api';
import { useSession } from '@/components/auth/SessionProvider';
import { JournalApplicationReviewCard } from './JournalApplicationReviewCard';
import {
  grantJournalCredits, listAdminJournals, listAdminServiceRequests,
  reviewAdminServiceRequest, setAdminJournalState,
  type JournalApplication, type JournalServiceRequest, type JournalSummary,
} from '@/lib/journal-api';

export function JournalAdminConsole() {
  const adminT = useTranslations('journalAdmin');
  const { status, user, refresh } = useSession();
  const administrator = status === 'authenticated' && user?.platformRole === 'platform_admin';
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');
  const [sessionExpired, setSessionExpired] = React.useState(false);
  const [applications, setApplications] = React.useState<JournalApplication[]>([]);
  const [journals, setJournals] = React.useState<JournalSummary[]>([]);
  const [requests, setRequests] = React.useState<JournalServiceRequest[]>([]);
  const [grants, setGrants] = React.useState<Record<string, { amount: number; expiresAt: string; reason: string }>>({});
  const [serviceNotes, setServiceNotes] = React.useState<Record<string, string>>({});
  const [message, setMessage] = React.useState('');
  const loadGeneration = React.useRef(0);

  const load = React.useCallback(async (keepContent = false) => {
    const generation = ++loadGeneration.current;
    if (!keepContent) setLoading(true);
    setLoadError(''); setSessionExpired(false);
    try {
      const [applicationResult, journalResult, requestResult] = await Promise.all([
        apiRequest<{ items: JournalApplication[] }>('/api/admin/journals/applications'), listAdminJournals(), listAdminServiceRequests(),
      ]);
      if (generation !== loadGeneration.current) return;
      setApplications(applicationResult.items); setJournals(journalResult.items); setRequests(requestResult.items);
    } catch (error) {
      if (generation !== loadGeneration.current) return;
      setSessionExpired(error instanceof ApiClientError && error.status === 401);
      if (error instanceof ApiClientError && error.status === 403) setLoadError(adminT('forbidden'));
      else if (keepContent) setMessage(adminT('refreshFailed'));
      else setLoadError(adminT('loadFailed'));
    } finally { if (generation === loadGeneration.current) setLoading(false); }
  }, [adminT]);
  React.useEffect(() => {
    if (administrator) void load();
    return () => { loadGeneration.current += 1; };
  }, [administrator, user?.userId, load]);

  async function reviewed(application: JournalApplication) {
    setApplications((items) => items.map((item) => item.id === application.id ? application : item));
    await load(true);
  }

  async function grant(request: JournalServiceRequest & { journalId?: string }) {
    const journalId = request.journalId;
    const value = grants[request.id];
    if (!journalId || !value?.amount || !value.expiresAt || !value.reason.trim()) { setMessage('请完整填写额度、到期日和开通依据。'); return; }
    try { await grantJournalCredits(journalId, { amount: value.amount, expiresAt: new Date(`${value.expiresAt}T23:59:59Z`).toISOString(), reason: value.reason.trim(), requestKey: crypto.randomUUID(), serviceRequestId: request.id }); setMessage('额度已追加到账本并关联服务申请。'); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : '额度开通失败'); }
  }

  async function reviewService(request: JournalServiceRequest, status: 'quoted' | 'rejected' | 'cancelled') {
    const note = serviceNotes[request.id]?.trim();
    if (!note) { setMessage('服务审核必须填写对编辑部可见的说明。'); return; }
    try { await reviewAdminServiceRequest(request.id, { status, expectedStatus: request.status, note }); setMessage('服务申请状态已更新。'); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : '服务审核失败'); }
  }

  if (status === 'loading') return <p className="mt-8" role="status">{adminT('loading')}</p>;
  if (status === 'unavailable') return <div className="mt-8" role="alert"><p>{adminT('loadFailed')}</p><button className="min-h-11 border border-os-rule-paper px-4" onClick={() => void refresh(true)}>{adminT('retry')}</button></div>;
  if (status === 'anonymous' || sessionExpired) return <div className="mt-8"><p role="alert">{adminT('loginRequired')}</p><Link href="/auth/login?returnTo=%2Fadmin%2Fjournals" className="inline-flex min-h-11 items-center border border-os-rule-paper px-4">{adminT('login')}</Link></div>;
  if (!administrator) return <p className="mt-8" role="alert">{adminT('forbidden')}</p>;
  if (loading) return <p className="mt-8" role="status">{adminT('loading')}</p>;
  if (loadError) return <div className="mt-8" role="alert"><p>{loadError}</p><button className="min-h-11 border border-os-rule-paper px-4" onClick={() => void load()}>{adminT('retry')}</button></div>;

  return <>
    {!applications.length ? <p className="mt-8 text-os-muted-paper">{adminT('noApplications')}</p> : null}
    {message ? <p role="status" className="mt-4">{message}</p> : null}
    <section className="mt-8"><h2 className="text-xl font-normal">{adminT("applications")}</h2>{applications.map((application) => <JournalApplicationReviewCard key={application.id} application={application} onReviewed={reviewed} onRefresh={() => load(true)} />)}</section>
    <section className="mt-8 border-t border-os-rule-paper pt-6"><h2 className="text-xl font-normal">服务申请与额度开通</h2>{requests.map((request) => { const value = grants[request.id] ?? { amount: 5, expiresAt: '', reason: '' }; return <article className="border-b border-os-rule-paper py-5" key={request.id}><p className="text-sm text-os-muted-paper">状态：{request.status} · {request.annualVolume} 篇/年 · {request.language} · {request.figureScale}</p><p>{request.services.join('、')}</p>{request.notes ? <p className="text-sm">申请说明：{request.notes}</p> : null}{request.reviewNotes ? <p className="text-sm">审核回复：{request.reviewNotes}</p> : null}<label className="grid gap-1 text-sm">审核说明<textarea className="border border-os-rule-paper bg-transparent p-2" value={serviceNotes[request.id] ?? ''} onChange={(event) => setServiceNotes({ ...serviceNotes, [request.id]: event.target.value })} /></label><div className="mt-2 flex gap-2"><button className="border border-os-rule-paper px-3 py-2 text-sm" onClick={() => void reviewService(request, 'quoted')}>发送方案</button><button className="border border-os-rule-paper px-3 py-2 text-sm" onClick={() => void reviewService(request, 'rejected')}>拒绝</button><button className="border border-os-rule-paper px-3 py-2 text-sm" onClick={() => void reviewService(request, 'cancelled')}>取消</button></div><div className="mt-4 grid gap-2 sm:grid-cols-3"><label className="grid gap-1 text-sm">开通额度<input type="number" className="min-h-10 border border-os-rule-paper bg-transparent px-3" value={value.amount} onChange={(event) => setGrants({ ...grants, [request.id]: { ...value, amount: Number(event.target.value) } })} /></label><label className="grid gap-1 text-sm">到期日<input type="date" className="min-h-10 border border-os-rule-paper bg-transparent px-3" value={value.expiresAt} onChange={(event) => setGrants({ ...grants, [request.id]: { ...value, expiresAt: event.target.value } })} /></label><label className="grid gap-1 text-sm">订单或补偿依据<input className="min-h-10 border border-os-rule-paper bg-transparent px-3" value={value.reason} onChange={(event) => setGrants({ ...grants, [request.id]: { ...value, reason: event.target.value } })} /></label></div><button disabled={!['submitted', 'quoted'].includes(request.status)} className="mt-3 border border-os-rule-paper px-3 py-2 text-sm disabled:opacity-50" onClick={() => void grant(request)}>确认开通额度</button></article>; })}</section>
    <section className="mt-8 border-t border-os-rule-paper pt-6"><h2 className="text-xl font-normal">期刊运营状态</h2>{journals.map((journal) => <div className="flex flex-wrap items-center justify-between gap-3 border-b border-os-rule-paper py-4" key={journal.id}><div><h3 className="m-0 text-lg font-normal">{journalDisplayName(journal)}</h3><p className="m-0 text-sm text-os-muted-paper">{journal.status}</p></div><div className="flex gap-2"><button className="border border-os-rule-paper px-3 py-2 text-sm" onClick={() => void setAdminJournalState(journal.id, { action: journal.status === 'paused' ? 'resume' : 'pause', reason: '平台运营处理' }).then(() => load())}>{journal.status === 'paused' ? '恢复' : '暂停'}</button><button className="border border-os-rule-paper px-3 py-2 text-sm" onClick={() => void setAdminJournalState(journal.id, { action: 'reverify', reason: '定期核验' }).then(() => load())}>重新核验</button></div></div>)}</section>

  </>;
}
