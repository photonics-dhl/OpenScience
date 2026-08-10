'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useEffect, useRef, useState, type FormEvent } from 'react';

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
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (stage === 'code') codeInputRef.current?.focus();
  }, [stage]);

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
    <section className="w-full max-w-2xl" data-auth-flow="signup-code">
      <p className="mb-5 border-b border-os-rule-dark pb-4 font-mono text-[0.65rem] uppercase tracking-[0.24em] text-os-vermilion">
        {t('identity.verificationEyebrow')}
      </p>
      <h1 className="max-w-[12ch] font-editorial text-[clamp(2.8rem,5vw,5.6rem)] font-normal leading-[0.92] tracking-[-0.055em] text-workbench-text">
        {t('register.title')}
      </h1>
      <p className="mt-5 max-w-md text-sm leading-7 text-workbench-muted">
        {t('register.description')}
      </p>

      {stage === 'details' ? (
        <form className="mt-10 grid gap-7" onSubmit={handleDetails}>
          <label className="grid gap-2 font-mono text-[0.68rem] uppercase tracking-[0.18em] text-workbench-muted">
            {t('register.displayName')}
            <Input
              className="h-12 rounded-none border-0 border-b border-os-rule-dark bg-transparent px-0 font-sans text-base normal-case tracking-normal focus-visible:border-os-paper focus-visible:ring-0 [.surface-dark_&]:bg-transparent"
              name="displayName"
              autoComplete="name"
              required
              maxLength={64}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>
          <label className="grid gap-2 font-mono text-[0.68rem] uppercase tracking-[0.18em] text-workbench-muted">
            {t('register.email')}
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
            {t('register.password')}
            <Input
              className="h-12 rounded-none border-0 border-b border-os-rule-dark bg-transparent px-0 font-sans text-base normal-case tracking-normal focus-visible:border-os-paper focus-visible:ring-0 [.surface-dark_&]:bg-transparent"
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
          <Button className="min-h-12 rounded-panel bg-os-vermilion text-os-black-0 active:translate-y-px" type="submit" size="lg" disabled={pending}>
            {pending ? t('register.sending') : t('register.requestCode')}
          </Button>
        </form>
      ) : (
        <form className="mt-10 grid gap-7" onSubmit={handleConfirmation}>
          <div className="border-y border-os-rule-dark py-4 font-mono text-xs leading-6 text-workbench-muted">
            {t('register.codeSent', { email })}
          </div>
          <label className="grid gap-2 font-mono text-[0.68rem] uppercase tracking-[0.18em] text-workbench-muted">
            {t('register.code')}
            <Input
              ref={codeInputRef}
              autoFocus
              data-code-focus-target="true"
              className="h-16 rounded-none border-0 border-b border-os-rule-dark bg-transparent px-0 font-mono text-2xl tracking-[0.42em] focus-visible:border-os-paper focus-visible:ring-0 [.surface-dark_&]:bg-transparent"
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
          <Button className="min-h-12 rounded-panel bg-os-vermilion text-os-black-0 active:translate-y-px" type="submit" size="lg" disabled={pending || code.length !== 6}>
            {pending ? t('register.confirming') : t('register.confirm')}
          </Button>
          <Button type="button" variant="ghost" disabled={cooldown > 0 || pending} onClick={handleResend}>
            {cooldown > 0 ? t('register.resendIn', { seconds: cooldown }) : t('register.resend')}
          </Button>
        </form>
      )}

      <div className="min-h-8 pt-5" aria-live="polite" data-auth-error-retryable="true">
        {error ? (
          <p role="alert" className="border-l border-status-danger-text py-2 pl-4 text-sm text-status-danger-text">
            {error}
          </p>
        ) : null}
      </div>
      <p className="mt-4 border-t border-os-rule-dark pt-5 text-sm text-workbench-muted">
        {t('register.haveAccount')}{' '}
        <Link className="font-semibold text-accent-primary hover:underline" href={`/auth/login?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`}>
          {t('register.login')}
        </Link>
      </p>
    </section>
  );
}
