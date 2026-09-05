'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiRequest, type DashboardResearchApi } from '@/lib/api';

export function MyResearchProjects() {
  const t = useTranslations('myAccount');
  const [projects, setProjects] = useState<DashboardResearchApi[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void apiRequest<{ researchObjects: DashboardResearchApi[] }>('/api/research-objects?limit=20')
      .then((result) => { if (active) setProjects(result.researchObjects); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);
  return <section className="surface-folio-sheet px-5 py-6">
    <h2 className="text-lg font-semibold text-os-ink">{t('researchTitle')}</h2>
    <p className="mt-3 text-sm text-os-muted-paper">{t('researchBody')}</p>
    {failed ? <p role="alert" className="mt-3 text-sm text-os-vermilion-ink">{t('researchError')}</p> : projects === null ? <p role="status">{t('researchLoading')}</p> : projects.length === 0 ? <p className="mt-3 text-sm text-os-muted-paper">{t('researchEmpty')}</p> : <ul className="mt-4 divide-y divide-os-rule-paper">
      {projects.map((project) => <li key={project.id} className="py-3"><Link className="inline-flex min-h-11 items-center break-words text-os-vermilion-ink hover:underline focus-visible:ring-2 focus-visible:ring-focus-ring" href={`/research-objects/${encodeURIComponent(project.id)}/edit`}>{project.title}</Link></li>)}
    </ul>}
    <Link className="mt-4 inline-flex min-h-11 items-center text-os-vermilion-ink hover:underline focus-visible:ring-2 focus-visible:ring-focus-ring" href="/dashboard">{t('researchLink')}</Link>
  </section>;
}
