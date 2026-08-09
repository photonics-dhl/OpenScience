import type { Metadata } from 'next';
import * as React from 'react';

import { SignupCodeForm } from '@/components/auth/SignupCodeForm';

export const metadata: Metadata = { title: 'Register · OpenScience' };

export default function RegisterPage({ searchParams }: { searchParams?: { returnTo?: string } }) {
  return (
    <main className="surface-dark surface-workbench grid min-h-screen place-items-center bg-workbench-bg px-4 py-10 sm:px-8">
      <div className="grid w-full max-w-6xl items-center gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(28rem,1fr)]">
        <aside className="hidden max-w-lg lg:block">
          <p className="font-display text-5xl font-semibold leading-tight text-workbench-text">
            Science is no longer published. It evolves.
          </p>
          <p className="mt-5 max-w-md leading-7 text-workbench-muted">
            Build a research object whose evidence, versions, and collaboration remain traceable.
          </p>
        </aside>
        <SignupCodeForm returnTo={searchParams?.returnTo} />
      </div>
    </main>
  );
}
