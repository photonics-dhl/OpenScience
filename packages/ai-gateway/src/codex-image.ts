import { constants } from 'node:fs';
import { lstat, open, link, unlink } from 'node:fs/promises';
import { isAbsolute, join, dirname, parse } from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateImageRequest, validateImageBytes, type ImageProvider, type ImageRequest, type ImageProviderResult } from './image';
import { sha256Text } from './ocr';
import { CODEX_IMAGE_ID_PATTERN, CODEX_IMAGE_MAX_DEADLINE_MS, CODEX_IMAGE_MAX_JSON_BYTES, CODEX_IMAGE_MAX_PNG_BYTES, CODEX_IMAGE_READY_MAX_AGE_MS, validateCodexImageRequest, validateCodexImageResult } from './codex-image-protocol';
export interface CodexSpoolImageConfig { inboxDir: string; resultsDir: string; timeoutMs?: number; pollIntervalMs?: number; now?: () => number; sleep?: (ms: number) => Promise<void> }
const fail = (): never => { throw new Error('INVALID_OUTPUT'); };
async function directory(path: string): Promise<void> {
  if (!isAbsolute(path)) fail();
  let current = path;
  for (;;) { const stat = await lstat(current); if (!stat.isDirectory() || stat.isSymbolicLink()) fail(); if (current === parse(current).root) break; current = dirname(current); }
}
async function boundedRead(path: string, limit: number): Promise<Buffer> {
  const before = await lstat(path); if (!before.isFile() || before.isSymbolicLink() || before.size > limit) fail();
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await file.stat(); if (!stat.isFile() || stat.size > limit || stat.ino !== before.ino || stat.dev !== before.dev) fail();
    const buffer = Buffer.alloc(limit + 1); const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead > limit || bytesRead !== stat.size) fail();
    return buffer.subarray(0, bytesRead);
  } finally { await file.close(); }
}
const missing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOENT';
async function absent(path: string): Promise<boolean> {
  try { await lstat(path); return false; } catch (error) { return missing(error); }
}
async function publish(path: string, data: string): Promise<boolean> {
  const temp = path + '.' + randomUUID() + '.tmp';
  const file = await open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
  try { await file.writeFile(data); await file.sync(); } finally { await file.close(); }
  try { await link(temp, path); if (process.platform !== 'win32') { const parent = await open(dirname(path), constants.O_RDONLY); try { await parent.sync(); } finally { await parent.close(); } } return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false; throw error; } finally { await unlink(temp); }
}
export class CodexSpoolImageProvider implements ImageProvider {
  readonly name = 'codex-image'; readonly model = 'codex-cli-0.153.0/imagegen';
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly timeout: number;
  constructor(private readonly config: CodexSpoolImageConfig) {
    if (!isAbsolute(config.inboxDir) || !isAbsolute(config.resultsDir) || config.inboxDir === config.resultsDir) fail();
    this.timeout = config.timeoutMs ?? CODEX_IMAGE_MAX_DEADLINE_MS;
    if (!Number.isSafeInteger(this.timeout) || this.timeout < 1 || this.timeout > CODEX_IMAGE_MAX_DEADLINE_MS || (config.pollIntervalMs !== undefined && (!Number.isSafeInteger(config.pollIntervalMs) || config.pollIntervalMs < 1 || config.pollIntervalMs > 60000))) fail();
    this.now = config.now ?? Date.now; this.sleep = config.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  }
  async canResumeBeforeSubmission(id: string): Promise<boolean> {
    if (!CODEX_IMAGE_ID_PATTERN.test(id)) return false;
    try {
      await directory(this.config.inboxDir); await directory(this.config.resultsDir);
      return await absent(join(this.config.inboxDir, id + '.submitted.json'))
        && await absent(join(this.config.inboxDir, id + '.json'))
        && await absent(join(this.config.resultsDir, id));
    } catch {
      return false;
    }
  }
  async generate(input: ImageRequest): Promise<ImageProviderResult> {
    const prompt = validateImageRequest(input); const id = input.requestId;
    if (!id || !CODEX_IMAGE_ID_PATTERN.test(id)) return fail();
    await directory(this.config.inboxDir); await directory(this.config.resultsDir);
    await boundedRead(join(this.config.resultsDir, '.ready'), CODEX_IMAGE_MAX_JSON_BYTES);
    const ready = await lstat(join(this.config.resultsDir, '.ready'));
    if (this.now() - ready.mtimeMs > CODEX_IMAGE_READY_MAX_AGE_MS || ready.mtimeMs > this.now() + 5000) fail();
    const output = join(this.config.resultsDir, id);
    const createdAt = this.now();
    let request = validateCodexImageRequest({ schemaVersion: 1, id, prompt, promptHash: sha256Text(prompt), createdAt, deadlineAt: createdAt + this.timeout });
    // This immutable reservation remains after the runner claims the active request.
    const reservation = join(this.config.inboxDir, id + '.submitted.json');
    if (!await publish(reservation, JSON.stringify(request))) {
      request = validateCodexImageRequest(JSON.parse((await boundedRead(reservation, CODEX_IMAGE_MAX_JSON_BYTES)).toString('utf8')));
      if (request.id !== id || request.promptHash !== sha256Text(prompt)) fail();
    }
    validateCodexImageRequest(request, this.now());
    // Repair a crash between reservation and publication. The runner's private
    // durable execution ledger makes a repeated delivery safe after a claim.
    const inbox = join(this.config.inboxDir, id + '.json');
    if (!await publish(inbox, JSON.stringify(request))) {
      const existing = validateCodexImageRequest(JSON.parse((await boundedRead(inbox, CODEX_IMAGE_MAX_JSON_BYTES)).toString('utf8')));
      if (existing.id !== id || existing.promptHash !== request.promptHash) fail();
    }
    while (this.now() < request.deadlineAt) {
      let bytes: Buffer | undefined;
      try { await directory(output); bytes = await boundedRead(join(output, 'result.json'), CODEX_IMAGE_MAX_JSON_BYTES); } catch (error) { if (!missing(error)) throw error; }
      if (bytes) {
        const result = validateCodexImageResult(JSON.parse(bytes.toString('utf8')));
        if (result.id !== id || result.promptHash !== request.promptHash) fail();
        if (result.status !== 'succeeded') throw new Error(result.errorCode ?? (result.status === 'uncertain' ? 'UNCERTAIN' : 'EXECUTION_FAILED'));
        const image = validateImageBytes(await boundedRead(join(output, 'result.png'), CODEX_IMAGE_MAX_PNG_BYTES));
        if (image.contentType !== 'image/png') fail(); return image;
      }
      await this.sleep(Math.min(this.config.pollIntervalMs ?? 1000, request.deadlineAt - this.now()));
    }
    throw new Error('EXPIRED');
  }
}

