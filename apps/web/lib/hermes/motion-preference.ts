export function resolveHermesReducedMotion(systemReduced: boolean, search: string): boolean {
  const preference = new URLSearchParams(search).get('hermes-motion');
  if (preference === 'full') return false;
  if (preference === 'reduced') return true;
  return systemReduced;
}
