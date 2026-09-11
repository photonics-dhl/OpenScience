'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import { useEffect, useState } from 'react';

import LocaleSwitcher from '@/components/LocaleSwitcher';
import { AccountLink } from '@/components/navigation/AccountLink';
import { ContinueResearch } from '@/components/dashboard/ContinueResearch';
import { HermesConversationCard } from '@/components/dashboard/HermesConversationCard';
import { ImportStage } from '@/components/dashboard/ImportStage';
import { LiteratureAcquisitionDisclosure } from '@/components/dashboard/LiteratureAcquisition';
import { ResearchList } from '@/components/dashboard/ResearchList';
import { HermesRail, type HermesRailTask } from '@/components/hermes/HermesRail';
import { HermesAssistantDrawer } from '@/components/hermes/HermesAssistantDrawer';
import { deriveHermesGuide } from '@/components/hermes/hermes-guide';
import { DashboardShell } from '@/components/shell/DashboardShell';
import { apiRequest, ApiClientError, getCurrentUser, getDashboardOverview, listResearchIngestionTasks, listSourceRetrieveTasks, type AgentTaskView, type CurrentUser, type DashboardResearchApi } from '@/lib/api';
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
  const [taskHistory, setTaskHistory] = useState<HermesRailTask[]>([]);
  const [taskLoadState, setTaskLoadState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
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
    let stopTaskRefresh: (() => void) | undefined;
    void Promise.all([
      getCurrentUser(),
      apiRequest<{ researchObjects: DashboardResearchApi[] }>('/api/research-objects?limit=20'),
    ])
      .then(([currentUser, researchOverview]) => {
        if (!active) return;
        let currentResearch = researchOverview.researchObjects;
        let latestId = currentResearch[0]?.id;
        let globalTasks: HermesRailTask[] = [];
        let latestTasks: HermesRailTask[] = [];
        let latestTasksAvailable = false;
        let refreshTimer: number | undefined;
        let refreshRunning = false;
        const showAvailableTasks = () => {
          if (!active) return;
          const visibleTasks = latestId && latestTasksAvailable
            ? [...latestTasks, ...globalTasks.filter((task) => task.researchObjectId !== latestId)]
            : globalTasks;
          applyDashboardTasks(currentResearch, visibleTasks, setResearchObjects, setTasks, setTaskHistory);
        };
        const hasBackgroundWork = () => [...latestTasks, ...globalTasks].some((task) => isBackgroundTask(task));
        function scheduleRefresh() {
          if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
          refreshTimer = undefined;
          if (!active || document.visibilityState !== 'visible' || !hasBackgroundWork()) return;
          refreshTimer = window.setTimeout(() => { void refreshTasks(); }, 30_000);
        }
        async function refreshTasks() {
          if (!active || refreshRunning || document.visibilityState !== 'visible') return;
          refreshRunning = true;
          try {
            const overview = await getDashboardOverview();
            if (!active) return;
            currentResearch = overview.researchObjects;
            globalTasks = overview.tasks;
            latestId = currentResearch[0]?.id;
            let loadFailed = false;
            latestTasksAvailable = false;
            if (latestId) {
              try {
                latestTasks = (await listResearchIngestionTasks(latestId)).tasks;
                latestTasksAvailable = true;
              } catch { loadFailed = true; }
            } else latestTasks = [];
            if (!active) return;
            showAvailableTasks();
            setTaskLoadState(loadFailed ? 'unavailable' : 'ready');
          } catch {
            if (active) setTaskLoadState('unavailable');
          }
          finally {
            refreshRunning = false;
            scheduleRefresh();
          }
        }
        function refreshWhenVisible() {
          if (document.visibilityState === 'visible') void refreshTasks();
          else if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
        }
        window.addEventListener('focus', refreshWhenVisible);
        document.addEventListener('visibilitychange', refreshWhenVisible);
        stopTaskRefresh = () => {
          if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
          window.removeEventListener('focus', refreshWhenVisible);
          document.removeEventListener('visibilitychange', refreshWhenVisible);
        };
        setUser(currentUser);
        applyDashboardTasks(currentResearch, [], setResearchObjects, setTasks, setTaskHistory);
        let remainingTaskLoads = latestId ? 2 : 1;
        let taskLoadFailed = false;
        refreshRunning = true;
        const finishTaskLoad = () => {
          remainingTaskLoads -= 1;
          if (remainingTaskLoads === 0) {
            refreshRunning = false;
            if (active) {
              setTaskLoadState(taskLoadFailed ? 'unavailable' : 'ready');
              scheduleRefresh();
            }
          }
        };

        void apiRequest<{ tasks: HermesRailTask[] }>('/api/ingestion?actionable=true')
          .then(({ tasks: availableTasks }) => {
            globalTasks = availableTasks;
            showAvailableTasks();
            scheduleRefresh();
          })
          .catch(() => { taskLoadFailed = true; })
          .finally(finishTaskLoad);

        if (latestId) {
          void listResearchIngestionTasks(latestId)
            .then(({ tasks: availableTasks }) => {
              latestTasks = availableTasks;
              latestTasksAvailable = true;
              showAvailableTasks();
              scheduleRefresh();
            })
            .catch(() => { taskLoadFailed = true; })
            .finally(finishTaskLoad);
        }
      })
      .catch((cause) => {
        if (!active) return;
        if (cause instanceof ApiClientError && cause.status === 401) {
          router.replace('/auth/login?returnTo=%2Fdashboard');
          return;
        }
        setError(cause instanceof Error ? cause.message : t('errors.load'));
      });

    void listSourceRetrieveTasks({ kind: 'personal' })
      .then((retrieval) => {
        if (active) setLiteratureTask(retrieval.tasks[0] ?? null);
      })
      .catch((cause) => {
        if (active && cause instanceof ApiClientError && cause.status === 401) {
          router.replace('/auth/login?returnTo=%2Fdashboard');
        }
      })
      .finally(() => {
        if (active) setLiteratureRecovered(true);
      });
    return () => {
      active = false;
      stopTaskRefresh?.();
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
          <HermesConversationCard onInvoke={() => setHermesOpen(true)} working={guideWorking} />
          <HermesRail historyTasks={taskHistory} tasks={tasks} loadState={taskLoadState} />
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

function needsUserAttention(task: HermesRailTask): boolean {
  return task.state === 'needs_review' || task.state.startsWith('failed_');
}

function isBackgroundTask(task: HermesRailTask): boolean {
  return ['queued', 'uploading', 'parsing', 'stored'].includes(task.state);
}

function applyDashboardTasks(
  research: DashboardResearchApi[],
  sourceTasks: HermesRailTask[],
  setResearch: React.Dispatch<React.SetStateAction<DashboardResearch[]>>,
  setCurrent: React.Dispatch<React.SetStateAction<HermesRailTask[]>>,
  setHistory: React.Dispatch<React.SetStateAction<HermesRailTask[]>>,
): void {
  const taskPortfolio = organizeDashboardTasks(sourceTasks);
  setResearch(research.map((item) => ({
    id: item.id,
    publicId: item.publicId ?? `DRAFT-${item.id.slice(0, 8)}`,
    title: item.title,
    versionNo: item.version,
    status: item.status,
    pendingCount: taskPortfolio.current.filter((task) => task.researchObjectId === item.id && needsUserAttention(task)).length,
  })));
  setCurrent(taskPortfolio.current);
  setHistory(taskPortfolio.history);
}

function organizeDashboardTasks(tasks: HermesRailTask[]): { current: HermesRailTask[]; history: HermesRailTask[] } {
  const seenIds = new Set<string>();
  const seenSources = new Set<string>();
  const current: HermesRailTask[] = [];
  const history: HermesRailTask[] = [];

  for (const task of tasks) {
    if (seenIds.has(task.id)) continue;
    seenIds.add(task.id);
    const path = task.logicalPath.trim().toLocaleLowerCase();
    const sourceKey = path ? `${task.researchObjectId}\u0000${path}` : task.id;
    if (seenSources.has(sourceKey) && needsUserAttention(task)) history.push(task);
    else current.push(task);
    seenSources.add(sourceKey);
  }

  return { current, history };
}
