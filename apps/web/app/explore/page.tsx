import { getTranslations } from 'next-intl/server';
import SiteHeader from '@/components/landing/SiteHeader';
import { ResearchIndex } from '@/components/explore/ResearchIndex';
import { PublicShell } from '@/components/shell/PublicShell';
import { getServerResearchIndex } from '@/lib/public-server-api';
import styles from '@/components/explore/research-discovery.module.css';

export default async function ExplorePage() {
  const shell = await getTranslations('shell');
  const t = await getTranslations('explore');
  const page = await getServerResearchIndex().catch(() => undefined);
  return <PublicShell headerActions={<SiteHeader active="explore" context="public-product" tone="paper" />} navigationLabel={shell('primaryNavigation')} skipLabel={shell('skipToContent')} tone="paper" wrapHeaderActionsOnMobile>
    <section className={styles.discovery} data-explore-index="true"><div className={styles.inner}>
      <header className={styles.heading}><div><p className={styles.eyebrow}>{t('eyebrow')}</p><h1>{t('title')}</h1><p className={styles.intro}>{t('description')}</p></div></header>
      <ResearchIndex initialPage={page} />
    </div></section>
  </PublicShell>;
}
