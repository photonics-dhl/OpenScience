'use client';

import * as React from 'react';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { authErrorCode, authErrorKey, resendVerification, verifyAccount } from '../../lib/auth';

export default function VerifyEmailForm({ email, nextPath }: { email: string; nextPath: string }) {
  const t = useTranslations('auth');
  const router = useRouter();
  const [messageKey, setMessageKey] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get('code'));
    setSubmitting(true);
    setMessageKey(null);
    try {
      await verifyAccount({ email, code });
      router.push(nextPath);
      router.refresh();
    } catch (error) {
      setIsError(true);
      setMessageKey(authErrorKey(authErrorCode(error)));
    } finally {
      setSubmitting(false);
    }
  }

  async function resend() {
    setSubmitting(true);
    try {
      await resendVerification(email);
      setIsError(false);
      setMessageKey('verify.resent');
    } catch (error) {
      setIsError(true);
      setMessageKey(authErrorKey(authErrorCode(error)));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="auth-form" data-auth-form="verify" onSubmit={submit}>
      <div className="auth-form__heading"><span className="eyebrow">{t('verify.eyebrow')}</span><h2>{t('verify.title')}</h2><p>{t('verify.description')} <strong>{email}</strong></p></div>
      <label><span>{t('fields.code')}</span><input name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" required /></label>
      <div className="auth-form__message" role={isError ? 'alert' : 'status'} aria-live="polite">{messageKey ? t(messageKey) : ' '}</div>
      <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? t('actions.verifying') : t('actions.verify')}</button>
      <button className="auth-resend" type="button" onClick={resend} disabled={submitting}>{t('actions.resend')}</button>
    </form>
  );
}
