import Link from 'next/link';
import * as React from 'react';
import type { EditorialCollectionApi } from '@/lib/api';
import { useTranslations } from 'next-intl';

export function EditorialCollection({ collection }: { collection: EditorialCollectionApi }) {
  const t = useTranslations('editorial');
  return (
    <section className="min-h-screen bg-os-paper px-4 py-12 text-os-ink sm:px-8 lg:px-16 lg:py-20" data-editorial-collection="true">
      <div className="mx-auto max-w-[112rem]">
        <div className="flex items-start justify-between gap-8 border-b border-os-rule-paper pb-5">
          <Link href="/" className="font-data text-xs uppercase tracking-[0.18em] text-os-ink no-underline hover:text-os-vermilion">OpenScience.</Link>
          <span className="font-data text-[0.65rem] uppercase tracking-[0.18em] text-os-muted-paper">{t('edition')}</span>
        </div>
        <header className="grid gap-10 border-b border-os-rule-paper py-16 lg:grid-cols-[1.15fr_0.85fr] lg:items-end lg:py-24">
          <div>
            <p className="mb-5 font-data text-xs uppercase tracking-[0.2em] text-os-vermilion">{t('eyebrow')}</p>
            <h1 className="m-0 max-w-5xl font-editorial text-[clamp(4rem,10vw,10.5rem)] font-normal leading-[0.82] tracking-[-0.07em]">{collection.title}</h1>
          </div>
          <p className="m-0 max-w-xl text-lg leading-8 text-os-muted-paper">{t('description')}</p>
        </header>
        <div className="grid gap-10 py-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <ol className="m-0 list-none p-0">
            {collection.selections.length === 0 ? <li className="border-b border-os-rule-paper py-12 font-editorial text-3xl">{t('empty')}</li> : null}
            {collection.selections.map((selection, index) => (
              <li key={selection.id} className="border-b border-os-rule-paper py-8 first:pt-0 lg:py-10">
                <Link href={`/research/${selection.publicId}/v/${selection.versionNo}`} className="group grid gap-5 no-underline outline-none focus-visible:ring-2 focus-visible:ring-os-vermilion lg:grid-cols-[4rem_minmax(0,1fr)_15rem]">
                  <span className="font-data text-xs text-os-vermilion">{String(index + 1).padStart(2, '0')}</span>
                  <span>
                    <span className="block font-editorial text-4xl leading-[0.95] tracking-[-0.04em] text-os-ink transition-colors group-hover:text-os-vermilion sm:text-6xl">{selection.title}</span>
                    <span className="mt-5 block max-w-3xl text-sm leading-7 text-os-muted-paper">{selection.note || t('defaultNote')}</span>
                    <span className="mt-5 block font-data text-[0.65rem] uppercase tracking-[0.16em] text-os-muted-paper">{selection.publicId} · v{selection.versionNo}</span>
                  </span>
                  <span className="grid content-start gap-3 font-data text-[0.65rem] uppercase tracking-[0.12em] text-os-muted-paper lg:text-right">
                    <span>{selection.media.length ? t('mediaCount', { count: selection.media.length }) : t('noMedia')}</span>
                    <span>{t('selected')}</span>
                    <span className="text-os-vermilion">{t('read')} ↗</span>
                  </span>
                </Link>
                {selection.media.length > 0 ? (
                  <div className="mt-7 grid gap-3 sm:grid-cols-2">
                    {selection.media.map((media) => (
                      <figure key={`${selection.id}-${media.url}`} className="m-0 border border-os-rule-paper bg-white p-2">
                        {media.type === 'image' ? <img className="aspect-[16/9] w-full object-cover" src={media.url} alt={media.alt} loading="lazy" /> : <video className="aspect-[16/9] w-full object-cover" src={media.url} controls preload="metadata" aria-label={media.alt} />}
                        <figcaption className="px-2 py-3 font-data text-[0.62rem] leading-5 text-os-muted-paper">{media.credit} · {media.licenseId} · <a href={media.sourceUrl} rel="noreferrer">{t('source')}</a></figcaption>
                      </figure>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
          <aside className="border-t border-os-rule-paper pt-5 lg:border-l lg:border-t-0 lg:pl-7">
            <p className="m-0 font-data text-[0.65rem] uppercase tracking-[0.18em] text-os-vermilion">{t('editorialNote')}</p>
            <p className="mt-5 text-sm leading-7 text-os-muted-paper">{t('disclosure')}</p>
            <Link href="/explore" className="mt-8 inline-block border-b border-os-ink pb-1 text-sm font-semibold text-os-ink no-underline hover:border-os-vermilion hover:text-os-vermilion">{t('browse')} ↗</Link>
          </aside>
        </div>
      </div>
    </section>
  );
}
