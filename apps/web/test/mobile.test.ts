import { describe, expect, it } from 'vitest';
import { pageVersions } from '../components/editor/VersionList';

describe('pageVersions（§18.3 虚拟化窗口）', () => {
  const versions = Array.from({ length: 50 }, (_, i) => ({ versionId: `v${i}`, versionNo: i + 1, status: 'draft' }));

  it('limit 内 → 全量', () => {
    expect(pageVersions(versions, 20)).toHaveLength(20);
  });

  it('limit 超过总量 → 全量', () => {
    expect(pageVersions(versions, 100)).toHaveLength(50);
  });

  it('limit 0 → 空', () => {
    expect(pageVersions(versions, 0)).toEqual([]);
  });

  it('负数 limit → 空（防御）', () => {
    expect(pageVersions(versions, -5)).toEqual([]);
  });
});
