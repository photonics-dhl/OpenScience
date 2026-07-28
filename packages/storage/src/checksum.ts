import { createHash } from 'node:crypto';

export function sha256HexBuffer(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}
