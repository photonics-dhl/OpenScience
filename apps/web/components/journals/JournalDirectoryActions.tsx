'use client';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { JournalAdminLink } from './JournalAdminLink';
import { JournalShareButton } from './JournalShareButton';

export function JournalDirectoryActions() {
  const english = useLocale() === 'en';
  return <nav className="journal-account-tools" aria-label={english ? 'Journal account tools' : '期刊账户操作'}>
    <Link href="/journals/apply">{english ? 'Apply to join' : '申请期刊入驻'} →</Link>
    <Link href="/journals/manage">{english ? 'Manage my journals' : '管理我的期刊'} →</Link>
    <JournalShareButton path="/journals/apply" title="OpenScience Journals" label={english ? 'Invite a journal' : '邀请期刊入驻'} />
    <JournalAdminLink />
  </nav>;
}
