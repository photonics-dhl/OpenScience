'use client';

import * as React from 'react';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { authErrorCode, authErrorKey, loginAccount } from '../../lib/auth';

export default function LoginForm({ nextPath }: { nextPath: string }) {
  const t = useTranslations('auth');
  const router = useRouter();
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSubmitting(true);
    setErrorKey(null);
    try {
      await loginAccount({ email: String(data.get('email')), password: String(data.get('password')) });
      router.push(nextPath);
      router.refresh();
    } catch (error) {
      setErrorKey(authErrorKey(authErrorCode(error)));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="auth-form" data-auth-form="login" onSubmit={submit}>
      <div className="auth-form__heading"><span className="eyebrow">{t('login.eyebrow')}</span><h2>{t('login.title')}</h2><p>{t('login.description')}</p></div>
      <label><span>{t('fields.email')}</span><input name="email" type="email" autoComplete="email" required /></label>
      <label><span>{t('fields.password')}</span><input name="password" type="password" autoComplete="current-password" required /></label>
      <div className="auth-form__message" role={errorKey ? 'alert' : 'status'} aria-live="polite">{errorKey ? t(errorKey) : ' '}</div>
      <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? t('actions.signingIn') : t('actions.signIn')}</button>
      <p className="auth-form__alternate">{t('login.noAccount')} <Link href={`/register?next=${encodeURIComponent(nextPath)}`}>{t('actions.register')}</Link></p>
    </form>
  );
}
