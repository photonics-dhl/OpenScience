export type HermesStageSize = 200 | 360;

export function resolveHermesStageSize(expanded: boolean, compact = false): HermesStageSize {
  if (expanded) return 360;
  return compact ? 200 : 360;
}

export function resolveHermesFloatingSize(viewportWidth: number, viewportHeight = 0, expanded = false): number {
  const available = [viewportWidth, viewportHeight]
    .filter((dimension) => dimension > 0)
    .map((dimension) => Math.max(120, dimension - 24));
  return Math.min(!expanded && viewportWidth > 0 && viewportWidth <= 1100 ? 120 : 360, ...available);
}
