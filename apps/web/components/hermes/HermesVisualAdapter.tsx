'use client';

import Link from 'next/link';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';

import type { HermesVisualState } from './hermes-state';

function HermesStaticPortrait({ state }: { state: HermesVisualState }) {
  const nodes = [
    [180, 76], [264, 128], [264, 226], [180, 278], [96, 226], [96, 128],
  ];

  return (
    <svg aria-hidden="true" className="hermes-portrait h-full w-full" viewBox="0 0 360 360">
      <defs>
        <linearGradient id="hermes-scan" x1="0" x2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0" />
          <stop offset=".5" stopColor="currentColor" stopOpacity=".85" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="hermes-iris">
          <stop offset="0" stopColor="#ff4e22" stopOpacity=".95" />
          <stop offset=".28" stopColor="#ff4e22" stopOpacity=".18" />
          <stop offset="1" stopColor="#f1eee7" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g className="hermes-orbit">
        <circle cx="180" cy="177" r="116" fill="none" stroke="currentColor" strokeDasharray="1 12" strokeOpacity=".2" />
        <path d="M70 177c42-29 72-43 110-43s68 14 110 43c-42 29-72 43-110 43s-68-14-110-43Z" fill="none" stroke="currentColor" strokeOpacity=".22" />
      </g>
      <g className="hermes-nodes">
        {nodes.map(([cx, cy], index) => <circle cx={cx} cy={cy} fill={index === 0 ? '#ff4e22' : 'currentColor'} key={`${cx}-${cy}`} opacity={index === 0 ? 1 : 0.5} r={index === 0 ? 3 : 2} style={{ animationDelay: `${index * 90}ms` }} />)}
      </g>
      <g className="hermes-gaze" data-hermes-gaze="true">
        <path d="M119 177c18-31 37-47 61-47s43 16 61 47c-18 31-37 47-61 47s-43-16-61-47Z" fill="#070a0d" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="180" cy="177" fill="url(#hermes-iris)" r="43" />
        <circle className="hermes-pupil" cx="180" cy="177" fill="currentColor" r="9" />
        <path d="M151 177h58M180 148v58" stroke="currentColor" strokeOpacity=".24" strokeWidth=".8" />
      </g>
      <path className="hermes-wave" d="M48 177h53m158 0h53" fill="none" stroke="currentColor" strokeDasharray="2 7" strokeOpacity=".36" />
      <path className="hermes-scan" d="M50 106h260" stroke="url(#hermes-scan)" strokeWidth="2" data-hermes-scan={state === 'scanning' ? 'active' : 'still'} />
      <g className="hermes-caption" fill="none" stroke="currentColor" strokeOpacity=".22">
        <path d="M113 307h134" />
        <path d="M139 320h82" />
      </g>
    </svg>
  );
}

export interface HermesVisualAdapterProps {
  state: HermesVisualState;
  href: string;
}

export function HermesVisualAdapter({ state, href }: HermesVisualAdapterProps) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [interactiveReady, setInteractiveReady] = useState(false);
  const still = state === 'awaiting_approval';

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let cancelled = false;
    let timer = 0;
    const schedule = () => {
      window.clearTimeout(timer);
      if (still || media.matches) {
        setInteractiveReady(false);
        linkRef.current?.style.setProperty('--hermes-gaze-x', '0px');
        linkRef.current?.style.setProperty('--hermes-gaze-y', '0px');
        return;
      }
      timer = window.setTimeout(() => {
        if (!cancelled) setInteractiveReady(true);
      }, 0);
    };
    if (document.readyState === 'complete') schedule();
    else window.addEventListener('load', schedule, { once: true });
    media.addEventListener('change', schedule);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener('load', schedule);
      media.removeEventListener('change', schedule);
    };
  }, [still]);

  const setGaze = (event: React.PointerEvent<HTMLAnchorElement>) => {
    if (still || !interactiveReady) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - 0.5) * 2));
    const y = Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height - 0.5) * 2));
    event.currentTarget.style.setProperty('--hermes-gaze-x', `${(x * 9).toFixed(2)}px`);
    event.currentTarget.style.setProperty('--hermes-gaze-y', `${(y * 6).toFixed(2)}px`);
  };

  const resetGaze = () => {
    linkRef.current?.style.setProperty('--hermes-gaze-x', '0px');
    linkRef.current?.style.setProperty('--hermes-gaze-y', '0px');
  };

  return (
    <Link
      className="hermes-visual group relative block min-h-64 overflow-hidden border-b border-os-rule-dark text-os-paper outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion"
      href={href}
      ref={linkRef}
      data-hermes-fallback="static"
      data-hermes-renderer="original-vector"
      data-hermes-state={state}
      data-motion={still ? 'still' : 'responsive'}
      data-runtime-ready={interactiveReady ? 'true' : 'false'}
      onPointerLeave={resetGaze}
      onPointerMove={setGaze}
    >
      <span className="absolute left-0 top-0 z-10 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-os-muted-dark">Hermes / {state.replaceAll('_', ' ')}</span>
      <span className="absolute inset-x-0 bottom-3 z-10 flex items-center justify-between border-t border-os-rule-dark pt-3 text-xs text-os-muted-dark">
        <span>Research guidance</span><span className="text-os-vermilion transition-transform group-hover:translate-x-1 motion-reduce:transform-none">Open task →</span>
      </span>
      <span className="absolute inset-x-6 bottom-10 top-7 block text-os-paper" data-hermes-instance="single">
        <HermesStaticPortrait state={state} />
      </span>
    </Link>
  );
}
