import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import SiteHeader, { PublicProductAccess } from '@/components/landing/SiteHeader';
import { PublicShell } from '@/components/shell/PublicShell';
import { SERVICE_AUDIENCES } from '@/lib/service-audiences';
import styles from '../services.module.css';

export default async function AudiencePage({ params }: { params: { audience: string } }) {
  const audience = SERVICE_AUDIENCES.find(item => item === params.audience && item !== 'researchers');
  if (!audience) notFound();
  const t = await getTranslations('services');
  const shell = await getTranslations('shell');
  return <PublicShell tone="paper" includeHermesDock={false} wrapHeaderActionsOnMobile
    headerActions={<SiteHeader context="public-product" tone="paper" />} headerUtilities={<PublicProductAccess />}
    navigationLabel={shell('primaryNavigation')} skipLabel={shell('skipToContent')}>
    <div className={styles.page}>
      <header className={styles.intro}>
        <p className={styles.eyebrow}>{t('navigation')}</p>
        <h1>{t(`audiences.${audience}.english`)}</h1>
        <p className={styles.lead}>{t(`audiences.${audience}.description`)}</p>
      </header>
      <section className={styles.serviceBody}>
        <h2>{t(`audiences.${audience}.heading`)}</h2>
        <p>{t(`audiences.${audience}.body`)}</p>
        <Link href={audience === 'journals' ? '/journals' : '/explore'} className={styles.action}>
          {t(audience === 'journals' ? 'journalDirectory' : 'explore')}<ArrowRight size={17} aria-hidden="true" />
        </Link>
        <Link className={styles.secondary} href="/who-we-serve/researchers">{t('researcherLink')}<ArrowRight size={16} aria-hidden="true" /></Link>
      </section>
    </div>
  </PublicShell>;
}
