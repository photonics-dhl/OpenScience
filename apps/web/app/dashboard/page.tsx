'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import { useEffect, useState } from 'react';

import LocaleSwitcher from '@/components/LocaleSwitcher';
import { ContinueResearch } from '@/components/dashboard/ContinueResearch';
import { HermesTaskRail } from '@/components/dashboard/HermesTaskRail';
import { ImportStage } from '@/components/dashboard/ImportStage';
import { ResearchList } from '@/components/dashboard/ResearchList';
import { ApiClientError, getCurrentUser, type CurrentUser } from '@/lib/api';
import type { Locale } from '@/i18n/locale';

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getCurrentUser()
      .then((currentUser) => {
        if (active) setUser(currentUser);
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
      <main className="surface-dark surface-workbench grid min-h-screen place-items-center bg-workbench-bg text-workbench-text" aria-busy="true">
        <p className="text-sm text-workbench-muted" aria-live="polite">{t('loading')}</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="surface-dark surface-workbench grid min-h-screen place-items-center bg-workbench-bg px-4 text-workbench-text">
        <section className="max-w-md rounded-card border border-white/10 bg-workbench-surface p-6 text-center">
          <h1 className="text-xl font-semibold">{t('errors.title')}</h1>
          <p role="alert" className="mt-3 text-sm text-workbench-muted">{error}</p>
          <button className="mt-5 text-sm font-semibold text-accent-primary hover:underline" type="button" onClick={() => window.location.reload()}>
            {t('errors.retry')}
          </button>
        </section>
      </main>
    );
  }

  return (
    <div className="surface-dark surface-workbench min-h-screen bg-workbench-bg text-workbench-text">
      <header className="border-b border-white/10 bg-workbench-surface">
        <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-7 lg:px-10">
          <Link className="font-display text-xl font-semibold tracking-tight text-workbench-text" href="/dashboard">
            OpenScience
          </Link>
          <nav className="flex items-center gap-3" aria-label={t('context.navigation')}>
            <span className="hidden text-sm text-workbench-muted sm:inline">{user?.displayName}</span>
            <LocaleSwitcher locale={locale} />
            <Link className="rounded-control px-2 py-1 text-sm text-workbench-muted hover:text-workbench-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring" href="/#about">
              {t('context.help')}
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto grid max-w-screen-2xl gap-5 px-4 py-6 sm:px-7 sm:py-8 lg:grid-cols-12 lg:px-10">
        <header className="lg:col-span-12">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-workbench-muted">
            {t('eyebrow')}
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            {t('title')}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-workbench-muted">
            {t('welcome', { name: user?.displayName ?? '' })}
          </p>
        </header>

        <div className="lg:col-span-7">
          <ContinueResearch research={null} />
        </div>
        <div className="lg:col-span-5">
          <ImportStage />
        </div>
        <div className="lg:col-span-8">
          <ResearchList researchObjects={[]} />
        </div>
        <div className="lg:col-span-4">
          <HermesTaskRail tasks={[]} />
        </div>
      </main>
    </div>
  );
}
