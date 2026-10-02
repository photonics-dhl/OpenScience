import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({ pathname: '/guide', push: vi.fn() }));
const handlers = vi.hoisted(() => ({ items: new Map<string, () => void>() }));
vi.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (key: string) => key }));
vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: navigation.push }),
}));
vi.mock('../components/ui/context-menu', () => {
  const PassThrough = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  return {
    ContextMenu: PassThrough, ContextMenuTrigger: PassThrough, ContextMenuContent: PassThrough,
    ContextMenuGroup: PassThrough, ContextMenuLabel: PassThrough, ContextMenuSeparator: () => null,
    ContextMenuItem: (props: { children: React.ReactNode; onSelect: () => void; 'data-hermes-navigation'?: string; 'data-hermes-action-key'?: string }) => {
      const key = props['data-hermes-navigation'] ?? props['data-hermes-action-key'];
      if (key) handlers.items.set(key, props.onSelect);
      return <button data-action={key}>{props.children}</button>;
    },
  };
});

import { HermesWorkspaceStageProvider } from '../components/hermes/HermesWorkspaceStage';
import { HermesVisualAdapter } from '../components/hermes/HermesVisualAdapter';
import { HermesDockAnchor } from '../components/hermes/HermesDockAnchor';
import { HermesAssistantDrawer } from '../components/hermes/HermesAssistantDrawer';
import { ResearchIdentityPanel } from '../components/auth/ResearchIdentityPanel';
import { ResearchGuide } from '../components/guide/ResearchGuide';

const suggestion = { bodyKey: 'guide.neutral.body', kind: 'neutral' as const, titleKey: 'guide.neutral.title' };

beforeEach(() => { navigation.push.mockClear(); handlers.items.clear(); });

describe('global companion SSR ownership', () => {
  it.each(['return', 'create'] as const)('keeps the %s identity invitation with only the floating companion', (intent) => {
    navigation.pathname = intent === 'return' ? '/auth/login' : '/auth/register';
    const markup = renderToStaticMarkup(<HermesWorkspaceStageProvider>
      <ResearchIdentityPanel intent={intent} eyebrow="Your research companion" title="Your next discovery starts here."
        description="Read papers and explore your ideas with Hermes." tagline="Papers · Ideas · Discoveries" />
    </HermesWorkspaceStageProvider>);
    expect(markup).toContain('Your next discovery starts here.');
    expect(markup.match(/data-live2d-instance="wanko"/g)).toHaveLength(1);
    expect(markup.match(/<img\b[^>]*src="[^"]*\/hermes\/wanko-static[^"]*"/g)).toHaveLength(1);
  });

  it('keeps the actual guide invitation with only the floating companion', () => {
    navigation.pathname = '/guide';
    const markup = renderToStaticMarkup(<HermesWorkspaceStageProvider><ResearchGuide /></HermesWorkspaceStageProvider>);
    expect(markup).toContain('href="/dashboard"');
    expect(markup).toContain('role="tablist"');
    expect(markup.match(/data-live2d-instance="wanko"/g)).toHaveLength(1);
    expect(markup.match(/<img\b[^>]*src="[^"]*\/hermes\/wanko-static[^"]*"/g)).toHaveLength(1);
  });

  it('opens the actual conversation without adding a second companion portrait', () => {
    navigation.pathname = '/research-objects/object/edit';
    const markup = renderToStaticMarkup(<HermesWorkspaceStageProvider>
      <HermesAssistantDrawer docked open onOpenChange={() => {}} locale="en" suggestion={suggestion}
        route="research-object-edit" routeResearchObjectId="object" dashboardContext={{ tasks: [], researchObjects: [] }} />
    </HermesWorkspaceStageProvider>);
    expect(markup).toContain('id="hermes-guide-goal"');
    expect(markup).toContain('<h2>Hermes</h2>');
    expect(markup.match(/data-live2d-instance="wanko"/g)).toHaveLength(1);
    expect(markup.match(/<img\b[^>]*src="[^"]*\/hermes\/wanko-static[^"]*"/g)).toHaveLength(1);
  });

  it.each(['/', '/guide', '/explore', '/auth/login', '/me', '/journals/example', '/dashboard', '/research-objects/object/edit'])('renders exactly one Wanko on %s', (pathname) => {
    navigation.pathname = pathname;
    const markup = renderToStaticMarkup(<HermesWorkspaceStageProvider><main>Research content</main></HermesWorkspaceStageProvider>);
    expect(markup.match(/data-hermes-workspace-stage="true"/g)).toHaveLength(1);
    expect(markup.match(/data-live2d-instance="wanko"/g)).toHaveLength(1);
    expect(markup).toContain('Research content');
    expect(markup).not.toContain('hermes-guide-goal');
    expect(markup).not.toContain('Current research object');
    expect(markup).not.toContain('data-hermes-presence-control');
    expect(markup).toContain('data-hermes-size-mode="automatic"');
    expect(markup).toContain('data-hermes-stage-size="360"');
  });

  it.each(['/_visual/hermes-live2d', '/%5Fvisual/research-workbench', '/visual-public-reading'])('leaves %s to its own harness', (pathname) => {
    navigation.pathname = pathname;
    const markup = renderToStaticMarkup(<HermesWorkspaceStageProvider><main>Harness</main></HermesWorkspaceStageProvider>);
    expect(markup).not.toContain('data-hermes-workspace-stage');
    expect(markup).not.toContain('data-live2d-instance');
  });

  it('registers floating actions without adding an inline image or a dock slot', () => {
    const markup = renderToStaticMarkup(<HermesDockAnchor floating onInvoke={() => {}} state="idle" suggestion={suggestion} />);
    expect(markup).toContain('data-hermes-floating-owner="true"');
    expect(markup).toContain('hidden');
    expect(markup).not.toContain('hermes-dock-anchor"');
    expect(markup).not.toContain('<img');
    expect(markup).not.toContain('data-live2d-instance');
  });

  it('keeps existing production DockAnchors floating by default and leaves explicit docking available', () => {
    const props = { onInvoke: () => {}, state: 'idle' as const, suggestion };
    const floating = renderToStaticMarkup(<HermesDockAnchor {...props} />);
    const docked = renderToStaticMarkup(<HermesDockAnchor {...props} floating={false} />);
    expect(floating).toContain('data-hermes-floating-owner="true"');
    expect(docked).toContain('class="hermes-dock-anchor"');
    expect(docked).not.toContain('hidden');
  });

  it('retains the editor conversation as the owner while it is closed', () => {
    const markup = renderToStaticMarkup(<HermesAssistantDrawer
      docked open={false} onOpenChange={() => {}} locale="en" suggestion={suggestion}
      route="research-object-edit" routeResearchObjectId="object"
      dashboardContext={{ tasks: [], researchObjects: [] }}
    />);
    expect(markup).toContain('data-hermes-floating-owner="editor"');
    expect(markup).not.toContain('data-live2d-instance');
  });
});

describe('public pet navigation', () => {
  it('offers existing companion gestures and real product navigation without research-specific actions', () => {
    const onMenuAction = vi.fn();
    const markup = renderToStaticMarkup(<HermesVisualAdapter
      navigationOnly onInvoke={() => {}} onMenuAction={onMenuAction} state="idle"
      suggestion={suggestion} protectedGeometryVersion={0} reducedMotion
    />);
    for (const key of ['greet', 'encourage', 'think', 'listen', 'stretch', 'rest', 'celebrate', 'read-together']) {
      expect(handlers.items.has(key)).toBe(true);
    }
    for (const key of ['continue', 'evidence', 'sources', 'compare']) expect(handlers.items.has(key)).toBe(false);
    expect(markup).toContain('aria-label="dashboard"');
    expect(markup).toContain('data-hermes-pet-menu-button="true"');
    expect(markup).toContain('aria-haspopup="menu"');
    handlers.items.get('dashboard')!();
    handlers.items.get('guide')!();
    expect(navigation.push.mock.calls).toEqual([['/dashboard'], ['/guide']]);
    expect(onMenuAction).not.toHaveBeenCalled();
  });

  it('keeps the private research menu scoped to its original suggestion', () => {
    renderToStaticMarkup(<HermesVisualAdapter onInvoke={() => {}} state="scanning"
      suggestion={{ ...suggestion, researchObjectId: 'object', taskId: 'task', href: '/research-objects/object/hermes?task=task' }}
      protectedGeometryVersion={0} reducedMotion />);
    for (const key of ['continue', 'evidence', 'sources', 'compare']) expect(handlers.items.has(key)).toBe(true);
    expect(handlers.items.has('dashboard')).toBe(false);
  });
});
