import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { relative, resolve, sep } from 'node:path';
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
const acceptedAtlasSources = Object.freeze([
  { fontFile: 'science-display.ttf', outputStem: 'science-display' },
  { fontFile: 'evolves-editorial.ttf', outputStem: 'evolves-editorial' },
]);
const expectedGenerator = { name: 'msdf-bmfont-xml', version: '2.8.0' };
const expectedSettings = Object.freeze({
  distanceRange: 8,
  fieldType: 'msdf',
  fontSize: 96,
  maxTotalBytes: 524288,
  outputType: 'json',
  powerOfTwo: true,
  singlePage: true,
  smartSize: true,
  texturePadding: 4,
});
const expectedSourceFiles = acceptedAtlasSources.map(({ fontFile }) => fontFile);
const expectedOutputFiles = acceptedAtlasSources.flatMap(({ outputStem }) => [
  `public/optical-lab/atlas/${outputStem}.json`,
  `public/optical-lab/atlas/${outputStem}.png`,
]);
const expectedOutputs = new Set(expectedOutputFiles.map((file) => resolve(webRoot, file)));

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

function hasExactUniqueValues(values, expected) {
  return Array.isArray(values)
    && values.length === expected.length
    && new Set(values).size === expected.length
    && values.every((value) => expected.includes(value));
}

export function validateOpticalAtlasContract(manifest) {
  assertAcceptedCharset(manifest.charset);
  if (manifest.generator?.name !== expectedGenerator.name || manifest.generator?.version !== expectedGenerator.version) {
    throw new Error(`Expected ${expectedGenerator.name}@${expectedGenerator.version}.`);
  }
  if (!hasExactUniqueValues(manifest.fonts?.map(({ file }) => file), expectedSourceFiles)) {
    throw new Error('The Optical Lab manifest must list the exact source files.');
  }
  if (!hasExactUniqueValues(manifest.outputs?.map(({ file }) => file), expectedOutputFiles)) {
    throw new Error('The Optical Lab manifest must list the exact unique output set.');
  }
  if (JSON.stringify(normalizeJson(manifest.settings)) !== JSON.stringify(expectedSettings)) {
    throw new Error('The Optical Lab manifest must use the fixed settings.');
  }
}

function generate(fontPath, filename, charset) {
  return new Promise((resolveGeneration, rejectGeneration) => {
    generateBMFont(fontPath, {
      charset,
      distanceRange: expectedSettings.distanceRange,
      fieldType: expectedSettings.fieldType,
      filename,
      fontSize: expectedSettings.fontSize,
      outputType: expectedSettings.outputType,
      pot: expectedSettings.powerOfTwo,
      square: true,
      'smart-size': expectedSettings.smartSize,
      texturePadding: expectedSettings.texturePadding,
    }, (error, textures, font) => {
      if (error) rejectGeneration(error);
      else resolveGeneration({ font, textures });
    });
  });
}

function validateManifest(manifest) {
  validateOpticalAtlasContract(manifest);
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

  const generated = await Promise.all(acceptedAtlasSources.map(async ({ fontFile, outputStem }) => {
    const result = await generate(resolve(fontRoot, fontFile), resolve(atlasRoot, outputStem), charset);
    if (result.textures.length !== 1) {
      throw new Error(`${outputStem} generated ${result.textures.length} texture pages; exactly one is required.`);
    }
    const atlas = JSON.parse(result.font.data);
    atlas.pages = [`${outputStem}.png`];
    return { json: stringifiedJson(atlas), outputStem, png: result.textures[0].texture };
  }));

  const totalBytes = generated.reduce((total, { json, png }) => total + Buffer.byteLength(json) + png.byteLength, 0);
  if (totalBytes > expectedSettings.maxTotalBytes) {
    throw new Error(`Optical Lab atlas budget exceeded: ${totalBytes} bytes.`);
  }

  await mkdir(atlasRoot, { recursive: true });
  await Promise.all(generated.flatMap(({ json, outputStem, png }) => [
    writeFile(resolve(atlasRoot, `${outputStem}.json`), json),
    writeFile(resolve(atlasRoot, `${outputStem}.png`), png),
  ]));

  manifest.outputs = manifest.outputs.map((output) => {
    const outputPath = resolve(webRoot, output.file);
    return { ...output, sha256: sha256(readFileSync(outputPath)) };
  });
  await writeFile(manifestPath, stringifiedJson(manifest));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
