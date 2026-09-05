import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hasFastStart } from '../media.mjs';

function atom(type) {
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(8);
  buffer.write(type, 4);
  return buffer;
}

test('checks actual MP4 atom order and rejects truncated atoms', async () => {
  const root = await mkdtemp(join(tmpdir(), 'media-demo-mp4-'));
  const good = join(root, 'fast.mp4');
  const slow = join(root, 'slow.mp4');
  const broken = join(root, 'broken.mp4');
  await writeFile(good, Buffer.concat([atom('ftyp'), atom('moov'), atom('mdat')]));
  await writeFile(slow, Buffer.concat([atom('ftyp'), atom('mdat'), atom('moov')]));
  await writeFile(broken, Buffer.from([0, 0, 0, 8]));
  assert.equal(await hasFastStart(good), true);
  assert.equal(await hasFastStart(slow), false);
  await assert.rejects(hasFastStart(broken), /Malformed MP4/);
});
