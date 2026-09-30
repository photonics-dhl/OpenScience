import test from 'node:test';
import assert from 'node:assert/strict';
import {storyboardTimeline} from '../storyboard-input.mjs';
const input=()=>({schemaVersion:1,profile:'artwork-explainer-v1',title:'Paper',locale:'zh',style:'watercolor',provider:'MiniMax speech',speaker:'Narrator',scenes:[{title:'Model result',artwork:'scene-0.png',start:0,credit:'Original paper Fig. 2',crop:{x:.2,y:.3,width:.4,height:.5},cues:[{start:0,end:2,text:'Model, not measurement.'}]}]});
test('one scene keeps exact source crop, caption timing, and attribution',()=>{
  const timeline=storyboardTimeline(input(),3);
  assert.equal(timeline.scenes.length,1);assert.deepEqual(timeline.scenes[0].crop,{x:.2,y:.3,width:.4,height:.5});
  assert.equal(timeline.scenes[0].credit,'Original paper Fig. 2');assert.equal(timeline.scenes[0].cues[0].end,2);
});
test('full original image requires no crop and may not select another file',()=>{
  const value=input();delete value.scenes[0].crop;assert.equal(storyboardTimeline(value,3).scenes[0].crop,undefined);
  value.scenes[0].artwork='../source.png';assert.throws(()=>storyboardTimeline(value,3));
});
for(const crop of [{x:-.1,y:0,width:1,height:1},{x:.8,y:0,width:.4,height:1},{x:0,y:0,width:0,height:1},{x:NaN,y:0,width:1,height:1}])test('rejects invalid crop '+JSON.stringify(crop),()=>{
  const value=input();value.scenes[0].crop=crop;assert.throws(()=>storyboardTimeline(value,3));
});
test('old profile cannot opt into artwork crop or single-scene contract',()=>{
  const value=input();delete value.profile;assert.throws(()=>storyboardTimeline(value,3));
});
