'use client';

import { Boxes, FileClock, FileText, FlaskConical, Gauge, Send, Users } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { researchSurfaceHref, type ProductSurfaceId } from '@/lib/product-surfaces';

const items: Array<{ id: Exclude<ProductSurfaceId, 'settings'>; icon: typeof Gauge }> = [
  { id: 'overview', icon: Gauge },
  { id: 'sdf', icon: FileText },
  { id: 'files', icon: Boxes },
  { id: 'versions', icon: FileClock },
  { id: 'collaboration', icon: Users },
  { id: 'publish', icon: Send },
  { id: 'sandbox', icon: FlaskConical },
];

export function ResearchWorkspaceNav({ active, objectId }: { active: Exclude<ProductSurfaceId, 'settings'>; objectId: string }) {
  const t = useTranslations('productSurfaces');
  return (
    <nav aria-label={t('navigation')} className="flex min-w-max items-stretch px-2 sm:px-4" data-research-workspace-nav="true">
      {items.map(({ id, icon: Icon }) => (
        <Link
          aria-current={active === id ? 'page' : undefined}
          className={active === id
            ? 'flex min-h-11 items-center gap-2 border-b-2 border-os-vermilion-ink px-3 text-sm font-semibold text-os-ink'
            : 'flex min-h-11 items-center gap-2 border-b-2 border-transparent px-3 text-sm text-os-muted-paper transition-colors hover:text-os-ink'}
          data-reading-role="control"
          href={researchSurfaceHref(id, objectId)}
          key={id}
        >
          <Icon aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.6} />
          <span>{t(`nav.${id}`)}</span>
        </Link>
      ))}
    </nav>
  );
}
