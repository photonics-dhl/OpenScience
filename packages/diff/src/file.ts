import type { DiffChange, FileEntryInput } from './types';

export interface BlobSizeMap {
  get(sha256: string): number | undefined;
}

/**
 * 文件增删与哈希变化（§7.3 + §7.2.6）：
 * - 新增/删除 → added/removed
 * - 相同 logicalPath 但 blobSha256 不同 → modified（哈希变化）
 * - 大二进制（> LARGE_BINARY_THRESHOLD）→ 仅元数据（kind=metadata_only，无 hunks）
 */
export function diffFiles(
  before: FileEntryInput[],
  after: FileEntryInput[],
  beforeSizes: BlobSizeMap,
  afterSizes: BlobSizeMap,
  threshold = 1 * 1024 * 1024,
): DiffChange[] {
  const changes: DiffChange[] = [];
  const afterMap = new Map(after.map((e) => [e.logicalPath, e]));
  const beforeMap = new Map(before.map((e) => [e.logicalPath, e]));

  for (const entry of before) {
    const next = afterMap.get(entry.logicalPath);
    if (!next) {
      const size = beforeSizes.get(entry.blobSha256);
      changes.push({
        type: 'file', path: entry.logicalPath, kind: 'removed',
        before: { blobSha256: entry.blobSha256, size },
        metadata: { sha256: entry.blobSha256, size },
      });
    } else if (next.blobSha256 !== entry.blobSha256) {
      const size = beforeSizes.get(entry.blobSha256);
      const newSize = afterSizes.get(next.blobSha256);
      const large = (newSize ?? 0) > threshold || (size ?? 0) > threshold;
      if (large) {
        changes.push({
          type: 'file', path: entry.logicalPath, kind: 'metadata_only',
          before: { blobSha256: entry.blobSha256, size },
          after: { blobSha256: next.blobSha256, size: newSize },
          metadata: { sha256: next.blobSha256, size: newSize },
        });
      } else {
        changes.push({
          type: 'file', path: entry.logicalPath, kind: 'modified',
          before: { blobSha256: entry.blobSha256, size },
          after: { blobSha256: next.blobSha256, size: newSize },
          metadata: { sha256: next.blobSha256, size: newSize },
        });
      }
    }
  }

  for (const entry of after) {
    if (!beforeMap.has(entry.logicalPath)) {
      const size = afterSizes.get(entry.blobSha256);
      changes.push({
        type: 'file', path: entry.logicalPath, kind: 'added',
        after: { blobSha256: entry.blobSha256, size },
        metadata: { sha256: entry.blobSha256, size },
      });
    }
  }
  return changes;
}
