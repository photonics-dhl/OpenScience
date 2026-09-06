import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareAnimatedDemo} from '../prepare-animated-demo.mjs';
import {validatePaths} from '../inputs.mjs';

test('animated delivery preserves accepted inputs and selects scientific animation, not repeated-image preview', async () => {
  const root = await mkdtemp(join(tmpdir(),'animated-demo-'));
  const source = join(root,'source'); const output = join(root,'input'); await mkdir(source);
  const files = ['narration.wav','narration.json','source-artwork.png','scene3-artwork.png'];
  for (const name of files) await writeFile(join(source,name), `original ${name}`);
  await writeFile(join(source,'unrelated.txt'),'not a render input');
  await prepareAnimatedDemo(source,output);
  assert.deepEqual((await readdir(output)).sort(),files.sort());
  for (const name of files) assert.deepEqual(await readFile(join(output,name)),await readFile(join(source,name)));
  assert.equal((await validatePaths(output,join(root,'render'))).renderMode,'d2nn-scientific-animation');
  await assert.rejects(prepareAnimatedDemo(source,output));
});

test('does not mistake a generic storyboard fixture for accepted scientific animation inputs', async () => {
  const root = await mkdtemp(join(tmpdir(),'animated-wrong-source-'));
  const input = join(root,'input'); await mkdir(input);
  for (const name of ['narration.wav','narration.json','source-artwork.png','scene-0.png','scene-1.png','scene-2.png']) await writeFile(join(input,name),'original');
  const manifest = {schemaVersion:1,title:'Valid preview',locale:'en',style:'ink',provider:'supplied',speaker:'supplied',scenes:Array.from({length:3},(_,i)=>({title:`Scene ${i}`,artwork:`scene-${i}.png`,start:i*5,cues:[{start:0,end:4,text:'Example'}]}))};
  await writeFile(join(input,'storyboard.json'),JSON.stringify(manifest));
  await assert.rejects(prepareAnimatedDemo(input,join(root,'fresh-animation')), /not a storyboard preview/);
});
