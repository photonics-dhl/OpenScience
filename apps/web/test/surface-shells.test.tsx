import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { OpenScienceWordmark } from '../components/brand/OpenScienceWordmark';
import { DashboardShell } from '../components/shell/DashboardShell';
import { IdentityShell } from '../components/shell/IdentityShell';
import { PublicShell } from '../components/shell/PublicShell';
import { WorkspaceShell } from '../components/shell/WorkspaceShell';

const shellDirectory = path.join(__dirname, '../components/shell');

describe('Optical Editorial brand and surface shells', () => {
  it('renders the frozen wordmark with one vermilion full stop', () => {
    const full = renderToStaticMarkup(createElement(OpenScienceWordmark, { tone: 'dark' }));
    const compact = renderToStaticMarkup(createElement(OpenScienceWordmark, { compact: true, tone: 'paper' }));

    expect(full).toContain('OpenScience');
    expect(full).toContain('data-wordmark-stop="true"');
    expect(full.match(/data-wordmark-stop=/g)).toHaveLength(1);
    expect(compact).toContain('>O<');
    expect(full).not.toContain('<img');
  });

  it.each([
    ['public', PublicShell, { tone: 'paper' }],
    ['identity', IdentityShell, {}],
    ['dashboard', DashboardShell, {}],
    ['workspace', WorkspaceShell, { leftRail: createElement('aside', null, 'Outline'), rightRail: createElement('aside', null, 'Evidence') }],
  ] as const)('%s shell has one skip target and one main landmark', (surface, Shell, extraProps) => {
    const markup = renderToStaticMarkup(createElement(
      Shell,
      { skipLabel: 'Skip to research content', ...extraProps },
      createElement('h1', null, 'Research content'),
    ));

    expect(markup).toContain(`data-os-surface="${surface}"`);
    expect(markup).toContain('href="#main-content"');
    expect(markup.match(/<main\b/g)).toHaveLength(1);
    expect(markup).toContain('id="main-content"');
  });

  it('uses stable workspace planes and rule-based chrome without Card dependencies', () => {
    const workspace = renderToStaticMarkup(createElement(
      WorkspaceShell,
      {
        skipLabel: 'Skip',
        leftRail: createElement('aside', null, '19'),
        rightRail: createElement('aside', null, '25'),
      },
      createElement('div', null, '56'),
    ));

    expect(workspace).toContain('data-workspace-plane="19"');
    expect(workspace).toContain('data-workspace-plane="56"');
    expect(workspace).toContain('data-workspace-plane="25"');

    for (const file of ['DashboardShell.tsx', 'IdentityShell.tsx', 'PublicShell.tsx', 'WorkspaceShell.tsx']) {
      const source = readFileSync(path.join(shellDirectory, file), 'utf8');
      expect(source).not.toMatch(/(?:from|require\()['"](?:\.\.\/)?ui\/card/i);
      expect(source).not.toContain('backdrop-blur');
    }
  });

  it('normalizes shell navigation actions to an 8px radius with press feedback', () => {
    const primitives = readFileSync(path.join(shellDirectory, 'ShellPrimitives.tsx'), 'utf8');
    expect(primitives).toContain('[&_a]:rounded-panel');
    expect(primitives).toContain('[&_button]:rounded-panel');
    expect(primitives).toContain('active:translate-y-px');
    expect(primitives).toContain('motion-reduce:[&_a]:transform-none');
  });

  it('marks primary shell navigation as protected from the Hermes travel footprint', () => {
    const dashboard = renderToStaticMarkup(createElement(
      DashboardShell,
      {
        headerActions: createElement('button', { type: 'button' }, 'Language'),
        navigationLabel: 'Primary navigation',
        skipLabel: 'Skip',
      },
      createElement('h1', null, 'Research content'),
    ));

    expect(dashboard).toMatch(/<nav\b[^>]*data-hermes-primary-navigation="true"[^>]*data-hermes-protected="true"/u);
  });

  it('keeps shell accessibility copy symmetric across locales', () => {
    const en = JSON.parse(readFileSync(path.join(__dirname, '../messages/en.json'), 'utf8'));
    const zh = JSON.parse(readFileSync(path.join(__dirname, '../messages/zh.json'), 'utf8'));

    expect(en.shell).toMatchObject({ skipToContent: expect.any(String), primaryNavigation: expect.any(String) });
    expect(zh.shell).toMatchObject({ skipToContent: expect.any(String), primaryNavigation: expect.any(String) });
    expect(Object.keys(en.shell).sort()).toEqual(Object.keys(zh.shell).sort());
  });

  it('replaces the legacy cyan waveform favicon with the O. mark', () => {
    const favicon = readFileSync(path.join(__dirname, '../public/favicon.svg'), 'utf8');
    expect(favicon).toContain('data-mark="open-science-o"');
    expect(favicon.toLowerCase()).not.toContain('#4dd0e1');
    expect(favicon.toLowerCase()).toContain('#ff4e22');
  });
});
