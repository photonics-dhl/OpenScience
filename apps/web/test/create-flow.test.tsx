import { describe, expect, it } from 'vitest';
import { validateCreateInput } from '../lib/create-flow';

describe('guided Research Object creation', () => {
  it('requires a title and accepts an empty six-field draft', () => {
    expect(validateCreateInput({ title: '  ', mode: 'blank', material: '', disclosure: false })).toEqual({ ok: false, error: 'title' });
    expect(validateCreateInput({ title: '首个 RO', mode: 'blank', material: '', disclosure: false })).toEqual({ ok: true });
  });

  it('requires explicit disclosure before sending material to Hermes', () => {
    expect(validateCreateInput({ title: '材料提取', mode: 'material', material: '方法与结果', disclosure: false })).toEqual({ ok: false, error: 'disclosure' });
    expect(validateCreateInput({ title: '材料提取', mode: 'material', material: '方法与结果', disclosure: true })).toEqual({ ok: true });
  });

  it('rejects empty material mode', () => {
    expect(validateCreateInput({ title: '材料提取', mode: 'material', material: '  ', disclosure: true })).toEqual({ ok: false, error: 'material' });
  });
});
