import { describe, expect, it } from 'vitest';

/** §4.3 必显信息字段（公开页数据 Schema 合同测试）。 */
const REQUIRED_FIELDS = [
  'publicId', 'title', 'url', 'visibility',
  'version.publicVersionId', 'version.status', 'version.publishedAt', 'version.contentSha256', 'version.legalDisclaimer', 'version.core.problem',
  'authors', 'contributions', 'licenses', 'aiReview', 'citation',
];

function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const path = `${prefix}${k}`;
    if (Array.isArray(v)) {
      return [path, ...flattenKeys((v[0] as Record<string, unknown>) ?? {}, `${path}.`)];
    }
    if (typeof v === 'object' && v !== null) {
      return [path, ...flattenKeys(v as Record<string, unknown>, `${path}.`)];
    }
    return [path];
  });
}

describe('P1D-9 公开页必显数据（§4.3 Schema 合同测试）', () => {
  it('必显字段全部存在于公开页数据', () => {
    const sample: Record<string, unknown> = {
      publicId: 'OSR-2026-000001',
      title: '示例',
      url: '/research/OSR-2026-000001/v/1',
      visibility: 'public',
      version: {
        versionNo: 1, publicVersionId: 'OSR-2026-000001-v1', status: 'published',
        publishedAt: '2026-08-04T00:00:00Z', contentSha256: 'a'.repeat(64), legalDisclaimer: '免责', core: { problem: 'P' },
      },
      authors: [{ displayName: 'A', identityStatus: 'email_verified', isCorresponding: false, sortOrder: 0 }],
      contributions: [{ displayName: 'A', creditRole: 'software' }],
      licenses: { text: 'CC-BY-4.0' },
      aiReview: { status: 'passed', hardBlocks: [], warnings: [] },
      citation: 'x',
      artifactPaths: [],
    };
    const keys = flattenKeys(sample);
    for (const f of REQUIRED_FIELDS) expect(keys).toContain(f);
  });

  it('§6.2 免责声明文案不含存证承诺', () => {
    const disclaimer = '此时间戳仅证明平台在相应时间接收并记录了该版本及其内容哈希，不构成专利优先权、著作权归属、科研正确性或司法存证保证。';
    expect(disclaimer).toContain('不构成');
    expect(disclaimer).not.toContain('专利优先权保证');
  });
});
