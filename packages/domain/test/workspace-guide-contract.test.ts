import { describe, expect, it } from 'vitest';

import { parseWorkspaceGuidePayload } from '../src/agent/workspace-guide-contract';

const payload = {
  goal: 'Help me shape the problem statement',
  locale: 'en' as const,
  route: 'research-object-edit',
  target: 'sdf-problem',
  context: { tasks: [], researchObjects: [{ id: 'ro-1', title: 'Optical transport', status: 'draft' }] },
};

describe('workspace guide route and semantic target contract', () => {
  it('accepts only the three workspace route classes and known semantic targets', () => {
    expect(parseWorkspaceGuidePayload(payload)).toEqual(payload);
    expect(parseWorkspaceGuidePayload({ ...payload, route: 'dashboard', target: null }).route).toBe('dashboard');
    expect(parseWorkspaceGuidePayload({ ...payload, route: 'research-object-new', target: 'ro-title' }).target).toBe('ro-title');
  });

  it('rejects unknown routes, targets, and client-supplied field contents', () => {
    expect(() => parseWorkspaceGuidePayload({ ...payload, route: '/admin' })).toThrow('route');
    expect(() => parseWorkspaceGuidePayload({ ...payload, target: 'arbitrary-dom-id' })).toThrow('target');
    expect(() => parseWorkspaceGuidePayload({ ...payload, fieldContents: { problem: 'private draft' } })).toThrow('未知字段');
  });
});
