import { describe, expect, it } from 'vitest';
import { SDF_CORE_FIELDS, validateSdfCore } from '../src';

/** 合法六字段文档（§5.1）。 */
function validCore() {
  return {
    schemaVersion: '0.1.0',
    problem: '具体科学问题',
    insight: '核心发现',
    method: '研究方法',
    results: '主要结果',
    limitations: '局限',
    reproducibility: '复现方式',
  };
}

describe('validateSdfCore（六必填字段）', () => {
  it('合法六字段文档通过', () => {
    const r = validateSdfCore(validCore());
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('缺任一必填字段拒绝', () => {
    for (const field of SDF_CORE_FIELDS) {
      const doc = validCore();
      delete (doc as Record<string, unknown>)[field];
      const r = validateSdfCore(doc);
      expect(r.ok).toBe(false);
      expect(r.errors.some((e) => String(e.params.missingProperty) === field)).toBe(true);
    }
  });

  it('空字符串拒绝', () => {
    const doc = { ...validCore(), problem: '' };
    const r = validateSdfCore(doc);
    expect(r.ok).toBe(false);
  });

  it('schemaVersion 非 0.1.0 拒绝', () => {
    const r = validateSdfCore({ ...validCore(), schemaVersion: '0.2.0' });
    expect(r.ok).toBe(false);
  });

  it('未知附加键容忍（additionalProperties 宽容——技术债务基线）', () => {
    const doc = { ...validCore(), draft_meta: { savedAt: '2026-08-03T00:00:00Z' } };
    const r = validateSdfCore(doc);
    expect(r.ok).toBe(true);
  });

  it('非 object 输入拒绝', () => {
    expect(validateSdfCore('not-object').ok).toBe(false);
    expect(validateSdfCore(null).ok).toBe(false);
  });
});
