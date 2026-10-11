'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

const validEmail = /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/;

export function EmailDraftButton({ label, subject, body, className, icon, noteId, requestKey = '', validate }: {
  label: string;
  subject: string;
  body: string;
  className?: string;
  icon?: ReactNode;
  noteId?: string;
  requestKey?: string;
  validate?: () => boolean;
}) {
  const t = useTranslations('emailDraft');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const fingerprint = `${requestKey}\u0000${subject}\u0000${body}`;
  const currentFingerprint = useRef(fingerprint);
  currentFingerprint.current = fingerprint;

  useEffect(() => {
    setBusy(false);
    setError(false);
    return () => { controller.current?.abort(); controller.current = null; };
  }, [fingerprint]);

  async function openDraft() {
    if (controller.current || (validate && !validate())) return;
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setError(false);
    try {
      const response = await fetch('/contact/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-OpenScience-Contact-Intent': 'compose' },
        body: JSON.stringify({ intent: 'compose' }),
        credentials: 'same-origin',
        cache: 'no-store',
        signal: request.signal,
      });
      if (!response.ok) throw new Error('contact-unavailable');
      const result: unknown = await response.json();
      const email = result && typeof result === 'object' && 'email' in result ? (result as { email: unknown }).email : null;
      if (typeof email !== 'string' || !validEmail.test(email)) throw new Error('invalid-contact');
      if (request.signal.aborted || currentFingerprint.current !== fingerprint) return;
      window.location.assign(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
    } catch {
      if (!request.signal.aborted && currentFingerprint.current === fingerprint) setError(true);
    } finally {
      if (controller.current === request) controller.current = null;
      if (!request.signal.aborted && currentFingerprint.current === fingerprint) setBusy(false);
    }
  }

  return <div>
    <button type="button" className={className} aria-describedby={noteId} disabled={busy} onClick={() => void openDraft()}>
      {busy ? t('opening') : error ? t('retry') : label}{!busy && icon}
    </button>
    {error ? <p role="alert">{t('failed')}</p> : null}
  </div>;
}
