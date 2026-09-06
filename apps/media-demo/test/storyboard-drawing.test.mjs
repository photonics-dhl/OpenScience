/* global document, window */
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { installStoryboardDrawing } from '../storyboard-drawing.mjs';

test('uses each supplied image, contains edges, blends scenes and renders deterministically', async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    await page.setContent('<canvas width="1280" height="720"></canvas>');
    const artwork = await page.evaluate(() => ['#ff0000', '#0000ff', '#00ff00'].map(color => {
      const c = document.createElement('canvas'); c.width = 1600; c.height = 300;
      const ctx = c.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, 1600, 300);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 20, 300); ctx.fillRect(1580, 0, 20, 300);
      return c.toDataURL();
    }));
    const scenes = artwork.map((_, i) => ({title:`Title ${i}`, start:i*5, duration:5, cues:[]}));
    await page.evaluate(installStoryboardDrawing, {scenes, artwork, total:15, visualStyle:'watercolor', locale:'en'});
    const sample = await page.evaluate(() => {
      const pixel = t => {window.render(t); return [...document.querySelector('canvas').getContext('2d').getImageData(640,350,1,1).data];};
      const red = pixel(3);
      const edge = [...document.querySelector('canvas').getContext('2d').getImageData(78,350,1,1).data];
      return {red, edge, blue:pixel(8), green:pixel(13), transition:pixel(5.3), same:window.render(3) === window.render(3)};
    });
    assert.ok(sample.red[0] > 240 && sample.red[2] < 20);
    assert.ok(sample.blue[2] > 240 && sample.blue[0] < 20);
    assert.ok(sample.green[1] > 240 && sample.green[0] < 20 && sample.green[2] < 20);
    assert.deepEqual(sample.edge, [255,255,255,255]);
    assert.ok(sample.transition[0] > 20 && sample.transition[2] > 20);
    assert.equal(sample.same, true);
    const titles = await page.evaluate(() => {
      const context = document.querySelector('canvas').getContext('2d');
      const original = context.fillText.bind(context); const rendered = [];
      context.fillText = (text,...args) => {rendered.push(text); original(text,...args);};
      window.render(5.3);
      return rendered.filter(text => text.startsWith('Title'));
    });
    assert.deepEqual(titles,['Title 1']);
  } finally { await browser.close(); }
});
