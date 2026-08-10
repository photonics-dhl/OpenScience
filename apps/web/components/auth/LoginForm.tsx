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
    <section className="w-full max-w-2xl" data-auth-flow="login">
      <p className="mb-5 border-b border-os-rule-dark pb-4 font-mono text-[0.65rem] uppercase tracking-[0.24em] text-os-vermilion">
        {t('identity.loginEyebrow')}
      </p>
      <h1 className="max-w-[12ch] font-editorial text-[clamp(2.8rem,5vw,5.6rem)] font-normal leading-[0.92] tracking-[-0.055em] text-workbench-text">
        {t('login.title')}
      </h1>
      <p className="mt-5 max-w-md text-sm leading-7 text-workbench-muted">{t('login.description')}</p>

      <form className="mt-10 grid gap-7" onSubmit={handleSubmit}>
        <label className="grid gap-2 font-mono text-[0.68rem] uppercase tracking-[0.18em] text-workbench-muted">
          {t('login.email')}
          <Input
            className="h-12 rounded-none border-0 border-b border-os-rule-dark bg-transparent px-0 font-sans text-base normal-case tracking-normal focus-visible:border-os-paper focus-visible:ring-0 [.surface-dark_&]:bg-transparent"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="grid gap-2 font-mono text-[0.68rem] uppercase tracking-[0.18em] text-workbench-muted">
          {t('login.password')}
          <Input
            className="h-12 rounded-none border-0 border-b border-os-rule-dark bg-transparent px-0 font-sans text-base normal-case tracking-normal focus-visible:border-os-paper focus-visible:ring-0 [.surface-dark_&]:bg-transparent"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <Button className="min-h-12 rounded-panel bg-os-vermilion text-os-black-0 active:translate-y-px" type="submit" size="lg" disabled={pending}>
          {pending ? t('login.signingIn') : t('login.submit')}
        </Button>
      </form>

      <div className="min-h-8 pt-5" aria-live="polite" data-auth-error-retryable="true">
        {error ? (
          <p role="alert" className="border-l border-status-danger-text py-2 pl-4 text-sm text-status-danger-text">
            {error}
          </p>
        ) : null}
      </div>
      <p className="mt-4 border-t border-os-rule-dark pt-5 text-sm text-workbench-muted">
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
