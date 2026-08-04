import { describe, expect, it } from 'vitest';
import { createFakePrisma, seedUser } from '../helpers/fakes';
import { createAgentSession, submitAgentTask } from '../../src/agent/agent';
import {
  approvalLevel, buildConfirmation, createApproval, approveApproval, rejectApproval, revokeApproval, listPendingApprovals,
} from '../../src/approval/approvals';
import { ApprovalError } from '../../src/approval/errors';

function fakeRedis() {
  const lists = new Map<string, string[]>();
  return {
    lists,
    lpush: async (key: string, val: string) => {
      const arr = lists.get(key) ?? [];
      arr.unshift(val);
      lists.set(key, arr);
      return arr.length;
    },
    brpoplpush: async (src: string, _dst: string, timeout: number) => {
      void timeout;
      const arr = lists.get(src);
      const val = arr?.pop();
      if (!val) return null;
      lists.set(src, arr!);
      return val;
    },
    lrem: async (key: string, _count: number, val: string) => {
      const arr = lists.get(key) ?? [];
      lists.set(key, arr.filter((v) => v !== val));
      return 0;
    },
  };
}

async function makeDeps() {
  const { prisma, db } = createFakePrisma();
  const user = seedUser(db, { id: 'ap-user' });
  db.usageLedger.push({ id: 'u-1', userId: user.id, resource: 'ai_credit', delta: 100, kind: 'grant', createdAt: new Date() });
  const deps = { prisma, mailer: {} as never, redis: fakeRedis() } as never;
  const session = await createAgentSession(deps, { userId: user.id, kind: 'extract' });
  const task = await submitAgentTask(deps, { sessionId: session.id, userId: user.id, kind: 'demo.echo', payload: {} });
  return { deps, db, user, task };
}

describe('approvalLevel（§9.4 分级判定）', () => {
  it('R0 读自动 / R1 草稿 / R2 协作 / R3 高影响 / R4 危险', () => {
    expect(approvalLevel('get')).toBe(0);
    expect(approvalLevel('sdf.suggest.apply')).toBe(1);
    expect(approvalLevel('commit.create')).toBe(2);
    expect(approvalLevel('merge.pull_request')).toBe(3);
    expect(approvalLevel('version.publish')).toBe(3);
    expect(approvalLevel('ro.delete')).toBe(4);
    expect(approvalLevel('ownership.transfer')).toBe(4);
  });

  it('未知 action → R3 安全默认', () => {
    expect(approvalLevel('unknown.thing')).toBe(3);
  });
});

describe('buildConfirmation（§9.4 五要素）', () => {
  it('五要素齐全 + R4 不可撤销', () => {
    const spec = buildConfirmation('ro.delete', { title: '示例 RO' });
    expect(spec.what).toContain('ro.delete');
    expect(spec.scope).toBeTruthy();
    expect(spec.reversible).toContain('不可撤销');
    expect(spec.estCost).toBeTruthy();
    expect(spec.estTime).toBeTruthy();
  });

  it('R1 可撤销', () => {
    expect(buildConfirmation('sdf.suggest.apply').reversible).toContain('可撤销');
  });
});

describe('ToolApproval 生命周期（§15 + §2.5-7 撤销）', () => {
  it('R0 action → 不建审批（自动执行）', async () => {
    const { deps, task } = await makeDeps();
    const approval = await createApproval(deps, { taskId: task.id, action: 'get' });
    expect(approval).toBeNull();
  });

  it('create → approve → 审计 + 状态；同批去重', async () => {
    const { deps, user, task } = await makeDeps();
    const approval = await createApproval(deps, { taskId: task.id, action: 'merge.pull_request', scope: 'pr:1', title: '合并 PR' });
    expect(approval!.level).toBe(3);
    expect(approval!.status).toBe('pending');
    expect(approval!.confirmation.what).toContain('合并 PR');

    const approved = await approveApproval(deps, { userId: user.id, approvalId: approval!.id });
    expect(approved.status).toBe('approved');
    expect(approved.approvedBy).toBe(user.id);

    // 同批去重：同 task+scope 再建 → 返回既有 approved（§9.4 不重复弹窗）
    const again = await createApproval(deps, { taskId: task.id, action: 'merge.pull_request', scope: 'pr:1' });
    expect(again!.status).toBe('approved');
  });

  it('approve → revoke（撤销，§2.5-7）', async () => {
    const { deps, user, task } = await makeDeps();
    const approval = await createApproval(deps, { taskId: task.id, action: 'license.upsert' });
    await approveApproval(deps, { userId: user.id, approvalId: approval!.id });
    const revoked = await revokeApproval(deps, { userId: user.id, approvalId: approval!.id });
    expect(revoked.status).toBe('revoked');
  });

  it('reject → revoked 非法迁移（rejected 终态）', async () => {
    const { deps, user, task } = await makeDeps();
    const approval = await createApproval(deps, { taskId: task.id, action: 'fork.create' });
    await rejectApproval(deps, { userId: user.id, approvalId: approval!.id });
    await expect(
      revokeApproval(deps, { userId: user.id, approvalId: approval!.id }),
    ).rejects.toThrow(ApprovalError);
  });

  it('非 owner approve → FORBIDDEN', async () => {
    const { deps, db, task } = await makeDeps();
    const outsider = seedUser(db, { id: 'ap-outsider' });
    const approval = await createApproval(deps, { taskId: task.id, action: 'merge.pull_request' });
    await expect(
      approveApproval(deps, { userId: outsider.id, approvalId: approval!.id }),
    ).rejects.toThrow(/仅任务所有者/);
  });
});

describe('listPendingApprovals（§2.5-7 批量预览）', () => {
  it('当前用户待审批列表', async () => {
    const { deps, user, task } = await makeDeps();
    await createApproval(deps, { taskId: task.id, action: 'merge.pull_request' });
    const pending = await listPendingApprovals(deps, { userId: user.id });
    expect(pending).toHaveLength(1);
    expect(pending[0].status).toBe('pending');
  });
});
