'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

import { allowHeroLoop } from '@/lib/landing-motion';

export default function HeroLoopMedia() {
  const [playLoop, setPlayLoop] = useState(false);

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setPlayLoop(allowHeroLoop({ width: window.innerWidth, reducedMotion: motion.matches }));
    update();
    motion.addEventListener('change', update);
    window.addEventListener('resize', update, { passive: true });
    return () => {
      motion.removeEventListener('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return (
    <div className="absolute inset-0" data-hero-loop-policy="desktop-motion-only">
      {playLoop ? (
        <video autoPlay muted loop playsInline disablePictureInPicture preload="metadata" poster="/hero/ro-loop-poster.webp" className="absolute inset-0 h-full w-full object-contain">
          <source src="/hero/ro-loop.webm" type="video/webm" />
          <source src="/hero/ro-loop.mp4" type="video/mp4" />
        </video>
      ) : (
        <Image src="/hero/ro-loop-poster.webp" alt="" fill sizes="(min-width: 1024px) 68vw, 90vw" className="object-contain" />
      )}
    </div>
  );
}
