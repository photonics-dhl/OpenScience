/* global document, window */
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { installDrawing } from '../drawing.mjs';

test('third-scene artwork is contained and cannot leak into training, detector classification, or their transitions', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<canvas width="1280" height="720"></canvas>');
    const [artworkData, scene3ArtworkData] = await page.evaluate(() => ['#ff0000', '#0000ff'].map(color => {
      const canvas = document.createElement('canvas'); canvas.width = 100; canvas.height = 100;
      const context = canvas.getContext('2d'); context.fillStyle = color; context.fillRect(0, 0, 100, 100);
      return canvas.toDataURL();
    }));
    const starts = [0, 7, 11, 20.56, 31.81, 40];
    const scenes = starts.slice(0, 5).map((start, i) => ({start, duration: starts[i + 1] - start, title: '', sub: '', caption: ''}));
    for (const visualStyle of ['technical', 'watercolor']) {
      const options = { scenes, total: 40, artworkData, visualStyle };
      const times = [2, 8, 10.99, 11, 20.56, 20.57, 20.9, 25, 31.81, 32.2, 35];
      await page.evaluate(installDrawing, options);
      const baseline = await page.evaluate(times => times.map(t => window.render(t)), times);
      await page.evaluate(installDrawing, { ...options, scene3ArtworkData });
      assert.deepEqual(await page.evaluate(times => times.map(t => window.render(t)), times), baseline);
      const pixels = await page.evaluate(() => {
        window.render(15);
        const context = document.querySelector('canvas').getContext('2d');
        return [640, 300, 980].map(x => [...context.getImageData(x, 390, 1, 1).data]);
      });
      assert.ok(pixels[0][2] > 240 && pixels[0][0] < 20, 'center shows replacement artwork');
      assert.ok(pixels[1][0] > 200 && pixels[2][0] > 200, 'square artwork is contained, not stretched');
    }
  } finally { await browser.close(); }
});
