export const SUPPORTED_LOCALES = ['zh', 'en'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'zh';
export const LOCALE_COOKIE = 'NEXT_LOCALE';

/** 从 cookie 值或 Accept-Language 头解析受支持的 locale（§2.5 决策 5 中文优先）。 */
export function resolveLocale(raw: string | null | undefined): Locale | null {
  if (!raw) return null;
  const candidates = raw.includes(',')
    ? raw.split(',').map((part) => part.split(';')[0].trim())
    : [raw.trim()];
  for (const candidate of candidates) {
    const base = candidate.toLowerCase().split('-')[0];
    if ((SUPPORTED_LOCALES as readonly string[]).includes(base)) {
      return base as Locale;
    }
  }
  return null;
}
