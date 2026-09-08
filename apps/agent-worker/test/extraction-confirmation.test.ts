import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { AiGateway } from '@openscience/ai-gateway';
import { confirmIngestionTask, getIngestionTask, getResearchRecord, getResearchRecordSource, persistDocumentSourceMapReference, type DocumentSourceMap } from '@openscience/domain';
import { createFakePrisma, seedUser } from '@openscience/domain/test-helpers';
import { getBlobStorageKey, type StorageAdapter } from '@openscience/storage';
import { extractHandler } from '../src/extractor';

const RO = '00000000-0000-4000-8000-000000000201';
const ARTIFACT = '00000000-0000-4000-8000-000000000202';
async function extractedFixture(texts: string[], sourceBlockIds = ['B000001']) {
  const { prisma, db } = createFakePrisma();
  const user = seedUser(db);
  db.workspaces.push({ id:'workspace', type:'team', name:'Study', status:'active', ownerId:user.id });
  db.memberships.push({ id:'member', workspaceId:'workspace', userId:user.id, role:'author' });
  db.researchObjects.push({ id:RO,workspaceId:'workspace',title:'Canonical confirmation',version:1,status:'draft',visibility:'private' });
  const objects = new Map<string, Buffer>();
  const storage: StorageAdapter = {
    putObject: async (key,body) => { const bytes=Buffer.isBuffer(body)?body:Buffer.concat(await (body as Readable).toArray());objects.set(key,bytes);return {key,size:bytes.length,etag:'test'}; },
    getObject: async key => { const bytes=objects.get(key)!;return {body:Readable.from([bytes]),size:bytes.length}; },
    headObject: async key => objects.has(key)?{size:objects.get(key)!.length,etag:'test'}:null,
    deleteObject: async key => {objects.delete(key);},
  };
  const bytes=Buffer.from(texts.join('\n'));
  const contentHash=createHash('sha256').update(bytes).digest('hex');
  objects.set(getBlobStorageKey(contentHash),bytes);
  db.artifacts.push({id:ARTIFACT,workspaceId:'workspace',logicalPath:'source.txt',blobSha256:contentHash,size:BigInt(bytes.length)});
  const sourceMap: DocumentSourceMap = {artifactId:ARTIFACT,contentHash,parser:{name:'fixture',version:'1'},pages:[{
    page:1,width:600,height:800,blocks:texts.map((text,index)=>({id:`block${index}`,kind:'paragraph',text,
      boundingBox:{x:0,y:index*30,width:300,height:20},parser:{name:'fixture',version:'1'},transformations:[]})),
  }]};
  const fields=['problem','insight','method','results','limitations','reproducibility'];
  const proposal={schemaVersion:'0.1.0',fields:Object.fromEntries(fields.map(field=>[field,{
    summary:field==='problem'?'Reported result':'',sourceBlockIds:field==='problem'?sourceBlockIds:[],needsMoreInformation:field!=='problem',
  }]))};
  const gateway=new AiGateway({providers:[{name:'fixture',model:'fixture',complete:async()=>({text:JSON.stringify(proposal),usage:{inputTokens:1,outputTokens:1},model:'fixture'})}]});
  const extracted=await extractHandler(gateway,{payload:{}},{sourceMap});
  const sourceMapRef=await persistDocumentSourceMapReference(storage,sourceMap,'succeeded');
  const result={...extracted,sourceMapRef};
  db.sdfDocuments.push({id:'sdf',researchObjectId:RO,coreJson:extracted.core});
  for(const nodeType of fields) db.sdfNodes.push({id:nodeType,sdfDocumentId:'sdf',nodeType,content:''});
  db.agentTasks.push({id:'extract',result});
  db.ingestionBatches.push({id:'batch',researchObjectId:RO,userId:user.id});
  db.ingestionTasks.push({id:'task',batchId:'batch',artifactId:ARTIFACT,agentTaskId:'extract',state:'needs_review',retryCount:0,updatedAt:new Date()});
  const deps={prisma,storage,redis:{} as never,mailer:{} as never};
  const projected = await getIngestionTask(deps, { userId: user.id, taskId: 'task' });
  const sourceIdentityReview = { token: String(projected.task.result?.sourceIdentityToken),
    acceptedFields: [] as [] };
  const confirm=async()=>{
    const saved=await confirmIngestionTask(deps,{userId:user.id,taskId:'task',version:1,core:{...extracted.core},sourceIdentityReview});
    const view=await getResearchRecord(deps,{researchObjectId:RO,versionId:saved.confirmation.versionId,userId:user.id});
    return {saved,view};
  };
  return {db,deps,user,result,sourceIdentityReview,confirm};
}

describe('canonical extractor → confirmation → frozen research record',()=>{
  it('preserves a legacy persisted exact-plus-whitespace ambiguity through confirmation',async()=>{
    const f=await extractedFixture(['Same result.','Same  result.']);
    // Pre-block-ID extraction stored quote-rematch ambiguity. It remains authoritative on replay.
    f.db.agentTasks[0].result.evidenceLocation.problem={status:'ambiguous',origin:'model_quote',reason:'multiple-matches'};
    delete f.db.agentTasks[0].result.evidenceSegments;
    expect(f.result.evidence.problem.quote).toBe('Same result.');
    const {view}=await f.confirm();
    expect(f.db.evidenceRecords).toHaveLength(0);
    expect(view.record).toMatchObject({recordState:'recorded',evidence:[],missing:{evidence:'not_recorded'}});
  });
  it('retains the exact selected block identity even when another block has normalized matching text',async()=>{
    const f=await extractedFixture(['Same result.','Same  result.'],['B000002']);
    expect(f.result.evidenceLocation?.problem).toMatchObject({status:'located',sourceLocator:{blockId:'block1'}});
    expect(f.result.evidence.problem.quote).toBe('Same  result.');
    const {saved,view}=await f.confirm();
    expect(f.db.evidenceRecords).toHaveLength(1);
    expect(view.record.evidence[0].locator.blockId).toBe('block1');
    const source=await getResearchRecordSource(f.deps,{researchObjectId:RO,versionId:saved.confirmation.versionId,evidenceId:f.db.evidenceRecords[0].id,userId:f.user.id});
    expect(source.text).toBe('Same  result.');
  });
  it('persists canonical noncontiguous segments as independent Evidence rows for one Claim',async()=>{
    const f=await extractedFixture(['The optical-','field obeys Φ_CEP ≠ 0.','Unrelated header.','Calibration required.'],['B000001','B000002','B000004']);
    expect(f.result.evidenceLocation?.problem).toMatchObject({status:'cross_block',reason:'match-spans-blocks'});
    expect(f.result.evidenceSegments?.problem.map(segment=>({quote:segment.quote,blockId:segment.sourceLocator.blockId}))).toEqual([
      {quote:'The optical-',blockId:'block0'}, {quote:'field obeys Φ_CEP ≠ 0.',blockId:'block1'}, {quote:'Calibration required.',blockId:'block3'},
    ]);
    expect(f.result.evidence.problem.quote).toBe('The optical-\nfield obeys Φ_CEP ≠ 0.\nCalibration required.');
    const {view}=await f.confirm();
    expect(f.db.claimNodes).toHaveLength(1);
    expect(f.db.evidenceRecords).toHaveLength(3);
    expect(new Set(f.db.evidenceRecords.map(row=>row.claimId))).toEqual(new Set([f.db.claimNodes[0].id]));
    expect(f.db.evidenceRecords.map(row=>({quote:row.exactQuote,blockId:row.locator.blockId,relation:row.relation,verifiedByUserId:row.verifiedByUserId}))).toEqual([
      {quote:'The optical-',blockId:'block0',relation:'context',verifiedByUserId:null},
      {quote:'field obeys Φ_CEP ≠ 0.',blockId:'block1',relation:'context',verifiedByUserId:null},
      {quote:'Calibration required.',blockId:'block3',relation:'context',verifiedByUserId:null},
    ]);
    expect(view.record).toMatchObject({sdf:{problem:'Reported result'},evidence:[{verified:false},{verified:false},{verified:false}]});
    expect(view.record.manifest).toHaveLength(1);
    expect(view.record.manifest[0].artifactId).toBe(ARTIFACT);
  });
  it('retains conservative exact matching for legacy persisted results with canonical metadata absent',async()=>{
    const f=await extractedFixture(['Same result.']);
    delete f.db.agentTasks[0].result.evidenceLocation;
    delete f.db.agentTasks[0].result.evidenceSegments;
    const {view}=await f.confirm();
    expect(f.db.evidenceRecords).toHaveLength(1);
    expect(view.record.evidence[0].locator.blockId).toBe('block0');
  });
  it.each(['Same result.','Same  result.'])('retains a uniquely located canonical quote: %s',async(text)=>{
    const f=await extractedFixture([text]);
    expect(f.result.evidenceLocation?.problem.status).toBe('located');
    const {saved,view}=await f.confirm();
    expect(f.db.evidenceRecords).toHaveLength(1);
    expect(f.db.evidenceRecords[0].locator).toEqual(f.result.evidenceLocation?.problem.status==='located'?f.result.evidenceLocation.problem.sourceLocator:null);
    expect(view.record).toMatchObject({evidence:[{source:{state:'recorded'},verified:false}]});
    const source=await getResearchRecordSource(f.deps,{researchObjectId:RO,versionId:saved.confirmation.versionId,evidenceId:f.db.evidenceRecords[0].id,userId:f.user.id});
    expect(source.text).toBe(text);
  });
  it.each([
    {status:'ambiguous',origin:'model_quote',reason:'multiple-matches'},
    {status:'cross_block',origin:'model_quote',reason:'match-spans-blocks'},
    {status:'missing',origin:'model_quote',reason:'no-match'},
    {status:'located',origin:'model_quote',matching:'exact'},
    null,
  ])('atomically rejects canonical segments paired with inconsistent location metadata: %j',async(location)=>{
    const f=await extractedFixture(['Same result.']);
    f.db.agentTasks[0].result.evidenceLocation={problem:location};
    await expect(f.confirm()).rejects.toThrow();
    expect(f.db.versions).toHaveLength(0);
    expect(f.db.commits).toHaveLength(0);
    expect(f.db.evidenceRecords).toHaveLength(0);
  });
  it.each([null, {}])('atomically rejects a malformed supplied canonical bundle: %j',async(bundle)=>{
    const f=await extractedFixture(['Same result.']);
    f.db.agentTasks[0].result.evidenceLocation=bundle;
    await expect(f.confirm()).rejects.toThrow();
    expect(f.db.versions).toHaveLength(0);
    expect(f.db.commits).toHaveLength(0);
    expect(f.db.evidenceRecords).toHaveLength(0);
  });
  it.each(['artifactId','contentHash','page','quote'])('atomically rejects canonical metadata with invalid %s',async(field)=>{
    const f=await extractedFixture(['Same result.']);
    const segment=f.db.agentTasks[0].result.evidenceSegments.problem[0];
    if(field==='artifactId') segment.sourceLocator.artifactId='00000000-0000-4000-8000-000000000999';
    if(field==='contentHash') segment.sourceLocator.contentHash='f'.repeat(64);
    if(field==='page') segment.sourceLocator.page=99;
    if(field==='quote') segment.quote='Different quote';
    await expect(f.confirm()).rejects.toThrow();
    expect(f.db.versions).toHaveLength(0);
    expect(f.db.commits).toHaveLength(0);
    expect(f.db.claimNodes).toHaveLength(0);
    expect(f.db.evidenceRecords).toHaveLength(0);
  });
  it('atomically rejects canonical segments that reverse SourceMap block order on one page',async()=>{
    const f=await extractedFixture(['First source.','Second source.'],['B000001','B000002']);
    f.db.agentTasks[0].result.evidenceSegments.problem.reverse();
    f.db.agentTasks[0].result.evidence.problem.quote='Second source.\nFirst source.';
    await expect(f.confirm()).rejects.toThrow(/source order/i);
    expect(f.db.versions).toHaveLength(0);
    expect(f.db.commits).toHaveLength(0);
    expect(f.db.claimNodes).toHaveLength(0);
    expect(f.db.evidenceRecords).toHaveLength(0);
  });
  it('records an edited proposal as a Claim with an explicit evidence gap',async()=>{
    const f=await extractedFixture(['Same result.']);
    const saved=await confirmIngestionTask(f.deps,{userId:f.user.id,taskId:'task',version:1,
      core:{...f.result.core,problem:'Human revised statement'},sourceIdentityReview:f.sourceIdentityReview});
    expect(saved.sdf.core.problem).toBe('Human revised statement');
    expect(f.db.claimNodes).toEqual([expect.objectContaining({
      statement:'Human revised statement',assessment:'missing',extractionStatus:'needs_review',
      provenance:expect.objectContaining({source:'human',revision:'human',proposalSource:'sdf.extract',proposalStatementSha256:expect.stringMatching(/^[a-f0-9]{64}$/)}),
    })]);
    expect(f.db.evidenceRecords).toHaveLength(0);
  });
});
