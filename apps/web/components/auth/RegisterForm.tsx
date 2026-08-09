'use client';

import * as React from 'react';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { authErrorCode, authErrorKey, confirmSignup, requestSignupCode } from '../../lib/auth';

export default function RegisterForm({ nextPath }: { nextPath: string }) {
  const t = useTranslations('auth');
  const router = useRouter();
  const [step, setStep] = useState<'request' | 'confirm'>('request');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true); setErrorKey(null);
    try { await requestSignupCode({ email, displayName }); setStep('confirm'); }
    catch (error) { setErrorKey(authErrorKey(authErrorCode(error))); }
    finally { setSubmitting(false); }
  }

  async function submitConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSubmitting(true); setErrorKey(null);
    try {
      await confirmSignup({ email, displayName, code: String(data.get('code')).trim(), password: String(data.get('password')) });
      router.push(nextPath);
    } catch (error) { setErrorKey(authErrorKey(authErrorCode(error))); }
    finally { setSubmitting(false); }
  }

  return <form className="auth-form auth-form--register" data-auth-form="register" onSubmit={step === 'request' ? submitRequest : submitConfirm}>
    <div className="auth-form__heading"><span className="eyebrow">{t('register.eyebrow')}</span><h2>{t('register.title')}</h2><p>{step === 'request' ? t('register.description') : t('register.codeSent', { email })}</p></div>
    <div className="auth-stepper" aria-label={t('register.stepsLabel')}><span className={step === 'request' ? 'is-active' : 'is-done'}>01&nbsp; {t('register.steps.request')}</span><span className={step === 'confirm' ? 'is-active' : ''}>02&nbsp; {t('register.steps.confirm')}</span></div>
    {step === 'request' ? <>
      <div className="auth-form__pair"><label><span>{t('fields.displayName')}</span><input name="displayName" value={displayName} onChange={e => setDisplayName(e.target.value)} autoComplete="name" maxLength={64} required /></label><label><span>{t('fields.email')}</span><input name="email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></label></div>
      <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? t('actions.requesting') : t('actions.requestCode')}</button>
    </> : <>
      <div className="auth-email-chip"><span>{email}</span><button type="button" onClick={() => setStep('request')}>{t('actions.changeEmail')}</button></div>
      <label><span>{t('fields.code')}</span><input name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" required /></label>
      <label><span>{t('fields.password')}</span><input name="password" type="password" autoComplete="new-password" minLength={8} required aria-describedby="password-help" /></label><small id="password-help" className="auth-field-help">{t('register.passwordHelp')}</small>
      <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? t('actions.confirming') : t('actions.confirmAndEnter')}</button>
      <button className="auth-link-button" type="button" disabled={submitting} onClick={() => void requestSignupCode({ email, displayName })}>{t('actions.resend')}</button>
    </>}
    <div className="auth-form__message" role={errorKey ? 'alert' : 'status'} aria-live="polite">{errorKey ? t(errorKey) : ' '}</div>
    <p className="auth-form__alternate">{t('register.hasAccount')} <Link href={`/login?next=${encodeURIComponent(nextPath)}`}>{t('actions.signIn')}</Link></p>
  </form>;
}
