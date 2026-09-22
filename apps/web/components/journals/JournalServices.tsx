'use client';

import Link from 'next/link';
import * as React from 'react';
import { getJournalDashboard, getJournalServicePlan, requestJournalService, type JournalServicePlan } from '@/lib/journal-api';

const plans: Array<[JournalServicePlan['planChoice'], string, string]> = [
  ['free', 'Free', '基础主页、目录和入驻试用。'],
  ['starter', 'Starter', '单刊加工服务方案。'],
  ['pro', 'Pro', '历史论文整理与协作审核。'],
  ['premium', 'Premium', '重点期刊深度服务。'],
  ['custom', 'Custom', '出版社、学会及定制服务。'],
];
const planName = (key: string) => plans.find((plan) => plan[0] === key)?.[1] ?? key;
const ledgerNames: Record<string, string> = { grant: '发放', reserve: '预占', consume: '消耗', release: '释放', expire: '到期', adjust: '调整' };
const requestNames: Record<string, string> = { submitted: '待处理', quoted: '已报价', approved: '已开通', rejected: '未通过', cancelled: '已取消' };
const fieldClass = 'min-h-10 border border-os-rule-paper bg-transparent p-2';
const dateLabel = (value: string | null) => value ? new Date(value).toLocaleString('zh-CN') : '未设置';

export function JournalServices({ journalId }: { journalId: string }) {
  const [data, setData] = React.useState<JournalServicePlan | null>(null);
  const [canRequest, setCanRequest] = React.useState(false);
  const [choice, setChoice] = React.useState<JournalServicePlan['planChoice']>('starter');
  const [volume, setVolume] = React.useState(1);
  const [notes, setNotes] = React.useState('');
  const [error, setError] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const inFlight = React.useRef(false);
  const requestKey = React.useRef(crypto.randomUUID());
  const load = React.useCallback(async () => {
    try {
      const [plan, dashboard] = await Promise.all([getJournalServicePlan(journalId), getJournalDashboard(journalId)]);
      setData(plan);
      setChoice(plan.requestedPlanChoice ?? plan.planChoice);
      setCanRequest(['owner', 'admin'].includes(dashboard.membership.role));
      setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '无法加载服务与额度。'); }
  }, [journalId]);
  React.useEffect(() => { void load(); }, [load]);
  async function submit() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try {
      await requestJournalService(journalId, { annualVolume: volume, language: 'zh', figureScale: 'standard', services: ['期刊服务方案'], notes, requestKey: requestKey.current, planChoice: choice });
      requestKey.current = crypto.randomUUID();
      setMessage('服务申请已提交，平台会提供人工报价与开通说明。');
      await load();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : '提交服务申请失败。表单内容已保留，可重试。'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  if (error) return <section role="alert"><p>{error}</p><button onClick={() => void load()}>重试加载服务与额度</button></section>;
  if (!data) return <p aria-live="polite">正在加载服务与额度…</p>;
  return <div className="grid min-w-0 gap-6">
    <header className="border-b border-os-rule-paper pb-5">
      <Link href={`/journals/manage/${journalId}`}>← 返回期刊工作台</Link>
      <h1 className="mt-5 text-3xl font-normal">服务包与额度</h1>
      <p>最近开通方案：{planName(data.planChoice)}。额度有效期以各批次为准。</p>
      {data.requestedPlanChoice ? <p>待人工处理方案：{planName(data.requestedPlanChoice)}，尚未开通。</p> : null}
      <p className="text-sm text-os-muted-paper">服务按人工报价开通，不自动扣款或续费。人工编辑、审核和发布固定版本不消耗 AI 草稿额度。</p>
    </header>
    <section className="grid gap-2 sm:grid-cols-5" aria-label="额度概览">
      <Metric label="可用 AI 草稿额度" value={data.credits.available} />
      <Metric label="已预占" value={data.credits.reserved} />
      <Metric label="已消耗" value={data.credits.consumed} />
      <Metric label="已到期" value={data.credits.expired} />
      <Metric label="本月已用（UTC）" value={data.credits.monthlyUsed} />
    </section>
    <section className="min-w-0" aria-labelledby="credit-batches">
      <h2 id="credit-batches" className="text-xl font-normal">额度、到期与存储</h2>
      <p>材料存储：{bytes(data.storage.usedBytes)} / {bytes(data.storage.limitBytes)}</p>
      {data.grants.length ? <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr><th className="p-2">发放</th><th className="p-2">可用</th><th className="p-2">预占</th><th className="p-2">已用</th><th className="p-2">到期时间</th></tr></thead>
          <tbody>{data.grants.map((grant) => <tr key={grant.id} className="border-t border-os-rule-paper">
            <td className="p-2">{grant.amount}</td>
            <td className="p-2">{grant.expiresAt && new Date(grant.expiresAt).getTime() > Date.now() ? Math.max(0, grant.remaining - grant.reserved) : 0}</td>
            <td className="p-2">{grant.reserved}</td><td className="p-2">{grant.consumed}</td>
            <td className="p-2">{dateLabel(grant.expiresAt)}</td>
          </tr>)}</tbody>
        </table>
      </div> : <p>暂无额度批次。</p>}
      <p className="text-sm text-os-muted-paper">预占在作业完成前不计为可用；失败或取消会释放，过期额度不会恢复可用。</p>
      <h3 className="mt-4 text-lg">最近额度记录</h3>
      {data.ledger.length ? <ul className="grid gap-2 text-sm">{data.ledger.map((entry) => <li key={entry.id}>{dateLabel(entry.createdAt)} · {ledgerNames[entry.kind] ?? entry.kind} · {entry.amount}{entry.note ? ` · ${entry.note}` : ''}</li>)}</ul> : <p>暂无额度账本记录。</p>}
    </section>
    <section aria-labelledby="service-request-heading">
      <h2 id="service-request-heading" className="text-xl font-normal">申请服务方案</h2>
      {canRequest ? <>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">{plans.map(([key, name, description]) => <label className="border border-os-rule-paper p-3" key={key}>
          <input type="radio" name="plan" checked={choice === key} onChange={() => setChoice(key)} className="mr-2" />{name}<span className="mt-2 block text-sm">{description}</span>
        </label>)}</div>
        <label className="mt-3 grid gap-1">预计年发文量<input className={fieldClass} type="number" min={1} max={1000000} value={volume} onChange={(event) => setVolume(Math.max(1, Number(event.target.value) || 1))} /></label>
        <label className="mt-3 grid gap-1">需求说明<textarea className={fieldClass} rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        <button disabled={busy} className="mt-3 border border-os-rule-paper px-3 py-2 disabled:opacity-50" onClick={() => void submit()}>提交服务申请</button>
      </> : <p>编辑可查看当前可用额度；服务方案由负责人或管理员提交申请。</p>}
      {data.serviceRequests.length ? <div className="mt-5"><h3 className="text-lg">服务申请记录</h3>{data.serviceRequests.map((request) => <p key={request.id}>{dateLabel(request.createdAt)} · {planName(request.planChoice ?? 'custom')} · {requestNames[request.status] ?? request.status}{request.reviewNotes ? ` · ${request.reviewNotes}` : ''}</p>)}</div> : null}
    </section>
    {message ? <p role="status">{message}</p> : null}
  </div>;
}
function Metric({ label, value }: { label: string; value: number }) { return <div className="border border-os-rule-paper p-3"><p className="text-sm">{label}</p><p className="text-2xl">{value}</p></div>; }
function bytes(value: string) { const count = Number(value); return count < 1048576 ? `${Math.round(count / 1024)} KB` : `${(count / 1048576).toFixed(1)} MB`; }
