import { describe, expect, it, beforeEach } from 'vitest';
import {
  chooseConflictField,
  clearDraft,
  conflictChoicesComplete,
  coreFieldsChanged,
  createCoreConflict,
  draftKey,
  editorReducer,
  emptyCore,
  loadDraft,
  resolveCoreConflict,
  resolveDraftChoice,
  saveDraft,
} from '../lib/editor-state';
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
  it('loads partial paper content without dropping extension fields', () => {
    const partial = { schemaVersion: '0.1.0', problem: 'Research question', futureField: 'Retained' } as unknown as ReturnType<typeof emptyCore>;
    const state = editorReducer({ core: emptyCore(), version: 1, dirty: false, lastSavedAt: null }, { type: 'init', core: partial, version: 2 });
    expect(SDF_CORE_FIELDS.every(field => typeof state.core[field] === 'string')).toBe(true);
    expect(state.core).toMatchObject({ problem: 'Research question', insight: '', futureField: 'Retained' });
    expect(state.dirty).toBe(false);
  });

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

  it('replace keeps restored local text dirty against the current server revision', () => {
    const s = editorReducer({ core: core(), version: 2, dirty: false, lastSavedAt: 10 }, {
      type: 'replace', core: { ...core(), problem: 'Recovered locally' }, version: 4, dirty: true,
    });
    expect(s).toMatchObject({ version: 4, dirty: true, lastSavedAt: 10 });
    expect(s.core.problem).toBe('Recovered locally');
  });

  it('六字段全可编辑（§5.1 SDF_CORE_FIELDS）', () => {
    for (const field of SDF_CORE_FIELDS) {
      const s = editorReducer({ core: core(), version: 1, dirty: false, lastSavedAt: null }, { type: 'edit_field', field, value: `新${field}` });
      expect((s.core as Record<string, string>)[field]).toBe(`新${field}`);
    }
  });
});

describe('editor conflict resolution', () => {
  it('keeps local input untouched until every changed field has an explicit choice', () => {
    const local = { ...core(), problem: 'My problem', results: 'My result' };
    const server = { ...core(), problem: 'Server problem', results: 'Server result' };
    const conflict = createCoreConflict(local, server, 8);
    expect(conflict.fields).toEqual(['problem', 'results']);
    expect(resolveCoreConflict(chooseConflictField(conflict, 'problem', 'mine'))).toBeNull();
    expect(conflict.localCore).toEqual(local);
  });

  it('merges field choices and advances the save base without claiming the local choice is saved', () => {
    const local = { ...core(), problem: 'My problem', results: 'My result' };
    const server = { ...core(), problem: 'Server problem', results: 'Server result' };
    let conflict = createCoreConflict(local, server, 8);
    conflict = chooseConflictField(conflict, 'problem', 'mine');
    conflict = chooseConflictField(conflict, 'results', 'server');
    expect(conflictChoicesComplete(conflict)).toBe(true);
    expect(resolveCoreConflict(conflict)).toEqual({
      core: { ...server, problem: 'My problem' }, version: 8, dirty: true,
    });
  });

  it('choosing server content for all changes produces a clean current-revision state', () => {
    const local = { ...core(), method: 'My method' };
    const server = { ...core(), method: 'Server method' };
    const conflict = chooseConflictField(createCoreConflict(local, server, 9), 'method', 'server');
    expect(resolveCoreConflict(conflict)).toEqual({ core: server, version: 9, dirty: false });
  });

  it('still requires applying the newer revision when another field outside SDF caused the conflict', () => {
    const conflict = createCoreConflict(core(), core(), 10);
    expect(conflictChoicesComplete(conflict)).toBe(true);
    expect(resolveCoreConflict(conflict)).toEqual({ core: core(), version: 10, dirty: false });
  });

  it('diffs forward-compatible fields so unseen extensions cannot be overwritten silently', () => {
    const local = { ...core(), futureField: 'mine' } as unknown as ReturnType<typeof core>;
    const server = { ...core(), futureField: 'server' } as unknown as ReturnType<typeof core>;
    expect(coreFieldsChanged(local, server)).toEqual(['futureField']);
  });
});

describe('草稿持久化（§18.3）', () => {

  it('requires an explicit restore or discard choice against server content', () => {
    const server = { core: core(), version: 6 };
    const draft = { core: { ...core(), problem: 'Local recovery' }, savedAt: 10 };
    expect(resolveDraftChoice(server, draft, 'restore')).toEqual({ core: draft.core, version: 6, dirty: true });
    expect(resolveDraftChoice(server, draft, 'discard')).toEqual({ core: server.core, version: 6, dirty: false });
  });

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
