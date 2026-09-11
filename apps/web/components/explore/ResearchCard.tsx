import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ResearchIndexItemApi } from '@/lib/api';
import styles from './research-discovery.module.css';

export function ResearchCard({ item, prominent = false }: { item: ResearchIndexItemApi; prominent?: boolean }) {
  const t = useTranslations('explore');
  return <article className={`${styles.card} ${prominent ? styles.prominent : ''}`}>
    <Link href={item.url} className={styles.cardLink}>
      {item.thumbnail ? <div className={styles.cover}><img src={item.thumbnail.url} alt={t('imageFor', { title: item.title })} loading="lazy" decoding="async" /></div> : null}
      <div className={styles.cardBody}>
        <p className={styles.meta}>{item.publicId}<span>v{item.latestVersion}</span>{item.publishedAt ? <time dateTime={item.publishedAt}>{item.publishedAt.slice(0, 10)}</time> : null}</p>
        <h2>{item.title}</h2>
        {item.insight ? <p className={styles.abstract}>{item.insight}</p> : null}
        <p className={styles.authors}>{item.authors.join(' · ') || t('unknownAuthor')}</p>
        <span className={styles.read}>{t('readResearch')} <span aria-hidden="true">↗</span></span>
      </div>
    </Link>
  </article>;
}
