import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';

import { chromium } from 'playwright';

import {
  measureContinuousTitle,
  measureRenderedCurtain,
  measureRenderedField,
} from './central-particle-visual-metrics.mjs';

const [candidateArgument, outlineArgument] = process.argv.slice(2);
assert(candidateArgument, 'candidate PNG path is required');
assert(outlineArgument, 'outline SVG path is required');

const candidate = await readFile(resolve(candidateArgument));
const outline = await readFile(resolve(outlineArgument));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { height: 935, width: 1672 } });
  const masks = await page.evaluate(async ({ candidateUrl, outlineUrl }) => {
    async function load(url) {
      const image = new globalThis.Image();
      image.src = url;
      await image.decode();
      return image;
    }
    function pixels(image) {
      const canvas = globalThis.document.createElement('canvas');
      canvas.width = 1672;
      canvas.height = 935;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return context.getImageData(0, 0, canvas.width, canvas.height).data;
    }
    const [candidateImage, outlineImage] = await Promise.all([load(candidateUrl), load(outlineUrl)]);
    const candidatePixels = pixels(candidateImage);
    const outlinePixels = pixels(outlineImage);
    const candidateMask = new Uint8Array(1672 * 935);
    const idealMask = new Uint8Array(1672 * 935);
    for (let index = 0; index < candidateMask.length; index += 1) {
      const channel = index * 4;
      const luminance = (candidatePixels[channel] + candidatePixels[channel + 1]
        + candidatePixels[channel + 2]) / (3 * 255);
      candidateMask[index] = luminance >= 0.18 ? 1 : 0;
      idealMask[index] = outlinePixels[channel + 3] >= 32 ? 1 : 0;
    }
    return { candidateMask: Array.from(candidateMask), idealMask: Array.from(idealMask) };
  }, {
    candidateUrl: `data:image/png;base64,${candidate.toString('base64')}`,
    outlineUrl: `data:image/svg+xml;base64,${outline.toString('base64')}`,
  });
  const measured = measureContinuousTitle({
    candidateMask: Uint8Array.from(masks.candidateMask),
    height: 935,
    idealMask: Uint8Array.from(masks.idealMask),
    seamMaxX: 1048,
    seamMinX: 868,
    width: 1672,
  });
  const curtain = measureRenderedCurtain({
    centerX: 958.056,
    height: 935,
    mask: Uint8Array.from(masks.candidateMask),
    titleMaxY: 565,
    titleMinY: 320,
    width: 1672,
  });
  const field = measureRenderedField({
    candidateMask: Uint8Array.from(masks.candidateMask),
    centerX: 958.056,
    height: 935,
    idealMask: Uint8Array.from(masks.idealMask),
    titleMaxY: 600,
    titleMinY: 300,
    width: 1672,
  });
  process.stdout.write(`${JSON.stringify({ continuousTitle: measured, curtain, field })}\n`);
  assert(measured.interiorCoverage >= 0.86, `outside-seam glyph interior coverage is too low: ${JSON.stringify(measured)}`);
  assert(measured.interiorHoleRatio <= 0.08, `outside-seam glyph interior holes are too high: ${JSON.stringify(measured)}`);
  assert(measured.occupiedColumnContinuity >= 0.95, `outside-seam occupied columns are discontinuous: ${JSON.stringify(measured)}`);
  assert(curtain.coverage >= 0.72, `vertical curtain coverage is too low: ${JSON.stringify(curtain)}`);
  assert(curtain.spread >= 0.12, `vertical curtain is too narrow: ${JSON.stringify(curtain)}`);
  assert(curtain.mechanicalLineScore < 0.18, `vertical curtain collapsed into a mechanical line: ${JSON.stringify(curtain)}`);
  assert(field.extraPixels >= 180, `central transfer field is missing: ${JSON.stringify(field)}`);
  assert(field.rightwardEnergyRatio >= 1.25, `central transfer field is not right-biased: ${JSON.stringify(field)}`);
} finally {
  await browser.close();
}
