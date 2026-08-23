export type HermesStageSize = 176 | 336;

export function resolveHermesStageSize(expanded: boolean, compact = false): HermesStageSize {
  if (expanded) return 336;
  return compact ? 176 : 336;
}
