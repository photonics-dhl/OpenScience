import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { buildExportPackage } from '../../src/export/packager';
import { createFakePrisma, seedUser } from '../helpers/fakes';
import type { StorageAdapter } from '@openscience/storage';

function fixture() {
  const { prisma, db } = createFakePrisma();
  const user = seedUser(db);
  db.memberships.push({ id: 'member', workspaceId: 'workspace', userId: user.id, role: 'author' });
  db.researchObjects.push({ id: 'object', workspaceId: 'workspace', title: 'Private fixture', visibility: 'private', status: 'draft' });
  db.versions.push({ id: 'version', researchObjectId: 'object', versionNo: 1, status: 'draft', createdAt: new Date('2026-10-14T00:00:00Z'), researchRecord: null });
  db.versionManifests.push({ id: 'manifest', versionId: 'version', coreJson: { schemaVersion: '0.1.0', problem: 'Fixture' } });
  db.manifestEntries.push({ manifestId: 'manifest', logicalPath: 'data.bin', artifactId: 'artifact', blobSha256: 'aa'.repeat(32) });
  const body = Readable.from([Buffer.from('part one'), Buffer.from('part two')]);
  const getObject = vi.fn(async () => ({ body, size: 16 }));
  const storage: StorageAdapter = { getObject, putObject: vi.fn(), headObject: vi.fn(), deleteObject: vi.fn() };
  return { deps: { prisma, storage }, db, user, body, getObject };
}

describe('streaming export allocation and access boundary', () => {
  it('authorizes the frozen package before lazily opening each attachment', async () => {
    const f = fixture();
    const files = await buildExportPackage(f.deps, { userId: f.user.id, versionId: 'version', streaming: true });
    expect(f.getObject).not.toHaveBeenCalled();
    const attachment = files.find(file => file.path === 'artifacts/data.bin')!;
    expect(attachment.content).toBeInstanceOf(Readable);
    const bytes = Buffer.concat(await (attachment.content as Readable).toArray());
    expect(bytes.toString()).toBe('part onepart two');
    expect(f.getObject).toHaveBeenCalledTimes(1);
    expect(f.body.destroyed).toBe(true);
    expect(files.find(file => file.path === 'research-record.json')!.content).toBeInstanceOf(Buffer);
  });

  it('does not open storage on denied access or abandoned unread files', async () => {
    const f = fixture();
    await expect(buildExportPackage(f.deps, { userId: 'outsider', versionId: 'version', streaming: true }))
      .rejects.toMatchObject({ code: 'RESEARCH_OBJECT_NOT_FOUND' });
    expect(f.getObject).not.toHaveBeenCalled();
    const files = await buildExportPackage(f.deps, { userId: f.user.id, versionId: 'version', streaming: true });
    for (const file of files) if (file.content instanceof Readable) file.content.destroy();
    await new Promise(resolve => setImmediate(resolve));
    expect(f.getObject).not.toHaveBeenCalled();
  });

  it('preserves buffered callers and propagates object failures through the stream', async () => {
    const f = fixture();
    const buffered = await buildExportPackage(f.deps, { userId: f.user.id, versionId: 'version' });
    expect(buffered.every(file => Buffer.isBuffer(file.content))).toBe(true);
    expect(buffered.find(file => file.path === 'artifacts/data.bin')!.content.toString()).toBe('part onepart two');
    const failed = fixture();
    failed.getObject.mockRejectedValue(new Error('synthetic object unavailable'));
    const files = await buildExportPackage(failed.deps, { userId: failed.user.id, versionId: 'version', streaming: true });
    const attachment = files.find(file => file.path === 'artifacts/data.bin')!;
    await expect((attachment.content as Readable).toArray()).rejects.toThrow('synthetic object unavailable');
  });

  it('closes a late object response immediately when cancellation happened during getObject', async () => {
    const f = fixture();
    let resolveObject!: (value: { body: Readable; size: number }) => void;
    f.getObject.mockImplementation(() => new Promise(resolve => { resolveObject = resolve; }));
    const files = await buildExportPackage(f.deps, { userId: f.user.id, versionId: 'version', streaming: true });
    const stream = files.find(file => file.path === 'artifacts/data.bin')!.content as Readable;
    stream.read();
    await new Promise(resolve => setImmediate(resolve));
    stream.destroy();
    resolveObject({ body: f.body, size: 16 });
    await new Promise(resolve => setImmediate(resolve));
    expect(f.body.destroyed).toBe(true);
  });

  it('closes an opened object while a body read is still waiting', async () => {
    const f = fixture();
    const waitingBody = new Readable({ read() {} });
    f.getObject.mockResolvedValue({ body: waitingBody, size: 16 });
    const files = await buildExportPackage(f.deps, { userId: f.user.id, versionId: 'version', streaming: true });
    const stream = files.find(file => file.path === 'artifacts/data.bin')!.content as Readable;
    stream.read();
    await new Promise(resolve => setImmediate(resolve));
    stream.destroy();
    expect(waitingBody.destroyed).toBe(true);
  });
});
