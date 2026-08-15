'use client';

import { Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { ResearchSurfaceShell, SurfaceState } from '@/components/research/ResearchSurfaceShell';
import VisualizationResult from '@/components/sandbox/VisualizationResult';
import { ApiClientError, createSandboxJob, getResearchObject, type ResearchObjectSummary } from '@/lib/api';

const starter = `import numpy as np\nimport matplotlib.pyplot as plt\n\nx = np.linspace(-4, 4, 240)\ny = np.exp(-x**2) * np.cos(8*x)\nplt.plot(x, y, color='#ff4e22')\nplt.xlabel('delay')\nplt.ylabel('signal')\nplt.tight_layout()\nplt.savefig('/output/result.png', dpi=160)`;

export default function SandboxPage({ params }: { params: { id: string } }) {
  const t = useTranslations('productSurfaces');
  const [object, setObject] = useState<ResearchObjectSummary | null>(null);
  const [script, setScript] = useState(starter);
  const [jobId, setJobId] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<ApiClientError | Error | null>(null);
  useEffect(() => { void getResearchObject(params.id).then(({ researchObject }) => setObject(researchObject)).catch(setError); }, [params.id]);
  async function run() { if (!object || !script.trim()) return; setRunning(true); setError(null); try { const result = await createSandboxJob({ workspaceId: object.workspaceId, script, context: { visualizationType: 'plot', description: t('sandbox.context') } }); setJobId(result.job.id); } catch (cause) { setError(cause as Error); } finally { setRunning(false); } }
  if (error && !object) return <SurfaceState detail={error.message} kind={error instanceof ApiClientError && error.status === 403 ? 'forbidden' : 'error'} title={t('state.errorTitle')} />;
  if (!object) return <SurfaceState detail={t('state.loadingBody')} kind="loading" title={t('sandbox.title')} />;
  return <ResearchSurfaceShell active="sandbox" object={object} rail={<div><p className="font-data text-[10px] uppercase tracking-[0.14em] text-os-muted-dark">{t('sandbox.environment')}</p><p className="mt-4 text-sm leading-6 text-os-muted-dark">Python 3.11<br />NumPy / SciPy<br />Matplotlib<br />30s</p></div>}>
    <header><p className="font-data text-[10px] uppercase tracking-[0.16em] text-os-vermilion">{t('sandbox.kicker')}</p><h1 className="mt-3 font-editorial text-5xl font-normal text-os-paper">{t('sandbox.title')}</h1><p className="mt-4 max-w-2xl text-sm leading-6 text-os-muted-dark">{t('sandbox.body')}</p></header>
    {!jobId ? <section className="mt-10"><label className="font-data text-[10px] uppercase tracking-[0.14em] text-os-muted-dark" htmlFor="sandbox-script">{t('sandbox.script')}</label><textarea className="mt-3 min-h-[24rem] w-full resize-y border border-os-rule-dark bg-os-black-1 p-4 font-mono text-sm leading-6 text-os-paper outline-none focus:border-os-paper" id="sandbox-script" onChange={(event) => setScript(event.target.value)} spellCheck={false} value={script} /><button className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-panel bg-os-paper px-4 text-sm font-semibold text-os-black-0 disabled:opacity-40" disabled={running || !script.trim()} onClick={run}><Play className="h-4 w-4 fill-current" />{running ? t('sandbox.starting') : t('sandbox.run')}</button></section> : <section className="mt-10"><VisualizationResult jobId={jobId} onClose={() => setJobId('')} workspaceId={object.workspaceId} /></section>}
    {error && <p className="mt-6 text-sm text-os-vermilion" role="alert">{error.message}</p>}
  </ResearchSurfaceShell>;
}
