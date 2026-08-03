import { diffLines } from './lines';
import type { DiffChange, LineHunk } from './types';

/** 文本 diff（§7.3）：行级，空 diff 返回 []。 */
export function diffText(path: string, before: string, after: string): DiffChange[] {
  if (before === after) return [];
  const hunks: LineHunk[] = diffLines(before, after);
  return [{ type: 'text', path, kind: 'modified', before, after, hunks }];
}

/** 代码 diff（§7.3）：复用行级算法，type=code。 */
export function diffCode(path: string, before: string, after: string): DiffChange[] {
  if (before === after) return [];
  const hunks: LineHunk[] = diffLines(before, after);
  return [{ type: 'code', path, kind: 'modified', before, after, hunks }];
}
