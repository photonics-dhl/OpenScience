import { describe, expect, it } from 'vitest';
import { applySdfPatch, diffSdfCore, validatePatch, rebuildCore, buildSnapshot } from '../src';

const BASE = { schemaVersion: '0.1.0', problem: '旧问题', insight: 'I', method: 'M', results: 'R', limitations: 'L', reproducibility: 'RP' };

describe('applySdfPatch（§7.2.5 RFC 6902）', () => {
  it('replace 单字段 → 新值', () => {
    const result = applySdfPatch(BASE, [{ op: 'replace', path: '/problem', value: '新问题' }]);
    expect(result.problem).toBe('新问题');
    expect(result.insight).toBe('I'); // 未变字段保留
  });

  it('多 op 一次应用', () => {
    const result = applySdfPatch(BASE, [
      { op: 'replace', path: '/problem', value: 'P2' },
      { op: 'replace', path: '/method', value: 'M2' },
    ]);
    expect(result).toMatchObject({ problem: 'P2', method: 'M2' });
  });

  it('原对象不变（深拷贝）', () => {
    applySdfPatch(BASE, [{ op: 'replace', path: '/problem', value: 'X' }]);
    expect(BASE.problem).toBe('旧问题');
  });

  it('非法 op → 抛错', () => {
    expect(() => applySdfPatch(BASE, [{ op: 'delete_all', path: '/problem' } as never])).toThrow(/非法 JSON Patch op/);
  });

  it('非法 path（非 / 开头）→ 抛错', () => {
    expect(() => applySdfPatch(BASE, [{ op: 'replace', path: 'problem', value: 'x' } as never])).toThrow(/非法 JSON Patch path/);
  });
});

describe('diffSdfCore', () => {
  it('相同对象 → 空 patch', () => {
    expect(diffSdfCore(BASE, { ...BASE })).toEqual([]);
  });

  it('单字段变化 → replace patch', () => {
    const after = { ...BASE, problem: '新问题' };
    const patch = diffSdfCore(BASE, after);
    expect(patch).toEqual([{ op: 'replace', path: '/problem', value: '新问题' }]);
  });

  it('多字段变化 → 多 replace', () => {
    const after = { ...BASE, problem: 'P2', results: 'R2' };
    const patch = diffSdfCore(BASE, after);
    expect(patch.filter((p) => p.op === 'replace')).toHaveLength(2);
  });
});

describe('validatePatch', () => {
  it('合法 patch 通过', () => {
    expect(() => validatePatch([{ op: 'replace', path: '/problem', value: 'x' }])).not.toThrow();
  });

  it('非法 op / path → 抛错', () => {
    expect(() => validatePatch([{ op: 'bad' as never, path: '/x' }])).toThrow();
    expect(() => validatePatch([{ op: 'replace', path: 'no-slash', value: 'x' } as never])).toThrow();
  });
});

describe('rebuildCore / buildSnapshot', () => {
  it('沿 patch 链重建 core', () => {
    const chain = [
      [{ op: 'replace', path: '/problem', value: '第一版' }],
      [{ op: 'replace', path: '/method', value: '第二版方法' }],
    ];
    const core = rebuildCore(BASE, chain);
    expect(core).toMatchObject({ problem: '第一版', method: '第二版方法', insight: 'I' });
  });

  it('空 patch 链 → 基准 core', () => {
    const core = rebuildCore(BASE, []);
    expect(core).toEqual(BASE);
  });

  it('buildSnapshot 组装 core + artifact 引用', () => {
    const artifacts = [{ logicalPath: 'fig.png', artifactId: 'a-1', blobSha256: 'a'.repeat(64) }];
    const snap = buildSnapshot(BASE, artifacts);
    expect(snap).toMatchObject({ core: BASE, artifacts });
  });
});
