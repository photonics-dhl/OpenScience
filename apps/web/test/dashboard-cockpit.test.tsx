import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => ({
    title: '研究驾驶舱',
    hermesReady: 'Hermes 已就绪',
    'nextAction.eyebrow': '唯一下一步行动',
    'nextAction.title': '确认方法段落的证据锚点',
    'nextAction.description': 'Hermes 已将材料整理为可审阅的 SDF 草稿。确认来源位置后，才会进入下一次版本提交。',
    'nextAction.cta': '进入 RO 工作区',
    'nextAction.progress': '处理进度 68% · 可随时恢复',
    'ro.draft': '私有草稿',
    'ro.title': '非平衡光子晶体中的自适应测量',
    'ro.updated': '刚刚由 Hermes 更新',
    'ro.versioned': '可回溯版本',
    'tasks.eyebrow': '任务中心',
    'tasks.extract': '确认证据锚点',
    'tasks.extractMeta': '方法 · 进行中',
    'tasks.review': '查看 AI 结构建议',
    'tasks.reviewMeta': '3 条待确认',
    'tasks.publish': '准备公开版本',
    'tasks.publishMeta': '权限 · 未开始',
  } as Record<string, string>)[key] ?? key,
}));

describe('research cockpit surface', () => {
  it('renders an action-first dashboard from authenticated research data', async () => {
    const { DashboardView } = await import('../components/dashboard/DashboardShell');
    const markup = renderToStaticMarkup(createElement(DashboardView, {
      state: {
        kind: 'ready',
        user: { userId: 'user-1', email: 'researcher@example.com', displayName: 'Ada', status: 'active', level: 'researcher' },
        workspace: { id: 'workspace-1', type: 'personal', name: 'Ada Research', status: 'active', role: 'owner', createdAt: '2026-08-09T00:00:00.000Z' },
        researchObjects: [{
          id: '11111111-1111-4111-8111-111111111111', workspaceId: 'workspace-1', publicId: null,
          title: 'Adaptive measurement in photonic systems', status: 'draft', visibility: 'private',
          version: 4, createdAt: '2026-08-08T00:00:00.000Z', updatedAt: '2026-08-09T00:00:00.000Z',
        }],
        notifications: [],
      },
    }));

    expect(markup).toContain('data-cockpit="dashboard"');
    expect(markup).toContain('Adaptive measurement in photonic systems');
    expect(markup).not.toContain('OS-RO-01J8YF7Q');
    expect(markup).toContain('data-next-action');
    expect(markup).toContain('进入 RO 工作区');
    expect(markup).toContain('href="/research-objects/11111111-1111-4111-8111-111111111111/workspace"');
    expect(markup).toContain('data-task-rail');
  });

  it('offers first-RO creation when the authenticated workspace is empty', async () => {
    const { DashboardView } = await import('../components/dashboard/DashboardShell');
    const markup = renderToStaticMarkup(createElement(DashboardView, {
      state: {
        kind: 'empty',
        user: { userId: 'user-1', email: 'researcher@example.com', displayName: 'Ada', status: 'active', level: 'researcher' },
        workspace: { id: 'workspace-1', type: 'personal', name: 'Ada Research', status: 'active', role: 'owner', createdAt: '2026-08-09T00:00:00.000Z' },
      },
    }));

    expect(markup).toContain('data-dashboard-state="empty"');
    expect(markup).toContain('href="/research-objects/new"');
  });

  it('shows a recoverable error state', async () => {
    const { DashboardView } = await import('../components/dashboard/DashboardShell');
    const markup = renderToStaticMarkup(createElement(DashboardView, {
      state: { kind: 'error' },
      onRetry: () => undefined,
    }));

    expect(markup).toContain('data-dashboard-state="error"');
    expect(markup).toContain('type="button"');
  });

  it('keeps procedural evidence particles decorative and deterministic', async () => {
    const { default: EvidenceField } = await import('../components/landing/EvidenceField');
    const markup = renderToStaticMarkup(createElement(EvidenceField));

    expect(markup).toContain('data-evidence-field');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('data-particle-count="18"');
    expect((markup.match(/data-particle-index=/g) ?? []).length).toBe(18);
  });
});
