/* global document, window */
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { installOnchipDrawing } from '../onchip-drawing.mjs';

test('on-chip profile changes the mechanism, electron motion and delay sweep rather than panning a static illustration', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<canvas width="1280" height="720"></canvas>');
    const scenes = Array.from({ length: 5 }, (_, index) => ({ start: index * 8, duration: 8, title: `Scene ${index + 1}`, cues: [] }));
    await page.evaluate(installOnchipDrawing, { scenes, total: 40, locale: 'en', artwork: [] });
    const changes = await page.evaluate(() => {
      const g = document.querySelector('canvas').getContext('2d');
      const sample = time => { window.render(time); return g.getImageData(64, 180, 1152, 380).data; };
      const diff = (a, b) => { let pixels = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 35) pixels++; return pixels; };
      return [diff(sample(1), sample(2)), diff(sample(10), sample(11)), diff(sample(17), sample(17.7)), diff(sample(25), sample(28)), diff(sample(2), sample(18)), diff(sample(18), sample(27))];
    });
    assert.ok(changes.every(value => value > 800), `insufficient mechanism motion: ${changes}`);
    const final = await page.evaluate(() => window.render(39));
    assert.ok(final.startsWith('iVBOR'));
    const artwork = await page.evaluate(() => [25, 65, 105, 145, 185].map(red => {
      const tile = document.createElement('canvas'); tile.width = 230; tile.height = 140;
      const g = tile.getContext('2d'); g.fillStyle = `rgb(${red}, 20, 200)`; g.fillRect(0, 0, 230, 140);
      return tile.toDataURL('image/png');
    }));
    await page.evaluate(installOnchipDrawing, {scenes, total: 40, artwork});
    const visible = await page.evaluate(() => Array.from({length: 5}, (_, i) => {
      window.render(i * 8 + 2);
      return document.querySelector('canvas').getContext('2d').getImageData(1080, 295, 1, 1).data[0];
    }));
    assert.deepEqual(visible, [25, 65, 105, 145, 185], 'each approved scene image must actually enter its frame');
  } finally { await browser.close(); }
});
