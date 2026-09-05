import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,URL} from 'node:url';
import process from 'node:process';
test('built maintenance CLI loads workspace modules before reporting invalid arguments',()=>{
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('./import-presentation-media.mjs',import.meta.url))],{encoding:'utf8',timeout:10000});
 assert.equal(result.status,1);
 assert.equal(result.stdout,'');
 assert.equal(result.stderr.trim(),'REVIEWED_MEDIA_IMPORT_FAILED');
});
