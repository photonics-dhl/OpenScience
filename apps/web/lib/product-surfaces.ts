const PRODUCT_SURFACE_STATES = ['loading', 'empty', 'error', 'forbidden', 'ready'] as const;
type ProductSurfaceState = (typeof PRODUCT_SURFACE_STATES)[number];

export type ProductSurfaceId =
  | 'overview'
  | 'sdf'
  | 'files'
  | 'versions'
  | 'collaboration'
  | 'publish'
  | 'sandbox'
  | 'settings';

export interface ProductSurfaceDeclaration {
  id: ProductSurfaceId;
  scope: 'research-object' | 'account';
  permission: 'member' | 'authenticated';
  states: readonly ProductSurfaceState[];
  mobileParity: true;
  risk: 'read' | 'write' | 'high-impact';
}

export const PRODUCT_SURFACES: readonly ProductSurfaceDeclaration[] = [
  { id: 'overview', scope: 'research-object', permission: 'member', states: PRODUCT_SURFACE_STATES, mobileParity: true, risk: 'read' },
  { id: 'sdf', scope: 'research-object', permission: 'member', states: PRODUCT_SURFACE_STATES, mobileParity: true, risk: 'write' },
  { id: 'files', scope: 'research-object', permission: 'member', states: PRODUCT_SURFACE_STATES, mobileParity: true, risk: 'write' },
  { id: 'versions', scope: 'research-object', permission: 'member', states: PRODUCT_SURFACE_STATES, mobileParity: true, risk: 'read' },
  { id: 'collaboration', scope: 'research-object', permission: 'member', states: PRODUCT_SURFACE_STATES, mobileParity: true, risk: 'write' },
  { id: 'publish', scope: 'research-object', permission: 'member', states: PRODUCT_SURFACE_STATES, mobileParity: true, risk: 'high-impact' },
  { id: 'sandbox', scope: 'research-object', permission: 'member', states: PRODUCT_SURFACE_STATES, mobileParity: true, risk: 'write' },
  { id: 'settings', scope: 'account', permission: 'authenticated', states: PRODUCT_SURFACE_STATES, mobileParity: true, risk: 'write' },
] as const;

const researchPaths: Record<Exclude<ProductSurfaceId, 'settings'>, string> = {
  overview: 'overview',
  sdf: 'edit',
  files: 'files',
  versions: 'versions',
  collaboration: 'collab',
  publish: 'publish',
  sandbox: 'sandbox',
};

export function researchSurfaceHref(id: ProductSurfaceId, objectId: string): string {
  if (id === 'settings') return '/settings';
  return `/research-objects/${objectId}/${researchPaths[id]}`;
}
