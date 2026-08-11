import * as React from 'react';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { OpticalLabTypographySpecimen } from '../components/optical-lab/OpticalLabTypographySpecimen';
import { measureTypography } from './visual/optical-lab-reference-metrics.mjs';

vi.mock('next-intl/server', () => ({
  getLocale: async () => 'en',
  getTranslations: async () => (key: string) => key,
}));

vi.mock('next/font/google', () => ({
  Archivo: () => ({ className: 'archivo-font' }),
}));

const pageUrl = new URL('../app/_visual/optical-lab/page.tsx', import.meta.url);
const pageModule = existsSync(fileURLToPath(pageUrl))
  ? await import('../app/_visual/optical-lab/page')
  : null;
const typeSpecimenPageUrl = new URL('../app/_visual/optical-lab/type-specimen/page.tsx', import.meta.url);
const typeSpecimenPageModule = existsSync(fileURLToPath(typeSpecimenPageUrl))
  ? await import('../app/_visual/optical-lab/type-specimen/page')
  : null;
const resourceModuleUrl = new URL('../lib/optical-lab/ogl/resources.ts', import.meta.url);
const resourceModule = existsSync(fileURLToPath(resourceModuleUrl))
  ? await import('../lib/optical-lab/ogl/resources')
  : null;
const lifecycleModuleUrl = new URL('../lib/optical-lab/ogl/lifecycle.ts', import.meta.url);
const lifecycleModule = existsSync(fileURLToPath(lifecycleModuleUrl))
  ? await import('../lib/optical-lab/ogl/lifecycle')
  : null;

describe('isolated Optical Lab route contract', () => {
  beforeAll(() => {
    vi.stubGlobal('React', React);
  });

  async function renderLab() {
    if (!pageModule) return '';
    return renderToStaticMarkup(await pageModule.default());
  }

  it('renders target, current production and candidate as three explicit comparison panels', async () => {
    const markup = await renderLab();
    expect(markup.match(/data-optical-lab-panel=/g) ?? []).toHaveLength(3);
    expect(markup).toContain('data-optical-lab-panel="target"');
    expect(markup).toContain('data-optical-lab-panel="current"');
    expect(markup).toContain('data-optical-lab-panel="candidate"');
    expect(markup).toContain('/optical-lab/target-reference.png');
    expect(markup).toContain('/optical-lab/current-production.png');
  });

  it('keeps one selectable semantic headline in SSR while the GPU mount remains client-only', async () => {
    const markup = await renderLab();
    const headlineText = markup
      .match(/<h1\b[^>]*>(.*?)<\/h1>/)?.[1]
      .replace(/<[^>]+>/g, '');
    expect(markup.match(/<h1\b/g) ?? []).toHaveLength(1);
    expect(markup).toContain('data-optical-lab-semantic-title="true"');
    expect(headlineText).toBe('Science evolves.');
    expect(markup).toContain('data-optical-lab-client-slot="true"');
    expect(markup).not.toContain('<canvas');
  });

  it('exposes stable renderer diagnostics without forbidden visual primitives', async () => {
    const markup = await renderLab();
    expect(markup).toContain('data-optical-lab-diagnostics="true"');
    expect(markup).toContain('data-render-mode="static-fallback"');
    expect(markup).toContain('data-optical-ink="dom"');
    expect(markup).toContain('data-context-status="idle"');
    expect(markup).toContain('data-stable-bounds="pending"');
    expect(markup).toContain('data-optical-render-phase="task-4-msdf-glyph-v1"');
    expect(markup).not.toContain('optical-cursor-ring');
    expect(markup).not.toContain('radial-boundary');
    expect(markup).not.toContain('vertical-dotted-line');
    expect(markup).not.toContain('spiderweb-fan');
  });

  it('does not leak the experimental renderer into the production homepage graph', () => {
    const productionFiles = [
      '../app/page.tsx',
      '../components/landing/Hero.tsx',
      '../components/brand/OpticalHeadline.tsx',
      '../components/brand/OpticalField.tsx',
    ];
    for (const relativePath of productionFiles) {
      const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
      expect(source).not.toContain('optical-lab');
      expect(source).not.toContain('OpticalLab');
    }
  });

  it('deletes every OGL-owned GL handle exactly once across overlapping registrations', () => {
    const handles = Object.fromEntries([
      'buffer', 'depth', 'fragmentShader', 'framebuffer', 'program', 'renderbuffer',
      'texture', 'vertexArray', 'vertexShader',
    ].map((name) => [name, { name }])) as Record<string, object>;
    const gl = {
      deleteBuffer: vi.fn(),
      deleteFramebuffer: vi.fn(),
      deleteProgram: vi.fn(),
      deleteRenderbuffer: vi.fn(),
      deleteShader: vi.fn(),
      deleteTexture: vi.fn(),
      deleteVertexArray: vi.fn(),
      detachShader: vi.fn(),
    } as unknown as WebGL2RenderingContext;
    const ledger = resourceModule?.createOpticalOglResourceLedger(gl);
    expect(ledger).toBeDefined();
    if (!ledger) return;

    ledger.trackProgram({
      fragmentShader: handles.fragmentShader,
      program: handles.program,
      vertexShader: handles.vertexShader,
    });
    ledger.trackGeometry({
      VAOs: { main: handles.vertexArray },
      attributes: {
        index: { buffer: handles.buffer },
        position: { buffer: handles.buffer },
      },
    });
    const sharedTexture = { texture: handles.texture };
    ledger.trackTexture(sharedTexture);
    ledger.trackRenderTarget({
      buffer: handles.framebuffer,
      depthBuffer: handles.depth,
      depthStencilBuffer: null,
      depthTexture: sharedTexture,
      stencilBuffer: handles.renderbuffer,
      textures: [sharedTexture],
    });

    expect(ledger.counts()).toEqual({
      buffers: 1,
      framebuffers: 1,
      programs: 1,
      renderbuffers: 2,
      shaders: 2,
      textures: 1,
      vertexArrays: 1,
    });
    ledger.dispose();
    ledger.dispose();

    expect(gl.deleteBuffer).toHaveBeenCalledTimes(1);
    expect(gl.deleteFramebuffer).toHaveBeenCalledTimes(1);
    expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
    expect(gl.deleteRenderbuffer).toHaveBeenCalledTimes(2);
    expect(gl.deleteShader).toHaveBeenCalledTimes(2);
    expect(gl.deleteTexture).toHaveBeenCalledTimes(1);
    expect(gl.deleteVertexArray).toHaveBeenCalledTimes(1);
    expect(ledger.counts()).toEqual({
      buffers: 0,
      framebuffers: 0,
      programs: 0,
      renderbuffers: 0,
      shaders: 0,
      textures: 0,
      vertexArrays: 0,
    });
  });

  it('detaches only the shaders owned by each OGL program', () => {
    const gl = {
      deleteBuffer: vi.fn(),
      deleteFramebuffer: vi.fn(),
      deleteProgram: vi.fn(),
      deleteRenderbuffer: vi.fn(),
      deleteShader: vi.fn(),
      deleteTexture: vi.fn(),
      deleteVertexArray: vi.fn(),
      detachShader: vi.fn(),
    } as unknown as WebGL2RenderingContext;
    const ledger = resourceModule?.createOpticalOglResourceLedger(gl);
    expect(ledger).toBeDefined();
    if (!ledger) return;
    const first = { program: { name: 'first' }, vertexShader: { name: 'first-v' }, fragmentShader: { name: 'first-f' } };
    const second = { program: { name: 'second' }, vertexShader: { name: 'second-v' }, fragmentShader: { name: 'second-f' } };
    ledger.trackProgram(first);
    ledger.trackProgram(second);

    ledger.dispose();

    expect(gl.detachShader).toHaveBeenCalledTimes(4);
    expect(gl.detachShader).toHaveBeenCalledWith(first.program, first.vertexShader);
    expect(gl.detachShader).toHaveBeenCalledWith(first.program, first.fragmentShader);
    expect(gl.detachShader).toHaveBeenCalledWith(second.program, second.vertexShader);
    expect(gl.detachShader).toHaveBeenCalledWith(second.program, second.fragmentShader);
  });

  it('fully releases asynchronous unavailable ownership before later policy cleanup', async () => {
    const events: string[] = [];
    const ownership = lifecycleModule?.createOpticalRendererOwnership();
    expect(ownership).toBeDefined();
    if (!ownership) return;
    const canvas = { remove: vi.fn(() => events.push('canvas')) };
    const renderer = {
      dispose: vi.fn(() => {
        events.push('renderer');
        ownership.teardown();
      }),
      resize: vi.fn(),
    };
    const removeListeners = vi.fn(() => events.push('listeners'));
    ownership.attach(canvas, renderer, removeListeners);

    await Promise.resolve().then(() => {
      ownership.teardownForUnavailable(() => events.push('published-static'));
    });

    expect(events).toEqual(['renderer', 'listeners', 'canvas', 'published-static']);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(removeListeners).toHaveBeenCalledTimes(1);
    expect(canvas.remove).toHaveBeenCalledTimes(1);
    expect(ownership.current()).toEqual({ canvas: null, renderer: null });

    ownership.teardown();
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(removeListeners).toHaveBeenCalledTimes(1);
    expect(canvas.remove).toHaveBeenCalledTimes(1);
  });
});

describe('Optical Lab typography specimen contract', () => {
  beforeAll(() => {
    vi.stubGlobal('React', React);
  });

  it.each([
    ['bricolage', 'true'],
    ['archivo', 'true'],
    ['arial-black-reference', 'false'],
  ] as const)('renders %s as one selectable semantic title', (candidate, shippingEligible) => {
    const markup = renderToStaticMarkup(<OpticalLabTypographySpecimen candidate={candidate} />);

    expect(markup.match(/<h1\b/g) ?? []).toHaveLength(1);
    expect(markup).toContain('data-optical-selectable="true"');
    expect(markup).toContain('data-optical-specimen="true"');
    expect(markup).toContain(`data-shipping-eligible="${shippingEligible}"`);
    expect(markup).toContain('data-optical-aperture="0.58"');
    expect(markup).toContain('data-optical-science="true"');
    expect(markup).toContain('data-optical-evolves="true"');
    expect(markup).toContain('data-optical-baseline="true"');
    const titleText = markup.match(/<h1\b[^>]*>(.*?)<\/h1>/)?.[1].replace(/<[^>]+>/g, '');
    expect(titleText).toBe('Science evolves.');
  });

  it('defaults the specimen route to the approved Archivo shipping candidate', () => {
    expect(typeSpecimenPageModule).not.toBeNull();
    const markup = renderToStaticMarkup(typeSpecimenPageModule!.default({}));

    expect(markup).toContain('data-optical-specimen-candidate="archivo"');
    expect(markup).toContain('data-shipping-eligible="true"');
  });

  it('measures the approved native typography fixture as one line at the fixed aperture', () => {
    const measured = measureTypography({
      viewport: { width: 1672, height: 941 },
      title: { left: 36.8, right: 1600.0, top: 337.0, bottom: 564.6 },
      science: { left: 36.8, right: 969.8 },
      evolves: { left: 969.8, right: 1600.0 },
      baselineY: 510.0,
    });

    expect(measured.oneLine).toBe(true);
    expect(Math.abs(measured.apertureX - .58)).toBeLessThanOrEqual(.005);
    expect(measured.title.left).toBeGreaterThanOrEqual(.017);
    expect(measured.title.left).toBeLessThanOrEqual(.027);
    expect(measured.title.right).toBeGreaterThanOrEqual(.952);
    expect(measured.title.right).toBeLessThanOrEqual(.962);
    expect(measured.title.top).toBeGreaterThanOrEqual(.348);
    expect(measured.title.top).toBeLessThanOrEqual(.368);
    expect(measured.title.bottom).toBeGreaterThanOrEqual(.59);
    expect(measured.title.bottom).toBeLessThanOrEqual(.61);
  });
});
