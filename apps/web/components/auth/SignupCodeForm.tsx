'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiClientError, confirmSignup, requestSignupCode, safeReturnTo } from '@/lib/api';
import { EMPTY_RESEARCH_PROFILE, ResearchProfileFields } from './ResearchProfileFields';

const RESEND_COOLDOWN_SECONDS = 60;

export type PasswordRule = 'length' | 'letter' | 'number';

export function validateSignupPassword(password: string): PasswordRule[] {
  const errors: PasswordRule[] = [];
  if (password.length < 8) errors.push('length');
  if (!/[A-Za-z]/.test(password)) errors.push('letter');
  if (!/[0-9]/.test(password)) errors.push('number');
  return errors;
}

export type SignupErrorKind = 'code' | 'expired' | 'rate' | 'mail' | 'duplicate' | 'generic';

export function classifySignupError(cause: unknown): SignupErrorKind {
  if (!(cause instanceof ApiClientError)) return 'generic';
  if (cause.status === 429) return 'rate';
  if (/EXPIRED/i.test(cause.code)) return 'expired';
  if (/CODE|OTP/i.test(cause.code)) return 'code';
  if (/MAIL|SMTP|DELIVERY/i.test(cause.code)) return 'mail';
  if (cause.status === 409 || /EXISTS|DUPLICATE/i.test(cause.code)) return 'duplicate';
  return 'generic';
}

export interface SignupCodeFormProps {
  returnTo?: string | null;
}

export function SignupCodeForm({ returnTo }: SignupCodeFormProps) {
  const t = useTranslations('auth');
  const router = useRouter();
  const [stage, setStage] = useState<'details' | 'code' | 'complete'>('details');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [researchIdentity, setResearchIdentity] = useState(EMPTY_RESEARCH_PROFILE);
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
      setError(t(`register.failure.${classifySignupError(cause)}`));
    } finally {
      setPending(false);
    }
  }

  async function handleConfirmation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setPending(true);
    try {
      await confirmSignup({ email, code, password, displayName, researchIdentity });
      setStage('complete');
    } catch (cause) {
      setError(t(`register.failure.${classifySignupError(cause)}`));
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
      setError(t(`register.failure.${classifySignupError(cause)}`));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="w-full max-w-xl surface-folio-sheet px-5 py-8 sm:px-9 sm:py-10" data-auth-flow="signup-code">
      <p data-reading-role="caption" className="mb-4 border-b border-os-rule-paper pb-3 text-os-vermilion-ink">
        {t('identity.verificationEyebrow')}
      </p>
      <h1 className="max-w-[16ch] text-[clamp(2rem,4vw,2.75rem)] font-normal leading-[1.08] tracking-[-0.03em] text-os-ink">
        {t('register.title')}
      </h1>
      <p className="mt-4 max-w-md text-base leading-7 text-os-muted-paper">
        {t('register.description')}
      </p>

      <ol aria-label={t('identity.verificationEyebrow')} className="mt-6 grid list-none grid-cols-3 gap-3 border-y border-os-rule-paper py-3 text-sm text-os-muted-paper">
        <li aria-current={stage === 'details' ? 'step' : undefined} className={stage === 'details' ? 'font-semibold text-os-ink' : undefined}>1 · {t('register.displayName')}</li>
        <li aria-current={stage === 'code' ? 'step' : undefined} className={stage === 'code' ? 'font-semibold text-os-ink' : undefined}>2 · {t('register.code')}</li>
        <li aria-current={stage === 'complete' ? 'step' : undefined} className={stage === 'complete' ? 'font-semibold text-os-ink' : undefined}>3 · {t('register.completeStep')}</li>
      </ol>

      {stage === 'details' ? (
        <form className="mt-7 grid gap-6" onSubmit={handleDetails}>
          <label className="grid gap-2 text-sm font-medium text-os-ink">
            {t('register.displayName')}
            <Input
              className="h-12 rounded-none border-0 border-b border-os-rule-paper bg-transparent px-0 text-base focus-visible:border-os-vermilion-ink focus-visible:ring-0"
              name="displayName"
              autoComplete="name"
              required
              maxLength={64}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-os-ink">
            {t('register.email')}
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
            {t('register.password')}
            <Input
              className="h-12 rounded-none border-0 border-b border-os-rule-paper bg-transparent px-0 text-base focus-visible:border-os-vermilion-ink focus-visible:ring-0"
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
          <p id="signup-password-hint" className="-mt-3 text-sm leading-6 text-os-muted-paper">
            {t('register.passwordHint')}
          </p>
          <ResearchProfileFields value={researchIdentity} onChange={setResearchIdentity} />
          <Button className="min-h-12 rounded-control bg-os-vermilion-ink text-os-paper active:translate-y-px" type="submit" size="lg" disabled={pending}>
            {pending ? t('register.sending') : t('register.requestCode')}
          </Button>
        </form>
      ) : stage === 'code' ? (
        <form className="mt-7 grid gap-6" onSubmit={handleConfirmation}>
          <div className="border-y border-os-rule-paper py-4 text-sm leading-6 text-os-muted-paper">
            {t('register.codeSent', { email })}
          </div>
          <label className="grid gap-2 text-sm font-medium text-os-ink">
            {t('register.code')}
            <Input
              ref={codeInputRef}
              autoFocus
              data-code-focus-target="true"
              className="h-16 rounded-none border-0 border-b border-os-rule-paper bg-transparent px-0 font-mono text-2xl tracking-[0.28em] focus-visible:border-os-vermilion-ink focus-visible:ring-0"
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
          <Button className="min-h-12 rounded-control bg-os-vermilion-ink text-os-paper active:translate-y-px" type="submit" size="lg" disabled={pending || code.length !== 6}>
            {pending ? t('register.confirming') : t('register.confirm')}
          </Button>
          <Button type="button" variant="ghost" disabled={cooldown > 0 || pending} onClick={handleResend}>
            {cooldown > 0 ? t('register.resendIn', { seconds: cooldown }) : t('register.resend')}
          </Button>
          <Button type="button" variant="ghost" disabled={pending} onClick={() => { setStage('details'); setCode(''); setError(''); }}>
            {t('register.changeDetails')}
          </Button>
        </form>
      ) : (
        <div className="mt-7 grid gap-5" data-signup-complete="true">
          <div role="status" className="border-l-2 border-status-success-text py-2 pl-4">
            <h2 className="text-xl font-semibold text-os-ink">{t('register.completeTitle')}</h2>
            <p className="mt-2 text-sm leading-6 text-os-muted-paper">{t('register.completeBody')}</p>
          </div>
          <div className="border-y border-os-rule-paper px-1 py-4 text-sm leading-6 text-os-muted-paper">
            <strong className="text-os-ink">{t('register.nextTitle')}</strong>
            <p className="mt-1">{t('register.nextBody')}</p>
          </div>
          <Button size="lg" onClick={() => { router.replace('/me#identity'); router.refresh(); }}>
            {t('register.continueIdentity')}
          </Button>
          <Button variant="ghost" onClick={() => { router.replace(safeReturnTo(returnTo)); router.refresh(); }}>
            {t('register.continueWork')}
          </Button>
        </div>
      )}

      {stage !== 'complete' ? <p className="mt-5 text-sm leading-6 text-os-muted-paper">{t('register.privacy')}</p> : null}

      <div className="min-h-8 pt-5" aria-live="polite" data-auth-error-retryable="true">
        {error ? (
          <p role="alert" className="border-l border-status-danger-text py-2 pl-4 text-sm text-status-danger-text">
            {error}
          </p>
        ) : null}
      </div>
      <p className="mt-4 border-t border-os-rule-paper pt-5 text-sm text-os-muted-paper">
        {t('register.haveAccount')}{' '}
        <Link className="font-semibold text-os-vermilion-ink hover:underline" href={`/auth/login?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`}>
          {t('register.login')}
        </Link>
      </p>
    </section>
  );
}
