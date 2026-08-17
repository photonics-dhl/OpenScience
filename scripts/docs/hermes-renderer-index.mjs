const currentRenderer = 'docs/specs/2026-08-17-hermes-workspace-companion-motion-design.md';
const deprecatedMeshRenderer = 'docs/specs/2026-08-16-hermes-articulated-mesh-pet-design.md';
const rejectedRenderer = 'docs/specs/2026-08-15-hermes-2d-pet-design.md';

export function validateHermesRendererIndex(indexText) {
  const issues = [];
  const currentCount = [...indexText.matchAll(/CURRENT Hermes visual\/guide design/g)].length;
  const currentRow = indexText.split(/\r?\n/).find((line) => line.includes(currentRenderer)) ?? '';
  const deprecatedMeshRow = indexText.split(/\r?\n/).find((line) => line.includes(deprecatedMeshRenderer)) ?? '';
  const rejectedRow = indexText.split(/\r?\n/).find((line) => line.includes(rejectedRenderer)) ?? '';

  if (currentCount !== 1) issues.push(`D: Hermes CURRENT visual/guide design 只能有一个，实际为 ${currentCount}`);
  if (!currentRow.includes('CURRENT Hermes visual/guide design')) issues.push(`D: workspace-companion 必须是唯一 CURRENT Hermes design -> ${currentRenderer}`);
  if (!deprecatedMeshRow.includes('DEPRECATED')) issues.push(`D: articulated-mesh predecessor 必须保持 DEPRECATED -> ${deprecatedMeshRenderer}`);
  if (!rejectedRow.includes('DEPRECATED / VISUAL NO-GO')) issues.push(`D: 旧 Hermes renderer 必须保持 DEPRECATED / VISUAL NO-GO -> ${rejectedRenderer}`);

  return issues;
}
