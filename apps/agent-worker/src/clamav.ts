import { createConnection } from 'node:net';

export type MalwareScanner = (content: Buffer) => Promise<void>;

/** clamd INSTREAM protocol: bytes never leave the private data network. */
export function createClamAvScanner(host: string, port = 3310): MalwareScanner {
  return async (content) => new Promise<void>((resolve, reject) => {
    const socket = createConnection({ host, port });
    const response: Buffer[] = [];
    const timer = setTimeout(() => { socket.destroy(); reject(new Error('[blocked] malware scanner timeout')); }, 30_000);
    socket.once('connect', () => {
      socket.write('zINSTREAM\0');
      for (let offset = 0; offset < content.length; offset += 64 * 1024) {
        const chunk = content.subarray(offset, offset + 64 * 1024);
        const size = Buffer.allocUnsafe(4); size.writeUInt32BE(chunk.length); socket.write(size); socket.write(chunk);
      }
      socket.end(Buffer.alloc(4));
    });
    socket.on('data', (chunk) => response.push(chunk));
    socket.once('error', () => { clearTimeout(timer); reject(new Error('[blocked] malware scanner unavailable')); });
    socket.once('close', () => {
      clearTimeout(timer);
      const verdict = Buffer.concat(response).toString('utf8');
      if (verdict.includes('FOUND')) reject(new Error('[blocked] malware detected'));
      else if (verdict.includes('OK')) resolve();
      else reject(new Error('[blocked] malware scanner invalid response'));
    });
  });
}
