import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { chmod, chown, lstat, mkdir, open, readdir, rename, statfs, utimes, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import { atomicWrite, exists, safeRead, UUID } from './core.mjs';

const exec = promisify(execFile);
const ROLES = ['driver_signal','tip_enhancement','emission_collection','delay_scan','field_reconstruction'];
const OBJECT_KINDS = ['rect','ellipse','arrow','trace','label'];
const OBJECT_COLORS = ['ink','blue','teal','amber','muted'];
const ACTION_KINDS = ['enter','fade','translate','pulse','draw','highlight'];
const SHA = /^[a-f0-9]{64}$/;
const MIN_FREE_BYTES = 2n * 1024n * 1024n * 1024n;
async function docker(args, timeout=360000){return exec('docker',args,{timeout,maxBuffer:128*1024,encoding:'utf8'});}
function invalid(){throw Error('INVALID_REQUEST');}
async function directory(path){const s=await lstat(path);if(!s.isDirectory()||s.isSymbolicLink())throw Error('UNSAFE_DIRECTORY');}
function strictObject(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==[...keys].sort().join(','))invalid();return value;}
function unit(value){return typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1;}
function boundedText(value,max){if(typeof value!=='string'||!value.trim()||value.length>max)invalid();return value;}
function storyboardPresentation(value){
 const locale=value?.locale===undefined?'zh':value.locale;
 const style=value?.style===undefined?'technical':value.style;
 if(!['zh','en'].includes(locale)||!['watercolor','technical','ink'].includes(style))invalid();
 return {locale,style};
}
function validateAnimation(value,sceneClaimIds){
 const plan=strictObject(value,['objects','actions']);
 if(!Array.isArray(plan.objects)||plan.objects.length<1||plan.objects.length>12||!Array.isArray(plan.actions)||plan.actions.length<1||plan.actions.length>16)invalid();
 const objects=plan.objects.map(raw=>{
  const kind=raw?.kind;const item=strictObject(raw,['id','kind','x','y','width','height','color','sourceClaimIds',...(kind==='label'?['label']:[]),...(['arrow','trace'].includes(kind)?['points']:[])]);
  if(typeof item.id!=='string'||!/^[a-z][a-z0-9_-]{0,31}$/.test(item.id)||!OBJECT_KINDS.includes(item.kind)||!OBJECT_COLORS.includes(item.color)
   ||!unit(item.x)||!unit(item.y)||!unit(item.width)||item.width===0||!unit(item.height)||item.height===0||item.x+item.width>1||item.y+item.height>1
   ||!Array.isArray(item.sourceClaimIds)||item.sourceClaimIds.length<1||item.sourceClaimIds.length>12||new Set(item.sourceClaimIds).size!==item.sourceClaimIds.length
   ||item.sourceClaimIds.some(id=>typeof id!=='string'||!sceneClaimIds.includes(id)))invalid();
  if(kind==='label')boundedText(item.label,60);
  if(['arrow','trace'].includes(kind)){
   if(!Array.isArray(item.points)||item.points.length<2||item.points.length>(kind==='arrow'?2:32))invalid();
   for(const rawPoint of item.points){const point=strictObject(rawPoint,['x','y']);if(!unit(point.x)||!unit(point.y))invalid();}
  }
  return item;
 });
 const byId=new Map(objects.map(item=>[item.id,item]));if(byId.size!==objects.length)invalid();
 const actions=plan.actions.map(raw=>{
  const kind=raw?.kind;const item=strictObject(raw,['kind','target','start','end','meaning','basis',...(kind==='translate'?['toX','toY']:[])]);const target=byId.get(item.target);
  const basis=strictObject(item.basis,['claimId','quote']);
  if(!target||!ACTION_KINDS.includes(kind)||!unit(item.start)||!unit(item.end)||item.start>=item.end
   ||typeof item.meaning!=='string'||!item.meaning.trim()||item.meaning.length>180
   ||typeof basis.claimId!=='string'||!target.sourceClaimIds.includes(basis.claimId)||typeof basis.quote!=='string'||basis.quote.trim().length<12||basis.quote.length>400)invalid();
  if(kind==='translate'&&(!unit(item.toX)||!unit(item.toY)||item.toX+target.width>1||item.toY+target.height>1))invalid();
  if(kind==='draw'&&!['arrow','trace'].includes(target.kind))invalid();return item;
 });
 if(new Set(actions.map(action=>`${action.target}\u0000${action.kind}`)).size!==actions.length)invalid();
 return {objects,actions,hasDynamic:actions.some(action=>['translate','pulse','draw'].includes(action.kind)&&byId.get(action.target).kind!=='label')};
}
function validateContentStoryboard(bytes,request){
 const raw=JSON.parse(bytes.toString());
 const value=strictObject(raw,['schemaVersion','title','scenes',...(Object.hasOwn(raw??{},'locale')?['locale']:[]),...(Object.hasOwn(raw??{},'style')?['style']:[])]);
 if(value.schemaVersion!==1||!Array.isArray(value.scenes)||value.scenes.length<3||value.scenes.length>6||value.scenes.length!==request.files.scenes.length)invalid();
 boundedText(value.title,120);
 const allowedClaims=new Set(request.sourceClaimIds);const covered=new Set();let hasDynamic=false;
 value.scenes.forEach(scene=>{
  const item=strictObject(scene,['title','narration','visualAction','durationSeconds','sourceClaimIds','animation']);
  boundedText(item.title,120);boundedText(item.narration,600);boundedText(item.visualAction,1000);
  if(!Number.isInteger(item.durationSeconds)||item.durationSeconds<4||item.durationSeconds>20||!Array.isArray(item.sourceClaimIds)||item.sourceClaimIds.length<1||item.sourceClaimIds.length>12
   ||new Set(item.sourceClaimIds).size!==item.sourceClaimIds.length||item.sourceClaimIds.some(id=>typeof id!=='string'||!allowedClaims.has(id)))invalid();
  item.sourceClaimIds.forEach(id=>covered.add(id));hasDynamic=validateAnimation(item.animation,item.sourceClaimIds).hasDynamic||hasDynamic;
 });
 if(!hasDynamic||request.sourceClaimIds.some(id=>!covered.has(id))||value.scenes.reduce((sum,scene)=>sum+scene.durationSeconds,0)<24||value.scenes.reduce((sum,scene)=>sum+scene.durationSeconds,0)>90)invalid();
 return value;
}

async function snapshotVideoRequest(dir,id,now=Date.now()){
 const raw=JSON.parse((await safeRead(join(dir,'request.json'),128*1024)).toString());const contentDriven=raw?.profile==='content-driven-v1';
 const request=strictObject(raw,['schemaVersion','id','taskId','executionAttempt','profile','inputHash','sourceClaimIds',...(contentDriven?[]:['sceneRoles']),'files','createdAt','deadlineAt','narration']);
 if(request.schemaVersion!==1||request.id!==id||request.taskId!==id||!UUID.test(id)||!['onchip-field-sampling-v1','content-driven-v1'].includes(request.profile)||!SHA.test(request.inputHash)
  ||!Number.isInteger(request.executionAttempt)||request.executionAttempt<1||request.createdAt>now||request.deadlineAt-now<60000||request.deadlineAt-now>360000
  ||!Array.isArray(request.sourceClaimIds)||request.sourceClaimIds.length<1||request.sourceClaimIds.length>12||new Set(request.sourceClaimIds).size!==request.sourceClaimIds.length
  ||request.sourceClaimIds.some(id=>typeof id!=='string'||!UUID.test(id))
  ||(!contentDriven&&JSON.stringify(request.sceneRoles)!==JSON.stringify(ROLES)))invalid();
 strictObject(request.narration,['provider','speaker','timingStatus']);
 if(request.narration.provider!=='Qwen3-TTS'||request.narration.speaker!=='Serena'||request.narration.timingStatus!=='estimated_requires_review')invalid();
 const files=strictObject(request.files,['storyboard','scenes']);
 const sceneCount=contentDriven&&Array.isArray(files.scenes)?files.scenes.length:5;
 const expected=[strictObject(files.storyboard,['name','size','sha256']),...((Array.isArray(files.scenes)&&files.scenes.length===sceneCount&&sceneCount>=3&&sceneCount<=6)?files.scenes.map(v=>strictObject(v,['name','size','sha256'])):(invalid(),[]))];
 const buffers=[];
 for(let i=0;i<expected.length;i++){
  const spec=expected[i],name=i===0?'storyboard.json':`scene-${i-1}.png`,limit=i===0?128*1024:10*1024*1024;
  if(spec.name!==name||!Number.isInteger(spec.size)||spec.size<1||spec.size>limit||!SHA.test(spec.sha256))invalid();
  const bytes=await safeRead(join(dir,name),limit);if(bytes.length!==spec.size||createHash('sha256').update(bytes).digest('hex')!==spec.sha256)invalid();buffers.push(bytes);
 }
 if(createHash('sha256').update(JSON.stringify(files)).digest('hex')!==request.inputHash)invalid();
 const storyboard=contentDriven?validateContentStoryboard(buffers[0],request):JSON.parse(buffers[0].toString());
 const presentation=storyboardPresentation(storyboard);
 return {request,storyboard:buffers[0],scenes:buffers.slice(1),presentation};
}
export async function validateVideoRequest(dir,id,now=Date.now()){return (await snapshotVideoRequest(dir,id,now)).request;}

async function prepare(path,uid=1000){await mkdir(path,{mode:0o700});await chown(path,uid,uid);await chmod(path,0o700);}
async function writeOwnedExclusive(path,bytes,uid){
 const file=await open(path,'wx',0o400);try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}
 await chown(path,uid,uid);await chmod(path,0o400);
}
const common=(name,memory,cpus,pids)=>['run','--name',name,'--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory',memory,'--memory-swap',memory,'--cpus',cpus,'--pids-limit',pids,'--tmpfs','/tmp:rw,noexec,nosuid,nodev,size=1g'];
export function videoRuntimeIdentity(config){
 if(!SHA.test(config.scriptDigest)||!/^sha256:[a-f0-9]{64}$/.test(config.ttsImage)||!/^sha256:[a-f0-9]{64}$/.test(config.rendererImage)
  ||typeof config.modelRevision!=='string'||config.modelRevision!==basename(config.model))throw Error('RUNTIME_IDENTITY');
 return {scriptDigest:config.scriptDigest,ttsImage:config.ttsImage,rendererImage:config.rendererImage,modelRevision:config.modelRevision};
}
export async function inspectVideoCapacity(privateRoot,statfsFn=statfs){
 const entries=await readdir(privateRoot,{withFileTypes:true});
 let retained=entries.filter(entry=>UUID.test(entry.name)).length;
 const quarantine=join(privateRoot,'quarantine');
 if(await exists(quarantine)){await directory(quarantine);retained+=(await readdir(quarantine)).length;}
 const stats=await statfsFn(privateRoot,{bigint:true});
 const freeBytes=BigInt(stats.bavail)*BigInt(stats.bsize);
 return {accepting:retained<20&&freeBytes>=MIN_FREE_BYTES,retained,freeBytes};
}
export async function publishVideoResult(config,request,status,errorCode,output){
 const dir=join(config.results,request.id);await mkdir(dir,{recursive:true,mode:0o750});await directory(dir);
 if(await exists(join(dir,'result.json'))){await safeRead(join(dir,'result.json'),128*1024);return;}
 if(output){await atomicWrite(join(dir,'result.mp4'),output.videoBytes,0o640);await atomicWrite(join(dir,'metrics.json'),output.metricsBytes,0o640);}
 const result={schemaVersion:1,id:request.id,inputHash:request.inputHash,executionAttempt:request.executionAttempt,runtime:videoRuntimeIdentity(config),status,...(errorCode?{errorCode}:{}),...(output?output.result:{})};
 await atomicWrite(join(dir,'result.json'),JSON.stringify(result),0o640);
}

export async function runVideoOne(config,dependencies={}){
 const capacity=()=>inspectVideoCapacity(config.privateRoot,dependencies.statfs??statfs);
 for(const path of [config.inbox,config.results,config.privateRoot])await directory(path);
 const queued=(await readdir(config.inbox)).filter(name=>UUID.test(name));
 const claimed=(await readdir(config.privateRoot)).filter(name=>UUID.test(name));
 let id;
 for(const candidate of [...new Set([...claimed,...queued])]){
  const completed=join(config.results,candidate,'result.json');
  if(await exists(completed))await safeRead(completed,128*1024);
  else{id=candidate;break;}
 }
 if(!id)return null;
 const privateDir=join(config.privateRoot,id),incoming=join(config.inbox,id);
 const wasClaimed=await exists(privateDir);
 if(!wasClaimed){if(!(await capacity()).accepting)return null;await rename(incoming,privateDir);}
 let snapshot;
 try{await directory(privateDir);snapshot=await snapshotVideoRequest(privateDir,id);}
 catch{
   const quarantine=join(config.privateRoot,'quarantine');await mkdir(quarantine,{recursive:true,mode:0o700});await directory(quarantine);
  const quarantined=join(quarantine,`${id}-${randomUUID()}`);await rename(privateDir,quarantined);
  await atomicWrite(join(quarantined,'invalid.json'),JSON.stringify({schemaVersion:1,id,status:'invalid',reason:'INVALID_REQUEST'}),0o600);
  return {id,status:'invalid'};
 }
 const request=snapshot.request;
 const contentDriven=request.profile==='content-driven-v1';
 await chown(privateDir,0,0);await chmod(privateDir,0o700);
 if(dependencies.afterValidation)await dependencies.afterValidation(request,privateDir);
 const started=join(privateDir,'started');
 if(await exists(started)){
  for(const kind of ['tts','render'])await docker(['rm','-f',`xgs-video-${kind}-${id}`]).catch(()=>{});
  await publishVideoResult(config,request,'uncertain','UNCERTAIN');return {id,status:'uncertain'};
 }
 if((await capacity()).freeBytes<MIN_FREE_BYTES){await publishVideoResult(config,request,'failed','CAPACITY_CLOSED');return {id,status:'failed'};}
 await writeFile(started,String(Date.now()),{flag:'wx',mode:0o600});
 const ttsInput=join(privateDir,'tts-input'),tts=join(privateDir,'tts'),renderInput=join(privateDir,'render-input'),output=join(privateDir,'output');
 await prepare(ttsInput,10001);await writeOwnedExclusive(join(ttsInput,'storyboard.json'),snapshot.storyboard,10001);
 await prepare(tts,10001);await prepare(renderInput,1000);await prepare(output,1000);
 for(let i=0;i<snapshot.scenes.length;i++)await writeOwnedExclusive(join(renderInput,`scene-${i}.png`),snapshot.scenes[i],1000);
 if(dependencies.executeReserved)return dependencies.executeReserved(request,privateDir,{ttsInput,tts,renderInput,output});
 try{
  await docker([...common(`xgs-video-tts-${id}`,'12g','4','256'),'--user','10001:10001','-v',`${config.model}:/models/qwen3-tts-12hz-1.7b-customvoice:ro`,'-v',`${config.scripts}:/scripts:ro`,'-v',`${ttsInput}:/input:ro`,'-v',`${tts}:/output:rw`,'--entrypoint','python',config.ttsImage,'/scripts/video-tts.py'],Math.max(1,request.deadlineAt-Date.now()));
  const narration=JSON.parse((await safeRead(join(tts,'narration.json'),128*1024)).toString());
  const storyboard=JSON.parse(snapshot.storyboard.toString());
  const renderStoryboard={schemaVersion:1,title:storyboard.title,...snapshot.presentation,provider:narration.provider,speaker:narration.speaker,profile:request.profile,scenes:storyboard.scenes.map((scene,i)=>({title:scene.title,artwork:`scene-${i}.png`,start:narration.scenes[i].start,cues:narration.scenes[i].cues,...(contentDriven?{sourceClaimIds:scene.sourceClaimIds,animation:scene.animation}:{role:ROLES[i]})}))};
  await writeOwnedExclusive(join(renderInput,'storyboard.json'),Buffer.from(JSON.stringify(renderStoryboard)),1000);
  await writeOwnedExclusive(join(renderInput,'narration.wav'),await safeRead(join(tts,'narration.wav'),32*1024*1024),1000);
  await docker([...common(`xgs-video-render-${id}`,'4g','2','128'),'--user','1000:1000','-v',`${renderInput}:/input:ro`,'-v',`${output}:/output:rw`,config.rendererImage,'--input','/input','--output','/output'],Math.max(1,request.deadlineAt-Date.now()));
  const video=join(output,'ro-science-explainer.mp4'),metricsPath=join(output,'metrics.json');
  const bytes=await safeRead(video,128*1024*1024),metrics=JSON.parse((await safeRead(metricsPath,128*1024)).toString());
  const expectedRenderMode=contentDriven?'content-driven-animation':'onchip-field-sampling-animation';
  if(!metrics.completeDecode||metrics.renderMode!==expectedRenderMode||metrics.audioMode!=='continuous'||metrics.width!==1280||metrics.height!==720)throw Error('INVALID_RENDER');
  const result={outputSha256:createHash('sha256').update(bytes).digest('hex'),outputSize:bytes.length,contentType:'video/mp4',scriptDigest:config.scriptDigest,measuredDurationSeconds:metrics.durationSeconds};
  await publishVideoResult(config,request,'succeeded',undefined,{videoBytes:bytes,metricsBytes:await safeRead(metricsPath,128*1024),result});return {id,status:'succeeded'};
 }catch{await publishVideoResult(config,request,'failed','EXECUTION_FAILED');return {id,status:'failed'};}
 finally{for(const kind of ['tts','render'])await docker(['rm','-f',`xgs-video-${kind}-${id}`]).catch(()=>{});}
}

async function main(){
 if(process.getuid?.()!==0||process.argv.length!==4||process.argv[2]!=='--config')throw Error('CONFIG_REQUIRED');
 const configPath=resolve(process.argv[3]),stat=await lstat(configPath);if(stat.uid!==0||(stat.mode&0o022)||stat.isSymbolicLink())throw Error('CONFIG_PERMISSIONS');
 const config=JSON.parse((await safeRead(configPath,16384)).toString());config.scripts=dirname(fileURLToPath(import.meta.url));
 for(const key of ['inbox','results','privateRoot','model','scripts']){if(typeof config[key]!=='string'||!config[key].startsWith('/opt/'))throw Error('CONFIG_PATH');}
 for(const key of ['ttsImage','rendererImage'])if(typeof config[key]!=='string'||!/^sha256:[a-f0-9]{64}$/.test(config[key]))throw Error('IMAGE_ID');
 const runtime=videoRuntimeIdentity(config);
 let stopped=false;process.on('SIGTERM',()=>{stopped=true;});process.on('SIGINT',()=>{stopped=true;});
 const heartbeat=async()=>{const capacity=await inspectVideoCapacity(config.privateRoot);await atomicWrite(join(config.results,'.ready'),JSON.stringify({schemaVersion:1,updatedAt:Date.now(),runtime,...capacity,freeBytes:capacity.freeBytes.toString()}));};await heartbeat();const timer=setInterval(()=>heartbeat().catch(()=>{stopped=true;}),15000);
 try{while(!stopped){const result=await runVideoOne(config);if(!result)await sleep(1000);else console.log(JSON.stringify(result));}}finally{clearInterval(timer);await atomicWrite(join(config.results,'.ready'),JSON.stringify({schemaVersion:1,updatedAt:0,runtime,accepting:false}));await utimes(join(config.results,'.ready'),0,0);}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('VIDEO_RUNNER_FAILED_CLOSED');process.exitCode=1;});
