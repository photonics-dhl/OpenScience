import type { SdfCore, SdfCoreSnapshot } from './api';
import { SDF_CORE_FIELDS as SDF_FIELDS, validateReadableSdfDraftCore, type SdfField, type SdfFieldFormat } from '@openscience/sdf-schema';

/** Known author formats only; legacy missing fields and opaque extensions stay supported. */
export function canEditSdfCore(core: unknown): boolean {
  if (!core || typeof core !== 'object' || Array.isArray(core)) return false;
  const value = core as Record<string, unknown>;
  if (value.schemaVersion === '0.2.0') return validateReadableSdfDraftCore(value).ok;
  return (value.schemaVersion === undefined || value.schemaVersion === '0.1.0')
    && SDF_FIELDS.every(field => value[field] === undefined || typeof value[field] === 'string');
}

export function sdfFieldFormat(core: SdfCoreSnapshot, field: SdfField): SdfFieldFormat {
  return core.schemaVersion === '0.2.0' && canEditSdfCore(core)
    ? (core.fieldFormats as Partial<Record<SdfField, SdfFieldFormat>> | undefined)?.[field] ?? 'plain' : 'plain';
}

/** A local representation identity; never sent to Hermes as scientific context. */
export function sdfRepresentationSignature(core: SdfCoreSnapshot): string {
  return JSON.stringify([core.schemaVersion, ...SDF_FIELDS.map(field => core[field]),
    ...SDF_FIELDS.map(field => sdfFieldFormat(core, field))]);
}

export function sameSdfRepresentation(left: SdfCoreSnapshot, right: SdfCoreSnapshot): boolean {
  return sdfRepresentationSignature(left) === sdfRepresentationSignature(right);
}

/** Manual typing preserves format; explicit plain adoption clears only that field. */
export function withSdfField(core: SdfCoreSnapshot, field: SdfField, value: string, format?: SdfFieldFormat): SdfCoreSnapshot {
  if (!canEditSdfCore(core)) return core;
  if (format === undefined) return { ...core, [field]: value };
  if (format === 'plain' && core.schemaVersion !== '0.2.0') return { ...core, [field]: value };
  const fieldFormats = core.schemaVersion === '0.2.0' ? { ...(core.fieldFormats as Partial<Record<SdfField, SdfFieldFormat>> | undefined) } : {};
  if (format === 'plain') delete fieldFormats[field];
  else fieldFormats[field] = format;
  return { ...core, schemaVersion: '0.2.0', [field]: value, fieldFormats };
}

export function canRestoreBrowserDraft(serverCore: unknown, draft: DraftData | null, now = Date.now()): draft is DraftData {
  return canEditSdfCore(serverCore) && Boolean(draft && canEditSdfCore(draft.core)
    && Number.isFinite(draft.savedAt) && now - draft.savedAt < 24 * 3600 * 1000);
}

/** 空六字段 core（§5.1）。 */
export function emptyCore(): SdfCore {
  return { schemaVersion: '0.1.0', problem: '', insight: '', method: '', results: '', limitations: '', reproducibility: '' };
}

export interface EditorState {
  core: SdfCoreSnapshot;
  version: number; // 乐观锁（§16）
  dirty: boolean;
  lastSavedAt: number | null;
}

export type EditorAction =
  | { type: 'init'; core: SdfCoreSnapshot; version: number; dirty?: boolean }
  | { type: 'edit_field'; field: SdfField; value: string; format?: SdfFieldFormat }
  | { type: 'saved'; version: number; core?: SdfCore }
  | { type: 'reset' };

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'init':
      return { core: canEditSdfCore(action.core) ? { ...emptyCore(), ...action.core } : action.core, version: action.version, dirty: canEditSdfCore(action.core) && (action.dirty ?? false), lastSavedAt: Date.now() };
    case 'edit_field':
      if (!canEditSdfCore(state.core)) return state;
      return { ...state, core: withSdfField(state.core, action.field, action.value, action.format), dirty: true };
    case 'saved':
      if (!canEditSdfCore(state.core)) return state;
      return { ...state, version: action.version, dirty: Boolean(action.core && !sameSdfRepresentation(state.core, action.core)), lastSavedAt: Date.now() };
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
  core: SdfCoreSnapshot;
  savedAt: number;
}

export function saveDraft(roId: string, core: SdfCore): void {
  if (!canEditSdfCore(core)) return;
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
