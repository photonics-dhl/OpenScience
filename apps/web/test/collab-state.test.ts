import { describe, expect, it } from 'vitest';
import { collabReducer, initialCollabState, mergeErrorToReasons } from '../lib/collab-state';

describe('collabReducer（P1C-10 协作 tab + 高风险对话框状态，§18.2）', () => {
  it('set_tab → 切 tab + 清选中', () => {
    const s = collabReducer({ ...initialCollabState, selectedId: 'x' }, { type: 'set_tab', tab: 'prs' });
    expect(s.tab).toBe('prs');
    expect(s.selectedId).toBeNull();
  });

  it('select → 记录详情 id', () => {
    const s = collabReducer(initialCollabState, { type: 'select', id: 'i1' });
    expect(s.selectedId).toBe('i1');
  });

  it('open_high_risk → 记录 prId + reasons（Q5）', () => {
    const s = collabReducer(initialCollabState, { type: 'open_high_risk', prId: 'pr1', reasons: ['新增作者', '改变方法'] });
    expect(s.highRisk.open).toBe(true);
    expect(s.highRisk.prId).toBe('pr1');
    expect(s.highRisk.reasons).toHaveLength(2);
  });

  it('close_high_risk → 清空', () => {
    const open = collabReducer(initialCollabState, { type: 'open_high_risk', prId: 'pr1', reasons: ['x'] });
    const closed = collabReducer(open, { type: 'close_high_risk' });
    expect(closed.highRisk.open).toBe(false);
    expect(closed.highRisk.prId).toBeNull();
  });
});

describe('mergeErrorToReasons（Q5：后端 409 reasons 提取）', () => {
  it('HIGH_RISK_CONFIRMATION_REQUIRED → 提取 reasons 列表', () => {
    const err = { code: 'HIGH_RISK_CONFIRMATION_REQUIRED', message: 'Merge 命中高风险，需显式确认（§8.3）: 新增作者: u1; 声明改变方法' };
    expect(mergeErrorToReasons(err)).toEqual(['新增作者: u1', '声明改变方法']);
  });

  it('非高风险错误 → 空列表', () => {
    expect(mergeErrorToReasons({ code: 'FORBIDDEN', message: 'x' })).toEqual([]);
    expect(mergeErrorToReasons(null)).toEqual([]);
  });
});
