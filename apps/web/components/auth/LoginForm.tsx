'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { loginWithPassword, safeReturnTo } from '@/lib/api';

export interface LoginFormProps {
  returnTo?: string | null;
  /** Compatibility prop for the legacy /login route retained during rolling sync. */
  nextPath?: string | null;
}

export function LoginForm({ returnTo, nextPath }: LoginFormProps) {
  const t = useTranslations('auth');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      await loginWithPassword({ email, password });
      router.replace(safeReturnTo(returnTo ?? nextPath));
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('errors.generic'));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="w-full max-w-xl rounded-card border border-white/10 bg-workbench-surface p-6 shadow-overlay sm:p-9">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-accent-primary">
        OpenScience
      </p>
      <h1 className="font-display text-3xl font-semibold tracking-tight text-workbench-text sm:text-4xl">
        {t('login.title')}
      </h1>
      <p className="mt-3 text-sm leading-6 text-workbench-muted">{t('login.description')}</p>

      <form className="mt-8 grid gap-5" onSubmit={handleSubmit}>
        <label className="grid gap-2 text-sm font-medium text-workbench-text">
          {t('login.email')}
          <Input
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="grid gap-2 text-sm font-medium text-workbench-text">
          {t('login.password')}
          <Input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? t('login.signingIn') : t('login.submit')}
        </Button>
      </form>

      <div className="min-h-8 pt-4" aria-live="polite">
        {error ? (
          <p role="alert" className="rounded-control bg-status-danger-bg px-3 py-2 text-sm text-status-danger-text">
            {error}
          </p>
        ) : null}
      </div>
      <p className="mt-3 text-center text-sm text-workbench-muted">
        {t('login.noAccount')}{' '}
        <Link className="font-semibold text-accent-primary hover:underline" href={`/auth/register?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`}>
          {t('login.register')}
        </Link>
      </p>
    </section>
  );
}

// Compatibility export for a pre-existing server-side /login route during rolling sync.
export default LoginForm;
