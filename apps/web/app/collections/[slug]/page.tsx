import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPublicEditorialCollection, PublicServerApiError } from '@/lib/public-server-api';
import { EditorialCollection } from '@/components/editorial/EditorialCollection';
import SiteHeader from '@/components/landing/SiteHeader';
import { PublicShell } from '@/components/shell/PublicShell';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  try {
    const { collection } = await getPublicEditorialCollection(params.slug);
    return { title: `${collection.title} | OpenScience`, description: collection.description };
  } catch { return { title: 'Collection | OpenScience', robots: 'noindex' }; }
}

export default async function CollectionPage({ params }: { params: { slug: string } }) {
  const shell = await getTranslations('shell');
  const publicShell = (children: React.ReactNode, mainClassName?: string) => (
    <PublicShell
      headerActions={<SiteHeader context="public-product" tone="paper" />}
      mainClassName={mainClassName}
      navigationLabel={shell('primaryNavigation')}
      skipLabel={shell('skipToContent')}
      tone="paper"
      wrapHeaderActionsOnMobile
    >
      {children}
    </PublicShell>
  );
  try {
    const { collection } = await getPublicEditorialCollection(params.slug);
    return publicShell(<EditorialCollection collection={collection} />);
  } catch (error) {
    if (error instanceof PublicServerApiError && error.status === 404) notFound();
    return publicShell(<><h1 className="font-editorial text-5xl">Collection unavailable.</h1><p className="mt-5 text-os-muted-paper">Please return to the Research Index and try again.</p></>, 'min-h-screen bg-os-paper px-6 py-24 text-os-ink');
  }
}
