import type { SdfCore } from './api';

/** AI 建议（§5.4 MUST：以 diff 展示，确认后才写入 SDF）。 */
export interface AiSuggestion {
  id: string;
  field: keyof Omit<SdfCore, 'schemaVersion'>;
  suggestion: string;
  before: string;
  status: 'pending' | 'applied' | 'dismissed';
  source: 'extractor' | 'manual'; // Phase 1D extractor 接同通路
  sourceContext?: 'sdf_aggregate';
  sourceLocator?: string;
  risk?: 'normal' | 'high';
}

export const SDF_FIELDS = ['problem', 'insight', 'method', 'results', 'limitations', 'reproducibility'] as const;
export type SdfField = (typeof SDF_FIELDS)[number];

const isSdfField = (value: unknown): value is SdfField =>
  typeof value === 'string' && SDF_FIELDS.includes(value as SdfField);

export function extractMissingSdfFields(result: unknown): SdfField[] {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return [];
  const values = (result as Record<string, unknown>).needsMoreInformation;
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter(isSdfField))];
}

/** 建议状态机：pending → applied（写入草稿，不直接写 SDF）/ dismissed。 */
export type SuggestionAction =
  | { type: 'apply'; id: string }
  | { type: 'dismiss'; id: string }
  | { type: 'revise'; id: string; suggestion: string }
  | { type: 'add'; suggestion: AiSuggestion }
  | { type: 'reset' };

export function suggestionReducer(suggestions: AiSuggestion[], action: SuggestionAction): AiSuggestion[] {
  switch (action.type) {
    case 'add':
      return suggestions.some((s) => s.id === action.suggestion.id) ? suggestions : [...suggestions, action.suggestion];
    case 'reset':
      return [];
    case 'apply':
      return suggestions.map((s) => (s.id === action.id && s.status === 'pending' ? { ...s, status: 'applied' as const } : s));
    case 'revise':
      return suggestions.map((s) => (s.id === action.id && s.status === 'pending' ? { ...s, suggestion: action.suggestion } : s));
    case 'dismiss':
      return suggestions.map((s) => (s.id === action.id && s.status === 'pending' ? { ...s, status: 'dismissed' as const } : s));
    default:
      return suggestions;
  }
}

/** 把已应用的建议合入 core（仅 pending 且用户显式 apply 的）。 */
export function applySuggestionsToCore(core: SdfCore, suggestions: AiSuggestion[]): SdfCore {
  const next = { ...core };
  for (const s of suggestions) {
    if (s.status === 'applied') next[s.field] = s.suggestion;
  }
  return next;
}

/** 预置演示建议（Phase 1D extractor 接同通路，§5.4）。 */
export function demoSuggestions(currentCore: SdfCore): AiSuggestion[] {
  const list: AiSuggestion[] = [];
  if (!currentCore.problem.trim()) {
    list.push({
      id: 'demo-1', field: 'problem', suggestion: '（示例建议）请描述研究的核心科学问题',
      before: currentCore.problem, status: 'pending', source: 'manual',
    });
  }
  if (!currentCore.method.trim()) {
    list.push({
      id: 'demo-2', field: 'method', suggestion: '（示例建议）请描述研究方法与实验设计',
      before: currentCore.method, status: 'pending', source: 'manual',
    });
  }
  return list;
}

/**
 * P1D-3：Extractor 结果 core → AiSuggestion[]（§5.4 逐字段 diff 展示）。
 * 仅非空且与当前不同的字段产出建议；source='extractor'。
 */
export function coreToSuggestions(core: SdfCore, currentCore: SdfCore, sourceLocator?: string): AiSuggestion[] {
  const list: AiSuggestion[] = [];
  for (const field of SDF_FIELDS) {
    const suggestion = (core[field] ?? '').trim();
    const before = (currentCore[field] ?? '').trim();
    if (!suggestion || suggestion === before) continue;
    list.push({
      id: `extract-${field}`,
      field,
      suggestion,
      before,
      status: 'pending',
      source: 'extractor',
      sourceContext: 'sdf_aggregate',
      sourceLocator,
      risk: field === 'results' || field === 'reproducibility' ? 'high' : 'normal',
    });
  }
  return list;
}

