import { describe, expect, it } from 'vitest';
import { createFakePrisma, seedUser } from '../helpers/fakes';
import { createResearchObject } from '../../src/research-object/research-objects';
import { notify, listNotifications, markNotificationRead } from '../../src/notification/notifications';
import { EmailChannel } from '../../src/notification/channels';
import { createIssue } from '../../src/issue/issues';
import { NotificationError } from '../../src/notification/errors';

async function makeDeps() {
  const { prisma, db } = createFakePrisma();
  const owner = seedUser(db, { id: 'notif-owner' });
  const ws = { id: 'ws-1', type: 'team', name: 'Lab', status: 'active', ownerId: owner.id, createdAt: new Date(), updatedAt: new Date() };
  db.workspaces.push(ws);
  db.memberships.push({ id: 'm-1', workspaceId: 'ws-1', userId: owner.id, role: 'owner', createdAt: new Date(), updatedAt: new Date() });
  const deps = { prisma, mailer: {} as never };
  const ro = await createResearchObject(deps, { workspaceId: 'ws-1', userId: owner.id, title: 'RO' });
  return { deps, db, owner, ro };
}

describe('notify + 渠道抽象（Q4）', () => {
  it('InAppChannel 写 Notification 行', async () => {
    const { deps, owner, ro } = await makeDeps();
    await notify(deps, { userId: owner.id, type: 'pull_request.opened', payload: { prId: 'x', link: `/research-objects/${ro.id}/pull-requests/x` } });
    const list = await listNotifications(deps, { userId: owner.id });
    expect(list).toHaveLength(1);
    expect(list[0].type).toBe('pull_request.opened');
    expect(list[0].read).toBe(false);
  });

  it('EmailChannel 占位：§24 待确认，不写死', async () => {
    const email = new EmailChannel();
    await expect(email.deliver({ userId: 'u', type: 'x', payload: {} })).rejects.toThrow(/§24/);
  });

  it('通知私有：A 的通知 B 看不到', async () => {
    const { deps, db, owner } = await makeDeps();
    const other = seedUser(db, { id: 'notif-other' });
    await notify(deps, { userId: owner.id, type: 'issue.updated', payload: {} });
    const otherList = await listNotifications(deps, { userId: other.id });
    expect(otherList).toHaveLength(0);
  });
});

describe('listNotifications（Q5 分页 + 未读优先）', () => {
  it('未读优先排序', async () => {
    const { deps, owner } = await makeDeps();
    await notify(deps, { userId: owner.id, type: 'a', payload: {} });
    const notif = await listNotifications(deps, { userId: owner.id });
    await markNotificationRead(deps, { userId: owner.id, notificationId: notif[0].id });
    await notify(deps, { userId: owner.id, type: 'b', payload: {} });
    const sorted = await listNotifications(deps, { userId: owner.id });
    expect(sorted[0].type).toBe('b'); // 未读在前
  });

  it('unreadOnly 过滤 + limit', async () => {
    const { deps, owner } = await makeDeps();
    await notify(deps, { userId: owner.id, type: 'a', payload: {} });
    const first = await listNotifications(deps, { userId: owner.id });
    await markNotificationRead(deps, { userId: owner.id, notificationId: first[0].id });
    await notify(deps, { userId: owner.id, type: 'b', payload: {} });
    const unread = await listNotifications(deps, { userId: owner.id, unreadOnly: true });
    expect(unread).toHaveLength(1);
    expect(unread[0].type).toBe('b');
    const limited = await listNotifications(deps, { userId: owner.id, limit: 1 });
    expect(limited).toHaveLength(1);
  });
});

describe('markNotificationRead（Q5 仅本人 + 幂等）', () => {
  it('本人标记已读 + 幂等重放', async () => {
    const { deps, owner } = await makeDeps();
    await notify(deps, { userId: owner.id, type: 'x', payload: {} });
    const [n] = await listNotifications(deps, { userId: owner.id });
    const read = await markNotificationRead(deps, { userId: owner.id, notificationId: n.id });
    expect(read.read).toBe(true);
    const again = await markNotificationRead(deps, { userId: owner.id, notificationId: n.id });
    expect(again.read).toBe(true); // 幂等
  });

  it('他人标记 → 404（不泄露）', async () => {
    const { deps, db, owner } = await makeDeps();
    const other = seedUser(db, { id: 'notif-other2' });
    await notify(deps, { userId: owner.id, type: 'x', payload: {} });
    const [n] = await listNotifications(deps, { userId: owner.id });
    await expect(
      markNotificationRead(deps, { userId: other.id, notificationId: n.id }),
    ).rejects.toThrow(NotificationError);
  });
});

describe('Issue 动态通知（Q2，§18.1）', () => {
  it('createIssue 发 issue.updated 给 RO 创建者', async () => {
    const { deps, owner, ro } = await makeDeps();
    await createIssue(deps, { researchObjectId: ro.id, userId: owner.id, title: 'x', kind: 'question' });
    const notifs = await listNotifications(deps, { userId: owner.id });
    const issueNotif = notifs.find((n) => n.type === 'issue.updated');
    expect(issueNotif).toBeDefined();
    expect(issueNotif!.payload).toHaveProperty('link');
  });
});
