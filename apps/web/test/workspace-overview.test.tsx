import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => ({
    title: '研究对象概览',
    connectionPending: '等待研究对象服务连接',
    connectionHint: '工作区入口可访问；连接恢复后会填充实时摘要。',
    openEditor: '打开 SDF 编辑器',
    openCollab: '进入协作区',
    openPublic: '查看公开页',
    identity: '稳定身份',
    version: '当前版本',
    permission: '访问范围',
    readOnly: '只读范围',
  } as Record<string, string>)[key] ?? key,
}));

describe('workspace overview route', () => {
  it('stays navigable when the API is unavailable', async () => {
    const { default: WorkspaceOverview } = await import('../components/workspace/WorkspaceOverview');
    const markup = renderToStaticMarkup(createElement(WorkspaceOverview, { roId: 'OS-RO-01J8YF7Q' }));

    expect(markup).toContain('data-workspace-overview');
    expect(markup).toContain('OS-RO-01J8YF7Q');
    expect(markup).toContain('等待研究对象服务连接');
    expect(markup).toContain('href="/research-objects/OS-RO-01J8YF7Q/edit"');
    expect(markup).toContain('href="/research-objects/OS-RO-01J8YF7Q/collab"');
  });
});
