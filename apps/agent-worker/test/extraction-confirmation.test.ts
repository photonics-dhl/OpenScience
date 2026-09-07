import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { AiGateway } from '@openscience/ai-gateway';
import { confirmIngestionTask, getResearchRecord, getResearchRecordSource, persistDocumentSourceMapReference, type DocumentSourceMap } from '@openscience/domain';
import { createFakePrisma, seedUser } from '@openscience/domain/test-helpers';
import { getBlobStorageKey, type StorageAdapter } from '@openscience/storage';
import { extractHandler } from '../src/extractor';

const RO = '00000000-0000-4000-8000-000000000201';
const ARTIFACT = '00000000-0000-4000-8000-000000000202';
async function extractedFixture(texts: string[]) {
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
    summary:field==='problem'?'Reported result':'',sourceQuote:field==='problem'?'Same result.':'',needsMoreInformation:field!=='problem',
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
  const confirm=async()=>{
    const saved=await confirmIngestionTask(deps,{userId:user.id,taskId:'task',version:1,core:{...extracted.core}});
    const view=await getResearchRecord(deps,{researchObjectId:RO,versionId:saved.confirmation.versionId,userId:user.id});
    return {saved,view};
  };
  return {db,deps,user,result,confirm};
}

describe('canonical extractor → confirmation → frozen research record',()=>{
  it('does not promote exact-plus-whitespace ambiguity to a frozen source',async()=>{
    const f=await extractedFixture(['Same result.','Same  result.']);
    expect(f.result.evidenceLocation?.problem).toMatchObject({status:'ambiguous',reason:'multiple-matches'});
    expect(f.result.evidence.problem.quote).toBe('Same result.');
    const {view}=await f.confirm();
    expect(f.db.evidenceRecords).toHaveLength(0);
    expect(view.record).toMatchObject({recordState:'recorded',evidence:[],missing:{evidence:'not_recorded'}});
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
  ])('does not fall back to an exact match for supplied unresolved/malformed metadata: %j',async(location)=>{
    const f=await extractedFixture(['Same result.']);
    f.db.agentTasks[0].result.evidenceLocation={problem:location};
    await f.confirm();
    expect(f.db.evidenceRecords).toHaveLength(0);
  });
  it.each([null, {}])('rejects a malformed supplied canonical bundle: %j',async(bundle)=>{
    const f=await extractedFixture(['Same result.']);
    f.db.agentTasks[0].result.evidenceLocation=bundle;
    await f.confirm();
    expect(f.db.evidenceRecords).toHaveLength(0);
  });
  it.each(['artifactId','contentHash','page','quote'])('rejects canonical located metadata with invalid %s',async(field)=>{
    const f=await extractedFixture(['Same result.']);
    const location=f.db.agentTasks[0].result.evidenceLocation.problem;
    if(field==='artifactId') location.sourceLocator.artifactId='00000000-0000-4000-8000-000000000999';
    if(field==='contentHash') location.sourceLocator.contentHash='f'.repeat(64);
    if(field==='page') location.sourceLocator.page=99;
    if(field==='quote') f.db.agentTasks[0].result.evidence.problem.quote='Different quote';
    await f.confirm();
    expect(f.db.evidenceRecords).toHaveLength(0);
  });
});
