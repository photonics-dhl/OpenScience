'use client';

import Link from 'next/link';
import * as React from 'react';
import { useEffect, useState } from 'react';

import type { HermesVisualState } from './hermes-state';

function HermesStaticPortrait({ state }: { state: HermesVisualState }) {
  return (
    <svg aria-hidden="true" className="h-full w-full" viewBox="0 0 360 420">
      <defs>
        <linearGradient id="hermes-scan" x1="0" x2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0" />
          <stop offset=".5" stopColor="currentColor" stopOpacity=".85" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M67 357C89 291 99 190 180 131c81 59 91 160 113 226" fill="none" stroke="currentColor" strokeOpacity=".28" />
      <path d="M124 171c0-48 24-88 56-88s56 40 56 88c0 35-25 75-56 75s-56-40-56-75Z" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M123 157c22-11 46-28 61-53 9 19 27 37 53 50M146 178h22m24 0h22m-45 31c8 5 15 5 23 0" fill="none" stroke="currentColor" strokeLinecap="round" />
      <path d="M86 318h188M100 338h160" stroke="currentColor" strokeOpacity=".18" />
      <path d="M54 270h252" stroke="url(#hermes-scan)" strokeWidth="2" data-hermes-scan={state === 'scanning' ? 'active' : 'still'} />
      <circle cx="180" cy="178" r="108" fill="none" stroke="currentColor" strokeDasharray="1 11" strokeOpacity=".22" />
    </svg>
  );
}

export interface HermesVisualAdapterProps {
  state: HermesVisualState;
  href: string;
}

export function HermesVisualAdapter({ state, href }: HermesVisualAdapterProps) {
  const [runtimeReady, setRuntimeReady] = useState(false);
  const still = state === 'awaiting_approval';

  useEffect(() => {
    if (still || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let cancelled = false;
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        if (!cancelled) setRuntimeReady(true);
      }, 0);
    };
    if (document.readyState === 'complete') schedule();
    else window.addEventListener('load', schedule, { once: true });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener('load', schedule);
    };
  }, [still]);

  return (
    <Link
      className="group relative block min-h-64 overflow-hidden border-b border-os-rule-dark text-os-paper outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion"
      href={href}
      data-hermes-fallback="static"
      data-motion={still ? 'still' : 'responsive'}
      data-runtime-ready={runtimeReady ? 'true' : 'false'}
    >
      <span className="absolute left-0 top-0 z-10 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-os-muted-dark">Hermes / {state.replaceAll('_', ' ')}</span>
      <span className="absolute inset-x-0 bottom-3 z-10 flex items-center justify-between border-t border-os-rule-dark pt-3 text-xs text-os-muted-dark">
        <span>Research guidance</span><span className="text-os-vermilion transition-transform group-hover:translate-x-1 motion-reduce:transform-none">Open task →</span>
      </span>
      <span className="absolute inset-x-6 bottom-10 top-7 block text-os-paper" data-live2d-instance="single">
        <HermesStaticPortrait state={state} />
      </span>
    </Link>
  );
}
