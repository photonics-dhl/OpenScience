/* global document */

import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { chromium } from 'playwright';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(scriptDir, '..');
const sourceRoot = path.join(
  webRoot,
  'assets',
  'hermes',
  'live2d-source',
  'wanko-genie-v1',
);
const lampSourcePath = path.join(sourceRoot, 'approved-lamp-rgba.png');
const brandSourcePath = path.join(sourceRoot, 'approved-brand-v03.svg');

const expectedSources = {
  brandSha256: 'AD7DB88B881FC006D64758345208F847F4511ED42DF0A7AC0BAB3554213A75E1',
  lampSha256: 'C1A49973F11843488A9714FF580CB54F3A96EAB89CEC253650D2BEEBA3EF4BA8',
};

const cubismRegions = [
  'lamp-rear',
  'opening',
  'front-shell',
  'front-rim',
  'spout',
  'handle',
  'brand',
];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

async function countRuntimeReferences() {
  const roots = ['app', 'components', 'lib'].map((name) => path.join(webRoot, name));
  const needles = [
    'live2d-source/wanko-genie-v1',
    'approved-lamp-rgba.png',
    'approved-brand-v03.svg',
    'lamp-atlas.png',
    'brand.png',
  ];
  let count = 0;
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(target);
      } else if (/\.(?:css|js|mjs|ts|tsx)$/u.test(entry.name)) {
        const source = await readFile(target, 'utf8');
        count += needles.reduce(
          (total, needle) => total + (source.includes(needle) ? 1 : 0),
          0,
        );
      }
    }
  };
  for (const root of roots) await visit(root);
  return count;
}

export async function exportHermesLive2DSourceArt(outputRoot) {
  const [lampBytes, brandBytes] = await Promise.all([
    readFile(lampSourcePath),
    readFile(brandSourcePath),
  ]);
  const sources = {
    brandSha256: sha256(brandBytes),
    lampSha256: sha256(lampBytes),
  };
  if (
    sources.lampSha256 !== expectedSources.lampSha256 ||
    sources.brandSha256 !== expectedSources.brandSha256
  ) {
    throw new Error('Approved Cubism source inputs do not match their signed hashes');
  }

  const brandSvg = brandBytes.toString('utf8');
  if (/<image\b|data:image|href\s*=\s*["']https?:/iu.test(brandSvg)) {
    throw new Error('Cubism brand source must remain self-contained vector geometry');
  }

  await mkdir(outputRoot, { recursive: true });
  await copyFile(lampSourcePath, path.join(outputRoot, 'lamp-atlas.png'));

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 2079, height: 756 } });
    await page.setContent(
      `<style>html,body{margin:0;width:2079px;height:756px;overflow:hidden;background:transparent}svg{display:block;width:2079px;height:756px}</style>${brandSvg}`,
    );
    await writeFile(
      path.join(outputRoot, 'brand.png'),
      await page.locator('svg').screenshot({ omitBackground: true }),
    );

    const brand = await page.evaluate(() => {
      const routes = [...document.querySelectorAll('.metadata-route')];
      return {
        blueNodeCount: document.querySelectorAll('.metadata-node').length,
        nodesPerRoute: ['top', 'middle', 'bottom'].map(
          (route) => document.querySelectorAll(`.metadata-node[data-route="${route}"]`).length,
        ),
        openCentreCount: document.querySelectorAll('#SDF_OPEN_CENTRE').length,
        orangeDiffCount: document.querySelectorAll('[data-result="diff"]').length,
        rejoiningRouteCount: routes.filter((route) => route.dataset.rejoins === 'true').length,
        resultRoute:
          routes.find((route) => route.dataset.connectsResult === 'true')?.dataset.route ?? null,
        routeCount: routes.length,
      };
    });

    const metrics = {
      brand,
      composition: {
        canonicalWankoIncludedInSource: false,
        lampToWankoWidthMax: 1.25,
        openCentreCount: 1,
        orangeDiffCount: 1,
        blueNodeCount: 6,
      },
      cubismRegions,
      layers: {
        'brand.png': { height: 756, left: 0, top: 0, width: 2079 },
        'lamp-atlas.png': { height: 756, left: 0, top: 0, width: 2079 },
      },
      palette: {
        energyBlue: '#5bc7ff',
        enamelIndigo: '#132458',
        outlineBrown: '#512b23',
        rimGold: '#e6a24a',
      },
      runtimeReferenceCount: await countRuntimeReferences(),
      sources,
    };
    await writeFile(
      path.join(outputRoot, 'source-art-metrics.json'),
      `${JSON.stringify(metrics, null, 2)}\n`,
    );
    return metrics;
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outputRoot = process.argv[2];
  if (!outputRoot) throw new Error('Usage: export-hermes-live2d-source-art.mjs <output-dir>');
  await exportHermesLive2DSourceArt(path.resolve(outputRoot));
}
