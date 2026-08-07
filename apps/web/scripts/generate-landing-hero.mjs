import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { chromium } from 'playwright';

const outputPath = resolve('apps/web/public/hero/landing-hero.png');
const width = 2400;
const height = 1800;

const svg = `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bgGlow" cx="0.72" cy="0.32" r="0.8">
      <stop offset="0%" stop-color="#0d1b33" stop-opacity="0.92"/>
      <stop offset="35%" stop-color="#07111f" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#03060b" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="glass" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#1f4bb3" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#05101c" stop-opacity="0.92"/>
    </linearGradient>
    <linearGradient id="edge" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#8fc0ff" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="#2f78ff" stop-opacity="0.8"/>
    </linearGradient>
    <filter id="blueGlow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="12" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <filter id="wideGlow" x="-55%" y="-55%" width="210%" height="210%">
      <feGaussianBlur stdDeviation="22" />
    </filter>
    <filter id="softBlur" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="4" />
    </filter>
  </defs>

  <rect width="${width}" height="${height}" fill="#03060b" />
  <rect width="${width}" height="${height}" fill="url(#bgGlow)" />
  <ellipse cx="1630" cy="620" rx="620" ry="540" fill="#10306a" opacity="0.18" filter="url(#wideGlow)" />
  <ellipse cx="1560" cy="730" rx="540" ry="420" fill="#0a1630" opacity="0.9" />

  <g transform="translate(1550 790) scale(1.52) translate(-400 -400)" filter="url(#blueGlow)">
    <g opacity="0.25">
      <path d="M104 255 L255 112 L345 175 L292 292 L170 330 Z" fill="none" stroke="#4c8dff" stroke-width="1.5" />
      <path d="M302 93 L458 93 L502 182 L400 242 L298 182 Z" fill="none" stroke="#4c8dff" stroke-width="1.5" />
      <path d="M545 112 L696 255 L630 330 L508 292 L455 175 Z" fill="none" stroke="#4c8dff" stroke-width="1.5" />
      <path d="M696 545 L545 688 L455 625 L508 508 L630 470 Z" fill="none" stroke="#4c8dff" stroke-width="1.5" />
      <path d="M458 707 L302 707 L298 618 L400 558 L502 618 Z" fill="none" stroke="#4c8dff" stroke-width="1.5" />
      <path d="M104 545 L170 470 L292 508 L345 625 L255 688 Z" fill="none" stroke="#4c8dff" stroke-width="1.5" />
    </g>

    <g>
      <g transform="translate(400 400) scale(1.08) translate(-400 -400)">
        <path d="M104 255 L255 112 L345 175 L292 292 L170 330 Z" fill="url(#glass)" stroke="url(#edge)" stroke-width="2" stroke-linejoin="round" />
        <path d="M302 93 L458 93 L502 182 L400 242 L298 182 Z" fill="url(#glass)" stroke="url(#edge)" stroke-width="2" stroke-linejoin="round" />
        <path d="M545 112 L696 255 L630 330 L508 292 L455 175 Z" fill="url(#glass)" stroke="url(#edge)" stroke-width="2" stroke-linejoin="round" />
        <path d="M696 545 L545 688 L455 625 L508 508 L630 470 Z" fill="url(#glass)" stroke="url(#edge)" stroke-width="2" stroke-linejoin="round" />
        <path d="M458 707 L302 707 L298 618 L400 558 L502 618 Z" fill="url(#glass)" stroke="url(#edge)" stroke-width="2" stroke-linejoin="round" />
        <path d="M104 545 L170 470 L292 508 L345 625 L255 688 Z" fill="url(#glass)" stroke="url(#edge)" stroke-width="2" stroke-linejoin="round" />
      </g>

      <g fill="none" stroke="#4c8dff" stroke-linecap="round" stroke-linejoin="round" stroke-width="4">
        <path d="M64 400 C210 360 285 365 360 390 C405 407 420 410 440 410 C545 412 610 432 736 400" />
        <path d="M360 390 C420 320 472 270 525 225" />
        <path d="M525 225 C562 275 548 350 440 410" />
      </g>

      <circle cx="360" cy="390" r="12" fill="#ffb454" stroke="#03060b" stroke-width="4" />
      <circle cx="440" cy="410" r="6" fill="#4c8dff" />
    </g>
  </g>

  <g transform="translate(190 1210)">
    <rect x="0" y="0" width="2020" height="340" rx="34" fill="#04070d" stroke="rgba(255,255,255,0.08)" />
    <rect x="42" y="42" width="360" height="256" rx="22" fill="#060b14" stroke="rgba(255,255,255,0.05)" />
    <rect x="422" y="42" width="760" height="256" rx="22" fill="#050a12" stroke="rgba(255,255,255,0.04)" />
    <rect x="1202" y="42" width="360" height="256" rx="22" fill="#060b14" stroke="rgba(255,255,255,0.05)" />
    <rect x="1582" y="42" width="360" height="256" rx="22" fill="#060b14" stroke="rgba(255,255,255,0.05)" />

    <g opacity="0.56" filter="url(#softBlur)">
      <line x1="72" y1="108" x2="327" y2="108" stroke="#2f78ff" stroke-width="3" />
      <line x1="72" y1="154" x2="300" y2="154" stroke="#2f78ff" stroke-width="3" />
      <line x1="72" y1="200" x2="268" y2="200" stroke="#2f78ff" stroke-width="3" />
      <line x1="450" y1="108" x2="1048" y2="108" stroke="#2f78ff" stroke-width="3" />
      <line x1="450" y1="154" x2="1026" y2="154" stroke="#2f78ff" stroke-width="3" />
      <line x1="450" y1="200" x2="980" y2="200" stroke="#2f78ff" stroke-width="3" />
      <line x1="1228" y1="108" x2="1530" y2="108" stroke="#2f78ff" stroke-width="3" />
      <line x1="1228" y1="154" x2="1500" y2="154" stroke="#2f78ff" stroke-width="3" />
      <line x1="1228" y1="200" x2="1460" y2="200" stroke="#2f78ff" stroke-width="3" />
      <line x1="1608" y1="108" x2="1890" y2="108" stroke="#2f78ff" stroke-width="3" />
      <line x1="1608" y1="154" x2="1862" y2="154" stroke="#2f78ff" stroke-width="3" />
      <line x1="1608" y1="200" x2="1820" y2="200" stroke="#2f78ff" stroke-width="3" />
    </g>
  </g>
</svg>`;

async function main() {
  mkdirSync(dirname(outputPath), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });

  await page.setContent(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #03060b; }
          body { display: grid; place-items: center; }
          svg { width: 100%; height: 100%; display: block; }
        </style>
      </head>
      <body>${svg}</body>
    </html>
  `);

  await page.screenshot({ path: outputPath, omitBackground: false });
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
