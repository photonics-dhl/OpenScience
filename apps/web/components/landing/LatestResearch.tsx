import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getServerResearchIndex } from '@/lib/public-server-api';
import { ResearchCard } from '@/components/explore/ResearchCard';
import styles from '@/components/explore/research-discovery.module.css';

export default async function LatestResearch() {
  const t = await getTranslations('explore');
  const page = await getServerResearchIndex(3).catch(() => null);
  return <section className={styles.discovery} data-landing-module="open-ro" id="open-ro">
    <div className={styles.inner}>
      <header className={styles.heading}>
        <div><p className={styles.eyebrow}>OPEN RESEARCH</p><h2>{t('recentTitle')}</h2><p className={styles.intro}>{t('recentDescription')}</p></div>
        <Link className={styles.allLink} href="/explore">{t('browseAll')} →</Link>
      </header>
      {page?.items[0] ? <>
        <ResearchCard item={page.items[0]} prominent />
        {page.items.length > 1 ? <div className={styles.cards}>{page.items.slice(1).map(item => <ResearchCard key={item.publicId} item={item} />)}</div> : null}
      </> : <p className={styles.feedback}>{t(page ? 'empty' : 'error')}</p>}
    </div>
  </section>;
}
