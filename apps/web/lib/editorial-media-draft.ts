const DEFAULT_MEDIA_LICENSE = 'CC-BY-4.0';

export type EditorialMediaDraft = { type: 'image' | 'video'; url: string; alt: string; credit: string; licenseId: string; sourceUrl: string };

export function getEditorialMediaStatus(media: EditorialMediaDraft): 'empty' | 'incomplete' | 'ready' {
  const touched = media.type !== 'image' || media.licenseId !== DEFAULT_MEDIA_LICENSE
    || [media.url, media.alt, media.credit, media.sourceUrl].some(value => value.length > 0);
  if (!touched) return 'empty';
  if (![media.url, media.alt, media.credit, media.licenseId, media.sourceUrl].every(value => value.trim())) return 'incomplete';
  try {
    return new URL(media.url).protocol === 'https:' && new URL(media.sourceUrl).protocol === 'https:' ? 'ready' : 'incomplete';
  } catch { return 'incomplete'; }
}
