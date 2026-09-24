/** Remove internal art-selection metadata from reader-facing plan descriptions. */
export function visibleStoryboardAction(action: string): string {
  return action.replace(/(视觉处理：)(?:HANDDRAW_STYLE=#\d{3}|BAOYU_STYLE=(?:article|infographic):[a-z0-9-]+);\s*/gu, '$1');
}
