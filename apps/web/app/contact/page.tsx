import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import SiteHeader, { PublicProductAccess } from '@/components/landing/SiteHeader';
import { PublicShell } from '@/components/shell/PublicShell';
import { EmailDraftButton } from '@/components/contact/EmailDraftButton';
import styles from './contact.module.css';

type ContactTopic = 'contact' | 'feedback' | 'demo';
type ContactParams = { searchParams?: { topic?: string | string[] } };
const contactTopic = (value: unknown): ContactTopic => value === 'feedback' || value === 'demo' ? value : 'contact';

export async function generateMetadata({ searchParams }: ContactParams): Promise<Metadata> {
  const t = await getTranslations('aboutContact');
  return { title: `${t(`${contactTopic(searchParams?.topic)}.title`)} | OpenScience` };
}

export default async function ContactPage({ searchParams }: ContactParams) {
  const topic = contactTopic(searchParams?.topic);
  const t = await getTranslations('aboutContact');
  const navigation = await getTranslations('productNavigation');
  const shell = await getTranslations('shell');
  return <PublicShell tone="paper" includeHermesDock={false} wrapHeaderActionsOnMobile
    headerActions={<SiteHeader tone="paper" />} headerUtilities={<PublicProductAccess />}
    navigationLabel={shell('primaryNavigation')} skipLabel={shell('skipToContent')}>
    <article className={styles.page}>
      <header className={styles.intro}>
        <p className={styles.eyebrow}>{navigation('about')} / OpenScience</p>
        <h1>{t(`${topic}.title`)}</h1>
        <p className={styles.lead}>{t(`${topic}.intro`)}</p>
      </header>
      <section className={styles.details} aria-labelledby="contact-details">
        <h2 id="contact-details">{t('detailsTitle')}</h2>
        <ul>{(['hint1', 'hint2', 'hint3'] as const).map(key => <li key={key}>{t(`${topic}.${key}`)}</li>)}</ul>
        <div className={styles.mailbox}>
          <EmailDraftButton label={t(`${topic}.action`)} subject={t(`${topic}.subject`)} body={t(`${topic}.body`)}
            className={styles.action} icon={<ArrowUpRight size={18} aria-hidden="true" />} noteId="contact-mail-note" />
        </div>
        <p className={styles.note} id="contact-mail-note">{t('mailNote')}</p>
      </section>
      <nav className={styles.topics} aria-label={t('topicsLabel')}>
        {(['contact', 'feedback', 'demo'] as const).map(item => <Link key={item} href={item === 'contact' ? '/contact' : `/contact?topic=${item}`} aria-current={item === topic ? 'page' : undefined}>{t(`${item}.title`)}</Link>)}
      </nav>
    </article>
  </PublicShell>;
}
