import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, FileSearch, NotebookPen, Telescope, UserRound } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import SiteHeader, { PublicProductAccess } from '@/components/landing/SiteHeader';
import { PublicShell } from '@/components/shell/PublicShell';
import { RESEARCHER_ACTIONS } from '@/lib/service-audiences';
import styles from '../services.module.css';

export const metadata: Metadata = { title: 'Researchers | OpenScience' };
const icons = { profile: UserRound, published: FileSearch, preprint: NotebookPen, explore: Telescope };

export default async function ResearchersPage() {
  const t = await getTranslations('services');
  const shell = await getTranslations('shell');
  return <PublicShell tone="paper" includeHermesDock={false} wrapHeaderActionsOnMobile
    headerActions={<SiteHeader context="public-product" tone="paper" />} headerUtilities={<PublicProductAccess />}
    navigationLabel={shell('primaryNavigation')} skipLabel={shell('skipToContent')}>
    <div className={styles.page}>
      <header className={styles.intro}>
        <p className={styles.eyebrow}>{t('navigation')}<span aria-hidden="true"> / </span>{t('audiences.researchers.name')}</p>
        <h1>Researchers</h1>
        <p className={styles.lead}>{t('researchers.description')}</p>
        <p className={styles.researcherTagline}>{t('researchers.tagline')}</p>
      </header>
      <section className={`${styles.grid} ${styles.researcherRows}`} aria-label={t('researchers.actionsLabel')}>
        {RESEARCHER_ACTIONS.map(({ id, href }) => {
          const Icon = icons[id];
          return <article className={styles.researcherRow} key={id}>
            <div className={styles.researcherRowTitle}><Icon size={22} strokeWidth={1.6} aria-hidden="true" /><h2>{t(`researchers.cards.${id}.title`)}</h2></div>
            <p className={styles.researcherRowDescription}>{t(`researchers.cards.${id}.description`)}</p>
            <Link href={href} className={`${styles.action} ${styles.researcherAction}`} aria-label={t(`researchers.cards.${id}.action`)}>
              {t('getStarted')}<ArrowRight size={17} aria-hidden="true" />
            </Link>
          </article>;
        })}
      </section>
      <p className={styles.privacy}>{t('researchers.accessNote')}</p>
      <section className={styles.faq} aria-labelledby="researchers-faq">
        <h2 id="researchers-faq">{t('researchers.faqTitle')}</h2>
        {['fields', 'types', 'ai', 'publish'].map(id => <details key={id}>
          <summary>{t(`researchers.faq.${id}.question`)}</summary><p>{t(`researchers.faq.${id}.answer`)}</p>
        </details>)}
      </section>
    </div>
  </PublicShell>;
}
