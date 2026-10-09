'use client';

import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SERVICE_AUDIENCES } from '@/lib/service-audiences';
import styles from './service-audience-menu.module.css';

export function ServiceAudienceMenu({ tone = 'paper' }: { tone?: 'paper' | 'dark' }) {
  const t = useTranslations('services');
  const pathname = usePathname();
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const active = pathname.startsWith('/who-we-serve');

  useEffect(() => { setPosition(null); }, [pathname]);
  useEffect(() => {
    if (!position) return;
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) setPosition(null);
    }
    function keyboard(event: KeyboardEvent) {
      if (event.key === 'Escape') { setPosition(null); trigger.current?.focus(); }
    }
    function focus(event: FocusEvent) {
      if (event.target instanceof Node && !panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) setPosition(null);
    }
    function reposition() { setPosition(null); }
    function scroll(event: Event) {
      if (event.target instanceof Node && panel.current?.contains(event.target)) return;
      setPosition(null);
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', keyboard);
    document.addEventListener('focusin', focus);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', keyboard);
      document.removeEventListener('focusin', focus);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', scroll, true);
    };
  }, [position]);

  function open() {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({ top: rect.bottom + 8, left: Math.max(12, Math.min(rect.left, window.innerWidth - 316)) });
  }

  return <>
    <button ref={trigger} type="button" className={styles.trigger} data-tone={tone} data-active={active || undefined}
      aria-expanded={!!position} aria-controls={position ? id : undefined}
      onClick={() => position ? setPosition(null) : open()}
      onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); open(); } }}>
      {t('navigation')}<ChevronDown size={15} aria-hidden="true" />
    </button>
    {position && createPortal(<div ref={panel} id={id} className={styles.panel} style={position}
      onKeyDown={event => {
        const links = Array.from(panel.current?.querySelectorAll('a') ?? []);
        if (event.key === 'Tab') {
          const atStart = document.activeElement === links[0];
          const atEnd = document.activeElement === links[links.length - 1];
          if ((event.shiftKey && atStart) || (!event.shiftKey && atEnd)) {
            event.preventDefault(); setPosition(null);
            const next = trigger.current?.closest('li')?.nextElementSibling?.querySelector<HTMLAnchorElement>('a');
            if (event.shiftKey || !next) trigger.current?.focus(); else next.focus();
          }
          return;
        }
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        const current = links.indexOf(document.activeElement as HTMLAnchorElement);
        links[(current + (event.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length]?.focus();
      }}>
      <p>{t('navigationHint')}</p>
      <ul>{SERVICE_AUDIENCES.map((audience, index) => <li key={audience}>
        <Link href={`/who-we-serve/${audience}`} ref={index === 0 ? node => { node?.focus(); } : undefined}
          aria-current={pathname === `/who-we-serve/${audience}` ? 'page' : undefined} onClick={() => setPosition(null)}>
          <span>{t(`audiences.${audience}.name`)}</span>{t(`audiences.${audience}.name`) !== t(`audiences.${audience}.english`) ? <small>{t(`audiences.${audience}.english`)}</small> : null}
        </Link>
      </li>)}</ul>
    </div>, document.body)}
  </>;
}
