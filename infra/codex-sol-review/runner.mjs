import { constants } from 'node:fs';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { access, chmod, chown, lstat, mkdir, open, readdir, realpath, rename, utimes } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { validateCodexSolReviewRequest } from '../../packages/ai-gateway/dist/codex-sol-review-protocol.js';

const exec=promisify(execFile);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const missing=error=>error?.code==='ENOENT';
async function exists(path){try{await access(path);return true;}catch(error){if(missing(error))return false;throw error;}}
async function safeRead(path,limit){
  const before=await lstat(path);if(!before.isFile()||before.isSymbolicLink()||before.size>limit)throw Error('UNSAFE_FILE');
  const file=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  try{const after=await file.stat();if(!after.isFile()||after.ino!==before.ino||after.dev!==before.dev||after.size>limit)throw Error('UNSAFE_FILE');
    const data=Buffer.alloc(limit+1);let count=0;
    while(count<=limit){const {bytesRead}=await file.read(data,count,data.length-count,count);if(!bytesRead)break;count+=bytesRead;}
    if(count!==after.size||count>limit)throw Error('UNSAFE_FILE');return data.subarray(0,count);
  }finally{await file.close();}
}
async function atomicWrite(path,bytes,mode=0o640){
  const temp=`${path}.${randomUUID()}.tmp`;const file=await open(temp,'wx',mode);
  try{await file.chown(0,11000);await file.writeFile(bytes);await file.sync();}finally{await file.close();}
  await rename(temp,path);const parent=await open(dirname(path),'r');try{await parent.sync();}finally{await parent.close();}
}
async function prepare(path){
  try{await mkdir(path,{mode:0o700});await chown(path,1000,1000);await chmod(path,0o700);}
  catch(error){
    if(error?.code!=='EEXIST')throw error;
    const stat=await lstat(path);
    if(!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==1000||(stat.mode&0o777)!==0o700)throw Error('UNSAFE_JOB_DIRECTORY');
  }
}
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const docker=(args,timeout=30000)=>exec('docker',args,{timeout,maxBuffer:128*1024,encoding:'utf8'});
function containerArgs(kind,config,job){
  if(!UUID.test(job.id)||!/^sha256:[a-f0-9]{64}$/.test(config.nodeImage))throw Error('CONTAINER_IDENTITY');
  for(const path of [config.runtime,config.auth,config.scripts,job.dir])if(!path.startsWith('/opt/')||/[,\n\r:]/.test(path))throw Error('CONTAINER_PATH');
  const name=`xgs-sol-review-${kind}-${job.id}`;
  const common=['run','--pull','never','--name',name,'--user','1000:1000','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--cpus','1','--pids-limit','128','--ulimit','fsize=33554432:33554432','--label','openscience.role=codex-sol-image-review'];
  if(kind==='proxy')return [...common,'-d','--network','host','--memory','128m','--memory-swap','128m','-e','XGS_PROXY_MAX_MS=1800000',
    '-v',`${config.scripts}/../codex-image-runner:/scripts:ro`,'-v',`${job.dir}/socket:/proxy:rw`,config.nodeImage,'node','/scripts/proxy.mjs'];
  if(kind==='model')return [...common,'--network','none','--memory','1g','--memory-swap','1g','--tmpfs','/tmp:rw,nosuid,nodev,noexec,size=128m',
    '-e','CODEX_HOME=/state','-v',`${config.runtime}:/runtime:ro`,'-v',`${dirname(config.auth)}:/state:rw`,
    '-v',`${job.dir}/work:/work:rw`,'-v',`${job.dir}/input:/input:ro`,
    '-v',`${config.scripts}:/scripts:ro`,'-v',`${job.dir}/socket:/proxy:ro`,'-w','/work',config.nodeImage,
    'timeout','--signal=TERM','--kill-after=5','1560','node','/scripts/review-client.mjs'];
  throw Error('CONTAINER_KIND');
}
async function publish(config,request,status,errorCode,text){
  const dir=join(config.results,request.id);await mkdir(dir,{mode:0o750});
  if(await exists(join(dir,'result.json')))return;
  if(text!==undefined)await atomicWrite(join(dir,'response.txt'),text);
  await atomicWrite(join(dir,'result.json'),JSON.stringify({schemaVersion:1,provider:request.provider,model:request.model,
    id:request.id,promptHash:request.promptHash,status,...(text!==undefined?{responseHash:digest(Buffer.from(text,'utf8'))}:{}),
    ...(errorCode?{errorCode}:{})}));
}
async function prepareJob(config,request,dir){
  for(const sub of ['socket','work','input'])await prepare(join(dir,sub));
  const attachment=request.attachments[0];
  const original=await safeRead(join(config.inbox,`${request.id}.${attachment.fileName}`),10*1024*1024);
  if(digest(original)!==attachment.sha256)throw Error('IMAGE_CHANGED');
  const imagePath=join(dir,'input',attachment.fileName);
  await atomicWrite(imagePath,original,0o400);await chown(imagePath,1000,1000);await chmod(imagePath,0o400);
  const requestPath=join(dir,'input/request.json');
  await atomicWrite(requestPath,JSON.stringify({model:request.model,reasoningEffort:request.reasoningEffort,prompt:request.prompt,
    attachments:request.attachments}),0o400);await chown(requestPath,1000,1000);await chmod(requestPath,0o400);
  const schemaPath=join(dir,'input/schema.json');
  const schema={type:'object',additionalProperties:false,required:['decision','summary','repairInstruction'],properties:{
    decision:{type:'string',enum:['accepted','blocked']},summary:{type:'string'},repairInstruction:{type:['string','null']}}};
  await atomicWrite(schemaPath,JSON.stringify(schema),0o400);await chown(schemaPath,1000,1000);await chmod(schemaPath,0o400);
}
async function execute(config,request,dir){
  const job={id:request.id,dir};
  try{
    await docker(containerArgs('proxy',config,job));
    for(let i=0;i<40&&!(await exists(join(dir,'socket/egress.sock')));i++)await sleep(100);
    if(!(await exists(join(dir,'socket/egress.sock'))))throw Error('PROXY_UNAVAILABLE');
    await docker(containerArgs('model',config,job),Math.min(1_620_000,Math.max(1,request.deadlineAt-Date.now()-30_000)));
    const text=(await safeRead(join(dir,'work/response.txt'),64*1024)).toString('utf8');
    const value=JSON.parse(text);
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='decision,repairInstruction,summary'
      ||!['accepted','blocked'].includes(value.decision)||typeof value.summary!=='string'||!value.summary.trim()||value.summary.length>2000
      ||(value.repairInstruction!==null&&(typeof value.repairInstruction!=='string'||!value.repairInstruction.trim()||value.repairInstruction.length>400))
      ||(value.decision==='accepted'&&value.repairInstruction!==null))throw Error('INVALID_MODEL_OUTPUT');
    return text;
  }finally{for(const kind of ['model','proxy'])await docker(['rm','-f',`xgs-sol-review-${kind}-${request.id}`]).catch(()=>{});}
}
async function runOne(config){
  const auth=await lstat(config.auth);
  if(!auth.isFile()||auth.isSymbolicLink()||auth.uid!==1000||(auth.mode&0o777)!==0o600)throw Error('AUTH_PERMISSIONS');
  const queued=(await readdir(config.inbox)).filter(name=>name.endsWith('.json')&&UUID.test(name.slice(0,-5))&& !name.endsWith('.submitted.json')).map(name=>name.slice(0,-5));
  const claimed=(await readdir(config.privateRoot)).filter(name=>UUID.test(name));
  const ids=[...new Set([...claimed,...queued])].sort();
  for(const id of ids){
    if(await exists(join(config.results,id,'result.json')))continue;
    const dir=join(config.privateRoot,id);if(!await exists(dir))await mkdir(dir,{mode:0o700});
    const requestPath=join(dir,'request.json');
    if(!await exists(requestPath)){
      const source=join(config.inbox,`${id}.json`);if(!await exists(source))continue;
      await rename(source,requestPath);
    }
    let request;
    try{request=validateCodexSolReviewRequest(JSON.parse((await safeRead(requestPath,96*1024)).toString('utf8')));if(request.id!==id)throw Error('REQUEST_ID');}
    catch{
      const quarantine=join(config.privateRoot,'quarantine');await mkdir(quarantine,{mode:0o700});
      await rename(dir,join(quarantine,`${id}-${randomUUID()}`));
      console.error('INVALID_REVIEW_REQUEST');return{id,status:'invalid'};
    }
    const started=join(dir,'started');
    if(await exists(started)){await publish(config,request,'uncertain','UNCERTAIN');return {id,status:'uncertain'};}
    if(request.deadlineAt-Date.now()<90_000||request.createdAt>Date.now()){await publish(config,request,'failed','EXPIRED');return {id,status:'failed'};}
    try{await prepareJob(config,request,dir);}
    catch{await publish(config,request,'failed','INVALID_INPUT');return{id,status:'failed'};}
    // A durable marker precedes external submission; a crash can never replay the model call.
    const marker=await open(started,'wx',0o600);try{await marker.writeFile(String(Date.now()));await marker.sync();}finally{await marker.close();}
    try{const text=await execute(config,request,dir);await publish(config,request,'succeeded',undefined,text);return{id,status:'succeeded'};}
    catch{await publish(config,request,'uncertain','UNCERTAIN');return{id,status:'uncertain'};}
  }
  return null;
}
export async function main(){
  if(process.getuid?.()!==0||process.argv.length!==4||process.argv[2]!=='--config')throw Error('CONFIG');
  const configPath=resolve(process.argv[3]);const stat=await lstat(configPath);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==0||(stat.mode&0o077))throw Error('CONFIG_PERMISSIONS');
  const config=JSON.parse((await safeRead(configPath,16*1024)).toString('utf8'));
  config.scripts=dirname(fileURLToPath(import.meta.url));
  for(const key of ['inbox','results','privateRoot','runtime','auth']){
    const path=config[key];if(typeof path!=='string'||!path.startsWith('/opt/')||await realpath(path)!==path)throw Error('CONFIG_PATH');
  }
  if(new Set([config.inbox,config.results,config.privateRoot]).size!==3)throw Error('CONFIG_SHARED_PATH');
  const auth=await lstat(config.auth);
  if(!auth.isFile()||auth.isSymbolicLink()||auth.uid!==1000||(auth.mode&0o777)!==0o600)throw Error('AUTH_PERMISSIONS');
  const state=await lstat(dirname(config.auth));
  if(!state.isDirectory()||state.isSymbolicLink()||state.uid!==1000||(state.mode&0o777)!==0o700)throw Error('AUTH_DIRECTORY_PERMISSIONS');
  if(!await exists(join(config.runtime,'node_modules/@openai/codex/bin/codex.js')))throw Error('RUNTIME_MISSING');
  if(!/^sha256:[a-f0-9]{64}$/.test(config.nodeImage))throw Error('IMAGE_ID');
  let stopped=false;process.on('SIGTERM',()=>{stopped=true;});process.on('SIGINT',()=>{stopped=true;});
  const heartbeat=()=>atomicWrite(join(config.results,'.ready'),JSON.stringify({schemaVersion:1,at:Date.now()}));
  await heartbeat();const timer=setInterval(()=>heartbeat().catch(()=>{stopped=true;process.exitCode=1;}),15000);
  try{while(!stopped){const outcome=await runOne(config);if(outcome)console.log(JSON.stringify(outcome));else await sleep(1000);}}
  finally{clearInterval(timer);await heartbeat();await utimes(join(config.results,'.ready'),0,0);}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('SOL_REVIEW_RUNNER_FAILED_CLOSED');process.exitCode=1;});
