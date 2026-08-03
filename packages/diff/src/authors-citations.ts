import type { DiffChange } from './types';

/** 作者/贡献者变化（§7.3）：名单增删。 */
export function diffAuthors(path: string, before: string[], after: string[]): DiffChange[] {
  return diffList('authors', path, before, after);
}

/** 引用变化（§7.3）：列表增删。 */
export function diffCitations(path: string, before: string[], after: string[]): DiffChange[] {
  return diffList('citations', path, before, after);
}

/** 通用列表 diff：增删项分别产出 change。 */
function diffList(type: 'authors' | 'citations', path: string, before: string[], after: string[]): DiffChange[] {
  const changes: DiffChange[] = [];
  const afterSet = new Set(after);
  const beforeSet = new Set(before);
  for (const item of before) {
    if (!afterSet.has(item)) changes.push({ type, path, kind: 'removed', before: item });
  }
  for (const item of after) {
    if (!beforeSet.has(item)) changes.push({ type, path, kind: 'added', after: item });
  }
  return changes;
}
