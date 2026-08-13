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
const assetCandidateRouteUrl = new URL('../app/%255Fvisual/optical-lab/page.tsx', import.meta.url);
const assetCandidateRouteModule = existsSync(fileURLToPath(assetCandidateRouteUrl))
  ? await import('../app/%5Fvisual/optical-lab/page')
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
const glyphShaderModuleUrl = new URL('../lib/optical-lab/ogl/shaders/glyph.ts', import.meta.url);
const glyphShaderModule = existsSync(fileURLToPath(glyphShaderModuleUrl))
  ? await import('../lib/optical-lab/ogl/shaders/glyph')
  : null;
const particleShaderModuleUrl = new URL('../lib/optical-lab/ogl/shaders/particle-update.ts', import.meta.url);
const particleShaderModule = existsSync(fileURLToPath(particleShaderModuleUrl))
  ? await import('../lib/optical-lab/ogl/shaders/particle-update')
  : null;
const compositeShaderModuleUrl = new URL('../lib/optical-lab/ogl/shaders/composite.ts', import.meta.url);
const compositeShaderModule = existsSync(fileURLToPath(compositeShaderModuleUrl))
  ? await import('../lib/optical-lab/ogl/shaders/composite')
  : null;
const glyphPassModuleUrl = new URL('../lib/optical-lab/ogl/glyph-pass.ts', import.meta.url);
const glyphPassModule = existsSync(fileURLToPath(glyphPassModuleUrl))
  ? await import('../lib/optical-lab/ogl/glyph-pass')
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

  it('ships the accepted resting artwork as a decorative static fallback', async () => {
    const markup = await renderLab();

    expect(markup).toContain('src="/optical-lab/accepted-resting.png"');
    expect(markup).toContain('alt=""');
    expect(markup).toContain('data-optical-lab-static-fallback="true"');
    expect(markup).toContain('data-optical-lab-semantic-title="true"');
  });

  it('renders the asset query with a lazy interaction host and no server canvas', async () => {
    const renderAssetCandidate = assetCandidateRouteModule?.default as unknown as (props: {
      searchParams: { candidate: string };
    }) => Promise<React.ReactElement>;
    const markup = renderToStaticMarkup(await renderAssetCandidate({
      searchParams: { candidate: 'asset' },
    }));

    const headlineText = markup
      .match(/<h1\b[^>]*>(.*?)<\/h1>/)?.[1]
      .replace(/<[^>]+>/g, '');
    expect(markup).toContain('data-asset-candidate="true"');
    expect(markup).toContain('data-optical-lab-target-typography-plate="true"');
    expect(markup).toContain('data-typography-coupling="reference-plate"');
    expect(markup).toContain('data-render-mode="asset-static"');
    expect(markup).toContain('src="/optical-lab/energy-plate-black-alpha-v1.png"');
    expect(markup).not.toContain('data-optical-lab-client-slot="true"');
    expect(markup).toContain('data-optical-asset-interaction-host="true"');
    expect(markup).not.toContain('<canvas');
    expect(markup.match(/<h1\b/g) ?? []).toHaveLength(1);
    expect(headlineText).toBe('Science evolves.');
    expect(markup.match(/data-optical-lab-panel=/g) ?? []).toHaveLength(1);
    expect(markup).not.toContain('data-optical-lab-panel="target"');
    expect(markup).not.toContain('data-optical-lab-panel="current"');
    expect(markup).not.toContain('/optical-lab/current-production.png');
    expect(markup).toContain('data-optical-lab-asset-only="true"');
    expect(markup.match(/data-optical-lab-exit=/g) ?? []).toHaveLength(1);
  });

  it('reports the asset stage as stable asset-static diagnostics', async () => {
    const renderAssetCandidate = assetCandidateRouteModule?.default as unknown as (props: {
      searchParams: { candidate: string };
    }) => Promise<React.ReactElement>;
    const markup = renderToStaticMarkup(await renderAssetCandidate({
      searchParams: { candidate: 'asset' },
    }));
    const diagnostics = markup.match(/<dl\b[^>]*data-optical-lab-diagnostics="true"[^>]*>(.*?)<\/dl>/)?.[0] ?? '';

    expect(markup).toMatch(/data-asset-candidate="true"[^>]*data-context-status="stable"[^>]*data-render-mode="asset-static"[^>]*data-stable-bounds="stable"/);
    expect(diagnostics).toMatch(/data-context-status="stable"[^>]*data-render-mode="asset-static"[^>]*data-stable-bounds="stable"/);
    expect(diagnostics).toContain('>Asset/static</dd>');
    expect(diagnostics).toContain('>stable</dd>');
  });

  it.each([
    ['other candidate', 'other'],
    ['duplicate candidate', ['asset', 'asset']],
  ] as const)('does not enable the asset stage for %s', async (_label, candidate) => {
    const renderRoute = assetCandidateRouteModule?.default as unknown as (props: {
      searchParams: { candidate: string | string[] };
    }) => Promise<React.ReactElement>;
    const markup = renderToStaticMarkup(await renderRoute({ searchParams: { candidate } }));

    expect(markup).not.toContain('data-asset-candidate="true"');
    expect(markup).toContain('data-render-mode="static-fallback"');
    expect(markup).toContain('data-optical-lab-client-slot="true"');
  });

  it('ships the approved asset plate as a compact RGBA 1672 by 941 PNG', () => {
    const assetPath = fileURLToPath(new URL('../public/optical-lab/energy-plate-black-alpha-v1.png', import.meta.url));

    expect(existsSync(assetPath)).toBe(true);
    if (!existsSync(assetPath)) return;

    const png = readFileSync(assetPath);
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(png.readUInt32BE(16)).toBe(1672);
    expect(png.readUInt32BE(20)).toBe(941);
    expect(png[25]).toBe(6);
    expect(png.byteLength).toBeLessThanOrEqual(2 * 1024 * 1024);
  });

  it('keeps DOM ink until the fallback loads and restores it after image failure', () => {
    const rendererSource = readFileSync(
      fileURLToPath(new URL('../components/optical-lab/OpticalLabRenderer.tsx', import.meta.url)),
      'utf8',
    );
    expect(rendererSource).toMatch(/fallback\?\.addEventListener\('load'/);
    expect(rendererSource).toMatch(/fallback\?\.addEventListener\('error'/);
    expect(rendererSource).toContain("stage.dataset.staticArtwork = 'loaded'");
    expect(rendererSource).toContain("stage.dataset.staticArtwork = 'failed'");
  });

  it('feeds adaptive quality tiers into the OGL renderer', () => {
    const rendererSource = readFileSync(
      fileURLToPath(new URL('../lib/optical-lab/ogl/renderer.ts', import.meta.url)),
      'utf8',
    );
    expect(rendererSource).toContain('sampleOpticalQuality');
    expect(rendererSource).toContain('qualityState.tier');
    expect(rendererSource).toContain('setQualityTier(qualityState.tier)');
    expect(rendererSource).toContain('cpuFrameMs');
    expect(rendererSource).toContain('fps: measuredFps');
    expect(rendererSource).toContain('bloomScale: compositePass?.bloomScale');
    const particleSource = readFileSync(
      fileURLToPath(new URL('../lib/optical-lab/ogl/particle-pass.ts', import.meta.url)),
      'utf8',
    );
    expect(particleSource).toContain('get particleCount()');
    expect(particleSource).toContain('activeParticleCount = Math.floor');
  });

  it('exposes stable renderer diagnostics without forbidden visual primitives', async () => {
    const markup = await renderLab();
    expect(markup).toContain('data-optical-lab-diagnostics="true"');
    expect(markup).toContain('data-render-mode="static-fallback"');
    expect(markup).toContain('data-optical-ink="dom"');
    expect(markup).toContain('data-context-status="idle"');
    expect(markup).toContain('data-stable-bounds="pending"');
    expect(markup).toContain('data-optical-render-phase="task-7-accepted-fallback-v1"');
    expect(markup).not.toContain('optical-cursor-ring');
    expect(markup).not.toContain('radial-boundary');
    expect(markup).not.toContain('vertical-dotted-line');
    expect(markup).not.toContain('spiderweb-fan');
  });

  it('keeps the default visible diagnostics mode at DOM/static', async () => {
    const markup = await renderLab();
    const diagnostics = markup.match(/<dl\b[^>]*data-optical-lab-diagnostics="true"[^>]*>(.*?)<\/dl>/)?.[0] ?? '';

    expect(diagnostics).toContain('data-render-mode="static-fallback"');
    expect(diagnostics).toContain('>DOM/static</dd>');
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

  it('writes straight-alpha RGB to the non-premultiplied drawing buffer', () => {
    const shader = glyphShaderModule?.OPTICAL_GLYPH_COMPOSITE_FRAGMENT_SHADER ?? '';

    expect(shader).toContain('color.rgb / max(color.a');
    expect(shader).toContain('color.a <=');
    expect(shader).not.toContain('fragColor = texture(tColor, vUv)');
    expect(glyphShaderModule?.OPTICAL_GLYPH_FRAGMENT_SHADER).toContain('uWeightOffset');
  });

  it('uses an independent deterministic upstream dissolution lattice', () => {
    const shader = particleShaderModule?.OPTICAL_PARTICLE_UPDATE_FRAGMENT_SHADER ?? '';

    expect(particleShaderModule?.OPTICAL_DISSOLUTION_STRATA).toBe(48);
    expect(shader).toContain('dissolutionRole');
    expect(shader).toContain('floor(randomA * 48.0)');
    expect(shader).toContain('upperBand');
    expect(shader).not.toContain('pointer');
  });

  it('uses one particle-owned lens shell and no duplicate low-resolution ray field', () => {
    const shader = compositeShaderModule?.OPTICAL_HIGH_ENERGY_FRAGMENT_SHADER ?? '';

    expect(shader).toContain('lensShell');
    expect(shader).toContain('abs(abs(deltaX - lensBend) - lensHalfWidth)');
    expect(shader).toContain('particleEvidence');
    expect(shader).toContain('mix(0.08, 1.0, particleEvidence)');
    expect(shader).not.toContain('curvedFilament');
    expect(shader).not.toContain('heroRays');
    expect(shader).not.toContain('outerPlume');
    expect(shader).not.toContain('striationWave');
    expect(shader).not.toContain('pointer');
    expect(compositeShaderModule?.OPTICAL_RESTING_COMPOSITE_FRAGMENT_SHADER).toContain('sourceEvidence');
    expect(compositeShaderModule?.OPTICAL_RESTING_COMPOSITE_FRAGMENT_SHADER).toContain('mix(0.08, 1.0, sourceEvidence)');
  });

  it('reconstructs the approved evolves shear inside the measured ink bounds', () => {
    const source = new Float32Array([0, 0, 0, 100, 0, 0, 0, 50, 0, 100, 50, 0]);
    const transformed = glyphPassModule?.transformTextPositions(
      source,
      { bottom: 240, height: 100, left: 580, right: 900, top: 140, width: 320 },
      -6,
    );
    expect(transformed).toBeDefined();
    const xs = transformed ? [transformed[0], transformed[3], transformed[6], transformed[9]] : [];
    expect(Math.min(...xs)).toBeCloseTo(580, 4);
    expect(Math.max(...xs)).toBeCloseTo(900, 4);
    expect((transformed?.[6] ?? 0) - (transformed?.[0] ?? 0)).toBeGreaterThan(10);
  });

  it('maps evolves landmarks from CSS em tracking and unpadded BMFont ink', () => {
    const font = {
      chars: [
        { char: 'e', height: 54, id: 101, width: 46, x: 0, xadvance: 44, xoffset: -1, y: 0, yoffset: 59 },
        { char: 'v', height: 54, id: 118, width: 50, x: 0, xadvance: 48, xoffset: -3, y: 0, yoffset: 59 },
        { char: 'o', height: 54, id: 111, width: 48, x: 0, xadvance: 46, xoffset: -1, y: 0, yoffset: 59 },
        { char: 'l', height: 81, id: 108, width: 33, x: 0, xadvance: 28, xoffset: -2, y: 0, yoffset: 32 },
        { char: 's', height: 54, id: 115, width: 43, x: 0, xadvance: 39, xoffset: -3, y: 0, yoffset: 59 },
        { char: '.', height: 20, id: 46, width: 20, x: 0, xadvance: 19, xoffset: -3, y: 0, yoffset: 93 },
      ],
      common: { base: 108, lineHeight: 146, scaleH: 512, scaleW: 512 },
      distanceField: { distanceRange: 8, fieldType: 'msdf' },
      info: { padding: [4, 4, 4, 4], size: 96 },
      kernings: [],
    };
    const contract = glyphPassModule?.createBmFontInkMappingContract(font, 'evolves.', -.085);

    expect(contract).toBeDefined();
    expect(contract?.trackingUnits).toBeCloseTo(-8.16, 6);
    expect(contract?.glyphs.at(-1)?.penX).toBeCloseTo(239.88, 6);
    expect(contract?.inkBounds.left).toBeCloseTo(3, 6);
    expect(contract?.inkBounds.right).toBeCloseTo(252.88, 6);
    expect(contract?.quadBounds.left).toBeCloseTo(-1, 6);
    expect(contract?.quadBounds.right).toBeCloseTo(256.88, 6);
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
