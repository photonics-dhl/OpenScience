export type HermesStageSize = 200 | 360;

export function resolveHermesStageSize(expanded: boolean, compact = false): HermesStageSize {
  if (expanded) return 360;
  return compact ? 200 : 360;
}

export function resolveHermesFloatingSize(viewportWidth: number): 168 | 200 {
  return viewportWidth > 0 && viewportWidth <= 640 ? 168 : 200;
}
