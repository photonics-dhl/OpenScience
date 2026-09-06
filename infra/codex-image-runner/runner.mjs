import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, chown, chmod, lstat, readdir, realpath, utimes } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { runOne, safeRead, atomicWrite, exists } from './core.mjs';
import { containerArgs } from './sandbox.mjs';
import { validateImageBytes } from '../../packages/ai-gateway/dist/index.js';

const exec=promisify(execFile);
async function docker(args,timeout=30000){return exec('docker',args,{timeout,maxBuffer:128*1024,encoding:'utf8'});}
async function prepareDirectory(path){await mkdir(path,{mode:0o700});await chown(path,1000,1000);await chmod(path,0o700);}
async function imageFiles(dir,depth=0){
 if(depth>3)throw Error('OUTPUT_DEPTH');
 const result=[];
 for(const entry of await readdir(dir,{withFileTypes:true})){
  const p=join(dir,entry.name);if(entry.isSymbolicLink())throw Error('OUTPUT_SYMLINK');
  if(entry.isDirectory())result.push(...await imageFiles(p,depth+1));else if(entry.name.endsWith('.png'))result.push(p);
  if(result.length>1)throw Error('MULTIPLE_IMAGES');
 }
 return result;
}
export async function executeImage(config,request,dir){
 for(const sub of ['socket','state','work','input','normalized'])await prepareDirectory(join(dir,sub));
 const inputPath=join(dir,'input/request.json');
 await atomicWrite(inputPath,JSON.stringify({prompt:request.prompt}),0o400);
 // systemd's restrictive umask must not leave the drawing brief owned by root.
 await chown(inputPath,1000,1000);
 await chmod(inputPath,0o400);
 const job={id:request.id,dir};
 try{
  await docker(containerArgs('proxy',config,job));
  for(let n=0;n<40&&!(await exists(join(dir,'socket/egress.sock')));n++)await sleep(100);
  if(!(await exists(join(dir,'socket/egress.sock'))))throw Error('PROXY_UNAVAILABLE');
  await docker(containerArgs('model',config,job),Math.min(550000,Math.max(1,request.deadlineAt-Date.now()-45000)));
  const files=await imageFiles(join(dir,'state/generated_images'));
  if(files.length!==1)throw Error('IMAGE_MISSING');
  const original=await safeRead(files[0],10*1024*1024);
  if(original.length<33||original.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('INVALID_PNG');
  const w=original.readUInt32BE(16),h=original.readUInt32BE(20);
  if(!w||!h||w>4096||h>4096||w*h>16*1024*1024)throw Error('IMAGE_TOO_LARGE');
  await docker(containerArgs('normalize',config,{...job,rawImage:files[0]}),Math.min(45000,Math.max(1,request.deadlineAt-Date.now())));
  return validateImageBytes(await safeRead(join(dir,'normalized/result.png'),10*1024*1024)).bytes;
 }finally{
  for(const kind of ['model','normalize','proxy']){
   // Names are derived only from a validated UUID. No broad Docker cleanup.
   await docker(['rm','-f','xgs-codex-'+kind+'-'+request.id]).catch(()=>{});
  }
 }
}
async function main(){
 if(process.getuid?.()!==0)throw Error('ROOT_CONTROLLER_REQUIRED');
 if(process.argv.length!==4||process.argv[2]!=='--config')throw Error('CONFIG_REQUIRED');
 const configPath=resolve(process.argv[3]);const cs=await lstat(configPath);
 if(cs.uid!==0||(cs.mode&0o022)||cs.isSymbolicLink())throw Error('CONFIG_PERMISSIONS');
 const config=JSON.parse((await safeRead(configPath,16384)).toString());
 config.scripts=dirname(fileURLToPath(import.meta.url));
 for(const key of ['inbox','results','privateRoot','runtime','auth']){
  const p=config[key];if(typeof p!=='string'||!p.startsWith('/opt/')||await realpath(p)!==p)throw Error('CONFIG_PATH');
 }
 const auth=await lstat(config.auth);
 if(!auth.isFile()||auth.uid!==1000||(auth.mode&0o777)!==0o600)throw Error('AUTH_PERMISSIONS');
 if(config.inbox===config.results||config.privateRoot===config.inbox||config.privateRoot===config.results)throw Error('SHARED_PRIVATE_PATH');
 let stopped=false;process.on('SIGTERM',()=>{stopped=true;});process.on('SIGINT',()=>{stopped=true;});
 const heartbeat=()=>atomicWrite(join(config.results,'.ready'),JSON.stringify({schemaVersion:1,updatedAt:Date.now()}));
 await heartbeat();const timer=setInterval(()=>{heartbeat().catch(()=>{stopped=true;});},15000);
 try{while(!stopped){try{const result=await runOne({...config,execute:(r,d)=>executeImage(config,r,d)});if(result)console.log(JSON.stringify(result));else await sleep(1000);}catch{console.error('RUNNER_FAILED_CLOSED');stopped=true;}}}finally{clearInterval(timer);await atomicWrite(join(config.results,'.ready'),JSON.stringify({schemaVersion:1,updatedAt:0}));await utimes(join(config.results,'.ready'),0,0);}
 if(stopped)process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('RUNNER_START_FAILED');process.exitCode=1;});
