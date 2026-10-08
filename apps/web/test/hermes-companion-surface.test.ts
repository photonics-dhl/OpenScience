import { describe, expect, it } from 'vitest';

import {
  resolveHermesCompanionSurface,
  currentHermesPresentation,
  hermesPresentationCanDock,
  currentHermesAnchorRect,
} from '../lib/hermes/companion-surface';

describe('global Hermes product routes', () => {
  it.each([
    '/guide', '/guide/', '/explore', '/research/OSR-2026-000023',
    '/research/OSR-2026-000023/v/1', '/collections/optics',
    '/auth/login', '/auth/register', '/me', '/settings', '/developers', '/trash',
    '/journals', '/journals/example', '/journals/apply', '/journals/apply/application',
    '/journals/join', '/journals/manage', '/journals/manage/journal/services',
    '/journals/manage/journal/articles/article/sources', '/admin/journals', '/editorial/curator',
  ])('keeps a navigation companion on %s without private research context', (pathname) => {
    expect(resolveHermesCompanionSurface(pathname)).toBe('navigation');
  });

  it.each([
    '/dashboard', '/research-objects/new', '/research-objects/object/edit',
    '/research-objects/object/overview', '/research-objects/object/hermes',
    '/research-objects/object/files', '/research-objects/object/presentation',
    '/research-objects/object/publish', '/research-objects/object/versions',
    '/research-objects/object/collab', '/research-objects/object/sandbox',
  ])('includes the existing work surface %s', (pathname) => {
    expect(resolveHermesCompanionSurface(pathname)).toBe('workspace');
  });

  it.each([
    '/', '/_visual/hermes-live2d', '/%5Fvisual/hermes-live2d', '/%5fvisual/research-workbench',
    '/visual-public-reading', '/visual-public-reading/example', '/api/research', '/_next/data',
    '/dashboard-preview', '/research-objects-old/object/edit', '/unknown',
  ])('leaves the harness or non-product path %s without a global owner', (pathname) => {
    expect(resolveHermesCompanionSurface(pathname)).toBeNull();
  });
});

describe('Hermes presentation ownership', () => {
  const onInvoke = () => {};
  const owner = { pathname: '/research-objects/first/edit', state: 'scanning', onInvoke };

  it('retains the registered private action and task state on its own route', () => {
    expect(currentHermesPresentation(owner, owner.pathname)).toBe(owner);
  });

  it('drops an old private action before the next route effects run', () => {
    expect(currentHermesPresentation(owner, '/research-objects/second/edit')).toBeNull();
    expect(currentHermesPresentation(owner, '/explore')).toBeNull();
    expect(currentHermesPresentation(null, '/guide')).toBeNull();
  });

  it('lets a page register actions without taking over floating model placement', () => {
    expect(hermesPresentationCanDock({ floating: true })).toBe(false);
    expect(hermesPresentationCanDock({ floating: false })).toBe(true);
    expect(hermesPresentationCanDock({})).toBe(true);
    expect(hermesPresentationCanDock(null)).toBe(false);
  });

  it('does not place a new route in the outgoing page anchor before its effects run', () => {
    const anchor = {};
    const rect = { width: 360, height: 400, left: 900, top: 160 };
    const measured = { pathname: '/dashboard', anchor, rect };
    expect(currentHermesAnchorRect(measured, '/dashboard', anchor)).toBe(rect);
    expect(currentHermesAnchorRect(measured, '/guide', anchor)).toBeNull();
    expect(currentHermesAnchorRect(measured, '/guide', null)).toBeNull();
    expect(currentHermesAnchorRect(measured, '/dashboard', {})).toBeNull();
    expect(currentHermesAnchorRect(null, '/dashboard', anchor)).toBeNull();
  });
});
