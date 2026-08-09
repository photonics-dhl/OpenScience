'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useEffect, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { confirmSignup, requestSignupCode, safeReturnTo } from '@/lib/api';

const RESEND_COOLDOWN_SECONDS = 60;

export type PasswordRule = 'length' | 'letter' | 'number';

export function validateSignupPassword(password: string): PasswordRule[] {
  const errors: PasswordRule[] = [];
  if (password.length < 8) errors.push('length');
  if (!/[A-Za-z]/.test(password)) errors.push('letter');
  if (!/[0-9]/.test(password)) errors.push('number');
  return errors;
}

export interface SignupCodeFormProps {
  returnTo?: string | null;
}

export function SignupCodeForm({ returnTo }: SignupCodeFormProps) {
  const t = useTranslations('auth');
  const router = useRouter();
  const [stage, setStage] = useState<'details' | 'code'>('details');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function sendCode() {
    await requestSignupCode({ email });
    setStage('code');
    setCooldown(RESEND_COOLDOWN_SECONDS);
  }

  async function handleDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const passwordErrors = validateSignupPassword(password);
    if (passwordErrors.length > 0) {
      setError(t(`register.passwordError.${passwordErrors[0]}`));
      return;
    }
    setPending(true);
    try {
      await sendCode();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('errors.generic'));
    } finally {
      setPending(false);
    }
  }

  async function handleConfirmation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setPending(true);
    try {
      await confirmSignup({ email, code, password, displayName });
      router.replace(safeReturnTo(returnTo));
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('errors.generic'));
    } finally {
      setPending(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0 || pending) return;
    setError('');
    setPending(true);
    try {
      await sendCode();
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
        {t('register.title')}
      </h1>
      <p className="mt-3 max-w-md text-sm leading-6 text-workbench-muted">
        {t('register.description')}
      </p>

      {stage === 'details' ? (
        <form className="mt-8 grid gap-5" onSubmit={handleDetails}>
          <label className="grid gap-2 text-sm font-medium text-workbench-text">
            {t('register.displayName')}
            <Input
              name="displayName"
              autoComplete="name"
              required
              maxLength={64}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-workbench-text">
            {t('register.email')}
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
            {t('register.password')}
            <Input
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              aria-describedby="signup-password-hint"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <p id="signup-password-hint" className="-mt-3 text-xs leading-5 text-workbench-muted">
            {t('register.passwordHint')}
          </p>
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? t('register.sending') : t('register.requestCode')}
          </Button>
        </form>
      ) : (
        <form className="mt-8 grid gap-5" onSubmit={handleConfirmation}>
          <div className="rounded-control border border-white/10 bg-workbench-bg p-3 text-sm text-workbench-muted">
            {t('register.codeSent', { email })}
          </div>
          <label className="grid gap-2 text-sm font-medium text-workbench-text">
            {t('register.code')}
            <Input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            />
          </label>
          <Button type="submit" size="lg" disabled={pending || code.length !== 6}>
            {pending ? t('register.confirming') : t('register.confirm')}
          </Button>
          <Button type="button" variant="ghost" disabled={cooldown > 0 || pending} onClick={handleResend}>
            {cooldown > 0 ? t('register.resendIn', { seconds: cooldown }) : t('register.resend')}
          </Button>
        </form>
      )}

      <div className="min-h-8 pt-4" aria-live="polite">
        {error ? (
          <p role="alert" className="rounded-control bg-status-danger-bg px-3 py-2 text-sm text-status-danger-text">
            {error}
          </p>
        ) : null}
      </div>
      <p className="mt-3 text-center text-sm text-workbench-muted">
        {t('register.haveAccount')}{' '}
        <Link className="font-semibold text-accent-primary hover:underline" href={`/auth/login?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`}>
          {t('register.login')}
        </Link>
      </p>
    </section>
  );
}
