'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import { useEffect, useState } from 'react';

import LocaleSwitcher from '@/components/LocaleSwitcher';
import { AccountLink } from '@/components/navigation/AccountLink';
import { ContinueResearch } from '@/components/dashboard/ContinueResearch';
import { ImportStage } from '@/components/dashboard/ImportStage';
import { LiteratureAcquisitionDisclosure } from '@/components/dashboard/LiteratureAcquisition';
import { ResearchList } from '@/components/dashboard/ResearchList';
import { HermesRail, type HermesRailTask } from '@/components/hermes/HermesRail';
import { HermesAssistantDrawer } from '@/components/hermes/HermesAssistantDrawer';
import { HermesDockAnchor } from '@/components/hermes/HermesDockAnchor';
import { deriveHermesGuide } from '@/components/hermes/hermes-guide';
import { deriveHermesCompositeVisualState } from '@/components/hermes/hermes-state';
import { DashboardShell } from '@/components/shell/DashboardShell';
import { ApiClientError, getCurrentUser, getDashboardOverview, listResearchIngestionTasks, listSourceRetrieveTasks, type AgentTaskView, type CurrentUser } from '@/lib/api';
import type { DashboardResearch } from '@/components/dashboard/ResearchList';
import type { Locale } from '@/i18n/locale';

import styles from './dashboard.module.css';

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
  const [literatureTask, setLiteratureTask] = useState<AgentTaskView | null>(null);
  const [literatureRecovered, setLiteratureRecovered] = useState(false);
  const handleLiteratureAuthenticationRequired = React.useCallback(() => {
    router.replace('/auth/login?returnTo=%2Fdashboard');
  }, [router]);

  useEffect(() => {
    let active = true;
    Promise.all([getCurrentUser(), getDashboardOverview(), listSourceRetrieveTasks({ kind: 'personal' })])
      .then(async ([currentUser, overview, retrieval]) => {
        const latestId = overview.researchObjects[0]?.id;
        const latestTasks = latestId ? (await listResearchIngestionTasks(latestId)).tasks : [];
        const visibleTasks = latestId ? [...latestTasks, ...overview.tasks.filter((task) => task.researchObjectId !== latestId)] : overview.tasks;
        if (!active) return;
        setUser(currentUser);
        const mappedResearch = overview.researchObjects.map((research) => ({
          id: research.id,
          publicId: research.publicId ?? `DRAFT-${research.id.slice(0, 8)}`,
          title: research.title,
          versionNo: research.version,
          status: research.status,
          pendingCount: visibleTasks.filter((task) => task.researchObjectId === research.id).length,
        }));
        setResearchObjects(mappedResearch);
        setTasks(visibleTasks);
        setLiteratureTask(retrieval.tasks[0] ?? null);
        setLiteratureRecovered(true);
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
      <DashboardShell
        activeRoute="dashboard"
        aria-busy="true"
        mainClassName="grid place-items-center"
        navigationLabel={t('context.navigation')}
        skipLabel={t('context.skip')}
      >
        <p className="text-base text-os-muted-paper" aria-live="polite">{t('loading')}</p>
      </DashboardShell>
    );
  }

  if (error) {
    return (
      <DashboardShell
        activeRoute="dashboard"
        mainClassName="grid place-items-center px-4"
        navigationLabel={t('context.navigation')}
        skipLabel={t('context.skip')}
      >
        <section className="surface-folio-sheet w-full max-w-xl border-y border-os-rule-paper px-6 py-10 text-center">
          <p data-reading-role="caption" className="text-os-vermilion-ink">{t('errors.kicker')}</p>
          <h1 className="mt-4 text-4xl">{t('errors.title')}</h1>
          <p role="alert" className="mt-3 text-base text-os-muted-paper">{error}</p>
          <button className="mt-6 border-b border-os-vermilion-ink pb-1 text-sm font-semibold text-os-ink hover:text-os-vermilion-ink" type="button" onClick={() => window.location.reload()}>
            {t('errors.retry')}
          </button>
        </section>
      </DashboardShell>
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
      activeRoute="dashboard"
      className={styles.desk}
      mainClassName={styles.main}
      headerActions={(
        <div className={styles.utilities}>
          <AccountLink user={user} />
          <LocaleSwitcher locale={locale} />
        </div>
      )}
      navigationLabel={t('context.navigation')}
      skipLabel={t('context.skip')}
    >
      <div className={styles.layout}>
        <header className={styles.heading}>
          <p data-reading-role="caption" className={styles.eyebrow}>
            {t('eyebrow')}
          </p>
          <h1 className={styles.title}>
            {t('title')}
          </h1>
          <p data-reading-role="body" className={styles.welcome}>
            {t('welcome', { name: user?.displayName ?? '' })}
          </p>
        </header>

        <div className={styles.continueResearch}>
          <ContinueResearch research={researchObjects[0] ?? null} tasks={tasks} />
        </div>
        <div className={styles.taskRail}>
          <HermesDockAnchor assistantOpen={hermesOpen} onInvoke={() => setHermesOpen(true)} state={visualState} suggestion={suggestion} />
          <HermesRail tasks={tasks} />
        </div>
        <div className={styles.startResearch}>
          <ImportStage />
        </div>
        <div className={styles.literature}>
          <LiteratureAcquisitionDisclosure
            initialTask={literatureTask}
            onAuthenticationRequired={handleLiteratureAuthenticationRequired}
            recoveryComplete={literatureRecovered}
            userId={user!.userId}
          />
        </div>
        <div className={styles.library}>
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
