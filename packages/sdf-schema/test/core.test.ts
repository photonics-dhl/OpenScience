import { describe, expect, it } from 'vitest';
import { SDF_CORE_FIELDS, parseReadableSdfCore, validateReadableSdfCore, validateReadableSdfDraftCore, validateSdfCore, validateSdfDraftCore } from '../src';

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

describe('validateSdfDraftCore（草稿允许显式未解决字段）', () => {
  it('接受字段齐全但部分为空的 0.1.0 草稿', () => {
    const draft = validCore();
    draft.results = '';

    expect(validateSdfDraftCore(draft)).toMatchObject({ ok: true });
  });

  it('仍拒绝缺字段与错误 schemaVersion', () => {
    const missing = validCore() as Record<string, string>;
    delete missing.results;

    expect(validateSdfDraftCore(missing).ok).toBe(false);
    expect(validateSdfDraftCore({ ...validCore(), schemaVersion: '0.2.0' }).ok).toBe(false);
  });
});

describe('versioned readable snapshots', () => {
  it('preserves legacy opaque format metadata without giving it new semantics', () => {
    for (const fieldFormats of [{ insight: 'markdown' }, 'opaque legacy value', null]) {
      const legacy = { ...validCore(), insight: '**literal legacy text**', fieldFormats };
      expect(parseReadableSdfCore(legacy)).toBe(legacy);
      expect(validateReadableSdfCore(legacy).ok).toBe(true);
      expect(validateSdfCore(legacy).ok).toBe(true);
    }
  });

  it('recognizes only explicit new identity with a typed per-field map and keeps the original object', () => {
    const snapshot = { ...validCore(), schemaVersion: '0.2.0', insight: '**formatted**', fieldFormats: { insight: 'markdown', method: 'plain' }, provenance: { source: 'frozen' } };
    expect(parseReadableSdfCore(snapshot)).toBe(snapshot);
    expect(validateReadableSdfCore(snapshot).ok).toBe(true);
    expect(validateSdfCore(snapshot).ok).toBe(false);
    expect(validateSdfDraftCore(snapshot).ok).toBe(false);
    expect(parseReadableSdfCore({ ...validCore(), schemaVersion: '0.2.0' })).not.toBeNull();
  });

  it.each([null, [], 'markdown', { insight: 'html' }, { insight: true }, { title: 'markdown' }])('rejects an invalid new format map: %j', (fieldFormats) => {
    const snapshot = { ...validCore(), schemaVersion: '0.2.0', fieldFormats };
    expect(parseReadableSdfCore(snapshot)).toBeNull();
    expect(validateReadableSdfCore(snapshot).ok).toBe(false);
  });

  it('keeps full-core export requirements distinct from readable draft requirements', () => {
    const draft = { ...validCore(), schemaVersion: '0.2.0', results: '', fieldFormats: { insight: 'markdown' } };
    expect(parseReadableSdfCore(draft)).toBe(draft);
    expect(validateReadableSdfDraftCore(draft).ok).toBe(true);
    expect(validateReadableSdfCore(draft).ok).toBe(false);
    const missing = { ...draft } as Record<string, unknown>;
    delete missing.results;
    expect(parseReadableSdfCore(missing)).toBeNull();
    expect(validateReadableSdfDraftCore(missing).ok).toBe(false);
    expect(parseReadableSdfCore({ ...draft, schemaVersion: '0.3.0' })).toBeNull();
  });
});
