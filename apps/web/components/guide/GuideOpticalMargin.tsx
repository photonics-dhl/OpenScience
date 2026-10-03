'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import type { RippleProps } from '@/components/art/CanvasRipple';

const Ripple = dynamic<RippleProps>(() => import('@/components/art/CanvasRipple').then(module => module.Ripple), { ssr: false });

gsap.registerPlugin(useGSAP);

export function GuideOpticalMargin({ className }: { className: string }) {
  const artRef = React.useRef<HTMLDivElement>(null);
  const [interactive, setInteractive] = React.useState(false);

  React.useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine)');
    const update = () => setInteractive(preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      if (artRef.current) gsap.fromTo(artRef.current, { opacity: .5, x: 10 }, { opacity: 1, x: 0, duration: .7, ease: 'power2.out', clearProps: 'opacity,transform' });
    });
    return () => media.revert();
  }, { scope: artRef });

  const artwork = <img src="/art/research-glass-ribbon.png" alt="" width={886} height={1772} decoding="async" />;
  return <div ref={artRef} className={className} aria-hidden="true">
    {interactive ? <Ripple trigger="hover" amplitude={.7} refraction={0} dispersion={0} shine={.025} decay={1.2} rings={2}>{artwork}</Ripple> : artwork}
  </div>;
}
