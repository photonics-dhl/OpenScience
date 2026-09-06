import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { runOne } from './core.mjs';

const id='77777777-7777-4777-8777-777777777777';
async function fixture() {
 const root=await mkdtemp(join(tmpdir(),'xgs-codex-runner-'));
 const paths={inbox:join(root,'inbox'),results:join(root,'results'),privateRoot:join(root,'private')};
 for(const p of Object.values(paths))await mkdir(p);
 const request={schemaVersion:1,id,prompt:'A scientific picture',promptHash:createHash('sha256').update('A scientific picture').digest('hex'),createdAt:Date.now(),deadlineAt:Date.now()+600000};
 return {...paths,request};
}
test('publishes one result and never invokes a completed task twice',async()=>{
 const f=await fixture();await writeFile(join(f.inbox,id+'.json'),JSON.stringify(f.request));let calls=0;
 const execute=async()=>{calls++;return Buffer.from('validated-normalized-image');};
 await runOne({...f,execute});
 const result=JSON.parse(await readFile(join(f.results,id,'result.json'),'utf8'));
 assert.equal(result.status,'succeeded');assert.equal(result.promptHash,f.request.promptHash);
 await writeFile(join(f.inbox,id+'.json'),JSON.stringify(f.request));
 await runOne({...f,execute});assert.equal(calls,1);
});
test('started task without result fails uncertain after restart without executing again',async()=>{
 const f=await fixture();await mkdir(join(f.privateRoot,id));
 await writeFile(join(f.privateRoot,id,'request.json'),JSON.stringify(f.request));
 await writeFile(join(f.privateRoot,id,'started'),'started');
 await runOne({...f,execute:async()=>{throw Error('must not execute');}});
 assert.equal(JSON.parse(await readFile(join(f.results,id,'result.json'),'utf8')).status,'uncertain');
});
test('expired queue entry does not consume a model call',async()=>{
 const f=await fixture();f.request.createdAt-=700000;f.request.deadlineAt-=700000;
 await writeFile(join(f.inbox,id+'.json'),JSON.stringify(f.request));
 await runOne({...f,execute:async()=>{throw Error('must not execute');}});
 assert.equal(JSON.parse(await readFile(join(f.results,id,'result.json'),'utf8')).errorCode,'EXPIRED');
});
test('symlinked request is never followed',async()=>{
 const f=await fixture();const target=join(f.privateRoot,'unrelated');await writeFile(target,JSON.stringify(f.request));
 await symlink(target,join(f.inbox,id+'.json'));
 assert.equal((await runOne({...f,execute:async()=>{throw Error('must not execute');}})).status,'invalid');
 assert.equal(await readFile(target,'utf8'),JSON.stringify(f.request));
});
test('atomic hard-link publication is accepted before producer removes its temporary name',async()=>{
 const f=await fixture();const temporary=join(f.inbox,'publishing.tmp');await writeFile(temporary,JSON.stringify(f.request));
 await link(temporary,join(f.inbox,id+'.json'));let calls=0;
 await runOne({...f,execute:async()=>{calls++;return Buffer.from('validated image');}});assert.equal(calls,1);
});
