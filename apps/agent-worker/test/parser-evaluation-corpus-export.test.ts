import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, it } from 'vitest';

import { buildResearchIntelligenceExport } from './support/research-intelligence-corpus';

const EVALUATION_CORPUS_PATH = /^\/opt\/openscience-evals\/document-parser\/[a-f0-9]{40}\/corpus$/;

it('exports the content-addressed self-authored corpus only to the ECS evaluation root', async () => {
  const exported = buildResearchIntelligenceExport();
  const outputDirectory = process.env.OPENSCIENCE_EVALUATION_CORPUS_DIR;

  expect(exported.files.length).toBe(16);
  if (!outputDirectory) return;
  expect(outputDirectory).toMatch(EVALUATION_CORPUS_PATH);

  await mkdir(outputDirectory, { recursive: true, mode: 0o755 });
  for (const file of exported.files) {
    const manifestCase = exported.manifest.cases.find(({ filename }) => filename === file.filename);
    expect(manifestCase?.sha256).toBe(createHash('sha256').update(file.content).digest('hex'));
    await writeFile(join(outputDirectory, file.filename), file.content, { flag: 'wx', mode: 0o444 });
  }
  const manifestPath = join(outputDirectory, 'manifest.json');
  await writeFile(manifestPath, `${JSON.stringify(exported.manifest, null, 2)}\n`, { flag: 'wx', mode: 0o444 });
  expect(JSON.parse(await readFile(manifestPath, 'utf8'))).toEqual(exported.manifest);
});
