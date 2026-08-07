import Image from 'next/image';
import { useTranslations } from 'next-intl';

import { Button } from '../ui/button';

type HeroProps = {
  symbolVariant: 'sculptural' | 'interface';
};

export default function Hero({ symbolVariant }: HeroProps) {
  const t = useTranslations('landing');

  return (
    <section
      data-landing-module="hero"
      data-symbol-variant={symbolVariant}
      className="relative isolate min-h-screen overflow-hidden bg-hero-bg text-hero-text"
    >
      {/* Ambient floor (generated asset) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[url('/hero/hero-ambient.webp')] bg-cover bg-center"
      />
      {/* Legibility veil: darker left for copy, fade to base at the bottom */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(3,6,11,0.76)_0%,rgba(3,6,11,0.38)_38%,rgba(3,6,11,0)_64%),linear-gradient(180deg,rgba(3,6,11,0)_68%,#03060b_100%)]"
      />

      {/* Core symbol: seamless loop video (Gemini-generated), screen-blended so the black base disappears.
          Static poster is the LCP paint and the prefers-reduced-motion fallback. */}
      <div
        aria-hidden="true"
        className="landing-symbol-in pointer-events-none absolute right-[-12%] top-1/2 hidden -translate-y-1/2 lg:block"
        style={{ animationDelay: '350ms' }}
      >
        <div className="hero-symbol-breathe relative aspect-square h-[min(108vh,1200px)] mix-blend-screen [mask-image:radial-gradient(circle,black_60%,transparent_88%)]">
          <video
            autoPlay
            muted
            loop
            playsInline
            disablePictureInPicture
            preload="metadata"
            poster="/hero/ro-loop-poster.webp"
            className="absolute inset-0 h-full w-full object-contain motion-reduce:hidden"
          >
            <source src="/hero/ro-loop.webm" type="video/webm" />
            <source src="/hero/ro-loop.mp4" type="video/mp4" />
          </video>
          <Image
            src="/hero/ro-loop-poster.webp"
            alt=""
            fill
            sizes="(min-width: 1024px) 68vw, 90vw"
            className="hidden object-contain motion-reduce:block"
          />
        </div>
        {/* provenance cues: historical version labels along the symbol's left arc */}
        <div className="absolute -left-2 top-[30%] font-mono text-[10px] tracking-[0.2em] text-hero-muted/40">
          v0.1
        </div>
        <div className="absolute -left-8 top-[46%] font-mono text-[10px] tracking-[0.2em] text-hero-muted/40">
          v0.2
        </div>
        <div className="absolute -left-2 top-[62%] font-mono text-[10px] tracking-[0.2em] text-hero-muted/40">
          v0.3
        </div>
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col justify-center px-5 pb-28 pt-32 sm:px-6 lg:pb-24 lg:pt-28">
        <div className="max-w-2xl">
          <div
            className="landing-reveal mb-7 inline-flex items-center gap-2 rounded-full border border-border-subtle bg-hero-surface/70 px-3 py-1 text-xs text-hero-muted"
            style={{ animationDelay: '60ms' }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-accent-primary motion-safe:animate-pulse" />
            {t('hero.hermesStatus')}
          </div>
          <h1
            className="landing-reveal whitespace-pre-line font-display text-5xl font-black leading-[1.12] text-hero-text sm:text-6xl lg:text-7xl xl:text-8xl"
            style={{ animationDelay: '140ms' }}
          >
            {t('hero.title')}
          </h1>
          <p
            className="landing-reveal mt-7 max-w-xl text-base leading-8 text-hero-muted sm:text-lg"
            style={{ animationDelay: '220ms' }}
          >
            {t('hero.subtitle')}
          </p>
        </div>

        {/* Mobile: static poster frame of the loop video (bandwidth-friendly) */}
        <div
          aria-hidden="true"
          className="landing-symbol-in pointer-events-none relative mx-auto my-8 aspect-square w-72 mix-blend-screen [mask-image:radial-gradient(circle,black_60%,transparent_88%)] sm:w-80 lg:hidden"
          style={{ animationDelay: '250ms' }}
        >
          <Image
            src="/hero/ro-loop-poster.webp"
            alt=""
            fill
            sizes="80vw"
            className="object-contain"
          />
        </div>

        <div
          className="landing-reveal mt-9 flex flex-wrap gap-4"
          style={{ animationDelay: '300ms' }}
        >
          <Button
            asChild
            size="lg"
            className="min-w-40 rounded-md text-base font-semibold shadow-[0_10px_36px_rgba(42,109,255,0.4)]"
          >
            <a href="/#latest">{t('hero.ctaExplore')}</a>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="min-w-44 rounded-md border-hero-muted/40 bg-hero-surface/40 text-base text-hero-text backdrop-blur hover:bg-hero-surface"
          >
            <a href="/login?next=/research-objects/new">{t('hero.ctaCreate')}</a>
          </Button>
        </div>
      </div>
    </section>
  );
}
