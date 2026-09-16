import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFile, mkdtemp, mkdir, readdir, readFile, rename, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inspectVideoCapacity, publishVideoResult, runVideoOne, validateVideoRequest, videoRuntimeIdentity } from './video-runner.mjs';

const id='10000000-0000-4000-8000-000000000001';
const roles=['driver_signal','tip_enhancement','emission_collection','delay_scan','field_reconstruction'];
const exec=promisify(execFile);
test('runtime identity binds scripts, images, and installed model revision',()=>{
 const config={scriptDigest:'a'.repeat(64),ttsImage:`sha256:${'b'.repeat(64)}`,rendererImage:`sha256:${'c'.repeat(64)}`,
  model:'/opt/openscience-models/qwen3-tts-customvoice-0c0e305',modelRevision:'qwen3-tts-customvoice-0c0e305'};
 assert.deepEqual(videoRuntimeIdentity(config),{
  scriptDigest:config.scriptDigest,ttsImage:config.ttsImage,rendererImage:config.rendererImage,modelRevision:config.modelRevision,
 });
 assert.throws(()=>videoRuntimeIdentity({...config,modelRevision:'other'}),/RUNTIME_IDENTITY/);
});
const runtimeConfig=(results)=>({results,scriptDigest:'a'.repeat(64),ttsImage:`sha256:${'b'.repeat(64)}`,
 rendererImage:`sha256:${'c'.repeat(64)}`,model:'/opt/openscience-models/qwen3-tts-customvoice-0c0e305',modelRevision:'qwen3-tts-customvoice-0c0e305'});
test('video manifest authenticates exact storyboard and five fixed-role PNG inputs',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'video-request-'));
 const storyboard=Buffer.from(JSON.stringify({schemaVersion:1,title:'On chip',scenes:Array.from({length:5},(_,i)=>({title:`S${i}`,narration:`N${i}`}))}));
 const pngs=Array.from({length:5},(_,i)=>Buffer.from(`png-${i}`));
 const files={storyboard:{name:'storyboard.json',size:storyboard.length,sha256:createHash('sha256').update(storyboard).digest('hex')},scenes:pngs.map((bytes,i)=>({name:`scene-${i}.png`,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}))};
 await writeFile(join(dir,'storyboard.json'),storyboard);for(let i=0;i<5;i++)await writeFile(join(dir,`scene-${i}.png`),pngs[i]);
 const now=1000000;const request={schemaVersion:1,id,taskId:id,executionAttempt:1,profile:'onchip-field-sampling-v1',inputHash:createHash('sha256').update(JSON.stringify(files)).digest('hex'),sourceClaimIds:['20000000-0000-4000-8000-000000000001'],sceneRoles:roles,files,createdAt:now,deadlineAt:now+360000,narration:{provider:'Qwen3-TTS',speaker:'Serena',timingStatus:'estimated_requires_review'}};
 await writeFile(join(dir,'request.json'),JSON.stringify(request));
 assert.equal((await validateVideoRequest(dir,id,now)).inputHash,request.inputHash);
 await writeFile(join(dir,'scene-4.png'),'tampered');
 await assert.rejects(validateVideoRequest(dir,id,now),/INVALID_REQUEST/);
});

async function queueRoots(prefix) {
 const root=await mkdtemp(join(tmpdir(),prefix));
 const config={inbox:join(root,'inbox'),results:join(root,'results'),privateRoot:join(root,'private')};
 await Promise.all(Object.values(config).map(path=>mkdir(path)));
 return config;
}
async function writeValidVideoRequest(dir,requestId=id,now=Date.now()){
 const storyboard=Buffer.from(JSON.stringify({schemaVersion:1,title:'On chip',scenes:Array.from({length:5},(_,i)=>({title:`S${i}`,narration:`N${i}`}))}));
 const pngs=Array.from({length:5},(_,i)=>Buffer.from(`png-${i}`));
 const files={storyboard:{name:'storyboard.json',size:storyboard.length,sha256:createHash('sha256').update(storyboard).digest('hex')},scenes:pngs.map((bytes,i)=>({name:`scene-${i}.png`,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}))};
 await writeFile(join(dir,'storyboard.json'),storyboard);for(let i=0;i<5;i++)await writeFile(join(dir,`scene-${i}.png`),pngs[i]);
 const request={schemaVersion:1,id:requestId,taskId:requestId,executionAttempt:1,profile:'onchip-field-sampling-v1',inputHash:createHash('sha256').update(JSON.stringify(files)).digest('hex'),sourceClaimIds:['20000000-0000-4000-8000-000000000001'],sceneRoles:roles,files,createdAt:now,deadlineAt:now+360000,narration:{provider:'Qwen3-TTS',speaker:'Serena',timingStatus:'estimated_requires_review'}};
 await writeFile(join(dir,'request.json'),JSON.stringify(request));return request;
}

test('completed private jobs do not busy-loop or starve the idle queue',async()=>{
 const config=await queueRoots('video-complete-');
 await mkdir(join(config.privateRoot,id));
 await mkdir(join(config.results,id));
 await writeFile(join(config.results,id,'result.json'),'{}');
 const next='10000000-0000-4000-8000-000000000002';await mkdir(join(config.inbox,next));
 await writeFile(join(config.inbox,next,'request.json'),'{}');
 assert.deepEqual(await runVideoOne(config),{id:next,status:'invalid'});
 assert.equal(await runVideoOne(config),null);
});

test('malformed or expired claimed request is quarantined once and cannot poison restart',async()=>{
 const config=await queueRoots('video-invalid-');
 const incoming=join(config.inbox,id);await mkdir(incoming);
 await writeFile(join(incoming,'request.json'),JSON.stringify({schemaVersion:1,id,deadlineAt:0}));
 assert.deepEqual(await runVideoOne(config),{id,status:'invalid'});
 const entries=await readdir(join(config.privateRoot,'quarantine'));assert.equal(entries.length,1);
 assert.deepEqual(JSON.parse(await readFile(join(config.privateRoot,'quarantine',entries[0],'invalid.json'),'utf8')),
  {schemaVersion:1,id,status:'invalid',reason:'INVALID_REQUEST'});
 assert.equal(await runVideoOne(config),null);
});

test('capacity closes at 20 retained jobs or below 2 GiB free space',async()=>{
 const config=await queueRoots('video-capacity-');
 const plenty=async()=>({bavail:3n*1024n*1024n,bsize:1024n});
 assert.deepEqual(await inspectVideoCapacity(config.privateRoot,plenty),{accepting:true,retained:0,freeBytes:3n*1024n*1024n*1024n});
 for(let index=0;index<19;index++)await mkdir(join(config.privateRoot,`10000000-0000-4000-8000-${String(index).padStart(12,'0')}`));
 const quarantine=join(config.privateRoot,'quarantine');await mkdir(quarantine);await mkdir(join(quarantine,'invalid-one'));
 assert.equal((await inspectVideoCapacity(config.privateRoot,plenty)).accepting,false);
 const low=async()=>({bavail:1n,bsize:1024n});
 assert.equal((await inspectVideoCapacity((await queueRoots('video-low-space-')).privateRoot,low)).accepting,false);
});

test('closed capacity leaves queued work untouched and returns to bounded idle polling',async()=>{
 const config=await queueRoots('video-closed-');
 for(let index=0;index<20;index++){
  const retainedId=`10000000-0000-4000-8000-${String(index).padStart(12,'0')}`;
  await mkdir(join(config.privateRoot,retainedId));await mkdir(join(config.results,retainedId));await writeFile(join(config.results,retainedId,'result.json'),'{}');
 }
 await mkdir(join(config.inbox,id));await writeFile(join(config.inbox,id,'request.json'),'{}');
 assert.equal(await runVideoOne(config),null);
 assert.equal((await readdir(config.inbox)).includes(id),true);
});

test('retention count does not strand an already claimed valid job at 20 entries',async()=>{
 const roots=await queueRoots('video-reserved-'),config={...roots,...runtimeConfig(roots.results)};
 const claimed=join(config.privateRoot,id);await mkdir(claimed);await writeValidVideoRequest(claimed);
 for(let index=10;index<29;index++){
  const retainedId=`10000000-0000-4000-8000-${String(index).padStart(12,'0')}`;
  await mkdir(join(config.privateRoot,retainedId));await mkdir(join(config.results,retainedId));await writeFile(join(config.results,retainedId,'result.json'),'{}');
 }
 let reached=false;
 const result=await runVideoOne(config,{executeReserved:async(request)=>{reached=true;return {id:request.id,status:'execution_boundary'};}});
 assert.equal(reached,true);assert.deepEqual(result,{id,status:'execution_boundary'});
});

test('low disk after claim publishes terminal capacity failure before execution',async()=>{
 const roots=await queueRoots('video-reserved-low-'),config={...roots,...runtimeConfig(roots.results)};
 const claimed=join(config.privateRoot,id);await mkdir(claimed);await writeValidVideoRequest(claimed);
 let reached=false;
 const result=await runVideoOne(config,{statfs:async()=>({bavail:1n,bsize:1024n}),executeReserved:async()=>{reached=true;}});
 assert.equal(reached,false);assert.deepEqual(result,{id,status:'failed'});
 const terminal=JSON.parse(await readFile(join(config.results,id,'result.json'),'utf8'));
 assert.equal(terminal.errorCode,'CAPACITY_CLOSED');assert.equal(terminal.executionAttempt,1);
});

test('space decline between inbox admission and claim also fails before execution',async()=>{
 const roots=await queueRoots('video-claim-space-'),config={...roots,...runtimeConfig(roots.results)};
 const queued=join(config.inbox,id);await mkdir(queued);await writeValidVideoRequest(queued);
 let checks=0,reached=false;
 const statfs=async()=>++checks===1?{bavail:3n*1024n*1024n,bsize:1024n}:{bavail:1n,bsize:1024n};
 const result=await runVideoOne(config,{statfs,executeReserved:async()=>{reached=true;}});
 assert.equal(reached,false);assert.deepEqual(result,{id,status:'failed'});
 assert.equal(JSON.parse(await readFile(join(config.results,id,'result.json'),'utf8')).errorCode,'CAPACITY_CLOSED');
});

test('validated input snapshot survives source replacement before isolated staging',async()=>{
 const roots=await queueRoots('video-snapshot-'),config={...roots,...runtimeConfig(roots.results)};
 const claimed=join(config.privateRoot,id);await mkdir(claimed);const request=await writeValidVideoRequest(claimed);
 const originalScene=await readFile(join(claimed,'scene-0.png'));
 let staged;
 const result=await runVideoOne(config,{
  afterValidation:async()=>{await writeFile(join(claimed,'storyboard.json'),'mutated');await writeFile(join(claimed,'scene-0.png'),'mutated');},
  executeReserved:async(_request,_privateDir,paths)=>{staged={storyboard:await readFile(join(paths.ttsInput,'storyboard.json')),scene:await readFile(join(paths.renderInput,'scene-0.png'))};return {id,status:'execution_boundary'};},
 });
 assert.deepEqual(result,{id,status:'execution_boundary'});
 assert.equal(createHash('sha256').update(staged.storyboard).digest('hex'),request.files.storyboard.sha256);
 assert.deepEqual(staged.scene,originalScene);
});

test('symlink source is rejected before it can enter the validated snapshot',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'video-symlink-'));const request=await writeValidVideoRequest(dir);
 const outside=join(dir,'outside.png');await writeFile(outside,'outside');
 await writeFile(join(dir,'scene-0.png'),'placeholder');
 const linked=join(dir,'linked.png');await symlink(outside,linked,'file');
 request.files.scenes[0]={name:'scene-0.png',size:7,sha256:createHash('sha256').update('outside').digest('hex')};
 request.inputHash=createHash('sha256').update(JSON.stringify(request.files)).digest('hex');
 await writeFile(join(dir,'request.json'),JSON.stringify(request));
 await rename(join(dir,'scene-0.png'),join(dir,'scene-0-original.png'));await symlink(outside,join(dir,'scene-0.png'),'file');
 await assert.rejects(validateVideoRequest(dir,id),/UNSAFE_FILE/);
});

test('partial result directory is recovered atomically and completed result is idempotent',async()=>{
 const root=await mkdtemp(join(tmpdir(),'video-publish-')),results=join(root,'results');await mkdir(results);
 const resultDir=join(results,id);await mkdir(resultDir);await writeFile(join(resultDir,'result.mp4'),'partial');
 const request={id,inputHash:'d'.repeat(64),executionAttempt:2};
 const config=runtimeConfig(results);
 await publishVideoResult(config,request,'succeeded',undefined,{videoBytes:Buffer.from('complete-video'),metricsBytes:Buffer.from('{}'),result:{outputSha256:'e'.repeat(64)}});
 assert.equal(await readFile(join(resultDir,'result.mp4'),'utf8'),'complete-video');
 const first=await readFile(join(resultDir,'result.json'),'utf8');
 await publishVideoResult(config,request,'failed','LATE_FAILURE');
 assert.equal(await readFile(join(resultDir,'result.json'),'utf8'),first);
 assert.equal(await readFile(join(resultDir,'result.mp4'),'utf8'),'complete-video');
});

test('existing result marker must be a bounded regular file before idempotent return',async()=>{
 const root=await mkdtemp(join(tmpdir(),'video-result-marker-')),results=join(root,'results');await mkdir(results);
 const resultDir=join(results,id);await mkdir(resultDir);await mkdir(join(resultDir,'result.json'));
 await assert.rejects(publishVideoResult(runtimeConfig(results),{id,inputHash:'d'.repeat(64),executionAttempt:1},'failed','X'),/UNSAFE_FILE/);
});

test('video installer stages a runtime closure that imports without the source tree',async()=>{
 const source=new URL('.',import.meta.url),install=await readFile(new URL('install.sh',source),'utf8');
 const videoBranch=install.slice(0,install.indexOf("\n[[ $# = 3"));
 const listed=/for file in ([^;]+); do install/.exec(videoBranch)?.[1]?.trim().split(/\s+/u)??[];
 const root=await mkdtemp(join(tmpdir(),'video-bundle-'));
 const scripts=join(root,'infra','codex-image-runner');await mkdir(scripts,{recursive:true});
 for(const name of listed)await copyFile(new URL(name,source),join(scripts,name));
 if(/packages\/ai-gateway\/dist/u.test(videoBranch)){
  const target=join(root,'packages','ai-gateway','dist');await mkdir(target,{recursive:true});
  for(const name of await readdir(new URL('../../packages/ai-gateway/dist/',source))){if(name.endsWith('.js'))await copyFile(new URL(`../../packages/ai-gateway/dist/${name}`,source),join(target,name));}
 }
 const module=await import(`${pathToFileURL(join(scripts,'video-runner.mjs')).href}?test=${Date.now()}`);
 assert.equal(typeof module.runVideoOne,'function');
});

test('video TTS is self-contained within the installed script bundle',async()=>{
 const source=new URL('.',import.meta.url),install=await readFile(new URL('install.sh',source),'utf8');
 const videoBranch=install.slice(0,install.indexOf("\n[[ $# = 3"));
 const listed=/for file in ([^;]+); do install/.exec(videoBranch)?.[1]?.trim().split(/\s+/u)??[];
 const scripts=await mkdtemp(join(tmpdir(),'video-python-'));
 for(const name of listed.filter(name=>name.endsWith('.py')))await copyFile(new URL(name,source),join(scripts,name));
 const result=await exec('python',['-c','import ast,pathlib,sys;p=pathlib.Path(sys.argv[1])/"video-tts.py";tree=ast.parse(p.read_text("utf-8"));assert all(not(isinstance(n,(ast.Import,ast.ImportFrom)) and any(a.name=="audition" for a in n.names)) for n in ast.walk(tree))',scripts]);
 assert.equal(result.stderr,'');
});
