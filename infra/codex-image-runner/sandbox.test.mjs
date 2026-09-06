import test from 'node:test';
import assert from 'node:assert/strict';
import { containerArgs } from './sandbox.mjs';
const config={nodeImage:'sha256:'+'a'.repeat(64),rendererImage:'sha256:'+'b'.repeat(64),runtime:'/opt/runtime',auth:'/opt/state/auth.json',scripts:'/opt/source/infra/codex-image-runner'};
const job={id:'77777777-7777-4777-8777-777777777777',dir:'/opt/private/job'};
test('model has no host network, secrets are readonly, proxy has no credentials',()=>{
 const model=containerArgs('model',config,job).join(' '),proxy=containerArgs('proxy',config,job).join(' ');
 assert.match(model,/--network none/);assert.match(model,/auth\.json:\/state\/auth\.json:ro/);assert.doesNotMatch(model,/docker.sock|--privileged|host-gateway|--network host/);
 assert.match(proxy,/--network host/);assert.doesNotMatch(proxy,/auth\.json|\/runtime|\/state|--publish/);
});
test('normalizer contains image without stretching and never has network or credentials',()=>{
 const args=containerArgs('normalize',config,{...job,rawImage:'/opt/private/job/raw.png'}).join(' ');
 assert.match(args,/force_original_aspect_ratio=decrease/);assert.match(args,/pad=1280:720/);assert.match(args,/--network none/);assert.doesNotMatch(args,/auth.json|--env-file/);
});
test('untrusted id cannot become a container name',()=>assert.throws(()=>containerArgs('model',config,{...job,id:'../bad'})));

test('complete runner runtime loads the compiled Gateway validators', async () => {
 const { executeImage } = await import('./runner.mjs');
 assert.equal(typeof executeImage, 'function');
});
