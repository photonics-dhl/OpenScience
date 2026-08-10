import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { PRODUCT_SURFACES, researchSurfaceHref } from '../lib/product-surfaces';

const requiredStates = ['loading', 'empty', 'error', 'forbidden', 'ready'] as const;
const requiredSurfaces = ['overview', 'sdf', 'files', 'versions', 'collaboration', 'publish', 'sandbox', 'settings'] as const;

describe('Optical Editorial product surface matrix', () => {
  it('declares every canonical product surface and its resilient states', () => {
    expect(PRODUCT_SURFACES.map((surface) => surface.id)).toEqual(requiredSurfaces);
    for (const surface of PRODUCT_SURFACES) {
      expect(surface.states).toEqual(expect.arrayContaining(requiredStates));
      expect(surface.mobileParity).toBe(true);
      expect(surface.permission).toMatch(/^(member|authenticated)$/);
    }
  });

  it('maps Research Object surfaces to real App Router pages', () => {
    const appRoot = path.join(__dirname, '../app');
    for (const surface of PRODUCT_SURFACES.filter((item) => item.scope === 'research-object')) {
      const route = researchSurfaceHref(surface.id, '[id]');
      const relative = route.replace('/research-objects/[id]/', 'research-objects/[id]/');
      expect(existsSync(path.join(appRoot, relative, 'page.tsx')), `${surface.id} needs a real route`).toBe(true);
    }
    expect(existsSync(path.join(appRoot, 'settings/page.tsx'))).toBe(true);
  });

  it('does not expose disabled workspace modes and protects publish with review confirmation', () => {
    const editorLayout = readFileSync(path.join(__dirname, '../components/editor/EditorLayout.tsx'), 'utf8');
    const publishPage = readFileSync(path.join(__dirname, '../app/research-objects/[id]/publish/page.tsx'), 'utf8');
    const apiClient = readFileSync(path.join(__dirname, '../lib/api.ts'), 'utf8');
    expect(editorLayout).not.toContain('aria-disabled="true"');
    expect(editorLayout).toContain('ResearchWorkspaceNav');
    expect(publishPage).toContain('data-review-changes="true"');
    expect(apiClient).toContain('r3Confirmed: true');
  });
});
