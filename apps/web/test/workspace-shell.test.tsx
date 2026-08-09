import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => ({
    title: 'RO 工作区',
    privateDraft: '私有草稿',
    editable: '可编辑',
    readOnly: '只读范围',
    hermesReady: 'Hermes 已就绪',
    'mode.overview': '概览',
    'mode.sdf': 'SDF 编辑',
    'mode.artifacts': '材料',
    'mode.versions': '版本',
    'mode.collaboration': '协作',
    'mode.public': '公开页',
    'hermes.title': 'Hermes 任务',
    'hermes.context': '当前上下文',
    'hermes.approval': '写入前需要确认',
  } as Record<string, string>)[key] ?? key,
}));

describe('unified RO workspace shell', () => {
  const context = {
    roId: 'OS-RO-01J8YF7Q',
    versionId: 'v0.4',
    workspaceId: 'ws-lab-01',
    mode: 'sdf' as const,
    permission: 'edit' as const,
  };

  it('keeps stable RO context across all six workspace modes', async () => {
    const { default: RoWorkspaceShell } = await import('../components/workspace/RoWorkspaceShell');
    const markup = renderToStaticMarkup(createElement(RoWorkspaceShell, { context }, createElement('p', null, 'Editor body')));

    expect(markup).toContain('data-workspace-shell');
    expect(markup).toContain('OS-RO-01J8YF7Q');
    expect(markup).toContain('v0.4');
    expect(markup).toContain('data-workspace-id="ws-lab-01"');
    expect((markup.match(/data-workspace-mode=/g) ?? []).length).toBe(12);
    expect(markup).toContain('data-active-mode="sdf"');
  });

  it('exposes permission and approval state without losing mobile functions', async () => {
    const { default: RoWorkspaceShell } = await import('../components/workspace/RoWorkspaceShell');
    const markup = renderToStaticMarkup(createElement(RoWorkspaceShell, {
      context: { ...context, permission: 'read' },
    }, createElement('p', null, 'Read-only body')));

    expect(markup).toContain('data-permission="read"');
    expect(markup).toContain('只读范围');
    expect(markup).toContain('data-hermes-approval="required"');
    expect(markup).toContain('workspace-mobile-nav');
  });
});
