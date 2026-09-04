'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { cn } from '@/lib/utils';

export type ProductRouteId = 'dashboard' | 'explore' | 'create' | 'settings' | 'profile';

const productRoutes: ReadonlyArray<{ href: string; id: ProductRouteId }> = [
  { href: '/dashboard', id: 'dashboard' },
  { href: '/explore', id: 'explore' },
  { href: '/research-objects/new', id: 'create' },
  { href: '/settings', id: 'settings' },
];

const identityRoutes = productRoutes.filter(({ id }) => id === 'explore' || id === 'dashboard');

export function ProductRouteNavigation({
  active,
  variant = 'product',
}: {
  active?: ProductRouteId;
  variant?: 'identity' | 'product';
}) {
  const t = useTranslations('productNavigation');
  const routes = variant === 'identity' ? identityRoutes : productRoutes;

  return (
    <ul
      className={cn(
        'm-0 grid w-full list-none items-stretch gap-1 p-0 sm:flex sm:min-w-max',
        variant === 'identity' ? 'grid-cols-2' : 'grid-cols-4',
      )}
      data-product-route-navigation="true"
    >
      {routes.map(({ href, id }) => (
        <li className="flex min-w-0" key={id}>
          <Link
            aria-current={active === id ? 'page' : undefined}
            className={active === id
              ? 'inline-flex min-h-11 min-w-0 flex-1 items-center justify-center whitespace-nowrap border-b-2 border-os-vermilion-ink px-1 text-xs font-semibold text-os-ink no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring sm:px-3 sm:text-sm'
              : 'inline-flex min-h-11 min-w-0 flex-1 items-center justify-center whitespace-nowrap border-b-2 border-transparent px-1 text-xs text-os-muted-paper no-underline transition-colors hover:text-os-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring sm:px-3 sm:text-sm'}
            data-reading-role="control"
            href={href}
          >
            <span className="sm:hidden">{t(`${id}Short`)}</span>
            <span className="hidden sm:inline">{t(id)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
