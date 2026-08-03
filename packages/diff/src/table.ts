import type { DiffChange } from './types';

/**
 * 表格数据摘要变化（§7.3）：CSV/TSV 文本直接行级比较（P1B-5 决策）→ 行数变化摘要。
 * 返回行数差异 + 首个变化行号（复杂 cell 级 diff P1B-后续）。
 */
export function diffTableSummary(path: string, before: string, after: string, sampleRows = 5): DiffChange[] {
  if (before === after) return [];
  const aRows = before.split('\n').filter((r) => r.trim().length > 0);
  const bRows = after.split('\n').filter((r) => r.trim().length > 0);
  const maxShared = Math.min(aRows.length, bRows.length, sampleRows);
  let shared = 0;
  for (let i = 0; i < maxShared; i++) {
    if (aRows[i] === bRows[i]) shared++;
    else break;
  }
  const firstChangeRow = shared + 1;
  return [{
    type: 'table',
    path,
    kind: 'modified',
    before: { rowCount: aRows.length, firstChangeRow },
    after: { rowCount: bRows.length, firstChangeRow },
  }];
}
