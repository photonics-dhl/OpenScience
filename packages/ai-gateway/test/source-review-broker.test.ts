import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it, vi } from 'vitest';
// @ts-expect-error The deployment broker is native ESM without a TypeScript declaration.
import { publishNotSubmittedEvidence } from '../../../infra/chatgpt-browser/review-broker.mjs';

// Only emulate POSIX directory ownership/fsync on Windows. File reads, hashes,
// missing-file checks, atomic writes and the actual broker helper remain real.
const fixtureDirectories = vi.hoisted(() => new Map<string, { uid: number; mode: number }>());
vi.mock('node:fs/promises', async importOriginal => {
  const fs = await importOriginal<typeof import('node:fs/promises')>();
  return { ...fs,
    lstat: async (path: string) => {
      const value = await fs.lstat(path);
      const expected = fixtureDirectories.get(path);
      if (expected && value.isDirectory() && !value.isSymbolicLink()) {
        value.uid = expected.uid; value.mode = (value.mode & ~0o777) | expected.mode;
      }
      return value;
    },
    open: async (path: string, flags: string, mode?: number) => {
      if (flags === 'r' && fixtureDirectories.has(path)) return { sync: async () => {}, close: async () => {} };
      return fs.open(path, flags, mode);
    },
  };
});
const temporaryRoot = fileURLToPath(new URL('../../../tmp/', import.meta.url));
const owned: string[] = [];
afterEach(async () => {
  for (const root of owned.splice(0)) {
    if (!resolve(root).startsWith(resolve(temporaryRoot) + sep)) throw Error('Temporary path escaped project');
    await rm(root, { recursive: true, force: true });
  }
  fixtureDirectories.clear();
});

async function fixture(image = false) {
  await mkdir(temporaryRoot, { recursive: true });
  const root = await mkdtemp(join(temporaryRoot, 'review-broker-proof-')); owned.push(root);
  const id = '01900000-0000-7000-8000-000000000001';
  const config = { privateRoot: join(root, 'private'), jobs: join(root, 'jobs'),
    inbox: join(root, 'inbox'), results: join(root, 'results') };
  const claimed = join(config.privateRoot, id), job = join(config.jobs, 'review', id), output = join(config.results, id);
  for (const [path, uid, mode] of [[claimed, 0, 0o700], [job, 11040, 0o700], [output, 0, 0o750]] as const) {
    await mkdir(path, { recursive: true }); fixtureDirectories.set(path, { uid, mode });
  }
  await mkdir(config.inbox); await mkdir(join(job, 'attachments'));
  const bytes = Buffer.from(image ? 'existing image fixture' : '%PDF-1.7\ncomplete source\n%%EOF');
  const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
  const source = image ? { kind: 'illustration-image', researchObjectId: '01900000-0000-7000-8000-000000000002', versionId: '01900000-0000-7000-8000-000000000003',
    candidateHash: hash(bytes), sourceEvidenceIdentity: 'b'.repeat(64) }
    : { artifactId: 'artifact', documentSha256: hash(bytes), candidateHash: 'a'.repeat(64), sourceMapHash: 'b'.repeat(64) };
  const attachment = image ? { fileName: 'page-1.png', mediaType: 'image/png', pageNumber: 1, width: 1, height: 1, sha256: hash(bytes) }
    : { fileName: 'source.pdf', mediaType: 'application/pdf', sha256: hash(bytes) };
  const prompt = 'Exact original private review';
  const request = { schemaVersion: image ? 3 : 1, provider: 'chatgpt-web-science-review', id,
    prompt, promptHash: hash(prompt), createdAt: 1_790_000_000_000, deadlineAt: 1_790_000_060_000, source, attachments: [attachment] };
  const persisted = { schemaVersion: request.schemaVersion, provider: request.provider, id,
    prompt, promptHash: request.promptHash, deadlineAt: request.deadlineAt, source, attachments: [attachment] };
  const result = { schemaVersion: 1, provider: request.provider, id, promptHash: request.promptHash,
    status: 'failed', errorCode: 'EXECUTION_FAILED' };
  const save = (path: string, value: unknown) => writeFile(path, JSON.stringify(value));
  await save(join(claimed, 'request.json'), request);
  await save(join(config.inbox, `${id}.submitted.json`), request);
  await save(join(job, 'request.json'), persisted);
  await save(join(job, 'operator-error.json'), { error: 'MODEL_6_PRO_OPTION_NOT_READY', state: 'not_submitted', stage: 'model_selection' });
  await save(join(output, 'result.json'), result);
  await writeFile(join(config.inbox, `${id}.${attachment.fileName}`), bytes);
  await writeFile(join(job, 'attachments', attachment.fileName), bytes);
  return { config, id, job, output, claimed, request, result, persisted, save };
}

it.each([false, true])('publishes existing four-field proof for verified unsent review (image=%s)', async image => {
  const f = await fixture(image);
  await publishNotSubmittedEvidence(f.config, f.id);
  expect(JSON.parse(await readFile(join(f.output, 'not-submitted.json'), 'utf8'))).toEqual({ id: f.id,
    provider: f.request.provider, promptHash: f.request.promptHash, state: 'not_submitted' });
});

it.each(['missing-operator', 'uncertain-operator', 'reservation', 'job-request', 'failed-result', 'pdf',
  'submitted.json', 'conversation.json', 'result.json', 'response.txt', 'recovered-result.json', 'recovered-response.txt',
  'public-response', 'public-recovered', 'directory-owner'])(
  'publishes no proof for absent/contradictory evidence: %s', async change => {
    const f = await fixture();
    if (change === 'missing-operator') await rm(join(f.job, 'operator-error.json'));
    else if (change === 'uncertain-operator') await f.save(join(f.job, 'operator-error.json'), { state: 'ambiguous_no_resend' });
    else if (change === 'reservation') await f.save(join(f.config.inbox, `${f.id}.submitted.json`), { ...f.request, deadlineAt: f.request.deadlineAt + 1 });
    else if (change === 'job-request') await f.save(join(f.job, 'request.json'), { ...f.persisted, source: { ...f.request.source, candidateHash: 'c'.repeat(64) } });
    else if (change === 'failed-result') await f.save(join(f.output, 'result.json'), { ...f.result, errorCode: 'EXPIRED' });
    else if (change === 'pdf') await writeFile(join(f.job, 'attachments', 'source.pdf'), 'changed');
    else if (change === 'public-response') await writeFile(join(f.output, 'response.txt'), 'answer');
    else if (change === 'public-recovered') await writeFile(join(f.output, 'recovered-result.json'), '{}');
    else if (change === 'directory-owner') fixtureDirectories.set(f.job, { uid: 0, mode: 0o700 });
    else await writeFile(join(f.job, change), '{}');
    await publishNotSubmittedEvidence(f.config, f.id);
    await expect(readFile(join(f.output, 'not-submitted.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
