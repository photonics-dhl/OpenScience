import { describe, expect, it } from 'vitest';
import { Readable } from 'node:stream';
import { sha256HexBuffer } from '../src/checksum';
import { streamToBuffer } from '../src/streams';

describe('sha256HexBuffer', () => {
  it('matches the well-known sha256 of "abc"', () => {
    expect(sha256HexBuffer(Buffer.from('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('returns 64 lowercase hex chars', () => {
    expect(sha256HexBuffer(Buffer.from('hello openscience'))).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('streamToBuffer', () => {
  it('collects a readable into one buffer', async () => {
    const buf = await streamToBuffer(Readable.from(['ab', 'cd']));
    expect(buf.toString()).toBe('abcd');
  });
});
