import { diffText } from './text-code';
import { diffSdfFields, diffConclusion } from './sdf';
import { diffAuthors, diffCitations } from './authors-citations';
import { diffFiles } from './file';
import { diffTableSummary } from './table';
import { diffLicenseVisibility } from './license';
import type { BlobSizeMap } from './file';
import type { DiffChange, DiffResult, FileEntryInput, VersionMetaInput } from './types';

export type { DiffType, ChangeKind, LineHunk, DiffChange, DiffResult, FileEntryInput, VersionMetaInput } from './types';
export { LARGE_BINARY_THRESHOLD } from './types';
export { diffLines } from './lines';
export { diffText, diffCode } from './text-code';
export { diffSdfFields, diffConclusion } from './sdf';
export { diffAuthors, diffCitations } from './authors-citations';
export { diffFiles, type BlobSizeMap } from './file';
export { diffTableSummary } from './table';
export { diffLicenseVisibility } from './license';

/** computeDiff 输入：两版本完整上下文。 */
export interface ComputeDiffInput {
  versionFrom: string;
  versionTo: string;
  beforeCore: Record<string, unknown>;
  afterCore: Record<string, unknown>;
  beforeFiles: FileEntryInput[];
  afterFiles: FileEntryInput[];
  beforeSizes: BlobSizeMap;
  afterSizes: BlobSizeMap;
  beforeMeta?: VersionMetaInput;
  afterMeta?: VersionMetaInput;
  largeBinaryThreshold?: number;
}

/** §7.3 九类 diff 聚合入口：确定性 diff（AI 摘要属展示层，Phase 1D）。 */
export function computeDiff(input: ComputeDiffInput): DiffResult {
  const changes: DiffChange[] = [];

  // 1. SDF 字段（RFC 6902）
  changes.push(...diffSdfFields('/core', input.beforeCore, input.afterCore));
  // 2. 结论变化摘要
  changes.push(...diffConclusion('/conclusion', input.beforeCore, input.afterCore));
  // 3. 文本 diff（SDF 各字符串字段按文本比较）
  for (const field of ['problem', 'insight', 'method', 'results', 'limitations', 'reproducibility']) {
    const before = String(input.beforeCore[field] ?? '');
    const after = String(input.afterCore[field] ?? '');
    if (before !== after) {
      changes.push(...diffText(`/core/${field}`, before, after));
    }
  }
  // 4. 文件增删与哈希（§7.2.6 大二进制仅元数据）
  changes.push(...diffFiles(
    input.beforeFiles, input.afterFiles, input.beforeSizes, input.afterSizes,
    input.largeBinaryThreshold,
  ));
  // 5. 作者
  changes.push(...diffAuthors('/meta/authors', input.beforeMeta?.authors ?? [], input.afterMeta?.authors ?? []));
  // 6. 引用
  changes.push(...diffCitations('/meta/citations', input.beforeMeta?.citations ?? [], input.afterMeta?.citations ?? []));
  // 7. 表格
  if (input.beforeMeta?.table || input.afterMeta?.table) {
    changes.push(...diffTableSummary('/meta/table', input.beforeMeta?.table ?? '', input.afterMeta?.table ?? ''));
  }
  // 8. 代码（Manifest 中 .ts/.js/.py 等文件内容差异——P1B-5 无内容，Phase 1D 接 Blob 内容）
  // 9. 许可证与可见性
  changes.push(...diffLicenseVisibility(
    '/meta',
    { license: input.beforeMeta?.license, visibility: input.beforeMeta?.visibility },
    { license: input.afterMeta?.license, visibility: input.afterMeta?.visibility },
  ));

  return { versionFrom: input.versionFrom, versionTo: input.versionTo, changes };
}
