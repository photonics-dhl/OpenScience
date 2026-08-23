export type HermesStageSize = 176 | 336;

export function resolveHermesStageSize(compactGuide: boolean, hasGuide: boolean): HermesStageSize {
  return compactGuide && hasGuide ? 176 : 336;
}
