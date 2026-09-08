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
  | { type: 'replace'; core: SdfCore; version: number; dirty: boolean }
  | { type: 'edit_field'; field: keyof Omit<SdfCore, 'schemaVersion'>; value: string }
  | { type: 'saved'; version: number }
  | { type: 'reset' };

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'init':
      return { core: { ...emptyCore(), ...action.core }, version: action.version, dirty: false, lastSavedAt: Date.now() };
    case 'replace':
      return { core: { ...emptyCore(), ...action.core }, version: action.version, dirty: action.dirty, lastSavedAt: state.lastSavedAt };
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

export type ConflictChoice = 'mine' | 'server';

export interface CoreConflict {
  localCore: SdfCore;
  serverCore: SdfCore;
  serverVersion: number;
  fields: string[];
  choices: Record<string, ConflictChoice | undefined>;
}

function coreValue(core: SdfCore, field: string): string | undefined {
  return (core as unknown as Record<string, string | undefined>)[field];
}

/** Compare every persisted string field, including forward-compatible extensions. */
export function coreFieldsChanged(localCore: SdfCore, serverCore: SdfCore): string[] {
  return [...new Set([...Object.keys(localCore), ...Object.keys(serverCore)])]
    .filter((field) => field !== 'schemaVersion' && coreValue(localCore, field) !== coreValue(serverCore, field))
    .sort();
}

export function coresEqual(left: SdfCore, right: SdfCore): boolean {
  return coreFieldsChanged(left, right).length === 0 && left.schemaVersion === right.schemaVersion;
}

export function createCoreConflict(localCore: SdfCore, serverCore: SdfCore, serverVersion: number): CoreConflict {
  return { localCore, serverCore, serverVersion, fields: coreFieldsChanged(localCore, serverCore), choices: {} };
}

export function chooseConflictField(conflict: CoreConflict, field: string, choice: ConflictChoice): CoreConflict {
  if (!conflict.fields.includes(field)) return conflict;
  return { ...conflict, choices: { ...conflict.choices, [field]: choice } };
}

export function conflictChoicesComplete(conflict: CoreConflict): boolean {
  return conflict.fields.every((field) => conflict.choices[field] === 'mine' || conflict.choices[field] === 'server');
}

export function resolveCoreConflict(conflict: CoreConflict): { core: SdfCore; version: number; dirty: boolean } | null {
  if (!conflictChoicesComplete(conflict)) return null;
  const merged = { ...conflict.serverCore } as unknown as Record<string, string>;
  for (const field of conflict.fields) {
    if (conflict.choices[field] === 'mine') {
      const value = coreValue(conflict.localCore, field);
      if (value === undefined) delete merged[field];
      else merged[field] = value;
    }
  }
  const core = merged as unknown as SdfCore;
  return { core, version: conflict.serverVersion, dirty: !coresEqual(core, conflict.serverCore) };
}

export function resolveDraftChoice(
  server: { core: SdfCore; version: number },
  draft: DraftData,
  choice: 'restore' | 'discard',
): { core: SdfCore; version: number; dirty: boolean } {
  if (choice === 'discard') return { core: server.core, version: server.version, dirty: false };
  return { core: draft.core, version: server.version, dirty: !coresEqual(draft.core, server.core) };
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
