import type { SdfCore } from './api';

/** 空六字段 core（§5.1）。 */
export function emptyCore(): SdfCore {
  return { schemaVersion: '0.1.0', problem: '', insight: '', method: '', results: '', limitations: '', reproducibility: '' };
}

export interface EditorState {
  core: SdfCore;
  version: number; // 乐观锁（§16）
  dirty: boolean;
  lastSavedAt: number | null;
}

export type EditorAction =
  | { type: 'init'; core: SdfCore; version: number }
  | { type: 'edit_field'; field: keyof Omit<SdfCore, 'schemaVersion'>; value: string }
  | { type: 'saved'; version: number }
  | { type: 'reset' };

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'init':
      return { core: { ...action.core }, version: action.version, dirty: false, lastSavedAt: Date.now() };
    case 'edit_field':
      return { ...state, core: { ...state.core, [action.field]: action.value }, dirty: true };
    case 'saved':
      return { ...state, version: action.version, dirty: false, lastSavedAt: Date.now() };
    case 'reset':
      return { ...state, dirty: false };
    default:
      return state;
  }
}

/** 草稿 storage key（§18.3 自动保存）。 */
export function draftKey(roId: string): string {
  return `editor:draft:${roId}`;
}

export interface DraftData {
  core: SdfCore;
  savedAt: number;
}

export function saveDraft(roId: string, core: SdfCore): void {
  const data: DraftData = { core, savedAt: Date.now() };
  try {
    localStorage.setItem(draftKey(roId), JSON.stringify(data));
  } catch {
    // 存储不可用（隐私模式/配额）→ 静默失败，UI 提示（§13.2）
  }
}

export function loadDraft(roId: string): DraftData | null {
  try {
    const raw = localStorage.getItem(draftKey(roId));
    if (!raw) return null;
    return JSON.parse(raw) as DraftData;
  } catch {
    return null;
  }
}

export function clearDraft(roId: string): void {
  try {
    localStorage.removeItem(draftKey(roId));
  } catch {
    // 忽略
  }
}
