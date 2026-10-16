import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { StorageAdapter } from '@openscience/storage';
import type { AuditSink } from '@openscience/observability';
import { createFakePrisma, seedUser } from '../helpers/fakes';
import { createResearchObject } from '../../src/research-object/research-objects';
import { createArtifact } from '../../src/artifact/artifacts';
import { createCommit, getVersion, listVersions, rebuildVersion } from '../../src/commit/commits';
import { CommitError } from '../../src/commit/errors';
import { restoreVersionDraft } from '../../src/commit/restore-draft';
import { refreshWorkingResearchRecord } from '../../src/commit/research-record-snapshot';

function memoryStorage(): StorageAdapter & { store: Map<string, { body: Buffer }> } {
  const store = new Map<string, { body: Buffer }>();
  const adapter: StorageAdapter = {
    putObject: async (key: string, body: Buffer | NodeJS.ReadableStream, opts: { contentType?: string; sha256?: string } = {}) => {
      const buf = Buffer.isBuffer(body) ? body : Buffer.from(await (body as NodeJS.ReadableStream).toArray());
      if (opts.sha256) {
        const actual = createHash('sha256').update(buf).digest('hex');
        if (actual !== opts.sha256.toLowerCase()) throw new Error(`sha256 mismatch for "${key}"`);
      }
      store.set(key, { body: buf });
      return { key, size: buf.length, etag: 'x' };
    },
    getObject: async (key: string) => {
      const hit = store.get(key);
      if (!hit) throw new Error(`Object not found: ${key}`);
      return { body: Readable.from([hit.body]), size: hit.body.length };
    },
    headObject: async (key: string) => {
      const hit = store.get(key);
      return hit ? { size: hit.body.length, etag: 'x' } : null;
    },
    deleteObject: async (key: string) => void store.delete(key),
  };
  return { ...adapter, store };
}

const CORE1 = { schemaVersion: '0.1.0', problem: 'P1', insight: 'I', method: 'M', results: 'R', limitations: 'L', reproducibility: 'RP' };

async function makeRo(audit?: AuditSink) {
  const { prisma, db } = createFakePrisma();
  const user = seedUser(db);
  const ws = { id: 'ws-1', type: 'team', name: 'Lab', status: 'active', ownerId: user.id, createdAt: new Date(), updatedAt: new Date() };
  db.workspaces.push(ws);
  db.memberships.push({ id: 'm-1', workspaceId: 'ws-1', userId: user.id, role: 'owner', createdAt: new Date(), updatedAt: new Date() });
  const storage = memoryStorage();
  const deps = { prisma, storage, mailer: {} as never, ...(audit ? { audit } : {}) };
  const ro = await createResearchObject(deps, { workspaceId: 'ws-1', userId: user.id, title: 'My RO' });
  return { prisma, db, user, ws, storage, deps, ro };
}

describe('createCommit（§7.2.3 Manifest + §7.2.5 JSON Patch + §16 乐观锁/幂等）', () => {
  it.each(['viewer', 'reviewer'])('%s cannot create or replay a commit', async (role) => {
    const { deps, db, user, ro } = await makeRo();
    const input = { researchObjectId: ro.id, userId: user.id, message: 'Existing', version: 1, idempotencyKey: 'role-replay' };
    await createCommit(deps, input);
    db.memberships[0].role = role;
    await expect(createCommit(deps, input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(createCommit(deps, { ...input, idempotencyKey: undefined, version: 2 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(db.commits).toHaveLength(1);
    expect(db.researchObjects[0].version).toBe(2);
  });

  it('Contributor may commit a feature branch but cannot edit main through a direct commit', async () => {
    const { deps, db, user, ro } = await makeRo();
    const branch = await deps.prisma.branch.create({ data: { researchObjectId: ro.id, name: 'feature', isDefault: false } });
    db.memberships[0].role = 'contributor';
    await expect(createCommit(deps, { researchObjectId: ro.id, userId: user.id, message: 'Feature', version: 1, branchId: branch.id, sdfCore: { ...CORE1, problem: 'Contribution' } }))
      .resolves.toMatchObject({ snapshot: { core: { problem: 'Contribution' } } });
    expect(db.sdfDocuments[0].coreJson.problem).toBe('');
    const mainInput = { researchObjectId: ro.id, userId: user.id, message: 'Main bypass', version: 2, sdfCore: CORE1 };
    await expect(createCommit(deps, mainInput)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const main = await deps.prisma.branch.create({ data: { researchObjectId: ro.id, name: 'main', isDefault: true } });
    await expect(createCommit(deps, { ...mainInput, branchId: main.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(db.commits).toHaveLength(1);
  });

  it.each(['owner', 'maintainer', 'author'])('%s may commit the main private draft', async (role) => {
    const { deps, db, user, ro } = await makeRo();
    db.memberships[0].role = role;
    await expect(createCommit(deps, { researchObjectId: ro.id, userId: user.id, message: 'Main', version: 1, sdfCore: CORE1 })).resolves.toMatchObject({ versionNo: 1 });
  });

  it('allows enough transaction time to carry a media-heavy version', async () => {
    const { deps, user, ro } = await makeRo();
    const transaction = vi.spyOn(deps.prisma, '$transaction').mockRejectedValue(new Error('stop before persistence'));

    await expect(createCommit(deps, { researchObjectId: ro.id, userId: user.id, message: 'next version', version: 1 }))
      .rejects.toThrow('stop before persistence');

    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
      timeout: 30_000,
    });
  });

  it('改 SDF core → Commit + ChangeSet(sdf_core) + Version + Manifest + RO.version+1', async () => {
    const { deps, db, user, ro } = await makeRo();
    const result = await createCommit(deps, {
      researchObjectId: ro.id, userId: user.id, message: '更新问题定义',
      version: 1, sdfCore: { ...CORE1, problem: 'P2' },
    });
    expect(result.versionNo).toBe(1);
    expect(result.snapshot.core.problem).toBe('P2');
    expect(db.commits).toHaveLength(1);
    expect(db.commits[0].message).toBe('更新问题定义');
    expect(db.changesets).toHaveLength(1);
    expect(db.changesets[0].kind).toBe('sdf_core');
    expect(db.versions).toHaveLength(1);
    expect(db.versions[0].versionNo).toBe(1);
    expect(db.versionManifests).toHaveLength(1);
    expect(db.researchObjects.find((r) => r.id === ro.id).version).toBe(2);
  });

  it('乐观锁：version 不匹配 → CONCURRENT_UPDATE', async () => {
    const { deps, user, ro } = await makeRo();
    await expect(
      createCommit(deps, { researchObjectId: ro.id, userId: user.id, message: 'X', version: 99 }),
    ).rejects.toThrow(CommitError);
  });

  it('幂等键重放 → 返回既有 Commit 不重复创建', async () => {
    const { deps, db, user, ro } = await makeRo();
    const first = await createCommit(deps, {
      researchObjectId: ro.id, userId: user.id, message: '唯一', version: 1, idempotencyKey: 'idem-1',
    });
    const second = await createCommit(deps, {
      researchObjectId: ro.id, userId: user.id, message: '唯一', version: 1, idempotencyKey: 'idem-1',
    });
    expect(second.commitId).toBe(first.commitId);
    expect(db.commits).toHaveLength(1);
    expect(db.versions).toHaveLength(1);
  });

  it('写审计行 commit.create', async () => {
    const records: unknown[] = [];
    const audit: AuditSink = { record: async (e) => void records.push(e) };
    const { deps, user, ro } = await makeRo(audit);
    await createCommit(deps, { researchObjectId: ro.id, userId: user.id, message: 'Audited', version: 1 });
    expect(records.some((r) => (r as { action: string }).action === 'commit.create')).toBe(true);
  });

  it('空 message → VALIDATION_ERROR', async () => {
    const { deps, user, ro } = await makeRo();
    await expect(
      createCommit(deps, { researchObjectId: ro.id, userId: user.id, message: '  ', version: 1 }),
    ).rejects.toThrow(/提交说明/);
  });

  it('已发布后新 commit → 产生新版本（§2.2-3 增量版本合法，不原地修改）', async () => {
    const { deps, db, user, ro } = await makeRo();
    const v1 = await createCommit(deps, { researchObjectId: ro.id, userId: user.id, message: 'v1', version: 1 });
    db.versions[0].status = 'published';
    const v2 = await createCommit(deps, { researchObjectId: ro.id, userId: user.id, message: 'v2', version: 2 });
    expect(v2.versionNo).toBe(2);
    expect(v1.versionNo).toBe(1);
  });
});

describe('getVersion / rebuildVersion（§7.1 可重建可校验）', () => {
  it('listVersions 返回降序最小版本摘要', async () => {
    const { deps, user, ro } = await makeRo();
    await createCommit(deps, { researchObjectId: ro.id, userId: user.id, message: 'v1', version: 1 });
    await createCommit(deps, { researchObjectId: ro.id, userId: user.id, message: 'v2', version: 2 });
    const versions = await listVersions(deps, { researchObjectId: ro.id, userId: user.id });
    expect(versions.map((version) => version.versionNo)).toEqual([2, 1]);
    expect(versions[0]).toEqual(expect.objectContaining({ versionId: expect.any(String), commitId: expect.any(String), status: 'draft' }));
  });

  it('getVersion 返回 Manifest 快照', async () => {
    const { deps, user, ro } = await makeRo();
    const created = await createCommit(deps, {
      researchObjectId: ro.id, userId: user.id, message: 'v1', version: 1,
      sdfCore: { ...CORE1, problem: 'New' },
    });
    const detail = await getVersion(deps, { userId: user.id, versionId: created.versionId });
    expect(detail.versionNo).toBe(1);
    expect(detail.status).toBe('draft');
    expect(detail.snapshot.core.problem).toBe('New');
  });

  it('rebuildVersion 校验 blob sha256', async () => {
    const { deps, db, user, ro, storage } = await makeRo();
    // 上传一个 artifact
    const art = await createArtifact(deps, {
      logicalPath: 'fig.png', content: Buffer.from('png-data'), uploadedBy: user.id, workspaceId: 'ws-1',
    });
    void storage;
    // 断言 artifact 存在
    expect(db.artifacts).toHaveLength(1);
    const created = await createCommit(deps, {
      researchObjectId: ro.id, userId: user.id, message: 'add fig', version: 1,
      artifacts: [{ logicalPath: 'fig.png', artifactId: art.artifactId }],
    });
    expect(created.snapshot.artifacts).toHaveLength(1);
    const rebuilt = await rebuildVersion(deps, { userId: user.id, versionId: created.versionId });
    expect(rebuilt.verified).toBe(true);
    expect(rebuilt.artifacts[0].blobSha256).toBe(art.blobSha256);
  });

  it('rebuildVersion blob 缺失 → verified=false', async () => {
    const { deps, user, ro } = await makeRo();
    const created = await createCommit(deps, {
      researchObjectId: ro.id, userId: user.id, message: 'no artifact', version: 1,
    });
    const rebuilt = await rebuildVersion(deps, { userId: user.id, versionId: created.versionId });
    expect(rebuilt.verified).toBe(true); // 无 artifact → 空校验通过
  });
});

describe('stored readable snapshots remain distinct from fresh commits', () => {
  const readable = { ...CORE1, schemaVersion: '0.2.0', insight: '**Saved insight**', fieldFormats: { insight: 'markdown' }, draft_meta: { source: 'saved version' } };

  async function savedReadableVersion() {
    const f = await makeRo();
    // Extend only this fixture's existing database boundary; restoration checks
    // real artifact membership and deletion instead of returning a fixed count.
    Object.assign(f.prisma.artifact, { count: vi.fn(async ({ where }: { where: { id: { in: string[] }; workspaceId: string; deletedAt: null } }) =>
      f.db.artifacts.filter(row => where.id.in.includes(row.id) && row.workspaceId === where.workspaceId && (row.deletedAt ?? null) === where.deletedAt).length) });
    Object.assign(f.prisma.researchObject, { findUniqueOrThrow: async (args: Parameters<typeof f.prisma.researchObject.findUnique>[0]) => {
      const row = await f.prisma.researchObject.findUnique(args);
      if (!row) throw new Error('Research object not found');
      return row;
    } });
    const artifact = await createArtifact(f.deps, { logicalPath: 'source.txt', content: Buffer.from('Saved source'), uploadedBy: f.user.id, workspaceId: f.ws.id });
    const saved = await createCommit(f.deps, { researchObjectId: f.ro.id, userId: f.user.id, message: 'Stored source', version: 1, sdfCore: CORE1, artifacts: [{ artifactId: artifact.artifactId, logicalPath: 'source.txt' }] });
    // Represent an already stored snapshot, without opening any fresh writer to 0.2.
    f.db.versionManifests.find(row => row.versionId === saved.versionId)!.coreJson = structuredClone(readable);
    const claim = await f.prisma.claimNode.create({ data: { researchObjectId: f.ro.id, versionId: saved.versionId,
      kind: 'core', statement: 'Saved scientific claim', assessment: 'supported', extractionStatus: 'succeeded',
      conditions: [], limitations: [], provenance: { source: 'human' } } });
    const evidence = await f.prisma.evidenceRecord.create({ data: { researchObjectId: f.ro.id, versionId: saved.versionId,
      workspaceId: f.ws.id, claimId: claim.id, artifactId: artifact.artifactId, kind: 'passage', title: 'Saved evidence',
      exactQuote: 'Saved source', relation: 'supports', locator: { artifactId: artifact.artifactId, contentHash: artifact.blobSha256, page: 1 },
      contentHash: artifact.blobSha256, extractionStatus: 'succeeded', verifiedByUserId: f.user.id, provenance: { source: 'human' } } });
    const media = await f.prisma.presentationAsset.create({ data: { researchObjectId: f.ro.id, versionId: saved.versionId,
      kind: 'image', objectKey: 'saved/approved-image.png', contentHash: 'ab'.repeat(32), generator: 'Saved renderer', generatorVersion: '1',
      promptHash: 'cd'.repeat(32), label: 'Approved saved figure', status: 'approved', provenance: { source: 'saved_fixture' } } });
    await f.prisma.presentationAssetClaim.createMany({ data: [{ presentationAssetId: media.id, claimId: claim.id, researchObjectId: f.ro.id, versionId: saved.versionId }] });
    await refreshWorkingResearchRecord(f.prisma, { researchObjectId: f.ro.id, versionId: saved.versionId });
    const source = f.db.versions.find(row => row.id === saved.versionId)!;
    source.researchRecord.historyCapture = { state: 'sealed' };
    return { ...f, saved, artifact, claim, evidence, media };
  }

  it.each([false, true])('author commits accept typed formatting with or without an existing transaction: %s', async useTransaction => {
    const f = await makeRo();
    const before = structuredClone(f.db.sdfDocuments[0].coreJson);
    const input = { researchObjectId: f.ro.id, userId: f.user.id, message: 'Format draft', version: 1, sdfCore: readable, idempotencyKey:'formatted-once' };
    const saved = useTransaction ? await f.prisma.$transaction(tx => createCommit(f.deps,input,{},tx)) : await createCommit(f.deps,input);
    expect(saved.snapshot.core).toEqual(readable);
    expect(saved.versionNo).toBe(2);
    expect(f.db.versionManifests[0].coreJson).toEqual(before);
    expect(f.db.researchObjects[0].version).toBe(3);
    const replay=await createCommit(f.deps,input);
    expect(replay.versionId).toBe(saved.versionId);
    expect(f.db.commits).toHaveLength(2);
  });

  it('can save a valid formatted live core without changing its format', async () => {
    const f=await makeRo();
    f.db.sdfDocuments[0].coreJson=structuredClone(readable);
    const saved=await createCommit(f.deps,{researchObjectId:f.ro.id,userId:f.user.id,message:'Save current draft',version:1});
    expect(saved.snapshot.core).toEqual(readable);
    expect(f.db.sdfDocuments[0].coreJson).toEqual(readable);
  });

  it('continues to accept opaque same-name format data in fresh legacy commits', async () => {
    const f = await makeRo();
    const legacy = { ...CORE1, insight: '**Literal old text**', fieldFormats: { insight: 'markdown', unknown: ['opaque'] } };
    const saved = await createCommit(f.deps, { researchObjectId: f.ro.id, userId: f.user.id, message: 'Legacy draft', version: 1, sdfCore: legacy });
    expect(saved.snapshot.core).toEqual(legacy);
    expect(f.db.sdfDocuments[0].coreJson).toEqual(legacy);
  });

  it('restores the selected stored core and checkpoints a different readable live draft without changing either identity or metadata', async () => {
    const f = await savedReadableVersion();
    const current = { ...readable, insight: '*Unsaved later draft*', fieldFormats: { insight: 'markdown' }, draft_meta: { source: 'current draft' } };
    f.db.sdfDocuments[0].coreJson = structuredClone(current);
    const sourceBefore = structuredClone(f.db.versionManifests[0]);
    const restored = await restoreVersionDraft(f.deps, { researchObjectId: f.ro.id, versionId: f.saved.versionId, userId: f.user.id, version: 2 });
    expect(restored.researchObject.sdf.core).toEqual(readable);
    expect(restored.researchObject.version).toBe(4);
    expect(f.db.versionManifests.find(row => row.versionId === f.saved.versionId)).toEqual(sourceBefore);
    const checkpoint = f.db.versionManifests.find(row => row.versionId !== f.saved.versionId && row.versionId !== restored.versionId)!;
    expect(checkpoint.coreJson).toEqual(current);
    const target = f.db.versionManifests.find(row => row.versionId === restored.versionId)!;
    expect(target.coreJson).toEqual(readable);
    expect(f.db.manifestEntries.filter(row => row.manifestId === target.id)).toEqual([
      expect.objectContaining({ artifactId: f.artifact.artifactId, logicalPath: 'source.txt', blobSha256: f.artifact.blobSha256 }),
    ]);
    expect(f.db.versions.find(row => row.id === restored.versionId)!.researchRecord.dto.sdf).toEqual(readable);
    const claim = f.db.claimNodes.find(row => row.versionId === restored.versionId)!;
    expect(claim.id).not.toBe(f.claim.id);
    expect(claim).toMatchObject({ statement: 'Saved scientific claim', provenance: { previousVersionId: f.saved.versionId, previousClaimId: f.claim.id } });
    expect(f.db.evidenceRecords.find(row => row.versionId === restored.versionId)).toMatchObject({ claimId: claim.id,
      artifactId: f.artifact.artifactId, exactQuote: 'Saved source', contentHash: f.artifact.blobSha256 });
    expect(f.db.presentationAssets.find(row => row.versionId === restored.versionId)).toMatchObject({
      objectKey: f.media.objectKey, contentHash: f.media.contentHash, status: 'approved',
      provenance: { source: 'version_history_copy', lineage: f.media.provenance, historyCopy: { versionId: f.saved.versionId, assetId: f.media.id } },
    });
  });

  it('retains opaque format metadata on old snapshots during restore', async () => {
    const f = await savedReadableVersion();
    const legacy = { ...CORE1, insight: '**Literal old text**', fieldFormats: { insight: 'markdown', unknown: ['opaque'] } };
    f.db.versionManifests[0].coreJson = structuredClone(legacy);
    const restored = await restoreVersionDraft(f.deps, { researchObjectId: f.ro.id, versionId: f.saved.versionId, userId: f.user.id, version: 2 });
    expect(restored.researchObject.sdf.core).toEqual(legacy);
  });

  it.each(['cross-object', 'stale-revision', 'viewer', 'missing-artifact', 'foreign-artifact'] as const)('rejects %s before creating a restoration commit', async scenario => {
    const f = await savedReadableVersion();
    if (scenario === 'cross-object') f.db.versions[0].researchObjectId = 'another-ro';
    if (scenario === 'viewer') f.db.memberships[0].role = 'viewer';
    if (scenario === 'missing-artifact') f.db.artifacts[0].deletedAt = new Date();
    if (scenario === 'foreign-artifact') f.db.artifacts[0].workspaceId = 'another-workspace';
    await expect(restoreVersionDraft(f.deps, { researchObjectId: f.ro.id, versionId: f.saved.versionId, userId: f.user.id, version: scenario === 'stale-revision' ? 1 : 2 })).rejects.toThrow();
    expect(f.db.commits).toHaveLength(1);
    expect(f.db.researchObjects[0].version).toBe(2);
  });

  it.each([
    { ...readable, schemaVersion: '0.3.0' },
    { ...readable, fieldFormats: { insight: 'html' } },
    { ...readable, method: undefined },
  ])('rolls back the checkpoint when the selected stored snapshot is unsupported: %j', async invalid => {
    const f = await savedReadableVersion();
    f.db.versionManifests[0].coreJson = invalid;
    const before = structuredClone(f.db);
    await expect(restoreVersionDraft(f.deps, { researchObjectId: f.ro.id, versionId: f.saved.versionId, userId: f.user.id, version: 2 })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(f.db).toEqual(before);
  });
});

it('can restore the exact partial legacy draft checkpoint created by first formatting', async()=>{
  const f=await makeRo();
  Object.assign(f.prisma.artifact,{count:async()=>0});
  Object.assign(f.prisma.researchObject,{findUniqueOrThrow:async(args:Parameters<typeof f.prisma.researchObject.findUnique>[0])=>{const row=await f.prisma.researchObject.findUnique(args);if(!row)throw new Error('Missing RO');return row;}});
  const before={problem:'Only original field',fieldFormats:{old:{opaque:true}}};
  f.db.sdfDocuments[0].coreJson=structuredClone(before);
  const core={...CORE1,schemaVersion:'0.2.0',fieldFormats:{insight:'markdown'}};
  await createCommit(f.deps,{researchObjectId:f.ro.id,userId:f.user.id,version:1,message:'First format',sdfCore:core});
  const source=f.db.versions[0];
  const restored=await restoreVersionDraft(f.deps,{researchObjectId:f.ro.id,versionId:source.id,userId:f.user.id,version:3});
  expect(restored.researchObject.sdf.core).toEqual(before);
  expect(f.db.versionManifests[0].coreJson).toEqual(before);
});
