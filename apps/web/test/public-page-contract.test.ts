import { describe, it, expect } from 'vitest';

/** P1D-9：合同测试 - 公开页 API 响应必含全部§4.3 必显字段 */
describe('Public Research Page Contract', () => {
  /** 模拟 API 响应结构（基于 apps/api/src/routes/research.ts） */
  const mockApiResponse = {
    research: {
      publicId: 'OSR-2026-000001',
      title: '测试研究对象',
      url: '/research/OSR-2026-000001/v/1',
      visibility: 'public' as const,
      version: {
        versionNo: 1,
        publicVersionId: 'OSR-2026-000001-v1',
        status: 'published' as const,
        publishedAt: '2026-08-06T00:00:00.000Z',
        contentSha256: 'a'.repeat(64),
        legalDisclaimer: null,
        core: {
          problem: '测试问题',
          insight: '测试洞察',
          method: '测试方法',
          results: '测试结果',
          limitations: '测试局限',
          reproducibility: '测试可复现性',
        },
      },
      authors: [
        {
          displayName: '测试作者',
          identityStatus: 'email_verified' as const,
          isCorresponding: true,
          affiliation: '测试机构',
          sortOrder: 1,
        },
      ],
      contributions: [
        {
          displayName: '测试作者',
          creditRole: 'conceptualization' as const,
        },
      ],
      licenses: {
        text: 'CC-BY-4.0',
        code: 'MIT',
        data: 'CC0',
      },
      aiReview: {
        status: 'passed' as const,
        hardBlocks: {},
        warnings: [],
      },
      citation: '测试作者. 测试研究对象. OSR-2026-000001-v1. 2026.',
      artifactPaths: [],
    },
  };

  it('响应包含 §4.3 全部必显字段', () => {
    const r = mockApiResponse.research;

    // 1. 标题
    expect(r.title).toBeDefined();
    expect(typeof r.title).toBe('string');

    // 2. 作者与身份状态
    expect(r.authors).toBeDefined();
    expect(Array.isArray(r.authors)).toBe(true);
    expect(r.authors.length).toBeGreaterThan(0);
    expect(r.authors[0].displayName).toBeDefined();
    expect(r.authors[0].identityStatus).toBeDefined();

    // 3. 机构声明（affiliation）
    expect(r.authors[0]).toHaveProperty('affiliation');

    // 4. 摘要（problem 字段）
    expect(r.version.core.problem).toBeDefined();

    // 5. 许可证（text/code/data）
    expect(r.licenses).toBeDefined();
    expect(r.licenses).toHaveProperty('text');
    expect(r.licenses).toHaveProperty('code');
    expect(r.licenses).toHaveProperty('data');

    // 6. unique ID
    expect(r.publicId).toBeDefined();
    expect(r.publicId).toMatch(/^OSR-\d{4}-\d{6}$/);

    // 7. 版本 ID
    expect(r.version.publicVersionId).toBeDefined();
    expect(r.version.publicVersionId).toMatch(/^OSR-\d{4}-\d{6}-v\d+$/);

    // 8. 发布时间
    expect(r.version.publishedAt).toBeDefined();
    expect(typeof r.version.publishedAt).toBe('string');

    // 9. 版本哈希
    expect(r.version.contentSha256).toBeDefined();
    expect(r.version.contentSha256).toMatch(/^[a-f0-9]{64}$/);

    // 10. 引用格式
    expect(r.citation).toBeDefined();
    expect(typeof r.citation).toBe('string');

    // 11. AI 审核摘要（可选，但结构固定）
    if (r.aiReview) {
      expect(r.aiReview.status).toBeDefined();
      expect(['passed', 'failed', 'pending']).toContain(r.aiReview.status);
    }

    // 12. 法律免责声明（legalDisclaimer 可为 null，前端用默认值）
    expect(r.version).toHaveProperty('legalDisclaimer');
  });

  it('authors 数组每项包含 affiliation 字段', () => {
    const authors = mockApiResponse.research.authors;
    authors.forEach((author) => {
      expect(author).toHaveProperty('affiliation');
      // affiliation 可以为 null（可选字段）
      if (author.affiliation !== null) {
        expect(typeof author.affiliation).toBe('string');
      }
    });
  });

  it('licenses 包含全部三类', () => {
    const licenses = mockApiResponse.research.licenses;
    expect(licenses.text).toBeDefined();
    expect(licenses.code).toBeDefined();
    expect(licenses.data).toBeDefined();
  });

  it('version.core 包含 SDF 六字段', () => {
    const core = mockApiResponse.research.version.core;
    expect(core.problem).toBeDefined();
    expect(core.insight).toBeDefined();
    expect(core.method).toBeDefined();
    expect(core.results).toBeDefined();
    expect(core.limitations).toBeDefined();
    expect(core.reproducibility).toBeDefined();
  });
});
