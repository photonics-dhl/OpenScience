import Fastify from 'fastify';
import { getBlobStorageKey } from '@openscience/storage';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { createSession } from '@openscience/auth';
import { createFakePrisma, seedUser } from '@openscience/domain/test-helpers';
import { buildExportPackage, confirmIngestionTask, createCommit, persistDocumentSourceMapReference } from '@openscience/domain';
import type { StorageAdapter } from '@openscience/storage';
import { buildApp } from '../src/app';
import { createFakeMailer, createFakeRedis } from './helpers/fakes';

const RO = '00000000-0000-4000-8000-000000000101';
const ARTIFACT = '00000000-0000-4000-8000-000000000102';
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });
async function fixture() {
  const { prisma, db } = createFakePrisma();
  const user = seedUser(db);
  const redis = createFakeRedis();
  const objects = new Map<string, Buffer>();
  const storage: StorageAdapter = {
    putObject: async (key, body) => { const bytes = Buffer.isBuffer(body) ? body : Buffer.concat(await (body as Readable).toArray()); objects.set(key, bytes); return { key, size: bytes.length, etag: 'test' }; },
    getObject: async key => { const bytes = objects.get(key); if (!bytes) throw new Error('unavailable'); return { body: Readable.from([bytes]), size: bytes.length }; },
    headObject: async key => objects.has(key) ? { size: objects.get(key)!.length, etag: 'test' } : null,
    deleteObject: async key => { objects.delete(key); },
  };
  const app = await buildApp({ prisma, redis, mailer: createFakeMailer(), cookieSecret: 'test-secret', secureCookies: false, storage });
  apps.push(app);
  const cookies = { openscience_session: await createSession(redis, { userId: user.id, status: 'email_verified' }) };
  db.workspaces.push({ id: 'workspace', name: 'Study', type: 'team', status: 'active', ownerId: user.id });
  db.memberships.push({ id: 'member', workspaceId: 'workspace', userId: user.id, role: 'author' });
  db.researchObjects.push({ id: RO, workspaceId: 'workspace', title: 'Frozen title', version: 1, status: 'draft', visibility: 'private' });
  db.authors.push({id:'platform-author',researchObjectId:RO,userId:user.id,sortOrder:0,isCorresponding:true,affiliation:'Recorded affiliation'});
  db.licenseAssignments.push({id:'license',researchObjectId:RO,versionId:null,licenseType:'text',licenseId:'CC-BY-4.0'});
  const original = Buffer.from('Original source passage.');
  const hash = createHash('sha256').update(original).digest('hex');
  objects.set(getBlobStorageKey(hash), original);
  db.artifacts.push({ id: ARTIFACT, workspaceId: 'workspace', logicalPath: 'source.txt', blobSha256: hash, size: BigInt(original.length), mimeType: 'text/plain' });
  const core = { schemaVersion: '0.1.0', problem: 'Source statement', insight: '', method: '', results: '', limitations: '', reproducibility: '' };
  db.sdfDocuments.push({ id: 'sdf', researchObjectId: RO, coreJson: core });
  for (const nodeType of Object.keys(core).filter(key => key !== 'schemaVersion')) db.sdfNodes.push({ id: nodeType, sdfDocumentId: 'sdf', nodeType, content: '' });
  const ref = await persistDocumentSourceMapReference(storage, { artifactId: ARTIFACT, contentHash: hash, parser: {name:'fixture', version:'1'},
    pages: [{ page: 1, width: 600, height: 800, blocks: [{ id: 'block', kind: 'paragraph', text: original.toString(), boundingBox: {x:0,y:0,width:100,height:20}, parser:{name:'fixture',version:'1'}, transformations:[] }] }] }, 'succeeded');
  db.agentTasks.push({ id: 'extract', result: { core, evidence: { problem: {quote:original.toString()} }, sourceMapRef: ref } });
  db.ingestionBatches.push({ id: 'batch', userId: user.id, researchObjectId: RO });
  db.ingestionTasks.push({ id: 'task', batchId: 'batch', artifactId: ARTIFACT, agentTaskId:'extract', state:'needs_review', retryCount:0, updatedAt:new Date() });
  const deps = { prisma, redis, storage };
  const confirmed = await confirmIngestionTask(deps, { userId:user.id, taskId:'task', version:1, core });
  const versionId = confirmed.confirmation.versionId;
  return { app, db, deps, user, cookies, ref, objects, core, versionId, url: `/research-objects/${RO}/versions/${versionId}/record` };
}

describe('frozen research record real HTTP routes', () => {
  it('captures the completed ingestion graph atomically and serves exactly the same fixed record in export', async () => {
    const f = await fixture();
    const response = await f.app.inject({method:'GET', url:f.url, cookies:f.cookies});
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    const record = response.json().record;
    expect(record).toMatchObject({schemaVersion:'1.0.0', recordState:'recorded', objectId:RO, versionId:f.versionId, sdf:f.core, collections:{complete:true,pagination:'none'}});
    expect(record.claims).toHaveLength(1);
    expect(record.evidence).toHaveLength(1);
    expect(record.evidence[0]).toMatchObject({verified:false, extractionStatus:'needs_review', source:{state:'recorded'}});
    expect(record.identity.originalAuthors).toEqual({state:'not_recorded',items:[]});
    expect(response.body).not.toMatch(/sourceMapRef|objectKey|derived\/source-maps/);
    const exported = await f.app.inject({method:'GET', url:`${f.url}/export`, cookies:f.cookies});
    expect(exported.json()).toEqual(record);
    expect(exported.headers['content-disposition']).toContain(f.versionId);
    const zipFiles = await buildExportPackage(f.deps, {userId:f.user.id, versionId:f.versionId});
    expect(JSON.parse(zipFiles.find(file => file.path === 'research-record.json')!.content.toString())).toEqual(record);
  });
  it('draft edits, title edits and a later commit cannot change the frozen version or source locator', async () => {
    const f = await fixture();
    const first = await f.app.inject({method:'GET', url:f.url, cookies:f.cookies});
    const claim = f.db.claimNodes[0];
    const edited = await f.app.inject({method:'PATCH',url:`/research-objects/${RO}/versions/${f.versionId}/claims/${claim.id}`,cookies:f.cookies,
      payload:{expectedUpdatedAt:claim.updatedAt.toISOString(),patch:{statement:'Later draft wording'}}});
    expect(edited.statusCode).toBe(200);
    f.db.researchObjects[0].title = 'Later title';
    f.db.authors[0].affiliation = 'Later affiliation';
    f.db.licenseAssignments[0].licenseId = 'Changed license';
    f.db.evidenceRecords[0].locator = { ...f.db.evidenceRecords[0].locator, page:99,blockId:'moved' };
    f.db.evidenceRecords[0].provenance.sourceMapRef = null;
    f.db.agentTasks[0].result = {};
    const source = await f.app.inject({method:'GET',url:`${f.url}/evidence/${f.db.evidenceRecords[0].id}/source`,cookies:f.cookies});
    expect(source.statusCode).toBe(200);
    expect(source.json().source).toMatchObject({text:'Original source passage.',page:1});
    expect(source.body).not.toMatch(/sourceMapRef|objectKey/);
    await createCommit(f.deps,{researchObjectId:RO,userId:f.user.id,version:2,message:'New version',sdfCore:{...f.core,problem:'New'},artifacts:[{artifactId:ARTIFACT,logicalPath:'source.txt'}]});
    const later = await f.app.inject({method:'GET',url:f.url,cookies:f.cookies});
    expect(later.body).toBe(first.body);
  });
  it('inherits source identity only from the explicit parent version on an ordinary commit', async () => {
    const f = await fixture();
    const sourceIdentity = { schemaVersion: '0.1.0', reviewed: true,
      title: { state: 'recorded', value: 'Source paper', evidenceSegments: [{ quote: 'Original source passage.', sourceLocator: {
        artifactId: ARTIFACT, contentHash: f.db.artifacts[0].blobSha256, page: 1, blockId: 'block', charRange: { start: 0, end: 24 },
        boundingBox: { x: 0, y: 0, width: 100, height: 20 },
      } }] },
      authors: { state: 'not_recorded', value: [], evidenceSegments: [] }, doi: { state: 'not_recorded', value: '', evidenceSegments: [] },
      articleLicense: { state: 'not_recorded', value: '', evidenceSegments: [] } };
    (f.db.versions[0].researchRecord as { dto: { identity: Record<string, unknown> } }).dto.identity.source = sourceIdentity;
    f.db.agentTasks[0].result = { sourceIdentity: { title: 'untrusted later task' } };
    const next = await createCommit(f.deps, { researchObjectId: RO, userId: f.user.id, version: 2, message: 'Continue explicit parent',
      sdfCore: { ...f.core, problem: 'Continued' }, artifacts: [{ artifactId: ARTIFACT, logicalPath: 'source.txt' }] });
    const record = (await f.app.inject({ method: 'GET', url: f.url.replace(f.versionId, next.versionId), cookies: f.cookies })).json().record;
    expect(record.schemaVersion).toBe('1.1.0');
    expect(record.identity.source).toEqual(sourceIdentity);
  });
  it('clears inherited source identity when its PDF is removed from the target manifest', async () => {
    const f = await fixture();
    const sourceIdentity = { schemaVersion: '0.1.0', reviewed: true,
      title: { state: 'recorded', value: 'Removed paper', evidenceSegments: [{ quote: 'Original source passage.', sourceLocator: {
        artifactId: ARTIFACT, contentHash: f.db.artifacts[0].blobSha256, page: 1, blockId: 'block', charRange: { start: 0, end: 24 },
        boundingBox: { x: 0, y: 0, width: 100, height: 20 },
      } }] },
      authors: { state: 'not_recorded', value: [], evidenceSegments: [] }, doi: { state: 'not_recorded', value: '', evidenceSegments: [] },
      articleLicense: { state: 'not_recorded', value: '', evidenceSegments: [] } };
    (f.db.versions[0].researchRecord as { dto: { identity: Record<string, unknown> } }).dto.identity.source = sourceIdentity;
    const previous = JSON.stringify(f.db.versions[0].researchRecord);
    const next = await createCommit(f.deps, { researchObjectId: RO, userId: f.user.id, version: 2,
      message: 'Remove source PDF', sdfCore: f.core, artifacts: [] });
    const record = (await f.app.inject({ method: 'GET', url: f.url.replace(f.versionId, next.versionId), cookies: f.cookies })).json().record;
    expect(record.schemaVersion).toBe('1.0.0');
    expect(record.identity).not.toHaveProperty('source');
    expect(JSON.stringify(f.db.versions[0].researchRecord)).toBe(previous);
  });
  it('anonymous latest selects only published versions and rejects private/foreign versions and revoked access', async () => {
    const f = await fixture();
    for (const url of [f.url, f.url.replace(f.versionId,'latest')]) expect((await f.app.inject({method:'GET',url})).statusCode).toBe(404);
    f.db.researchObjects[0].visibility = 'public';
    expect((await f.app.inject({method:'GET',url:f.url})).statusCode).toBe(404);
    f.db.versions[0].status = 'published';
    f.db.publications.push({id:'pub',versionId:f.versionId});
    const newer = await createCommit(f.deps,{researchObjectId:RO,userId:f.user.id,version:2,message:'Private followup',sdfCore:f.core,artifacts:[]});
    const latest = await f.app.inject({method:'GET',url:f.url.replace(f.versionId,'latest')});
    expect(latest.statusCode).toBe(200);
    expect(latest.json().record.versionId).toBe(f.versionId);
    expect((await f.app.inject({method:'GET',url:f.url.replace(f.versionId,newer.versionId)})).statusCode).toBe(404);
    expect((await f.app.inject({method:'GET',url:f.url.replace(RO,'00000000-0000-4000-8000-000000000999'),cookies:f.cookies})).statusCode).toBe(404);
    f.db.researchObjects[0].visibility='private'; f.db.memberships.length=0;
    expect((await f.app.inject({method:'GET',url:f.url,cookies:f.cookies})).statusCode).toBe(404);
  });
  it('legacy not_recorded never reads the mutable graph or backfills and missing frozen sources fail closed', async () => {
    const f = await fixture();
    f.objects.delete(f.ref.objectKey);
    const missing = await f.app.inject({method:'GET',url:`${f.url}/evidence/${f.db.evidenceRecords[0].id}/source`,cookies:f.cookies});
    expect(missing.statusCode).toBe(503);
    expect(missing.json().error.code).toBe('SOURCE_UNAVAILABLE');
    f.db.versions[0].researchRecord=null;
    const claims = vi.spyOn(f.deps.prisma.claimNode,'findMany');
    const writes = vi.spyOn(f.deps.prisma.version,'update');
    const legacy = await f.app.inject({method:'GET',url:f.url,cookies:f.cookies});
    expect(legacy.json().record).toMatchObject({recordState:'not_recorded',claims:[],evidence:[],sdf:f.core,citation:{title:null}});
    expect(claims).not.toHaveBeenCalled(); expect(writes).not.toHaveBeenCalled();
  });
  it('captures only the selected branch predecessor and does not inherit verified claims', async () => {
    const f = await fixture();
    const original = f.db.claimNodes[0];
    original.statement = 'Selected branch statement'; original.assessment = 'supported';
    f.db.evidenceRecords[0].verifiedByUserId = f.user.id;
    f.db.branches.push({ id: 'other-branch', researchObjectId: RO, name: 'other', headCommitId: null });
    f.db.commits.push({ id: 'other-commit', researchObjectId: RO, branchId:'other-branch', createdAt: new Date(Date.now()+5000) });
    f.db.versions.push({ id:'other-version', researchObjectId:RO,commitId:'other-commit',versionNo:99,status:'draft',createdAt:new Date() });
    f.db.claimNodes.push({...original,id:'other-claim',versionId:'other-version',statement:'Different branch'});
    const next=await createCommit(f.deps,{researchObjectId:RO,userId:f.user.id,version:2,message:'Branch snapshot',sdfCore:{...f.core, extension:'Preserved extension'},artifacts:[{artifactId:ARTIFACT,logicalPath:'source.txt'}]});
    const response=await f.app.inject({method:'GET',url:f.url.replace(f.versionId,next.versionId),cookies:f.cookies});
    expect(response.statusCode).toBe(200);
    expect(response.json().record.claims).toHaveLength(1);
    expect(response.json().record.claims[0]).toMatchObject({statement:'Selected branch statement',assessment:'missing',extractionStatus:'needs_review'});
    expect(response.json().record.evidence[0].verified).toBe(false);
    expect(response.json().record.sdf.extension).toBe('Preserved extension');
  });
  it.each([false, true])('keeps a scoped editable graph through consecutive commits (edit v2: %s)', async editV2 => {
    const f = await fixture();
    const root = f.db.claimNodes[0];
    await f.deps.prisma.claimNode.create({ data: { researchObjectId: RO, versionId: f.versionId,
      parentClaimId: root.id, kind: 'supporting', statement: 'Child statement', assessment: 'missing',
      extractionStatus: 'needs_review', provenance: { source: 'human' } } });
    const v2 = await createCommit(f.deps, {researchObjectId:RO,userId:f.user.id,version:2,message:'Version two',sdfCore:f.core,artifacts:[{artifactId:ARTIFACT,logicalPath:'source.txt'}]});
    const v2Claims = f.db.claimNodes.filter(c => c.versionId === v2.versionId);
    expect(v2Claims).toHaveLength(2);
    const v2Root = v2Claims.find(c => c.kind === 'core')!;
    expect(v2Root.id).not.toBe(root.id);
    expect(v2Claims.find(c => c.kind === 'supporting')!.parentClaimId).toBe(v2Root.id);
    const v2Evidence = f.db.evidenceRecords.find(e => e.versionId === v2.versionId)!;
    expect(v2Evidence.claimId).toBe(v2Root.id);
    expect(v2Evidence.id).not.toBe(f.db.evidenceRecords[0].id);
    const v2Url = f.url.replace(f.versionId, v2.versionId);
    const v2Before = await f.app.inject({method:'GET',url:v2Url,cookies:f.cookies});
    if (editV2) {
      const edit = await f.app.inject({method:'PATCH',url:`/research-objects/${RO}/versions/${v2.versionId}/claims/${v2Root.id}`,cookies:f.cookies,
        payload:{expectedUpdatedAt:v2Root.updatedAt.toISOString(),patch:{statement:'Edited in version two'}}});
      expect(edit.statusCode).toBe(200);
    }
    for (const commit of f.db.commits) commit.createdAt = new Date('2026-09-07T00:00:00.000Z');
    const v3 = await createCommit(f.deps, {researchObjectId:RO,userId:f.user.id,version:3,message:'Version three',sdfCore:f.core,artifacts:[{artifactId:ARTIFACT,logicalPath:'source.txt'}]});
    expect(f.db.commits.find(c => c.id === v3.commitId).parentCommitId).toBe(v2.commitId);
    const v3Response = await f.app.inject({method:'GET',url:f.url.replace(f.versionId,v3.versionId),cookies:f.cookies});
    const record = v3Response.json().record;
    expect(record.claims).toHaveLength(2);
    const v3Root = record.claims.find((c: {kind:string}) => c.kind === 'core');
    expect(v3Root).toMatchObject({statement:editV2 ? 'Edited in version two' : 'Source statement'});
    expect(v3Root.id).not.toBe(v2Root.id);
    expect(record.claims.find((c: {kind:string}) => c.kind === 'supporting').parentClaimId).toBe(v3Root.id);
    expect(record.evidence).toHaveLength(1);
    expect(record.evidence[0].claimId).toBe(v3Root.id);
    expect(record.evidence[0].id).not.toBe(v2Evidence.id);
    expect(f.db.claimNodes.filter(c => c.versionId === v3.versionId)).toHaveLength(2);
    const source = await f.app.inject({method:'GET',url:record.evidence[0].source.url.replace(/^\/api/,''),cookies:f.cookies});
    expect(source.statusCode).toBe(200);
    expect(source.json().source.text).toBe('Original source passage.');
    expect((await f.app.inject({method:'GET',url:v2Url,cookies:f.cookies})).body).toBe(v2Before.body);
  });
  it('does not resurrect intentionally deleted working rows from a frozen predecessor', async () => {
    const f = await fixture();
    const v2 = await createCommit(f.deps, {researchObjectId:RO,userId:f.user.id,version:2,message:'Version two',sdfCore:f.core,artifacts:[{artifactId:ARTIFACT,logicalPath:'source.txt'}]});
    expect(f.db.claimNodes.filter(c => c.versionId === v2.versionId)).toHaveLength(1);
    // Model the committed result of an intentional graph deletion; retain the fixed v2 record.
    f.db.evidenceRecords = f.db.evidenceRecords.filter(e => e.versionId !== v2.versionId);
    f.db.claimNodes = f.db.claimNodes.filter(c => c.versionId !== v2.versionId);
    for (const commit of f.db.commits) commit.createdAt = new Date('2026-09-07T00:00:00.000Z');
    const v3 = await createCommit(f.deps, {researchObjectId:RO,userId:f.user.id,version:3,message:'Preserve deliberate deletion',sdfCore:f.core,artifacts:[{artifactId:ARTIFACT,logicalPath:'source.txt'}]});
    const response = await f.app.inject({method:'GET',url:f.url.replace(f.versionId,v3.versionId),cookies:f.cookies});
    expect(response.json().record).toMatchObject({claims:[],evidence:[]});
    expect(f.db.claimNodes.filter(c => c.versionId === v3.versionId)).toHaveLength(0);
    expect((await f.app.inject({method:'GET',url:f.url.replace(f.versionId,v2.versionId),cookies:f.cookies})).json().record.claims).toHaveLength(1);
  });
  it('uses an empty branch anchor once, then its own latest logical version despite tied clocks', async () => {
    const f = await fixture();
    const anchor = f.db.commits[0].id;
    f.db.branches.push({id:'feature',researchObjectId:RO,name:'feature',headCommitId:anchor,isDefault:false});
    const feature = await createCommit(f.deps,{researchObjectId:RO,userId:f.user.id,version:2,branchId:'feature',message:'Feature first',sdfCore:f.core,artifacts:[{artifactId:ARTIFACT,logicalPath:'source.txt'}]});
    expect(f.db.commits.find(c => c.id === feature.commitId).parentCommitId).toBe(anchor);
    const claim = f.db.claimNodes.find(c => c.versionId === feature.versionId)!;
    const edited = await f.app.inject({method:'PATCH',url:`/research-objects/${RO}/versions/${feature.versionId}/claims/${claim.id}`,cookies:f.cookies,
      payload:{expectedUpdatedAt:claim.updatedAt.toISOString(),patch:{statement:'Feature work'}}});
    expect(edited.statusCode).toBe(200);
    await createCommit(f.deps,{researchObjectId:RO,userId:f.user.id,version:3,message:'Main advances separately',sdfCore:f.core,artifacts:[{artifactId:ARTIFACT,logicalPath:'source.txt'}]});
    for (const commit of f.db.commits) commit.createdAt = new Date('2026-09-07T00:00:00.000Z');
    const next = await createCommit(f.deps,{researchObjectId:RO,userId:f.user.id,version:4,branchId:'feature',message:'Feature second',sdfCore:f.core,artifacts:[{artifactId:ARTIFACT,logicalPath:'source.txt'}]});
    expect(f.db.commits.find(c => c.id === next.commitId).parentCommitId).toBe(feature.commitId);
    expect(f.db.claimNodes.find(c => c.versionId === next.versionId)?.statement).toBe('Feature work');
  });
  it('publishes discoverable machine schema and OpenAPI contracts', async () => {
    const f=await fixture();
    const schema=await f.app.inject({method:'GET',url:'/research-record/schema'});
    const openapi=await f.app.inject({method:'GET',url:'/research-record/openapi'});
    expect(schema.statusCode).toBe(200); expect(openapi.statusCode).toBe(200);
    expect(schema.json().required).toContain('collections');
    expect(Object.keys(openapi.json().paths)).toHaveLength(3);
    const validator = Fastify();
    validator.post('/validate', { schema: { body: schema.json() } }, async () => ({ valid: true }));
    const record=(await f.app.inject({method:'GET',url:f.url,cookies:f.cookies})).json().record;
    const validation = await validator.inject({method:'POST',url:'/validate',payload:record});
    await validator.close();
    expect(validation.statusCode, validation.body).toBe(200);
  });
});
