import { createConnection } from 'node:net';

export type MalwareScanner = (content: Buffer) => Promise<void>;

/** clamd INSTREAM protocol: bytes never leave the private data network. */
export function createClamAvScanner(host: string, port = 3310): MalwareScanner {
  if (!host.trim() || !Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('Invalid malware scanner endpoint');
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
    let responseBytes = 0;
    socket.on('data', (chunk) => {
      responseBytes += chunk.length;
      if (responseBytes > 4096) { clearTimeout(timer); socket.destroy(); reject(new Error('[blocked] malware scanner invalid response')); }
      else response.push(chunk);
    });
    socket.once('error', () => { clearTimeout(timer); reject(new Error('[blocked] malware scanner unavailable')); });
    socket.once('close', () => {
      clearTimeout(timer);
      const verdict = Buffer.concat(response).toString('utf8');
      if (/^stream: [^\r\n\0]+ FOUND\0$/.test(verdict)) reject(new Error('[blocked] malware detected'));
      else if (verdict === 'stream: OK\0') resolve();
      else reject(new Error('[blocked] malware scanner invalid response'));
    });
  });
}
