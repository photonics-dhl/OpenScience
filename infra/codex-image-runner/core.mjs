import { constants } from 'node:fs';
import { open, lstat, mkdir, readdir, rename, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateCodexImageRequest } from '../../packages/ai-gateway/dist/index.js';

export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function syncDirectory(path){if(process.platform==='win32')return;const f=await open(path,'r');try{await f.sync();}finally{await f.close();}}
export async function exists(path){try{await access(path);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
export async function safeRead(path,max){
 const s=await lstat(path);if(!s.isFile()||s.isSymbolicLink()||s.size>max)throw Error('UNSAFE_FILE');
 const f=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{const after=await f.stat();if(after.ino!==s.ino||after.dev!==s.dev||after.size>max)throw Error('UNSAFE_FILE');const b=Buffer.alloc(max+1);let n=0;while(n<=max){const r=await f.read(b,n,b.length-n,null);if(!r.bytesRead)break;n+=r.bytesRead;}if(n>max)throw Error('UNSAFE_FILE');return b.subarray(0,n);}finally{await f.close();}
}
export async function atomicWrite(path,bytes,mode=0o644){
 const temporary=path+'.'+randomUUID()+'.tmp';const f=await open(temporary,'wx',mode);
 try{await f.writeFile(bytes);await f.sync();}finally{await f.close();}
 await rename(temporary,path);
 await syncDirectory(dirname(path));
}
async function directory(path){const s=await lstat(path);if(!s.isDirectory()||s.isSymbolicLink())throw Error('UNSAFE_DIRECTORY');}
async function publish(results,request,status,errorCode,bytes){
 const dir=join(results,request.id);await mkdir(dir,{recursive:true,mode:0o755});await directory(dir);
 if(await exists(join(dir,'result.json')))return;
 if(bytes)await atomicWrite(join(dir,'result.png'),bytes);
 await atomicWrite(join(dir,'result.json'),JSON.stringify({schemaVersion:1,...(request.provider?{provider:request.provider}:{}),id:request.id,promptHash:request.promptHash,status,...(errorCode?{errorCode}:{})}));
}
/** Caller holds the host flock for the entire runner lifetime. Private ledger is never mounted in Worker. */
export async function runOne({inbox,results,privateRoot,provider,execute,now=Date.now}){
 for(const p of [inbox,results,privateRoot])await directory(p);
 const queued=(await readdir(inbox)).filter(n=>n.endsWith('.json')&&UUID.test(n.slice(0,-5))).map(n=>n.slice(0,-5));
 const claimed=(await readdir(privateRoot)).filter(n=>UUID.test(n));
 for(const id of [...new Set([...claimed,...queued])]){
  const privateDir=join(privateRoot,id),requestPath=join(privateDir,'request.json');
  if(await exists(join(results,id,'result.json')))continue;
  if(!(await exists(privateDir))){await mkdir(privateDir,{mode:0o700});await syncDirectory(privateRoot);}
  await directory(privateDir);
  if(!(await exists(requestPath))){
   const incoming=join(inbox,id+'.json');if(!(await exists(incoming)))continue;
   // Validate the file after atomic ownership transfer, never follow a submitted symlink.
   await rename(incoming,requestPath);
   await syncDirectory(privateDir);await syncDirectory(inbox);
  }
  let request;
  try{request=validateCodexImageRequest(JSON.parse((await safeRead(requestPath,16384)).toString()),undefined,provider);if(request.id!==id)throw Error('REQUEST_ID_MISMATCH');}
  catch{
   const quarantine=join(privateRoot,'quarantine');await mkdir(quarantine,{recursive:true,mode:0o700});await directory(quarantine);
   await rename(privateDir,join(quarantine,id+'-'+randomUUID()));await syncDirectory(quarantine);await syncDirectory(privateRoot);
   return {id,status:'invalid'};
  }
  const started=join(privateDir,'started');
  if(await exists(started)){await publish(results,request,'uncertain','UNCERTAIN');return {id,status:'uncertain'};}
  if(request.deadlineAt-now()<90000||request.createdAt>now()||request.deadlineAt-now()>600000){await publish(results,request,'failed','EXPIRED');return {id,status:'failed'};}
  const marker=await open(started,'wx',0o600);try{await marker.writeFile(String(now()));await marker.sync();}finally{await marker.close();}
  await syncDirectory(privateDir);
  try{
   const bytes=await execute(request,privateDir);
   if(request.deadlineAt<=now())throw Error('EXPIRED');
   await publish(results,request,'succeeded',undefined,bytes);
   return {id,status:'succeeded'};
  }catch(error){
   const uncertain=error?.code==='UNCERTAIN';
   await publish(results,request,uncertain?'uncertain':'failed',uncertain?'UNCERTAIN':'EXECUTION_FAILED');return {id,status:uncertain?'uncertain':'failed'};
  }
 }
 return null;
}
