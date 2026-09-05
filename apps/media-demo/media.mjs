import { open } from 'node:fs/promises';
import { Buffer } from 'node:buffer';

export async function hasFastStart(path) {
  const file = await open(path, 'r');
  try {
    const { size } = await file.stat();
    let position = 0;
    let moov = -1;
    let mdat = -1;
    while (position < size) {
      const header = Buffer.alloc(16);
      const { bytesRead } = await file.read(header, 0, Math.min(16, size - position), position);
      if (bytesRead < 8) throw new Error('Malformed MP4 atom header');
      let length = header.readUInt32BE(0);
      const type = header.toString('ascii', 4, 8);
      if (length === 1) {
        if (bytesRead < 16) throw new Error('Malformed MP4 extended atom');
        const extended = header.readBigUInt64BE(8);
        if (extended > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Malformed MP4 atom length');
        length = Number(extended);
        if (length < 16) throw new Error('Malformed MP4 extended length');
      } else if (length === 0) length = size - position;
      if (length < 8 || position + length > size) throw new Error('Malformed MP4 atom length');
      if (type === 'moov' && moov < 0) moov = position;
      if (type === 'mdat' && mdat < 0) mdat = position;
      position += length;
    }
    return moov >= 0 && mdat >= 0 && moov < mdat;
  } finally {
    await file.close();
  }
}
