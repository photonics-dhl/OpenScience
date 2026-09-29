import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFile, lstat, mkdtemp, mkdir, open, readdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inspectVideoCapacity, inspectVideoRuntime, publishVideoReadiness, publishVideoResult, runVideoOne, validateVideoRequest, videoRuntimeIdentity } from './video-runner.mjs';

const id='10000000-0000-4000-8000-000000000001';
const roles=['driver_signal','tip_enhancement','emission_collection','delay_scan','field_reconstruction'];
const exec=promisify(execFile);
const scratch=fileURLToPath(new URL('../../tmp/',import.meta.url));await mkdir(scratch,{recursive:true});
const testRoot=await mkdtemp(join(scratch,'video-runner-tests-'));after(()=>rm(testRoot,{recursive:true,force:true}));
const inspectImages=async(args)=>{
 assert.deepEqual(args.slice(0,4),['image','inspect','--format','{{.Id}}']);
 assert.equal(args.length,6);
 return {stdout:args.slice(4).join('\n')};
};
const plenty=async()=>({bavail:3n*1024n*1024n,bsize:1024n});
test('runtime identity binds scripts, images, and installed model revision',()=>{
 const config={scriptDigest:'a'.repeat(64),ttsImage:`sha256:${'b'.repeat(64)}`,rendererImage:`sha256:${'c'.repeat(64)}`,
  model:'/opt/openscience-models/qwen3-tts-customvoice-0c0e305',modelRevision:'qwen3-tts-customvoice-0c0e305'};
 assert.deepEqual(videoRuntimeIdentity(config),{
  scriptDigest:config.scriptDigest,ttsImage:config.ttsImage,rendererImage:config.rendererImage,modelRevision:config.modelRevision,
 });
 assert.throws(()=>videoRuntimeIdentity({...config,modelRevision:'other'}),/RUNTIME_IDENTITY/);
});
const runtimeConfig=(results)=>({results,scriptDigest:'a'.repeat(64),ttsImage:`sha256:${'b'.repeat(64)}`,
 rendererImage:`sha256:${'c'.repeat(64)}`,model:join(dirname(results),'qwen3-tts-customvoice-0c0e305'),modelRevision:'qwen3-tts-customvoice-0c0e305'});
test('video manifest authenticates exact storyboard and five fixed-role PNG inputs',async()=>{
 const dir=await mkdtemp(join(testRoot,'video-request-'));
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
 const root=await mkdtemp(join(testRoot,prefix));
 const config={inbox:join(root,'inbox'),results:join(root,'results'),privateRoot:join(root,'private')};
 await Promise.all(Object.values(config).map(path=>mkdir(path)));
 Object.assign(config,runtimeConfig(config.results));await mkdir(config.model);
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
 assert.deepEqual(await runVideoOne(config,{docker:inspectImages}),{id:next,status:'invalid'});
 assert.equal(await runVideoOne(config,{docker:inspectImages}),null);
});

test('malformed claimed request is quarantined once and cannot poison restart',async()=>{
 const config=await queueRoots('video-invalid-');
 const incoming=join(config.inbox,id);await mkdir(incoming);
 await writeFile(join(incoming,'request.json'),JSON.stringify({schemaVersion:1,id,deadlineAt:0}));
 assert.deepEqual(await runVideoOne(config,{docker:inspectImages}),{id,status:'invalid'});
 const entries=await readdir(join(config.privateRoot,'quarantine'));assert.equal(entries.length,1);
 assert.deepEqual(JSON.parse(await readFile(join(config.privateRoot,'quarantine',entries[0],'invalid.json'),'utf8')),
  {schemaVersion:1,id,status:'invalid',reason:'INVALID_REQUEST'});
 assert.equal(await runVideoOne(config,{docker:inspectImages}),null);
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
 assert.equal(await runVideoOne(config,{docker:inspectImages}),null);
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
 const result=await runVideoOne(config,{docker:inspectImages,executeReserved:async(request)=>{reached=true;return {id:request.id,status:'execution_boundary'};}});
 assert.equal(reached,true);assert.deepEqual(result,{id,status:'execution_boundary'});
});

test('low disk after claim publishes terminal capacity failure before execution',async()=>{
 const roots=await queueRoots('video-reserved-low-'),config={...roots,...runtimeConfig(roots.results)};
 const claimed=join(config.privateRoot,id);await mkdir(claimed);await writeValidVideoRequest(claimed);
 let reached=false;
 const result=await runVideoOne(config,{docker:inspectImages,statfs:async()=>({bavail:1n,bsize:1024n}),executeReserved:async()=>{reached=true;}});
 assert.equal(reached,false);assert.deepEqual(result,{id,status:'failed'});
 const terminal=JSON.parse(await readFile(join(config.results,id,'result.json'),'utf8'));
 assert.equal(terminal.errorCode,'CAPACITY_CLOSED');assert.equal(terminal.executionAttempt,1);
});

test('space decline between inbox admission and claim also fails before execution',async()=>{
 const roots=await queueRoots('video-claim-space-'),config={...roots,...runtimeConfig(roots.results)};
 const queued=join(config.inbox,id);await mkdir(queued);await writeValidVideoRequest(queued);
 let checks=0,reached=false;
 const statfs=async()=>++checks===1?{bavail:3n*1024n*1024n,bsize:1024n}:{bavail:1n,bsize:1024n};
 const result=await runVideoOne(config,{docker:inspectImages,statfs,executeReserved:async()=>{reached=true;}});
 assert.equal(reached,false);assert.deepEqual(result,{id,status:'failed'});
 assert.equal(JSON.parse(await readFile(join(config.results,id,'result.json'),'utf8')).errorCode,'CAPACITY_CLOSED');
});

test('validated input snapshot survives source replacement before isolated staging',async()=>{
 const roots=await queueRoots('video-snapshot-'),config={...roots,...runtimeConfig(roots.results)};
 const claimed=join(config.privateRoot,id);await mkdir(claimed);const request=await writeValidVideoRequest(claimed);
 const originalScene=await readFile(join(claimed,'scene-0.png'));
 let staged;
 const result=await runVideoOne(config,{
  docker:inspectImages,
  afterValidation:async()=>{await writeFile(join(claimed,'storyboard.json'),'mutated');await writeFile(join(claimed,'scene-0.png'),'mutated');},
  executeReserved:async(_request,_privateDir,paths)=>{staged={storyboard:await readFile(join(paths.ttsInput,'storyboard.json')),scene:await readFile(join(paths.renderInput,'scene-0.png'))};return {id,status:'execution_boundary'};},
 });
 assert.deepEqual(result,{id,status:'execution_boundary'});
 assert.equal(createHash('sha256').update(staged.storyboard).digest('hex'),request.files.storyboard.sha256);
 assert.deepEqual(staged.scene,originalScene);
});

test('symlink source is rejected before it can enter the validated snapshot',async()=>{
 const dir=await mkdtemp(join(testRoot,'video-symlink-'));const request=await writeValidVideoRequest(dir);
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
 const root=await mkdtemp(join(testRoot,'video-publish-')),results=join(root,'results');await mkdir(results);
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
 const root=await mkdtemp(join(testRoot,'video-result-marker-')),results=join(root,'results');await mkdir(results);
 const resultDir=join(results,id);await mkdir(resultDir);await mkdir(join(resultDir,'result.json'));
 await assert.rejects(publishVideoResult(runtimeConfig(results),{id,inputHash:'d'.repeat(64),executionAttempt:1},'failed','X'),/UNSAFE_FILE/);
});

test('video installer stages a runtime closure that imports without the source tree',async()=>{
 const source=new URL('.',import.meta.url),install=await readFile(new URL('install.sh',source),'utf8');
 const videoBranch=install.slice(0,install.indexOf("\n[[ $# = 3"));
 const listed=/for file in ([^;]+); do install/.exec(videoBranch)?.[1]?.trim().split(/\s+/u)??[];
 const root=await mkdtemp(join(testRoot,'video-bundle-'));
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
 const scripts=await mkdtemp(join(testRoot,'video-python-'));
 for(const name of listed.filter(name=>name.endsWith('.py')))await copyFile(new URL(name,source),join(scripts,name));
 const result=await exec('python',['-c','import ast,pathlib,sys;p=pathlib.Path(sys.argv[1])/"video-tts.py";tree=ast.parse(p.read_text("utf-8"));assert all(not(isinstance(n,(ast.Import,ast.ImportFrom)) and any(a.name=="audition" for a in n.names)) for n in ast.walk(tree))',scripts]);
 assert.equal(result.stderr,'');
});

for(const missing of ['ttsImage','rendererImage','model'])test(`missing ${missing} leaves queued work unclaimed and resumes after repair`,async()=>{
 const config=await queueRoots('video-runtime-missing-');
 const incoming=join(config.inbox,id);await mkdir(incoming);await writeValidVideoRequest(incoming);
 let unavailable=true,executions=0;
 if(missing==='model')await rm(config.model,{recursive:true});
 const dependencies={
  statfs:plenty,
  docker:async(args)=>{await inspectImages(args);if(unavailable&&args.includes(config[missing]))throw Error('No such image');return {stdout:''};},
  executeReserved:async(request)=>{executions++;return {id:request.id,status:'execution_boundary'};},
 };
 assert.equal(await runVideoOne(config,dependencies),null);
 assert.equal(executions,0);assert.deepEqual(await readdir(config.inbox),[id]);assert.deepEqual(await readdir(config.privateRoot),[]);
 assert.equal(JSON.parse(await readFile(join(config.results,'.ready'),'utf8')).accepting,false);
 assert.equal((await readdir(config.results)).includes(id),false);
 unavailable=false;if(missing==='model')await mkdir(config.model);
 assert.deepEqual(await runVideoOne(config,dependencies),{id,status:'execution_boundary'});
 assert.equal(executions,1);assert.deepEqual(await readdir(config.inbox),[]);
 assert.match(await readFile(join(config.privateRoot,id,'started'),'utf8'),/^\d+$/u);
});

for(const missing of ['ttsImage','rendererImage','model'])test(`heartbeat closes for missing ${missing} and reopens with the same runtime identity`,async()=>{
 const config=await queueRoots('video-heartbeat-');let unavailable=false;
 const dependencies={statfs:plenty,docker:async(args,timeout)=>{
  const result=await inspectImages(args);assert.ok(timeout>0&&timeout<=5000);
  assert.deepEqual(args.slice(4),[config.ttsImage,config.rendererImage]);
  if(unavailable&&args.includes(config[missing]))throw Error('No such image');return result;
 }};
 const heartbeat=()=>publishVideoReadiness(config,dependencies);
 const healthy=await heartbeat();
 assert.equal(healthy.accepting,true);assert.equal(healthy.schemaVersion,1);
 assert.deepEqual(healthy.runtime,videoRuntimeIdentity(config));assert.equal(healthy.freeBytes,'3221225472');
 assert.deepEqual(Object.keys(healthy).sort(),['accepting','freeBytes','retained','runtime','schemaVersion','updatedAt']);
 unavailable=true;if(missing==='model')await rm(config.model,{recursive:true});
 await heartbeat();
 const blocked=JSON.parse(await readFile(join(config.results,'.ready'),'utf8'));
 assert.equal(blocked.accepting,false);assert.equal(blocked.retained,0);assert.ok(blocked.updatedAt>0);
 assert.deepEqual(blocked.runtime,healthy.runtime);
 unavailable=false;if(missing==='model')await mkdir(config.model);
 await heartbeat();assert.equal(JSON.parse(await readFile(join(config.results,'.ready'),'utf8')).accepting,true);
 assert.equal((await publishVideoReadiness(config,{...dependencies,statfs:async()=>({bavail:1n,bsize:1024n})})).accepting,false);
});

for(const missing of ['ttsImage','rendererImage','model'])test(`${missing} lost after claim prevents started and preserves resumable work`,async()=>{
 const config=await queueRoots('video-runtime-lost-');
 const incoming=join(config.inbox,id);await mkdir(incoming);await writeValidVideoRequest(incoming);
 const original=await readFile(join(incoming,'request.json'));let unavailable=false,executions=0;
 const dependencies={statfs:plenty,
  docker:async(args)=>{const result=await inspectImages(args);if(unavailable&&args.includes(config[missing]))throw Error('No such image');return result;},
  afterValidation:async()=>{unavailable=true;if(missing==='model')await rm(config.model,{recursive:true});},
  executeReserved:async()=>{executions++;return {id,status:'execution_boundary'};},
 };
 assert.equal(await runVideoOne(config,dependencies),null);
 const claimed=join(config.privateRoot,id);
 assert.equal(executions,0);assert.deepEqual(await readdir(config.inbox),[]);
 assert.equal((await readdir(claimed)).includes('started'),false);
 assert.deepEqual(await readFile(join(claimed,'request.json')),original);
 assert.equal((await readdir(config.results)).includes(id),false);
 assert.equal(JSON.parse(await readFile(join(config.results,'.ready'),'utf8')).accepting,false);
 delete dependencies.afterValidation;
 assert.equal(await runVideoOne(config,dependencies),null);
 assert.equal((await readdir(claimed)).includes('started'),false);assert.equal(executions,0);
 unavailable=false;if(missing==='model')await mkdir(config.model);
 assert.deepEqual(await runVideoOne(config,dependencies),{id,status:'execution_boundary'});assert.equal(executions,1);
});

for(const unsafe of ['file','linked-model','linked-parent'])test(`${unsafe} model path cannot advertise readiness or claim a job`,async()=>{
 const config=await queueRoots('video-model-unsafe-');
 const incoming=join(config.inbox,id);await mkdir(incoming);await writeValidVideoRequest(incoming);
 const root=dirname(config.model);await rm(config.model,{recursive:true});
 if(unsafe==='file')await writeFile(config.model,'not a directory');
 else if(unsafe==='linked-model'){
  const target=join(root,'actual-model');await mkdir(target);await symlink(target,config.model,'junction');
 }else{
  const target=join(root,'actual-parent');await mkdir(join(target,config.modelRevision),{recursive:true});
  const linkedParent=join(root,'linked-parent');await symlink(target,linkedParent,'junction');config.model=join(linkedParent,config.modelRevision);
 }
 let inspected=0,executed=false;
 const dependencies={statfs:plenty,docker:async(args)=>{inspected++;return inspectImages(args);},executeReserved:async()=>{executed=true;}};
 assert.equal((await publishVideoReadiness(config,dependencies)).accepting,false);
 assert.equal(await runVideoOne(config,dependencies),null);
 assert.deepEqual(await readdir(config.inbox),[id]);assert.deepEqual(await readdir(config.privateRoot),[]);
 assert.equal(executed,false);assert.equal(inspected,0);
});

test('model ancestor inspection errors fail closed and recover without replacing config',async()=>{
 const config=await queueRoots('video-model-inaccessible-');let inaccessible=true;
 const dependencies={docker:inspectImages,statfs:plenty,lstat:async(path)=>{
  if(inaccessible&&path===dirname(config.model))throw Object.assign(Error('permission denied'),{code:'EACCES'});
  return lstat(path);
 }};
 assert.equal((await publishVideoReadiness(config,dependencies)).accepting,false);
 inaccessible=false;assert.equal((await publishVideoReadiness(config,dependencies)).accepting,true);
});

test('docker inspection failure closes heartbeat without stopping later recovery',async()=>{
 const config=await queueRoots('video-docker-error-');let unavailable=true;
 const dependencies={statfs:plenty,docker:async(args)=>{
  if(unavailable)throw Object.assign(Error('docker unavailable'),{code:'ENOENT'});return inspectImages(args);
 }};
 assert.equal((await publishVideoReadiness(config,dependencies)).accepting,false);
 unavailable=false;assert.equal((await publishVideoReadiness(config,dependencies)).accepting,true);
});

test('runtime inspection rejects an identity mismatch before invoking docker',async()=>{
 const config=await queueRoots('video-identity-');let inspected=false;
 assert.equal(await inspectVideoRuntime({...config,modelRevision:'different'},{docker:async()=>{inspected=true;}}),false);
 assert.equal(inspected,false);
});

test('empty queue polling leaves dependency inspection to the heartbeat',async()=>{
 const config=await queueRoots('video-idle-runtime-');let inspections=0;
 const dependencies={statfs:plenty,docker:async(args)=>{inspections++;return inspectImages(args);}};
 assert.equal((await publishVideoReadiness(config,dependencies)).accepting,true);
 assert.equal(inspections,1);
 for(let tick=0;tick<3;tick++)assert.equal(await runVideoOne(config,dependencies),null);
 assert.equal(inspections,1);
 await publishVideoReadiness(config,dependencies);assert.equal(inspections,2);
});

test('already started expired work retains uncertain recovery when runtime dependencies disappear',async()=>{
 const config=await queueRoots('video-started-recovery-');
 const claimed=join(config.privateRoot,id);await mkdir(claimed);const request=await writeValidVideoRequest(claimed,id,1000000);
 await writeFile(join(claimed,'started'),'previous-attempt');await rm(config.model,{recursive:true});
 const commands=[];let executed=false;
 const dependencies={now:()=>request.deadlineAt+360000,statfs:plenty,docker:async(args)=>{commands.push(args);throw Error('docker unavailable');},executeReserved:async()=>{executed=true;}};
 assert.equal((await publishVideoReadiness(config,dependencies)).accepting,false);
 assert.deepEqual(await runVideoOne(config,dependencies),{id,status:'uncertain'});
 assert.equal(executed,false);assert.deepEqual(commands,[['rm','-f',`xgs-video-tts-${id}`],['rm','-f',`xgs-video-render-${id}`]]);
 const terminal=JSON.parse(await readFile(join(config.results,id,'result.json'),'utf8'));
 assert.deepEqual(terminal,{schemaVersion:1,id,inputHash:request.inputHash,executionAttempt:request.executionAttempt,runtime:videoRuntimeIdentity(config),status:'uncertain',errorCode:'UNCERTAIN'});
 assert.equal(await readFile(join(claimed,'started'),'utf8'),'previous-attempt');
 assert.equal(await runVideoOne(config,dependencies),null);assert.equal(commands.length,2);
});

test('video manifest validates its original lifetime even after expiration',async()=>{
 const dir=await mkdtemp(join(testRoot,'video-lifetime-'));
 const request=await writeValidVideoRequest(dir,id,1000000);
 for(const lifetime of [60000,360000]){
  const original={...request,deadlineAt:request.createdAt+lifetime};
  await writeFile(join(dir,'request.json'),JSON.stringify(original));
  assert.deepEqual(await validateVideoRequest(dir,id,original.deadlineAt+1),original);
 }
 for(const change of [
  ...['createdAt','deadlineAt'].flatMap(key=>[null,'1000000',1000000.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1].map(value=>({[key]:value}))),
  {createdAt:1000001},{deadlineAt:1059999},{deadlineAt:1360001},
 ]){
  await writeFile(join(dir,'request.json'),JSON.stringify({...request,...change}));
  await assert.rejects(validateVideoRequest(dir,id,1000000),/INVALID_REQUEST/);
 }
});

test('prolonged runtime loss expires claimed work without quarantine or resubmission',async()=>{
 const config=await queueRoots('video-loss-expiry-');let now=Date.now(),executions=0;
 const incoming=join(config.inbox,id);await mkdir(incoming);const request=await writeValidVideoRequest(incoming,id,now);
 const original=await readFile(join(incoming,'request.json'));
 const dependencies={now:()=>now,statfs:plenty,docker:inspectImages,
  afterValidation:async()=>rm(config.model,{recursive:true}),
  executeReserved:async()=>{executions++;return {id,status:'execution_boundary'};},
 };
 assert.equal(await runVideoOne(config,dependencies),null);delete dependencies.afterValidation;
 const claimed=join(config.privateRoot,id);
 now=request.deadlineAt-59999;assert.equal(await runVideoOne(config,dependencies),null);
 assert.equal((await readdir(claimed)).includes('started'),false);
 now=request.deadlineAt;
 assert.deepEqual(await runVideoOne(config,dependencies),{id,status:'failed'});
 const terminal=JSON.parse(await readFile(join(config.results,id,'result.json'),'utf8'));
 assert.deepEqual(terminal,{schemaVersion:1,id,inputHash:request.inputHash,executionAttempt:request.executionAttempt,runtime:videoRuntimeIdentity(config),status:'failed',errorCode:'DEADLINE_EXCEEDED'});
 assert.deepEqual(await readFile(join(claimed,'request.json')),original);
 assert.deepEqual(await readdir(config.privateRoot),[id]);assert.equal((await readdir(claimed)).includes('started'),false);
 await mkdir(config.model);assert.equal(await runVideoOne(config,dependencies),null);assert.equal(executions,0);
});

test('queued expiration publishes a deadline failure after dependency repair without execution',async()=>{
 const config=await queueRoots('video-queued-expiry-');let now=Date.now(),executions=0;
 const incoming=join(config.inbox,id);await mkdir(incoming);const request=await writeValidVideoRequest(incoming,id,now);
 const original=await readFile(join(incoming,'request.json'));await rm(config.model,{recursive:true});
 const dependencies={now:()=>now,statfs:plenty,docker:inspectImages,executeReserved:async()=>{executions++;return {id,status:'execution_boundary'};}};
 assert.equal(await runVideoOne(config,dependencies),null);assert.deepEqual(await readdir(config.inbox),[id]);
 now=request.deadlineAt+1;await mkdir(config.model);
 assert.deepEqual(await runVideoOne(config,dependencies),{id,status:'failed'});
 assert.equal(JSON.parse(await readFile(join(config.results,id,'result.json'),'utf8')).errorCode,'DEADLINE_EXCEEDED');
 const claimed=join(config.privateRoot,id);assert.equal((await readdir(claimed)).includes('started'),false);
 assert.deepEqual(await readFile(join(claimed,'request.json')),original);
 assert.equal(await runVideoOne(config,dependencies),null);assert.equal(executions,0);
});

test('Docker stages consume the original remaining budget and skip an expired renderer',async()=>{
 const config=await queueRoots('video-stage-budget-'),claimed=join(config.privateRoot,id);await mkdir(claimed);
 const request=await writeValidVideoRequest(claimed);let now=request.deadlineAt-59999;
 const original=await readFile(join(claimed,'request.json')),runs=[];
 config.scripts=dirname(fileURLToPath(import.meta.url));
 const result=await runVideoOne(config,{now:()=>now,statfs:plenty,docker:async(args,timeout)=>{
  if(args[0]==='image')return inspectImages(args);
  if(args[0]==='rm')return {stdout:''};
  assert.equal(args[0],'run');runs.push({name:args[2],timeout});
  assert.equal(args[2],`xgs-video-tts-${id}`);
  await writeFile(join(claimed,'tts','narration.json'),JSON.stringify({provider:'Qwen3-TTS',speaker:'Serena',scenes:roles.map((_,i)=>({start:i,cues:[]}))}));
  await writeFile(join(claimed,'tts','narration.wav'),'wav');now=request.deadlineAt;
  return {stdout:''};
 }});
 assert.deepEqual(result,{id,status:'failed'});
 assert.deepEqual(runs,[{name:`xgs-video-tts-${id}`,timeout:59999}]);
 assert.equal(JSON.parse(await readFile(join(config.results,id,'result.json'),'utf8')).errorCode,'DEADLINE_EXCEEDED');
 assert.deepEqual(await readFile(join(claimed,'request.json')),original);
});

test('renderer completion at the deadline retains outputs but publishes deadline failure',async()=>{
 const config=await queueRoots('video-final-deadline-'),claimed=join(config.privateRoot,id);await mkdir(claimed);
 const request=await writeValidVideoRequest(claimed);let now=request.createdAt;
 config.scripts=dirname(fileURLToPath(import.meta.url));
 const result=await runVideoOne(config,{now:()=>now,statfs:plenty,docker:async(args)=>{
  if(args[0]==='image')return inspectImages(args);
  if(args[0]==='rm')return {stdout:''};
  if(args[2]===`xgs-video-tts-${id}`){
   await writeFile(join(claimed,'tts','narration.json'),JSON.stringify({provider:'Qwen3-TTS',speaker:'Serena',scenes:roles.map((_,i)=>({start:i,cues:[]}))}));
   await writeFile(join(claimed,'tts','narration.wav'),'wav');
  }else{
   assert.equal(args[2],`xgs-video-render-${id}`);
   await writeFile(join(claimed,'output','ro-science-explainer.mp4'),'completed-video');
   await writeFile(join(claimed,'output','metrics.json'),JSON.stringify({completeDecode:true,renderMode:'onchip-field-sampling-animation',audioMode:'continuous',width:1280,height:720,durationSeconds:10}));
   now=request.deadlineAt;
  }
  return {stdout:''};
 }});
 assert.deepEqual(result,{id,status:'failed'});
 assert.equal(JSON.parse(await readFile(join(config.results,id,'result.json'),'utf8')).errorCode,'DEADLINE_EXCEEDED');
 assert.equal(await readFile(join(claimed,'output','ro-science-explainer.mp4'),'utf8'),'completed-video');
});

test('success publication rechecks deadline after output persistence before terminal marker',async()=>{
 const config=await queueRoots('video-publication-deadline-');
 const request={id,inputHash:'d'.repeat(64),executionAttempt:1,deadlineAt:100};
 await assert.rejects(publishVideoResult(config,request,'succeeded',undefined,
  {videoBytes:Buffer.from('video'),metricsBytes:Buffer.from('{}'),result:{}},()=>100),/DEADLINE_EXCEEDED/);
 assert.equal((await readdir(join(config.results,id))).includes('result.json'),false);
 assert.equal(await readFile(join(config.results,id,'result.mp4'),'utf8'),'video');
});

for(const expired of [true,false])test(`Docker child termination ${expired?'at':'before'} the deadline keeps the correct terminal error`,async()=>{
 const config=await queueRoots('video-child-timeout-'),claimed=join(config.privateRoot,id);await mkdir(claimed);
 const request=await writeValidVideoRequest(claimed);let now=request.createdAt,runs=0;
 const childError=await exec(process.execPath,['-e','setInterval(()=>{},1000)'],{timeout:20}).catch(error=>error);
 assert.equal(childError.killed,true);
 const result=await runVideoOne(config,{now:()=>now,statfs:plenty,docker:async(args)=>{
  if(args[0]==='image')return inspectImages(args);
  if(args[0]==='rm')return {stdout:''};
  assert.equal(args[0],'run');runs++;if(expired)now=request.deadlineAt;throw childError;
 }});
 assert.deepEqual(result,{id,status:'failed'});assert.equal(runs,1);
 assert.equal(JSON.parse(await readFile(join(config.results,id,'result.json'),'utf8')).errorCode,expired?'DEADLINE_EXCEEDED':'EXECUTION_FAILED');
});

test('capacity inspection crossing the deadline cannot replace expiry with a low-space failure',async()=>{
 const config=await queueRoots('video-capacity-expiry-'),claimed=join(config.privateRoot,id);await mkdir(claimed);
 const request=await writeValidVideoRequest(claimed);let now=request.createdAt,dockerCalls=0,executions=0;
 const result=await runVideoOne(config,{now:()=>now,
  statfs:async()=>{now=request.deadlineAt;return {bavail:1n,bsize:1024n};},
  docker:async()=>{dockerCalls++;},executeReserved:async()=>{executions++;},
 });
 assert.deepEqual(result,{id,status:'failed'});assert.equal(dockerCalls,0);assert.equal(executions,0);
 assert.equal(JSON.parse(await readFile(join(config.results,id,'result.json'),'utf8')).errorCode,'DEADLINE_EXCEEDED');
 assert.equal((await readdir(claimed)).includes('started'),false);
});

for(const available of [true,false])test(`readiness crosses the deadline before reservation (available=${available})`,async()=>{
 const config=await queueRoots('video-inspection-expiry-');let now=Date.now(),executions=0;
 const claimed=join(config.privateRoot,id);await mkdir(claimed);const request=await writeValidVideoRequest(claimed,id,now);
 const result=await runVideoOne(config,{now:()=>now,statfs:plenty,
  docker:async(args)=>{await inspectImages(args);now=request.deadlineAt;if(!available)throw Error('docker unavailable');return {stdout:''};},
  executeReserved:async()=>{executions++;return {id,status:'execution_boundary'};},
 });
 assert.deepEqual(result,{id,status:'failed'});assert.equal(executions,0);
 assert.equal(JSON.parse(await readFile(join(config.results,id,'result.json'),'utf8')).errorCode,'DEADLINE_EXCEEDED');
 assert.equal((await readdir(claimed)).includes('started'),false);
});

test('expired claimed work still authenticates identity, hashes and claimed files before recovery',async()=>{
 for(const damage of ['identity','inputHash','scene','request-file']){
  const config=await queueRoots('video-expired-invalid-'),claimed=join(config.privateRoot,id);await mkdir(claimed);
  const request=await writeValidVideoRequest(claimed);await writeFile(join(claimed,'started'),'previous-attempt');
  if(damage==='identity')request.taskId='10000000-0000-4000-8000-000000000002';
  if(damage==='inputHash')request.inputHash='f'.repeat(64);
  await writeFile(join(claimed,'request.json'),JSON.stringify(request));
  if(damage==='scene')await writeFile(join(claimed,'scene-0.png'),'bad-0');
  if(damage==='request-file'){await rm(join(claimed,'request.json'));await mkdir(join(claimed,'request.json'));}
  let dockerCalls=0,executions=0;
  assert.deepEqual(await runVideoOne(config,{now:()=>request.deadlineAt+1,statfs:plenty,docker:async()=>{dockerCalls++;},executeReserved:async()=>{executions++;}}),{id,status:'invalid'});
  assert.equal(dockerCalls,0);assert.equal(executions,0);assert.equal((await readdir(config.results)).includes(id),false);
  assert.equal((await readdir(join(config.privateRoot,'quarantine'))).length,1);
 }
});

for(const failure of [null,'file-sync','parent-sync','exclusive'])test(`started reservation is durable and exclusive before execution (${failure??'success'})`,async()=>{
 const config=await queueRoots('video-reservation-'),claimed=join(config.privateRoot,id);await mkdir(claimed);
 const request=await writeValidVideoRequest(claimed),started=join(claimed,'started');
 const events=[];let executions=0;
 const dependencies={now:()=>request.createdAt,statfs:plenty,platform:'linux',
  docker:async(args)=>{if(args[0]==='image')return inspectImages(args);assert.equal(args[0],'rm');return {stdout:''};},
  open:async(path,flags,mode)=>{
   if(path===started){
    assert.equal(flags,'wx');assert.equal(mode,0o600);
    if(failure==='exclusive')await writeFile(started,'other-reservation');
    const file=await open(path,flags,mode);
    return {
     writeFile:async(bytes)=>{events.push('write');await file.writeFile(bytes);},
     sync:async()=>{events.push('file-sync');if(failure==='file-sync')throw Object.assign(Error('file sync failed'),{code:'EIO'});await file.sync();},
     close:async()=>{events.push('file-close');await file.close();},
    };
   }
   assert.equal(path,claimed);assert.equal(flags,'r');
   // Exercise the POSIX directory-sync path on Windows without opening a real directory handle.
   return {sync:async()=>{events.push('parent-sync');if(failure==='parent-sync')throw Object.assign(Error('parent sync failed'),{code:'EIO'});},close:async()=>{events.push('parent-close');}};
  },
  executeReserved:async()=>{executions++;assert.deepEqual(events,['write','file-sync','file-close','parent-sync','parent-close']);return {id,status:'execution_boundary'};},
 };
 if(failure){
  await assert.rejects(runVideoOne(config,dependencies),{code:failure==='exclusive'?'EEXIST':'EIO'});
  assert.equal(executions,0);assert.equal((await readdir(claimed)).includes('tts-input'),false);
  assert.deepEqual(events,failure==='file-sync'?['write','file-sync','file-close']:failure==='parent-sync'?['write','file-sync','file-close','parent-sync','parent-close']:[]);
 }else assert.deepEqual(await runVideoOne(config,dependencies),{id,status:'execution_boundary'});
 const marker=await readFile(started,'utf8');assert.equal(marker,failure==='exclusive'?'other-reservation':String(request.createdAt));
 assert.deepEqual(await runVideoOne(config,dependencies),{id,status:'uncertain'});
 assert.equal(executions,failure?0:1);assert.equal(await readFile(started,'utf8'),marker);
 assert.equal(JSON.parse(await readFile(join(config.results,id,'result.json'),'utf8')).errorCode,'UNCERTAIN');
});
