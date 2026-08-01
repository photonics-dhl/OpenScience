import { describe, expect, it } from 'vitest';
import type { WorkspaceRole } from '@prisma/client';
import { WorkspaceError } from '../src/workspace/errors';
import { can, requireAction, ROLE_PERMISSIONS, WORKSPACE_ACTIONS } from '../src/workspace/permissions';

const ROLES: WorkspaceRole[] = ['owner', 'maintainer', 'author', 'contributor', 'reviewer', 'viewer'];

// 期望矩阵（刻意与实现各自手写，防同步改错）；C/D 类动作（leave/accept/decline/create/list-my）不经矩阵
const EXPECTED: Record<string, readonly WorkspaceRole[]> = {
  'workspace.read': ROLES,
  'workspace.update': ['owner', 'maintainer'],
  'workspace.archive': ['owner'],
  'workspace.transfer': ['owner'],
  'member.list': ROLES,
  'member.change_role': ['owner'],
  'member.remove': ['owner', 'maintainer'],
  'invitation.create': ['owner', 'maintainer'],
  'invitation.revoke': ['owner', 'maintainer'],
};

describe('RBAC 动作×角色矩阵', () => {
  it('动作清单恰为 9 个且与期望键集一致', () => {
    expect([...WORKSPACE_ACTIONS].sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it('6 角色 × 9 动作全笛卡尔积（54 条）与期望一致', () => {
    for (const role of ROLES) {
      for (const action of WORKSPACE_ACTIONS) {
        expect(can(role, action), `${role} × ${action}`).toBe(EXPECTED[action].includes(role));
      }
    }
  });

  it('ROLE_PERMISSIONS 覆盖每个动作（无遗漏键）', () => {
    for (const action of WORKSPACE_ACTIONS) expect(ROLE_PERMISSIONS[action]).toBeDefined();
  });

  it('requireAction：允许不抛；拒绝抛 WorkspaceError FORBIDDEN', () => {
    expect(() => requireAction({ role: 'owner' }, 'workspace.transfer')).not.toThrow();
    expect(() => requireAction({ role: 'viewer' }, 'workspace.update')).toThrowError(WorkspaceError);
    try {
      requireAction({ role: 'author' }, 'member.remove');
      expect.unreachable('应抛 FORBIDDEN');
    } catch (e) {
      expect((e as WorkspaceError).code).toBe('FORBIDDEN');
    }
  });
});
