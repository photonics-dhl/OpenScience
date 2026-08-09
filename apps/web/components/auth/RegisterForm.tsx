'use client';

import * as React from 'react';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { authErrorCode, authErrorKey, registerAccount } from '../../lib/auth';

export default function RegisterForm({ nextPath }: { nextPath: string }) {
  const t = useTranslations('auth');
  const router = useRouter();
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [verificationHref, setVerificationHref] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get('email')).trim();
    setSubmitting(true);
    setErrorKey(null);
    setVerificationHref(null);
    try {
      await registerAccount({
        invitationCode: String(data.get('invitationCode')).trim(),
        email,
        password: String(data.get('password')),
        displayName: String(data.get('displayName')).trim(),
      });
      router.push(`/verify-email?email=${encodeURIComponent(email)}&next=${encodeURIComponent(nextPath)}`);
    } catch (error) {
      if (authErrorCode(error) === 'VERIFICATION_DELIVERY_FAILED') {
        setVerificationHref(`/verify-email?email=${encodeURIComponent(email)}&next=${encodeURIComponent(nextPath)}`);
      }
      setErrorKey(authErrorKey(authErrorCode(error)));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="auth-form auth-form--register" data-auth-form="register" onSubmit={submit}>
      <div className="auth-form__heading"><span className="eyebrow">{t('register.eyebrow')}</span><h2>{t('register.title')}</h2><p>{t('register.description')}</p></div>
      <label><span>{t('fields.invitationCode')}</span><input name="invitationCode" autoComplete="off" required /></label>
      <div className="auth-form__pair">
        <label><span>{t('fields.displayName')}</span><input name="displayName" autoComplete="name" maxLength={64} required /></label>
        <label><span>{t('fields.email')}</span><input name="email" type="email" autoComplete="email" required /></label>
      </div>
      <label><span>{t('fields.password')}</span><input name="password" type="password" autoComplete="new-password" minLength={8} required aria-describedby="password-help" /></label>
      <small id="password-help" className="auth-field-help">{t('register.passwordHelp')}</small>
      <div className="auth-form__message" role={errorKey ? 'alert' : 'status'} aria-live="polite">{errorKey ? t(errorKey) : ' '}</div>
      {verificationHref && <Link className="auth-recovery-link" href={verificationHref}>{t('actions.openVerification')}</Link>}
      <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? t('actions.creating') : t('actions.createAccount')}</button>
      <p className="auth-form__alternate">{t('register.hasAccount')} <Link href={`/login?next=${encodeURIComponent(nextPath)}`}>{t('actions.signIn')}</Link></p>
    </form>
  );
}
