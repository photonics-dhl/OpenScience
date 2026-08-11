import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const generateBMFont = require('msdf-bmfont-xml');
const generatorPackage = require('msdf-bmfont-xml/package.json');

const webRoot = resolve(import.meta.dirname, '..');
const fontRoot = resolve(webRoot, 'assets/optical-lab/fonts');
const atlasRoot = resolve(webRoot, 'public/optical-lab/atlas');
const manifestPath = resolve(fontRoot, 'manifest.json');
const charsetPath = resolve(fontRoot, 'charset.txt');
const acceptedCharset = ' Sciencevolves.';
const expectedGenerator = { name: 'msdf-bmfont-xml', version: '2.8.0' };
const expectedOutputs = new Set([
  resolve(atlasRoot, 'science-display.json'),
  resolve(atlasRoot, 'science-display.png'),
  resolve(atlasRoot, 'evolves-editorial.json'),
  resolve(atlasRoot, 'evolves-editorial.png'),
]);

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

function isWithin(root, candidate) {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot && !pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== '..';
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

function stringifiedJson(value) {
  return `${JSON.stringify(normalizeJson(value), null, 2)}\n`;
}

export function assertAcceptedCharset(charset) {
  if (charset !== acceptedCharset) {
    throw new Error('Optical Lab only generates the accepted charset: " Sciencevolves."');
  }
}

function generate(fontPath, filename, charset, settings) {
  return new Promise((resolveGeneration, rejectGeneration) => {
    generateBMFont(fontPath, {
      charset,
      distanceRange: settings.distanceRange,
      filename,
      fontSize: settings.fontSize,
      outputType: settings.outputType,
      pot: settings.powerOfTwo,
      square: true,
      'smart-size': settings.smartSize,
      texturePadding: settings.texturePadding,
    }, (error, textures, font) => {
      if (error) rejectGeneration(error);
      else resolveGeneration({ font, textures });
    });
  });
}

function validateManifest(manifest) {
  if (manifest.generator?.name !== expectedGenerator.name || manifest.generator?.version !== expectedGenerator.version) {
    throw new Error(`Expected ${expectedGenerator.name}@${expectedGenerator.version}.`);
  }
  if (generatorPackage.version !== expectedGenerator.version) {
    throw new Error(`Installed ${expectedGenerator.name}@${generatorPackage.version}, expected ${expectedGenerator.version}.`);
  }
  if (!Array.isArray(manifest.fonts) || manifest.fonts.length !== 2) {
    throw new Error('The Optical Lab manifest must declare exactly two instantiated source fonts.');
  }
  for (const font of manifest.fonts) {
    const fontPath = resolve(fontRoot, font.file);
    if (!isWithin(fontRoot, fontPath) || !existsSync(fontPath)) {
      throw new Error(`Invalid Optical Lab source font path: ${font.file}`);
    }
    if (sha256(readFileSync(fontPath)) !== font.sourceSha256) {
      throw new Error(`Source hash mismatch for ${font.file}.`);
    }
  }
  if (!Array.isArray(manifest.outputs) || manifest.outputs.length !== expectedOutputs.size) {
    throw new Error('The Optical Lab manifest must declare exactly four generated outputs.');
  }
  for (const output of manifest.outputs) {
    if (!expectedOutputs.has(resolve(webRoot, output.file))) {
      throw new Error(`Refusing unexpected atlas output: ${output.file}`);
    }
  }
}

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const charset = (await readFile(charsetPath, 'utf8')).replace(/[\r\n]+$/, '');
  validateManifest(manifest);
  assertAcceptedCharset(manifest.charset);
  assertAcceptedCharset(charset);
  if (charset !== manifest.charset) throw new Error('The charset file does not match the manifest.');

  const generated = await Promise.all(manifest.fonts.map(async (font) => {
    const name = basename(font.file, '.ttf');
    const result = await generate(resolve(fontRoot, font.file), resolve(atlasRoot, name), charset, manifest.settings);
    if (result.textures.length !== 1) {
      throw new Error(`${name} generated ${result.textures.length} texture pages; exactly one is required.`);
    }
    const atlas = JSON.parse(result.font.data);
    atlas.pages = [`${name}.png`];
    return { json: stringifiedJson(atlas), name, png: result.textures[0].texture };
  }));

  await mkdir(atlasRoot, { recursive: true });
  await Promise.all(generated.flatMap(({ json, name, png }) => [
    writeFile(resolve(atlasRoot, `${name}.json`), json),
    writeFile(resolve(atlasRoot, `${name}.png`), png),
  ]));

  manifest.outputs = manifest.outputs.map((output) => {
    const outputPath = resolve(webRoot, output.file);
    return { ...output, sha256: sha256(readFileSync(outputPath)) };
  });
  await writeFile(manifestPath, stringifiedJson(manifest));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
