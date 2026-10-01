export type HermesCompanionSurface = 'navigation' | 'workspace';

const productRoots = new Set([
  'guide', 'explore', 'research', 'collections', 'auth', 'me', 'settings',
  'developers', 'trash', 'journals', 'admin', 'editorial',
]);

export function resolveHermesCompanionSurface(pathname: string): HermesCompanionSurface | null {
  if (pathname === '/') return 'navigation';
  const root = pathname.split('/')[1];
  if (root === 'dashboard' || root === 'research-objects') return 'workspace';
  return productRoots.has(root) ? 'navigation' : null;
}

// Route transitions render before an outgoing page releases its registration.
export function currentHermesPresentation<T extends { pathname: string }>(
  presentation: T | null,
  pathname: string,
): T | null {
  return presentation?.pathname === pathname ? presentation : null;
}

export function hermesPresentationCanDock(presentation: { floating?: boolean } | null): boolean {
  return presentation !== null && !presentation.floating;
}
