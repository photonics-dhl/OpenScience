'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import { useEffect, useState } from 'react';

import LocaleSwitcher from '@/components/LocaleSwitcher';
import { ContinueResearch } from '@/components/dashboard/ContinueResearch';
import { ImportStage } from '@/components/dashboard/ImportStage';
import { ResearchList } from '@/components/dashboard/ResearchList';
import { HermesRail, type HermesRailTask } from '@/components/hermes/HermesRail';
import { HermesAssistantDrawer } from '@/components/hermes/HermesAssistantDrawer';
import { HermesDockAnchor } from '@/components/hermes/HermesDockAnchor';
import { deriveHermesGuide } from '@/components/hermes/hermes-guide';
import { deriveHermesCompositeVisualState } from '@/components/hermes/hermes-state';
import { DashboardShell } from '@/components/shell/DashboardShell';
import { ApiClientError, getCurrentUser, getDashboardOverview, type AgentTaskView, type CurrentUser } from '@/lib/api';
import type { DashboardResearch } from '@/components/dashboard/ResearchList';
import type { Locale } from '@/i18n/locale';

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [researchObjects, setResearchObjects] = useState<DashboardResearch[]>([]);
  const [tasks, setTasks] = useState<HermesRailTask[]>([]);
  const [error, setError] = useState('');
  const [hermesOpen, setHermesOpen] = useState(false);
  const [guideTask, setGuideTask] = useState<AgentTaskView | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([getCurrentUser(), getDashboardOverview()])
      .then(([currentUser, overview]) => {
        if (!active) return;
        setUser(currentUser);
        const mappedResearch = overview.researchObjects.map((research) => ({
          id: research.id,
          publicId: research.publicId ?? `DRAFT-${research.id.slice(0, 8)}`,
          title: research.title,
          versionNo: research.version,
          status: research.status,
          pendingCount: overview.tasks.filter((task) => task.researchObjectId === research.id).length,
        }));
        setResearchObjects(mappedResearch);
        setTasks(overview.tasks);
      })
      .catch((cause) => {
        if (!active) return;
        if (cause instanceof ApiClientError && cause.status === 401) {
          router.replace('/auth/login?returnTo=%2Fdashboard');
          return;
        }
        setError(cause instanceof Error ? cause.message : t('errors.load'));
      });
    return () => {
      active = false;
    };
  }, [router, t]);

  if (!user && !error) {
    return (
      <main className="surface-workbench grid min-h-screen place-items-center text-os-paper" aria-busy="true">
        <p className="text-sm text-workbench-muted" aria-live="polite">{t('loading')}</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="surface-workbench grid min-h-screen place-items-center px-4 text-os-paper">
        <section className="w-full max-w-xl border-y border-os-rule-dark py-10 text-center">
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-os-vermilion">System / interrupted</p>
          <h1 className="mt-4 font-editorial text-4xl">{t('errors.title')}</h1>
          <p role="alert" className="mt-3 text-sm text-os-muted-dark">{error}</p>
          <button className="mt-6 border-b border-os-vermilion pb-1 text-sm font-semibold text-os-paper hover:text-os-vermilion" type="button" onClick={() => window.location.reload()}>
            {t('errors.retry')}
          </button>
        </section>
      </main>
    );
  }

  const guideWorking = guideTask?.status === 'pending' || guideTask?.status === 'running';
  const visualState = deriveHermesCompositeVisualState(tasks, guideWorking);
  const suggestion = deriveHermesGuide({ tasks, researchObjects });
  const dashboardContext = {
    tasks: tasks.slice(0, 20).map((task) => ({ id: task.id, researchObjectId: task.researchObjectId, state: task.state })),
    researchObjects: researchObjects.slice(0, 20).map((research) => ({ id: research.id, title: research.title, status: research.status })),
  };

  return (
    <DashboardShell
      className="text-os-paper"
      headerActions={(
        <div className="ml-auto flex items-center justify-end gap-3">
          <span className="hidden font-mono text-[0.68rem] uppercase tracking-[0.12em] text-os-muted-dark sm:inline">{user?.displayName}</span>
          <LocaleSwitcher locale={locale} />
          <Link className="text-xs text-os-muted-dark hover:text-os-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion" href="/settings">{t('context.settings')}</Link>
          <Link className="text-xs text-os-muted-dark hover:text-os-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion" href="/#about">{t('context.help')}</Link>
        </div>
      )}
      navigationLabel={t('context.navigation')}
      skipLabel="Skip to research workspace"
    >
      <div className="mx-auto grid max-w-screen-2xl gap-x-8 gap-y-10 lg:grid-cols-12">
        <header className="lg:col-span-12">
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-os-muted-dark">
            {t('eyebrow')}
          </p>
          <h1 className="mt-3 font-editorial text-4xl font-normal leading-none sm:text-6xl">
            {t('title')}
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-os-muted-dark">
            {t('welcome', { name: user?.displayName ?? '' })}
          </p>
        </header>

        <div className="lg:col-span-8">
          <ContinueResearch research={researchObjects[0] ?? null} />
        </div>
        <div className="lg:col-span-4 lg:row-span-2">
          <HermesDockAnchor assistantOpen={hermesOpen} onInvoke={() => setHermesOpen(true)} state={visualState} suggestion={suggestion} />
          <HermesRail tasks={tasks} />
        </div>
        <div className="lg:col-span-8">
          <ImportStage />
        </div>
        <div className="lg:col-span-12">
          <ResearchList researchObjects={researchObjects} />
        </div>
      </div>
      <HermesAssistantDrawer
        dashboardContext={dashboardContext}
        locale={locale}
        onOpenChange={setHermesOpen}
        onTaskStateChange={setGuideTask}
        open={hermesOpen}
        suggestion={suggestion}
      />
    </DashboardShell>
  );
}
