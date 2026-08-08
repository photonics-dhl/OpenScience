import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';

import {
  createMiniMaxImageClient,
  createSafeImageProvenance,
  getAssetKeys,
  getImageGenerationUrl,
} from './minimax-client.mjs';

function readOption(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requireOption(name) {
  const value = readOption(name);
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing required option: ${name}`);
  }
  return value;
}

function requireRegion() {
  const region = requireOption('--region');
  if (region !== 'cn' && region !== 'global') {
    throw new Error('Invalid --region; expected cn or global');
  }
  return region;
}

function assertGeneratedAssetPath(outputPath) {
  const generatedDir = resolve('docs/design-assets/generated');
  const resolvedOutput = resolve(outputPath);
  const pathFromGeneratedDir = relative(generatedDir, resolvedOutput);
  if (pathFromGeneratedDir.startsWith('..') || pathFromGeneratedDir.includes(`..${sep}`)) {
    throw new Error('Output must be inside docs/design-assets/generated');
  }
  return resolvedOutput;
}

async function downloadImage(imageUrl) {
  let response;
  try {
    response = await fetch(imageUrl);
  } catch {
    throw new Error('Generated image download failed');
  }
  if (!response.ok) {
    throw new Error(`Generated image download failed with HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  const outputPath = assertGeneratedAssetPath(requireOption('--output'));
  const prompt = requireOption('--prompt');
  const region = requireRegion();
  const imageGenerationUrl = getImageGenerationUrl(region);
  const aspectRatio = readOption('--aspect-ratio') ?? '16:9';
  const keys = getAssetKeys(process.env);
  const client = createMiniMaxImageClient({ fetch: globalThis.fetch, imageGenerationUrl });
  const result = await client.generateWithFallback({ aspectRatio, prompt, ...keys });
  const image = await downloadImage(result.imageUrls[0]);
  const generatedAt = new Date().toISOString();
  const sidecarPath = `${outputPath}.provenance.json`;
  const provenance = createSafeImageProvenance({
    generatedAt,
    host: new URL(imageGenerationUrl).host,
    intendedSurface: 'cross-surface Figma visual master',
    keySlot: result.keySlot,
    localAssetPath: relative(process.cwd(), outputPath).replaceAll('\\', '/'),
    model: result.model,
    postProcessing: 'none',
    prompt,
    region,
    requestId: result.requestId,
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, image, { flag: 'wx' });
  await writeFile(
    sidecarPath,
    `${JSON.stringify(
      provenance,
      null,
      2,
    )}\n`,
    { flag: 'wx' },
  );

  console.log(JSON.stringify({
    host: provenance.host,
    keySlot: provenance.keySlot,
    model: provenance.model,
    outputPath,
    region: provenance.region,
    requestId: provenance.requestId,
    sidecarPath,
  }));
}

main().catch((error) => {
  console.error(JSON.stringify({
    httpStatus: error.httpStatus,
    keySlot: error.keySlot,
    message: error.message,
    minimaxStatusCode: error.minimaxStatusCode,
    minimaxStatusMessage: error.minimaxStatusMessage,
  }));
  process.exitCode = 1;
});
