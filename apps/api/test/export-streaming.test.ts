import Fastify from 'fastify';
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { inflateRawSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerCommitRoutes, type CommitRouteDeps } from '../src/routes/commits';

const mocks = vi.hoisted(() => ({ buildExportPackage: vi.fn() }));
vi.mock('@openscience/domain', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(), buildExportPackage: mocks.buildExportPackage,
}));
vi.mock('../src/routes/session-guard', () => ({ requireCurrentUser: async () => ({ userId: 'fixture-user' }) }));

const apps: ReturnType<typeof Fastify>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); vi.clearAllMocks(); });

describe('ZIP download real HTTP backpressure', () => {
  it('starts consumption before finalize and downloads an incompressible attachment above the ZIP high-water mark', async () => {
    const bytes = randomBytes(3 * 1024 * 1024);
    const content = Readable.from([bytes.subarray(0, 1024 * 1024), bytes.subarray(1024 * 1024)]);
    mocks.buildExportPackage.mockResolvedValue([{ path: 'artifacts/fixture.bin', content }]);
    const app = Fastify({ forceCloseConnections: true });
    apps.push(app);
    registerCommitRoutes(app, {} as CommitRouteDeps);
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const response = await fetch(`${address}/versions/00000000-0000-4000-8000-000000000101/export`, { signal: AbortSignal.timeout(2500) });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/zip');
    expect(response.headers.get('content-disposition')).toContain('open-science-object.zip');
    const zip = Buffer.from(await response.arrayBuffer());
    const footer = zip.length - 22;
    expect(zip.readUInt32LE(footer)).toBe(0x06054b50);
    const central = zip.readUInt32LE(footer + 16);
    expect(zip.readUInt32LE(central)).toBe(0x02014b50);
    const compressedLength = zip.readUInt32LE(central + 20);
    const localOffset = zip.readUInt32LE(central + 42);
    const payloadOffset = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
    expect(inflateRawSync(zip.subarray(payloadOffset, payloadOffset + compressedLength))).toEqual(bytes);
    expect(content.destroyed).toBe(true);
    expect(mocks.buildExportPackage).toHaveBeenCalledWith(expect.anything(), {
      userId: 'fixture-user', versionId: '00000000-0000-4000-8000-000000000101', streaming: true,
    });
  });

  it('closes attachment streams when the client aborts the download', async () => {
    const content = Readable.from((async function* () {
      while (true) {
        await new Promise(resolve => setTimeout(resolve, 10));
        yield randomBytes(32 * 1024);
      }
    })(), { objectMode: false });
    mocks.buildExportPackage.mockResolvedValue([{ path: 'artifacts/fixture.bin', content }]);
    const app = Fastify({ forceCloseConnections: true });
    apps.push(app);
    registerCommitRoutes(app, {} as CommitRouteDeps);
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const controller = new AbortController();
    const response = await fetch(`${address}/versions/00000000-0000-4000-8000-000000000101/export`, { signal: controller.signal });
    controller.abort();
    await expect(response.arrayBuffer()).rejects.toThrow();
    for (let attempts = 0; attempts < 50 && !content.destroyed; attempts++) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    expect(content.destroyed).toBe(true);
  });

  it('terminates a failed object stream and closes the unread remainder', async () => {
    const broken = Readable.from((async function* () {
      yield Buffer.from('synthetic first chunk');
      throw new Error('synthetic object unavailable');
    })());
    const unread = Readable.from([Buffer.from('unused synthetic second file')]);
    mocks.buildExportPackage.mockResolvedValue([
      { path: 'artifacts/broken.bin', content: broken },
      { path: 'artifacts/unread.bin', content: unread },
    ]);
    const app = Fastify({ forceCloseConnections: true });
    apps.push(app);
    registerCommitRoutes(app, {} as CommitRouteDeps);
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const download = async () => {
      const response = await fetch(`${address}/versions/00000000-0000-4000-8000-000000000101/export`, { signal: AbortSignal.timeout(1500) });
      await response.arrayBuffer();
      if (!response.ok) throw new Error('download rejected');
    };
    await expect(download()).rejects.toThrow();
    expect(broken.destroyed).toBe(true);
    expect(unread.destroyed).toBe(true);
  });

  it('opens only the current attachment before its ZIP entry completes', async () => {
    const opened = new Set<number>();
    const streams = Array.from({ length: 4 }, (_, index) => new Readable({
      read() {
        opened.add(index);
        // The first object remains pending; an eager append would open all four.
        if (index === 0) this.push(randomBytes(32 * 1024));
      },
    }));
    mocks.buildExportPackage.mockResolvedValue(streams.map((content, index) => ({ path: `artifacts/${index}.bin`, content })));
    const app = Fastify({ forceCloseConnections: true });
    apps.push(app);
    registerCommitRoutes(app, {} as CommitRouteDeps);
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const controller = new AbortController();
    const response = await fetch(`${address}/versions/00000000-0000-4000-8000-000000000101/export`, { signal: controller.signal });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect([...opened]).toEqual([0]);
    controller.abort();
    await expect(response.arrayBuffer()).rejects.toThrow();
    for (let attempts = 0; attempts < 50 && streams.some(stream => !stream.destroyed); attempts++) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    expect(streams.every(stream => stream.destroyed)).toBe(true);
  });
});
