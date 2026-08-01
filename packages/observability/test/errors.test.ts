import { describe, expect, it } from 'vitest';
import { buildErrorBody } from '../src/errors';

describe('buildErrorBody', () => {
  it('带 requestId 时三方串联字段落响应体', () => {
    expect(buildErrorBody('FORBIDDEN', '权限不足', 'req-1')).toEqual({
      error: { code: 'FORBIDDEN', message: '权限不足', requestId: 'req-1' },
    });
  });
  it('缺省 requestId 不产出该字段', () => {
    expect(buildErrorBody('INTERNAL', '内部错误')).toEqual({ error: { code: 'INTERNAL', message: '内部错误' } });
  });
});
