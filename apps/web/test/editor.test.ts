import { describe, expect, it, beforeEach } from 'vitest';
import { editorReducer, emptyCore, saveDraft, loadDraft, clearDraft, draftKey } from '../lib/editor-state';
import { suggestionReducer, applySuggestionsToCore, demoSuggestions } from '../lib/suggestions';

/** §5.1 六字段（对齐 SDF_CORE_FIELDS，合同测试本地常量避免跨包依赖）。 */
const SDF_CORE_FIELDS = ['problem', 'insight', 'method', 'results', 'limitations', 'reproducibility'] as const;

/** node 环境 mock localStorage（§18.3 草稿存储）。 */
function mockLocalStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() { return store.size; },
    clear: () => store.clear(),
    getItem: (k) => store.get(k) ?? null,
    key: (i) => [...store.keys()][i] ?? null,
    removeItem: (k) => void store.delete(k),
    setItem: (k, v) => void store.set(k, String(v)),
  };
}

beforeEach(() => {
  (globalThis as { localStorage: Storage }).localStorage = mockLocalStorage();
});

const core = () => ({
  schemaVersion: '0.1.0', problem: 'P', insight: 'I', method: 'M', results: 'R', limitations: 'L', reproducibility: 'RP',
});

describe('editorReducer', () => {
  it('init → 载入 core + version，dirty=false', () => {
    const s = editorReducer({ core: emptyCore(), version: 1, dirty: false, lastSavedAt: null }, { type: 'init', core: core(), version: 3 });
    expect(s.core.problem).toBe('P');
    expect(s.version).toBe(3);
    expect(s.dirty).toBe(false);
  });

  it('edit_field → 更新字段 + dirty=true', () => {
    const s = editorReducer({ core: core(), version: 1, dirty: false, lastSavedAt: null }, { type: 'edit_field', field: 'problem', value: 'P2' });
    expect(s.core.problem).toBe('P2');
    expect(s.core.insight).toBe('I');
    expect(s.dirty).toBe(true);
  });

  it('saved → 乐观锁版本前进 + dirty=false + lastSavedAt 更新', () => {
    const s = editorReducer({ core: core(), version: 1, dirty: true, lastSavedAt: null }, { type: 'saved', version: 2 });
    expect(s.dirty).toBe(false);
    expect(s.version).toBe(2);
    expect(s.lastSavedAt).not.toBeNull();
  });

  it('六字段全可编辑（§5.1 SDF_CORE_FIELDS）', () => {
    for (const field of SDF_CORE_FIELDS) {
      const s = editorReducer({ core: core(), version: 1, dirty: false, lastSavedAt: null }, { type: 'edit_field', field, value: `新${field}` });
      expect((s.core as Record<string, string>)[field]).toBe(`新${field}`);
    }
  });
});

describe('草稿持久化（§18.3）', () => {

  it('saveDraft + loadDraft 往返', () => {
    const c = core();
    saveDraft('ro-1', c);
    const d = loadDraft('ro-1');
    expect(d).not.toBeNull();
    expect(d!.core.problem).toBe('P');
    expect(d!.savedAt).toBeGreaterThan(0);
  });

  it('clearDraft 清除', () => {
    saveDraft('ro-1', core());
    clearDraft('ro-1');
    expect(loadDraft('ro-1')).toBeNull();
  });

  it('无草稿 → null', () => {
    expect(loadDraft('ro-none')).toBeNull();
  });

  it('draftKey 按 RO 隔离', () => {
    expect(draftKey('ro-1')).toContain('ro-1');
    expect(draftKey('ro-1')).not.toBe(draftKey('ro-2'));
  });
});

describe('suggestionReducer（§5.4 MUST 确认后才写 SDF）', () => {
  const demo = demoSuggestions(emptyCore());

  it('apply pending → applied', () => {
    const s = suggestionReducer(demo, { type: 'apply', id: 'demo-1' });
    expect(s.find((x) => x.id === 'demo-1')?.status).toBe('applied');
  });

  it('dismiss pending → dismissed', () => {
    const s = suggestionReducer(demo, { type: 'dismiss', id: 'demo-2' });
    expect(s.find((x) => x.id === 'demo-2')?.status).toBe('dismissed');
  });

  it('已 applied 不能再次 dismiss', () => {
    const applied = suggestionReducer(demo, { type: 'apply', id: 'demo-1' });
    const s = suggestionReducer(applied, { type: 'dismiss', id: 'demo-1' });
    expect(s.find((x) => x.id === 'demo-1')?.status).toBe('applied');
  });

  it('applySuggestionsToCore：仅 applied 合入 core', () => {
    const list = [
      { id: 'a', field: 'problem' as const, suggestion: '新问题', before: '', status: 'applied' as const, source: 'manual' as const },
      { id: 'b', field: 'method' as const, suggestion: '新方法', before: '', status: 'dismissed' as const, source: 'manual' as const },
    ];
    const next = applySuggestionsToCore(emptyCore(), list);
    expect(next.problem).toBe('新问题'); // applied 合入
    expect(next.method).toBe(''); // dismissed 不合入
  });

  it('revise keeps a proposal pending and apply writes only the researcher-edited text', () => {
    const revised = suggestionReducer(demo, {
      type: 'revise',
      id: 'demo-1',
      suggestion: 'Researcher-edited text',
    });
    expect(revised.find((item) => item.id === 'demo-1')).toMatchObject({
      status: 'pending',
      suggestion: 'Researcher-edited text',
    });

    const applied = suggestionReducer(revised, { type: 'apply', id: 'demo-1' });
    expect(applySuggestionsToCore(emptyCore(), applied).problem).toBe('Researcher-edited text');
  });
});

describe('合同测试：编辑器 core vs SDF_CORE_FIELDS（§21.1）', () => {
  it('emptyCore 含 schemaVersion + 全部 SDF_CORE_FIELDS', () => {
    const c = emptyCore();
    expect(c.schemaVersion).toBe('0.1.0');
    for (const field of SDF_CORE_FIELDS) {
      expect(c[field]).toBe('');
    }
  });
});
