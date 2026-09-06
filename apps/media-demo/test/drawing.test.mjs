/* global document, window */
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { installDrawing } from '../drawing.mjs';

test('scientific animation keeps distinct training, wave propagation and detector scenes with real stage motion', async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage(); await page.setContent('<canvas width="1280" height="720"></canvas>');
    const artworkData = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 100; c.height = 50;
      const g = c.getContext('2d'); g.fillStyle = '#808080'; g.fillRect(0,0,100,50); return c.toDataURL();
    });
    const starts = [0,6.45,11,20.56,31.81,41.28];
    const scenes = starts.slice(0,5).map((start,i)=>({start,duration:starts[i+1]-start,title:'',sub:'',caption:''}));
    for (const scene3ArtworkData of [undefined, artworkData]) {
    await page.evaluate(installDrawing,{scenes,total:41.28,visualStyle:'watercolor',artworkData,scene3ArtworkData});
    const differences = await page.evaluate(() => {
      const g = document.querySelector('canvas').getContext('2d');
      const stage = time => {window.render(time); return g.getImageData(64,205,1152,384).data;};
      const difference = (a,b) => {let pixels=0; for(let i=0;i<a.length;i+=4) if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>24) pixels++; return pixels;};
      return {trainingVsWave:difference(stage(9),stage(15)),waveVsDetector:difference(stage(15),stage(25)),trainingMotion:difference(stage(7.1),stage(8.6)),waveMotion:difference(stage(14),stage(14.25)),detectorBuild:difference(stage(21.2),stage(22.5))};
    });
    assert.ok(differences.trainingVsWave>10000);
    assert.ok(differences.waveVsDetector>10000);
    assert.ok(differences.trainingMotion>1000);
    if (!scene3ArtworkData) assert.ok(differences.waveMotion>1000);
    assert.ok(differences.detectorBuild>1000);
    }
  } finally {await browser.close();}
});

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
