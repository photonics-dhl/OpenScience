import type { LineHunk } from './types';

/**
 * 简单 LCS 行 diff（P1B-5 决策：不引库，小文本够用；大文本 P1B-后续换 Myers/diff 库）。
 * 返回 hunk 块（旧行号 + 新行号 + 行级 prefix）。
 */
export function diffLines(before: string, after: string): LineHunk[] {
  const a = before.split('\n');
  const b = after.split('\n');
  // 去掉结尾空串（split 尾随换行）
  if (a[a.length - 1] === '') a.pop();
  if (b[b.length - 1] === '') b.pop();

  const lcs = computeLcs(a, b);
  return buildHunks(a, b, lcs);
}

/** LCS 长度矩阵回溯 → 公共子序列索引集合。 */
function computeLcs(a: string[], b: string[]): { row: number; col: number }[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const seq: { row: number; col: number }[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      seq.push({ row: i, col: j });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return seq;
}

/** 由 LCS 序列构建 hunks（连续公共行聚为一组，前后包删除/新增行）。 */
function buildHunks(a: string[], b: string[], lcs: { row: number; col: number }[]): LineHunk[] {
  const hunks: LineHunk[] = [];
  let aIdx = 0;
  let bIdx = 0;
  let pendingOldStart = 1;
  let pendingNewStart = 1;
  let pendingOldCount = 0;
  let pendingNewCount = 0;
  let pendingLines: Array<{ prefix: ' ' | '+' | '-'; content: string }> = [];

  const flush = () => {
    if (pendingOldCount === 0 && pendingNewCount === 0 && pendingLines.length === 0) return;
    hunks.push({
      oldStart: pendingOldStart,
      oldLines: pendingOldCount,
      newStart: pendingNewStart,
      newLines: pendingNewCount,
      lines: pendingLines,
    });
  };

  for (const match of lcs) {
    // 处理到 match.row/match.col 前的增删
    while (aIdx < match.row || bIdx < match.col) {
      if (aIdx < match.row) {
        if (pendingLines.length === 0) { pendingOldStart = aIdx + 1; pendingNewStart = bIdx + 1; }
        pendingLines.push({ prefix: '-', content: a[aIdx] });
        pendingOldCount++;
        aIdx++;
      } else {
        if (pendingLines.length === 0) { pendingOldStart = aIdx + 1; pendingNewStart = bIdx + 1; }
        pendingLines.push({ prefix: '+', content: b[bIdx] });
        pendingNewCount++;
        bIdx++;
      }
    }
    // 公共行：作为分隔（hunk 闭合），不单独产出
    flush();
    pendingOldCount = 0;
    pendingNewCount = 0;
    pendingLines = [];
    aIdx = match.row + 1;
    bIdx = match.col + 1;
  }

  // 尾部增删
  while (aIdx < a.length || bIdx < b.length) {
    if (aIdx < a.length) {
      if (pendingLines.length === 0) { pendingOldStart = aIdx + 1; pendingNewStart = bIdx + 1; }
      pendingLines.push({ prefix: '-', content: a[aIdx] });
      pendingOldCount++;
      aIdx++;
    } else {
      if (pendingLines.length === 0) { pendingOldStart = aIdx + 1; pendingNewStart = bIdx + 1; }
      pendingLines.push({ prefix: '+', content: b[bIdx] });
      pendingNewCount++;
      bIdx++;
    }
  }
  flush();
  return hunks;
}
