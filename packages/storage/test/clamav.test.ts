import { createServer } from 'node:net';
import { describe, expect, it } from 'vitest';
import { createClamAvScanner } from '../src/clamav';

async function withScanner(verdict: string, check: (scan: ReturnType<typeof createClamAvScanner>) => Promise<void>) {
  const bytes = Buffer.from('%PDF-1.4 clean fixture');
  const server = createServer({ allowHalfOpen: true }, socket => {
    const parts: Buffer[] = [];
    socket.on('data', part => parts.push(part));
    socket.on('end', () => {
      const wire = Buffer.concat(parts); const prefix = Buffer.from('zINSTREAM\0');
      expect(wire.subarray(0, prefix.length)).toEqual(prefix);
      expect(wire.readUInt32BE(prefix.length)).toBe(bytes.length);
      expect(wire.subarray(prefix.length + 4, -4)).toEqual(bytes);
      expect(wire.subarray(-4)).toEqual(Buffer.alloc(4));
      socket.end(verdict);
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await check(createClamAvScanner('127.0.0.1', (server.address() as { port: number }).port)); }
  finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}
const bytes = Buffer.from('%PDF-1.4 clean fixture');
describe('ClamAV INSTREAM boundary', () => {
  it('accepts only the exact clean verdict after sending framed bytes', async () => {
    await withScanner('stream: OK\0', scan => expect(scan(bytes)).resolves.toBeUndefined());
  });
  it('rejects detected and malformed replies', async () => {
    await withScanner('stream: Eicar-Test-Signature FOUND\0', scan => expect(scan(bytes)).rejects.toThrow('malware detected'));
    for (const reply of ['NOT OK\0', 'stream: OK\0garbage', 'stream: ERROR\0', '']) {
      await withScanner(reply, scan => expect(scan(bytes)).rejects.toThrow('invalid response'));
    }
  });
});
