/** P1C-10 协作区域状态逻辑（纯 reducer，可测；§18.2 GitHub 式 tab 交互）。 */

export type CollabTab = 'issues' | 'prs' | 'branches' | 'fork' | 'authors' | 'notifications';

/** 高危操作确认框状态（仅 CollabState 内部字段类型）。 */
interface HighRiskState {
  open: boolean;
  prId: string | null;
  reasons: string[];
}

export interface CollabState {
  tab: CollabTab;
  /** 详情抽屉选中的对象 id（Issue/PR），null = 列表态 */
  selectedId: string | null;
  highRisk: HighRiskState;
}

export const initialCollabState: CollabState = {
  tab: 'issues',
  selectedId: null,
  highRisk: { open: false, prId: null, reasons: [] },
};

export type CollabAction =
  | { type: 'set_tab'; tab: CollabTab }
  | { type: 'select'; id: string | null }
  | { type: 'open_high_risk'; prId: string; reasons: string[] }
  | { type: 'close_high_risk' };

export function collabReducer(state: CollabState, action: CollabAction): CollabState {
  switch (action.type) {
    case 'set_tab':
      // 切 tab 时清选中（§18.2 tab 语义独立）
      return { ...state, tab: action.tab, selectedId: null };
    case 'select':
      return { ...state, selectedId: action.id };
    case 'open_high_risk':
      return { ...state, highRisk: { open: true, prId: action.prId, reasons: action.reasons } };
    case 'close_high_risk':
      return { ...state, highRisk: { open: false, prId: null, reasons: [] } };
    default:
      return state;
  }
}

/** Merge 高风险判定映射（Q5：后端 409 reasons 展示；前端不重复判定逻辑）。 */
export function mergeErrorToReasons(err: unknown): string[] {
  const e = err as { code?: string; message?: string };
  if (e?.code === 'HIGH_RISK_CONFIRMATION_REQUIRED') {
    const reasons = (e.message ?? '').split('§8.3）: ')[1]?.split('; ').filter(Boolean) ?? [];
    return reasons;
  }
  return [];
}
