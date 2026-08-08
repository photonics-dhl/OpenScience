import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';

import { createMiniMaxImageClient, getAssetKeys } from './minimax-client.mjs';

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
  const aspectRatio = readOption('--aspect-ratio') ?? '16:9';
  const keys = getAssetKeys(process.env);
  const client = createMiniMaxImageClient({ fetch: globalThis.fetch });
  const result = await client.generateWithFallback({ aspectRatio, prompt, ...keys });
  const image = await downloadImage(result.imageUrls[0]);
  const generatedAt = new Date().toISOString();
  const sidecarPath = `${outputPath}.provenance.json`;

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, image, { flag: 'wx' });
  await writeFile(
    sidecarPath,
    `${JSON.stringify(
      {
        generatedAt,
        imageUrl: result.imageUrls[0],
        intendedSurface: 'cross-surface Figma visual master',
        keySlot: result.keySlot,
        model: result.model,
        postProcessing: 'none',
        prompt,
        requestId: result.requestId,
      },
      null,
      2,
    )}\n`,
    { flag: 'wx' },
  );

  console.log(JSON.stringify({ outputPath, sidecarPath, ...result }));
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
