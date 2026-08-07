'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import LocaleSwitcher from '../LocaleSwitcher';
import type { Locale } from '../../i18n/locale';

const linkClassName =
  'whitespace-nowrap rounded-sm px-1 py-1.5 text-xs text-hero-muted no-underline transition-colors hover:text-hero-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-hero-bg sm:px-2 sm:text-sm';

export default function SiteHeader() {
  const t = useTranslations('landing');
  const locale = useLocale() as Locale;
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const updateScrollState = () => {
      setIsScrolled(window.scrollY > 24);
    };

    updateScrollState();
    window.addEventListener('scroll', updateScrollState, { passive: true });

    return () => {
      window.removeEventListener('scroll', updateScrollState);
    };
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 border-b border-transparent ${
        isScrolled ? 'bg-hero-bg/80 backdrop-blur' : 'bg-transparent'
      }`}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-y-3 px-5 py-4 sm:flex-nowrap sm:justify-between sm:px-6">
        <a
          href="/"
          aria-label="OpenScience"
          className="flex items-center gap-2 rounded-sm no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-hero-bg sm:gap-3"
        >
          <span className="h-8 w-8 shrink-0 overflow-hidden rounded-[7px]" aria-hidden="true">
            <img src="/logo.svg" alt="" className="h-8 w-40 max-w-none" />
          </span>
          <span className="font-display text-base font-semibold text-hero-text sm:text-lg">
            OpenScience
          </span>
        </a>

        <nav className="w-full sm:w-auto sm:shrink-0">
          <div className="flex flex-wrap items-center justify-start gap-1 sm:justify-end md:gap-3">
            <a href="/#latest" className={linkClassName}>
              {t('nav.explore')}
            </a>
            <a href="/login?next=/research-objects/new" className={linkClassName}>
              {t('nav.create')}
            </a>
            <a href="/#trust" className={linkClassName}>
              {t('nav.about')}
            </a>
            <a href="/login" className={linkClassName}>
              {t('nav.login')}
            </a>
            <LocaleSwitcher locale={locale} />
          </div>
        </nav>
      </div>
    </header>
  );
}
