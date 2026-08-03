import type { DiffChange } from './types';

/** 许可证与可见性变化（§7.3）：任一字段变化 → license change。 */
export function diffLicenseVisibility(
  path: string,
  before: { license?: string; visibility?: string },
  after: { license?: string; visibility?: string },
): DiffChange[] {
  const changes: DiffChange[] = [];
  if (before.license !== after.license) {
    changes.push({ type: 'license', path: `${path}/license`, kind: 'modified', before: before.license, after: after.license });
  }
  if (before.visibility !== after.visibility) {
    changes.push({ type: 'license', path: `${path}/visibility`, kind: 'modified', before: before.visibility, after: after.visibility });
  }
  return changes;
}
