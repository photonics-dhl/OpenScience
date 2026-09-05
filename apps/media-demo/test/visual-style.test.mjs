import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveVisualStyle} from '../scenes.mjs';
test('visual style preserves technical default and rejects unimplemented choices',()=>{
 assert.equal(resolveVisualStyle(), 'technical');
 assert.equal(resolveVisualStyle({visualStyle:'watercolor'}),'watercolor');
 assert.throws(()=>resolveVisualStyle({visualStyle:'unknown'}),/Unsupported/);
});
