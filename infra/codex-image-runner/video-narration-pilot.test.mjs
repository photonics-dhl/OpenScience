import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,lstat,rm,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {runNarrationPilot} from './video-narration-pilot.mjs';

async function setup(t, synthesize) {
  await mkdir(resolve('tmp'),{recursive:true});
  const root=await mkdtemp(resolve('tmp/narration-test-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'secrets'));
  const configPath=join(root,'config.json'),requestFile=join(root,'input.json');
  await writeFile(configPath,JSON.stringify({baseUrl:'https://api.minimax.cn',apiKeyFile:join(root,'secrets','minimax-video.key')}));
  await writeFile(requestFile,JSON.stringify({text:'模型计算。',voiceId:'Chinese (Mandarin)_IntellectualGirl'}));
  const dependencies={configPath,platform:'linux',getuid:()=>0,getClient:async()=>({synthesize}),
    lstat:async path=>{
      const info=await lstat(path);
      return new Proxy(info,{get(target,key){if(key==='uid')return 0;if(key==='mode')return target.isDirectory()?0o700:0o600;
        const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
    }};
  await runNarrationPilot({command:'prepare',requestFile},dependencies);
  return {root,requestFile,dependencies};
}
const result=()=>({audio:Buffer.concat([Buffer.from('ID3'),Buffer.alloc(100)]),subtitleUrl:'https://cdn.example.org/s.json',metadata:{model:'speech-2.8-hd',sampleRate:32000,durationMs:1000}});
test('concurrent and replayed submissions make one paid call; subtitle retrieval reuses audio',async t=>{
  let calls=0;
  const {root,dependencies}=await setup(t,async()=>{calls++;await new Promise(r=>setTimeout(r,15));return result();});
  const outcomes=await Promise.all([runNarrationPilot({command:'submit'},dependencies),runNarrationPilot({command:'submit'},dependencies)]);
  assert.equal(calls,1);assert.ok(outcomes.some(r=>r.status==='succeeded'));
  assert.equal((await runNarrationPilot({command:'submit'},dependencies)).status,'succeeded');assert.equal(calls,1);
  dependencies.downloadSubtitles=async()=>Buffer.from('[{"text":"模型计算。","start":0,"end":1000}]');
  assert.equal((await runNarrationPilot({command:'subtitles'},dependencies)).subtitlesSaved,true);assert.equal(calls,1);
  assert.deepEqual(await readFile(join(root,'minimax-ro-narration-pilot','audio.mp3')),result().audio);
});
test('unknown speech failure keeps its attempt and never retries',async t=>{
  let calls=0;const {dependencies}=await setup(t,async()=>{calls++;throw Error('private server error');});
  const first=await runNarrationPilot({command:'submit'},dependencies);assert.equal(first.status,'uncertain');
  assert.equal((await runNarrationPilot({command:'submit'},dependencies)).status,'uncertain');assert.equal(calls,1);
  assert.ok(!JSON.stringify(first).includes('private server'));
});
test('partial reservation prevents a second call after an interrupted producer',async t=>{
  let calls=0;const {root,dependencies}=await setup(t,async()=>{calls++;return result();});
  await writeFile(join(root,'minimax-ro-narration-pilot','create-attempt'),'');
  assert.equal((await runNarrationPilot({command:'submit'},dependencies)).status,'uncertain');assert.equal(calls,0);
});
test('preparation with altered text does not replace the saved request',async t=>{
  const {requestFile,dependencies}=await setup(t,async()=>result());
  await writeFile(requestFile,JSON.stringify({text:'不同文本。',voiceId:'Chinese (Mandarin)_IntellectualGirl'}));
  await assert.rejects(()=>runNarrationPilot({command:'prepare',requestFile},dependencies),/NARRATION_REQUEST_MISMATCH/);
});
