'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRight, FileText } from 'lucide-react';
import { apiRequest, type DashboardResearchApi } from '@/lib/api';

export function MyResearchProjects() {
  const t = useTranslations('myAccount');
  const [projects, setProjects] = useState<DashboardResearchApi[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    let active = true;
    void apiRequest<{ researchObjects: DashboardResearchApi[] }>('/api/research-objects?limit=20')
      .then((result) => { if (active) setProjects(result.researchObjects); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);
  return <section className="surface-folio-sheet account-projects px-5 py-6" data-profile-projects="true">
    <h2 className="text-lg font-semibold text-os-ink">{t('researchTitle')}</h2>
    <p className="mt-3 text-sm text-os-muted-paper">{t('researchBody')}</p>
    {failed ? <p role="alert" className="mt-3 text-sm text-os-vermilion-ink">{t('researchError')}</p> : projects === null ? <p role="status">{t('researchLoading')}</p> : projects.length === 0 ? <p className="mt-3 text-sm text-os-muted-paper">{t('researchEmpty')}</p> : <ul className="mt-4 divide-y divide-os-rule-paper">
      {(expanded ? projects : projects.slice(0, 6)).map((project) => <li key={project.id}><Link className="project-row" href={`/research-objects/${encodeURIComponent(project.id)}/edit`}><FileText aria-hidden="true" size={18} /><span>{project.title}</span><ArrowRight aria-hidden="true" size={16} /></Link></li>)}
    </ul>}
    <div className="project-actions">
      <Link className="inline-flex min-h-11 items-center text-os-vermilion-ink no-underline hover:underline focus-visible:ring-2 focus-visible:ring-focus-ring" href="/dashboard">{t('researchLink')}<ArrowRight aria-hidden="true" className="ml-2" size={16} /></Link>
      {projects && projects.length > 6 ? <button className="project-expand" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{t(expanded ? 'showLess' : 'showAll')}</button> : null}
    </div>
  </section>;
}
