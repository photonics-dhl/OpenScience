export type PrimaryProductRouteId = 'dashboard' | 'explore' | 'journals' | 'guide';
export const PRODUCT_PRIMARY_ROUTES: ReadonlyArray<{ href: string; id: PrimaryProductRouteId }> = [
  { href: '/dashboard', id: 'dashboard' },
  { href: '/explore', id: 'explore' },
  { href: '/journals', id: 'journals' },
  { href: '/guide', id: 'guide' },
];

export const PUBLIC_PRODUCT_ROUTES = PRODUCT_PRIMARY_ROUTES.filter(({ id }) => id !== 'dashboard');
