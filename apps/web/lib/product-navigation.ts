export type PrimaryProductRouteId = 'dashboard' | 'explore' | 'create' | 'journals' | 'guide' | 'settings';
export const PRODUCT_PRIMARY_ROUTES: ReadonlyArray<{ href: string; id: PrimaryProductRouteId }> = [
  { href: '/dashboard', id: 'dashboard' },
  { href: '/explore', id: 'explore' },
  { href: '/research-objects/new', id: 'create' },
  { href: '/journals', id: 'journals' },
  { href: '/guide', id: 'guide' },
  { href: '/settings', id: 'settings' },
];
