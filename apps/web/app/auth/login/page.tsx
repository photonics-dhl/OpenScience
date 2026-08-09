import type { Metadata } from 'next';
import * as React from 'react';

import { LoginForm } from '@/components/auth/LoginForm';

export const metadata: Metadata = { title: 'Log in · OpenScience' };

export default function LoginPage({ searchParams }: { searchParams?: { returnTo?: string } }) {
  return (
    <main className="surface-dark surface-workbench grid min-h-screen place-items-center bg-workbench-bg px-4 py-10 sm:px-8">
      <div className="grid w-full max-w-6xl items-center gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(28rem,1fr)]">
        <aside className="hidden max-w-lg lg:block">
          <p className="font-display text-5xl font-semibold leading-tight text-workbench-text">
            Return to the work, not a feed.
          </p>
          <p className="mt-5 max-w-md leading-7 text-workbench-muted">
            Continue the latest research object and resolve only the tasks that need your judgment.
          </p>
        </aside>
        <LoginForm returnTo={searchParams?.returnTo} />
      </div>
    </main>
  );
}
