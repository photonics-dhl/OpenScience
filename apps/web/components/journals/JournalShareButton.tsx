'use client';
import * as React from 'react';
import { useLocale } from 'next-intl';

export function JournalShareButton({ path, title, label }: { path: string; title: string; label?: string }) {
  const english = useLocale() === 'en';
  const [message, setMessage] = React.useState('');
  const [fallback, setFallback] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const active = React.useRef(false);
  async function share() {
    if (active.current) return;
    active.current = true; setBusy(true); setMessage(''); setFallback('');
    try {
      const url = new URL(path, window.location.origin);
      if (url.origin !== window.location.origin || !url.pathname.startsWith('/journals/') || url.pathname.startsWith('/journals/manage')) throw new Error(english ? 'Only public journal links can be shared.' : '只能分享公开期刊链接。');
      url.search = ''; url.hash = '';
      if (navigator.share) {
        try { await navigator.share({ title, url: url.href }); setMessage(english ? 'Share completed.' : '分享完成。'); return; }
        catch (error) { if (error instanceof Error && error.name === 'AbortError') return; }
      }
      try {
        if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
        await navigator.clipboard.writeText(url.href); setMessage(english ? 'Link copied.' : '链接已复制。');
      } catch { setFallback(url.href); setMessage(english ? 'Select and copy the link below.' : '请选中并复制下方链接。'); }
    } catch (error) { setMessage(error instanceof Error ? error.message : '分享失败'); }
    finally { active.current = false; setBusy(false); }
  }
  return <span className="inline-flex max-w-full flex-wrap items-center gap-3"><button type="button" disabled={busy} className="min-h-11 text-sm underline disabled:opacity-50" onClick={() => void share()}>{label || (english ? 'Share' : '分享')}</button>{message ? <span className="text-sm text-os-muted-paper" role="status">{message}</span> : null}{fallback ? <input aria-label={english ? 'Public share link' : '公开分享链接'} readOnly value={fallback} onFocus={(event) => event.target.select()} className="min-h-11 w-full border border-os-rule-paper bg-transparent px-3 text-sm" /> : null}</span>;
}
