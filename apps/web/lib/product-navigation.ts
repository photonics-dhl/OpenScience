export type PrimaryProductRouteId = 'explore';
export const PRODUCT_PRIMARY_ROUTES: ReadonlyArray<{ href: string; id: PrimaryProductRouteId }> = [
  { href: '/explore', id: 'explore' },
];

export const PRODUCT_FEATURE_ROUTES = [
  { href: '/me/profile', id: 'featureProfile' },
  { href: '/research-objects/new?type=published', id: 'featurePublished' },
  { href: '/research-objects/new?type=preprint', id: 'featurePreprint' },
] as const;

export const PRODUCT_ABOUT_ROUTES = [
  { href: '/contact', id: 'contact' },
  { href: '/contact?topic=feedback', id: 'feedback' },
  { href: '/contact?topic=demo', id: 'analysisDemo' },
  { href: '/developers', id: 'apiAccess' },
] as const;

export const PUBLIC_PRODUCT_ROUTES = PRODUCT_PRIMARY_ROUTES;
