import { lstat, mkdir, open } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { safeRead, atomicWrite } from './core.mjs';
import { MiniMaxSpeechClient, MiniMaxSpeechError, validateMiniMaxSpeechRequest,
  downloadMiniMaxSpeechSubtitles } from '../../packages/ai-gateway/dist/minimax-speech.js';

const CONFIG = '/opt/openscience-video/minimax-cloud.json';
const fail = code => { throw new Error(code); };
async function sync(path) {
  if (process.platform === 'win32') return;
  const file = await open(path, 'r'); try { await file.sync(); } finally { await file.close(); }
}
async function reserve(path, value) {
  let file;
  try { file = await open(path, 'wx', 0o600); }
  catch(error) {if(error.code === 'EEXIST')return false;throw error;}
  try {await file.writeFile(value);await file.sync();}finally{await file.close();}
  await sync(dirname(path));return true;
}

/** One operator-owned narration pilot. Unknown outcomes never trigger another paid POST. */
export async function runNarrationPilot(options, dependencies = {}) {
  if ((dependencies.platform ?? process.platform) !== 'linux'
    || (dependencies.getuid ?? process.getuid)?.() !== 0) fail('NARRATION_ROOT_REQUIRED');
  const {command,requestFile} = options ?? {};
  if (!['prepare','submit','status','subtitles'].includes(command)
    || Object.keys(options).some(k=>!['command','requestFile'].includes(k))
    || (command === 'prepare' ? typeof requestFile !== 'string' : requestFile !== undefined)) fail('NARRATION_ARGUMENTS_INVALID');
  const inspect = dependencies.lstat ?? lstat;
  async function directories(path, privateLeaf=false) {
    for(let current=resolve(path);;current=dirname(current)) {
      const info=await inspect(current);
      if(!info.isDirectory()||info.isSymbolicLink()||info.uid!==0
        ||(info.mode & (privateLeaf&&current===resolve(path)?0o077:0o022))) fail('NARRATION_DIRECTORY_PERMISSIONS');
      if(dirname(current)===current)break;
    }
  }
  async function read(path,maximum=65536) {
    await directories(dirname(path));
    const info=await inspect(path);
    if(!info.isFile()||info.isSymbolicLink()||info.uid!==0||(info.mode&0o077))fail('NARRATION_FILE_PERMISSIONS');
    return safeRead(path,maximum);
  }
  async function optional(path,maximum) {
    try{return await read(path,maximum);}catch(error){if(error.code==='ENOENT')return null;throw error;}
  }
  const configPath=dependencies.configPath??CONFIG;
  const root=dirname(configPath),stateRoot=join(root,'minimax-ro-narration-pilot');
  const config=JSON.parse((await read(configPath)).toString('utf8'));
  if(config.baseUrl!=='https://api.minimax.cn'||config.apiKeyFile!==join(root,'secrets','minimax-video.key'))fail('NARRATION_CONFIG_INVALID');
  await directories(root);
  try {await mkdir(stateRoot,{mode:0o700});await sync(root);}catch(error){if(error.code!=='EEXIST')throw error;}
  await directories(stateRoot,true);
  const requestPath=join(stateRoot,'request.json');
  if(command==='prepare') {
    const request=validateMiniMaxSpeechRequest(JSON.parse((await read(resolve(requestFile))).toString('utf8')));
    const body=JSON.stringify(request);
    await reserve(requestPath,body);
    if((await read(requestPath)).toString('utf8')!==body)fail('NARRATION_REQUEST_MISMATCH');
  }
  const request=validateMiniMaxSpeechRequest(JSON.parse((await read(requestPath)).toString('utf8')));
  const saved=await optional(join(stateRoot,'result.json'));
  if(saved) {
    const result=JSON.parse(saved.toString('utf8'));
    const audio=await read(join(stateRoot,'audio.mp3'),8*1024*1024);
    if(result.status!=='succeeded'||result.bytes!==audio.length||result.metadata?.model!=='speech-2.8-hd')fail('NARRATION_INVALID_RESULT');
    if(command==='subtitles' && !(await optional(join(stateRoot,'subtitles.json'),1024*1024))) {
      if(typeof result.subtitleUrl!=='string')fail('NARRATION_SUBTITLES_UNAVAILABLE');
      const bytes=await (dependencies.downloadSubtitles??downloadMiniMaxSpeechSubtitles)(result.subtitleUrl);
      if(!Buffer.isBuffer(bytes)||bytes.length>1024*1024)fail('NARRATION_INVALID_SUBTITLES');
      JSON.parse(bytes.toString('utf8'));
      await reserve(join(stateRoot,'subtitles.json'),bytes);
    }
    return {status:'succeeded',path:join(stateRoot,'audio.mp3'),bytes:audio.length,metadata:result.metadata,
      subtitlesSaved:!!(await optional(join(stateRoot,'subtitles.json'),1024*1024))};
  }
  if(await optional(join(stateRoot,'create-attempt'))) {
    const failure=await optional(join(stateRoot,'failure.json'));
    const detail=failure?JSON.parse(failure.toString('utf8')):{};
    return {status:detail.outcome==='rejected'?'rejected':'uncertain',errorCode:
      typeof detail.errorCode==='string'&&/^SPEECH_[A-Z_]+$/u.test(detail.errorCode)?detail.errorCode:'NARRATION_ATTEMPT_ALREADY_RESERVED',
      ...(Number.isInteger(detail.providerCode)?{providerCode:detail.providerCode}:{})};
  }
  if(command!=='submit')return {status:'prepared',characters:[...request.text].length};
  await directories(dirname(config.apiKeyFile),true);
  const client=dependencies.getClient?await dependencies.getClient(config):new MiniMaxSpeechClient({
    baseUrl:config.baseUrl,apiKey:(await read(config.apiKeyFile,4096)).toString('utf8').replace(/\r?\n$/u,''),
  });
  if(!await reserve(join(stateRoot,'create-attempt'),JSON.stringify({request,reservedAt:Date.now()})))return {status:'uncertain'};
  let result;
  try {result=await client.synthesize(request);}
  catch(error) {
    const detail=error instanceof MiniMaxSpeechError?{outcome:error.outcome,errorCode:error.code,httpStatus:error.httpStatus,providerCode:error.providerCode}
      :{outcome:'uncertain',errorCode:'SPEECH_OPERATION_FAILED'};
    await reserve(join(stateRoot,'failure.json'),JSON.stringify(detail));
    return {status:detail.outcome==='rejected'?'rejected':'uncertain',...detail};
  }
  if(!Buffer.isBuffer(result.audio)||!result.audio.length||result.audio.length>8*1024*1024)fail('NARRATION_INVALID_RESULT');
  // The reservation has a single owner; the final receipt is written after complete audio.
  await atomicWrite(join(stateRoot,'audio.mp3'),result.audio,0o600);
  await reserve(join(stateRoot,'result.json'),JSON.stringify({status:'succeeded',bytes:result.audio.length,
    metadata:result.metadata,subtitleUrl:result.subtitleUrl}));
  return {status:'succeeded',path:join(stateRoot,'audio.mp3'),bytes:result.audio.length,metadata:result.metadata,subtitlesSaved:false};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);
  const valid=args.length===1&&['submit','status','subtitles'].includes(args[0])
    ||args.length===3&&args[0]==='prepare'&&args[1]==='--request-file';
  if(!valid){console.error('NARRATION_ARGUMENTS_INVALID');process.exitCode=64;}
  else runNarrationPilot({command:args[0],...(args.length===3?{requestFile:args[2]}:{})}).then(result=>{
    console.log(JSON.stringify(result));if(['uncertain','rejected'].includes(result.status))process.exitCode=1;
  }).catch(error=>{
    const code=error instanceof MiniMaxSpeechError?error.code:/^NARRATION_[A-Z_]+$/u.test(error.message)?error.message:'NARRATION_OPERATION_FAILED';
    console.error(JSON.stringify({status:'failed',errorCode:code}));process.exitCode=1;
  });
}
