import { describe, expect, it } from 'vitest';
import { validateManifest } from '../src';

/** 合法 manifest（§5.3 示例对齐）。 */
function validManifest() {
  return {
    schema: 'openscience-sdf',
    schemaVersion: '0.1.0',
    objectId: 'OSR-2026-000001',
    versionId: 'OSR-2026-000001-v1',
    version: 1,
    title: 'Example research object',
    visibility: 'public',
    contentHash: 'sha256:' + 'a'.repeat(64),
    authors: ['user-1'],
    licenses: { text: 'CC-BY-4.0', code: 'MIT', data: 'CC-BY-4.0' },
    artifacts: [],
    parentVersion: null,
    forkedFrom: null,
  };
}

describe('validateManifest（§5.3 最小结构）', () => {
  it('合法 manifest 通过', () => {
    const r = validateManifest(validManifest());
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('缺 schema 拒绝', () => {
    const doc = validManifest() as Record<string, unknown>;
    delete doc.schema;
    expect(validateManifest(doc).ok).toBe(false);
  });

  it('visibility 非法枚举拒绝', () => {
    const r = validateManifest({ ...validManifest(), visibility: 'super_secret' });
    expect(r.ok).toBe(false);
  });

  it('contentHash pattern 错拒绝', () => {
    const r = validateManifest({ ...validManifest(), contentHash: 'md5:abc' });
    expect(r.ok).toBe(false);
  });

  it('objectId/versionId pattern 错拒绝', () => {
    expect(validateManifest({ ...validManifest(), objectId: 'OSR-26-1' }).ok).toBe(false);
    expect(validateManifest({ ...validManifest(), versionId: 'OSR-2026-000001' }).ok).toBe(false);
  });

  it('version 非正整数拒绝', () => {
    expect(validateManifest({ ...validManifest(), version: 0 }).ok).toBe(false);
  });

  it('未知附加键容忍（技术债务基线）', () => {
    const doc = { ...validManifest(), extra_field: 'future' };
    expect(validateManifest(doc).ok).toBe(true);
  });

  it('licenses 缺三类之一拒绝', () => {
    const doc = validManifest();
    const bad = { ...doc, licenses: { text: 'CC-BY-4.0', code: 'MIT' } };
    expect(validateManifest(bad).ok).toBe(false);
  });
});
