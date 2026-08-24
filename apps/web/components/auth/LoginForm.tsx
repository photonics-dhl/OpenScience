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
    <section className="w-full max-w-xl surface-folio-sheet px-5 py-8 sm:px-9 sm:py-10" data-auth-flow="login">
      <p data-reading-role="caption" className="mb-4 border-b border-os-rule-paper pb-3 text-os-vermilion-ink">
        {t('identity.loginEyebrow')}
      </p>
      <h1 className="max-w-[16ch] text-[clamp(2rem,4vw,2.75rem)] font-normal leading-[1.08] tracking-[-0.03em] text-os-ink">
        {t('login.title')}
      </h1>
      <p className="mt-4 max-w-md text-base leading-7 text-os-muted-paper">{t('login.description')}</p>

      <form className="mt-8 grid gap-6" onSubmit={handleSubmit}>
        <label className="grid gap-2 text-sm font-medium text-os-ink">
          {t('login.email')}
          <Input
            className="h-12 rounded-none border-0 border-b border-os-rule-paper bg-transparent px-0 text-base focus-visible:border-os-vermilion-ink focus-visible:ring-0"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="grid gap-2 text-sm font-medium text-os-ink">
          {t('login.password')}
          <Input
            className="h-12 rounded-none border-0 border-b border-os-rule-paper bg-transparent px-0 text-base focus-visible:border-os-vermilion-ink focus-visible:ring-0"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <Button className="min-h-12 rounded-control bg-os-vermilion-ink text-os-paper active:translate-y-px" type="submit" size="lg" disabled={pending}>
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
      <p className="mt-4 border-t border-os-rule-paper pt-5 text-sm text-os-muted-paper">
        {t('login.noAccount')}{' '}
        <Link className="font-semibold text-os-vermilion-ink hover:underline" href={`/auth/register?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`}>
          {t('login.register')}
        </Link>
      </p>
    </section>
  );
}

// Compatibility export for a pre-existing server-side /login route during rolling sync.
export default LoginForm;
