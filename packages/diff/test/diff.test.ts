import { describe, expect, it } from 'vitest';
import { diffLines, diffText, diffCode, diffSdfFields, diffConclusion, diffAuthors, diffCitations, diffFiles, diffTableSummary, diffLicenseVisibility, computeDiff } from '../src';

const CORE1 = { schemaVersion: '0.1.0', problem: 'P1', insight: 'I', method: 'M', results: 'R1', limitations: 'L1', reproducibility: 'RP' };
const CORE2 = { schemaVersion: '0.1.0', problem: 'P2', insight: 'I', method: 'M', results: 'R2', limitations: 'L2', reproducibility: 'RP' };

describe('diffLines（§7.3 文本/代码行级）', () => {
  it('单行修改 → hunk 含 -/+', () => {
    const hunks = diffLines('a\nb\nc\n', 'a\nB\nc\n');
    expect(hunks.length).toBeGreaterThan(0);
    const lines = hunks.flatMap((h) => h.lines);
    expect(lines.filter((l) => l.prefix === '-')).toHaveLength(1);
    expect(lines.filter((l) => l.prefix === '+')).toHaveLength(1);
  });

  it('无变化 → 空 hunk', () => {
    expect(diffLines('same\n', 'same\n')).toEqual([]);
  });

  it('整段新增 → + 行', () => {
    const hunks = diffLines('', 'new1\nnew2\n');
    const lines = hunks.flatMap((h) => h.lines);
    expect(lines.every((l) => l.prefix === '+')).toBe(true);
  });
});

describe('diffText / diffCode', () => {
  it('文本变化 → text type modified + hunks', () => {
    const changes = diffText('/core/problem', 'old text', 'new text');
    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe('text');
    expect(changes[0].kind).toBe('modified');
    expect(changes[0].hunks).toBeDefined();
  });

  it('代码变化 → code type', () => {
    const changes = diffCode('main.ts', 'const a = 1;\n', 'const a = 2;\n');
    expect(changes[0].type).toBe('code');
  });

  it('相同 → []', () => {
    expect(diffText('x', 'same', 'same')).toEqual([]);
  });
});

describe('diffSdfFields（§7.2.5 RFC 6902）', () => {
  it('字段变化 → sdf_field + patchOp', () => {
    const changes = diffSdfFields('/core', CORE1, CORE2);
    expect(changes.some((c) => c.path === '/problem' && c.type === 'sdf_field' && c.patchOp?.op === 'replace')).toBe(true);
  });

  it('相同 → []', () => {
    expect(diffSdfFields('/core', CORE1, { ...CORE1 })).toEqual([]);
  });
});

describe('diffConclusion（§7.3 结论变化摘要）', () => {
  it('results/limitations 变化 → conclusion', () => {
    const changes = diffConclusion('/conclusion', CORE1, CORE2);
    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe('conclusion');
    expect(changes[0].after).toMatchObject({ results: 'R2', limitations: 'L2' });
  });

  it('结论未变 → []', () => {
    expect(diffConclusion('/conclusion', CORE1, { ...CORE1, problem: 'X' })).toEqual([]);
  });
});

describe('diffAuthors / diffCitations', () => {
  it('作者增删 → added/removed', () => {
    const changes = diffAuthors('/meta/authors', ['Alice', 'Bob'], ['Bob', 'Carol']);
    expect(changes).toHaveLength(2);
    expect(changes.find((c) => c.kind === 'removed')?.before).toBe('Alice');
    expect(changes.find((c) => c.kind === 'added')?.after).toBe('Carol');
  });

  it('引用增删', () => {
    const changes = diffCitations('/meta/citations', ['ref-1'], ['ref-2']);
    expect(changes).toHaveLength(2);
  });

  it('相同 → []', () => {
    expect(diffAuthors('/a', ['x'], ['x'])).toEqual([]);
  });
});

describe('diffFiles（§7.3 + §7.2.6 大二进制仅元数据）', () => {
  const sizes = (m: Record<string, number>): Map<string, number> => new Map(Object.entries(m));

  it('文件增删 → added/removed', () => {
    const changes = diffFiles(
      [{ logicalPath: 'a.txt', artifactId: 'a1', blobSha256: 's1' }],
      [{ logicalPath: 'b.txt', artifactId: 'b1', blobSha256: 's2' }],
      sizes({ s1: 10 }), sizes({ s2: 20 }),
    );
    expect(changes).toHaveLength(2);
    expect(changes.find((c) => c.kind === 'removed')?.path).toBe('a.txt');
    expect(changes.find((c) => c.kind === 'added')?.path).toBe('b.txt');
  });

  it('哈希变化 → modified（小文件）', () => {
    const changes = diffFiles(
      [{ logicalPath: 'a.txt', artifactId: 'a1', blobSha256: 's1' }],
      [{ logicalPath: 'a.txt', artifactId: 'a2', blobSha256: 's2' }],
      sizes({ s1: 10 }), sizes({ s2: 20 }),
    );
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe('modified');
    expect(changes[0].metadata?.sha256).toBe('s2');
  });

  it('大二进制（>1MB）→ metadata_only 无 hunks（§7.2.6）', () => {
    const big = 2 * 1024 * 1024;
    const changes = diffFiles(
      [{ logicalPath: 'big.bin', artifactId: 'a1', blobSha256: 's1' }],
      [{ logicalPath: 'big.bin', artifactId: 'a2', blobSha256: 's2' }],
      sizes({ s1: big }), sizes({ s2: big + 1 }),
    );
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe('metadata_only');
    expect(changes[0].hunks).toBeUndefined();
    expect(changes[0].metadata?.size).toBe(big + 1);
  });

  it('未变 → []', () => {
    const entry = { logicalPath: 'a.txt', artifactId: 'a1', blobSha256: 's1' };
    expect(diffFiles([entry], [entry], sizes({ s1: 1 }), sizes({ s1: 1 }))).toEqual([]);
  });
});

describe('diffTableSummary（§7.3 表格摘要）', () => {
  it('行数变化 → table modified', () => {
    const changes = diffTableSummary('/meta/table', 'h1,h2\nr1\nr2\n', 'h1,h2\nr1\nr2\nr3\n');
    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe('table');
    expect(changes[0].before).toMatchObject({ rowCount: 3 });
    expect(changes[0].after).toMatchObject({ rowCount: 4 });
  });

  it('相同 → []', () => {
    expect(diffTableSummary('/t', 'a\n', 'a\n')).toEqual([]);
  });
});

describe('diffLicenseVisibility（§7.3）', () => {
  it('许可证/可见性变化 → license changes', () => {
    const changes = diffLicenseVisibility('/meta', { license: 'CC-BY', visibility: 'private' }, { license: 'CC-BY-NC', visibility: 'public' });
    expect(changes).toHaveLength(2);
    expect(changes.every((c) => c.type === 'license')).toBe(true);
  });

  it('相同 → []', () => {
    expect(diffLicenseVisibility('/m', { license: 'x', visibility: 'p' }, { license: 'x', visibility: 'p' })).toEqual([]);
  });
});

describe('computeDiff（§7.3 九类聚合）', () => {
  it('全类型变化 → 各类 change 出现', () => {
    const result = computeDiff({
      versionFrom: 'v1', versionTo: 'v2',
      beforeCore: CORE1, afterCore: CORE2,
      beforeFiles: [{ logicalPath: 'a.txt', artifactId: 'a1', blobSha256: 's1' }],
      afterFiles: [{ logicalPath: 'a.txt', artifactId: 'a2', blobSha256: 's2' }, { logicalPath: 'new.bin', artifactId: 'a3', blobSha256: 's3' }],
      beforeSizes: new Map([['s1', 10], ['s2', 0], ['s3', 0]]),
      afterSizes: new Map([['s1', 0], ['s2', 20], ['s3', 2 * 1024 * 1024]]),
      beforeMeta: { authors: ['A'], citations: ['c1'], table: 'h\nr1\n', license: 'CC-BY', visibility: 'private' },
      afterMeta: { authors: ['A', 'B'], citations: ['c2'], table: 'h\nr1\nr2\n', license: 'CC-BY-NC', visibility: 'public' },
    });
    const types = new Set(result.changes.map((c) => c.type));
    expect(types.has('sdf_field')).toBe(true);
    expect(types.has('conclusion')).toBe(true);
    expect(types.has('text')).toBe(true);
    expect(types.has('file')).toBe(true);
    expect(types.has('authors')).toBe(true);
    expect(types.has('citations')).toBe(true);
    expect(types.has('table')).toBe(true);
    expect(types.has('license')).toBe(true);
  });
});
