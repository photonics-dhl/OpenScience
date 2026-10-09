'use client';

import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './service-audience-menu.module.css';

export interface NavigationMenuItem { href: string; label: string; detail?: string }

export function NavigationMenu({ label, items, tone = 'paper', active = false, hint }: {
  label: string; items: readonly NavigationMenuItem[]; tone?: 'paper' | 'dark'; active?: boolean; hint?: string;
}) {
  const pathname = usePathname();
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const initialFocus = useRef(0);

  useEffect(() => { setPosition(null); }, [pathname]);
  useEffect(() => {
    if (!position) return;
    panel.current?.querySelectorAll<HTMLAnchorElement>('a')[initialFocus.current]?.focus();
    const close = () => setPosition(null);
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) close();
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { close(); trigger.current?.focus(); }
    };
    const focus = (event: FocusEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) close();
    };
    const scroll = (event: Event) => {
      if (event.target instanceof Node && panel.current?.contains(event.target)) return;
      close();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', keyboard);
    document.addEventListener('focusin', focus);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('popstate', close);
    window.addEventListener('navigation-menu-open', close);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', keyboard);
      document.removeEventListener('focusin', focus);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('popstate', close);
      window.removeEventListener('navigation-menu-open', close);
    };
  }, [position]);

  function open(index = 0) {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect || !items.length) return;
    window.dispatchEvent(new Event('navigation-menu-open'));
    initialFocus.current = index;
    const viewportWidth = Math.min(window.innerWidth, document.documentElement.clientWidth);
    const roomBelow = window.innerHeight - rect.bottom - 20;
    const above = roomBelow < 180 && rect.top > roomBelow;
    const maxHeight = Math.max(96, above ? rect.top - 20 : roomBelow);
    const estimatedHeight = Math.min(maxHeight, 72 + items.length * 58);
    setPosition({ top: above ? Math.max(12, rect.top - estimatedHeight - 8) : rect.bottom + 8,
      left: Math.max(12, Math.min(rect.left, viewportWidth - Math.min(304, viewportWidth - 24) - 12)), maxHeight });
  }

  function adjacent(direction: -1 | 1) {
    const controls = Array.from(trigger.current?.closest('header')?.querySelectorAll<HTMLElement>('a, button, summary') ?? []);
    const index = controls.indexOf(trigger.current as HTMLElement);
    setPosition(null);
    controls[index + direction]?.focus();
  }

  return <>
    <button ref={trigger} type="button" className={styles.trigger} data-tone={tone} data-active={active || undefined}
      aria-expanded={!!position} aria-controls={position ? id : undefined} aria-haspopup="true"
      onClick={() => position ? setPosition(null) : open()}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
          event.preventDefault(); open(event.key === 'ArrowUp' || event.key === 'End' ? items.length - 1 : 0);
        }
      }}>
      {label}<ChevronDown size={15} aria-hidden="true" />
    </button>
    {position && createPortal(<div ref={panel} id={id} className={styles.panel} style={position}
      onKeyDown={event => {
        const links = Array.from(panel.current?.querySelectorAll<HTMLAnchorElement>('a') ?? []);
        const current = links.indexOf(document.activeElement as HTMLAnchorElement);
        if (event.key === 'Tab') {
          if (event.shiftKey && current === 0) { event.preventDefault(); adjacent(-1); }
          if (!event.shiftKey && current === links.length - 1) { event.preventDefault(); adjacent(1); }
          return;
        }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? links.length - 1 :
          (current + (event.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
        links[next]?.focus();
      }}>
      {hint ? <p>{hint}</p> : null}
      <ul>{items.map(item => <li key={item.href}>
        <Link href={item.href} aria-current={pathname === item.href && !window.location.search ? 'page' : undefined}
          onClick={() => setPosition(null)}><span>{item.label}</span>{item.detail ? <small>{item.detail}</small> : null}</Link>
      </li>)}</ul>
    </div>, document.body)}
  </>;
}
