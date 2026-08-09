import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const visualDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(visualDir, '../..');
const repoDir = path.resolve(webDir, '../..');
const outDir = path.join(repoDir, '.playwright-mcp', 'ingestion-foundations');
const tokens = await readFile(path.join(webDir, 'app', 'tokens.css'), 'utf8');

const viewports = [
  { width: 1440, height: 900, name: 'desktop' },
  { width: 768, height: 1024, name: 'tablet' },
  { width: 375, height: 812, name: 'mobile' },
];

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    ${tokens}
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--workbench-bg); color: var(--workbench-text); font: 14px/1.5 system-ui, sans-serif; }
    main { min-height: 100vh; padding: clamp(20px, 4vw, 56px); }
    header { display: flex; align-items: end; justify-content: space-between; gap: 24px; margin-bottom: 28px; }
    h1, h2, p { margin: 0; }
    h1 { max-width: 680px; font-family: Georgia, 'Noto Serif SC', serif; font-size: clamp(28px, 4vw, 48px); line-height: 1.08; letter-spacing: -0.025em; }
    header p { max-width: 420px; color: var(--workbench-muted); }
    .grid { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(320px, .85fr); gap: 18px; }
    .dropzone { min-height: 260px; display: grid; place-content: center; gap: 12px; padding: 30px; text-align: center; border: 1px dashed color-mix(in srgb, var(--workbench-muted) 50%, transparent); border-radius: var(--radius-card); background: var(--workbench-surface); box-shadow: var(--shadow-card); }
    .dropzone strong { font-size: 18px; }
    .dropzone span { color: var(--workbench-muted); }
    .button { justify-self: center; padding: 9px 15px; border-radius: var(--radius-control); background: var(--accent-primary-strong); color: var(--hero-text); font-weight: 700; }
    .rail { min-height: 128px; display: grid; grid-template-rows: auto 6px auto 40px; gap: 12px; padding: 16px; border-radius: var(--radius-card); background: var(--workbench-surface); }
    .rail-head { display: flex; justify-content: space-between; gap: 12px; color: var(--workbench-muted); }
    .badge { display: inline-flex; align-items: center; gap: 6px; width: max-content; padding: 4px 10px; border-radius: var(--radius-pill); font-size: 12px; font-weight: 700; }
    .badge::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: .7; }
    .warning { background: var(--status-warning-bg); color: var(--status-warning-text); }
    .info { background: var(--status-info-bg); color: var(--status-info-text); }
    .success { background: var(--status-success-bg); color: var(--status-success-text); }
    .bar { overflow: hidden; border-radius: var(--radius-pill); background: var(--workbench-bg); }
    .bar::before { content: ''; display: block; width: 42%; height: 100%; background: var(--accent-primary); }
    .evidence { margin-top: 18px; padding: 22px; border-radius: var(--radius-card); background: var(--evidence-paper); color: var(--evidence-ink); box-shadow: var(--shadow-evidence); }
    .evidence-head { display: flex; align-items: start; justify-content: space-between; gap: 16px; }
    .eyebrow { color: var(--evidence-muted); font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .evidence h2 { margin-top: 3px; font-family: Georgia, 'Noto Serif SC', serif; font-size: 22px; }
    .claim { margin: 18px 0; font-size: 17px; line-height: 1.65; }
    dl { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 0; padding-top: 14px; border-top: 1px solid var(--evidence-border); }
    dt { color: var(--evidence-muted); font-weight: 700; } dd { margin: 2px 0 0; }
    .actions { display: flex; gap: 8px; margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--evidence-border); }
    .actions span { padding: 7px 12px; border-radius: var(--radius-control); font-weight: 700; }
    .actions .primary { background: var(--accent-primary-strong); color: var(--hero-text); }
    .actions .secondary { outline: 1px solid var(--evidence-border); }
    .node { width: 44px; height: 44px; display: grid; place-items: center; border: 1px solid var(--accent-diff); border-radius: 50%; color: var(--accent-diff); font-family: Georgia, serif; font-weight: 700; }
    @media (max-width: 820px) { header { align-items: start; flex-direction: column; } .grid { grid-template-columns: 1fr; } .dropzone { min-height: 210px; } }
    @media (max-width: 480px) { main { padding: 12px 18px; } h1 { font-size: 25px; } header { gap: 6px; margin-bottom: 10px; } header p { font-size: 11px; line-height: 1.35; } .grid { gap: 8px; } .dropzone { min-height: 126px; padding: 12px; gap: 4px; } .dropzone strong { font-size: 16px; } .dropzone span { font-size: 12px; } .button { padding: 7px 12px; } .rail { min-height: 108px; gap: 7px; padding: 11px 16px; } .rail p { font-size: 12px; line-height: 1.35; } .evidence { margin-top: 8px; padding: 12px 16px; } .evidence h2 { font-size: 20px; } .claim { margin: 7px 0; font-size: 14px; line-height: 1.45; } dl { grid-template-columns: 1fr; gap: 3px; padding-top: 8px; font-size: 12px; } .actions { margin-top: 7px; padding-top: 7px; } .actions span { padding: 6px 10px; font-size: 12px; } .node { display: none; } }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Evidence-led scholarly cockpit</h1>
      <p>Canonical ingestion foundations · solid deep-blue hierarchy, paper evidence, one amber diff accent.</p>
    </header>
    <div class="grid">
      <section class="dropzone" aria-label="Add research materials">
        <strong>Add research materials</strong>
        <span>PDF, DOCX, TeX, Markdown, images</span>
        <span class="button">Choose files</span>
      </section>
      <section class="rail" aria-label="Research material processing">
        <div class="rail-head"><span class="badge info">Parsing evidence</span><span>2 of 6 fields</span></div>
        <div class="bar"></div>
        <p>Hermes is locating claims, methods, and source anchors.</p>
        <div></div>
      </section>
    </div>
    <article class="evidence">
      <div class="evidence-head">
        <div><p class="eyebrow">SDF field</p><h2>Method</h2></div>
        <div class="node" aria-hidden="true">M</div>
        <span class="badge warning">Inferred</span>
      </div>
      <p class="claim">Time-resolved photoelectron spectroscopy resolves the transient state across a 35 fs probe window.</p>
      <dl><div><dt>Confidence</dt><dd>High confidence</dd></div><div><dt>Evidence source</dt><dd>methods.pdf · p. 4</dd></div></dl>
      <div class="actions"><span class="primary">Confirm</span><span class="secondary">Edit</span><span>Reject</span></div>
    </article>
  </main>
</body>
</html>`;

const browser = await chromium.launch({ headless: true });
const screenshotPaths = [];

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
    await page.setContent(html, { waitUntil: 'load' });
    const screenshotPath = path.join(outDir, `${viewport.name}-${viewport.width}x${viewport.height}.png`);
    await page.screenshot({ path: screenshotPath, animations: 'disabled' });
    screenshotPaths.push(screenshotPath);
    await page.close();
  }
} finally {
  await browser.close();
}

process.stdout.write(`${screenshotPaths.join('\n')}\n`);
