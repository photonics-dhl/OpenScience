import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';

const webRoot = resolve(import.meta.dirname, '..');
const assetRoot = resolve(webRoot, 'assets/optical-prototype');
const publicRoot = resolve(webRoot, 'public/optical-prototype');
const geometryPath = resolve(publicRoot, 'title-geometry.json');
const outlinePath = resolve(publicRoot, 'title-outline.svg');
const manifestPath = resolve(assetRoot, 'geometry-manifest.json');

const contract = Object.freeze({
  baseline: 542,
  center: { normalizedX: 0.573, normalizedY: 0.5, x: 958.056, y: 467.5 },
  gridStep: 5,
  text: 'Science evolves.',
  viewport: { width: 1672, height: 935 },
});

const sources = Object.freeze([
  {
    family: 'Archivo Black',
    file: 'assets/optical-lab/fonts/science-display.ttf',
    licenseFile: 'assets/optical-lab/fonts/OFL-science.txt',
    size: 156,
  },
  {
    family: 'Bodoni Moda 96pt Bold Italic',
    file: 'assets/optical-lab/fonts/evolves-editorial.ttf',
    licenseFile: 'assets/optical-lab/fonts/OFL-evolves.txt',
    size: 168,
  },
]);

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

function loadFont(path) {
  const contents = readFileSync(path);
  const font = opentype.parse(contents.buffer.slice(contents.byteOffset, contents.byteOffset + contents.byteLength));
  // The accepted title has no ligatures. Disabling GSUB avoids unsupported
  // contextual substitutions in opentype.js 2 while preserving GPOS kerning.
  font.tables.gsub = undefined;
  return font;
}

function rounded(value) {
  return Number(value.toFixed(3));
}

export function assertSupportedNodeRuntime(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`Optical geometry generation requires an exact Node semver, received: ${version}`);
  if (Number(match[1]) < 20) throw new Error(`Optical geometry generation requires Node >=20, received: ${version}`);
  return version;
}

function finitePathData(path) {
  const pack = (...values) => values.map((value) => {
    if (!Number.isFinite(value)) throw new Error(`Cannot serialize non-finite SVG coordinate: ${value}`);
    const normalized = rounded(value);
    return Number.isInteger(normalized) ? String(normalized) : normalized.toFixed(3);
  }).join(' ');
  const serialized = path.commands.map((command) => {
    if (command.type === 'M' || command.type === 'L') return `${command.type}${pack(command.x, command.y)}`;
    if (command.type === 'Q') return `Q${pack(command.x1, command.y1, command.x, command.y)}`;
    if (command.type === 'C') return `C${pack(command.x1, command.y1, command.x2, command.y2, command.x, command.y)}`;
    if (command.type === 'Z') return 'Z';
    throw new Error(`Unsupported SVG path command: ${command.type}`);
  }).join('');
  if (/(?:NaN|[+-]?Infinity)/.test(serialized)) throw new Error('Serialized SVG path contains a non-finite coordinate.');
  return serialized;
}

function normalizeJson(value) {
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, normalizeJson(child)]),
    );
  }
  return value;
}

function json(value) {
  return `${JSON.stringify(normalizeJson(value), null, 2)}\n`;
}

function boundsOf(path) {
  const bounds = path.getBoundingBox();
  return {
    minX: rounded(bounds.x1),
    minY: rounded(bounds.y1),
    maxX: rounded(bounds.x2),
    maxY: rounded(bounds.y2),
  };
}

function interpolateQuadratic(from, control, to, t) {
  const inverse = 1 - t;
  return {
    x: inverse * inverse * from.x + 2 * inverse * t * control.x + t * t * to.x,
    y: inverse * inverse * from.y + 2 * inverse * t * control.y + t * t * to.y,
  };
}

function interpolateCubic(from, first, second, to, t) {
  const inverse = 1 - t;
  return {
    x: inverse ** 3 * from.x + 3 * inverse ** 2 * t * first.x + 3 * inverse * t ** 2 * second.x + t ** 3 * to.x,
    y: inverse ** 3 * from.y + 3 * inverse ** 2 * t * first.y + 3 * inverse * t ** 2 * second.y + t ** 3 * to.y,
  };
}

function flattenPath(path) {
  const contours = [];
  let contour = [];
  let current = { x: 0, y: 0 };
  for (const command of path.commands) {
    if (command.type === 'M') {
      if (contour.length > 2) contours.push(contour);
      current = { x: command.x, y: command.y };
      contour = [current];
    } else if (command.type === 'L') {
      current = { x: command.x, y: command.y };
      contour.push(current);
    } else if (command.type === 'Q') {
      const from = current;
      const control = { x: command.x1, y: command.y1 };
      const to = { x: command.x, y: command.y };
      for (let step = 1; step <= 16; step += 1) contour.push(interpolateQuadratic(from, control, to, step / 16));
      current = to;
    } else if (command.type === 'C') {
      const from = current;
      const first = { x: command.x1, y: command.y1 };
      const second = { x: command.x2, y: command.y2 };
      const to = { x: command.x, y: command.y };
      for (let step = 1; step <= 16; step += 1) contour.push(interpolateCubic(from, first, second, to, step / 16));
      current = to;
    } else if (command.type === 'Z' && contour.length > 2) {
      contours.push(contour);
      contour = [];
    }
  }
  if (contour.length > 2) contours.push(contour);
  return contours;
}

function windingNumber(point, contours) {
  let winding = 0;
  for (const contour of contours) {
    for (let index = 0; index < contour.length; index += 1) {
      const current = contour[index];
      const next = contour[(index + 1) % contour.length];
      const side = (next.x - current.x) * (point.y - current.y) - (point.x - current.x) * (next.y - current.y);
      if (current.y <= point.y && next.y > point.y && side > 0) winding += 1;
      if (current.y > point.y && next.y <= point.y && side < 0) winding -= 1;
    }
  }
  return winding;
}

function glyphRecords(font, text, startX, size, indexOffset, groupForCharacter) {
  const scale = size / font.unitsPerEm;
  const records = [];
  let previousPenX;
  let previousAdvance;
  font.forEachGlyph(text, startX, contract.baseline, size, { kerning: true }, (glyph, penX) => {
    const index = records.length;
    const kerningBefore = index === 0 ? 0 : penX - previousPenX - previousAdvance;
    const advance = (glyph.advanceWidth ?? font.unitsPerEm) * scale;
    const path = glyph.getPath(penX, contract.baseline, size);
    records.push({
      advance: rounded(advance),
      bounds: boundsOf(path),
      char: text[index],
      contours: flattenPath(path),
      family: font.names.fontFamily?.en ?? 'Unknown',
      group: groupForCharacter(text[index]),
      index: indexOffset + index,
      kerningBefore: rounded(kerningBefore),
      path,
      penX: rounded(penX),
      size,
    });
    previousPenX = penX;
    previousAdvance = advance;
  });
  const finalRecord = records.at(-1);
  return { endX: finalRecord ? finalRecord.penX + finalRecord.advance : startX, records };
}

function publicGlyph(record) {
  const glyph = { ...record };
  delete glyph.contours;
  delete glyph.path;
  return glyph;
}

async function main() {
  const nodeVersion = assertSupportedNodeRuntime(process.versions.node);
  const [scienceSource, evolvesSource] = sources;
  const scienceFont = loadFont(resolve(webRoot, scienceSource.file));
  const evolvesFont = loadFont(resolve(webRoot, evolvesSource.file));
  const scienceText = 'Science';
  const evolvesText = 'evolves.';
  const scienceWidth = scienceFont.getAdvanceWidth(scienceText, scienceSource.size, { kerning: true });
  const spaceWidth = scienceFont.getAdvanceWidth(' ', scienceSource.size, { kerning: true });
  const evolvesWidth = evolvesFont.getAdvanceWidth(evolvesText, evolvesSource.size, { kerning: true });
  const startX = contract.center.x - (scienceWidth + spaceWidth + evolvesWidth) / 2;

  const science = glyphRecords(scienceFont, scienceText, startX, scienceSource.size, 0, () => 'science');
  const spacePath = scienceFont.charToGlyph(' ').getPath(science.endX, contract.baseline, scienceSource.size);
  const space = {
    advance: rounded(spaceWidth),
    bounds: { minX: rounded(science.endX), minY: contract.baseline, maxX: rounded(science.endX), maxY: contract.baseline },
    char: ' ',
    contours: [],
    family: scienceFont.names.fontFamily?.en ?? scienceSource.family,
    group: 'science',
    index: science.records.length,
    kerningBefore: 0,
    path: spacePath,
    penX: rounded(science.endX),
    size: scienceSource.size,
  };
  const evolves = glyphRecords(
    evolvesFont,
    evolvesText,
    science.endX + spaceWidth,
    evolvesSource.size,
    science.records.length + 1,
    (character) => (character === '.' ? 'period' : 'evolves'),
  );
  const records = [...science.records, space, ...evolves.records];

  const scienceOutline = scienceFont.getPath(scienceText, startX, contract.baseline, scienceSource.size, { kerning: true });
  const evolvesOutline = evolvesFont.getPath(evolvesText, science.endX + spaceWidth, contract.baseline, evolvesSource.size, { kerning: true });
  const visible = [boundsOf(scienceOutline), boundsOf(evolvesOutline)];
  const visibleBounds = {
    minX: rounded(Math.min(...visible.map(({ minX }) => minX))),
    minY: rounded(Math.min(...visible.map(({ minY }) => minY))),
    maxX: rounded(Math.max(...visible.map(({ maxX }) => maxX))),
    maxY: rounded(Math.max(...visible.map(({ maxY }) => maxY))),
  };
  const originX = Math.floor(visibleBounds.minX / contract.gridStep) * contract.gridStep;
  const originY = Math.floor(visibleBounds.minY / contract.gridStep) * contract.gridStep;
  const points = [];
  const maxColumn = Math.ceil((visibleBounds.maxX - originX) / contract.gridStep);
  const maxRow = Math.ceil((visibleBounds.maxY - originY) / contract.gridStep);
  for (let row = 0; row <= maxRow; row += 1) {
    const y = originY + row * contract.gridStep;
    for (let column = 0; column <= maxColumn; column += 1) {
      const x = originX + column * contract.gridStep;
      const owner = records.find(({ bounds, contours }) => (
        contours.length > 0
        && x >= bounds.minX
        && x <= bounds.maxX
        && y >= bounds.minY
        && y <= bounds.maxY
        && windingNumber({ x, y }, contours) !== 0
      ));
      if (!owner) continue;
      points.push({
        column,
        glyphIndex: owner.index,
        group: owner.group,
        id: points.length,
        row,
        x,
        y,
      });
    }
  }

  const geometry = {
    baseline: contract.baseline,
    center: contract.center,
    glyphs: records.map(publicGlyph),
    grid: { originX, originY, step: contract.gridStep },
    // opentype.js 2.0.0 roundDecimal can emit NaN when a coordinate such as
    // 1407.0000000000002 has a scientific-notation fractional remainder.
    outlinePath: `${finitePathData(scienceOutline)} ${finitePathData(evolvesOutline)}`,
    points,
    schemaVersion: 1,
    text: contract.text,
    typography: { kerning: true },
    viewport: contract.viewport,
    visibleBounds,
    words: [
      {
        advance: rounded(science.endX - startX),
        baseline: contract.baseline,
        endX: rounded(science.endX),
        family: scienceFont.names.fontFamily?.en ?? scienceSource.family,
        size: scienceSource.size,
        startX: rounded(startX),
        text: scienceText,
      },
      {
        advance: rounded(evolves.endX - (science.endX + spaceWidth)),
        baseline: contract.baseline,
        endX: rounded(evolves.endX),
        family: evolvesFont.names.fontFamily?.en ?? evolvesSource.family,
        size: evolvesSource.size,
        startX: rounded(science.endX + spaceWidth),
        text: evolvesText,
      },
    ],
  };
  const geometryContents = json(geometry);
  const boundsAttribute = Object.values(visibleBounds).join(' ');
  const svgContents = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1672" height="935" viewBox="0 0 1672 935"',
    `  role="img" aria-label="Science evolves." data-visible-bounds="${boundsAttribute}">`,
    `  <path d="${geometry.outlinePath}" fill="currentColor" fill-rule="nonzero"/>`,
    '</svg>',
    '',
  ].join('\n');

  const manifest = {
    inputs: sources.map((source) => ({
      family: source.family,
      file: source.file,
      license: 'SIL OFL 1.1',
      licenseFile: source.licenseFile,
      sha256: sha256(readFileSync(resolve(webRoot, source.file))),
    })),
    outputs: [
      { file: 'public/optical-prototype/title-geometry.json', sha256: sha256(geometryContents) },
      { file: 'public/optical-prototype/title-outline.svg', sha256: sha256(svgContents) },
    ],
    tools: {
      node: nodeVersion,
      nodePolicy: 'repository engines.node >=20; exact generator runtime recorded',
      opentypeJs: '2.0.0',
    },
  };

  await Promise.all([mkdir(assetRoot, { recursive: true }), mkdir(publicRoot, { recursive: true })]);
  await Promise.all([
    writeFile(geometryPath, geometryContents),
    writeFile(outlinePath, svgContents),
    writeFile(manifestPath, json(manifest)),
  ]);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
