'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { LOCALE_COOKIE, SUPPORTED_LOCALES, type Locale } from '../i18n/locale';

const LOCALE_NAMES: Record<Locale, string> = { zh: '中文', en: 'English' };

/** 语言切换：写入 NEXT_LOCALE cookie 并刷新服务端渲染。 */
export default function LocaleSwitcher({ locale }: { locale: Locale }) {
  const router = useRouter();
  const t = useTranslations('common');

  const handleChange = (next: string) => {
    document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=31536000`;
    router.refresh();
  };

  return (
    <select
      aria-label={t('language')}
      value={locale}
      onChange={(e) => handleChange(e.target.value)}
    >
      {SUPPORTED_LOCALES.map((l) => (
        <option key={l} value={l}>
          {LOCALE_NAMES[l]}
        </option>
      ))}
    </select>
  );
}
